# Assessments Mapping Validation Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The prototype validates a vendor's mapping workbook against per-assessment sample data and shows a mapping validation report. The report has a readiness checklist with fix locations, then the endpoints and expected responses. Assessments runs are gated on that report and compare against it.

**Architecture:** A Node converter turns a real `.xlsx` and `.csv` into a fixture object. Fixtures are embedded in the single-file prototype. A pure validator `validateMapping(workbook, samples)` turns a fixture into a report and an internal model. Expected-payload builders, row selection and endpoint derivation work from that model. Submissions hold fixture-backed artifacts. A cached `reportFor(sub)` drives the gate, the start-run screen, the reviewer view and runs.

**Tech Stack:** Vanilla JS in `docs/prototypes/certification-prototype.html`. Tests use `node:test` and run against the existing `loadPrototype()` eval harness. The converter is a Node ESM script (Node v24), standard library only.

**Spec:** `docs/design/2026-11-17-mapping-validation-report-design.md` (§ numbers below refer to it).

## Global Constraints

- **No external dependencies**, in either the page or the converter.
- **Tests run by file:** `node --test docs/prototypes/certification-prototype.test.mjs` and
  `node --test docs/prototypes/tools/build-fixture.test.mjs`. Never run them by directory.
- **TDZ:** `seed()` is an IIFE that runs at load. Any `const` it reaches, directly or through a function,
  must be declared **above** `/* ---------- mutable application state ---------- */`, or be a `function`
  declaration.
- **Action names:** every new `data-act` action is added to the `bind()` switch. Non-click actions go in
  `ACTION_EVENT`.
- **Escaping:** every vendor-provided string goes through `esc()` before it reaches HTML.
- **Formatting:** `.editorconfig` applies: LF line endings, 2-space indentation, a final newline and no
  trailing whitespace.
- **Copy strings, verbatim:**
  - Verdict banners: `Ready to run` / `Not ready to run: N errors`
  - Under the not-ready verdict: `Fix these in the workbook or sample, then re-upload.`
  - Category labels, in this order: `Assessments`, `Element ↔ column links`, `Ed-Fi targets`, `Values`,
    `Pre-arranged columns`, `Objectives`
  - Informational lines: `Sample columns not checked`, `Derived objective codes`
  - Endpoint section while not ready: `Available once ready`
  - Hint format: `Did you mean \`X\`?` and `Closest: \`X\``
  - Tag on pre-arranged fields: `Pre-arranged`
  - Toggle: `Show sample row`
  - Assessments artifact labels: `Mapping workbook`, `Sample data — <Assessment Type>`
  - Reference panel: `Required sample columns`
  - Shortcut: `Load fixture set`
- **Finding shape:** every finding is
  `{severity:'error'|'warning', category, file:'Workbook'|'Sample', where, row|null, message, hint|null, count|null}`.
  It renders as `<file> › <where>[ row N]: <message>. <hint>[ N rows.]` (§4.6).
- **Vendor name:** fixtures are committed as **Vendor B**. The strings `i-Ready`, `cainc` and
  `Curriculum Associates` must not appear anywhere under `docs/prototypes/`.
- **Decision IDs:** use D32–D36 in the PRD. Don't use D27–D31.

## Review Focus

1. **Whitespace and case in workbook headers and cells.** A header like `Code Value ` or ` Element`, or a
   blank trailing row, must not make a workbook malformed or produce phantom elements.
   Test: `validator trims headers and skips blank rows` (Task 3).
2. **Duplicate sample header.** The real sample has two `Student ID` columns. The first is used, and there's
   one warning.
   Test: `duplicate sample header uses the first and warns` (Task 3).
3. **An empty assessment.** An assessment with no element rows, or a sample with zero rows, produces
   findings and doesn't throw.
   Test: `empty assessment and empty sample are findings, not exceptions` (Task 3).
4. **A workbook but no samples.** The verdict is not ready, the endpoint section stays collapsed and
   nothing throws.
   Test: `report with no samples renders the checklist and a collapsed endpoint section` (Task 8).
5. **Markup in vendor strings.** A Code Value or element name containing `<`, `&` or `"` shows as text in
   the report and the JSON.
   Test: `report escapes vendor strings` (Task 8).

---

### Task 1: Converter, and the Vendor B fixture

**Files:**
- Create: `docs/prototypes/tools/build-fixture.mjs`
- Create: `docs/prototypes/tools/build-fixture.test.mjs`
- Modify: `docs/prototypes/certification-prototype.html`: add a fixtures block **above** the
  mutable-state marker.
- Reference: `git show archive/mapping-tool-v1:docs/prototypes/tools/build-sample-data.mjs` (quote-aware
  CSV parser to copy).

