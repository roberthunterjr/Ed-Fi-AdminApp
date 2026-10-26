import './modes/dev';
import './utils/json-env-preflight-run';

process.env['NODE_CONFIG_DIR'] = process.env['NODE_CONFIG_DIR'] || './packages/api/config';

import './utils/checkEnv';

import { ClassSerializerInterceptor, Logger, LogLevel } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import colors from 'colors/safe';
import * as config from 'config';
import * as pgSession from 'connect-pg-simple';
import * as mssqlSession from 'connect-mssql-v2';
import { json } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as expressSession from 'express-session';
import { writeFileSync } from 'fs';
import passport from 'passport';
import { Client } from 'pg';
import * as sql from 'mssql';
import { AppModule } from './app/app.module';
import {
  createMssqlConfig,
  describeMissingDatabase,
  findMissingDatabase,
} from './database/mssql-connection';
import { ArtifactService } from './certification/artifact/artifact.service';
import { CatalogService } from './certification/catalog/catalog.service';
import { AggregateErrorHandler } from './app/aggregate-error-handler';
import { AggregateErrorFilter } from './app/aggregate-error.filter';
import { AuditActionMiddleware } from './audit/audit-action.middleware';
import { createCsrfOriginGuard } from './app/csrf-origin-guard';
import { createGlobalValidationPipe } from './app/global-validation-pipe';
import { getSessionCookieOptions, SESSION_TRUST_PROXY_HOPS } from './app/session-cookie-options';
import { assertValidSessionSecret } from './app/session-secret';
import { assertValidDbEncryptionSecret } from './app/db-encryption-secret';
import { assertProductionSecrets } from './app/production-secrets';
import axios from 'axios';
import https from 'https';

const FIVE_SECONDS_IN_MILLISECONDS = 5000;
const DB_TTL_IN_SECONDS = 60 * config.DB_TTL_IN_MINUTES;

async function createMssqlConnection(mssqlConfig?: sql.config): Promise<sql.ConnectionPool> {
  mssqlConfig = mssqlConfig || (await createMssqlConfig());

  const secureCopy = {
    ...mssqlConfig,
    password: '***',
  };
  Logger.debug(`MSSQL connection parameters: ${JSON.stringify(secureCopy)}`);
  const pool = new sql.ConnectionPool(mssqlConfig);
  return await pool.connect();
}

async function checkDatabaseAvailability(): Promise<void> {
  const healthCheckQuery = 'SELECT 1';
  try {
    Logger.log('Checking database availability before starting API...');

    if (config.DB_ENGINE === 'mssql') {
      const pool = await createMssqlConnection();
      try {
        await pool.request().query(healthCheckQuery);
      } finally {
        await pool.close();
      }
    } else {
      const pgConnectionStr = await config.DB_CONNECTION_STRING;
      const pgClient = new Client({
        connectionString: pgConnectionStr,
        connectionTimeoutMillis: FIVE_SECONDS_IN_MILLISECONDS,
      });

      await pgClient.connect();
      await pgClient.query(healthCheckQuery);
      await pgClient.end();
    }

    Logger.log('Database is available - proceeding with API startup');
  } catch (error) {
    // Handle AggregateError during startup
    const errorAnalysis = AggregateErrorHandler.handle(error);

    Logger.error(errorAnalysis.safeMessage);

    // SQL Server reachable + credentials valid, but the database is not available. The
    // container creates MSSQL_DB only on first boot; a volume from an earlier run is left
    // untouched. Report it precisely and stop -- creating or dropping anything here is the
    // operator's call. The probe returns null unless it can actually prove the claim.
    if (config.DB_ENGINE === 'mssql') {
      const missingDatabase = await findMissingDatabase();
      if (missingDatabase) {
        Logger.error(describeMissingDatabase(missingDatabase).join('\n'));
      }
    }

    Logger.debug(`Detailed error: ${error}`);

    if (AggregateErrorHandler.isAggregateError(error)) {
      const allMessages = AggregateErrorHandler.extractAllMessages(error);
      Logger.error(`Individual AggregateError messages: ${allMessages.join(', ')}`);
    }

    Logger.error('Database is not available - API startup aborted');
    process.exit(1); // Exit with error code
  }
}

