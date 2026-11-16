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

test('sealing freezes the run and re-executes nothing', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 1);
  const before = p.scenarioOf(run, key).tasks[0].check;
  p.sealRun(run);
  assert.equal(run.state, 'sealed');
  assert.ok(run.ended, 'records when it was sealed');
  assert.equal(p.scenarioOf(run, key).tasks[0].check, before, 'the check object is untouched');
  assert.equal(p.scenarioOf(run, key).tasks[1].check, null, 'unchecked stays unchecked');
});

test('a sealed run with only passing checks reports passed', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const run = p.startRun(sub, 'pass');
  p.runCheck(run, 'MasterSchedule/Sections', 1);
  p.sealRun(run);
  assert.equal(run.outcome, 'passed');
});

test('a sealed run with a failure reports failed', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 4);
  p.sealRun(run);
  assert.equal(run.outcome, 'failed');
});

test('a sealed run with no checks at all reports not-attempted', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  p.sealRun(run);
  assert.equal(run.outcome, 'not-attempted');
});

test('abandoning discards the accumulated checks', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 1);
  p.abandonRun(run);
  assert.equal(run.state, 'abandoned');
  assert.equal(run.results, null, 'checks are discarded');
});

test('an open run never satisfies the readiness gate', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const run = p.startRun(sub, 'pass');
  run.completeness = 'Complete';
  assert.equal(p.isQualifying(run), false, 'open is not finished');
  p.sealRun(run);
  assert.equal(p.isQualifying(run), true);
});

test('an abandoned run never qualifies however complete it was', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const run = p.startRun(sub, 'pass');
  run.completeness = 'Complete';
  p.abandonRun(run);
  assert.equal(p.isQualifying(run), false);
});

test('a sealed run stamped Complete qualifies even when its checks failed (D25)', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  run.completeness = 'Complete';
  p.runCheck(run, key, 4);
  p.sealRun(run);
  assert.equal(run.outcome, 'failed');
  assert.equal(p.isQualifying(run), true, 'the gate is a completeness check, not a quality check');
});

test('sealing and abandoning are one-way', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.sealRun(run);
  const ended = run.ended;
  p.sealRun(run);
  p.abandonRun(run);
  assert.equal(run.state, 'sealed', 'a sealed run cannot be re-sealed or abandoned');
  assert.equal(run.ended, ended);
});

test('a scenario declares the parameters its steps need', () => {
  const p = loadPrototype();
  const defs = p.scenarioParamDefs('MasterSchedule/Sections');
  const keys = defs.map(d => d.key);
  assert.ok(keys.includes('schoolId'));
  assert.ok(keys.includes('sectionIdentifier'));
  assert.ok(defs.every(d => d.label), 'every parameter has a human label');
});

test('parameters are complete only when all are supplied', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  const scen = p.scenarioOf(run, key);
  assert.equal(p.scenarioParamsComplete(scen), false, 'nothing supplied yet');
  p.scenarioParamDefs(key).forEach(d => { scen.params[d.key] = 'x'; });
  assert.equal(p.scenarioParamsComplete(scen), true);
  scen.params[p.scenarioParamDefs(key)[0].key] = '';
  assert.equal(p.scenarioParamsComplete(scen), false, 'blank is not supplied');
});

test('a scenario with no declared parameters is trivially complete', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  const scen = p.scenarioOf(run, 'DescriptorMapping/Mappings');
  assert.deepEqual(p.scenarioParamDefs('DescriptorMapping/Mappings'), []);
  assert.equal(p.scenarioParamsComplete(scen), true);
});

test('parameters are per scenario, not shared across them', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  p.scenarioOf(run, 'MasterSchedule/Sections').params.schoolId = '255901107';
  assert.equal(p.scenarioOf(run, 'Student/Students').params.schoolId, undefined);
});

test('every declared parameter key has a label', () => {
  const p = loadPrototype();
  for (const key of Object.keys(p.SCENARIO_PARAMS)){
    for (const d of p.scenarioParamDefs(key)){
      assert.notEqual(p.PARAM_LABELS[d.key], undefined, `${d.key} (in ${key}) has no label`);
    }
  }
});

test('every SCENARIO_PARAMS key names a real scenario', () => {
  const p = loadPrototype();
  const known = new Set(['sis', 'mtss'].flatMap(m => p.COLLECTION[m].map(s => s[0] + '/' + s[1])));
  for (const key of Object.keys(p.SCENARIO_PARAMS)){
    assert.ok(known.has(key), `${key} is not a scenario in the collection`);
  }
});

