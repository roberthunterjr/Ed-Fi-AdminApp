import 'reflect-metadata';
import { SbEnvironment } from './sb-environment.entity';

describe('SbEnvironment.odsDsVersion', () => {
  const withOdsApiMeta = (odsApiMeta: unknown) =>
    Object.assign(new SbEnvironment(), { configPublic: { odsApiMeta } });

  it('reads the Ed-Fi data model version', () => {
    const sbEnvironment = withOdsApiMeta({
      dataModels: [
        { name: 'TPDM', version: '1.1.0' },
        { name: 'Ed-Fi', version: '5.2.0' },
      ],
    });
    expect(sbEnvironment.odsDsVersion).toBe('5.2.0');
  });

  it('is undefined, not a crash, when the saved ODS/API metadata has no data models', () => {
    expect(withOdsApiMeta({ version: '7.3' }).odsDsVersion).toBeUndefined();
  });
});
