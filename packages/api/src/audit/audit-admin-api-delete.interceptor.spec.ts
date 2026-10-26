import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditAdminApiDelete } from './audit-admin-api-delete.decorator';
import {
  AuditAdminApiDeleteInterceptor,
  SNAPSHOT_TIMEOUT_MS,
} from './audit-admin-api-delete.interceptor';
import { getAuditSnapshot } from './audit-request-context';

const load = jest.fn();

class Controller {
  @AuditAdminApiDelete('vendorId', (ctx) => load(ctx))
  remove() {
    return;
  }
  plain() {
    return;
  }
}

const edfiTenant = { id: 4 };

const setup = (enabled = true) => {
  const moduleRef = {};
  const interceptor = new AuditAdminApiDeleteInterceptor(
    new Reflector(),
    moduleRef as never,
    enabled,
  );
  const run = async (handler: () => void, params: Record<string, string>, tenant = edfiTenant) => {
    const req = { params, edfiTenant: tenant } as never;
    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const handle = jest.fn(() => of('ok'));
    await interceptor.intercept(ctx, { handle } as CallHandler);
    return { req, handle };
  };
  return { run, moduleRef };
};

describe('AuditAdminApiDeleteInterceptor', () => {
  const c = new Controller();

  beforeEach(() => load.mockReset());

  it('attaches the loaded snapshot and passes the tenant and numeric id to the loader', async () => {
    load.mockResolvedValue({ company: 'Acme' });
    const { run, moduleRef } = setup();
    const { req, handle } = await run(c.remove, { vendorId: '9' });
    expect(getAuditSnapshot(req)).toEqual({ company: 'Acme' });
    expect(load).toHaveBeenCalledWith({ moduleRef, edfiTenant, id: 9 });
    expect(handle).toHaveBeenCalled();
  });

  it('skips the snapshot and still runs the handler when the lookup never settles', async () => {
    jest.useFakeTimers();
    try {
      load.mockReturnValue(new Promise(() => undefined));
      const { run } = setup();
      const pending = run(c.remove, { vendorId: '9' });
      await jest.advanceTimersByTimeAsync(SNAPSHOT_TIMEOUT_MS);
      const { req, handle } = await pending;
      expect(getAuditSnapshot(req)).toBeUndefined();
      expect(handle).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not load anything when audit logging is disabled, and still runs the handler', async () => {
    const { run } = setup(false);
    const { req, handle } = await run(c.remove, { vendorId: '9' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
  });

  it.each([[{}], [{ vendorId: 'abc' }], [{ vendorId: '9; drop' }]])(
    'skips the snapshot for bad param %p and still runs the handler',
    async (params) => {
      const { run } = setup();
      const { req, handle } = await run(c.remove, params);
      expect(getAuditSnapshot(req)).toBeUndefined();
      expect(load).not.toHaveBeenCalled();
      expect(handle).toHaveBeenCalled();
    },
  );

  it('warns and skips the snapshot when no tenant is on the request', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { run } = setup();
    const { req, handle } = await run(c.remove, { vendorId: '9' }, null as never);
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('interceptor order'));
    warn.mockRestore();
  });

  it('still runs the handler when the loader throws', async () => {
    load.mockRejectedValue(new Error('admin api down'));
    const { run } = setup();
    const { req, handle } = await run(c.remove, { vendorId: '9' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(handle).toHaveBeenCalled();
  });

  it('does nothing without @AuditAdminApiDelete', async () => {
    const { run } = setup();
    const { req, handle } = await run(c.plain, { vendorId: '9' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
  });
});
