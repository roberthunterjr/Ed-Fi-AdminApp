import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PostCertificationTokenDto, toCertificationTokenDto } from './certification-token.dto';

const build = (plain: object) =>
  plainToInstance(PostCertificationTokenDto, plain, { excludeExtraneousValues: true });

describe('PostCertificationTokenDto', () => {
  it('accepts key and secret with an optional odsId', async () => {
    expect(await validate(build({ key: 'k', secret: 's' }))).toHaveLength(0);
    expect(await validate(build({ key: 'k', secret: 's', odsId: 3 }))).toHaveLength(0);
  });

  it('rejects a missing or blank key or secret', async () => {
    const errors = await validate(build({ key: ' ', secret: '' }));
    expect(errors.map((e) => e.property).sort()).toEqual(['key', 'secret']);
  });

  it('rejects a non-integer odsId', async () => {
    const errors = await validate(build({ key: 'k', secret: 's', odsId: 'x' }));
    expect(errors.map((e) => e.property)).toEqual(['odsId']);
  });

  it('drops unexposed fields such as a browser-supplied URL', () => {
    const dto = build({ key: 'k', secret: 's', oauthUrl: 'https://evil' });
    expect(dto).not.toHaveProperty('oauthUrl');
  });
});

describe('toCertificationTokenDto', () => {
  it('keeps only the exposed response fields', () => {
    const dto = toCertificationTokenDto({
      token: 't',
      expiresAt: '2026-10-06T20:00:00.000Z',
      oauthUrl: 'https://h/oauth/token',
      resourceBaseUrl: 'https://h/data/v3',
      extra: 'nope',
    } as never);
    expect(dto).toEqual({
      token: 't',
      expiresAt: '2026-10-06T20:00:00.000Z',
      oauthUrl: 'https://h/oauth/token',
      resourceBaseUrl: 'https://h/data/v3',
    });
  });
});