test('the panel lists every task, including unverified ones', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  const html = p.preparePanelHTML(run, 'StudentAttendance/StudentSchoolAttendanceEvents');
  assert.match(html, /Tardy/, 'task text is shown');
  assert.match(html, /no verification step/i, 'tasks 3 and 4 say so');
  assert.equal((html.match(/data-act="runcheck"/g) || []).length, 3,
    'only the three tasks with steps offer a check');
});

test('the panel shows prerequisites and load order', () => {
  const p = loadPrototype();
  const html = p.preparePanelHTML(openSisRun(p), 'MasterSchedule/Sections');
  assert.match(html, /Class Period/);
  assert.match(html, /Course Offering/);
  assert.match(html, /load order 12\s+of\s+45/, 'load order is shown');
});

test('an out-of-scope task offers no check', () => {
  const p = loadPrototype();
  const html = p.preparePanelHTML(openSisRun(p), 'MasterSchedule/BellSchedules');
  assert.match(html, /out of scope/i);
  assert.equal((html.match(/data-act="runcheck"/g) || []).length, 1,
    'only task 1 is in scope and asserted');
});

test('a checked task renders its result', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 4);
  const html = p.preparePanelHTML(run, key);
  assert.match(html, /Value not updated/, 'the failure kind is named');
  assert.match(html, /Re-check/, 'a checked task offers a re-check');
});

test('the panel renders a parameter field per declared parameter', () => {
  const p = loadPrototype();
  const html = p.preparePanelHTML(openSisRun(p), 'MasterSchedule/Sections');
  assert.equal((html.match(/data-act="setparam"/g) || []).length, 5);
  assert.match(html, /Section Identifier/);
});

test('checkAll stops at the first failure', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  const n = p.checkAll(run, key);
  assert.equal(n, 4, 'Sections fails on task 4, so all four are attempted');
  const scen = p.scenarioOf(run, key);
  assert.equal(scen.tasks[3].check.st, 'fail');
});

test('checkAll stops early when an earlier task fails', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  const n = p.checkAll(run, 'StudentGrade/Grades');
  assert.equal(n, 1, 'Grades fails on task 1, so nothing after it runs');
  const scen = p.scenarioOf(run, 'StudentGrade/Grades');
  assert.equal(scen.tasks[0].check.st, 'fail');
  assert.equal(scen.tasks[1].check, null, 'later tasks are left unattempted');
});

test('the panel refuses to render checks for a sealed run', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.sealRun(run);
  const html = p.preparePanelHTML(run, key);
  assert.match(html, /sealed/i);
  assert.equal((html.match(/data-act="runcheck"/g) || []).length, 0);
});

test('an attempt count is surfaced when a task took more than one try', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 1);
  p.runCheck(run, key, 1);
  assert.match(p.preparePanelHTML(run, key), /after 2 attempts/);
});

test('a repeatedly failing task says so', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 4);
  p.runCheck(run, key, 4);
  assert.match(p.preparePanelHTML(run, key), /still failing after 2 attempts/);
});

test('the run view hands over to the Prepare panel while a run is open', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.APP.prepare = {run: run.id, key};
  const html = p.brunoResultsHTML(run);
  assert.match(html, /data-act="runcheck"/, 'the panel took over the card');
  assert.match(html, /Back to all scenarios/);
});

test('a sealed run shows the scenario list, not the Prepare panel', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.sealRun(run);
  p.APP.prepare = {run: run.id, key};
  const html = p.brunoResultsHTML(run);
  assert.ok(!/data-act="runcheck"/.test(html), 'a sealed run offers no checks');
  assert.match(html, /data-act="openscenario"/, 'it offers View steps instead');
});

test('an open run offers Prepare on each scenario row', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  p.APP.prepare = null;
  const html = p.brunoResultsHTML(run);
  assert.equal((html.match(/data-act="openprepare"/g) || []).length, 45);
});

test('the reviewer sees sealed runs and not open ones by default', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const open = p.startRun(sub, 'realistic');
  assert.ok(!p.reviewerRuns(sub, false).some(r => r.id === open.id),
    'an open run is the vendor workspace');
  p.sealRun(open);
  assert.ok(p.reviewerRuns(sub, false).some(r => r.id === open.id),
    'sealing puts it in front of the reviewer');
});