async function setupDatabaseSession(connectionStr: string, engine: string) {
  try {
    if (engine === 'mssql') {
      const table = 'sessions';

      const mssqlConfig = await createMssqlConfig();

      const pool = await createMssqlConnection(mssqlConfig);
      try {
        await pool.query(`IF OBJECT_ID('${table}') IS NULL
BEGIN
    CREATE TABLE [dbo].[${table}](
        [sid] [nvarchar](255) NOT NULL PRIMARY KEY,
        [session] [nvarchar](max) NOT NULL,
        [expires] [datetime] NOT NULL
    );
END`);
      } finally {
        await pool.close();
      }

      Logger.log('Using MSSQL session store');
      const store = new mssqlSession.default(mssqlConfig, {
        table,
        ttl: DB_TTL_IN_SECONDS,
        // connect-mssql-v2 connects lazily on first use. With the default retries:0, a race
        // condition between the initial pool.connect() and concurrent session reads (e.g. OIDC
        // state stored then read back) causes "Connection is closed" errors that drop session
        // data and break the OIDC login flow. Retries with backoff absorb this timing window.
        retries: 5,
        retryDelay: 500,
      });

      // Pre-warm the connection so it's ready before the first real request arrives.
      // This avoids the race condition where concurrent session operations during OIDC login
      // hit the store before the pool has finished its first connect() call.
      await new Promise<void>((resolve) => {
        store.get('__warmup__', () => resolve());
      });

      return store;
    } else {
      // PostgreSQL setup (existing logic)
      const pgClient = new Client({ connectionString: connectionStr });
      await pgClient.connect();
      const existingSchema = await pgClient.query(
        `select schema_name from information_schema.schemata where schema_name = 'appsession'`
      );
      if (existingSchema.rowCount === 0) await pgClient.query('create schema appsession');
      await pgClient.end();

      Logger.log('Using PostgreSQL session store');
      return new (pgSession.default(expressSession.default))({
        createTableIfMissing: true,
        conString: connectionStr,
        schemaName: 'appsession',
        ttl: DB_TTL_IN_SECONDS,
      });
    }
  } catch (error) {
    Logger.warn(`Database unavailable for sessions, using memory store: ${error.message}`);
    // Database unavailable, use memory store (note: sessions won't persist across restarts)
    return undefined; // Use default memory store
  }
}

function getLogLevel(): LogLevel[] {
  switch (config.LOG_LEVEL) {
    case 'verbose':
      return ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];
    case 'debug':
      return ['debug', 'log', 'warn', 'error', 'fatal'];
    case 'log':
      return ['log', 'warn', 'error', 'fatal'];
    case 'warn':
      return ['warn', 'error', 'fatal'];
    case 'error':
      return ['error', 'fatal'];
    case 'fatal':
      return ['fatal'];
    default:
      return ['log', 'warn', 'error', 'fatal'];
  }
}

