import 'reflect-metadata';
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import { buildBrunoArgs, runBrunoCli } from './bruno-cli';
import { parseBrunoReport, readBrunoReport } from './bruno-report';
import { CapturedVars } from './captured-vars';
import { createRunWorkspace } from './run-workspace';

const RUNTIME_ROOT = path.resolve(__dirname, '../../../certification/bruno');
const SIS_ROOT = path.join(RUNTIME_ROOT, 'SIS');
const CLI_PATH = path.join(RUNTIME_ROOT, 'node_modules', '@usebruno', 'cli', 'bin', 'bru.js');
const hasRuntime =
  fs.existsSync(CLI_PATH) && fs.existsSync(path.join(SIS_ROOT, 'v5', 'Student', 'Students'));
const describeWithRuntime = hasRuntime ? describe : describe.skip;

const TOKEN = 'integration-token';
const STEP_01 = '01 - 1st Student is valid.bru';
const STEP_03 = '03 - 1st Student - birthDate was Updated.bru';

describeWithRuntime('certification runner with the real Bruno CLI (needs the downloaded runtime)', () => {
  let server: http.Server;
  let baseUrl: string;
  let birthDate = '2010-01-01';

  const student = () => ({
    id: 'abc123',
    studentUniqueId: 'S1',
    birthCity: 'Austin',
    birthCountryDescriptor: 'uri://ed-fi.org/CountryDescriptor#US',
    birthDate,
    firstName: 'A',
    middleName: 'B',
    lastSurname: 'C',
    generationCodeSuffix: 'Jr',
    personalTitlePrefix: 'Mr',
  });

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) {
        res.writeHead(401);
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (req.url?.startsWith('/data/v3/ed-fi/students?')) {
        res.end(JSON.stringify(req.url.includes('studentUniqueId=S1') ? [student()] : []));
        return;
      }
      if (req.url === '/data/v3/ed-fi/students/abc123') {
        res.end(JSON.stringify(student()));
        return;
      }
      res.writeHead(404);
      res.end('[]');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const runStep = async (fileName: string, inputs: Record<string, string>, restoredVars: CapturedVars) => {
    const workspace = await createRunWorkspace({
      sisRoot: SIS_ROOT,
      stepSegments: ['v5', 'Student', 'Students', fileName],
      inputs,
      resourceBaseUrl: `${baseUrl}/data/v3`,
      oauthUrl: `${baseUrl}/oauth/token`,
      tokenExpiresAt: Math.floor(Date.now() / 1000) + 600,
      restoredVars,
    });
    try {
      const cli = await runBrunoCli({
        cliPath: CLI_PATH,
        cwd: workspace.dir,
        args: buildBrunoArgs({ stepPath: workspace.stepPath, insecure: false }),
        token: TOKEN,
        timeoutMs: 60_000,
      });
      expect(cli.timedOut).toBe(false);
      return parseBrunoReport(await readBrunoReport(workspace.reportPath), {
        stepPath: workspace.stepPath,
        token: TOKEN,
      });
    } finally {
      await workspace.dispose();
    }
  };

  it('runs the ticket scenario: step 03 fails until the vendor updates the birth date', async () => {
    const step01 = await runStep(STEP_01, { studentUniqueId: 'S1' }, {});
    expect(step01).toMatchObject({ complete: true, passed: true, errors: [], responseStatus: 200 });
    expect(step01.responseSnapshot).toMatchObject({ state: 'body' });
    expect(step01.capturedVars).toMatchObject({
      firstStudentUniqueId: 'abc123',
      firstStudentBirthDate: '2010-01-01',
    });

    const unchanged = await runStep(STEP_03, {}, step01.capturedVars ?? {});
    expect(unchanged.passed).toBe(false);
    expect(unchanged.errors).toEqual([
      {
        kind: 'assertion',
        field: 'birthDate changed',
        expected: "Different from '2010-01-01'",
        observed: "'2010-01-01'",
        message: "expected '2010-01-01' to not equal '2010-01-01'",
      },
    ]);

    birthDate = '2011-02-02';
    const updated = await runStep(STEP_03, {}, step01.capturedVars ?? {});
    expect(updated).toMatchObject({ complete: true, passed: true, errors: [] });
  }, 120_000);

  it('explains the missing dependency when step 03 runs without captured values', async () => {
    const result = await runStep(STEP_03, {}, {});
    expect(result.passed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ kind: 'exception', field: null, observed: null });
    expect(result.errors[0].message).toContain('Run "01 - 1st Student is valid" first');
    expect(result).toMatchObject({ responseStatus: null, responseSnapshot: null });
  }, 60_000);
});