test('the reviewer can opt into open runs', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const open = p.startRun(sub, 'realistic');
  assert.ok(p.reviewerRuns(sub, true).some(r => r.id === open.id));
});

test('abandoned runs never reach the reviewer', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const run = p.startRun(sub, 'realistic');
  p.abandonRun(run);
  assert.ok(!p.reviewerRuns(sub, true).some(r => r.id === run.id),
    'an abandoned run has no results to review');
});

test('run state badges name each state plainly', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const open = p.startRun(sub, 'realistic');
  assert.match(p.runStateBadge(open), /Open/);
  p.sealRun(open);
  assert.match(p.runStateBadge(open), /Sealed/);
  const gone = p.startRun(sub, 'realistic');
  p.abandonRun(gone);
  assert.match(p.runStateBadge(gone), /Abandoned/);
});

test('the seal summary states what is being sealed', () => {
  const p = loadPrototype();
  const {run, key} = sectionsRun(p);
  p.runCheck(run, key, 1);
  assert.equal(p.sealSummary(run), '1 of 45 scenarios checked, 44 not attempted');
});

test('the seal summary reads cleanly when everything was checked', () => {
  const p = loadPrototype();
  const run = openSisRun(p);
  p.COLLECTION.sis.forEach(([a, s]) => p.checkAll(run, a + '/' + s));
  assert.match(p.sealSummary(run), /45 of 45 scenarios checked$/);
});

test('an open run offers seal and abandon; a sealed one offers neither', () => {
  const p = loadPrototype();
  const {run} = sectionsRun(p);
  p.APP.prepare = null;
  const open = p.runResults(run.id);
  assert.match(open, /data-act="sealrun"/);
  assert.match(open, /data-act="abandonrun"/);
  p.sealRun(run);
  const sealed = p.runResults(run.id);
  assert.ok(!/data-act="sealrun"/.test(sealed), 'a sealed run cannot be re-sealed');
  assert.ok(!/data-act="abandonrun"/.test(sealed));
});

test('infra mode fails a check without reaching the API', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const run = p.startRun(sub, 'infra');
  const c = p.runCheck(run, 'MasterSchedule/Sections', 1);
  assert.equal(c.st, 'fail');
  assert.equal(c.kind, 'fail-infra');
  assert.deepEqual(c.elements, []);
  assert.match(c.msg, /could not reach/i);
});

test('auth mode fails a check with a 401', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const run = p.startRun(sub, 'auth');
  const c = p.runCheck(run, 'MasterSchedule/Sections', 1);
  assert.equal(c.kind, 'fail-auth');
  assert.equal(c.observedStatus, 401);
});

test('infra and auth failures are distinguishable from scenario failures (FR8)', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  const kinds = ['realistic', 'infra', 'auth'].map(mode => {
    const run = p.startRun(sub, mode);
    return p.runCheck(run, 'MasterSchedule/Sections', 4).kind;
  });
  assert.deepEqual(kinds, ['fail-unchanged', 'fail-infra', 'fail-auth']);
});

/* ---- mapping tool ---- */
test('normalizeType fixes typos and records the correction', () => {
  const p = loadPrototype();
  assert.deepEqual(p.normalizeType('Interger'), {type:'Integer', corrected:true});
  assert.deepEqual(p.normalizeType('integer'), {type:'Integer', corrected:false});
  assert.deepEqual(p.normalizeType('percentage'), {type:'Percent', corrected:true});
  assert.deepEqual(p.normalizeType('Widget'), {type:null, corrected:false});
});

test('resolveTargets splits workbook complete names and keeps unknown parts', () => {
  const p = loadPrototype();
  assert.deepEqual(p.resolveTargets('assessment.scores/studentAssessment.scoreResults'),
    {paths:['assessment.scores','studentAssessment.scoreResults'], unresolved:[]});
  assert.deepEqual(p.resolveTargets('assessments.assessment.id'),
    {paths:[], unresolved:['assessments.assessment.id']});
});

test('the v5 slice marks the required fields from the design', () => {
  const p = loadPrototype();
  const req = p.EDFI_V5_TARGETS.filter(t => t.required).map(t => t.path).sort();
  assert.deepEqual(req, ['assessment.academicSubjects','assessment.assessedGradeLevels',
    'assessment.assessmentIdentifier','assessment.assessmentTitle','assessment.namespace',
    'studentAssessment.administrationDate','studentAssessment.studentAssessmentIdentifier',
    'studentAssessment.studentReference']);
  assert.equal(p.targetByPath('studentAssessment.scoreResults').keyedBy,
    'AssessmentReportingMethodDescriptor');
});

