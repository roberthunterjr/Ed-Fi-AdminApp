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
  for (const a of d.assessments)
    assert.ok(keys.includes(`unmapped:${a.id}:-:-:assessment.academicSubjects`), a.type);
  const ela = d.assessments.find(a => a.type === 'ELA Diagnostic');
  const math = d.assessments.find(a => a.type === 'Math Diagnostic');
  assert.ok(keys.includes(`unmapped:${math.id}:-:-:studentAssessment.administrationDate`), 'Math has no Date element');
  assert.ok(!keys.includes(`unmapped:${ela.id}:-:-:studentAssessment.administrationDate`), 'ELA maps Date');
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
  assert.ok(!keys.some(k => k.startsWith(`type-mismatch:${id('Placement Level')}:`)), 'String reported as Level is valid');
  assert.ok(!keys.some(k => k.startsWith(`type-mismatch:${id('Relative Placement')}:`)), 'String reported as Level is valid');
  assert.ok(keys.includes(`datatype-unverified:${id('Baseline Diagnostic (Y/N)')}:studentAssessment.scoreResults`),
    'vendor-defined Boolean datatype on an Enumeration element is flagged for the reviewer');
  assert.ok(keys.includes(`needs-target:${id('AssessmentID')}`));
  assert.ok(keys.includes(`needs-target:${id('Diagnostic Language')}`), 'one of two parts unresolved');
  assert.ok(keys.includes('placeholder:PerformanceLevelDescriptor'));
  const quantile = d.bank.values.find(v => v.code === 'Quantile Range');
  assert.ok(keys.includes(`unused-value:${quantile.id}`), 'no element reports a Quantile Range');
  assert.ok(!keys.includes(`enum-empty:${id('Rush Flag')}`));
});

test('a note on a cleared issue moves to the element, tagged', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const el = d.elements.find(e => e.name === 'Placement Level');
  const idx = el.targets.findIndex(t => t.path === 'studentAssessment.scoreResults');
  const dt = c => d.bank.values.find(v => v.uri === 'uri://ed-fi.org/ResultDatatypeTypeDescriptor#' + c);
  p.setStandardEnabled(d, dt('Integer').id, true);
  p.setTargetDatatype(d, el.id, idx, dt('Integer').id);
  const key = `type-mismatch:${el.id}:studentAssessment.scoreResults`;
  assert.ok(p.computeIssues(d).some(i => i.key === key), 'String reported as Integer is a mismatch');
  d.issueNotes[key] = 'Placement is a label, not a number.';
  assert.deepEqual(p.issueSummary(p.computeIssues(d), d).explained, 1);
  p.setTargetDatatype(d, el.id, idx, dt('Level').id);
  p.reconcileNotes(d);
  assert.equal(d.issueNotes[key], undefined);
  assert.match(el.notes, /\[issue resolved\] Placement is a label, not a number\./);
});

const asmSub = p => p.APP.submissions.find(s => s.productId === 'p2');

test('opening the tool on an uploaded CSV parses it into a draft', () => {
  const p = loadPrototype(); const s = asmSub(p);
  s.artifacts.mapping.pop();   /* the seed's v2 came from the tool; v1 is the uploaded CSV */
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
  assert.equal(v.v, 3, 'the seed already has v1 (uploaded) and v2 (tool)');
  assert.equal(v.source, 'tool');
  assert.ok(v.issues.some(i => i.key === 'unmapped:-:-:-:assessments'), 'empty mapping is flagged, not blocked');
  assert.equal(p.isStale(s, old), true);
  assert.equal(s.mappingDraft.dirty, false);
  assert.match(s.history[0].what, /Mapping generated in mapping tool: Vendor mapping CSV v3/);
});

test('the reviewer-side seed carries 4 issues, 3 explained', () => {
  const p = loadPrototype();
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  const cur = f2.artifacts.mapping[2];   /* v3; the run-scope seed adds v4 on top */
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
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  const {total, explained} = p.currentVersion(f2, 'mapping').summary;
  assert.ok(explained > 0 && explained < total, 'the seed shows explained and unexplained issues');
  const html = p.artifactCard(f2, true);
  assert.match(html, new RegExp(total + ' issues · ' + explained + ' explained'));
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

test('the elements tab shows multiple target chips and an add-target control', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  const html = p.mappingScreen(s.id, 'elements', false);
  assert.match(html, /studentAssessment\.scoreResults/);
  assert.match(html, /data-act="mapaddtarget"/);
  assert.match(html, /Interger → Integer/);
});

test('the collections tab lists keyed entries with their coverage', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  const html = p.mappingScreen(s.id, 'collections', false);
  assert.match(html, /Diagnostic Gain/);
  assert.match(html, /data-act="mapaddentry"/);
});

