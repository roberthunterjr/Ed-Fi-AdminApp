# Assessments Run Scope and Expected Payloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Assessments *In-scope resources* view and run results real. Endpoints, sample rows and
expected payloads are derived from the vendor's mapping and per-assessment sample data. The reviewer can
narrow the scope for one submission. Runs compare simulated GET responses with the expected payloads on
shape and values.

**Architecture:** A pure model layer of functions over `(MappingDoc, sample, scope)` that touch neither
`APP` nor the DOM: translation, row selection, expected payloads, scope derivation, simulation and
comparison. Submission-level state adds per-assessment sample slots and a reviewer-owned `sub.runScope`.
Runs pin the effective scope. UI changes reuse the existing card, table, badge, modal and `data-act`
patterns. Demo data is an anonymized extract of the vendor's ELA sample, produced by a one-off script.

**Tech Stack:** A single-file HTML prototype (vanilla JS, hash routing, no build step). Tests:
`node --test docs/prototypes/certification-prototype.test.mjs` using the existing `loadPrototype()`
harness. The one-off extraction script is Node ESM in `docs/prototypes/tools/`.

**Spec:** `docs/design/2026-11-17-assessment-run-scope-design.md` (builds on
`docs/design/2026-11-16-assessment-mapping-tool-design.md`)

## Global Constraints

- **Single self-contained file.** `docs/prototypes/certification-prototype.html` has no imports, no network
  calls and no new libraries, and still opens from `file://`.
- **Avoid TDZ errors.** `seed()` runs at load. New data constants go **above**
  `/* ---------- mutable application state ---------- */`. New logic is `function` declarations, never
  `const` arrows.
- **Run tests by file:** `node --test docs/prototypes/certification-prototype.test.mjs`. Don't pass a
  directory.
- **Public repo: anonymized data only.**
  - The vendor is "Vendor B" (`uri://vendor-b.example.com/`, `VENDORB-DIAGNOSTIC-ELA`).
  - In the sample, the `Class Teacher(s)` column is blanked and Activity Ids are regenerated as
    `VB-ACT-0001`…`VB-ACT-0156`.
  - Element definitions are paraphrased, never copied.
  - The product owner reviews the anonymized diff **before** it is committed.
- **Assessments only.** Every new behavior is gated on `MODELS[sub.model].kind === 'assessments'`. SIS and
  MTSS submissions are unchanged.
- **The platform never authors the mapping.** Sample-column prefills are *suggestions* until confirmed.
  Translations are only ever set by a vendor action, or by the demo seed acting as the vendor.
- **The reviewer can only narrow the scope.** Endpoints come only from the mapping. Rows come only from the
  sample.
- **Exact copy:**
  - Result kinds: `Cannot check`, `Excluded by reviewer`, `Record not found`, `Descriptor not loaded`.
  - Issue kinds: `Untranslated sample value`, `No sample column`, `Objective code missing`,
    `Sample value doesn't fit the date format`.
  - Scope messages: `Row no longer in sample`, `A reason is required.`
  - Titles: card `Run scope`; panel `In-scope resources`; artifact row `Sample data — <assessment title>`.
  - Buttons: `Confirm`, `Confirm all suggestions`.
  - Run summary format: `Passed · <n> cannot check`.
- **Date formats:** `M/D/YY`, `M/D/YYYY`, `YYYY-MM-DD`.
- `.editorconfig`: LF, 2-space indent, final newline, no trailing whitespace.

## Review Focus

1. **A reviewer adds a row, then the vendor uploads a sample without it.** The adjustment shows
   `Row no longer in sample` and is ignored. It is not silently dropped. Tested in Task 6.
2. **An excluded endpoint drops out with a new mapping version, then a later version brings it back.** It
   comes back **on**, because the exclusion went with it. Tested in Task 6.
3. **A run starts while one assessment has no sample** (Math in the demo). Its student checks are
   `Cannot check` with reason *no sample data for this assessment*. Assessment-level checks still run and
   the run can pass. Tested in Task 7.
4. **The reviewer excludes `studentAssessments`.** All row checks show `Excluded by reviewer`, nothing
   counts as a failure, and the tally still reports the excluded count. Tested in Task 7.
5. **A new sample version drops a column an element is bound to.** The element raises `No sample column`
   and its field is `Cannot check`. It doesn't throw. Tested in Task 3.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `docs/prototypes/tools/build-sample-data.mjs` (create) | One-off: read the private ELA CSV by path, anonymize it, print the `SAMPLE_ELA` literal |
| `docs/prototypes/certification-prototype.html` (modify) | Data, model, state, seed and UI as in the tasks below |
| `docs/prototypes/certification-prototype.test.mjs` (modify) | Tests for every task |
| `docs/PRD-Certification-v2.md` (modify) | Requirements derived from the spec (§8 of the spec) |

Sections inside the HTML, in file order. New sections sit next to their siblings.

- **Data:** `SAMPLE_ELA`, slice and fixture extensions, `DATE_FORMATS`.
- **Mapping model:** element fields and the sample-aware issues.
- **Run-scope model (new block after the mapping model):** translation, payloads, rows, scope, simulation,
  comparison.
- **Submission state:** sample slots, `runScope`, pinning and staleness.
- **Seed.**
- **UI:** mapping-tool additions, the in-scope panel, the reviewer card, and run results.

---

### Task 1: Anonymized ELA sample data

