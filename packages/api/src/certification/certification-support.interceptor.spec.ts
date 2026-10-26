import 'reflect-metadata';
import { CallHandler, ExecutionContext, HttpException } from '@nestjs/common';
import { CertificationSupportInterceptor } from './certification-support.interceptor';

const nextHandler = { handle: jest.fn().mockReturnValue('handled') } as unknown as CallHandler;

// SbEnvironmentEdfiTenantInterceptor runs first and leaves the environment on the request.
const contextFor = (
  sbEnvironment: { odsDsVersion: string | undefined } | undefined,
  sbEnvironmentId = '7',
) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ params: { sbEnvironmentId }, sbEnvironment }) }),
  }) as unknown as ExecutionContext;

const intercept = (context: ExecutionContext) =>
  new CertificationSupportInterceptor().intercept(context, nextHandler);

const refusal = (odsDsVersion: string | undefined) => {
  try {
    intercept(contextFor({ odsDsVersion }));
  } catch (error) {
    return error as HttpException;
  }
  throw new Error('Expected the request to be refused');
};

describe('CertificationSupportInterceptor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lets a request through for an environment on Ed-Fi Data Model 5.0.0 or later', () => {
    expect(intercept(contextFor({ odsDsVersion: '5.2.0' }))).toBe('handled');
  });

  it('refuses an environment on Ed-Fi Data Model 4.0.0 with a 400 that names its version', () => {
    const error = refusal('4.0.0');

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toEqual({
      type: 'Error',
      title: 'Certification is not available for this environment.',
      message:
        "Certification requires Ed-Fi Data Standard 5.0.0 or later. This environment's data standard version is 4.0.0, as recorded when it was connected to Admin App. If its Ed-Fi API has been upgraded since then, Admin App doesn't detect the new version yet.",
    });
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it('refuses an environment whose data model is unknown', () => {
    const error = refusal(undefined);

    expect(error.getStatus()).toBe(400);
    expect(error.getResponse()).toMatchObject({
      message:
        "Certification requires Ed-Fi Data Standard 5.0.0 or later. Admin App couldn't read this environment's data standard version from its Ed-Fi API when the environment was connected.",
    });
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });

  it('leaves a non-numeric environment ID to the route pipes (400, not 500)', () => {
    // Interceptors run before pipes, and the resolver skips non-numeric IDs.
    expect(intercept(contextFor(undefined, 'abc'))).toBe('handled');
  });

  it('fails loudly, not open, when a numeric ID reaches it without a resolved environment', () => {
    // Means it was wired without SbEnvironmentEdfiTenantInterceptor in front of it.
    expect(() => intercept(contextFor(undefined, '7'))).toThrow(
      /SbEnvironmentEdfiTenantInterceptor/,
    );
    expect(nextHandler.handle).not.toHaveBeenCalled();
  });
});