**Interfaces:**
- Produces, as exports of `build-fixture.mjs`:
  - `readXlsx(buf: Buffer) → {[tab:string]: Array<{[header:string]: string}>}`
    - It parses the zip central directory, inflates entries with `zlib.inflateRawSync`, and resolves
      shared strings and inline strings.
    - Header cells are trimmed.
    - Column H has no header in the workbook, so a missing header becomes the column letter (`'H'`).
    - Fully blank rows are dropped.
  - `parseCsv(text: string) → {columns: string[], rows: string[][]}`. Copied from v1. A BOM is
    stripped.
  - `renameAll(value: any, pairs: Array<[from:string, to:string]>) → any`. A deep string replace
    applied to every string in the value.
  - `toFixture({name, workbook, samples}) → {name, workbook, samples}`. `samples` is keyed by
    Assessment Type.
- CLI:
  `node build-fixture.mjs --name <id> --workbook <xlsx> --sample "<Assessment Type>=<csv>" [--sample …] [--rename "from=to" …] [--out <html>]`.
  - With `--out`, it replaces the text between `/* FIXTURES:BEGIN <id> */` and `/* FIXTURES:END <id> */`
    in the HTML.
  - Without it, it prints `FIXTURES['<id>'] = {...};`.
- Produces in the HTML: `const FIXTURES = {};` followed by the generated
  `FIXTURES['vendorb-original'] = …;` block.

- [ ] **Step 1: Write the failing tests** in `build-fixture.test.mjs`.
  - The tests build a tiny xlsx in memory with a helper `makeXlsx(tabs)`. It writes zip entries with
    `zlib.deflateRawSync` and `zlib.crc32`: `[Content_Types].xml`, `xl/workbook.xml`,
    `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml` and `xl/worksheets/sheetN.xml`.

```js
test('readXlsx returns tabs as header-keyed rows', () => {
  const buf = makeXlsx({EnumerationItems:[['Enumeration','Code Value '],['EventCircumstance','Red Rush Flag'],[]]});
  assert.deepEqual(readXlsx(buf).EnumerationItems, [{Enumeration:'EventCircumstance', 'Code Value':'Red Rush Flag'}]);
});
test('readXlsx names an unheaded column by its letter', () => {
  const buf = makeXlsx({ElementDefinitions:[['Element'],['Scale Score', , , , , , , '"x": "y"']]});
  assert.equal(readXlsx(buf).ElementDefinitions[0].H, '"x": "y"');
});
test('parseCsv keeps quoted commas and strips a BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\n"x, y",2\n'), {columns:['a','b'], rows:[['x, y','2']]});
});
test('renameAll replaces in every nested string', () => {
  assert.deepEqual(renameAll({a:['i-Ready ELA'], b:{c:'uri://cainc.com/X'}}, [['i-Ready','Vendor B'],['uri://cainc.com/','uri://vendorb.example/']]),
    {a:['Vendor B ELA'], b:{c:'uri://vendorb.example/X'}});
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**
  Run: `node --test docs/prototypes/tools/build-fixture.test.mjs`
  Expected: FAIL, "Cannot find module" or a missing export.

- [ ] **Step 3: Implement `build-fixture.mjs`** to the interface above.

- [ ] **Step 4: Run the tests and confirm they pass.**
  Run: `node --test docs/prototypes/tools/build-fixture.test.mjs`
  Expected: 4 pass.

- [ ] **Step 5: Generate the Vendor B fixture into the HTML.**
  1. Copy the source files into the scratchpad first. OneDrive locks the originals.
  2. Add an empty marked block and `const FIXTURES = {};` above the mutable-state marker.
  3. Run:

```bash
node docs/prototypes/tools/build-fixture.mjs --name vendorb-original \
  --workbook "<scratch>/mapping.xlsx" --sample "ELA Diagnostic=<scratch>/ela.csv" \
  --rename "Curriculum Associates=Vendor B" --rename "i-Ready=Vendor B" \
  --rename "uri://cainc.com/=uri://vendorb.example/" --rename "CAINC-IREADY=VENDORB" --rename "CA-IREADY=VENDORB" \
  --out docs/prototypes/certification-prototype.html