test('read-only rendering has no edit controls', () => {
  const p = loadPrototype();
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  for (const tab of ['product','bank','elements','collections','checks','issues']){
    const html = p.mappingScreen(f2.id, tab, true);
    assert.doesNotMatch(html, /data-act="map(add|rm|set|toggle|notes)/, tab);
  }
});

test('the bank starts with standard values switched off', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.startBlankMapping(s);
  const html = p.mappingScreen(s.id, 'bank', false);
  assert.match(html, /data-act="maptoggle"/);
  assert.match(html, /Unsaved changes/);
});

test('the checks tab groups coverage by assessment and reporting method', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  const html = p.mappingScreen(s.id, 'checks', false);
  assert.match(html, /Vendor B ELA Diagnostic/);
  assert.match(html, /Phonics/);
  assert.match(html, /Unmapped/);
});

test('a vendor with no draft and no version gets the import choices', () => {
  const p = loadPrototype();
  const s = p.startCertification('p7', 'assessments');
  assert.match(p.mappingScreen(s.id, 'elements', false), /data-act="mapimport"/);
});

test('the reviewer sees the generated version, not the vendor draft', () => {
  const p = loadPrototype();
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  f2.mappingDraft = {doc:p.emptyMappingDoc(), baseVersion:3, dirty:true};
  f2.mappingDraft.doc.product.name = 'DRAFT ONLY';
  const html = p.mappingScreen(f2.id, 'issues', true);
  assert.doesNotMatch(html, /DRAFT ONLY/);
  assert.match(html, /Unexplained/);
  assert.match(html, />Explained</);
});

test('issue notes are shown to the reviewer inline', () => {
  const p = loadPrototype();
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  const cur = p.currentVersion(f2, 'mapping');
  const html = p.mappingScreen(f2.id, 'issues', true);
  for (const note of Object.values(cur.doc.issueNotes)) assert.ok(html.includes(p.esc(note)), note);
  assert.match(html, /No note from vendor/);
  assert.match(html, /Required fields not mapped/);
});

test('the vendor issues tab offers a note box per issue', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  const html = p.mappingScreen(s.id, 'issues', false);
  assert.match(html, /data-act="mapissuenote"[^>]*data-key="unmapped:/);
});

test('generate modal never disables confirm', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  const {body, footer} = p.generateModalHTML(s);
  assert.match(footer, /data-act="mapgenerateconfirm"/);
  assert.doesNotMatch(footer, /disabled/);
  assert.match(body, /D27/);
  assert.match(body, /Unexplained/);
  assert.match(body, /will be marked stale/);
});

/* ---- final-review fixes ---- */
test('editor actions stay on the mapping page', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  p.location.hash = '#/mapping/' + s.id + '/bank';
  const raw = s.mappingDraft.doc.bank.values.find(v => v.uri.endsWith('#Raw score'));
  p.handleAction('maptoggle', s, {dataset:{act:'maptoggle', sub:s.id, val:raw.id}, checked:true, value:'on'});
  assert.equal(raw.enabled, true);
  assert.equal(p.location.hash, '#/mapping/' + s.id + '/bank');
});

test('typing a note does not re-render and swallow the next click', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  const el = s.mappingDraft.doc.elements[0];
  p.$('#main').innerHTML = 'SENTINEL';
  p.handleAction('mapnotes', s, {dataset:{act:'mapnotes', sub:s.id, el:el.id}, value:'From the SIS.'});
  assert.equal(el.notes, 'From the SIS.');
  assert.equal(s.mappingDraft.dirty, true);
  assert.equal(p.$('#main').innerHTML, 'SENTINEL');
});

test('replacing the CSV discards the mapping draft, with a warning and an audit entry', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  /* modal() writes the overlay, then binds via a DOM stub that returns null — the markup is what we check */
  try { p.uploadModal(s, 'mapping'); } catch { /* stub DOM */ }
  assert.match(p.$('#overlay').innerHTML, /discards your mapping-tool draft/);
  p.uploadArtifact(s, 'mapping', 'vendorb-assessments-mapping-v3.csv', false);
  assert.equal(s.mappingDraft, null);
  assert.ok(s.history.some(h => /Mapping tool draft discarded/.test(h.what)));
  assert.equal(p.openMappingDraft(s).baseVersion, 3);
});

test('a collection entry key must match the descriptor the collection is keyed by', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const ela = d.assessments.find(a => a.type === 'ELA Diagnostic');
  const eng = d.bank.values.find(v => v.uri.endsWith('LanguageDescriptor#English'));
  p.setStandardEnabled(d, eng.id, true);
  const el = d.elements.find(e => e.name === 'Scale Score');
  const r = p.addCollectionEntry(d, {assessmentId:ela.id, objective:null, collection:'assessment.scores',
    keyValueId:eng.id, elementId:el.id});
  assert.equal(r.ok, false);
  assert.match(r.error, /keyed by AssessmentReportingMethodDescriptor/);
});