**Files:**
- Create: `docs/prototypes/tools/build-sample-data.mjs`
- Modify: `docs/prototypes/certification-prototype.html` (new constant above the mutable-state marker)
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Produces: `SAMPLE_ELA = {name:'vendorb-ela-sample.csv', columns:string[80], rows:string[156][80]}`.
- Test helper (add to the test file in this task; later tasks use it): submission ids are generated
  (`sub-1xx`), so tests find seeded submissions by product. `s2` is product `p2`, `f2` is `p5`.
  `const byProduct = (p, productId) => p.APP.submissions.find(s => s.productId === productId);`
  The CSV's duplicated `Student ID` header is kept as is, so look columns up by first index.
  `sampleCol(sample, name) -> number` returns the first index of a column name, or -1.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it.** Run `node --test docs/prototypes/certification-prototype.test.mjs`. Expected:
  FAIL, `SAMPLE_ELA is not defined`.
- [ ] **Step 3: Write `build-sample-data.mjs`.**
  - Usage: `node build-sample-data.mjs <path-to-csv> > sample.txt`.
  - Parse the CSV with a small quote-aware parser (no dependencies; fields contain quoted commas), and
    strip a BOM if there is one.
  - Blank the `Class Teacher(s)` column. Set `Activity Id` to `VB-ACT-` plus the 1-based row number padded
    to 4 digits.
  - Print `const SAMPLE_ELA = {...};` with one row per line.
  - Add a header comment that mirrors `build-collection-data.mjs`.
- [ ] **Step 4: Generate and paste.** Run the script against the product owner's local ELA CSV (they
  supply the path). Paste the output above the mutable-state marker. Add `function sampleCol(sample, name)`
  next to it.
- [ ] **Step 5: Run the tests.** Expected: PASS, and existing tests stay green.
- [ ] **Step 6: Stop for the product owner's review.** Show the product owner the diff of the pasted
  literal and confirm it's anonymized. Don't commit until they approve.
- [ ] **Step 7: Commit.**

```bash
git add docs/prototypes/tools/build-sample-data.mjs docs/prototypes/certification-prototype.html docs/prototypes/certification-prototype.test.mjs
git commit -m "feat: embed anonymized ELA sample data in the certification prototype"
```

---

### Task 2: v5 slice, fixture and element-model extensions

**Files:**
- Modify: `certification-prototype.html`:
  - `EDFI_V5_TARGETS`, `STANDARD_DESCRIPTORS`, `WORKBOOK_FIXTURES.vendorb`
  - element creation in `parseWorkbook` and `addElement`
  - `emptyMappingDoc`
- Test: `certification-prototype.test.mjs`

**Interfaces:**
- **Slice additions:**
  - Targets `studentAssessment.accommodations` (Descriptor, collection, `AccommodationDescriptor`) and
    `studentAssessment.period` (Descriptor, `AssessmentPeriodDescriptor`).
  - `GradeLevelDescriptor` gains `Ninth grade` … `Twelfth grade`.
- **Fixture.** `vendorb` ElementDefinitions grows to all **42** ELA rows, in this order (paths as in the
  existing fixture style, using `SC`, `OBJ` and the `H`/`vh`/`eh` helpers):
  1. Baseline Diagnostic (Y/N); Most Recent Diagnostic (Y/N); Duration (minutes); Rush Flag; Scale Score;
     Placement Level; Relative Placement; Percentile; Lexile Measure; Lexile Range; Diagnostic Language;
     Diagnostic Gain; Annual Typical Growth Measure (`Interger`); Annual Stretch Growth Measure
     (`Interger`); Percent Progress to Annual Typical Growth (%) (`percentage`); Percent Progress to Annual
     Stretch Growth (%) (`percentage`, vendor `Progress To Stretch Growth`, `Percentage`); Mid On-Grade
     Level Score (`integer`).
  2. For each of Phonological Awareness, Phonics, High-Frequency Words, Vocabulary,
     `Reading Comprehension: Overall`, `Reading Comprehension: Literature` (keep the workbook's
     **double space** before `Placement Level` and `Relative Placement`),
     `Reading Comprehension: Informational Text`: `<D> Scale Score` (Integer, OBJ, Scale score/Integer),
     `<D> Placement Level` (String, OBJ, Achievement/proficiency level/Level), and `<D> Relative Placement`
     (String, OBJ, vendor Relative Placement/Level).
  3. Norming Window (Enumeration, `studentAssessment.period`); Read Aloud (Enumeration,
     `studentAssessment.accommodations`); Date (Date, `studentAssessment.administrationDate`); Grade
     (Enumeration, `studentAssessment.whenAssessedGradeLevelDescriptor`).
- **Enumeration items.** `AssessmentPeriod` codes become `Fall (Beginning of Year - November 15)`,
  `Winter (November 16 - March 1)` and `Spring (March 2 - End of Year)`. Math rows are unchanged.
- **New element fields**, with their defaults:
  - `sampleColumn:null | {name:string, confirmed:boolean}`
  - `translations:[]` of `{kind:'descriptor'|'result', sample:string, value:string}`, where `value` is a
    bank value id for `descriptor` and a literal result string for `result`
  - `dateFormat:null | one of DATE_FORMATS`
