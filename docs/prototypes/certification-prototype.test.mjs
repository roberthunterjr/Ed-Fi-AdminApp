import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* The prototype is a single HTML file with one inline <script>. We run that
   script inside a Function with DOM stubs passed as parameters, then hand back a
   Proxy over an eval closure so tests can reach any top-level binding by name
   without the harness needing to know what exists. */
export function loadPrototype(){
  const html = readFileSync(new URL('./certification-prototype.html', import.meta.url), 'utf8');
  const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

  const noop = () => {};
  const el = {
    addEventListener:noop, appendChild:noop, setAttribute:noop, remove:noop, focus:noop,
    classList:{add:noop, remove:noop}, style:{}, dataset:{}, innerHTML:'', value:'',
    querySelector:() => null, querySelectorAll:() => []
  };
  const document = {
    addEventListener:noop, querySelector:() => el, querySelectorAll:() => [],
    getElementById:() => el, createElement:() => el, body:el, documentElement:el
  };
  const location = {hash:'#/dashboard'};
  const window = {
    addEventListener:noop, location,
    matchMedia:() => ({matches:false, addEventListener:noop})
  };

  let lookup;
  const factory = new Function(
    'window', 'document', 'location', 'setTimeout', 'navigator', '__bind',
    js + '\n__bind(n => eval(n));'
  );
  factory(window, document, location, noop, {}, fn => { lookup = fn; });

  return new Proxy({}, {get: (_, name) => lookup(String(name))});
}

test('harness exposes the collection data', () => {
  const p = loadPrototype();
  assert.equal(p.COLLECTION.sis.length, 45, 'SIS has 45 scenarios');
  assert.equal(p.COLLECTION.mtss.length, 8, 'MTSS has 8 scenarios');
});

test('each loadPrototype call is isolated', () => {
  const a = loadPrototype(), b = loadPrototype();
  a.APP.submissions.length = 0;
  assert.ok(b.APP.submissions.length > 0, 'mutating one instance must not affect another');
});

test('harness reaches functions as well as data', () => {
  const p = loadPrototype();
  assert.equal(typeof p.startRun, 'function');
  assert.equal(typeof p.resultTally, 'function');
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  assert.ok(sub, 'the seed data contains a SIS submission');
});

const findScenario = (p, model, name) =>
  p.COLLECTION[model].find(s => s[1] === name);

test('scenario metadata carries load order and prerequisites', () => {
  const p = loadPrototype();
  const [, , , meta] = findScenario(p, 'sis', 'Sections');
  assert.equal(meta.seq, 12, 'Sections is 12th in the documented load order');
  assert.deepEqual(meta.prereqs, ['Class Period', 'Location', 'Course Offering']);
  assert.equal(meta.tasks.length, 4);
});

test('tasks map to verification steps by their leading number', () => {
  const p = loadPrototype();
  const [, , steps, meta] = findScenario(p, 'sis', 'Sections');
  const tasks = p.scenarioTasks(steps, meta);
  assert.deepEqual(tasks.map(t => t.stepIndex), [0, 1, 2, 3], 'Sections is one step per task');
});

test('a task with no verification step reports stepIndex -1', () => {
  const p = loadPrototype();
  const [, , steps, meta] = findScenario(p, 'sis', 'StudentSchoolAttendanceEvents');
  const tasks = p.scenarioTasks(steps, meta);
  assert.equal(tasks.length, 5, 'five documented load tasks');
  assert.deepEqual(
    tasks.map(t => t.stepIndex), [0, 1, -1, -1, 2],
    'steps 01, 02 and 05 exist; tasks 3 and 4 are not asserted'
  );
});

test('struck-through tasks are marked out of scope', () => {
  const p = loadPrototype();
  const [, , steps, meta] = findScenario(p, 'sis', 'BellSchedules');
  const tasks = p.scenarioTasks(steps, meta);
  assert.equal(tasks.filter(t => t.outOfScope).length, 3, 'tasks 2-4 are struck through');
  assert.equal(tasks[0].outOfScope, false);
  assert.equal(tasks[0].stepIndex, 0);
});

test('scenarios documenting no tasks fall back to their step list', () => {
  const p = loadPrototype();
  const [, , steps, meta] = findScenario(p, 'sis', 'Grades');
  assert.equal(meta.tasks.length, 0, 'Grades documents no task list upstream');
  const tasks = p.scenarioTasks(steps, meta);
  assert.equal(tasks.length, steps.length, 'one synthetic task per step');
  assert.equal(tasks[0].text, steps[0][0], 'synthetic task text is the step name');
  assert.deepEqual(tasks.map(t => t.stepIndex), steps.map((_, i) => i));
});