```

  Expected:
  - `grep -ci "i-ready\|cainc\|curriculum associates" docs/prototypes/certification-prototype.html` prints `0`.
  - The block holds the Product, Assessments, ElementDefinitions, EnumerationDefinitions and
    EnumerationItems tabs, plus `samples['ELA Diagnostic']` with 156 rows.

- [ ] **Step 6: Add a prototype test and commit.**

```js
test('Vendor B fixture is embedded with the original files', () => {
  const p = loadPrototype();
  const fx = p.FIXTURES['vendorb-original'];
  assert.equal(fx.workbook.Product[0]['Vendor Product'], 'Vendor B');
  assert.equal(fx.samples['ELA Diagnostic'].rows.length, 156);
  assert.ok(fx.workbook.ElementDefinitions.some(r => /Math/.test(r['Assessment Type'])));
});
```

  Run: `node --test docs/prototypes/certification-prototype.test.mjs`. Expected: all pass.

```bash
git add docs/prototypes/tools/build-fixture.mjs docs/prototypes/tools/build-fixture.test.mjs docs/prototypes/certification-prototype.html docs/prototypes/certification-prototype.test.mjs
git commit -m "feat: add dependency-free mapping fixture converter and embed Vendor B files"
```

### Task 2: Reference data

**Files:**
- Modify: `certification-prototype.html`: everything goes above the mutable-state marker.
- Reference: the archive's `EDFI_V5_TARGETS`, `RM`, `SCORE_COLLECTIONS` and `STUDENT_FIELD` (archive
  lines ~958–1013 and ~1375).

**Interfaces:**
- `REQUIRED_TABS: {[tab]: string[]}`: required headers per tab, from design §3.1. Column H isn't required.
- `EDFI_V5_TARGETS`: ported. Add `studentAssessment.accommodations` (descriptor
  `AccommodationDescriptor`, collection) and `studentAssessment.period` (`AssessmentPeriodDescriptor`) if
  they're absent. Also `targetByPath(path) → target|null`.
- `STANDARD_DESCRIPTORS: {[DescriptorType]: string[]}`. At minimum:
  - `GradeLevelDescriptor`: `Kindergarten`, `First grade` … `Twelfth grade`
  - `AssessmentCategoryDescriptor`: includes `Diagnostic`
  - `ResultDatatypeTypeDescriptor`: `Integer`, `Decimal`, `Percentage`, `Percentile`, `Level`, `Range`,
    `Boolean`
  - `AssessmentReportingMethodDescriptor`: includes `Raw Score`, `Achievement/proficiency level`,
    `Percentile`, `Scale score`, `Relative Placement` and every `uri://ed-fi.org/…` reporting method the
    fixture references
- `PREARRANGED_COLUMNS = [{column:'Student ID', path:'studentAssessment.studentReference'}, {column:'Activity Id', path:'studentAssessment.studentAssessmentIdentifier'}]`
- `function normKey(s) → string`: lowercase, with all whitespace and punctuation removed.
- `function closest(target: string, candidates: string[]) → string|null`: normalized edit distance,
  with the threshold left to the builder.

- [ ] **Step 1: Write the failing tests.**

```js
test('normKey ignores case, whitespace and punctuation', () => {
  const p = loadPrototype();
  assert.equal(p.normKey('Reading Comprehension:  Literature'), p.normKey('reading comprehension - literature'));
});
test('closest suggests the near header', () => {
  const p = loadPrototype();
  assert.equal(p.closest('Most Recent Diagnostic (Y/N)', ['Rush Flag', 'Most Recent Diagnostic YTD (Y/N)']), 'Most Recent Diagnostic YTD (Y/N)');
  assert.equal(p.closest('Zebra', ['Rush Flag']), null);
});
test('standard descriptors cover every ed-fi URI the fixture uses', () => {
  const p = loadPrototype();
  const uris = JSON.stringify(p.FIXTURES['vendorb-original'].workbook).match(/uri:\/\/ed-fi\.org\/\w+#[^"\\]+/g);
  uris.forEach(u => { const [, type, code] = u.match(/ed-fi\.org\/(\w+)#(.+)/);
    assert.ok((p.STANDARD_DESCRIPTORS[type] || []).includes(code), u); });
});
```

- [ ] **Step 2: Run the tests.** Expected: FAIL with `ReferenceError`.
- [ ] **Step 3: Implement** the bindings above.
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit**: `feat: add reference data for mapping validation`.

### Task 3: Validator: workbook, links, targets, enumerations, values, pre-arranged columns

**Files:** Modify `certification-prototype.html`: function declarations below the marker are fine.
Tests go in the prototype test file.

**Interfaces:**
- `function validateMapping(workbook, samples) → Report`.
- `Report = {verdict:'ready'|'not-ready'|'malformed', errors:number, warnings:number, findings:Finding[], categories:Array<{id, label, status:'ok'|'warning'|'error', errors, warnings}>, model:Model|null, notChecked:{[assessmentType]: string[]}, objectives:{[assessmentType]: Array<{code, key}>}}`.
- Category ids: `assessments`, `links`, `targets`, `values`, `prearranged`, `objectives`. Labels are in
  Global Constraints.