/* ---- per-target result datatype ---- */
const dtVal = (d, ns, code) => d.bank.values.find(v => v.type === 'ResultDatatypeTypeDescriptor' &&
  v.ns === ns && v.code === code);

test('import reads the result datatype from column H onto every score target', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const el = n => d.elements.find(e => e.name === n);
  const level = dtVal(d, 'edfi', 'Level');
  assert.equal(level.enabled, true, 'referenced standard datatype is enabled by import');
  assert.ok(el('Relative Placement').targets.every(t => t.datatype === level.id));
  const bool = dtVal(d, 'vendor', 'Boolean');
  assert.ok(bool, 'vendor-defined datatype is in the bank');
  assert.ok(el('Baseline Diagnostic (Y/N)').targets.every(t => t.datatype === bool.id));
  assert.ok(el('Rush Flag').targets.every(t => t.datatype == null), 'non-score targets carry no datatype');
});

test('each score target keeps its own datatype', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const el = d.elements.find(e => e.name === 'Duration (minutes)');
  const dec = dtVal(d, 'edfi', 'Decimal');
  p.setStandardEnabled(d, dec.id, true);
  p.setTargetDatatype(d, el.id, 0, dec.id);
  assert.equal(el.targets[0].datatype, dec.id);
  assert.notEqual(el.targets[1].datatype, dec.id, 'the other target is unchanged');
});

test('vendor type is checked against each target datatype', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  assert.deepEqual(p.DATATYPE_FIT.String, ['Level']);
  assert.deepEqual(p.DATATYPE_FIT.Integer, ['Integer','Decimal']);
  const el = d.elements.find(e => e.name === 'Duration (minutes)');
  const pct = dtVal(d, 'edfi', 'Percentage');
  p.setStandardEnabled(d, pct.id, true);
  p.setTargetDatatype(d, el.id, 1, pct.id);
  const keys = p.computeIssues(d).map(i => i.key);
  assert.ok(keys.includes(`type-mismatch:${el.id}:${el.targets[1].path}`));
});

test('a score target without a datatype is flagged', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const ela = d.assessments.find(a => a.type === 'ELA Diagnostic');
  const el = p.addElement(d, {assessmentId:ela.id, name:'Raw Points', type:'Integer'});
  const raw = d.bank.values.find(v => v.uri.endsWith('AssessmentReportingMethodDescriptor#Raw score'));
  p.setStandardEnabled(d, raw.id, true);
  p.addTarget(d, el.id, 'studentAssessment.scoreResults', raw.id);
  const issues = p.computeIssues(d);
  assert.ok(issues.some(i => i.key === `datatype-missing:${el.id}:studentAssessment.scoreResults`));
  assert.ok(issues.some(i => i.key === `unmapped:${ela.id}:-:${raw.id}:scoreResults.resultDatatypeType`),
    'coverage needs the scoreResults datatype');
});

test('scores and scoreResults disagreeing on datatype is flagged, not blocked', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const ela = d.assessments.find(a => a.type === 'ELA Diagnostic');
  const el = d.elements.find(e => e.name === 'Duration (minutes)');
  const dec = dtVal(d, 'edfi', 'Decimal');
  p.setStandardEnabled(d, dec.id, true);
  p.setTargetDatatype(d, el.id, 0, dec.id);
  const rm = el.targets[0].entryKey;
  assert.ok(p.computeIssues(d).some(i => i.key === `datatype-conflict:${ela.id}:-:${rm}`));
});

test('a datatype in use cannot be switched off', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const r = p.setStandardEnabled(d, dtVal(d, 'edfi', 'Level').id, false);
  assert.equal(r.ok, false);
  assert.ok(r.blockedBy.includes('Relative Placement'));
});

test('the collections tab can set an entry datatype for every target in it', () => {
  const p = loadPrototype(); const d = vbDoc(p);
  const ela = d.assessments.find(a => a.type === 'ELA Diagnostic');
  const el = d.elements.find(e => e.name === 'Duration (minutes)');
  const dec = dtVal(d, 'edfi', 'Decimal');
  p.setStandardEnabled(d, dec.id, true);
  p.setEntryDatatype(d, {assessmentId:ela.id, objective:null, collection:'studentAssessment.scoreResults',
    keyValueId:el.targets[1].entryKey, datatype:dec.id});
  assert.equal(el.targets[1].datatype, dec.id);
  const entry = p.collectionEntries(d, ela.id).find(e => e.collection === 'studentAssessment.scoreResults' &&
    e.key.id === el.targets[1].entryKey);
  assert.deepEqual(entry.datatypes.map(v => v.code), ['Decimal']);
});