async function bootstrap() {
  // Apply the configured log levels before anything logs. NestFactory.create() normally does
  // this via its `logger` option, but the database check below runs before that -- and until
  // overrideLogger is called the static Logger uses Nest's own defaults, which include debug
  // and verbose. Without this, startup debug output (including connection parameters) would
  // print even for an operator who set LOG_LEVEL=log or error.
  Logger.overrideLogger(getLogLevel());

  // Validate production secrets before ANY database work. Creating the app runs migrations, and
  // the seeding migration would otherwise insert a placeholder OIDC client secret into the oidc
  // table before we got a chance to refuse -- and since seeding only runs while that table is
  // empty, the real secret would never be seeded after the operator fixed their configuration.
  assertProductionSecrets({
    nodeEnv: process.env.NODE_ENV,
    dbEngine: config.DB_ENGINE || 'pgsql',
    // AWS-managed DB secrets are operator-controlled and not inspected here.
    dbSecret: config.AWS_DB_SECRET ? undefined : config.DB_SECRET_VALUE,
    sampleOidcClientSecret: config.SAMPLE_OIDC_CONFIG?.clientSecret,
  });

  // Check database availability first - exit if not available.
  // This must run BEFORE NestFactory.create: creating the app initializes TypeOrmModule,
  // which opens its own connection and throws from deep inside Nest's bootstrap when the
  // database is unreachable. Running the check afterwards meant it could never report a
  // connection problem -- the process had already died with a raw driver stack trace, and
  // the diagnostics below (including the missing-database explanation) were unreachable.
  await checkDatabaseAvailability();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: getLogLevel(),
  });

  // Without this, onApplicationShutdown hooks (flushing audit events) never fire on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  app.set('trust proxy', SESSION_TRUST_PROXY_HOPS);

  // Optimize response headers for security
  app.disable('x-powered-by');
  app.use(function (_, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'deny');
    next();
  });

  const globalPrefix = 'api';
  const dbEncryptionSecret = await config.DB_ENCRYPTION_SECRET;
  assertValidDbEncryptionSecret(dbEncryptionSecret);

  const connectionStr = await config.DB_CONNECTION_STRING;
  const engine = config.DB_ENGINE || 'pgsql';

  const sessionStore = await setupDatabaseSession(connectionStr, engine);

  const sessionSecret = await config.SESSION_SECRET;
  assertValidSessionSecret(sessionSecret);

  // Registered before the body parser and the CSRF guard so requests they reject are audited too.
  app.use(app.get(AuditActionMiddleware).handle);
  app.use(json({ limit: '512kb' }));
  app.use(createCsrfOriginGuard(config.FE_URL));
  app.use(
    expressSession.default({
      store: sessionStore,
      // array supports rotation: the first entry signs new cookies, the rest remain valid for verification.
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: getSessionCookieOptions(),
    })
  );
  app.use(passport.initialize());
  app.use(passport.session());

  app.setGlobalPrefix(globalPrefix);

  // Add global exception filter for AggregateError handling
  app.useGlobalFilters(new AggregateErrorFilter());

  app.useGlobalPipes(createGlobalValidationPipe());
  app.enableCors({ origin: config.FE_URL, credentials: true });
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: true,
    })
  );
  const port = config.API_PORT;
  if (config.OPEN_API) {
    if (process.env.NODE_ENV === 'production') {
      Logger.warn(
        colors.yellow('Swagger UI is disabled in production environment for security reasons.')
      );
    } else {
      const swaggerConfig = new DocumentBuilder()
        .setTitle(config.OPENAPI_TITLE)
        .setDescription(config.OPENAPI_DESCRIPTION)
        .setVersion('1.0')
        .build();
      const document = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup('api', app, document);
      writeFileSync('./swagger.json', JSON.stringify(document, null, 2));
      Logger.verbose(`OpenAPI spec available at ${config.MY_URL_API_PATH} or file:./swagger.json`);
    }
  }
  await app.listen(port);
  if (config.FE_URL.includes('localhost')) {
    Logger.warn(
      `Setting up cors for requests from ${colors.cyan(config.FE_URL)}${colors.yellow(
        '. Requests from'
      )} ${colors.cyan('http://127.0.0.1')} ${colors.yellow('will fail.')}`
    );
  }
  if (config.FE_URL.includes('127.0.0.1')) {
    Logger.warn(
      `Setting up cors for requests from ${colors.cyan(config.FE_URL)}${colors.yellow(
        '. Requests from'
      )} ${colors.cyan('http://localhost')} ${colors.yellow('will fail.')}`
    );
  }

  if (config.SSL_VERIFICATION === 'false' || config.SSL_VERIFICATION === false) {
    axios.defaults.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
    Logger.warn(
      colors.yellow(
        'SSL verification is disabled for local development. Do not use this in production!'
      )
    );
  }
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);

  // Initialize certification runtime workspace
  if (config.CERT_ENABLED === false || config.CERT_ENABLED === 'false') {
    Logger.log('Certification runtime disabled (CERT_ENABLED=false)');
  } else {
    try {
      const artifactService = app.get(ArtifactService, { strict: false });
      await artifactService.ensureRuntimeReady();
      if (artifactService.isRunTimeReady) {
        Logger.log('Certification runtime ensured');

        const catalogService = app.get(CatalogService, { strict: false });
        await catalogService.sync(artifactService.currentRef, artifactService.sisRoot);
        Logger.log('Certification catalog sync complete');
      } else {
        Logger.warn('Certification runtime is not ready; skipping catalog sync');
      }
    } catch (err) {
      const details = err instanceof Error ? err.stack ?? err.message : String(err);
      Logger.error(`Certification runtime failed: ${details}`);
    }
  }

  // Set up global error handlers for AggregateError and other unhandled errors
  process.on('uncaughtException', (error) => {
    const errorAnalysis = AggregateErrorHandler.handle(error);
    Logger.error(`Uncaught Exception: ${errorAnalysis.safeMessage}`);

    if (AggregateErrorHandler.isAggregateError(error)) {
      const allMessages = AggregateErrorHandler.extractAllMessages(error);
      Logger.error(`AggregateError details: ${allMessages.join(', ')}`);
    }

    // Don't exit the process for database-related AggregateErrors as they're expected during DB downtime
    if (!errorAnalysis.isDatabaseRelated) {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    const errorAnalysis = AggregateErrorHandler.handle(reason);
    Logger.error(`Unhandled Rejection at: ${promise}, reason: ${errorAnalysis.safeMessage}`);

    if (AggregateErrorHandler.isAggregateError(reason)) {
      const allMessages = AggregateErrorHandler.extractAllMessages(reason);
      Logger.error(`AggregateError details: ${allMessages.join(', ')}`);
    }

    // Don't exit the process for database-related AggregateErrors
    if (!errorAnalysis.isDatabaseRelated) {
      process.exit(1);
    }
  });
}

bootstrap();
