import { setAuditOidcIssuer } from './audit-request-context';
import express, { NextFunction, Request, Response } from 'express';
import { createServer } from 'http';
import { AddressInfo, Socket } from 'net';
import request from 'supertest';
import { AuditEvent } from './audit-event';
import { AuditActionMiddleware } from './audit-action.middleware';
import { setAuditSnapshot } from './audit-request-context';

describe('AuditActionMiddleware', () => {
  let recorded: AuditEvent[];
  let recorder: { record: jest.Mock };
  let user: unknown;
  let session: unknown;

  const build = () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as unknown as { user: unknown }).user = user;
      (req as unknown as { session: unknown }).session = session;
      next();
    });
    app.use(new AuditActionMiddleware(recorder as never).handle);
    return app;
  };

  beforeEach(() => {
    recorded = [];
    user = undefined;
    session = undefined;
    recorder = { record: jest.fn((e: AuditEvent) => void recorded.push(e)) };
  });

  it('records a POST with verb, path, status and ip', async () => {
    user = { username: 'alice', userType: 'human' };
    const app = build();
    app.post('/things', (_req, res) => void res.status(201).send('ok'));

    await request(app).post('/things').expect(201);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      eventType: 'Action',
      httpVerb: 'POST',
      httpUrl: '/things',
      statusCode: 201,
      actorUsername: 'alice',
      actorType: 'user',
      details: null,
    });
    expect(recorded[0].sourceIpAddress).toBeTruthy();
    expect(recorded[0].timestamp).toBeInstanceOf(Date);
  });

  it('records a machine actor', async () => {
    user = { username: 'svc', userType: 'machine' };
    const app = build();
    app.put('/things', (_req, res) => void res.sendStatus(204));

    await request(app).put('/things').expect(204);

    expect(recorded[0]).toMatchObject({ actorUsername: 'svc', actorType: 'machine' });
  });

  it('records a guard-denied 403 with the session actor', async () => {
    user = { username: 'bob', userType: 'human' };
    const app = build();
    app.delete('/things/1', (_req, res) => void res.sendStatus(403));

    await request(app).delete('/things/1').expect(403);

    expect(recorded[0]).toMatchObject({
      statusCode: 403,
      actorUsername: 'bob',
      httpVerb: 'DELETE',
    });
  });

  it('records an unauthenticated 401 with a null actor', async () => {
    const app = build();
    app.patch('/things', (_req, res) => void res.sendStatus(401));

    await request(app).patch('/things').expect(401);

    expect(recorded[0]).toMatchObject({ statusCode: 401, actorUsername: null, actorType: null });
  });

  describe('oidcIssuer', () => {
    it('records the OIDC provider the session was authenticated through', async () => {
      user = { username: 'alice', userType: 'human' };
      session = { oidcId: 7, oidcIssuer: 'https://idp.example/realms/edfi' };
      const app = build();
      app.post('/things', (_req, res) => void res.sendStatus(201));

      await request(app).post('/things').expect(201);

      expect(recorded[0].oidcIssuer).toBe('https://idp.example/realms/edfi');
    });

    it('keeps the issuer a handler stashed on the request after it destroyed the session', async () => {
      session = { oidcId: 7, oidcIssuer: 'https://idp.example/realms/edfi' };
      const app = build();
      app.post('/logout', (req, res) => {
        setAuditOidcIssuer(
          req,
          (req as never as { session: { oidcIssuer: string } }).session.oidcIssuer,
        );
        (req as unknown as { session: unknown }).session = undefined;
        res.sendStatus(204);
      });

      await request(app).post('/logout').expect(204);

      expect(recorded[0].oidcIssuer).toBe('https://idp.example/realms/edfi');
    });

    it.each([
      ['no session', undefined],
      ['a session without an oidcIssuer', {}],
    ])('records null with %s', async (_label, value) => {
      session = value;
      const app = build();
      app.post('/things', (_req, res) => void res.sendStatus(201));

      await request(app).post('/things').expect(201);

      expect(recorded).toHaveLength(1);
      expect(recorded[0].oidcIssuer).toBeNull();
    });

    it('still records the action, with a null oidcIssuer, when reading the session throws', async () => {
      const app = express();
      app.use((req, _res, next) => {
        Object.defineProperty(req, 'session', {
          get: () => {
            throw new Error('session store down');
          },
        });
        next();
      });
      app.use(new AuditActionMiddleware(recorder as never).handle);
      app.post('/things', (_req, res) => void res.status(201).send('ok'));

      const res = await request(app).post('/things');

      expect(res.status).toBe(201);
      expect(res.text).toBe('ok');
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ statusCode: 201, oidcIssuer: null });
    });
  });

  it('passes the original url including the query string to the recorder', async () => {
    const app = build();
    app.use('/x', (_req, res) => void res.sendStatus(200));

    await request(app).post('/x?token=abc').expect(200);

    expect(recorded[0].httpUrl).toBe('/x?token=abc');
  });

  it.each(['get', 'head', 'options'] as const)('does not record %s', async (verb) => {
    const app = build();
    app.all('/things', (_req, res) => void res.sendStatus(200));

    await request(app)[verb]('/things');

    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('puts the snapshot in details as JSON', async () => {
    const app = build();
    app.delete('/things/1', (req, res) => {
      setAuditSnapshot(req, { id: 1, name: 'gone' });
      res.sendStatus(200);
    });

    await request(app).delete('/things/1').expect(200);

    expect(recorded[0].details).toBe(JSON.stringify({ id: 1, name: 'gone' }));
  });

  it('drops the snapshot when the handler rejects the delete after it was taken', async () => {
    const app = build();
    app.delete('/things/1', (req, res) => {
      setAuditSnapshot(req, { id: 1, name: 'kept' });
      res.sendStatus(403);
    });

    await request(app).delete('/things/1').expect(403);

    expect(recorded[0]).toMatchObject({ statusCode: 403, details: null });
  });

  it('does not change the response when the recorder throws', async () => {
    recorder.record.mockImplementation(() => {
      throw new Error('boom');
    });
    const app = build();
    app.post('/things', (_req, res) => void res.status(201).send('ok'));

    const res = await request(app).post('/things');

    expect(res.status).toBe(201);
    expect(res.text).toBe('ok');
  });

  it('records exactly once when finish and close both fire', async () => {
    const app = build();
    app.post('/things', (_req, res) => void res.sendStatus(200));

    await request(app).post('/things').expect(200);
    await new Promise((r) => setTimeout(r, 20));

    expect(recorder.record).toHaveBeenCalledTimes(1);
  });

  it('records exactly once when the client aborts', async () => {
    const app = build();
    let release: () => void = () => undefined;
    const hold = new Promise<void>((r) => (release = r));
    app.post('/slow', async (_req, res) => {
      await hold;
      res.sendStatus(200);
    });
    const server = createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    const { port } = server.address() as AddressInfo;

    const socket = new Socket();
    await new Promise<void>((r) => socket.connect(port, '127.0.0.1', r));
    socket.write('POST /slow HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n');
    await new Promise((r) => setTimeout(r, 50));
    socket.destroy();
    await new Promise((r) => setTimeout(r, 50));
    release();
    await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => server.close(r));

    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(recorded[0]).toMatchObject({ httpVerb: 'POST', httpUrl: '/slow', statusCode: 499 });
  });

  it('records the real status of a finished response, not the abort sentinel', async () => {
    const app = build();
    app.delete('/things/1', (_req, res) => void res.sendStatus(500));

    await request(app).delete('/things/1').expect(500);
    await new Promise((r) => setTimeout(r, 20));

    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(recorded[0].statusCode).toBe(500);
  });

  describe('body parser failures', () => {
    const bodyParserApp = (auditFirst: boolean) => {
      const app = express();
      const audit = new AuditActionMiddleware(recorder as never).handle;
      if (auditFirst) app.use(audit);
      app.use(express.json({ limit: '100b' }));
      if (!auditFirst) app.use(audit);
      app.post('/things', (_req, res) => void res.sendStatus(201));
      return app;
    };

    it('audits invalid JSON rejected with 400 when mounted before the parser', async () => {
      await request(bodyParserApp(true))
        .post('/things')
        .set('Content-Type', 'application/json')
        .send('{not json')
        .expect(400);

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ httpVerb: 'POST', statusCode: 400 });
    });

    it('audits an over-limit body rejected with 413 when mounted before the parser', async () => {
      await request(bodyParserApp(true))
        .post('/things')
        .send({ blob: 'x'.repeat(500) })
        .expect(413);

      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ statusCode: 413 });
    });

    it('shows why order matters: mounted after the parser, a rejection is not audited', async () => {
      await request(bodyParserApp(false))
        .post('/things')
        .set('Content-Type', 'application/json')
        .send('{not json')
        .expect(400);

      expect(recorded).toHaveLength(0);
    });
  });

  it('calls next for non-write requests untouched', () => {
    const next = jest.fn();
    const res = { once: jest.fn(), on: jest.fn() } as unknown as Response;

    new AuditActionMiddleware(recorder as never).handle(
      { method: 'GET' } as Request,
      res,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
    expect(res.once).not.toHaveBeenCalled();
  });
});
