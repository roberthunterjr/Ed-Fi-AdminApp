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
