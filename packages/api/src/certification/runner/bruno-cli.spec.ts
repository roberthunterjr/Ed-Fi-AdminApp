import childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildBrunoArgs, buildChildEnv, runBrunoCli } from './bruno-cli';

describe('buildBrunoArgs', () => {
  it('runs restore, the step and capture in one process, keeping the response body for the snapshot', () => {
    expect(buildBrunoArgs({ stepPath: 'v5/A/B/01 - x.bru', insecure: false })).toEqual([
      'run',
      '_adminapp/restore-vars.bru',
      'v5/A/B/01 - x.bru',
      '_adminapp/capture-vars.bru',
      '--env',
      'run',
      '--json-file-path',
      'vars.json',
      '--reporter-json',
      'report.json',
      '--reporter-skip-all-headers',
      '--sandbox',
      'safe',
    ]);
  });

  it('adds --insecure only when asked (SSL_VERIFICATION=false)', () => {
    expect(buildBrunoArgs({ stepPath: 's.bru', insecure: true })).toContain('--insecure');
    expect(buildBrunoArgs({ stepPath: 's.bru', insecure: false })).not.toContain('--insecure');
  });
});

describe('buildChildEnv', () => {
  it('passes only the allowlist plus the token, never the API secrets', () => {
    const env = buildChildEnv(
      {
        PATH: '/bin',
        HTTPS_PROXY: 'http://proxy',
        NODE_EXTRA_CA_CERTS: '/ca.pem',
        DB_CONNECTION_STRING: 'postgres://secret',
        SESSION_SECRET: 'secret',
        DB_ENCRYPTION_SECRET_VALUE: 'secret',
      },
      'tok'
    );
    expect(env).toEqual({
      PATH: '/bin',
      HTTPS_PROXY: 'http://proxy',
      NODE_EXTRA_CA_CERTS: '/ca.pem',
      EDFI_CERT_TOKEN: 'tok',
    });
  });
});

describe('runBrunoCli', () => {
  let dir: string;
  const script = (name: string, body: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, body);
    return file;
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-cli-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('spawns node with the CLI path and args, without a shell, and returns the exit code', async () => {
    const spawn = jest.spyOn(childProcess, 'spawn');
    const cliPath = script('exit3.js', 'process.exit(3);\n');

    const result = await runBrunoCli({ cliPath, cwd: dir, args: ['run', 'x'], token: 't', timeoutMs: 10_000 });

    expect(result).toEqual({ exitCode: 3, timedOut: false, stderrTail: '' });
    const [command, args, options] = spawn.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([cliPath, 'run', 'x']);
    expect(options).toMatchObject({ cwd: dir, shell: false });
  });

  it('gives the child only the allowlisted env', async () => {
    const cliPath = script(
      'env.js',
      "require('fs').writeFileSync('env.json', JSON.stringify(Object.keys(process.env)));\n"
    );
    await runBrunoCli({
      cliPath,
      cwd: dir,
      args: [],
      token: 'tok',
      timeoutMs: 10_000,
      parentEnv: { PATH: process.env.PATH, SESSION_SECRET: 'secret', SystemRoot: process.env.SystemRoot },
    });
    const keys: string[] = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
    expect(keys).toContain('EDFI_CERT_TOKEN');
    expect(keys).not.toContain('SESSION_SECRET');
  });

  it('kills a run that exceeds the timeout', async () => {
    const cliPath = script('hang.js', 'setInterval(() => undefined, 1000);\n');
    const result = await runBrunoCli({ cliPath, cwd: dir, args: [], token: 't', timeoutMs: 300 });
    expect(result.timedOut).toBe(true);
  });

  it('keeps only the tail of stderr', async () => {
    const cliPath = script('noisy.js', "process.stderr.write('x'.repeat(5000) + 'END');\n");
    const result = await runBrunoCli({ cliPath, cwd: dir, args: [], token: 't', timeoutMs: 10_000 });
    expect(result.stderrTail).toHaveLength(2000);
    expect(result.stderrTail.endsWith('END')).toBe(true);
  });
});
