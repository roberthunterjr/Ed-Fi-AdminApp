import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BRIDGE_DIR,
  CAPTURE_VARS_BRU,
  CAPTURE_VARS_FILE,
  RESTORE_VARS_BRU,
  RESTORE_VARS_FILE,
} from './bridge-requests';
import { CapturedVars } from './captured-vars';
import { parseInputParams } from './bru-params';
import { substituteStepInputs } from './step-inputs';

/** The child env var the generated env file reads the token from. */
export const CERT_TOKEN_ENV = 'EDFI_CERT_TOKEN';
export const RUN_ENV_NAME = 'run';
export const RUN_VARS_FILE = 'vars.json';
export const RUN_REPORT_FILE = 'report.json';

/** Collection-root files the artifact's scripts need (`require('./utils')` resolves against cwd). */
const COLLECTION_FILES = ['bruno.json', 'collection.bru', 'utils.js', 'logging.js'];

export interface RunWorkspaceOptions {
  /** Absolute path of the verified artifact's SIS collection root. Only read, never written. */
  sisRoot: string;
  /** [sisVersion, area, scenario, fileName], straight from the catalog. */
  stepSegments: string[];
  inputs: Record<string, string>;
  resourceBaseUrl: string;
  oauthUrl: string;
  /** Epoch seconds for edFiCertTokenExpiration, so collection.bru never fetches its own token. */
  tokenExpiresAt: number;
  restoredVars: CapturedVars;
}

export interface RunWorkspace {
  dir: string;
  /** The step's path inside the workspace, with `/` separators, as passed to `bru run`. */
  stepPath: string;
  reportPath: string;
  dispose(): Promise<void>;
}

export const assertSafeSegment = (segment: string): void => {
  if (
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment.includes('/') ||
    segment.includes('\\') ||
    segment.includes('\0')
  ) {
    throw new Error(`Unsafe certification path segment: ${JSON.stringify(segment)}`);
  }
};

const resolveInside = (root: string, segments: string[]): string => {
  segments.forEach(assertSafeSegment);
  const base = path.resolve(root);
  const full = path.resolve(base, ...segments);
  if (!full.startsWith(base + path.sep)) {
    throw new Error('Certification step path escapes the collection root');
  }
  return full;
};

/** The enabled `[ENTER ...]` input names of the step file itself, the single source of truth for what a run needs. */
export const readStepInputNames = async (
  sisRoot: string,
  stepSegments: string[],
): Promise<string[]> => {
  const content = await fs.promises.readFile(resolveInside(sisRoot, stepSegments), 'utf8');
  return parseInputParams(content).map(({ name }) => name);
};

/** URLs are written into the env file as text, so only plain absolute http(s) URLs are allowed. */
export const assertEnvSafeUrl = (value: string): void => {
  let protocol = '';
  try {
    protocol = new URL(value).protocol;
  } catch {
    // handled below
  }
  if ((protocol !== 'https:' && protocol !== 'http:') || /[\s{}]/.test(value)) {
    throw new Error('Unsafe URL for the certification run environment');
  }
};

export const buildRunEnvironment = ({
  resourceBaseUrl,
  oauthUrl,
  tokenExpiresAt,
}: Pick<RunWorkspaceOptions, 'resourceBaseUrl' | 'oauthUrl' | 'tokenExpiresAt'>): string =>
  [
    'vars {',
    `  resourceBaseUrl: ${resourceBaseUrl}`,
    `  oauthUrl: ${oauthUrl}`,
    `  edFiCertToken: {{process.env.${CERT_TOKEN_ENV}}}`,
    `  edFiCertTokenExpiration: ${tokenExpiresAt}`,
    '}',
    '',
  ].join('\n');

/**
 * Builds a throwaway Bruno collection for one run in the OS temp dir. Runs never share
 * files, and the verified artifact stays untouched. Always call dispose().
 */
export const createRunWorkspace = async (options: RunWorkspaceOptions): Promise<RunWorkspace> => {
  assertEnvSafeUrl(options.resourceBaseUrl);
  assertEnvSafeUrl(options.oauthUrl);
  const sourceStep = resolveInside(options.sisRoot, options.stepSegments);

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cert-run-'));
  // Retries cover a briefly locked file (common on Windows) so a workspace isn't left behind.
  const dispose = () =>
    fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  try {
    await fs.promises.chmod(dir, 0o700);
    for (const file of COLLECTION_FILES) {
      await fs.promises.copyFile(path.join(options.sisRoot, file), path.join(dir, file));
    }

    // folder.bru files carry `auth: inherit` for each level above the step.
    for (let depth = 1; depth < options.stepSegments.length; depth++) {
      const folder = options.stepSegments.slice(0, depth);
      await fs.promises.mkdir(path.join(dir, ...folder), { recursive: true });
      const folderBru = path.join(resolveInside(options.sisRoot, folder), 'folder.bru');
      if (fs.existsSync(folderBru)) {
        await fs.promises.copyFile(folderBru, path.join(dir, ...folder, 'folder.bru'));
      }
    }

    const stepContent = await fs.promises.readFile(sourceStep, 'utf8');
    await fs.promises.writeFile(
      path.join(dir, ...options.stepSegments),
      substituteStepInputs(stepContent, options.inputs),
      'utf8',
    );

    await fs.promises.mkdir(path.join(dir, 'environments'));
    await fs.promises.writeFile(
      path.join(dir, 'environments', `${RUN_ENV_NAME}.bru`),
      buildRunEnvironment(options),
      'utf8',
    );

    await fs.promises.mkdir(path.join(dir, BRIDGE_DIR));
    await fs.promises.writeFile(
      path.join(dir, ...RESTORE_VARS_FILE.split('/')),
      RESTORE_VARS_BRU,
      'utf8',
    );
    await fs.promises.writeFile(
      path.join(dir, ...CAPTURE_VARS_FILE.split('/')),
      CAPTURE_VARS_BRU,
      'utf8',
    );
    await fs.promises.writeFile(
      path.join(dir, RUN_VARS_FILE),
      JSON.stringify([options.restoredVars]),
      'utf8',
    );
  } catch (error) {
    // A failing cleanup must not hide the real build error.
    await dispose().catch(() => undefined);
    throw error;
  }

  return {
    dir,
    stepPath: options.stepSegments.join('/'),
    reportPath: path.join(dir, RUN_REPORT_FILE),
    dispose,
  };
};
