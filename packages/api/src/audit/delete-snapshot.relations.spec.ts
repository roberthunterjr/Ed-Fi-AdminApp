import type { EntityTarget } from 'typeorm';
import {
  buildOfflineDataSource,
  DbEngine,
  productionEntities,
} from '../test/helpers/offline-data-source.helper';

type Registrations = typeof import('./delete-snapshot.registrations');
type Registry = typeof import('./delete-snapshot.registry');

/**
 * Builds each audited entity's snapshot lookup against real entity metadata, offline, so syntax
 * TypeORM rejects or a relation name the entity does not have fails here instead of silently
 * leaving `details` empty on DELETE rows.
 */
describe.each<DbEngine>(['pgsql', 'mssql'])('delete snapshot lookups on %s', (engine) => {
  it('builds a valid find query for every audited entity', async () => {
    const { dataSource, alongside } = await buildOfflineDataSource(
      engine,
      productionEntities,
      () => ({
        // Loaded with the data source's entity classes so the registry keys match its metadata.
        registrations: require('./delete-snapshot.registrations') as Registrations,
        registry: require('./delete-snapshot.registry') as Registry,
      }),
    );
    const { registrations, registry } = alongside;

    const failures = registrations.AUDITED_DELETE_ENTITIES.flatMap(
      (entity: EntityTarget<unknown>) => {
        const metadata = dataSource.getMetadata(entity);
        const pk = metadata.primaryColumns[0].propertyName;
        try {
          dataSource
            .createQueryBuilder(entity, 'e')
            .setFindOptions(registry.getDeleteSnapshotFindOptions(entity, pk, 1))
            .getQuery();
          return [];
        } catch (error) {
          return [`${metadata.name}: ${(error as Error).message}`];
        }
      },
    );

    expect(failures).toEqual([]);
  });
});