test('the elements and collections tabs show datatype controls', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  assert.match(p.mappingScreen(s.id, 'elements', false), /data-act="mapsetdtype"/);
  const coll = p.mappingScreen(s.id, 'collections', false);
  assert.match(coll, /data-act="mapsetentrydtype"/);
  assert.match(coll, /id="mapEntDt-/);
  const f2 = p.APP.submissions.find(x => x.productId === 'p5');
  assert.match(p.mappingScreen(f2.id, 'elements', true), /Integer/);
});

/* ---------- run scope (docs/design/2026-11-17-assessment-run-scope-design.md) ---------- */
/* Submission ids are generated, so seeded submissions are found by product:
   s2 is product p2 (Vendor B Assessments), f2 is p5 (Northwind, In Review). */
const byProduct = (p, productId) => p.APP.submissions.find(s => s.productId === productId);

test('embedded ELA sample is anonymized and complete', () => {
  const p = loadPrototype(), s = p.SAMPLE_ELA;
  assert.equal(s.rows.length, 156);
  assert.equal(s.columns.length, 80);
  const t = p.sampleCol(s, 'Class Teacher(s)'), a = p.sampleCol(s, 'Activity Id');
  assert.ok(s.rows.every(r => r[t] === ''), 'teacher names blanked');
  assert.equal(s.rows[0][a], 'VB-ACT-0001');
  assert.equal(new Set(s.rows.map(r => r[a])).size, 156);
  assert.equal(s.rows[0][p.sampleCol(s, 'Student ID')], 'EdFiCertificationStudent1');
  assert.equal(p.sampleCol(s, 'Nope'), -1);
});

test('vendorb fixture carries all 42 ELA elements and the new slice targets', () => {
  const p = loadPrototype();
  const doc = p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb).doc;
  const ela = doc.assessments.find(a => a.identifier === 'VENDORB-DIAGNOSTIC-ELA');
  assert.equal(doc.elements.filter(e => e.assessmentId === ela.id).length, 42);
  assert.equal(p.objectivesOf(doc, ela.id).length, 7);
  assert.ok(doc.elements.find(e => e.name === 'Read Aloud').targets
    .some(t => t.path === 'studentAssessment.accommodations'));
  assert.ok(p.STANDARD_DESCRIPTORS.find(d => d.type === 'GradeLevelDescriptor').values
    .some(v => v.code === 'Twelfth grade'));
});
test('exact-name columns are suggested, not bound, until confirmed', () => {
  const p = loadPrototype();
  const doc = p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb).doc;
  const ela = doc.assessments.find(a => a.identifier === 'VENDORB-DIAGNOSTIC-ELA');
  p.suggestSampleColumns(doc, ela.id, p.SAMPLE_ELA.columns);
  const el = n => doc.elements.find(e => e.assessmentId === ela.id && e.name === n);
  assert.deepEqual(el('Phonics Scale Score').sampleColumn, {name:'Phonics Scale Score', confirmed:false});
  assert.equal(el('Scale Score').sampleColumn, null);
  assert.equal(el('Duration (minutes)').sampleColumn, null);
  p.confirmAllSuggestions(doc, ela.id);
  assert.equal(el('Phonics Scale Score').sampleColumn.confirmed, true);
});
test('translation kinds follow the target, not the element type', () => {
  const p = loadPrototype();
  const doc = p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb).doc;
  const el = n => doc.elements.find(e => e.name === n);
  assert.deepEqual(p.translationKinds(doc, el('Baseline Diagnostic (Y/N)')), ['result']);
  assert.deepEqual(p.translationKinds(doc, el('Rush Flag')), ['descriptor']);
  assert.equal(p.setDateFormat(doc, el('Date').id, 'DD.MM.YYYY').ok, false);
});

test('untranslated values and missing columns are flagged only when a sample exists', () => {
  const p = loadPrototype();
  const doc = p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb).doc;
  const rush = doc.elements.find(e => e.name === 'Rush Flag');
  p.setSampleColumn(doc, rush.id, 'Rush Flag');
  const none = p.computeIssues(doc);
  assert.ok(!none.some(i => i.kind === 'untranslated' || i.kind === 'no-sample-column'));
  const sample = Object.assign({v:1, assessment:'VENDORB-DIAGNOSTIC-ELA'}, p.SAMPLE_ELA);
  const issues = p.computeIssues(doc, {'VENDORB-DIAGNOSTIC-ELA': sample});
  assert.equal(issues.filter(i => i.kind === 'untranslated' && i.elementId === rush.id).length, 2);
  assert.ok(issues.some(i => i.kind === 'no-sample-column'));
  assert.ok(issues.some(i => i.kind === 'objective-code'));
});
test('a bound column missing from a new sample version raises No sample column', () => {
  const p = loadPrototype();
  const doc = p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb).doc;
  const el = doc.elements.find(e => e.name === 'Percentile');
  p.setSampleColumn(doc, el.id, 'Percentile');
  const s = {v:2, assessment:'VENDORB-DIAGNOSTIC-ELA', name:'x.csv', columns:['Student ID'], rows:[['A']]};
  assert.ok(p.computeIssues(doc, {'VENDORB-DIAGNOSTIC-ELA': s})
    .some(i => i.kind === 'no-sample-column' && i.elementId === el.id));
});
test('dates parse under the chosen format and flag misfits', () => {
  const p = loadPrototype();
  assert.equal(p.parseSampleDate('9/1/24', 'M/D/YY'), '2024-09-01');
  assert.equal(p.parseSampleDate('2024-09-01', 'M/D/YY'), null);
});

