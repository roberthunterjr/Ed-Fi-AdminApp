import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditDelete } from './audit-delete.decorator';
import { AuditDeleteInterceptor } from './audit-delete.interceptor';
import { getAuditSnapshot } from './audit-request-context';
import { getDeleteSnapshotBuilder, registerDeleteSnapshot } from './delete-snapshot.registry';

class Widget {
  id: number;
  name: string;
  secret: string;
  owner?: { username: string };
}
class Unregistered {
  id: number;
}
class Bare {
  id: number;
}

registerDeleteSnapshot(Widget, (w) => ({ id: w.id, name: w.name, owner: w.owner?.username }), {
  relations: ['owner'],
});
registerDeleteSnapshot(Bare, (b) => ({ id: b.id }));

class Controller {
  @AuditDelete(Widget, 'id')
  remove() {
    return;
  }
  @AuditDelete(Unregistered, 'id')
  removeUnregistered() {
    return;
  }
  @AuditDelete(Bare, 'id')
  removeBare() {
    return;
  }
  plain() {
    return;
  }
}

const setup = (findOne: jest.Mock, enabled = true) => {
  const dataSource = {
    getMetadata: jest.fn().mockReturnValue({ primaryColumns: [{ propertyName: 'id' }] }),
    manager: { findOne },
  };
  const interceptor = new AuditDeleteInterceptor(new Reflector(), dataSource as never, enabled);
  const run = async (handler: () => void, params: Record<string, string>) => {
    const req = { params } as never;
    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const handle = jest.fn(() => of('ok'));
    await interceptor.intercept(ctx, { handle } as CallHandler);
    return { req, handle };
  };
  return { run, dataSource };
};

describe('AuditDeleteInterceptor', () => {
  const c = new Controller();

  it('snapshots only allowlisted fields of the found entity', async () => {
    const findOne = jest
      .fn()
      .mockResolvedValue({ id: 5, name: 'w', secret: 'x', owner: { username: 'bob' } });
    const { run } = setup(findOne);
    const { req, handle } = await run(c.remove, { id: '5' });
    expect(getAuditSnapshot(req)).toEqual({ id: 5, name: 'w', owner: 'bob' });
    expect(findOne).toHaveBeenCalledWith(Widget, {
      where: { id: 5 },
      relations: { owner: true },
    });
    expect(handle).toHaveBeenCalled();
  });

  it('passes relations in object syntax, never the array syntax TypeORM 1.x rejects', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 5, name: 'w' });
    const { run } = setup(findOne);
    await run(c.remove, { id: '5' });
    const [, options] = findOne.mock.calls[0];
    expect(Array.isArray(options.relations)).toBe(false);
  });

  it('passes empty object relations for an entity registered without relations', async () => {
    const findOne = jest.fn().mockResolvedValue({ id: 5 });
    const { run } = setup(findOne);
    await run(c.removeBare, { id: '5' });
    expect(findOne).toHaveBeenCalledWith(Bare, { where: { id: 5 }, relations: {} });
  });

  it('does not read the database when audit logging is disabled, and still runs the handler', async () => {
    const findOne = jest.fn();
    const { run, dataSource } = setup(findOne, false);
    const { req, handle } = await run(c.remove, { id: '5' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    expect(dataSource.getMetadata).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
  });

  it.each([[{}], [{ id: 'abc' }], [{ id: '5; drop' }]])(
    'skips the snapshot for bad param %p and still runs the handler',
    async (params) => {
      const findOne = jest.fn();
      const { run } = setup(findOne);
      const { req, handle } = await run(c.remove, params);
      expect(getAuditSnapshot(req)).toBeUndefined();
      expect(findOne).not.toHaveBeenCalled();
      expect(handle).toHaveBeenCalled();
    },
  );

  it('does not snapshot when the entity is not found', async () => {
    const { run } = setup(jest.fn().mockResolvedValue(null));
    const { req, handle } = await run(c.remove, { id: '5' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(handle).toHaveBeenCalled();
  });

  it('still runs the handler when the lookup throws', async () => {
    const { run } = setup(jest.fn().mockRejectedValue(new Error('db down')));
    const { req, handle } = await run(c.remove, { id: '5' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(handle).toHaveBeenCalled();
  });

  it('does nothing without @AuditDelete', async () => {
    const findOne = jest.fn();
    const { run } = setup(findOne);
    const { req, handle } = await run(c.plain, { id: '5' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
  });

  it('does nothing for an entity with no registered builder', async () => {
    expect(getDeleteSnapshotBuilder(Unregistered)).toBeUndefined();
    const findOne = jest.fn();
    const { run } = setup(findOne);
    const { req, handle } = await run(c.removeUnregistered, { id: '5' });
    expect(getAuditSnapshot(req)).toBeUndefined();
    expect(findOne).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
  });
});