- `Model = {product:{name, namespace}, assessments:Array<Assessment>}`, where:
  - `Assessment = {type, identifier, title, category, adaptive, family, maxRawScore, sample:{name, columns, rows}|null, elements:Element[], idColumns:{student:number, activity:number}}`
  - `Element = {row, name, targets:string[], column:number (-1 if unlinked), reportingMethod:uri|null, resultDatatype:string|null, descriptorType:string|null, codes:string[]|null, objective:string|null}`
  - `codes` holds the allowed values after enumeration resolution (§4.3a).
  - **Column G** is split on `/` into target paths. For example,
    `assessment.scores/studentAssessment.scoreResults` yields two targets. Each part must pass
    `targetByPath`, or it's an `Ed-Fi targets` error naming the part, with `closest` over the known paths.
  - `descriptorType` comes from the first descriptor-typed target.
- **Malformed:** a missing tab or required header gives `verdict:'malformed'`, `model:null`, and one
  error per missing item.
- **Assessment Type matching:** an ElementDefinitions Assessment Type is matched to an Assessments-tab
  type exactly, ignoring case. If that fails, it falls back to the closest match **only for the
  suggestion**. The element is still unassigned, and that's an error.
- **Duplicate sample headers:** the first occurrence is used, with one warning per duplicate.

- [ ] **Step 1: Write the failing tests.**
  - Use the Vendor B original fixture.
  - Small inline fixtures are built by a test helper `wb(overrides)` that clones the original and
    patches tabs.

```js
const f = (r, pred) => r.findings.filter(pred);
test('missing tab makes the workbook malformed', () => {
  const p = loadPrototype(); const fx = structuredClone(p.FIXTURES['vendorb-original']);
  delete fx.workbook.EnumerationItems;
  const r = p.validateMapping(fx.workbook, fx.samples);
  assert.equal(r.verdict, 'malformed'); assert.match(r.findings[0].message, /EnumerationItems/);
});
test('original files are not ready', () => {
  const p = loadPrototype(); const fx = p.FIXTURES['vendorb-original'];
  const r = p.validateMapping(fx.workbook, fx.samples);
  assert.equal(r.verdict, 'not-ready'); assert.ok(r.errors > 0);
});
test('assessment type mismatch suggests the Assessments tab name', () => {
  /* ElementDefinitions says "Vendor B ELA Diagnostic"; Assessments says "ELA Diagnostic" */
  const r = /* original */;
  assert.ok(f(r, x => x.category === 'assessments' && x.hint === 'Did you mean `ELA Diagnostic`?').length);
});
test('assessment with no sample is an error', () => {
  assert.ok(f(r, x => x.category === 'assessments' && /Math Diagnostic/.test(x.where) && x.severity === 'error').length);
});
test('unlinked element suggests a column', () => {
  const x = f(r, x => x.category === 'links' && /Most Recent Diagnostic \(Y\/N\)/.test(x.message))[0];
  assert.equal(x.hint, 'Did you mean `Most Recent Diagnostic YTD (Y/N)`?'); assert.equal(x.file, 'Workbook'); assert.equal(x.row, 3);
});
test('accommodation enumeration misspelling is an error with a suggestion', () => {
  assert.ok(f(r, x => /AccommodationDescriptor/.test(x.message) && x.hint === 'Did you mean `Accomodation`?').length);
});
test('grade values are checked against the standard list', () => {
  /* on corrected links (see helper linkAll) so the value rule runs */
  const x = f(r2, x => x.category === 'values' && x.file === 'Sample' && /`3`/.test(x.message))[0];
  assert.equal(x.hint, 'Closest: `Third grade`'); assert.ok(x.count > 0);
});
test('Y/N in a Boolean result is an error', () => { /* Baseline Diagnostic (Y/N) → message names `Y` */ });
test('M/D/YY date is an error with the ISO hint', () => { /* hint === 'expected YYYY-MM-DD' */ });
test('missing pre-arranged column is an error', () => { /* drop Activity Id from a cloned sample */ });
test('duplicate sample header uses the first and warns', () => { /* original sample has two Student ID */ });
test('validator trims headers and skips blank rows', () => { /* pad a header with spaces, add an all-blank row → same findings as the original */ });
test('empty assessment and empty sample are findings, not exceptions', () => { /* rows:[] sample; assessment with no elements */ });
test('values are reported once per distinct value with a row count', () => {
  const xs = f(r2, x => x.category === 'values' && /`Off`/.test(x.message)); assert.equal(xs.length, 1); assert.ok(xs[0].count > 1);
});
```

  `r2` is the result after a test helper `linkAll(fx)` renames sample headers using the archive's
  binding list (archive lines ~2675–2683, reused as `LINK_FIXES` in Task 5). Write `linkAll` in the
  test file now. Task 5 replaces it with the production `CORRECTIONS`.