test('assessments sample data is one slot per mapped assessment', () => {
  const p = loadPrototype();
  const sub = byProduct(p, 'p2');
  const slots = p.sampleSlots(sub);
  assert.deepEqual(slots.map(s => s.identifier), ['VENDORB-DIAGNOSTIC-ELA', 'VENDORB-DIAGNOSTIC-MATH']);
  assert.ok(p.gate(sub).missing.some(a => a.label === 'Sample data — Vendor B Math Diagnostic'));
  p.uploadArtifact(sub, 'sample', 'math.csv', false, 'VENDORB-DIAGNOSTIC-MATH');
  assert.ok(!p.gate(sub).missing.some(a => /^Sample data/.test(a.label)));
});
test('replacing one slot stales runs pinned to it', () => {
  const p = loadPrototype();
  const sub = byProduct(p, 'p2');
  const r = p.startRun(sub, 'pass');
  assert.equal(typeof r.pinned.sample, 'object');
  assert.equal(p.isStale(sub, r), false);
  p.uploadArtifact(sub, 'sample', 'ela-v2.csv', false, 'VENDORB-DIAGNOSTIC-ELA');
  assert.equal(p.isStale(sub, r), true);
});
test('SIS sample data is unchanged', () => {
  const p = loadPrototype();
  const sub = p.APP.submissions.find(s => s.model === 'sis');
  assert.equal(typeof p.startRun(sub, 'pass').pinned.sample, 'number');
});
test('a simulated sample upload gets its own copy of the rows', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.uploadArtifact(sub, 'sample', 'ela-v2.csv', false, 'VENDORB-DIAGNOSTIC-ELA');
  p.currentSample(sub, 'VENDORB-DIAGNOSTIC-ELA').rows.splice(10);
  assert.equal(p.SAMPLE_ELA.rows.length, 156);
});

/* The demo mapping as the vendor would leave it: columns bound, values
   translated (except Read Aloud's "…and Passages"), objective codes entered. */
function demo(p){
  const doc = p.buildDemoMapping({name:'Vendor B Diagnostic', namespace:'uri://vendor-b.example.com/', idPrefix:'VENDORB'});
  const ela = doc.assessments.find(a => a.identifier === 'VENDORB-DIAGNOSTIC-ELA');
  const sample = Object.assign({v:1, assessment:ela.identifier}, p.SAMPLE_ELA);
  return {doc, ela, sample};
}
test('coverage selects 12 rows from the ELA sample, starting with Student3', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const rows = p.selectRows(doc, ela, sample);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].key.studentId, 'EdFiCertificationStudent3');
  assert.ok(rows[0].covers.length > 0);
  assert.deepEqual(p.selectRows(doc, ela, sample), rows, 'deterministic');
});
test('expected payload translates values and omits blanks', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const i = sample.rows.findIndex(r => r[p.sampleCol(sample, 'Rush Flag')] === 'Red Rush Flag');
  const {payload} = p.expectedStudentAssessment(doc, ela, sample, i);
  assert.match(payload.eventCircumstanceDescriptor, /EventCircumstanceDescriptor#Red Rush Flag$/);
  assert.equal(payload.administrationDate, '2024-09-01');
  assert.equal(payload.studentReference.studentUniqueId, sample.rows[i][2]);
  const j = sample.rows.findIndex(r => r[p.sampleCol(sample, 'Rush Flag')] === '');
  assert.ok(!('eventCircumstanceDescriptor' in p.expectedStudentAssessment(doc, ela, sample, j).payload));
});
test('an untranslated value is reported as cannot-check, not guessed', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const i = sample.rows.findIndex(r => /Passages/.test(r[p.sampleCol(sample, 'Read Aloud')]));
  const {payload, cannot} = p.expectedStudentAssessment(doc, ela, sample, i);
  assert.ok(cannot.some(c => /accommodations/.test(c.path) && c.reason === 'untranslated'));
  assert.ok(!payload.accommodations || !payload.accommodations.length);
});
test('objective scores nest under studentObjectiveAssessments keyed by code', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const {payload} = p.expectedStudentAssessment(doc, ela, sample, 0);
  const ph = payload.studentObjectiveAssessments.find(o => o.objectiveAssessmentReference.identificationCode === 'VENDORB-ELA-PH');
  assert.ok(ph, 'Phonics objective present');
  assert.ok(ph.scoreResults.some(s => /#Scale score$/.test(s.assessmentReportingMethodDescriptor) && s.result === sample.rows[0][p.sampleCol(sample, 'Phonics Scale Score')]));
  assert.equal(p.expectedObjectives(doc, ela).length, 7);
  assert.equal(p.expectedAssessment(doc, ela).assessmentIdentifier, 'VENDORB-DIAGNOSTIC-ELA');
});
test('endpoints derive from the mapping', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const eps = p.deriveEndpoints(doc, {[ela.identifier]: sample});
  const ids = eps.map(e => e.id);
  ['assessments','objectiveAssessments','studentAssessments','eventCircumstanceDescriptors','accommodationDescriptors']
    .forEach(id => assert.ok(ids.includes(id), id));
  assert.equal(eps.find(e => e.id === 'studentAssessments').recordCount, 12);
  assert.ok(p.unmappedColumns(doc, ela, sample).includes('Overall Placement For Families'));
  assert.ok(!p.unmappedColumns(doc, ela, sample).includes('Phonics Scale Score'));
});

