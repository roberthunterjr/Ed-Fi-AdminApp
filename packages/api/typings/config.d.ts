import { LogLevel } from '@nestjs/common';

declare module 'config' {
  export interface IDbSecret {
    DB_HOST: string;
    DB_PORT: number;
    DB_USERNAME: string;
    DB_PASSWORD: string;
    DB_DATABASE: string;
  }

  export interface IDbEncryptionSecret {
    KEY: string;
    IV: string;
  }

  export interface IAuth0Secret {
    ISSUER?: string;
    MACHINE_AUDIENCE?: string;
    CLIENT_ID?: string;
    CLIENT_SECRET?: string;
  }

  interface IConfig {
    ENABLE_OPEN_API: boolean;
    AWS_DB_SECRET?: string | undefined;
    /** Locally configured DB connection settings. Undefined when the DB secret comes from AWS Secrets Manager. */
    DB_SECRET_VALUE?: {
      DB_PASSWORD?: string;
      MSSQL_DB_PASSWORD?: string;
      [key: string]: unknown;
    };
    /**
     * Format: `postgres://username@host:port/db?password=password&sslmode=ssl`
     */
    DB_CONNECTION_STRING: string | Promise<string>;

    /** Serialized JSON array of "query" | "schema" | "error" | "warn" | "info" | "log" | "migration" */
    TYPEORM_LOGGING: string | undefined;

    /** Number of retry attempts for TypeORM database connections */
    TYPEORM_RETRY_ATTEMPTS: number;

    /** Delay between retry attempts in milliseconds */
    TYPEORM_RETRY_DELAY: number;

    AWS_DB_ENCRYPTION_SECRET?: string | undefined;
    DB_ENCRYPTION_SECRET_VALUE: never;
    DB_ENCRYPTION_SECRET: IDbEncryptionSecret | Promise<IDbEncryptionSecret>;

    /** AWS Secrets Manager secret id holding an array of session-signing secrets, newest first */
    AWS_SESSION_SECRET?: string | undefined;
    SESSION_SECRET_VALUE: never;
    /** Array of session-signing secrets, newest first. Only the first signs new cookies; the rest remain valid to support rotation. */
    SESSION_SECRET: string[] | Promise<string[]>;

    AWS_REGION?: string | undefined;
    DB_ENGINE: 'mssql' | 'pgsql';
    DB_SSL: boolean | 'true' | 'false';
    DB_TRUST_CERTIFICATE: boolean | 'true' | 'false';
    DB_TTL_IN_MINUTES: number;
    DB_RUN_MIGRATIONS: boolean;
    DB_SYNCHRONIZE: boolean;
    FE_URL: string;
    MY_URL: string;
    USE_YOPASS: boolean | 'true' | 'false';
    YOPASS_URL: string;
    API_PORT: number;
    SB_SYNC_CRON: string;
    /** Max number of poll attempts before treating an EdOrg refresh job as timed out (default: 10) */
    ADMINAPI_REFRESH_POLL_ATTEMPTS: number;
    /** Milliseconds to wait between EdOrg refresh job poll attempts (default: 5000) */
    ADMINAPI_REFRESH_POLL_INTERVAL_MS: number;
    /** Milliseconds between polls of an Admin API datastore create/delete job (default: 5000) */
    ADMINAPI_DATASTORE_JOB_POLL_INTERVAL_MS: number;
    /** Max poll attempts for an Admin API datastore create/delete job (default: 720, i.e. 60 min) */
    ADMINAPI_DATASTORE_JOB_POLL_ATTEMPTS: number;
    /** Datastore jobs one API instance tracks at once (default: 5) */
    ADMINAPI_DATASTORE_JOB_CONCURRENCY: number;

    SAMPLE_OIDC_CONFIG?: {
      issuer: string;
      clientSecret: string;
      clientId: string;
      scope: string;
    };

    ADMIN_USERNAME?: string | undefined;

    CODE_ENV: string;

    // over-arching application to access auth0 management API
    AUTH0_CONFIG_SECRET: IAuth0Secret | Promise<IAuth0Secret>;

    WHITELISTED_REDIRECTS: string[];
    MY_URL_API_PATH: string;
    OPENAPI_TITLE: string;
    OPENAPI_DESCRIPTION: string;
    OPEN_API: boolean;
    EDFI_URLS_TIMEOUT_MS: number;

    /** Per-provider OIDC discovery timeout in milliseconds (default: 10000) */
    OIDC_DISCOVERY_TIMEOUT_MS: number;

    RATE_LIMIT_TTL: number; // The time to live in milliseconds
    RATE_LIMIT_LIMIT: number; // The maximum number of requests within the ttl

    USE_PKCE: boolean;

    SSL_VERIFICATION: boolean | 'true' | 'false';

    LOG_LEVEL: LogLevel;

    AUDIT_LOGGING_ENABLED?: boolean | 'true' | 'false';

    CERT_ENABLED?: boolean | 'true' | 'false';
    CERT_BRUNO_SRC_REF?: string;
    CERT_BRUNO_SRC_CHECKSUM?: string;
    CERT_BRUNO_ON_DOWNLOAD_ERROR?: 'error' | 'warning';
    /** Kill a certification step run after this many ms (env vars arrive as strings). */
    CERT_BRUNO_RUN_TIMEOUT_MS: number | string;
    /** Simultaneous certification step runs per API instance (env vars arrive as strings). */
    CERT_BRUNO_MAX_CONCURRENT_RUNS: number | string;

    /** Polling interval for MSSQL job queue in milliseconds (default: 1000) */
    MSSQL_JOB_POLL_MS?: number;
    /** Polling interval for MSSQL schedule loop in milliseconds (default: 10000) */
    MSSQL_SCHEDULE_POLL_MS?: number;
  }

  const config: IConfig;

  export = config;
}