- [ ] **Step 2: Run the tests.** Expected: FAIL with `ReferenceError: validateMapping`.
- [ ] **Step 3: Implement `validateMapping`** following design §4.1–§4.4 and §4.3a, in category order.
  - Value checks only run for linked elements of assessments that have a sample.
- [ ] **Step 4: Run the tests.** Expected: all pass. Write the original fixture's error and warning
  counts in the ledger.
- [ ] **Step 5: Commit**: `feat: validate mapping workbook and sample data into findings`.

### Task 4: Objectives, expected payloads, rows, endpoints

**Files:** Modify `certification-prototype.html`. Reference the archive functions named in design §10.

**Interfaces:**
- `validateMapping` fills `Element.objective` and `Report.objectives` per design §4.5 (corrected rule),
  and adds `objectives` category findings.
- `function expectedAssessment(model, a) → object`
- `function expectedObjectives(model, a) → Array<{code, key, payload}>`
- `function expectedStudentAssessment(model, a, rowIndex) → object`
  - `studentReference` and `studentAssessmentIdentifier` come from `a.idColumns`.
  - Blank cells are omitted.
  - A descriptor becomes `<namespace><DescriptorType>#<code>` (vendor) or `uri://ed-fi.org/<Type>#<code>`
    (standard).
  - A Boolean result is the string `true` or `false`, as posted.
- `function selectRows(model, a) → Array<{index, key:{studentId, activityId}, why:string}>`
  - `why` is the first feature covered, as in `first Red Rush Flag`.
  - Ported greedy set cover; ties go to the lower index.
- `function deriveEndpoints(model) → Array<{id, resource, recordCount, fieldCount, descriptors:string[]}>`
  - ids, in order: `assessments`, `objectiveAssessments` (only when objectives exist),
    `studentAssessments`, then one `descriptor:<Type>` per descriptor type used.
- These functions are only called on a `ready` report's model. Callers guard.

- [ ] **Step 1: Write the failing tests.** They use `linkAll` plus value fixes in a test helper until
  Task 5.

```js
test('objective code drops the suffix of the same-method assessment element', () => {
  /* Phonics Scale Score reports Raw Score; Scale Score reports Raw Score → code "Phonics" */
  assert.ok(r2.objectives['ELA Diagnostic'].some(o => o.code === 'Phonics'));
});
test('double-spaced objective names share one normalized key, warn, and keep the first spelling', () => {
  assert.ok(f(r2, x => x.category === 'objectives' && x.severity === 'warning' && /Literature/.test(x.message)).length);
});
test('expected student assessment carries pre-arranged identity and vendor descriptor URIs', () => {
  const pl = p.expectedStudentAssessment(m, a, i /* first Red Rush Flag row */);
  assert.equal(pl.eventCircumstanceDescriptor, 'uri://vendorb.example/EventCircumstanceDescriptor#Red Rush Flag');
  assert.ok(pl.studentReference.studentUniqueId); assert.ok(pl.studentAssessmentIdentifier);
});
test('row selection covers every distinct descriptor value and objective', () => {
  const rows = p.selectRows(m, a); assert.ok(rows.length > 0 && rows.length < a.sample.rows.length);
  assert.ok(rows.every(x => x.why));
});
test('endpoints are derived in order', () => {
  assert.deepEqual(p.deriveEndpoints(m).slice(0, 3).map(e => e.id), ['assessments', 'objectiveAssessments', 'studentAssessments']);
});
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Port and adapt from the archive. Drop translations, the bank and
  "cannot".
- [ ] **Step 4: Run the tests.** Expected: all pass.
- [ ] **Step 5: Commit**: `feat: build expected payloads, rows and endpoints from a validated mapping`.

### Task 5: Corrected and renamed variants

**Files:** Modify `certification-prototype.html`, above the marker.

**Interfaces:**
- `CORRECTIONS = {workbook:[{why, apply:(wb) => void}], sample:[{why, apply:(sample) => void}]}`.
  - These are data plus small mutators. Each has a `why` written the way a vendor would describe the fix.
- `function fixtureVariant(id) → {name, workbook, samples}` for these ids:
  - `vendorb-original`
  - `vendorb-corrected`: the original, deep-cloned, with every correction applied. The workbook loses
    Math Diagnostic's Assessments row and all its elements.
  - `vendorb-malformed`: the original with `EnumerationItems` removed.
- `function renameFixture(fx, pairs) → fx`: the same semantics as the converter's `renameAll`.
- `FIXTURE_SETS = {vendorb:{workbook:'vendorb-…', samples:{…}}}`. Variant ids are offered per slot in
  Task 6.

- [ ] **Step 1: Write the failing tests.**

```js
test('corrected Vendor B files are ready to run', () => {
  const fx = p.fixtureVariant('vendorb-corrected'); const r = p.validateMapping(fx.workbook, fx.samples);
  assert.deepEqual(r.findings.filter(x => x.severity === 'error'), []); assert.equal(r.verdict, 'ready');
});
test('corrections do not mutate the original fixture', () => {
  p.fixtureVariant('vendorb-corrected');
  assert.equal(p.validateMapping(p.FIXTURES['vendorb-original'].workbook, p.FIXTURES['vendorb-original'].samples).verdict, 'not-ready');
});
test('corrected workbook has no Math Diagnostic', () => { /* Assessments and ElementDefinitions */ });
test('every correction says why', () => { assert.ok([...p.CORRECTIONS.workbook, ...p.CORRECTIONS.sample].every(c => c.why)); });
test('renamed fixture keeps the verdict', () => { /* renameFixture(corrected, [['Vendor B','Northwind']]) still ready */ });
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Write `CORRECTIONS`.**
  1. Start from the archive's binding list (archive ~2675–2683). Rename sample headers to the workbook
     element names, so objective elements keep their suffixes.
  2. Add value fixes:
     - Read Aloud values → Code Values
     - Most Recent `Y`/`N` → `Latest Diagnostic`/`Previous Diagnostic`
     - grade numbers → `GradeLevelDescriptor` codes
     - Baseline `Y`/`N` → `true`/`false`
     - dates → ISO
  3. Add workbook fixes: Assessment Type names, `Accomodation` → `Accommodation`, drop Math.
  4. Iterate until the first test passes. Every correction targets a finding the original reports.
  5. Replace the test helpers `linkAll` and the value fixes with `fixtureVariant('vendorb-corrected')`.