test('excluding an endpoint needs a reason, is audited and stales earlier runs', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const r = p.startRun(sub, 'pass');
  assert.deepEqual(p.setEndpointIncluded(sub, 'accommodationDescriptors', false, ''),
    {ok:false, error:'A reason is required.'});
  assert.equal(p.setEndpointIncluded(sub, 'accommodationDescriptors', false, 'Loaded by district').ok, true);
  assert.equal(p.effectiveScope(sub).endpoints.find(e => e.id === 'accommodationDescriptors').on, false);
  assert.match(sub.history[0].what, /accommodationDescriptors.*Loaded by district/);
  assert.equal(p.isStale(sub, r), true);
});
test('a row adjustment whose row leaves the sample is shown as an orphan', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const key = {studentId:'EdFiCertificationStudent99', activityId:'VB-ACT-0099'};
  assert.equal(p.addScopeRow(sub, 'VENDORB-DIAGNOSTIC-ELA', key, '').ok, false);
  p.addScopeRow(sub, 'VENDORB-DIAGNOSTIC-ELA', key, 'Spot check');
  assert.ok(p.effectiveScope(sub).rows['VENDORB-DIAGNOSTIC-ELA'].some(r => r.key.studentId === key.studentId && r.source === 'reviewer'));
  p.uploadArtifact(sub, 'sample', 'ela-small.csv', false, 'VENDORB-DIAGNOSTIC-ELA');
  p.currentSample(sub, 'VENDORB-DIAGNOSTIC-ELA').rows.splice(50);   /* drop row 99 */
  const s = p.effectiveScope(sub);
  assert.ok(s.orphans.some(o => o.key.studentId === 'EdFiCertificationStudent99'));
  assert.ok(!s.rows['VENDORB-DIAGNOSTIC-ELA'].some(r => r.key.studentId === 'EdFiCertificationStudent99'));
});
test('removing a coverage row needs a reason and undo restores it', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const first = p.effectiveScope(sub).rows['VENDORB-DIAGNOSTIC-ELA'][0];
  assert.equal(p.removeScopeRow(sub, 'VENDORB-DIAGNOSTIC-ELA', first.key, 'Duplicate of another case').ok, true);
  assert.ok(!p.effectiveScope(sub).rows['VENDORB-DIAGNOSTIC-ELA'].some(r => r.key.studentId === first.key.studentId));
  p.undoScopeRow(sub, 'VENDORB-DIAGNOSTIC-ELA', first.key);
  assert.ok(p.effectiveScope(sub).rows['VENDORB-DIAGNOSTIC-ELA'].some(r => r.key.studentId === first.key.studentId));
});
test('an endpoint that drops out and returns comes back on', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.setEndpointIncluded(sub, 'accommodationDescriptors', false, 'x');
  const draft = p.openMappingDraft(sub);
  const ra = draft.doc.elements.find(e => e.name === 'Read Aloud');
  const keep = ra.targets; ra.targets = [];
  p.generateMapping(sub);
  assert.ok(!p.effectiveScope(sub).endpoints.some(e => e.id === 'accommodationDescriptors'));
  ra.targets = keep; p.generateMapping(sub);
  assert.equal(p.effectiveScope(sub).endpoints.find(e => e.id === 'accommodationDescriptors').on, true);
});

