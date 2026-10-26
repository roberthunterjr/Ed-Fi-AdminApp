import baseConfig from '../test/config.mock';

function loadCheckEnvWith(overrides: Record<string, unknown>): () => void {
  return () => {
    jest.resetModules();
    jest.doMock('config', () => ({ ...baseConfig, ...overrides }));
    require('./checkEnv');
  };
}

describe('checkEnv', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('config');
  });

  it('does not throw when the baseline config is valid', () => {
    expect(loadCheckEnvWith({})).not.toThrow();
  });

  it('throws when SESSION_SECRET is not defined locally or as an AWS secret', () => {
    expect(
      loadCheckEnvWith({ SESSION_SECRET_VALUE: undefined, AWS_SESSION_SECRET: undefined })
    ).toThrow('SESSION_SECRET not defined either locally or as AWS secret.');
  });

  it('does not throw when SESSION_SECRET is defined only as an AWS secret', () => {
    expect(
      loadCheckEnvWith({ SESSION_SECRET_VALUE: undefined, AWS_SESSION_SECRET: 'my-session-secret-id' })
    ).not.toThrow();
  });

  it.each([
    ['RATE_LIMIT_LIMIT', '100'],
    ['RATE_LIMIT_LIMIT', true],
    ['RATE_LIMIT_LIMIT', Infinity],
    ['RATE_LIMIT_LIMIT', 0],
    ['RATE_LIMIT_TTL', 1.5],
    ['RATE_LIMIT_TTL', -1],
  ])('throws when %s is %p, not a positive whole number', (name, value) => {
    expect(loadCheckEnvWith({ [name]: value })).toThrow(
      `${name} must be a positive whole number.`
    );
  });

  it('does not throw for a large numeric RATE_LIMIT_LIMIT', () => {
    expect(loadCheckEnvWith({ RATE_LIMIT_LIMIT: 100000 })).not.toThrow();
  });

  it('throws when AWS_SESSION_SECRET is configured but AWS_REGION is not', () => {
    expect(
      loadCheckEnvWith({ AWS_SESSION_SECRET: 'my-session-secret-id', AWS_REGION: undefined })
    ).toThrow('Configured to use AWS secrets, but AWS_REGION not defined.');
  });
});