- **Doc field:** `doc.objectiveCodes = {}`, shaped `{[assessmentId]: {[objectiveName]: code}}`.
- **Produces** (all in the mapping-model section):
  - `translationKinds(doc, el) -> ('descriptor'|'result')[]`: `descriptor` if any target has type
    Descriptor; `result` if any score target's datatype is a non-numeric result such as Boolean.
  - `suggestSampleColumns(doc, assessmentId, columns) -> number`: sets
    `{name, confirmed:false}` on unbound elements of that assessment whose trimmed, case-insensitive name
    equals a column. Returns the count set.
  - `setSampleColumn(doc, elId, name|null)`: sets `confirmed:true`.
  - `confirmSampleColumn(doc, elId)`.
  - `confirmAllSuggestions(doc, assessmentId) -> number`.
  - `setTranslation(doc, elId, kind, sample, value|null)`: `null` removes it.
  - `setDateFormat(doc, elId, fmt) -> {ok, error?}`: rejects formats not in `DATE_FORMATS`.
  - `setObjectiveCode(doc, assessmentId, objective, code)`.
  - `objectivesOf(doc, assessmentId) -> string[]`: distinct `el.objective` values, in element order.

- [ ] **Step 1: Write the failing tests.**

```js
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
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the slice, fixture and functions listed under Interfaces.** Write paraphrased
  definitions for the new fixture rows.
- [ ] **Step 4: Run the whole test file.** Expected: the new tests PASS. Update any existing assertions that
  counted the old ~19-element fixture or the old `Fall`/`Winter`/`Spring` codes, and say which in the commit
  body.
- [ ] **Step 5: Commit** with message `feat: extend the v5 slice and Vendor B fixture for sample-driven checks`.

---

### Task 3: Sample-aware mapping issues

**Files:** Modify `computeIssues` and `ISSUE_KINDS` in `certification-prototype.html`. Test file.

**Interfaces:**
- Consumes: Task 2's element fields, `sampleCol`.
- Produces:
  - `computeIssues(doc, samples = {})`, where `samples` is `{[assessmentIdentifier]: SampleVersion|null}`
    and `SampleVersion` is `{v, name, columns, rows, assessment}`. Existing callers that pass only `doc`
    keep their behavior.
  - New `ISSUE_KINDS` entries:
    - `['untranslated','Untranslated sample value']`, one issue per element per distinct sample value
    - `['no-sample-column','No sample column']`, raised only when that assessment has a sample; covers no
      binding, an unconfirmed suggestion, or a bound column missing from the sample
    - `['objective-code','Objective code missing']`
    - `['date-format',"Sample value doesn't fit the date format"]`
  - Issue keys follow the existing `kind:assessmentId:…` pattern, so notes attach.
  - `distinctSampleValues(sample, column) -> string[]`: non-blank values, trimmed, in first-seen order.
  - `parseSampleDate(raw, fmt) -> string|null`: returns ISO `YYYY-MM-DD`. Two-digit years mean 20YY.

- [ ] **Step 1: Write the failing tests.**

```js
test('untranslated values and missing columns are flagged only when a sample exists', () => {
  const p = loadPrototype();
  const doc = p.parseWorkbook(p.WORKBOOK_FIXTURES.vendorb).doc;
  const ela = doc.assessments.find(a => a.identifier === 'VENDORB-DIAGNOSTIC-ELA');
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
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the functions under Interfaces.** Issues carry `elementId` where they relate to
  an element.
- [ ] **Step 4: Run the tests.** Expected: PASS, and existing mapping-tool tests stay green.
- [ ] **Step 5: Commit** with message `feat: flag untranslated values and unbound sample columns in the mapping tool`.

---

### Task 4: Per-assessment sample slots

**Files:** Modify in `certification-prototype.html`:
- `gate`, `wouldStamp`, `isStale`, `startRun` pinning, `uploadArtifact`, `uploadModal`, `artifactCard`
- `recomputeStatus`'s "anything uploaded" check
- the pinned-artifacts column of the runs table

Test file.

**Interfaces:**
- **Storage.** `sub.artifacts.sample` stays an array, but on Assessments submissions each version carries
  `assessment` (the assessment identifier) and, once parsed, `columns` and `rows`. `v` is numbered **within
  its slot**.
- Produces:
  - `mappingDocFor(sub, version) -> MappingDoc|null`: returns `version.doc` for tool versions. Otherwise
    it returns the same fallback as `openMappingDraft` (the parsed `vendorb` fixture).
  - `sampleSlots(sub) -> [{identifier, title, current:SampleVersion|null, versions:SampleVersion[]}]`:
    built from the assessments of the current mapping version. It returns `[]` when there is no mapping.
  - `currentSample(sub, identifier) -> SampleVersion|null`.
  - `currentSamples(sub) -> {[identifier]: SampleVersion|null}`.
  - `uploadArtifact(sub, type, name, malformed, assessment)`: the new 5th argument is required when
    `type === 'sample'` on Assessments. Simulated uploads copy `SAMPLE_ELA.columns/rows` (fresh arrays, never shared references).
- **Gate.** On Assessments, the sample requirement is met only when every slot has a current version. Use
  the label `Sample data — <title>` in the missing list.
- **Pinning.** On Assessments, `r.pinned.sample` is `{[identifier]: v}`. `isStale` compares it by value.

- [ ] **Step 1: Write the failing tests.**

```js
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
```

  These tests assume Task 8's seed for `s2`'s slot and mapping. Until Task 8, seed `s2`'s existing sample
  with `assessment:'VENDORB-DIAGNOSTIC-ELA'` and `SAMPLE_ELA` content in this task, and convert the seeded
  Assessments runs' `pinned.sample` to the map form.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `artifactCard`, Assessments submissions render one row per slot, each with
  its own upload or replace button that passes `data-assessment`. The upload modal shows the assessment in
  its title.
- [ ] **Step 4: Run the tests.** Expected: PASS, and existing tests stay green.
- [ ] **Step 5: Commit** with message `feat: give each assessment its own sample data slot`.

---

### Task 5: Translation, expected payloads, row selection and endpoint derivation

**Files:** A new `/* ---------- run scope: model ---------- */` block after the mapping-model functions in
`certification-prototype.html`. Test file.

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces (all pure):
  - **`translateField(doc, el, target, raw)`** returns `{value}` or `{cannot:reason}`.
    - `reason` is one of `'untranslated'`, `'date-format'`, `'no-sample-column'`, `'blank'`.
    - Descriptor targets resolve the translation's bank value to its `uri`.
    - Score targets with a non-numeric datatype use the `result` translation.
    - Dates become ISO via `parseSampleDate`.
    - Other values pass through trimmed.
  - **`expectedAssessment(doc, a)`** returns
    `{assessmentIdentifier, namespace, assessmentTitle, assessmentCategoryDescriptor, adaptiveAssessment, assessmentFamily, maxRawScore, scores:[{assessmentReportingMethodDescriptor, resultDatatypeTypeDescriptor}]}`.
    Fields that aren't mapped are omitted.
  - **`expectedObjectives(doc, a)`** returns
    `[{identificationCode, assessmentReference:{assessmentIdentifier, namespace}, scores:[…]}]`.
    `identificationCode` is omitted when the code is empty.
  - **`expectedStudentAssessment(doc, a, sample, rowIndex)`** returns `{payload, cannot:[{path, reason}]}`.
    The payload has this shape (DS 5):

    ```
    {studentAssessmentIdentifier, assessmentReference:{assessmentIdentifier, namespace},
     studentReference:{studentUniqueId}, administrationDate, whenAssessedGradeLevelDescriptor,
     administrationLanguageDescriptor, eventCircumstanceDescriptor, retestIndicatorDescriptor,
     accommodations:[{accommodationDescriptor}], period:{assessmentPeriodDescriptor},
     scoreResults:[{assessmentReportingMethodDescriptor, resultDatatypeTypeDescriptor, result}],
     studentObjectiveAssessments:[{objectiveAssessmentReference:{assessmentIdentifier, identificationCode, namespace},
                                   scoreResults:[…]}]}
    ```

    A blank cell adds no key and no `cannot` entry. Other reasons add to `cannot` with paths like
    `scoreResults[Scale score].result`.
  - **`selectRows(doc, a, sample) -> [{index, key:{studentId, activityId}, covers:string[]}]`.** This is a
    greedy set cover.
    - Features are: each distinct raw value (translated **or not**) of each Enumeration or Boolean-result
      element with a sample column; each objective with a non-blank score; and one "all domain scores
      blank" feature when such a row exists.
    - Each pass takes the row covering the most uncovered features. Ties go to the lower index.
    - `covers` holds labels like `Rush Flag: Red Rush Flag`.
    - The key columns are the columns bound to the elements targeting `studentReference` and
      `studentAssessmentIdentifier`. If either is missing, return `[]`.
  - **`deriveEndpoints(doc, samples) -> [{id, resource, kind, recordCount, fields:[{path, element, column, rule}], descriptors:string[]}]`.**
    - `kind` is one of `'assessment'`, `'objective'`, `'student'`, `'descriptor'`.
    - `id` equals `resource`. One descriptor endpoint per descriptor type used by translations, reporting
      methods, datatypes and categories, named `<camelType>s` (e.g. `accommodationDescriptors`).
  - **`unmappedColumns(doc, a, sample) -> string[]`**: sample columns no confirmed binding uses.

- [ ] **Step 1: Write the failing tests.** They use a helper `demo(p)` that returns `buildDemoMapping`
  (Task 8) output. Until Task 8, put a local helper in the test file that:
  - parses `vendorb`,
  - confirms suggestions,
  - binds Student ID, Activity Id, Rush Flag, Read Aloud, Student Grade and Completion Date,
  - adds Rush translations,
  - and sets objective codes.

  Task 8 replaces it.

```js
test('coverage selects 12 rows from the ELA sample, starting with Student3', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const rows = p.selectRows(doc, ela, sample);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].key.studentId, 'EdFiCertificationStudent3');
  assert.deepEqual(p.selectRows(doc, ela, sample), rows, 'deterministic');
});
test('expected payload translates values and omits blanks', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const i = sample.rows.findIndex(r => r[p.sampleCol(sample, 'Rush Flag')] === 'Red Rush Flag');
  const {payload} = p.expectedStudentAssessment(doc, ela, sample, i);
  assert.match(payload.eventCircumstanceDescriptor, /EventCircumstanceDescriptor#Red Rush Flag$/);
  assert.equal(payload.administrationDate, '2024-09-01');
  const j = sample.rows.findIndex(r => r[p.sampleCol(sample, 'Rush Flag')] === '');
  assert.ok(!('eventCircumstanceDescriptor' in p.expectedStudentAssessment(doc, ela, sample, j).payload));
});
test('an untranslated value is reported as cannot-check, not guessed', () => {
  const p = loadPrototype(), {doc, ela, sample} = demo(p);
  const i = sample.rows.findIndex(r => /Passages/.test(r[p.sampleCol(sample, 'Read Aloud')]));
  const {cannot} = p.expectedStudentAssessment(doc, ela, sample, i);
  assert.ok(cannot.some(c => /accommodations/.test(c.path) && c.reason === 'untranslated'));
});
test('endpoints derive from the mapping', () => {
  const p = loadPrototype(), {doc} = demo(p);
  const ids = p.deriveEndpoints(doc, p.currentSamples(byProduct(p, 'p2'))).map(e => e.id);
  ['assessments','objectiveAssessments','studentAssessments','eventCircumstanceDescriptors']
    .forEach(id => assert.ok(ids.includes(id), id));
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the functions under Interfaces.**
- [ ] **Step 4: Run the tests.** Expected: PASS. Coverage must come to exactly 12 rows: the 12 grade values
  dominate. If it doesn't, check the tie-break.
- [ ] **Step 5: Commit** with message `feat: derive run endpoints, rows and expected payloads from mapping and sample`.

---

### Task 6: Reviewer-owned run scope

**Files:** Modify the submission-state section, `startRun` and `isStale` in `certification-prototype.html`.
Test file.

**Interfaces:**
- **State.** `sub.runScope = {excluded:{[endpointId]:{reason, by, at}}, rowAdds:[{key, assessment, reason, by, at}], rowRemoves:[{key, assessment, reason, by, at}]}`
  is created lazily. `sub.scopeChangedAt` is set on every change.
- Produces:
  - **`effectiveScope(sub)`** returns
    `{mapping:v, samples:{[id]:v}, endpoints:[{id, on, reason?}], rows:{[id]:[{index, key, covers, source:'coverage'|'reviewer'}]}, orphans:[{key, assessment, kind}]}`.
    - Coverage rows minus removals, plus additions.
    - An adjustment whose key isn't in the current sample becomes an orphan with copy
      `Row no longer in sample`.
    - Exclusions for endpoints not in `deriveEndpoints` are deleted from `runScope.excluded` when it's
      computed, so a reintroduced endpoint comes back on.
  - **`setEndpointIncluded(sub, id, on, reason) -> {ok}|{ok:false, error:'A reason is required.'}`.** A
    reason is required when turning an endpoint off. Turning it back on records history without a reason.
  - **`addScopeRow(sub, assessment, key, reason)`**, **`removeScopeRow(sub, assessment, key, reason)`** and
    **`undoScopeRow(sub, assessment, key)`**: same return shape and the same reason rule (undo needs none).
    Every change writes a `hist(sub, …)` entry naming the endpoint or row and the reason.
  - **`scopeSignature(scope) -> string`**: a stable JSON of the endpoints' on flags and the row keys per
    assessment.
- **Run pinning.** `startRun` on Assessments pins `r.pinned.scope = effectiveScope(sub)`. `isStale` is also
  true when `scopeSignature(r.pinned.scope) !== scopeSignature(effectiveScope(sub))`.

- [ ] **Step 1: Write the failing tests.**

```js
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
  p.addScopeRow(sub, 'VENDORB-DIAGNOSTIC-ELA', key, 'Spot check');
  p.uploadArtifact(sub, 'sample', 'ela-small.csv', false, 'VENDORB-DIAGNOSTIC-ELA');
  p.currentSample(sub, 'VENDORB-DIAGNOSTIC-ELA').rows.splice(50);   /* drop row 99 */
  const s = p.effectiveScope(sub);
  assert.ok(s.orphans.some(o => o.key.studentId === 'EdFiCertificationStudent99'));
  assert.ok(!s.rows['VENDORB-DIAGNOSTIC-ELA'].some(r => r.key.studentId === 'EdFiCertificationStudent99'));
});
test('an endpoint that drops out and returns comes back on', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.setEndpointIncluded(sub, 'accommodationDescriptors', false, 'x');
  const draft = p.openMappingDraft(sub);
  const ra = draft.doc.elements.find(e => e.name === 'Read Aloud');
  const keep = ra.targets; ra.targets = [];
  p.generateMapping(sub); p.effectiveScope(sub);
  ra.targets = keep; p.generateMapping(sub);
  assert.equal(p.effectiveScope(sub).endpoints.find(e => e.id === 'accommodationDescriptors').on, true);
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the functions under Interfaces.**
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: add reviewer-owned run scope pinned by runs`.

---

### Task 7: Simulated GETs, comparison and computed run results

**Files:** Modify in `certification-prototype.html`:
- remove `ASSESSMENT_RESULTS` and `assessmentResults`
- update `ST_LABEL`, `resultTally`, `finishRun`
- update the Assessments branch of `runResults`, the runs table's outcome cell, and the reviewer submission
  view's run summary

Test file.

**Interfaces:**
- **Labels.** `ST_LABEL` gains:
  - `'fail-notfound':['bad','Record not found']`
  - `'fail-notloaded':['bad','Descriptor not loaded']`
  - `cannot:['warn','Cannot check']`
  - `excluded:['muted','Excluded by reviewer']`

  Add `.warn` (amber) and `.muted` badge styles if they're missing.
- Produces:
  - **`simulateResponses(expected, mode) -> observed`.**
    - `expected` is `{assessments:[…], objectiveAssessments:[…], studentAssessments:[{key, payload}], descriptors:{[endpointId]:string[]}}`
      and `observed` has the same shape.
    - Both `'pass'` and `'realistic'` apply harmless diffs: `administrationDate` becomes
      `<date>T00:00:00Z`, `assessmentTitle` gets a trailing space, and `maxRawScore` becomes `'800.0'`.
    - `'realistic'` also injects these, deterministically, into the selected rows in order:
      - the first row with both Phonics and Vocabulary scores gets them swapped;
      - the next row is not returned;
      - the next row loses `whenAssessedGradeLevelDescriptor`;
      - the first vendor-namespace value of the first vendor descriptor endpoint is not loaded.
  - **`compareValue(type, expected, observed) -> {st, why?}`.** This is the §9.1 normalization.
    - Strings are trimmed.
    - Integer, Decimal, Percentile and Percentage values are parsed as numbers. If one can't be parsed, the
      result is `fail-type`.
    - Dates are parsed to instants.
    - Descriptors are compared case-insensitively on the part after `#`, with the namespace exact.
    - Booleans are compared case-insensitively.
  - **`runAssessmentChecks(sub, scope, mode)`** returns
    `{kind:'assessments', endpoints:[{id, resource, kind, excluded, reason?, records:[{label, key?, fields:[{path, type, expected, observed, st, why?}]}]}]}`.
    - Keyed collections are matched by key, not position.
    - Cannot-check fields come from `expectedStudentAssessment().cannot`.
    - An assessment with no sample gets one record, `label:'No sample data for this assessment'`, whose
      fields are all `cannot`.
    - An excluded endpoint lists its would-be records with all fields `excluded`.
  - **`resultTally(results)`** returns `{pass, fail, cannot, excluded, notAttempted:0, total, unit:'field checks'}`
    for Assessments. `total` counts pass + fail.
  - **Outcome.** `finishRun` sets `r.outcome = t.fail === 0 ? 'passed' : 'failed'`. A cannot-check result
    never fails a run.
- **UI.**
  - Run results are grouped endpoint → record → field.
  - An amber banner lists the cannot-check reasons, each with a count and an anchor link to its first field.
  - The runs table outcome reads `Passed · <n> cannot check` (or `Failed · …`) when `n > 0`.
  - The reviewer submission view shows the same count beside the qualifying run.

- [ ] **Step 1: Write the failing tests.**

```js
test('realistic run surfaces each new kind and cannot-check never fails a run', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const res = p.runAssessmentChecks(sub, p.effectiveScope(sub), 'realistic');
  const sts = res.endpoints.flatMap(e => e.records.flatMap(r => r.fields.map(f => f.st)));
  ['fail-value','fail-notfound','fail-missing','fail-notloaded','cannot'].forEach(k => assert.ok(sts.includes(k), k));
  const pass = p.runAssessmentChecks(sub, p.effectiveScope(sub), 'pass');
  const t = p.resultTally(pass);
  assert.equal(t.fail, 0);
  assert.ok(t.cannot > 0, 'untranslated Passages value is cannot-check');
});
test('harmless formatting differences pass after normalization', () => {
  const p = loadPrototype();
  assert.equal(p.compareValue('Date', '2024-09-01', '2024-09-01T00:00:00Z').st, 'pass');
  assert.equal(p.compareValue('Decimal', '800', '800.0').st, 'pass');
  assert.equal(p.compareValue('Integer', '40', 'forty').st, 'fail-type');
  assert.equal(p.compareValue('Descriptor', 'uri://ed-fi.org/GradeLevelDescriptor#First grade',
    'uri://ed-fi.org/GradeLevelDescriptor#first Grade').st, 'pass');
});
test('an assessment with no sample is cannot-check, not a failure', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const res = p.runAssessmentChecks(sub, p.effectiveScope(sub), 'pass');
  const st = res.endpoints.find(e => e.id === 'studentAssessments');
  assert.ok(st.records.some(r => r.label === 'No sample data for this assessment'));
});
test('excluding studentAssessments marks rows excluded and fails nothing', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.setEndpointIncluded(sub, 'studentAssessments', false, 'Reviewing assessment metadata only');
  const t = p.resultTally(p.runAssessmentChecks(sub, p.effectiveScope(sub), 'pass'));
  assert.equal(t.fail, 0);
  assert.ok(t.excluded > 0);
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the model functions.** Then replace every `assessmentResults(...)` call:
  - In `finishRun`, use `runAssessmentChecks(sub, r.pinned.scope, mode)`.
  - In seeded runs, use `runAssessmentChecks(sub, effectiveScope(sub), mode)`, and set `pinned.scope`
    to the same scope.
- [ ] **Step 4: Update the run results UI and runs table as described under UI.**
- [ ] **Step 5: Run the whole test file.** Expected: PASS. Update tests that asserted on
  `ASSESSMENT_RESULTS` or the old `'element checks'` unit.
- [ ] **Step 6: Commit** with message `feat: compute assessments run results from expected payloads`.

---

### Task 8: Demo seed

**Files:** Modify `seed()` and add `buildDemoMapping` in `certification-prototype.html`. Test file. Replace
the temporary `demo()` test helper from Task 5 with one that calls `buildDemoMapping`.

**Interfaces:**
- **`buildDemoMapping({name, namespace, idPrefix}) -> MappingDoc`.** It parses `vendorb`, rewrites product,
  namespace and identifiers (`<idPrefix>-DIAGNOSTIC-ELA` / `-MATH`), then acts as the vendor:
  - **Identity elements.** Adds *Student ID* (String → `studentAssessment.studentReference`, column
    `Student ID`) and *Activity Id* (String → `studentAssessment.studentAssessmentIdentifier`, column
    `Activity Id`).
  - **Column bindings.** Confirms all suggestions, then binds:
    - Scale Score → `Overall Scale Score`
    - Placement Level → `Overall Placement`
    - Relative Placement → `Overall Relative Placement`
    - Duration (minutes) → `Duration (min)`
    - Most Recent Diagnostic (Y/N) → `Most Recent Diagnostic YTD (Y/N)`
    - Mid On-Grade Level Score → `Mid On Grade Level Scale Score`
    - each `Reading Comprehension: <X> …` → `Comprehension: <X> …`
    - each `<D> Placement Level` → `<D> Placement`
    - Date → `Completion Date` (`M/D/YY`)
    - Grade → `Student Grade`
  - **Translations:**
    - Baseline `Y`→`true`, `N`→`false`
    - Most Recent `Y`→Latest Diagnostic, `N`→Previous Diagnostic
    - both rush flags
    - Read Aloud `Off` and `Directions, Questions, and Answer Choices` (**not** the `…and Passages` value)
    - the three norming windows
    - English and Spanish
    - grades `1`–`12` → `First grade`…`Twelfth grade`, enabling those standard values
  - **Objective codes:** `<idPrefix>-ELA-PA`, `-PH`, `-HFW`, `-VOC`, `-RC`, `-RCL` and `-RCI`, in objective
    order.
- **Seed changes:**
  - **`s2`:**
    - The ELA slot is v1 with `SAMPLE_ELA` content (`vendorb-ela-sample.csv`). There's no Math slot, so it
      stays Incomplete.
    - Push mapping **v2** (`source:'tool'`) built from `buildDemoMapping({name:'Vendor B Diagnostic', namespace:'uri://vendor-b.example.com/', idPrefix:'VENDORB'})`,
      with its issues computed against the current samples.
    - The existing failed seeded run stays pinned to v1 and is computed against v1, which shows identity
      fields missing. It is stale.
  - **`f2`:**
    - Keep v3 untouched.
    - Push **v4** from `buildDemoMapping({name:'Northwind Assess', namespace:'uri://northwind.example.com/', idPrefix:'NORTHWIND'})`,
      carrying v3's `issueNotes` forward.
    - Add the ELA sample to its ELA slot and a Math sample to its Math slot, both with `SAMPLE_ELA` content,
      so it's complete.
    - Exclude `accommodationDescriptors` with reason `Accommodation descriptors are loaded by the district, not the vendor.`
    - **Then** add a completed `'pass'` run pinned to all of the above, with matching history entries. Its
      older run is stale.
  - **`f4`:** its mapping version is replaced by a tool version from
    `buildDemoMapping({name:'Acme Assessments', namespace:'uri://acme.example.com/', idPrefix:'ACME'})`,
    with a complete ELA and Math sample. Its seeded pass run is computed from these.

- [ ] **Step 1: Write the failing tests.**

```js
test('s2 seed: mapping v2 from the tool, ELA sample only, Passages untranslated', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  const cur = p.currentVersion(sub, 'mapping');
  assert.equal(cur.v, 2); assert.equal(cur.source, 'tool');
  assert.ok(cur.issues.some(i => i.kind === 'untranslated'));
  assert.equal(p.wouldStamp(sub), 'Incomplete');
});
test('f2 seed: v3 intact, v4 current, one exclusion before a current passed run', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  assert.equal(sub.artifacts.mapping[2].issues.length, 4, 'v3 unchanged');
  assert.equal(p.currentVersion(sub, 'mapping').v, 4);
  assert.equal(p.effectiveScope(sub).endpoints.find(e => e.id === 'accommodationDescriptors').on, false);
  const q = p.gate(sub).qualifying;
  assert.ok(q && !p.isStale(sub, q) && q.outcome === 'passed');
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `buildDemoMapping` and the seed changes.** Keep all data above `seed()`
  (TDZ).
- [ ] **Step 4: Run the whole test file.** Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: seed the demo with sample-driven assessments mappings and scope`.

---

### Task 9: Mapping tool UI for columns, translations, dates and objective codes

**Files:** Modify the mapping screen (`mappingScreen` and its element and checks views) and the action
handlers in `certification-prototype.html`. Test file.

**Interfaces:**
- Consumes: Task 2 and Task 3 functions, and `currentSamples(sub)`.
- **UI:**
  - **Element row: sample column.** When a sample exists for the element's assessment, the row shows a
    `Sample column` select over its columns.
    - A suggestion is shown with a "Suggested" badge and a `Confirm` button.
    - The element view toolbar has `Confirm all suggestions`, and opening the tool runs
      `suggestSampleColumns` for unbound elements.
  - **Element row: values.** Enumeration and Boolean-result rows show a `Values` expander. It is a table of
    distinct sample values; each row has a bank-value select (descriptor kind) or a result input (result
    kind), and an untranslated row has an amber `Untranslated` badge.
  - **Element row: dates.** Date rows show a format select over `DATE_FORMATS`.
  - **Product & assessments:** an `Objective codes` table per assessment.
  - **Read-only.** The reviewer's read-only view shows all of the above without controls.
  - **Issues.** New issue kinds render in the existing issues tab grouping.
- Every edit calls `markDraftDirty(sub)` and re-renders.

- [ ] **Step 1: Write the failing test.** This is a render smoke test, the same style as existing
  mapping-screen tests.

```js
test('mapping screen shows sample columns, suggestions and translations', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p2');
  p.openMappingDraft(sub);
  const html = p.mappingScreen(sub.id, 'elements', false);
  ['Sample column','Confirm all suggestions','Untranslated','Objective codes'].forEach(s => assert.ok(html.includes(s), s));
  const ro = p.mappingScreen(sub.id, 'elements', true);
  assert.ok(!ro.includes('Confirm all suggestions'));
});
```

- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement the UI and its `data-act` handlers** (`samplecol`, `confirmcol`,
  `confirmallcols`, `translate`, `datefmt`, `objcode`).
- [ ] **Step 4: Run the tests.** Expected: PASS. Then open the HTML in a browser, import the as-is workbook
  on `s2` and confirm suggestions appear.
- [ ] **Step 5: Commit** with message `feat: bind sample columns and value translations in the mapping tool`.

---

### Task 10: In-scope resources preview and the reviewer Run scope card

**Files:** Replace the Assessments `scenarioTable` branch of `vendorNewRun`, add a card to
`reviewerSubmission`, and add a reason modal and handlers in `certification-prototype.html`. Test file.

**Interfaces:**
- Consumes: `effectiveScope`, `deriveEndpoints`, `expectedAssessment`, `expectedObjectives`,
  `expectedStudentAssessment`, `unmappedColumns`, `setEndpointIncluded`, `addScopeRow`, `removeScopeRow`,
  `undoScopeRow`.
- Produces: `inScopePanelHTML(sub, editable) -> string`. `APP.scopeView = {endpoint, record}` holds the
  expanded endpoint and the record picker choice.
- **Panel content (spec §5.7):**
  - **Header:** `from mapping v<n> · sample data <title> v<n> (<rows> rows, <selected> selected)` per slot.
  - **One row per endpoint:** an on/off state (a toggle when `editable`, otherwise a badge), record count,
    field count and descriptor count, and for an excluded endpoint `Excluded by reviewer: "<reason>"`.
  - **Expanded endpoint:**
    - the GET request(s);
    - the fields table: path, source element, sample column, rule;
    - the descriptors checked;
    - cannot-check fields with their reason;
    - the expected payload as pretty JSON in a `<pre>`, with a record picker;
    - for `studentAssessments`, the selected rows with their `covers` text and `source`.
  - **`Sample columns not checked`:** a list per slot.
  - **Orphans:** shown with `Row no longer in sample`.
- **Reviewer card.** The `Run scope` card on `reviewerSubmission` uses `inScopePanelHTML(sub, true)`.
  - Toggling off, adding a row (a picker over all sample rows, labelled by Student ID and grade) and
    removing a row each open a modal with a required reason. An empty reason shows
    `A reason is required.` and doesn't submit.
  - The card also shows the qualifying run's cannot-check count (from Task 7).
- **Vendor screen.** `vendorNewRun` uses `inScopePanelHTML(sub, false)` in place of the old fixed table.
  Keep the GET-only and D24 notes.

- [ ] **Step 1: Write the failing tests.**

```js
test('vendor sees the derived scope read-only, with exclusions and reasons', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  const html = p.inScopePanelHTML(sub, false);
  ['In-scope resources','studentAssessments','Excluded by reviewer','Sample columns not checked'].forEach(s => assert.ok(html.includes(s), s));
  assert.ok(!html.includes('data-act="scopetoggle"'));
});
test('reviewer panel exposes scope controls and a payload preview', () => {
  const p = loadPrototype(), sub = byProduct(p, 'p5');
  p.APP.scopeView = {endpoint:'studentAssessments', record:0};
  const html = p.inScopePanelHTML(sub, true);
  assert.ok(html.includes('data-act="scopetoggle"'));
  assert.ok(html.includes('&quot;studentAssessmentIdentifier&quot;') || html.includes('"studentAssessmentIdentifier"'));
  assert.ok(/covers:/.test(html));
});
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement the panel, the card, the modal and the handlers** (`scopetoggle`, `scopeexpand`,
  `scoperecord`, `scopeaddrow`, `scoperemoverow`, `scopeundo`).