test('parseWorkbook rejects a workbook missing tabs or headers', () => {
  const p = loadPrototype();
  const r = p.parseWorkbook(p.WORKBOOK_FIXTURES.malformed);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('Tab "ElementDefinitions" is missing.'));
  assert.ok(r.errors.includes('Tab "Product": expected column "Namespace".'));
});

test('parseWorkbook imports the vendor B workbook with visible corrections', () => {
  const p = loadPrototype();
  const {ok, doc, report} = p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb);
  assert.equal(ok, true);
  assert.equal(doc.product.namespace, 'uri://vendor-b.example.com/');
  assert.equal(doc.assessments.length, 2);
  const el = n => doc.elements.find(e => e.name === n);
  assert.equal(el('Annual Typical Growth Measure').type, 'Integer');
  assert.deepEqual(el('Annual Typical Growth Measure').importNote.corrections, ['Interger → Integer']);
  assert.deepEqual(el('AssessmentID').targets, []);
  assert.deepEqual(el('AssessmentID').importNote.unresolved, ['assessments.assessment.id']);
  assert.equal(el('Phonics Scale Score').objective, 'Phonics');
  assert.equal(el('Rush Flag').enumType, 'EventCircumstanceDescriptor');
  const scale = doc.bank.values.find(v => v.uri === 'uri://ed-fi.org/AssessmentReportingMethodDescriptor#Scale score');
  assert.equal(scale.enabled, true, 'referenced standard value is enabled by import');
  assert.ok(el('Scale Score').targets.every(t => t.entryKey === scale.id));
  assert.deepEqual(report.placeholders, ['PerformanceLevelDescriptor']);
  assert.ok(!doc.bank.values.some(v => v.code === 'CustomValue'));
  assert.ok(doc.bank.values.some(v => v.type === 'AccommodationDescriptor' && v.ns === 'vendor'));
});

test('emptyMappingDoc holds standard descriptors, all disabled', () => {
  const p = loadPrototype();
  const d = p.emptyMappingDoc();
  assert.ok(d.bank.values.length > 20);
  assert.ok(d.bank.values.every(v => v.ns === 'edfi' && v.enabled === false));
  assert.deepEqual(d.elements, []);
});

const vbDoc = p => p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb).doc;

test('bank: only enabled or vendor values are selectable, duplicates rejected', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const pct = d.bank.values.find(v => v.uri === 'uri://ed-fi.org/AssessmentReportingMethodDescriptor#Percentile');
  assert.ok(p.selectableValues(d, 'AssessmentReportingMethodDescriptor').includes(pct));
  const raw = d.bank.values.find(v => v.uri === 'uri://ed-fi.org/AssessmentReportingMethodDescriptor#Raw score');
  assert.ok(!p.selectableValues(d).includes(raw), 'disabled standard value is not selectable');
  const dup = p.addBankValue(d, {type:'EventCircumstanceDescriptor', code:'yellow rush flag', short:'', desc:''});
  assert.equal(dup.ok, false);
  assert.match(dup.error, /already exists/);
});

test('bank: a value in use cannot be disabled or removed', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const scale = d.bank.values.find(v => v.uri.endsWith('AssessmentReportingMethodDescriptor#Scale score'));
  const r = p.setStandardEnabled(d, scale.id, false);
  assert.equal(r.ok, false);
  assert.ok(r.blockedBy.includes('Scale Score'));
  const gain = d.bank.values.find(v => v.ns === 'vendor' && v.code === 'Diagnostic Gain');
  assert.equal(p.removeBankValue(d, gain.id).ok, false);
});

