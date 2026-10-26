import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CAPTURE_VARS_FILE, RESTORE_VARS_FILE } from './bridge-requests';
import {
  assertSafeSegment,
  buildRunEnvironment,
  createRunWorkspace,
  readStepInputNames,
} from './run-workspace';

const STEP_FILE = '01 - 1st Student is valid.bru';
const STEP_BRU = [
  'get {',
  '  url: {{resourceBaseUrl}}/ed-fi/students?studentUniqueId=[ENTER FIRST STUDENT UNIQUE ID]',
  '}',
  'params:query {',
  '  studentUniqueId: [ENTER FIRST STUDENT UNIQUE ID]',
  '}',
  '',
].join('\n');

const makeSisRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sis-root-'));
  for (const file of ['bruno.json', 'collection.bru', 'utils.js', 'logging.js']) {
    fs.writeFileSync(path.join(root, file), `// ${file}\n`);
  }
  const scenarioDir = path.join(root, 'v5', 'Student', 'Students');
  fs.mkdirSync(scenarioDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'v5', 'folder.bru'), 'meta {}\n');
  fs.writeFileSync(path.join(root, 'v5', 'Student', 'folder.bru'), 'meta {}\n');
  fs.writeFileSync(path.join(scenarioDir, 'folder.bru'), 'meta {}\n');
  fs.writeFileSync(path.join(scenarioDir, STEP_FILE), STEP_BRU);
  return root;
};

const baseOptions = (sisRoot: string) => ({
  sisRoot,
  stepSegments: ['v5', 'Student', 'Students', STEP_FILE],
  inputs: { studentUniqueId: '604822' },
  resourceBaseUrl: 'https://ods.example.org/tenant1/data/v3',
  oauthUrl: 'https://ods.example.org/tenant1/oauth/token',
  tokenExpiresAt: 1790000000,
  restoredVars: { firstStudentUniqueId: 'abc123' },
});

describe('createRunWorkspace', () => {
  let sisRoot: string;

  beforeEach(() => {
    sisRoot = makeSisRoot();
  });

  afterEach(() => {
    fs.rmSync(sisRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('builds a self-contained collection with the substituted step and bridge requests', async () => {
    const workspace = await createRunWorkspace(baseOptions(sisRoot));
    try {
      const read = (...p: string[]) => fs.readFileSync(path.join(workspace.dir, ...p), 'utf8');
      expect(workspace.stepPath).toBe(`v5/Student/Students/${STEP_FILE}`);
      expect(read('utils.js')).toBe('// utils.js\n');
      expect(read('v5', 'Student', 'Students', 'folder.bru')).toBe('meta {}\n');
      expect(read('v5', 'Student', 'Students', STEP_FILE)).toContain('studentUniqueId=604822');
      expect(read(...RESTORE_VARS_FILE.split('/'))).toContain('bru.runner.iterationData.get()');
      expect(read(...CAPTURE_VARS_FILE.split('/'))).toContain('bru.getAllVars()');
      expect(JSON.parse(read('vars.json'))).toEqual([{ firstStudentUniqueId: 'abc123' }]);
      expect(read('environments', 'run.bru')).toBe(buildRunEnvironment(baseOptions(sisRoot)));
      expect(workspace.reportPath).toBe(path.join(workspace.dir, 'report.json'));
    } finally {
      await workspace.dispose();
    }
    expect(fs.existsSync(workspace.dir)).toBe(false);
  });

  it('references the token through the process env and never writes it', () => {
    const env = buildRunEnvironment(baseOptions(sisRoot));
    expect(env).toContain('edFiCertToken: {{process.env.EDFI_CERT_TOKEN}}');
    expect(env).toContain('edFiCertTokenExpiration: 1790000000');
    expect(env).toContain('resourceBaseUrl: https://ods.example.org/tenant1/data/v3');
  });

  it.each([['..'], ['a/b'], ['a\\b'], [''], ['.']])('rejects unsafe path segment %j', (segment) => {
    expect(() => assertSafeSegment(segment)).toThrow('Unsafe certification path segment');
  });

  it('rejects a step path that escapes the collection root', async () => {
    await expect(
      createRunWorkspace({ ...baseOptions(sisRoot), stepSegments: ['v5', '..', '..', 'x.bru'] }),
    ).rejects.toThrow('Unsafe certification path segment');
  });

  it.each(['https://h/x}\nscript {', 'javascript:alert(1)', 'not a url'])(
    'rejects an unsafe URL for the env file: %j',
    async (resourceBaseUrl) => {
      await expect(
        createRunWorkspace({ ...baseOptions(sisRoot), resourceBaseUrl }),
      ).rejects.toThrow('Unsafe URL');
    },
  );

  it('removes the workspace when building it fails', async () => {
    fs.rmSync(path.join(sisRoot, 'utils.js'));
    const mkdtemp = jest.spyOn(fs.promises, 'mkdtemp');
    await expect(createRunWorkspace(baseOptions(sisRoot))).rejects.toThrow();
    const created = await mkdtemp.mock.results[0].value;
    expect(fs.existsSync(created)).toBe(false);
  });

  it('keeps the original build error when cleanup also fails', async () => {
    fs.rmSync(path.join(sisRoot, 'utils.js'));
    const mkdtemp = jest.spyOn(fs.promises, 'mkdtemp');
    jest.spyOn(fs.promises, 'rm').mockRejectedValue(new Error('EBUSY: cleanup failed'));
    await expect(createRunWorkspace(baseOptions(sisRoot))).rejects.toThrow(/utils\.js/);
    jest.restoreAllMocks();
    fs.rmSync(await mkdtemp.mock.results[0].value, { recursive: true, force: true });
  });

  it('retries removal so a briefly locked file does not leave the workspace behind', async () => {
    const rm = jest.spyOn(fs.promises, 'rm');
    const workspace = await createRunWorkspace(baseOptions(sisRoot));
    await workspace.dispose();
    expect(rm).toHaveBeenCalledWith(workspace.dir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  });
});

describe('readStepInputNames', () => {
  let sisRoot: string;

  beforeEach(() => {
    sisRoot = makeSisRoot();
  });

  afterEach(() => {
    fs.rmSync(sisRoot, { recursive: true, force: true });
  });

  it('returns the enabled [ENTER ...] input names of the step file', async () => {
    const file = path.join(sisRoot, 'v5', 'Student', 'Students', STEP_FILE);
    fs.writeFileSync(
      file,
      [
        'params:query {',
        '  studentUniqueId: [ENTER FIRST STUDENT UNIQUE ID]',
        '  ~schoolId: [ENTER_SCHOOL_ID]',
        '}',
        '',
      ].join('\n'),
    );
    await expect(
      readStepInputNames(sisRoot, ['v5', 'Student', 'Students', STEP_FILE]),
    ).resolves.toEqual(['studentUniqueId']);
  });

  it('rejects a step path that escapes the collection root', async () => {
    await expect(readStepInputNames(sisRoot, ['v5', '..', '..', 'x.bru'])).rejects.toThrow(
      'Unsafe certification path segment',
    );
  });
});