- [ ] **Step 4: Run the tests.** Expected: all pass, including Tasks 3–4 rewritten on the production
  variant.
- [ ] **Step 5: Commit**: `feat: add corrected, malformed and renamed Vendor B fixture variants`.

### Task 6: Submissions: workbook and per-assessment sample slots

**Files:** Modify `certification-prototype.html`: `ARTIFACTS` use, `artifactSet`, `currentVersion`,
`gate`, `isStale`, `uploadArtifact`, `startRun` pins, `uploadModal`, `suggestName` and `artifactCard`.

**Interfaces:**
- **Artifact entries** for Assessments submissions:
  - Mapping entries carry `fixture:<variant id>`.
  - Sample entries carry `{assessment:<type>, fixture:<variant id>}`. Version numbers count **per
    assessment**.
- `function isAssessments(sub) → boolean`
- `function currentSample(sub, assessmentType) → entry|null`
- `function sampleSlots(sub) → string[]`: the Assessment Types in the current workbook variant, or `[]`
  when there's no workbook or it's malformed.
- `function reportFor(sub) → Report|null`
  - It's cached on a signature of the mapping version plus each sample version.
  - It returns `null` when there's no workbook.
  - It builds samples from each slot's fixture, `samples[type]`.
- `gate(sub)`: for Assessments, `missing` lists `Mapping workbook` and each
  `Sample data — <type>` without a current version. Product documentation is unchanged.
- `isStale(sub, r)` and `startRun` pins: `r.pinned.samples = {[type]: v}`, compared per type.
- `uploadArtifact(sub, type, name, malformed, opts)`. `opts` is `{assessment, fixture}`.
  - A malformed workbook variant is rejected. It adds a history line
    `Mapping workbook upload rejected — malformed workbook (<missing items>)` and returns
    `{ok:false, errors}`.
- Every accepted upload's history line ends with the report verdict, for example
  ` — report: Not ready · 23 errors` or ` — report: Ready to run`. This covers the PRD's §7.9
  report-generated event.
- `function loadFixtureSet(sub, setId)`: uploads the workbook and every slot's sample in one step, with one
  history line per artifact.
- **Upload modal** for an Assessments mapping or sample slot:
  - Replaces the conforming/malformed radio with a variant radio. Mapping offers original, corrected and
    malformed. A sample slot offers original and corrected.
  - Links to the `Required sample columns` panel.
  - Non-Assessments models are unchanged.
- **Labels:** Assessments use `Mapping workbook`, plus one row per `Sample data — <type>`. Other models
  keep the existing labels.

- [ ] **Step 1: Write the failing tests.**