test('every SIS and MTSS scenario yields at least one task', () => {
  const p = loadPrototype();
  for (const model of ['sis', 'mtss']){
    for (const [area, scenario, steps, meta] of p.COLLECTION[model]){
      const tasks = p.scenarioTasks(steps, meta);
      assert.ok(tasks.length > 0, `${area}/${scenario} produced no tasks`);
      assert.ok(typeof meta.seq === 'number', `${area}/${scenario} has no seq`);
    }
  }
});

const openSisRun = p => {
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  return p.startRun(sub, 'realistic');
};

test('a Bruno run opens with every task unchecked', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  assert.equal(run.state, 'open');
  assert.equal(run.ended, null);
  const scen = p.scenarioOf(run, 'MasterSchedule/Sections');
  assert.equal(scen.tasks.length, 4);
  assert.ok(scen.tasks.every(t => t.check === null), 'nothing is checked at start');
  assert.equal(scen.seq, 12);
});

test('a task with a verification step carries its resolved spec', () => {
  const p = loadPrototype();
  const scen = p.scenarioOf(openSisRun(p), 'MasterSchedule/Sections');
  const third = scen.tasks[2];
  assert.ok(third.step, 'task 3 has a verification step');
  assert.equal(third.step.changed, 'availableCredits');
  assert.ok(third.step.spec.includes('sectionIdentifier:S'),
    "step 3 inherits step 1's spec through '='");
});

test('a task without a verification step has a null step', () => {
  const p = loadPrototype();
  const scen = p.scenarioOf(openSisRun(p), 'StudentAttendance/StudentSchoolAttendanceEvents');
  assert.equal(scen.tasks.length, 5);
  assert.equal(scen.tasks[2].step, null, 'task 3 is not asserted');
  assert.ok(scen.tasks[4].step, 'task 5 is the Delete check');
  assert.equal(scen.tasks[4].step.status, 404);
});

test('completeness and artifact pins are stamped at start', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  assert.ok(['Complete', 'Incomplete'].includes(run.completeness));
  assert.ok('mapping' in run.pinned, 'artifact versions pinned at start');
});

test('an Assessments run still uses the batch path', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'assessments');
  const run = p.startRun(sub, 'realistic');
  assert.equal(run.state, 'queued', 'Assessments is unchanged');
});

const sectionsRun = p => {
  const run = openSisRun(p);
  return {run, key: 'MasterSchedule/Sections'};
};

test('checking a task records a pass with its element rows', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  const check = p.runCheck(run, key, 1);
  assert.equal(check.st, 'pass');
  assert.equal(check.attempts, 1);
  assert.ok(check.elements.length > 10, 'Sections asserts on 19 elements');
  assert.ok(check.at, 'records when');
  assert.ok(check.by, 'records who');
  assert.equal(p.scenarioOf(run, key).tasks[0].check, check, 'stored on the task');
});

test('re-checking overwrites the slot and increments attempts', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 1);
  const second = p.runCheck(run, key, 1);
  assert.equal(second.attempts, 2);
  assert.equal(p.scenarioOf(run, key).tasks[0].check, second, 'only the latest is kept');
});

test('a seeded failure fails the task it names and marks the element', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  const check = p.runCheck(run, key, 4);
  assert.equal(check.st, 'fail');
  assert.equal(check.kind, 'fail-unchanged');
  const bad = check.elements.filter(e => e.st !== 'pass');
  assert.equal(bad.length, 1, 'exactly one element carries the failure');
  assert.equal(bad[0].el, 'availableCredits');
  assert.match(check.msg, /availableCredits/);
});

test('a status failure records no element rows', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'mtss');
  const run = p.startRun(sub, 'realistic');
  const check = p.runCheck(run, 'StudentIntervention/StudentInterventionAttendanceEvents', 1);
  assert.equal(check.kind, 'fail-status');
  assert.equal(check.observedStatus, 404);
  assert.deepEqual(check.elements, [], 'no body was returned, so nothing was asserted');
});

test('a task with no verification step cannot be checked', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  const result = p.runCheck(run, 'StudentAttendance/StudentSchoolAttendanceEvents', 3);
  assert.equal(result, null);
});

test('pass mode makes every check pass', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const run = p.startRun(sub, 'pass');
  assert.equal(p.runCheck(run, 'MasterSchedule/Sections', 4).st, 'pass');
});

test('the check records the scenario parameters in effect', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.scenarioOf(run, key).params = {schoolId: '255901107'};
  const check = p.runCheck(run, key, 1);
  assert.deepEqual(check.params, {schoolId: '255901107'});
  p.scenarioOf(run, key).params.schoolId = 'changed-later';
  assert.equal(check.params.schoolId, '255901107', 'the check keeps a snapshot');
});

test('an open run does not block the product', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  assert.equal(run.state, 'open');
  assert.equal(p.busyEnv(run.env), undefined, 'idle between checks');
});
