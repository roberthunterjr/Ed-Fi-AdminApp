import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { GetSbEnvironmentDto, PostSbEnvironmentDto, PutSbEnvironmentDto } from './sb-environment.dto';

describe('GetSbEnvironmentDto.odsDsVersion', () => {
  const withOdsApiMeta = (odsApiMeta: unknown) =>
    plainToInstance(GetSbEnvironmentDto, { configPublic: { odsApiMeta } });

  it('reads the Ed-Fi data model version', () => {
    const dto = withOdsApiMeta({
      dataModels: [
        { name: 'TPDM', version: '1.1.0' },
        { name: 'Ed-Fi', version: '5.2.0' },
      ],
    });
    expect(dto.odsDsVersion).toBe('5.2.0');
  });

  it('is undefined, not a crash, when the saved ODS/API metadata has no data models', () => {
    expect(withOdsApiMeta({ version: '7.3' }).odsDsVersion).toBeUndefined();
  });
});

describe('SbEnvironment DTO URL normalization', () => {
  const raw = {
    odsApiDiscoveryUrl: '  https://localhost/odsv7-adminv2-single-api/  ',
    adminApiUrl: 'https://localhost/odsv7-adminv2-single-adminapi//',
  };

  it('PostSbEnvironmentDto trims surrounding whitespace and trailing slashes from both URLs', () => {
    const result = plainToInstance(PostSbEnvironmentDto, raw);
    expect(result.odsApiDiscoveryUrl).toBe('https://localhost/odsv7-adminv2-single-api');
    expect(result.adminApiUrl).toBe('https://localhost/odsv7-adminv2-single-adminapi');
  });

  it('PutSbEnvironmentDto trims surrounding whitespace and trailing slashes from both URLs', () => {
    const result = plainToInstance(PutSbEnvironmentDto, raw);
    expect(result.odsApiDiscoveryUrl).toBe('https://localhost/odsv7-adminv2-single-api');
    expect(result.adminApiUrl).toBe('https://localhost/odsv7-adminv2-single-adminapi');
  });
});