```js
test('assessments submission has one sample slot per workbook assessment', () => { /* original → ['ELA Diagnostic','Math Diagnostic'] */ });
test('gate lists each missing sample slot', () => { /* 'Sample data — Math Diagnostic' in gate(sub).missing labels */ });
test('replacing one sample slot stales runs that pinned it', () => {});
test('malformed workbook variant is rejected with history', () => {});
test('loadFixtureSet fills the workbook and every slot', () => {});
test('reportFor is recomputed when a slot version changes', () => {});
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full prototype test file.**
  - Expected: the new tests pass.
  - Existing tests that assume the old single-slot Assessments shape may fail. Record them, and fix them
    in Task 9 together with the seeds.
  - Non-Assessments tests must pass now.
- [ ] **Step 5: Commit**: `feat: give assessments submissions a mapping workbook and per-assessment sample slots`.

### Task 7: Runs and reviewer scope

**Files:** Modify `certification-prototype.html`.
- Remove `ASSESSMENT_RESULTS` and `assessmentResults`.
- Port the archive's `compareValue`, `compareRecord`, `simulateResponses`, `runAssessmentChecks`,
  `runScopeOf`, `effectiveScope`, `dropUnimpliedExclusions`, `scopeSignature`, `setEndpointIncluded`,
  `addScopeRow`, `removeScopeRow` and `undoScopeRow`.

**Interfaces:**
- `function effectiveScope(sub) → {endpoints:Array<{id, on, reason}>, rows:{[type]: Array<{index, key, why, origin:'coverage'|'added'}>}}`
  - It's derived from `reportFor(sub).model`. It's pure.
  - Exclusions that are no longer implied are dropped in `uploadArtifact` and `loadFixtureSet`, with the
    archive's history wording.
- `function runAssessmentChecks(sub, scope, mode) → {kind:'assessments', endpoints:Array<{id, records:Array<{label, why, fields:Array<{path, expected, observed, st:'pass'|'fail'|'excluded', kind?:'value'|'notloaded'|'notfound'|'objective-notfound', why}>}>}>}`
- **Modes:**
  - `pass`
  - `realistic`: exactly one each of a value mismatch, `notloaded` in a *non-excluded* endpoint,
    `notfound`, and `objective-notfound`
  - `infra`: handled by `finishRun`, unchanged
- `resultTally(r)` for Assessments returns `{pass, fail, excluded, total, unit:'field checks'}`. There's
  no `cannot`.
- `startRun` pins `r.pinned.scope = scopeSignature(effectiveScope(sub))`. `isStale` also compares it.
- `startRun` for Assessments refuses (returns `null`) unless `reportFor(sub).verdict === 'ready'`.

- [ ] **Step 1: Write the failing tests.**

```js
test('ASSESSMENT_RESULTS is gone', () => { assert.throws(() => loadPrototype().ASSESSMENT_RESULTS, ReferenceError); });
test('assessments run cannot start from a not-ready report', () => {});
test('pass run has no failures and no cannot-check', () => {});
test('realistic run has one of each failure kind, none in excluded endpoints', () => {});
test('objective matched by normalized key passes despite punctuation differences', () => {});
test('reviewer exclusion requires a reason and stales earlier runs', () => {});
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: the new tests pass. Pre-existing Assessments seed tests are
  handled in Task 9.
- [ ] **Step 5: Commit**: `feat: run assessments checks against expected responses within reviewer scope`.

### Task 8: Report UI and where it appears

**Files:** Modify `certification-prototype.html`: renderers, routes, `bind()` and `ACTION_EVENT`.

**Interfaces:**
- **Route** `#/report/<subId>`, in both `vendorScreen` and `reviewerScreen` →
  `reportPage(subId, reviewerView)`. The reviewer view is read-only, plus the `Run scope` card.
- `function reportHTML(sub, report, opts) → string`. Sections:
  1. Verdict banner, with the Global Constraints copy.
  2. Checklist: one row per category, with an icon and counts. Expanding a row (`data-act="reportcat"`)
     lists its findings grouped by `file › where`.
  3. `Sample columns not checked` and `Derived objective codes` as expandable lines.
  4. Endpoints section:
     - collapsed, with `Available once ready`, unless the report is ready
     - otherwise one line per endpoint, expandable (`reportep`)
     - a record `<select>` (`reportrec`, change event) whose options show each row's `why`
     - the expected JSON, with pre-arranged fields tagged `Pre-arranged`
     - a `Show sample row` checkbox (`reportside`, change event) that switches the record to the
       side-by-side view
  
  View state lives in `APP.reportView`.
- `function requiredColumnsHTML() → string`: the `Required sample columns` panel, opened by
  `data-act="reqcols"` as a modal.