const allFields = res => res.endpoints.flatMap(e => e.records.flatMap(r => r.fields));
test('realistic run surfaces each new kind and cannot-check never fails a run', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const res = p.runAssessmentChecks(sub, p.effectiveScope(sub), 'realistic');
  const sts = allFields(res).map(f => f.st);
  ['fail-value','fail-notfound','fail-missing','fail-notloaded','cannot'].forEach(k => assert.ok(sts.includes(k), k));
  const t = p.resultTally(p.runAssessmentChecks(sub, p.effectiveScope(sub), 'pass'));
  assert.equal(t.fail, 0);
  assert.ok(t.cannot > 0, 'untranslated Passages value is cannot-check');
  assert.ok(t.pass > 0);
});
test('harmless formatting differences pass after normalization', () => {
  const p = loadPrototype();
  assert.equal(p.compareValue('Date', '2024-09-01', '2024-09-01T00:00:00Z').st, 'pass');
  assert.equal(p.compareValue('Decimal', '800', '800.0').st, 'pass');
  assert.equal(p.compareValue('String', 'ELA', 'ELA ').st, 'pass');
  assert.equal(p.compareValue('Integer', '40', 'forty').st, 'fail-type');
  assert.equal(p.compareValue('Integer', '470', '471').st, 'fail-value');
  assert.equal(p.compareValue('Descriptor', 'uri://ed-fi.org/GradeLevelDescriptor#First grade',
    'uri://ed-fi.org/GradeLevelDescriptor#first Grade').st, 'pass');
  assert.equal(p.compareValue('Descriptor', 'uri://ed-fi.org/GradeLevelDescriptor#First grade',
    'uri://vendor-b.example.com/GradeLevelDescriptor#First grade').st, 'fail-descriptor');
});
test('an assessment with no sample is cannot-check, not a failure', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const res = p.runAssessmentChecks(sub, p.effectiveScope(sub), 'pass');
  const st = res.endpoints.find(e => e.id === 'studentAssessments');
  const rec = st.records.find(r => r.label === 'No sample data for this assessment');
  assert.ok(rec && rec.fields.every(f => f.st === 'cannot'));
});
test('excluding studentAssessments marks rows excluded and fails nothing', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.setEndpointIncluded(sub, 'studentAssessments', false, 'Reviewing assessment metadata only');
  const res = p.runAssessmentChecks(sub, p.effectiveScope(sub), 'realistic');
  const st = res.endpoints.find(e => e.id === 'studentAssessments');
  assert.ok(st.excluded && st.records.every(r => r.fields.every(f => f.st === 'excluded')));
  assert.ok(p.resultTally(res).excluded > 0);
});
test('a finished run is computed from its pinned scope and passes despite cannot-check', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const r = p.startRun(sub, 'pass');
  p.finishRun(r);
  assert.equal(r.outcome, 'passed');
  assert.ok(p.resultTally(r.results).cannot > 0);
  assert.throws(() => p.ASSESSMENT_RESULTS, ReferenceError, 'the fixed fixture is gone');
});

test('s2 seed: mapping v2 from the tool, ELA sample only, Passages untranslated', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const cur = p.currentVersion(sub, 'mapping');
  assert.equal(cur.v, 2); assert.equal(cur.source, 'tool');
  assert.ok(cur.issues.some(i => i.kind === 'untranslated' && /Passages/.test(i.message)));
  assert.equal(p.wouldStamp(sub), 'Incomplete');
});
test('f2 seed: v3 intact, v4 current, one exclusion before a current passed run', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  assert.deepEqual(sub.artifacts.mapping[2].summary, {total:4, explained:3}, 'v3 unchanged');
  assert.equal(p.currentVersion(sub, 'mapping').v, 4);
  assert.equal(p.effectiveScope(sub).endpoints.find(e => e.id === 'accommodationDescriptors').on, false);
  assert.ok(sub.history.some(h => /Run scope: excluded accommodationDescriptors/.test(h.what)));
  const q = p.gate(sub).qualifying;
  assert.ok(q && !p.isStale(sub, q) && q.outcome === 'passed');
  assert.ok(p.sampleSlots(sub).every(s => s.current));
});
test('f4 seed: approved submission passes against the demo mapping', () => {
  const p = loadPrototype(), sub = p.APP.submissions.find(s => s.productId === 'p4' && s.model === 'assessments');
  assert.equal(p.currentVersion(sub, 'mapping').source, 'tool');
  const r = p.APP.runs.find(x => x.submissionId === sub.id);
  assert.equal(r.outcome, 'passed');
  assert.ok(p.resultTally(r.results).pass > 100);
});

