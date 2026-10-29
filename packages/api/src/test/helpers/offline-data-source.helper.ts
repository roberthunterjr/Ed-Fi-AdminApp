import type * as ModelsServerModule from '@edanalytics/models-server';
import type { DataSource } from 'typeorm';

export type DbEngine = 'pgsql' | 'mssql';

type ModelsServer = typeof ModelsServerModule;

// Loaded through a variable on purpose: Nx reads a literal `require('@edanalytics/models-server')`
// as a lazy import and then forbids every static import of that library across the API.
const MODELS_SERVER_MODULE = '@edanalytics/models-server';

/**
 * Builds real TypeORM entity metadata for one database engine without connecting to a database,
 * so tests can generate the exact SQL that engine would receive.
 *
 * Some entities pick column types from `config.DB_ENGINE` when their module loads, so everything
 * runs in an isolated module registry with that engine configured: `pickEntities` and
 * `requireAlongside` run inside it and therefore see the same entity classes.
 */
export const buildOfflineDataSource = async <T = undefined>(
  engine: DbEngine,
  pickEntities: (models: ModelsServer) => unknown[],
  requireAlongside?: () => T,
): Promise<{ dataSource: DataSource; models: ModelsServer; alongside: T }> => {
  let models!: ModelsServer;
  let typeorm!: typeof import('typeorm');
  let entities!: unknown[];
  let alongside!: T;
  jest.isolateModules(() => {
    jest.doMock('config', () => ({ ...jest.requireActual('config'), DB_ENGINE: engine }));
    typeorm = require('typeorm');
    models = require(MODELS_SERVER_MODULE);
    entities = pickEntities(models);
    alongside = requireAlongside?.() as T;
  });
  const dataSource = new typeorm.DataSource({
    ...(engine === 'mssql'
      ? { type: 'mssql' as const, options: { trustServerCertificate: true } }
      : { type: 'postgres' as const }),
    host: 'offline.invalid',
    username: 'offline',
    password: 'offline',
    database: 'offline',
    entities: entities as never,
  });
  // DataSource.initialize() would connect; building the metadata is the only part these tests need.
  await (dataSource as unknown as { buildMetadatas: () => Promise<void> }).buildMetadatas();
  return { dataSource, models, alongside };
};

/** The entity list the API registers with TypeORM (database/typeorm.config.ts). */
export const productionEntities = (): unknown[] =>
  (require('../../database/typeorm.config') as { default: { entities: unknown[] } }).default
    .entities;