test('elements: many targets per element, and collection entries group by key', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const ela = d.assessments.find(a => a.type === 'ELA Diagnostic');
  const entries = p.collectionEntries(d, ela.id);
  const scaleRes = entries.find(e => e.collection === 'studentAssessment.scoreResults' &&
    e.objective === null && e.key.code === 'Scale score');
  assert.deepEqual(scaleRes.elements.map(e => e.name), ['Scale Score']);
  const el = p.addElement(d, {assessmentId:ela.id, name:'Raw Score', definition:'', type:'Level'});
  const lex = d.bank.values.find(v => v.uri.endsWith('#Raw score'));
  assert.equal(lex.enabled, false);
  assert.equal(p.addCollectionEntry(d, {assessmentId:ela.id, objective:null,
    collection:'studentAssessment.scoreResults', keyValueId:lex.id, elementId:el.id}).ok, false,
    'standard value must be enabled first');
  p.setStandardEnabled(d, lex.id, true);
  assert.equal(p.addCollectionEntry(d, {assessmentId:ela.id, objective:null,
    collection:'studentAssessment.scoreResults', keyValueId:lex.id, elementId:el.id}).ok, true);
  assert.equal(p.addTarget(d, el.id, 'assessment.scores', lex.id).ok, true);
  assert.equal(el.targets.length, 2);
  assert.equal(p.addTarget(d, el.id, 'no.such.path').ok, false);
});

test('removing an element keeps its notes as orphan notes', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const el = d.elements.find(e => e.name === 'Rush Flag');
  p.setElementField(d, el.id, 'notes', 'Yellow means possible rush.');
  p.removeElement(d, el.id);
  assert.deepEqual(d.orphanNotes, [{from:'Rush Flag', text:'Yellow means possible rush.'}]);
});

test('the clean workbook has no issues', () => {
  const p = loadPrototype();
  const {doc} = p.parseWorkbook(p.WORKBOOK_FIXTURES.clean);
  assert.deepEqual(p.computeIssues(doc), []);
});

test('coverage is per assessment and per reporting method', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const keys = p.computeIssues(d).map(i => i.key);
  for (const a of d.assessments){
    assert.ok(keys.includes(`unmapped:${a.id}:-:-:studentAssessment.administrationDate`), a.type);
    assert.ok(keys.includes(`unmapped:${a.id}:-:-:assessment.academicSubjects`), a.type);
  }
  const ela = d.assessments.find(a => a.type === 'ELA Diagnostic');
  const gain = d.bank.values.find(v => v.code === 'Diagnostic Gain');
  assert.ok(keys.includes(`unmapped:${ela.id}:-:${gain.id}:scores`),
    'Diagnostic Gain has a result but no assessment.scores definition');
  const scale = d.bank.values.find(v => v.uri.endsWith('AssessmentReportingMethodDescriptor#Scale score'));
  assert.ok(!keys.some(k => k.startsWith(`unmapped:${ela.id}:-:${scale.id}:`)), 'Scale Score is fully covered');
  assert.ok(!keys.includes(`unmapped:${ela.id}:-:-:assessment.assessmentIdentifier`), 'covered by the assessment row');
});

test('type, target, enumeration, placeholder and unused issues are raised', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const id = n => d.elements.find(e => e.name === n).id;
  const keys = p.computeIssues(d).map(i => i.key);
  assert.ok(keys.includes(`type-mismatch:${id('Placement Level')}:studentAssessment.scoreResults`));
  assert.ok(keys.includes(`type-mismatch:${id('Baseline Diagnostic (Y/N)')}:studentAssessment.scoreResults`));
  assert.ok(keys.includes(`needs-target:${id('AssessmentID')}`));
  assert.ok(keys.includes(`needs-target:${id('Diagnostic Language')}`), 'one of two parts unresolved');
  assert.ok(keys.includes('placeholder:PerformanceLevelDescriptor'));
  const acc = d.bank.values.find(v => v.type === 'AccommodationDescriptor');
  assert.ok(keys.includes(`unused-value:${acc.id}`));
  assert.ok(!keys.includes(`enum-empty:${id('Rush Flag')}`));
});

test('a note on a cleared issue moves to the element, tagged', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const el = d.elements.find(e => e.name === 'Placement Level');
  const key = `type-mismatch:${el.id}:studentAssessment.scoreResults`;
  d.issueNotes[key] = 'Placement is a label, not a number.';
  assert.deepEqual(p.issueSummary(p.computeIssues(d), d).explained, 1);
  p.setElementField(d, el.id, 'type', 'Level');
  p.reconcileNotes(d);
  assert.equal(d.issueNotes[key], undefined);
  assert.match(el.notes, /\[issue resolved\] Placement is a label, not a number\./);
});

const asmSub = p => p.APP.submissions.find(s => s.productId === 'p2');

test('opening the tool on an uploaded CSV parses it into a draft', () => {
  const p = loadPrototype(); const s = asmSub(p);
  const d = p.openMappingDraft(s);
  assert.equal(d.baseVersion, 1);
  assert.equal(d.doc.importReport.source, 'csv');
  assert.equal(d.dirty, false);
});