test('mapping screen shows sample columns, suggestions and translations', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.openMappingDraft(sub);
  const html = p.mappingScreen(sub.id, 'elements', false);
  ['Sample column','Confirm all suggestions','Untranslated','data-act="maptranslate"','data-act="mapdatefmt"']
    .forEach(s => assert.ok(html.includes(s), s));
  assert.ok(p.mappingScreen(sub.id, 'product', false).includes('Objective codes'));
  const ro = p.mappingScreen(sub.id, 'elements', true);
  assert.ok(!ro.includes('Confirm all suggestions'));
  assert.ok(ro.includes('Untranslated'), 'the reviewer sees untranslated values too');
});
test('opening the tool suggests exact-name columns for unbound elements', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  sub.artifacts.mapping.pop();   /* back to the uploaded v1, which has no bindings */
  p.openMappingDraft(sub);
  const html = p.mappingScreen(sub.id, 'elements', false);
  assert.ok(html.includes('Suggested'));
  assert.ok(html.includes('data-act="mapconfirmcol"'));
  const issues = p.computeIssues(sub.mappingDraft.doc, p.currentSamples(sub));
  assert.ok(issues.some(i => i.kind === 'no-sample-column' && /confirm the suggested/.test(i.message)));
});

test('vendor sees the derived scope read-only, with exclusions and reasons', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  const html = p.inScopePanelHTML(sub, false);
  ['In-scope resources','studentAssessments','Excluded by reviewer','Sample columns not checked',
   'loaded by the district'].forEach(s => assert.ok(html.includes(s), s));
  assert.ok(!html.includes('data-act="scopetoggle"'));
});
test('reviewer panel exposes scope controls and a payload preview', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  p.APP.scopeView = {endpoint:'studentAssessments', record:0};
  const html = p.inScopePanelHTML(sub, true);
  assert.ok(html.includes('data-act="scopetoggle"'));
  assert.ok(html.includes('&quot;studentAssessmentIdentifier&quot;') || html.includes('"studentAssessmentIdentifier"'));
  assert.ok(/covers:/.test(html));
  assert.ok(html.includes('GET /ed-fi/studentAssessments?studentUniqueId='));
  assert.ok(html.includes('data-act="scopeaddrow"'));
});
test('the vendor start screen and the reviewer submission both carry the panel', () => {
  const p = loadPrototype();
  const s2 = byProduct(p, 'p2');
  const start = p.vendorNewRun(s2.id);
  assert.ok(start.includes('In-scope resources'));
  assert.ok(start.includes('No sample data for this assessment'), 'Math has no sample');
  const f2 = byProduct(p, 'p5');
  const rev = p.reviewerSubmission(f2.id);
  assert.ok(rev.includes('Run scope'));
  assert.match(rev, /\d+ cannot check/);
});
test('the scope reason modal refuses an empty reason', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  try { p.scopeReasonModal(sub, {op:'exclude', id:'studentAssessments'}); } catch { /* stub DOM */ }
  assert.match(p.$('#overlay').innerHTML, /data-act="doscope"/);
  const r = p.applyScopeChange(sub, {op:'exclude', id:'studentAssessments'}, '  ');
  assert.deepEqual(r, {ok:false, error:'A reason is required.'});
});

/* ---------- final review fixes ---------- */
test('an exclusion is dropped when a generated mapping stops implying it, even if nothing read the scope', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  const draft = p.openMappingDraft(sub);
  const ra = draft.doc.elements.find(e => e.name === 'Read Aloud' && e.targets.length);
  const keep = ra.targets; ra.targets = [];
  p.generateMapping(sub);
  assert.ok(sub.history.some(h => /accommodationDescriptors.*no longer implied/.test(h.what)), 'dropping is audited');
  ra.targets = keep; p.generateMapping(sub);
  assert.equal(p.effectiveScope(sub).endpoints.find(e => e.id === 'accommodationDescriptors').on, true);
});
test('reading the scope does not change reviewer state', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  const before = JSON.stringify(sub.runScope);
  sub.runScope.excluded.someGoneEndpoint = {reason:'x', by:'r', at:new Date(0)};
  p.effectiveScope(sub);
  assert.ok(sub.runScope.excluded.someGoneEndpoint, 'effectiveScope is a read');
  assert.ok(before);
});
test('the preview does not name a bound column the current sample lacks', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.uploadArtifact(sub, 'sample', 'ela-v2.csv', false, 'VENDORB-DIAGNOSTIC-ELA');
  const s = p.currentSample(sub, 'VENDORB-DIAGNOSTIC-ELA');
  s.columns = s.columns.map(c => c === 'Rush Flag' ? 'Rush Indicator' : c);
  const doc = p.mappingDocFor(sub, p.currentVersion(sub, 'mapping'));
  const st = p.deriveEndpoints(doc, p.currentSamples(sub)).find(e => e.id === 'studentAssessments');
  assert.equal(st.fields.find(f => f.element === 'Rush Flag').column, null);
});
test('seeded assessments runs pin the mapping version they were computed from', () => {
  const p = loadPrototype();
  p.APP.runs.filter(r => r.pinned && r.pinned.scope).forEach(r =>
    assert.equal(r.pinned.mapping, r.pinned.scope.mapping, r.id));
});
test('cannot-check banner links open the collapsed record they point at', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  const q = p.gate(sub).qualifying;
  const html = p.runResults(q.id, true);
  assert.match(html, /closest\('details'\)/);
});