- [ ] **Step 4: Run the tests.** Expected: PASS. Then check in a browser:
  - As the reviewer on `f2`: exclude an endpoint (an empty reason is blocked), then add a row.
  - As the vendor on `s2`: the start screen shows the preview read-only, with Math as
    `No sample data for this assessment`.
  - Start a realistic run and see each new result kind, plus the `cannot check` count.
- [ ] **Step 5: Commit** with message `feat: show in-scope resources with expected payloads and reviewer scope controls`.

---

### Task 11: PRD updates and final verification

**Files:** Modify `docs/PRD-Certification-v2.md`.

**Content (from spec §8):**
- **§7.3 / §7.5:** Assessments automated validation is GETs comparing shape and values against expected
  payloads derived from sample data through the mapping. It uses a coverage-based row subset and the new
  result kinds, and *Cannot check* never fails a run but is visibly flagged.
- **§7.4 FT4, mapping tool:** CoS bullets for sample-column suggestions confirmed by the vendor, value
  translations (keyed by target), date format, objective identification codes and the four new issue kinds.
- **§7.4 FT4, artifacts:** one sample slot per assessment, a sample counts as complete only when every
  mapped assessment has one, and runs pin per slot.
- **§7.6 FT6:** the reviewer *Run scope* card (narrow only, reasons required, visible to the vendor).
- **§7.9 FT9:** audit entries for scope changes. Runs pin scope, and scope changes stale earlier runs.
- **Decisions:** add proposed D29–D31 per the spec. Record the translation alternatives (sample already in
  Ed-Fi form; platform-inferred translations confirmed by the reviewer) as considered and set aside, each
  with its revisit condition.
- **§15:** mark OQ1 and OQ7 as partly answered for Assessments, with links to the spec.

- [ ] **Step 1: Edit the PRD sections listed above.** Match the existing "(added 2026-11-17)" annotation
  style.
- [ ] **Step 2: Run the prototype tests.** Run
  `node --test docs/prototypes/certification-prototype.test.mjs`. Expected: all PASS.
- [ ] **Step 3: Run the build.** Run `npm run build` from the repo root, as AGENTS.md requires. Expected:
  exit 0. The prototype isn't part of the build, but the rule applies to every change.
- [ ] **Step 4: Commit** with message `docs: add assessments run scope and expected payload requirements to certification PRD`.
