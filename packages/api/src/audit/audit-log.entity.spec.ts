import { buildOfflineDataSource, DbEngine } from '../test/helpers/offline-data-source.helper';

/**
 * TypeORM leaves a generated primary column out of an INSERT only when its strategy is
 * 'increment' (InsertQueryBuilder.getInsertedColumns). Any other strategy lists the column and
 * sends DEFAULT for it, which SQL Server rejects for an identity column, so every audit insert
 * failed on mssql.
 */
describe.each<DbEngine>(['pgsql', 'mssql'])('AuditLog insert SQL on %s', (engine) => {
  it('builds the metadata for that engine', async () => {
    const { dataSource, models } = await buildOfflineDataSource(engine, (m) => [m.AuditLog]);

    const timestamp = dataSource
      .getMetadata(models.AuditLog)
      .findColumnWithPropertyName('timestamp');

    expect(dataSource.driver.options.type).toBe(engine === 'pgsql' ? 'postgres' : 'mssql');
    expect(timestamp?.type).toBe(engine === 'pgsql' ? 'timestamptz' : 'datetimeoffset');

    // varchar/text on SQL Server would make TypeORM bind non-Unicode parameters
    const metadata = dataSource.getMetadata(models.AuditLog);
    expect(metadata.findColumnWithPropertyName('actorUsername')?.type).toBe(
      engine === 'pgsql' ? 'varchar' : 'nvarchar',
    );
    expect(metadata.findColumnWithPropertyName('details')?.type).toBe(
      engine === 'pgsql' ? 'text' : 'nvarchar',
    );
  });

  it('leaves the identity id column out of a multi-row insert', async () => {
    const { dataSource, models } = await buildOfflineDataSource(engine, (m) => [m.AuditLog]);

    const sql = dataSource
      .createQueryBuilder()
      .insert()
      .into(models.AuditLog)
      .values([
        {
          eventType: 'Action',
          timestamp: new Date(),
          actorUsername: 'alice',
          actorType: 'user',
          sourceIpAddress: '10.0.0.1',
          httpVerb: 'POST',
          httpUrl: '/things',
          statusCode: 201,
          oidcIssuer: 'https://idp.example/realms/edfi',
          details: null,
        },
        { eventType: 'LoginFailure', timestamp: new Date(), actorUsername: undefined },
      ])
      .getQuery();

    const insertedColumns = sql.slice(sql.indexOf('('), sql.indexOf(')') + 1);
    expect(insertedColumns).toContain('eventType');
    expect(insertedColumns).not.toMatch(/["[]id["\]]/);
    // DEFAULT is fine for the nullable columns the second row leaves undefined, never for the id.
    const optionalColumnsLeftUndefined = 8;
    expect({ sql, defaults: sql.match(/DEFAULT/g)?.length ?? 0 }).toEqual({
      sql,
      defaults: optionalColumnsLeftUndefined,
    });
  });

  it('still reads the generated id back after an insert', async () => {
    const { dataSource, models } = await buildOfflineDataSource(engine, (m) => [m.AuditLog]);

    // Repository.insert() returns these columns via RETURNING (pgsql) or OUTPUT INSERTED (mssql).
    const returned = dataSource
      .getMetadata(models.AuditLog)
      .getInsertionReturningColumns()
      .map((column) => column.propertyName);

    expect(returned).toContain('id');
  });
});