test('re-importing over a draft needs confirmation', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  s.mappingDraft.doc.elements[0].notes = 'keep me?';
  assert.deepEqual(p.importWorkbook(s, 'clean'), {needsConfirm:true});
  assert.equal(s.mappingDraft.doc.elements[0].notes, 'keep me?');
  assert.equal(p.importWorkbook(s, 'clean', {replace:true}).ok, true);
});

test('a malformed workbook leaves the draft untouched and is audited', () => {
  const p = loadPrototype(); const s = asmSub(p);
  const r = p.importWorkbook(s, 'malformed');
  assert.equal(r.ok, false);
  assert.equal(s.mappingDraft == null, true);
  assert.match(s.history[0].what, /import rejected/);
});

test('generating from a blank mapping is allowed and stales older runs', () => {
  const p = loadPrototype(); const s = asmSub(p);
  const old = p.APP.runs.find(r => r.submissionId === s.id && r.pinned.mapping === 1);
  p.startBlankMapping(s);
  const v = p.generateMapping(s);
  assert.equal(v.v, 2);
  assert.equal(v.source, 'tool');
  assert.ok(v.issues.some(i => i.key === 'unmapped:-:-:-:assessments'), 'empty mapping is flagged, not blocked');
  assert.equal(p.isStale(s, old), true);
  assert.equal(s.mappingDraft.dirty, false);
  assert.match(s.history[0].what, /Mapping generated in mapping tool: Vendor mapping CSV v2/);
});

test('the reviewer-side seed carries 4 issues, 3 explained', () => {
  const p = loadPrototype();
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  const cur = p.currentVersion(f2, 'mapping');
  assert.equal(cur.source, 'tool');
  assert.deepEqual(cur.summary, {total:4, explained:3});
  assert.match(p.mappingIssueBadge(cur), /4 issues · 3 explained/);
});

test('the mapping row offers the tool only for Assessments', () => {
  const p = loadPrototype();
  const asm = p.artifactCard(asmSub(p), false);
  assert.match(asm, /data-act="mapopen"/);
  assert.match(asm, /Replace CSV/);
  const sis = p.artifactCard(p.APP.submissions.find(s => s.productId === 'p1'), false);
  assert.doesNotMatch(sis, /data-act="map/);
  const mtss = p.artifactCard(p.APP.submissions.find(s => s.productId === 'p3'), false);
  assert.doesNotMatch(mtss, /mapimport/);
});

test('an Assessments submission with no mapping offers import first', () => {
  const p = loadPrototype();
  const s = p.startCertification('p7', 'assessments');
  const html = p.artifactCard(s, false);
  assert.match(html, /data-act="mapimport"[^>]*>Import workbook/);
  assert.match(html, /data-act="mapblank"/);
  assert.match(html, /Upload CSV/);
});

test('a reviewer sees the issue badge and a read-only view action', () => {
  const p = loadPrototype();
  const html = p.artifactCard(p.APP.submissions.find(s => s.productId === 'p5'), true);
  assert.match(html, /4 issues · 3 explained/);
  assert.match(html, /data-act="mapview"/);
  assert.doesNotMatch(html, /mapimport|mapopen/);
});

test('the import modal labels its simulate switch as prototype-only', () => {
  const p = loadPrototype(); const s = asmSub(p);
  const {body, footer} = p.importModalHTML(s);
  assert.match(body, /Simulate \(prototype only/);
  for (const v of ['clean','vendorb','malformed']) assert.match(body, new RegExp(`name="mapsim" value="${v}"`));
  assert.match(footer, /data-act="mapimportconfirm"/);
  p.openMappingDraft(s);
  assert.match(p.importModalHTML(s).body, /replaces your current draft, including its notes/);
});

test('the import summary shows the counts', () => {
  const p = loadPrototype(); const s = asmSub(p);
  const r = p.importWorkbook(s, 'vendorb');
  const html = p.importSummaryHTML(s, r.report).body;
  assert.match(html, /need a target/);
  assert.match(html, /PerformanceLevelDescriptor/);
});

test('the mapping route resolves for both personas', () => {
  const p = loadPrototype();
  assert.match(p.vendorScreen({name:'mapping', args:[asmSub(p).id]}), /Mapping tool/);
  p.APP.persona = 'reviewer';
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  assert.match(p.reviewerScreen({name:'mapping', args:[f2.id]}), /Mapping tool/);
});
