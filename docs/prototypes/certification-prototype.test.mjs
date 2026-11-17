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

/* ---------- mapping validation report (docs/design/2026-11-17-mapping-validation-report-plan.md) ---------- */

test('Vendor B fixture is embedded with the original files', () => {
  const p = loadPrototype();
  const fx = p.FIXTURES['vendorb-original'];
  assert.equal(fx.workbook.Product[0]['Vendor Product'], 'Vendor B');
  assert.equal(fx.samples['ELA Diagnostic'].rows.length, 156);
  assert.ok(fx.workbook.ElementDefinitions.some(r => /Math/.test(r['Assessment Type'])));
});

test('normKey ignores case, whitespace and punctuation', () => {
  const p = loadPrototype();
  assert.equal(p.normKey('Reading Comprehension:  Literature'), p.normKey('reading comprehension - literature'));
});

test('closest suggests the near header', () => {
  const p = loadPrototype();
  assert.equal(p.closest('Most Recent Diagnostic (Y/N)', ['Rush Flag', 'Most Recent Diagnostic YTD (Y/N)']),
    'Most Recent Diagnostic YTD (Y/N)');
  assert.equal(p.closest('Zebra', ['Rush Flag']), null);
});

test('standard descriptors cover every ed-fi URI the fixture uses', () => {
  const p = loadPrototype();
  const uris = JSON.stringify(p.FIXTURES['vendorb-original'].workbook).match(/uri:\/\/ed-fi\.org\/\w+#[^"\\]+/g);
  assert.ok(uris.length > 0);
  uris.forEach(u => {
    const [, type, code] = u.match(/ed-fi\.org\/(\w+)#(.+)/);
    assert.ok((p.STANDARD_DESCRIPTORS[type] || []).includes(code), u);
  });
});

test('reference data names required tabs, targets and pre-arranged columns', () => {
  const p = loadPrototype();
  assert.deepEqual(Object.keys(p.REQUIRED_TABS),
    ['Product', 'Assessments', 'ElementDefinitions', 'EnumerationDefinitions', 'EnumerationItems']);
  assert.ok(p.targetByPath('studentAssessment.accommodations'));
  assert.equal(p.targetByPath('nope.nothing'), null);
  assert.deepEqual(p.PREARRANGED_COLUMNS.map(c => c.column), ['Student ID', 'Activity Id']);
});

/* Test helpers for the mapping validator. linkAll stands in for the production
   corrections (Task 5): it fixes the Assessment Type names and renames sample
   headers to the workbook element names, so link and value rules can run. */
const findings = (r, pred) => r.findings.filter(pred);
const original = p => structuredClone(p.FIXTURES['vendorb-original']);
const validate = (p, fx) => p.validateMapping(fx.workbook, fx.samples);
const LINK_FIXES = [['Scale Score', 'Overall Scale Score'], ['Placement Level', 'Overall Placement'],
  ['Relative Placement', 'Overall Relative Placement'], ['Duration (minutes)', 'Duration (min)'],
  ['Most Recent Diagnostic (Y/N)', 'Most Recent Diagnostic YTD (Y/N)'],
  ['Mid On-Grade Level Score', 'Mid On Grade Level Scale Score'], ['Date', 'Completion Date'],
  ['Grade', 'Student Grade']];
function linkAll(fx){
  fx.workbook.ElementDefinitions.forEach(r => { r['Assessment Type'] = r['Assessment Type'].replace(/^Vendor B /, ''); });
  const s = fx.samples['ELA Diagnostic'];
  const rename = (from, to) => { const i = s.columns.indexOf(from); if (i >= 0) s.columns[i] = to; };
  LINK_FIXES.forEach(([el, col]) => rename(col, el));
  fx.workbook.ElementDefinitions.filter(r => r['Assessment Type'] === 'ELA Diagnostic' && !s.columns.includes(r.Element))
    .forEach(r => rename(r.Element.replace(/^Reading /, '').replace(/\s+/g, ' ').replace(/ Placement Level$/, ' Placement'), r.Element));
  return fx;
}

test('missing tab makes the workbook malformed', () => {
  const p = loadPrototype(); const fx = original(p);
  delete fx.workbook.EnumerationItems;
  const r = validate(p, fx);
  assert.equal(r.verdict, 'malformed'); assert.equal(r.model, null);
  assert.match(r.findings[0].message, /EnumerationItems/);
});

test('original files are not ready', () => {
  const p = loadPrototype(); const r = validate(p, original(p));
  assert.equal(r.verdict, 'not-ready'); assert.ok(r.errors > 0);
  assert.deepEqual(r.categories.map(c => c.label),
    ['Assessments', 'Element ↔ column links', 'Ed-Fi targets', 'Values', 'Pre-arranged columns', 'Objectives']);
});

test('assessment type mismatch suggests the Assessments tab name', () => {
  const p = loadPrototype(); const r = validate(p, original(p));
  assert.ok(findings(r, x => x.category === 'assessments' && x.file === 'Workbook' &&
    x.hint === 'Did you mean `ELA Diagnostic`?').length);
});

test('assessment with no sample is an error', () => {
  const p = loadPrototype(); const r = validate(p, original(p));
  assert.ok(findings(r, x => x.category === 'assessments' && /Math Diagnostic/.test(x.where) && x.severity === 'error').length);
});

test('unlinked element suggests a column', () => {
  const p = loadPrototype(); const fx = original(p);
  fx.workbook.ElementDefinitions.forEach(r => { r['Assessment Type'] = r['Assessment Type'].replace(/^Vendor B /, ''); });
  const x = findings(validate(p, fx), x => x.category === 'links' && /Most Recent Diagnostic \(Y\/N\)/.test(x.message))[0];
  assert.equal(x.hint, 'Did you mean `Most Recent Diagnostic YTD (Y/N)`?');
  assert.equal(x.file, 'Workbook'); assert.equal(x.row, 3);
});

test('accommodation enumeration misspelling is an error with a suggestion', () => {
  const p = loadPrototype(); const r = validate(p, linkAll(original(p)));
  assert.ok(findings(r, x => x.severity === 'error' && /AccommodationDescriptor/.test(x.message) &&
    x.hint === 'Did you mean `Accomodation`?').length);
});

test('grade values are checked against the standard list', () => {
  const p = loadPrototype(); const r = validate(p, linkAll(original(p)));
  const x = findings(r, x => x.category === 'values' && x.file === 'Sample' && /`3`/.test(x.message))[0];
  assert.equal(x.hint, 'Closest: `Third grade`'); assert.ok(x.count > 0);
});

test('Y/N in a Boolean result is an error', () => {
  const p = loadPrototype(); const r = validate(p, linkAll(original(p)));
  assert.ok(findings(r, x => x.category === 'values' && x.severity === 'error' &&
    /`Y`/.test(x.message) && /Boolean/.test(x.message)).length);
});

test('M/D/YY date is an error with the ISO hint', () => {
  const p = loadPrototype(); const r = validate(p, linkAll(original(p)));
  assert.ok(findings(r, x => x.category === 'values' && x.hint === 'expected YYYY-MM-DD').length);
});

test('missing pre-arranged column is an error', () => {
  const p = loadPrototype(); const fx = linkAll(original(p));
  const s = fx.samples['ELA Diagnostic'];
  const i = s.columns.indexOf('Activity Id');
  s.columns.splice(i, 1); s.rows.forEach(row => row.splice(i, 1));
  assert.ok(findings(validate(p, fx), x => x.category === 'prearranged' && x.severity === 'error' &&
    /Activity Id/.test(x.message)).length);
});

test('duplicate sample header uses the first and warns', () => {
  const p = loadPrototype(); const r = validate(p, linkAll(original(p)));
  const w = findings(r, x => x.severity === 'warning' && /Student ID/.test(x.message));
  assert.equal(w.length, 1);
  assert.equal(r.model.assessments[0].idColumns.student, p.FIXTURES['vendorb-original'].samples['ELA Diagnostic'].columns.indexOf('Student ID'));
});

test('validator trims headers and skips blank rows', () => {
  const p = loadPrototype();
  const base = validate(p, original(p));
  const fx = original(p);
  fx.workbook.ElementDefinitions = fx.workbook.ElementDefinitions.map(r => {
    const o = {}; Object.keys(r).forEach(k => { o[k === 'Element' ? ' Element ' : k] = r[k]; }); return o;
  });
  fx.workbook.ElementDefinitions.push({});
  fx.workbook.EnumerationItems.push({Enumeration:' ', 'Code Value':''});
  assert.deepEqual(validate(p, fx).findings, base.findings);
});

test('empty assessment and empty sample are findings, not exceptions', () => {
  const p = loadPrototype(); const fx = linkAll(original(p));
  fx.samples['ELA Diagnostic'].rows = [];
  fx.workbook.ElementDefinitions = fx.workbook.ElementDefinitions.filter(r => r['Assessment Type'] !== 'Math Diagnostic');
  const r = validate(p, fx);
  assert.equal(r.verdict, 'not-ready');
  assert.ok(findings(r, x => x.category === 'assessments' && /no rows/.test(x.message)).length);
  assert.ok(findings(r, x => x.category === 'assessments' && /Math Diagnostic/.test(x.message) && /no elements/i.test(x.message)).length);
});

test('values are reported once per distinct value with a row count', () => {
  const p = loadPrototype(); const fx = linkAll(original(p));
  /* Read Aloud values are only checked once its enumeration resolves. */
  ['EnumerationDefinitions', 'EnumerationItems'].forEach(t => fx.workbook[t].forEach(r => {
    if (r.Enumeration === 'Accomodation') r.Enumeration = 'Accommodation'; }));
  const r = validate(p, fx);
  const xs = findings(r, x => x.category === 'values' && /`Off`/.test(x.message));
  assert.equal(xs.length, 1); assert.ok(xs[0].count > 1);
});

test('an assessment type mismatch is one finding per name and does not hide other checks', () => {
  const p = loadPrototype(); const r = validate(p, original(p));
  const xs = findings(r, x => x.category === 'assessments' && /Vendor B ELA Diagnostic/.test(x.message));
  assert.equal(xs.length, 1); assert.ok(xs[0].count > 1);
  assert.ok(findings(r, x => x.category === 'links').length > 0);
});

test('a missing enumeration needed by two assessments is reported once', () => {
  const p = loadPrototype(); const r = validate(p, original(p));
  assert.equal(findings(r, x => /No enumeration for `AccommodationDescriptor`/.test(x.message)).length, 1);
});

/* Task 4 — objectives, expected payloads, rows and endpoints. */
const ela = r => r.model.assessments.find(a => a.type === 'ELA Diagnostic');

test('objective code drops the suffix of the same-method assessment element', () => {
  const p = loadPrototype(); const r = validate(p, linkAll(original(p)));
  const codes = r.objectives['ELA Diagnostic'].map(o => o.code);
  assert.ok(codes.includes('Phonics'));
  assert.ok(codes.includes('Reading Comprehension: Literature'));
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(ela(r).elements.find(e => e.name === 'Phonics Scale Score').objective, 'Phonics');
});

test('objective spellings that share a normalized key warn and keep the first spelling', () => {
  const p = loadPrototype(); const fx = linkAll(original(p));
  const row = fx.workbook.ElementDefinitions.find(r => r.Element === 'Phonics Relative Placement');
  row.Element = 'phonics - Relative Placement';
  const r = validate(p, fx);
  assert.ok(findings(r, x => x.category === 'objectives' && x.severity === 'warning' && /phonics -/.test(x.message)).length);
  assert.equal(ela(r).elements.find(e => e.name === 'phonics - Relative Placement').objective, 'Phonics');
});

test('an objective element that does not end in its score name is an error', () => {
  const p = loadPrototype(); const fx = linkAll(original(p));
  fx.workbook.ElementDefinitions.find(r => r.Element === 'Phonics Scale Score').Element = 'Scale Score';
  assert.ok(findings(validate(p, fx), x => x.category === 'objectives' && x.severity === 'error').length);
});

test('expected student assessment carries pre-arranged identity and vendor descriptor URIs', () => {
  const p = loadPrototype(); const r = validate(p, p.fixtureVariant('vendorb-corrected')); const a = ela(r);
  const col = a.sample.columns.indexOf('Rush Flag');
  const i = a.sample.rows.findIndex(row => row[col] === 'Red Rush Flag');
  const pl = p.expectedStudentAssessment(r.model, a, i);
  assert.equal(pl.eventCircumstanceDescriptor, 'uri://vendorb.example/EventCircumstanceDescriptor#Red Rush Flag');
  assert.equal(pl.studentReference.studentUniqueId, a.sample.rows[i][a.idColumns.student]);
  assert.equal(pl.studentAssessmentIdentifier, a.sample.rows[i][a.idColumns.activity]);
  assert.deepEqual(pl.assessmentReference, {assessmentIdentifier:'VENDORB-DIAGNOSTIC-ELA', namespace:'uri://vendorb.example/'});
  assert.ok(pl.studentObjectiveAssessments.some(o => o.objectiveAssessmentReference.identificationCode === 'Phonics'));
});

test('expected assessment and objectives come from the workbook', () => {
  const p = loadPrototype(); const r = validate(p, p.fixtureVariant('vendorb-corrected')); const a = ela(r);
  const asm = p.expectedAssessment(r.model, a);
  assert.equal(asm.assessmentIdentifier, 'VENDORB-DIAGNOSTIC-ELA');
  assert.equal(asm.adaptiveAssessment, true);
  assert.ok(asm.scores.length > 0);
  const objs = p.expectedObjectives(r.model, a);
  assert.equal(objs.length, r.objectives['ELA Diagnostic'].length);
  assert.ok(objs.every(o => o.payload.identificationCode === o.code && o.payload.scores.length));
});

test('row selection covers every distinct descriptor value and objective', () => {
  const p = loadPrototype(); const r = validate(p, p.fixtureVariant('vendorb-corrected')); const a = ela(r);
  const rows = p.selectRows(r.model, a);
  assert.ok(rows.length > 0 && rows.length < a.sample.rows.length);
  assert.ok(rows.every(x => x.why && x.key.studentId && x.key.activityId));
  const col = a.sample.columns.indexOf('Rush Flag');
  ['Red Rush Flag', 'Yellow Rush Flag'].forEach(v => assert.ok(rows.some(x => a.sample.rows[x.index][col] === v), v));
});

test('endpoints are derived in order', () => {
  const p = loadPrototype(); const r = validate(p, p.fixtureVariant('vendorb-corrected'));
  const eps = p.deriveEndpoints(r.model);
  assert.deepEqual(eps.slice(0, 3).map(e => e.id), ['assessments', 'objectiveAssessments', 'studentAssessments']);
  assert.ok(eps.some(e => e.id === 'descriptor:EventCircumstanceDescriptor'));
  assert.ok(eps.every(e => e.recordCount > 0));
});

/* Task 5 — corrected, malformed and renamed variants. */
test('corrected Vendor B files are ready to run', () => {
  const p = loadPrototype(); const r = validate(p, p.fixtureVariant('vendorb-corrected'));
  assert.deepEqual(r.findings.filter(x => x.severity === 'error').map(x => x.message), []);
  assert.equal(r.verdict, 'ready');
});

test('corrections do not mutate the original fixture', () => {
  const p = loadPrototype();
  p.fixtureVariant('vendorb-corrected');
  assert.equal(validate(p, p.FIXTURES['vendorb-original']).verdict, 'not-ready');
  assert.equal(p.fixtureVariant('vendorb-original').workbook.Assessments.length, 2);
});

test('corrected workbook has no Math Diagnostic', () => {
  const p = loadPrototype(); const fx = p.fixtureVariant('vendorb-corrected');
  assert.ok(!fx.workbook.Assessments.some(r => /Math/.test(r['Assessment Type'])));
  assert.ok(!fx.workbook.ElementDefinitions.some(r => /Math/.test(r['Assessment Type'])));
});

test('malformed variant is missing EnumerationItems', () => {
  const p = loadPrototype(); assert.equal(validate(p, p.fixtureVariant('vendorb-malformed')).verdict, 'malformed');
});

test('every correction says why', () => {
  const p = loadPrototype();
  const all = [...p.CORRECTIONS.workbook, ...p.CORRECTIONS.sample];
  assert.ok(all.length > 5 && all.every(c => c.why && typeof c.apply === 'function'));
});

test('renamed fixture keeps the verdict', () => {
  const p = loadPrototype();
  const fx = p.renameFixture(p.fixtureVariant('vendorb-corrected'), [['Vendor B', 'Northwind'], ['vendorb', 'northwind'], ['VENDORB', 'NORTHWIND']]);
  const r = validate(p, fx);
  assert.equal(r.verdict, 'ready'); assert.equal(r.model.product.namespace, 'uri://northwind.example/');
});
