import { spawn } from 'child_process';
import { CAPTURE_VARS_FILE, RESTORE_VARS_FILE } from './bridge-requests';
import { CERT_TOKEN_ENV, RUN_ENV_NAME, RUN_REPORT_FILE, RUN_VARS_FILE } from './run-workspace';

/**
 * Bruno exposes the parent's whole process.env to scripts, so the child gets only what it
 * needs to run and reach the network the way the API does, plus the token.
 */
const PASSTHROUGH_ENV = [
  'PATH',
  'SystemRoot',
  'windir',
  'TEMP',
  'TMP',
  'TMPDIR',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'NODE_TLS_REJECT_UNAUTHORIZED',
];
const STDERR_TAIL_LENGTH = 2000;

export const buildChildEnv = (parentEnv: NodeJS.ProcessEnv, token: string): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = {};
  for (const key of PASSTHROUGH_ENV) {
    if (parentEnv[key] !== undefined) env[key] = parentEnv[key];
  }
  env[CERT_TOKEN_ENV] = token;
  return env;
};

/**
 * One process runs restore-vars → step → capture-vars, so runtime variables flow between them.
 * The response body stays in the report (AC-690): it feeds observed values and the snapshot.
 */
export const buildBrunoArgs = ({ stepPath, insecure }: { stepPath: string; insecure: boolean }): string[] => {
  const args = [
    'run',
    RESTORE_VARS_FILE,
    stepPath,
    CAPTURE_VARS_FILE,
    '--env',
    RUN_ENV_NAME,
    '--json-file-path',
    RUN_VARS_FILE,
    '--reporter-json',
    RUN_REPORT_FILE,
    '--reporter-skip-all-headers',
    '--sandbox',
    'safe',
  ];
  // Mirrors the API's own TLS policy (SSL_VERIFICATION=false, local development only).
  if (insecure) args.push('--insecure');
  return args;
};

export interface BrunoCliRunOptions {
  cliPath: string;
  cwd: string;
  args: string[];
  token: string;
  timeoutMs: number;
  parentEnv?: NodeJS.ProcessEnv;
}

export interface BrunoCliResult {
  exitCode: number | null;
  timedOut: boolean;
  /** Last characters of stderr, for operator logs when a run doesn't complete. May contain the token: clean before logging. */
  stderrTail: string;
}

/** The only place certification spawns a process: node + bru.js, no shell, killed on timeout. */
export const runBrunoCli = ({
  cliPath,
  cwd,
  args,
  token,
  timeoutMs,
  parentEnv = process.env,
}: BrunoCliRunOptions): Promise<BrunoCliResult> =>
  new Promise((resolve) => {
    let timedOut = false;
    let stderrTail = '';
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: buildChildEnv(parentEnv, token),
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_LENGTH);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const finish = (exitCode: number | null) => {
      clearTimeout(timer);
      resolve({ exitCode, timedOut, stderrTail });
    };
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
  });