- **Artifacts card:** the Assessments mapping row shows a verdict badge (`Ready to run` /
  `Not ready · N errors`) that links to the report.
- **Start-a-run (`vendorNewRun`):**
  - Remove the "needs a mapping CSV first" banner and the fixed in-scope table.
  - When there's no workbook, show a banner with an upload button.
  - When not ready, show a red banner "Not ready to run: N errors" that links to the report, and disable
    the start button.
  - When ready, embed the endpoints section, read-only, plus the reviewer's scope notes.
- **Run results:** rewrite `assessmentResultsHTML(r)` as endpoint → record → field, with the new result
  kinds and a legend.
- **Reviewer submission view:** a link to the report and a `Run scope` card, using the archive's
  `inScopePanelHTML` and reason modal pattern, ported.

- [ ] **Step 1: Write the failing tests.** They render HTML strings and assert on content.

```js
test('not-ready report leads with the verdict and fix locations', () => {
  const h = p.reportHTML(sub, p.reportFor(sub), {});
  assert.ok(h.indexOf('Not ready to run:') < h.indexOf('Element ↔ column links'));
  assert.match(h, /Fix these in the workbook or sample, then re-upload\./); assert.match(h, /Available once ready/);
});
test('ready report lists endpoints and tags pre-arranged fields', () => { /* /studentAssessments/, /Pre-arranged/ */ });
test('show sample row renders the side-by-side view', () => { /* APP.reportView.side = true → raw sample values present */ });
test('report with no samples renders the checklist and a collapsed endpoint section', () => {});
test('report escapes vendor strings', () => { /* inject `<b>&` into a Code Value → '&lt;b&gt;&amp;' present, '<b>&' absent */ });
test('start-a-run is disabled while the report is not ready', () => {});
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests.** Expected: the new tests pass.
- [ ] **Step 5: Manual check.**
  1. Open the HTML in a browser.
  2. As the vendor, open Vendor B's report and expand each category.
  3. Load the corrected set and check that the endpoints appear.
  4. Toggle `Show sample row`.
  5. Start a run.
  
  Note anything off in the ledger.
- [ ] **Step 6: Commit**: `feat: show the mapping validation report and gate assessments runs on it`.

### Task 9: Seeds and existing tests

**Files:** Modify the `seed()` section of `certification-prototype.html` and the existing tests.

**Interfaces:**
- **`s2` (p2, Vendor B):**
  - original workbook + original ELA sample, no Math sample
  - *Not ready*, status `incomplete`
  - its two seeded runs keep their `auth-error` and `failed` outcomes, with `failed` built by
    `runAssessmentChecks` against the corrected model
  - Rule on how stale they are, and record the ruling in the ledger
- **`f2` (p5, Northwind):** `renameFixture(corrected, [['Vendor B','Northwind'], ['vendorb','northwind'], ['VENDORB','NORTHWIND']])`
  - *Ready*, In Review
  - one passed run, built with `runAssessmentChecks(…, 'pass')`
- **`f4` (p4, Acme):** renamed the same way to Acme. *Ready*, Approved, passed run.
- **Fixtures:** renamed fixtures are registered in `FIXTURES` at load via `renameFixture`, above the
  marker.

- [ ] **Step 1: Write the failing tests.**

```js
test('seeded Vendor B assessments submission is not ready', () => {});
test('seeded Northwind and Acme submissions are ready with passed runs', () => {});
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement the seeds.** Then fix each pre-existing test that broke in Tasks 6–9.
  - Update a test only where its assertion encoded the old single-slot or `ASSESSMENT_RESULTS` shape.
  - Name each one in the commit body.
- [ ] **Step 4: Run both test files.** Expected: everything passes.
- [ ] **Step 5: Commit**: `feat: seed assessments submissions from validated Vendor B fixtures`.

### Task 10: PRD

**Files:** Modify `docs/PRD-Certification-v2.md` per design §12.

- [ ] **Step 1:**
  - Add the revision note.
  - Add §5.7 with D32–D36 (proposed), each tagged *(proposed, not yet confirmed by the certification
    workgroup)*.
  - Add paragraphs to §7.3, §7.4 (including the `Required sample columns` table and the corrected
    objective rule), §7.5, §7.6 and §7.9.
  - Mark OQ1 and OQ7 partly answered.
  - Add the new OQ on partial-assessment certification.
- [ ] **Step 2: Verify.**
  `grep -n "D27\|D28\|D29\|D30\|D31" docs/PRD-Certification-v2.md` returns nothing new.
  Both test files pass.
- [ ] **Step 3: Commit**: `docs: add assessments mapping validation report requirements to certification PRD`.
