import 'reflect-metadata';
import { INestApplication, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IS_PUBLIC_KEY } from '../auth/authorization/public.decorator';
import axios from 'axios';
import { AppController } from './app.controller';
import { createGlobalValidationPipe } from './global-validation-pipe';
import { HealthService, HealthStatus } from './health.service';

describe('AppController healthcheck', () => {
  let app: INestApplication;
  const getHealth = jest.fn<Promise<HealthStatus>, []>();

  beforeEach(async () => {
    getHealth.mockReset();
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: HealthService, useValue: { getHealth } }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it.each([
    ['healthy', 200],
    ['unhealthy', 503],
  ] as const)('returns the exact %s response with HTTP %i', async (status, httpStatus) => {
    const body: HealthStatus = {
      status,
      timestamp: '2026-09-22T00:00:00.000Z',
      checks: {
        api: { status: 'healthy', message: 'API is responding' },
        database: {
          status,
          message:
            status === 'healthy' ? 'Database connection successful' : 'Database connection failed',
        },
      },
    };
    getHealth.mockResolvedValueOnce(body);
    const response = await request(app.getHttpServer()).get('/api/healthcheck');
    expect(response.status).toBe(httpStatus);
    expect(response.body).toEqual(body);
    expect(getHealth).toHaveBeenCalledTimes(1);
  });

  it('uses debug rather than info for each request', async () => {
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    getHealth.mockResolvedValueOnce({
      status: 'healthy',
      timestamp: '2026-09-22T00:00:00.000Z',
      checks: {
        api: { status: 'healthy', message: 'API is responding' },
        database: { status: 'healthy', message: 'Database connection successful' },
      },
    });
    await request(app.getHttpServer()).get('/api/healthcheck').expect(200);
    expect(debug).toHaveBeenCalledWith('Healthcheck endpoint called');
    expect(info).not.toHaveBeenCalledWith('Healthcheck endpoint called');
  });

  it('retains the public route metadata', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AppController.prototype.healthcheck)).toBe(true);
  });

  it.each([
    ['name', 'Health check failed: Unknown error', '{"kind":"UninspectableError"}'],
    ['errors', 'Health check failed: Unknown error', '{"kind":"UninspectableError"}'],
    ['message', 'Health check failed: Unknown error', '{"kind":"AggregateError","errorCount":0}'],
  ])('preserves the fallback when the %s getter throws', async (property, message, diagnostic) => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const error = Object.defineProperty(new AggregateError([], 'unexpected failure'), property, {
      get() {
        throw new Error('private accessor failure');
      },
    });
    getHealth.mockRejectedValueOnce(error);
    const response = await request(app.getHttpServer()).get('/api/healthcheck');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unhealthy',
      timestamp: expect.any(String),
      checks: {
        api: { status: 'healthy', message: 'API is responding' },
        database: { status: 'unhealthy', message },
      },
    });
    expect(logError).toHaveBeenCalledWith(`Healthcheck error: ${diagnostic}`);
    expect(JSON.stringify(logError.mock.calls)).not.toContain('private accessor failure');
  });

  it.each([
    ['getOwnPropertyDescriptor', 'Health check failed: Unknown error'],
    ['getPrototypeOf', 'Health check failed: Unknown error'],
  ])('preserves the fallback when the %s Proxy trap throws', async (trap, message) => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const error = new Proxy(new Error('unexpected failure'), {
      [trap]() {
        throw new Error('private Proxy failure');
      },
    });
    getHealth.mockRejectedValueOnce(error);
    const response = await request(app.getHttpServer()).get('/api/healthcheck');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.checks.database).toEqual({ status: 'unhealthy', message });
    expect(logError).toHaveBeenCalledWith('Healthcheck error: {"kind":"UninspectableError"}');
  });

  it('preserves the fallback for a revoked Proxy', async () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    getHealth.mockRejectedValueOnce(proxy);
    const response = await request(app.getHttpServer()).get('/api/healthcheck');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('unhealthy');
    expect(response.body.checks.database).toEqual({
      status: 'unhealthy',
      message: 'Health check failed: Unknown error',
    });
    expect(logError).toHaveBeenCalledWith('Healthcheck error: {"kind":"UninspectableError"}');
  });

  it.each([
    [new Error('unexpected failure'), 'Health check failed: Unknown error', '{"kind":"Error"}'],
    [null, 'Health check failed: Unknown error', '{"kind":"null"}'],
    [
      Object.assign(new Error('unexpected failure'), {
        code: 'ELOGIN',
        detail: 'private-controller-diagnostic',
      }),
      'Health check failed: Database login failed',
      '{"kind":"Error","code":"ELOGIN","description":"Database login failed"}',
    ],
  ])('returns a sanitized controller fallback for %p', async (error, message, diagnostic) => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    getHealth.mockRejectedValueOnce(error);
    const response = await request(app.getHttpServer()).get('/api/healthcheck');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unhealthy',
      timestamp: expect.any(String),
      checks: {
        api: { status: 'healthy', message: 'API is responding' },
        database: { status: 'unhealthy', message },
      },
    });
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(`Healthcheck error: ${diagnostic}`);
    expect(JSON.stringify(logError.mock.calls)).not.toContain('private-controller-diagnostic');
  });

  it.each([
    ['ELOGIN', 'Database login failed'],
    ['ECONNREFUSED', 'Connection refused'],
    ['28P01', 'Password authentication failed'],
    ['private-driver-code', 'Unknown error'],
    [undefined, 'Unknown error'],
  ])('does not disclose driver details for code %s', async (code, description) => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const privateDetails = 'host=private-db port=1433 database=private-db user=private-user';
    getHealth.mockRejectedValueOnce(Object.assign(new Error(privateDetails), { code }));
    const response = await request(app.getHttpServer()).get('/api/healthcheck');
    expect(response.status).toBe(503);
    expect(response.body.checks.database).toEqual({
      status: 'unhealthy',
      message: `Health check failed: ${description}`,
    });
    expect(JSON.stringify(response.body)).not.toContain(privateDetails);
    expect(JSON.stringify(response.body)).not.toContain('private-driver-code');
  });

  it.each(['message', 'code'])('does not invoke a driver-supplied %s getter', async (property) => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const getter = jest.fn(() => 'private-driver-detail');
    const error = Object.defineProperty(new Error('private-driver-detail'), property, {
      get: getter,
    });
    getHealth.mockRejectedValueOnce(error);
    const response = await request(app.getHttpServer()).get('/api/healthcheck');
    expect(response.status).toBe(503);
    expect(response.body.checks.database.message).toBe('Health check failed: Unknown error');
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('AppController secret', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: HealthService, useValue: { getHealth: jest.fn() } }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createGlobalValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('accepts a v4 UUID through the global validation pipe and proxies it to Yopass', async () => {
    const secretId = '6137b1dc-00f2-461f-890f-51953d382f86';
    const get = jest.spyOn(axios, 'get').mockResolvedValueOnce({ data: { message: 'encrypted' } });

    const response = await request(app.getHttpServer()).get(`/api/secret/${secretId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'encrypted' });
    expect(get).toHaveBeenCalledWith(`http://localhost:8082/secret/${secretId}`);
  });

  it('still rejects a value that is not a v4 UUID', async () => {
    const get = jest.spyOn(axios, 'get');

    const response = await request(app.getHttpServer()).get('/api/secret/not-a-uuid');

    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });
});
