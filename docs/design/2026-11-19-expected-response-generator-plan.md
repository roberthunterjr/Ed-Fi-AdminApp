# Assessments Expected-Response Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline Node module that resolves a vendor's workbook and samples into a reviewed, provenance-tagged mapping, then deterministically generates a readiness report and a Bruno collection of expected responses.

**Architecture:** Two stages in `docs/prototypes/tools/expected-responses/`. `resolve()` reads either template dialect and returns a resolved mapping where every value carries provenance (`stated`, `inferred`, `confirmed`, `overridden`). A representative confirms keys with the CLI. `generate()` checks the approved mapping against the samples and builds expected payloads, the report and the collection. The validation rules port from the prototype's `validateMapping`, and the prototype itself is not changed.

**Tech Stack:** Node v24 ESM, standard library only. Tests use `node:test`. Inputs reuse the converter's readers in `docs/prototypes/tools/build-fixture.mjs`, and test fixtures come from the prototype through its eval harness.

**Spec:** `docs/design/2026-11-19-expected-response-generator-design.md` (cited as *§n*). It builds on `docs/design/2026-11-17-mapping-validation-report-design.md` (cited as *MVR §n*).

## Global Constraints

- **No external dependencies.** The module, its tests and the generated collection use only the Node standard library. The collection uses only what Bruno's safe mode provides: `res`, `test` and `expect`.
- **Tests run by file:** `node --test docs/prototypes/tools/expected-responses/<name>.test.mjs`. Never run a directory; it fails with `MODULE_NOT_FOUND` on this machine.
- **Formatting:** follow `.editorconfig`: LF line endings, 2-space indentation, a final newline, no trailing whitespace.
- **Names:** no real vendor names under `docs/prototypes/`. Use Vendor B, C and D.
- **Output names, exact:** `resolved-mapping.json`, `readiness-report.md`, `readiness-report.json`, `manifest.json`, `collection/`.
- **Environment variables, exact:** `baseUrl` and `accessToken`. Request URLs are `{{baseUrl}}/ed-fi/<resource>`. The collection never contains credentials.
- **Provenance values, exact:** `stated`, `inferred`, `confirmed`, `overridden`.
- **Result kinds, exact:** `value`, `descriptor-not-loaded`, `record-not-found`, `objective-not-found`. Each Bruno test is named `[<kind>] <record label> › <path>`, where `<kind>` is the failure kind that applies if the test fails.
- **Copy strings, verbatim:**
  - `proposed key awaiting confirmation`
  - `declared, not exercised by the sample`
  - `mapped, no values in the sample, not checked`
- **Finding shape** (as in the MVR): `{severity:'error'|'warning', category, file:'Workbook'|'Sample'|'Resolved mapping', where, row|null, message, hint|null, count|null, id|null}`. `id` names the provenance value the finding is about.
- **Determinism:** the same approved resolved mapping, samples and module version give byte-identical `collection/` and `readiness-report.*`. Only `manifest.json` carries a timestamp.

## Review Focus

1. **Vendor strings that break `.bru` or JS syntax**, such as quotes, backticks, `}`, `${` or newlines in codes, titles or sample values. Expected values must survive into the collection unchanged. Test in Task 9.
2. **Query values with spaces, `#`, `/`, `:` or `&`**, such as descriptor URIs or `Reading Comprehension: Overall`. They must be percent-encoded in request URLs. Test in Task 9.
3. **Live endpoints that page results.** Every GET sets `limit=500`, so objectives and descriptors aren't silently cut at the API default of 25. Test in Task 9.
4. **A hand-edited `resolved-mapping.json` that's invalid:** an unknown provenance, `confirmed` without `by` and `when`, or `overridden` without `why`. Loading it must stop with a message naming the `id`, not generate. Test in Task 5.
5. **Duplicate `(Student ID, Activity Id)` rows in a sample.** These would produce two expected records with one key, so they're an error naming the pair and the row count. Test in Task 6.

---

## File structure

All new files live in `docs/prototypes/tools/expected-responses/` unless shown with a full path.

| File | Responsibility |
|---|---|
| `docs/prototypes/load-prototype.mjs` | `loadPrototype()`, moved out of the prototype test file so other tests can import it without running those tests |
| `fixtures.mjs` | `loadFixture(id) → {name, workbook, samples}` via the prototype's `fixtureVariant` |
| `reference.mjs` | Ed-Fi targets, standard descriptors, pre-arranged columns, text helpers (ported) |
| `provenance.mjs` | Provenance value constructors, key list, validation |
| `resolve.mjs` | `resolve()` entry point: dialect detection, shared-sample split, merge with the previous mapping |
| `resolve-extended.mjs` | Reads the extended dialect (Vendor B, C) |
| `resolve-published.mjs` | Reads the published template's shape (Vendor D) |
| `objectives.mjs` | Objective-code proposals (name derivation, header suffix, Product tab) and candidate ranking |
| `review.mjs` | `pendingKeys`, `confirm`, `override`, `diffResolved`, `loadResolved` |
| `check.mjs` | Readiness checks on the approved mapping and samples → findings |
| `expected.mjs` | Expected payloads, row selection, endpoints |
| `match.mjs` | Self-contained comparison helper, embedded into every request |
| `bruno.mjs` | `.bru` file text for the collection |
| `report.mjs` | Readiness report as Markdown and JSON |
| `cli.mjs` | `resolve`, `review`, `confirm`, `override`, `generate` commands, and the manifest |
| `*.test.mjs` | One test file per module above, plus `eval.test.mjs` |
| `golden/*.resolved.json` | Evaluation-set snapshots for Vendors B, C and D |

---

### Task 1: Shared harness, fixtures and reference data

**Files:**
- Create: `docs/prototypes/load-prototype.mjs`
- Modify: `docs/prototypes/certification-prototype.test.mjs:9-37` (replace the function with `import { loadPrototype } from './load-prototype.mjs';` and re-export it)
- Create: `fixtures.mjs`, `reference.mjs`, `reference.test.mjs`

**Interfaces:**
- Produces:
  - `loadFixture(id: string) → {name, workbook, samples}`, a fresh deep copy. Ids: `vendorb-original`, `vendorb-corrected`, `vendorc-original`, `vendorc-corrected`, `vendord-original`, `vendord-corrected`.
  - From `reference.mjs`:
    - `TARGETS`: the prototype's `EDFI_V5_TARGETS`, plus `objectiveAssessment.performanceLevels` and `studentObjectiveAssessment.performanceLevels` (`type:'Descriptor', collection:true, descriptor:'PerformanceLevelDescriptor'`)
    - `targetByPath(path)`
    - `STANDARD_DESCRIPTORS`, `PREARRANGED_COLUMNS`, `SCORE_TARGETS` (the prototype's `SCORE_COLLECTIONS`), `PERFORMANCE_TARGETS` (the four performance-level paths), `STUDENT_FIELD`, `RESULT_RULES`, `GRADE_NAMES`
    - `isoDate(v)`, `normKey(s)`, `sameText(a, b)`, `closest(target, candidates)`, `closestCode(value, codes, descriptorType)`

- [ ] **Step 1: Move `loadPrototype`** to `load-prototype.mjs`, reading the HTML with `new URL('./certification-prototype.html', import.meta.url)`. Import it in the prototype test file.
- [ ] **Step 2: Run** `node --test docs/prototypes/certification-prototype.test.mjs`. Expected: 131 pass.
- [ ] **Step 3: Write failing tests in `reference.test.mjs`**

```js
test('reference data matches the prototype', () => {
  const p = loadPrototype();
  for (const t of p.EDFI_V5_TARGETS) assert.deepEqual(targetByPath(t.path), t);
  assert.deepEqual(STANDARD_DESCRIPTORS, p.STANDARD_DESCRIPTORS);
  assert.deepEqual(PREARRANGED_COLUMNS, p.PREARRANGED_COLUMNS);
});
test('objective performance-level targets are added', () => {
  assert.equal(targetByPath('objectiveAssessment.performanceLevels').descriptor, 'PerformanceLevelDescriptor');
  assert.equal(PERFORMANCE_TARGETS.length, 4);
});
test('text helpers behave as in the prototype', () => {
  assert.equal(normKey('Reading Comprehension: Literature'), normKey('reading comprehension - literature'));
  assert.equal(closestCode('K', STANDARD_DESCRIPTORS.GradeLevelDescriptor, 'GradeLevelDescriptor'), 'Kindergarten');
  assert.equal(closest('Activity ID', ['Student ID', 'Activity Id']), 'Activity Id');
});
test('loadFixture returns fresh copies', () => {
  const a = loadFixture('vendorc-corrected'); a.workbook.Product = [];
  assert.ok(loadFixture('vendorc-corrected').workbook.Product.length);
});
```

- [ ] **Step 4: Run** `node --test docs/prototypes/tools/expected-responses/reference.test.mjs`. Expected: FAIL (modules missing).
- [ ] **Step 5: Implement** `reference.mjs` by copying the definitions from `certification-prototype.html:931-1059` and `:1100,1243-1258` as exports. Implement `fixtures.mjs` over `loadPrototype().fixtureVariant(id)`, with `JSON.parse(JSON.stringify(...))`.
- [ ] **Step 6: Run** reference tests and prototype tests. Expected: all pass.
- [ ] **Step 7: Commit** `refactor: share the prototype loader and port reference data for the expected-response generator`

---

### Task 2: Provenance values

**Files:** Create `provenance.mjs`, `provenance.test.mjs`

**Interfaces:**
- Produces:
  - `type Prov = {id, value, prov, at?, evidence?, reason?, by?, when?, why?}`
    - `at` and each `evidence` entry are `{file, where, row|null, text}`. `text` is the cell's content, which is how regeneration detects change.
  - `stated(id, value, at) → Prov`
  - `inferred(id, value, evidence: At[], reason) → Prov`
  - `isSettled(p) → boolean`: true for `stated`, `confirmed` and `overridden`
  - `KEY_PATTERNS: RegExp[]`, matched against `id`. Ids are fixed strings:

| Value | id |
|---|---|
| namespace | `product/namespace` |
| descriptor namespace | `product/descriptorNamespace` |
| assessment identifier | `assessment/<type>/identifier` |
| sample identity columns | `assessment/<type>/studentColumn`, `assessment/<type>/activityColumn` |
| objective code | `objective/<type>/<source>/identificationCode`. `<source>` is the sample column header, or the Objectives tab row (`row<N>`) |
| element reporting method | `element/<type>/<element name>/reportingMethod` |

  - `isKey(id) → boolean`: true for every id above. The other ids are `element/<type>/<name>/{column,resultDatatype,objective,enumeration}`, `assessment/<type>/{title,category,adaptive,family,maxRawScore}`, `objective/<type>/<source>/{description,maxRawScore,parent}` and `product/name`. These are never keys.

- [ ] **Step 1: Write failing tests**: `isKey('element/X/Scale Score/reportingMethod') === true`, `isKey('element/X/Scale Score/resultDatatype') === false`, `isSettled(inferred(...)) === false`, and `stated()` keeps `at.text`.
- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/provenance.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `provenance.mjs`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add provenance values and the key list for resolved mappings`

---

### Task 3: Resolver for the extended dialect

**Files:** Create `resolve.mjs`, `resolve-extended.mjs`, `objectives.mjs`, `resolve-extended.test.mjs`, and `test-helpers.mjs`, which exports `res(id)` as used below. Task 5 adds `approved(id)`, the `res` result with every pending key confirmed by `'rep'` on `'2026-11-19'`. Later test files import both from here.

**Interfaces:**
- Consumes: Task 1 reference, Task 2 provenance.
- Produces:
  - `resolve(workbook, samples, previous?: ResolvedMapping) → {mapping: ResolvedMapping | null, findings: Finding[]}`. `mapping` is null only when the workbook matches neither dialect. In that case, findings explain why using the MVR §3.1 "Required tab/column … is missing" messages for the extended dialect.
  - `type ResolvedMapping`:

```
{ version: 1, dialect: 'extended' | 'published',
  product: {name: Prov, namespace: Prov, descriptorNamespace: Prov},
  assessments: [{type, identifier: Prov, title: Prov, category: Prov, adaptive: Prov,
                 family: Prov|null, maxRawScore: Prov|null,
                 sample: {slot, studentColumn: Prov|null, activityColumn: Prov|null}}],
  objectives:  [{assessment, source, identificationCode: Prov, description: Prov|null,
                 maxRawScore: Prov|null, parent: Prov|null}],
  elements:    [{assessment, name, row, targets: string[], dataType,
                 column: Prov|null, reportingMethod: Prov|null, resultDatatype: Prov|null,
                 objective: Prov|null, enumeration: Prov|null}],
  enumerations: [{name, descriptorType, source: 'vendor'|'standard', codes: string[]}] }
```

  - The value of `element.objective` is the `source` of an objectives entry, not a code, so that overriding a code doesn't break the link.
  - `proposeFromNames(elements, assessmentType) → [{source, code, evidence, reason}]`: the MVR §4.5 rule, ported from `deriveObjectives`. `source` is the element's sample column header.

**Rules this resolver applies** (§5.1–§5.4):
- Everything read literally from a cell is `stated`, with `at` set to that cell.
- `descriptorNamespace` is `inferred`. Its value is the namespace with a trailing `/` added if missing. Its evidence is the Product tab's Namespace cell.
- **Objectives:**
  - If the workbook has an `Objectives` tab with columns `Assessment Type`, `identificationCode`, `Description`, `maxRawScore` and `Parent identificationCode`, each row is `stated`. Its `source` is `row<N>`. Elements link to it through an element-row column `Objective`, which is `stated`.
  - Otherwise, `proposeFromNames` supplies `inferred` codes, and each element's `objective` is `inferred`.
- **Column links:**
  - An exact header match (`sameText`) is `stated`.
  - Otherwise, `closest(name, unclaimed columns)` gives an `inferred` link, with the reason `closest header to the element name`.
  - With no candidate, `column` is null.
- **`Student ID` and `Activity Id`:** an exact header match is `stated`. Otherwise, a `closest` match is `inferred`. With no candidate, the column is null.
- **Reporting method and result datatype:** column H's JSON values are `stated`.
- **A performance-level element with no reporting method:** if the assessment has exactly one score element, propose that element's reporting method as `inferred`, with the reason `the only score this assessment reports`. Otherwise, leave it null.
- **Enumerations:** resolved as in MVR §4.3a.

- [ ] **Step 1: Write failing tests**

```js
const res = id => resolve(loadFixture(id).workbook, loadFixture(id).samples).mapping;
test('Vendor B: namespace and identifiers are stated, objective codes are inferred', () => {
  const m = res('vendorb-corrected');
  assert.equal(m.dialect, 'extended');
  assert.equal(m.product.namespace.prov, 'stated');
  assert.equal(m.product.descriptorNamespace.value, 'uri://vendorb.example/');
  assert.deepEqual(m.objectives.map(o => o.identificationCode.value),
    ['Phonological Awareness', 'Phonics', 'High-Frequency Words', 'Vocabulary',
     'Reading Comprehension: Overall', 'Reading Comprehension: Literature', 'Reading Comprehension: Informational Text']);
  assert.ok(m.objectives.every(o => o.identificationCode.prov === 'inferred'));
  assert.ok(m.elements.filter(e => e.reportingMethod).every(e => e.reportingMethod.prov === 'stated'));
});
test('Vendor C: the performance level borrows the only score reporting method, inferred', () => {
  const pl = res('vendorc-corrected').elements.find(e => e.name === 'Performance Level');
  assert.equal(pl.reportingMethod.prov, 'inferred');
  assert.match(pl.reportingMethod.value, /#Scale score$/);
});
test('an Objectives tab is read as stated', () => {
  const fx = loadFixture('vendorb-corrected');
  fx.workbook.Objectives = [{'Assessment Type':'ELA Diagnostic', identificationCode:'Phonics', Description:'Phonics'}];
  fx.workbook.ElementDefinitions.filter(r => /^Phonics /.test(r.Element)).forEach(r => { r.Objective = 'Phonics'; });
  const m = resolve(fx.workbook, fx.samples).mapping;
  const o = m.objectives.find(x => x.identificationCode.value === 'Phonics');
  assert.equal(o.identificationCode.prov, 'stated');
  assert.equal(o.source, 'row2');
});
test('a misspelled column link is inferred, not an error', () => {
  const m = res('vendorb-original');
  const e = m.elements.find(x => x.column && x.column.prov === 'inferred');
  assert.ok(e && e.column.reason);
});
```

  The Vendor B list is what the prototype derives today (checked 2026-11-19).
- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/resolve-extended.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `resolve.mjs` (dialect detection: an Assessments tab with an `assessmentIdentifier` header means extended) and `resolve-extended.mjs`. Port tab reading (`tabRows`), enumeration resolution and the column-H parsing from `certification-prototype.html:1235-1425`. Port `proposeFromNames` into `objectives.mjs` from `:1515-1571`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: resolve extended-dialect workbooks into a provenance-tagged mapping`

---

### Task 4: Resolver for the published template shape

**Files:** Create `resolve-published.mjs`, `resolve-published.test.mjs`. Modify `resolve.mjs` (dialect detection) and `objectives.mjs` (candidates and ranking).

**Interfaces:**
- Consumes: Task 3's `ResolvedMapping` and `resolve`.
- Produces:
  - `proposeCandidates(sources: [{code, evidence}]) → {code, evidence, reason}`.
  - **Ranking:** codes are compared on `normKey`. The code with the most agreeing sources wins. A tie goes to the workbook over the sample. The reason lists every candidate and its sources.

**Rules** (§5.4, §9 Vendor D):
- **Detection:** the published dialect is used when the Assessments tab lacks `assessmentIdentifier` and the ElementDefinitions complete names start with `studentAssessments.`.
- **Assessments:**
  - `Assessment Type` is both the type and the `stated` identifier.
  - The title comes from `Description` and is `inferred`.
  - The category is `inferred` as `uri://ed-fi.org/AssessmentCategoryDescriptor#Benchmark test` from the Description text, or left null.
- **Namespace:** `stated` from the Product tab when every Product row agrees. Otherwise it's `inferred` from the first row, listing all rows as evidence.
- **Score element:** one synthetic score element per assessment, built from the `…scoreResults.result` row, named `Score`.
  - Its column is the sample header that contains the assessment identifier as a whole hyphen-separated token prefix (`- 1A…`). This link is `inferred`.
  - Its reporting method and result datatype are the vendor URIs `<descriptorNamespace>AssessmentReportingMethodDescriptor#<code>` and `…ResultDatatypeTypeDescriptor#<code>`, taken when EnumerationItems declares exactly one code for that enumeration. Both are `inferred`.
- **Objective code candidates:**
  - the header text after the identifier token (`1ABOYKGVendorDTXAssessmentCMP`)
  - the parenthesised example in the `identificationCode` element row's Definition (`BOYKGVendorDTXAssessmentCMP`)
  - a Product row whose `Vendor Product` appears in the header (`BOYKGVendorDTXAssessmentCMP`)
  - The ranked winner is `inferred`.
- **Performance level:** an element on `…performanceLevels.performanceLevelDescriptor` with enumeration `PerformanceLevel`. It has no column (null). Its reporting method is the score's reporting method, `inferred`.
- **Other Ed-Fi rows** (`administrationDate`, `assessmentIdentifier`, `namespace`, `studentUniqueId`, `studentAssessmentIdentifier`, `identificationCode`, the reporting method and the datatype) are consumed by the rules above. They don't become elements. `administrationDate` becomes an element with a null column.
- **Shared sample:** when two assessment slots hold the same file (same `name`, `columns` and `rows`), each assessment's `sample.slot` is its own slot. Its `studentColumn` is `inferred` via `closest('Student ID', columns)`, and its `activityColumn` is null when no column matches.

- [ ] **Step 1: Write failing tests**

```js
test('Vendor D is read as the published shape', () => {
  const m = res('vendord-original');
  assert.equal(m.dialect, 'published');
  assert.deepEqual(m.assessments.map(a => [a.type, a.identifier.value, a.identifier.prov]), [['1A', '1A', 'stated'], ['2A', '2A', 'stated']]);
  assert.equal(m.product.namespace.value, 'uri://tea.texas.gov/assessment');
  assert.equal(m.product.namespace.prov, 'stated');
  assert.equal(m.product.descriptorNamespace.value, 'uri://tea.texas.gov/assessment/');
});
test('Vendor D objective code: two of three sources omit 1A', () => {
  const o = res('vendord-original').objectives.find(x => x.assessment === '1A');
  assert.equal(o.identificationCode.value, 'BOYKGVendorDTXAssessmentCMP');
  assert.equal(o.identificationCode.prov, 'inferred');
  assert.equal(o.identificationCode.evidence.length, 3);
});
test('Vendor D reporting method is the declared vendor code, inferred', () => {
  const s = res('vendord-original').elements.find(e => e.assessment === '1A' && e.name === 'Score');
  assert.equal(s.reportingMethod.value, 'uri://tea.texas.gov/assessment/AssessmentReportingMethodDescriptor#22');
  assert.equal(s.reportingMethod.prov, 'inferred');
  assert.equal(s.column.value, 'Dibels 8 - Composite Score - 1ABOYKGVendorDTXAssessmentCMP');
});
test('Vendor D shared sample: Student ID is inferred, Activity Id is missing', () => {
  const a = res('vendord-original').assessments[0];
  assert.equal(a.sample.studentColumn.value, 'Student ID (State ID)');
  assert.equal(a.sample.studentColumn.prov, 'inferred');
  assert.equal(a.sample.activityColumn, null);
});
test('candidate ranking: a tie goes to the workbook', () => {
  const r = proposeCandidates([{code:'A1', evidence:{file:'Sample'}}, {code:'B1', evidence:{file:'Workbook'}}]);
  assert.equal(r.code, 'B1');
});
```

- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/resolve-published.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `resolve-published.mjs` and `proposeCandidates`.
- [ ] **Step 4: Run** it, and re-run `resolve-extended.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: resolve published-template workbooks and rank objective code candidates`

---

### Task 5: Review, confirmation and regeneration

**Files:** Create `review.mjs`, `review.test.mjs`. Modify `resolve.mjs` (the `previous` argument).

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `allProvs(mapping) → Prov[]`, in document order
  - `pendingKeys(mapping) → Prov[]`: keys that aren't settled
  - `confirm(mapping, id, by, when) → mapping` and `override(mapping, id, value, by, when, why) → mapping`. Both return new objects and throw `Unknown id <id>` for an unknown id.
  - `loadResolved(json: string) → ResolvedMapping`. It throws an `Error` whose message names the first bad `id`: when `prov` isn't one of the four values, when `confirmed` lacks `by` or `when`, or when `overridden` lacks `by`, `when` or `why`.
  - `diffResolved(prev, next) → [{id, from, to, prov}]`, for ids whose value or provenance changed, plus ids added or removed
  - **`resolve(workbook, samples, previous)` merge (§5.6):** for each new `Prov`, if `previous` has the same `id` with prov `confirmed` or `overridden`, and the evidence (or `at`) `text` values are identical, keep the previous `Prov`. Otherwise, use the new one.

- [ ] **Step 1: Write failing tests**

```js
test('confirming every key clears pendingKeys', () => {
  let m = res('vendorb-corrected');
  assert.ok(pendingKeys(m).length >= 8);  // 7 objectives + descriptor namespace
  for (const p of pendingKeys(m)) m = confirm(m, p.id, 'rep', '2026-11-19');
  assert.equal(pendingKeys(m).length, 0);
});
test('regeneration keeps confirmations when evidence is unchanged', () => {
  const fx = loadFixture('vendorb-corrected');
  let m = resolve(fx.workbook, fx.samples).mapping;
  const id = pendingKeys(m)[0].id;
  m = confirm(m, id, 'rep', '2026-11-19');
  const again = resolve(fx.workbook, fx.samples, m).mapping;
  assert.equal(allProvs(again).find(p => p.id === id).prov, 'confirmed');
});
test('regeneration re-opens a value whose evidence changed', () => {
  const fx = loadFixture('vendord-original');
  let m = resolve(fx.workbook, fx.samples).mapping;
  const id = 'objective/1A/Dibels 8 - Composite Score - 1ABOYKGVendorDTXAssessmentCMP/identificationCode';
  m = confirm(m, id, 'rep', '2026-11-19');
  fx.workbook.Product[0]['Vendor Product'] = 'Changed';
  const again = resolve(fx.workbook, fx.samples, m).mapping;
  assert.equal(allProvs(again).find(p => p.id === id).prov, 'inferred');
  assert.ok(diffResolved(m, again).some(d => d.id === id));
});
test('loadResolved rejects a confirmation with no by', () => {
  const m = res('vendorc-corrected');
  const p = allProvs(m).find(x => x.prov === 'inferred'); p.prov = 'confirmed';
  assert.throws(() => loadResolved(JSON.stringify(m)), new RegExp(p.id.replace(/[/]/g, '\\/')));
});
test('override records why', () => {
  const m = res('vendorc-corrected');
  const id = 'product/descriptorNamespace';
  const o = allProvs(override(m, id, 'uri://vendorc.example/', 'rep', '2026-11-19', 'vendor confirmed by email')).find(p => p.id === id);
  assert.deepEqual([o.prov, o.why], ['overridden', 'vendor confirmed by email']);
});
```

- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/review.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `review.mjs` and the merge in `resolve.mjs`.
- [ ] **Step 4: Run** `review.test.mjs`, `resolve-extended.test.mjs` and `resolve-published.test.mjs`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: confirm, override and diff resolved mappings, keeping confirmations across regeneration`

---

### Task 6: Readiness checks

**Files:** Create `check.mjs`, `check.test.mjs`

**Interfaces:**
- Consumes: `ResolvedMapping` and samples (`{[slot]: {name, columns, rows}}`).
- Produces:
  - `check(mapping, samples) → {verdict: 'ready'|'not-ready', errors, warnings, findings, categories}`
  - Categories, in order: `keys` (Keys), `assessments` (Assessments), `links` (Element ↔ column links), `targets` (Ed-Fi targets), `values` (Values), `prearranged` (Pre-arranged columns), `objectives` (Objectives), `inferred` (Inferred values)

**Rules:**
- Every unsettled key is an error in `keys`, with message `proposed key awaiting confirmation`, its `id` set, and hint `proposed \`<value>\``.
- Every unsettled non-key is a warning in `inferred`, with the reason as its message.
- **Missing values:**
  - A null `studentColumn` or `activityColumn` is an error in `prearranged`, with the MVR §3.3 message `Required sample column \`<name>\` is missing`.
  - A null element `column` in the extended dialect is an error in `links` (MVR §4.2).
  - A null element `column` in the published dialect is a warning, with message `mapped, no values in the sample, not checked`.
- **Ported unchanged:**
  - MVR §4.4 value checks and their wording, from `certification-prototype.html:1468-1498`
  - blank identity cells (`:1454-1456`)
  - duplicate headers (`:1430-1440`)
  - MVR §4.3 target and descriptor resolution errors
  - None of these ever change a sample value.
- **Objectives table (§5.3), all in `objectives`:**
  - an element's `objective` names a missing source (error)
  - an objective with no score element that has a column (error)
  - two codes in one assessment with the same `normKey` (error)
  - a parent that is missing, or a parent cycle (error)
  - an objective whose score columns are blank in every row (warning: `declared, not exercised by the sample`)
- **Duplicate identity rows** (Review Focus 5): two rows with the same `(Student ID, Activity Id)` are an error in `prearranged`, with message `` `<student>` / `<activity>` appears in more than one row``, `count` = rows.

- [ ] **Step 1: Write failing tests**

```js
// approved(id) comes from test-helpers.mjs (Task 5).
test('unconfirmed Vendor B objective codes block, and confirmed ones are ready', () => {
  const fx = loadFixture('vendorb-corrected');
  const r = check(res('vendorb-corrected'), fx.samples);
  assert.equal(r.verdict, 'not-ready');
  assert.ok(r.findings.filter(f => f.category === 'keys').every(f => f.message === 'proposed key awaiting confirmation'));
  assert.equal(check(approved('vendorb-corrected'), fx.samples).verdict, 'ready');
});
test('Vendor C original keeps its value errors', () => {
  const r = check(approved('vendorc-original'), loadFixture('vendorc-original').samples);
  assert.ok(r.findings.some(f => f.category === 'values' && /`Incomplete`/.test(f.message)));
});
test('Vendor D after confirmation is still not ready: no Activity Id', () => {
  const r = check(approved('vendord-original'), loadFixture('vendord-original').samples);
  assert.ok(r.findings.some(f => f.category === 'prearranged' && /`Activity Id`/.test(f.message)));
  assert.ok(r.findings.some(f => f.severity === 'warning' && f.message === 'mapped, no values in the sample, not checked'));
});
test('duplicate identity rows are an error', () => {
  const fx = loadFixture('vendorc-corrected'); const s = fx.samples['Reading Benchmark'];
  s.rows.push(s.rows[0].slice());
  const r = check(approved('vendorc-corrected'), fx.samples);
  assert.ok(r.findings.some(f => f.category === 'prearranged' && f.count === 2));
});
test('objective codes colliding on the normalized key are an error', () => {
  let m = approved('vendorb-corrected');
  const [a, b] = m.objectives;
  m = override(m, b.identificationCode.id, a.identificationCode.value.toUpperCase(), 'rep', '2026-11-19', 'test');
  assert.ok(check(m, loadFixture('vendorb-corrected').samples).findings.some(f => f.category === 'objectives'));
});
```

- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/check.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `check.mjs`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: check approved mappings against samples, with key, objective and identity checks`

---

### Task 7: Expected payloads, rows and endpoints

**Files:** Create `expected.mjs`, `expected.test.mjs`

**Interfaces:**
- Consumes: an approved, ready mapping, and the samples.
- Produces:
  - `expectedAssessments(m) → payload[]`
  - `expectedObjectives(m) → [{assessment, code, payload}]`. Only objectives whose score columns have a value in at least one row are included.
  - `selectRows(m, samples, assessmentType) → [{index, key:{studentId, activityId}, why, covers}]`. This is the prototype's greedy cover (`certification-prototype.html:1645-1677`), extended so that every distinct performance-level value is also a feature.
  - `expectedStudentAssessment(m, samples, assessmentType, index) → payload`
  - `deriveEndpoints(m, samples) → [{id, resource, records: [{label, payload}]}]`
    - Fixed order: `assessments`, `objectiveAssessments`, `studentAssessments`, then `descriptor:<Type>` sorted by type.
    - A descriptor record is `{namespace: '<ns><Type>', codeValue}`.
  - `canonical(value) → value`: object keys sorted recursively, and arrays of keyed entries sorted by their key (§6.3). Every payload passes through it.

**Payload rules** (§6.1, MVR §5):
- **Assessments and objectives:**
  - Ported from `expectedAssessment` and `expectedObjectives`. The objective's `identificationCode` comes from the objectives table.
  - Add `description` and `maxRawScore` when present. Add `parentObjectiveAssessmentReference: {assessmentIdentifier, identificationCode, namespace}` when a parent is set.
  - `performanceLevels` has one entry per enumeration code: `{assessmentReportingMethodDescriptor, performanceLevelDescriptor}`, on the assessment or on the element's objective.
  - No `minimumScore`, `maximumScore` or `resultDatatypeTypeDescriptor` on performance levels.
- **Student:**
  - Ported from `expectedStudentAssessment`.
  - `performanceLevels` (and `studentObjectiveAssessments[].performanceLevels`) is `[{assessmentReportingMethodDescriptor, performanceLevelDescriptor}]`, taken from the row value.
  - Descriptor URIs for vendor values use `descriptorNamespace` + type + `#` + canonical code. Standard values use `uri://ed-fi.org/`.

- [ ] **Step 1: Write failing tests**

```js
test('Vendor B corrected matches the prototype for objectives, rows and student payloads', () => {
  const p = loadPrototype(); const fx = loadFixture('vendorb-corrected');
  const old = p.validateMapping(fx.workbook, fx.samples).model; const a = old.assessments[0];
  const m = approved('vendorb-corrected');
  assert.deepEqual(expectedObjectives(m).map(o => withoutPL(o.payload)),
    p.expectedObjectives(old, a).map(o => canonical(o.payload)));
  const rows = selectRows(m, fx.samples, 'ELA Diagnostic');
  assert.deepEqual(rows.map(r => r.index), p.selectRows(old, a).map(r => r.index));
  assert.deepEqual(withoutPL(expectedStudentAssessment(m, fx.samples, 'ELA Diagnostic', rows[0].index)),
    canonical(p.expectedStudentAssessment(old, a, rows[0].index)));
});
test('Vendor C now carries performance levels', () => {
  const m = approved('vendorc-corrected');
  const a = expectedAssessments(m)[0];
  assert.equal(a.performanceLevels.length, 4);
  assert.ok(a.performanceLevels.every(pl => /#Scale score$/.test(pl.assessmentReportingMethodDescriptor)));
  const s = expectedStudentAssessment(m, loadFixture('vendorc-corrected').samples, 'Reading Benchmark', 0);
  assert.equal(s.performanceLevels[0].performanceLevelDescriptor.split('#')[1], 'Below Benchmark');
});
test('endpoints come in a fixed order', () => {
  const ids = deriveEndpoints(approved('vendorb-corrected'), loadFixture('vendorb-corrected').samples).map(e => e.id);
  assert.deepEqual(ids.slice(0, 3), ['assessments', 'objectiveAssessments', 'studentAssessments']);
  assert.deepEqual(ids.slice(3), [...ids.slice(3)].sort());
});
test('an assessment with no sample rows yields no studentAssessments endpoint', () => {
  const fx = loadFixture('vendorc-corrected'); fx.samples['Reading Benchmark'].rows = [];
  assert.ok(!deriveEndpoints(approved('vendorc-corrected'), fx.samples).some(e => e.id === 'studentAssessments'));
});
```

  `withoutPL(x)` is a test helper that deletes `performanceLevels` recursively, because the prototype drops them (§6.1). If Vendor B has no performance-level elements, it's a no-op.
- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/expected.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `expected.mjs`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: build expected payloads with performance levels and objectives from the table`

---

### Task 8: Matching helper

**Files:** Create `match.mjs`, `match.test.mjs`

**Interfaces:**
- Produces:
  - `matchRecord(expected, observed) → [{kind, path, ok, message}]`. `kind` is `value` or `objective-not-found`.
  - `findRecord(list, expected, endpoint) → object | null`. It finds a live record by key:
    - `studentAssessments`: by `studentAssessmentIdentifier`
    - `objectiveAssessments`: by `normKey(identificationCode)`
    - `assessments`: by `assessmentIdentifier`
    - descriptors: by `codeValue`, ignoring case
  - `MATCH_SOURCE: string`. This is the source text of a self-contained block defining `normKey`, `compareLeaf`, `entryKey`, `matchRecord` and `findRecord` with no imports or closures. It must be built with `Function.prototype.toString` on functions declared in `match.mjs`, so the tested code and the embedded code are the same text.

**Rules:** port `compareValue`, `leafType`, `entryKey` and `compareRecord` from `certification-prototype.html:2497-2600`, with these changes:
- `entryKey` keys `performanceLevels` by reporting method plus level (`rm.toLowerCase() + '|' + level.toLowerCase()`).
- A `studentObjectiveAssessments` entry missing from the live record is kind `objective-not-found`, with the live codes in the message.
- Extra live fields are ignored. A missing expected field fails as `value`.

- [ ] **Step 1: Write failing tests**: an identical record → all ok; a `Raw Score` result `254` vs `"254.0"` → ok; a descriptor code differing only in case → ok; a missing objective → one `objective-not-found` that lists the live codes; performance levels in a different order → ok; `new Function(MATCH_SOURCE + '; return matchRecord;')()` gives the same results as the imported `matchRecord`.
- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/match.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `match.mjs`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add the self-contained matching helper embedded in generated requests`

---

### Task 9: Bruno collection writer

**Files:** Create `bruno.mjs`, `bruno.test.mjs`

**Interfaces:**
- Consumes: `deriveEndpoints` (Task 7) and `MATCH_SOURCE` (Task 8).
- Produces: `writeCollection(endpoints, {name}) → {[relativePath]: string}`. The keys are sorted, and the contents are deterministic.

**Layout** (§7.1):
- `bruno.json`: `{"version":"1","name":<name>,"type":"collection"}`
- `environments/certification.bru`: a `vars` block with `baseUrl`, and `vars:secret [ accessToken ]`
- Folders `01 assessments`, `02 objectiveAssessments`, `03 studentAssessments` and `04 descriptors`, with one `.bru` per record named `NNN <safe label>.bru`. `safe label` keeps `[A-Za-z0-9 ._-]`, replaces everything else with `_`, and is at most 60 characters. `seq` follows `NNN`.
- Each request contains:
  - `get { url, body: none, auth: bearer }`
  - `auth:bearer { token: {{accessToken}} }`
  - a `tests` block

**URLs:** every query value goes through `encodeURIComponent`, and every request adds `limit=500`.
- assessments: `?assessmentIdentifier=…&namespace=…`
- objectiveAssessments: `?assessmentIdentifier=…&namespace=…`. All objectives are fetched and matched on the normalized key.
- studentAssessments: `?studentUniqueId=…`
- descriptors: `?namespace=…&codeValue=…`

**Tests block:**
- `const expected = <JSON.stringify(payload)>;`, then `MATCH_SOURCE`, then:
  - `findRecord(res.getBody(), …)`. When no record is found, one failing test named `[record-not-found] <label> › record`, or `[descriptor-not-loaded] <label> › record` for descriptors.
  - Otherwise, one `test('[' + c.kind + '] <label> › ' + c.path, () => expect(c.ok, c.message).to.equal(true))` per check.
- Payload JSON is embedded with `JSON.stringify`, then `</` and the line separators U+2028 and U+2029 are escaped. Labels inside test names are JSON-encoded string literals. No template literals are used.

- [ ] **Step 1: Write failing tests.** Add a test helper `runTests(bruText, body)`. It extracts the `tests { … }` block (closing brace at column 0), then runs it in `vm.runInNewContext` with `res = {getBody: () => body}`, a `test(name, fn)` that records `{name, ok}`, and a minimal `expect(v, msg).to.equal(x)`. Then:

```js
test('a request run against its own expected payload passes every test', () => {
  const files = writeCollection(deriveEndpoints(approved('vendorb-corrected'), loadFixture('vendorb-corrected').samples), {name:'Vendor B'});
  const path = Object.keys(files).find(k => k.startsWith('03 studentAssessments/'));
  const expected = JSON.parse(files[path].match(/const expected = (.*);\n/)[1]);
  const results = runTests(files[path], [expected]);
  assert.ok(results.length > 1 && results.every(r => r.ok));
});
test('an empty response fails as record-not-found, and a descriptor as descriptor-not-loaded', () => { /* assert names start with "[record-not-found] " and "[descriptor-not-loaded] " */ });
test('vendor strings with quotes, backticks, ${ and newlines survive unchanged', () => {
  const m = approved('vendorc-corrected');
  const evil = 'A "q" `b` ${x} }\nz';
  const m2 = override(m, 'assessment/Reading Benchmark/title', evil, 'rep', '2026-11-19', 'test');
  const files = writeCollection(deriveEndpoints(m2, loadFixture('vendorc-corrected').samples), {name:'C'});
  const f = Object.entries(files).find(([k]) => k.startsWith('01 assessments/'))[1];
  const exp = JSON.parse(f.match(/const expected = (.*);\n/)[1]);
  assert.equal(exp.assessmentTitle, evil);
  assert.ok(runTests(f, [exp]).every(r => r.ok));
});
test('query values are percent-encoded and every GET sets limit=500', () => {
  const files = writeCollection(deriveEndpoints(approved('vendorb-corrected'), loadFixture('vendorb-corrected').samples), {name:'B'});
  for (const [k, v] of Object.entries(files).filter(([k]) => k.endsWith('.bru') && !k.startsWith('environments/'))){
    const url = v.match(/^\s*url: (.*)$/m)[1];
    assert.match(url, /[?&]limit=500(&|$)/, k);
    assert.doesNotMatch(url.split('?')[1], /[ #]/, k);
  }
});
test('no credentials and no require in the collection', () => {
  const all = Object.values(writeCollection(deriveEndpoints(approved('vendorc-corrected'), loadFixture('vendorc-corrected').samples), {name:'C'})).join('\n');
  assert.doesNotMatch(all, /require\(|Bearer [A-Za-z0-9]/);
});
```

- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/bruno.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `bruno.mjs`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: write generated Bruno collections with inline expected payloads and matching`

---

### Task 10: Report, manifest and CLI

**Files:** Create `report.mjs`, `cli.mjs`, `cli.test.mjs`

**Interfaces:**
- Consumes: everything above. From `../build-fixture.mjs`: `readXlsx` and `sampleFromXlsx`. Also `parseCsv`, whose output becomes `{name, columns, rows}`.
- Produces:
  - `renderReport(checkResult, mapping, endpoints|null) → {markdown, json}`. The Markdown order is: verdict line (`Ready to run` or `Not ready to run: N errors`), the categories with counts, findings grouped by `file › where` in the MVR §4.6 wording, `Pending keys` (id, proposed value, evidence), `Inferred values`, `Changes since the previous mapping` (only when `changes.json` exists, §5.6), and `Endpoints` (only when ready).
  - `main(argv) → Promise<number>` (the exit code), exported for tests. It runs when the file is executed directly.

**Commands:**

| Command | Does |
|---|---|
| `resolve --workbook <xlsx> --sample "<Type>=<csv\|xlsx>"… --out <dir> [--previous <resolved-mapping.json>]` | Writes `<dir>/inputs.json` (the parsed workbook and samples, plus each input file's `sha256`) and `<dir>/resolved-mapping.json`. With `--previous`, it merges (Task 5) and writes `<dir>/changes.json` from `diffResolved`. Prints the pending-key count. |
| `resolve --inputs <fixture.json> --out <dir>` | The same, from a parsed fixture. Used by tests. |
| `review --dir <dir>` | Prints pending keys, then inferred non-keys, one per line: `<id>  <value>  <reason>` |
| `confirm --dir <dir> --id <id> --by <name>` | Confirms one value, with `when` set to the current ISO date. `--all-keys` confirms every pending key. |
| `override --dir <dir> --id <id> --value <v> --by <name> --why <text>` | Overrides one value |
| `generate --dir <dir>` | Loads with `loadResolved`, runs `check`, writes `readiness-report.md` and `.json`. When ready, writes `collection/` and `manifest.json`. Exits `1` when not ready. |

**`manifest.json`:** `{moduleVersion:'0.1.0', brunoCliVersion:<pinned constant>, inputs:{<file>: <sha256>}, resolvedMappingSha256, generatedAt}`. Pin `brunoCliVersion` to an exact `@usebruno/cli` release at least two weeks old. Check the release list with `npm view @usebruno/cli time --json`.

- [ ] **Step 1: Write failing tests** (temporary directories via `fs.mkdtempSync(os.tmpdir())`):
  - Vendor C: `resolve --inputs` → `generate` exits `1`, and the report lists the pending keys.
  - Then `confirm --all-keys`, `generate` exits `0`, and `collection/bruno.json` exists.
  - Generating twice gives byte-identical `collection/` and `readiness-report.*`.
  - `review` lists `product/descriptorNamespace` before confirmation.
  - `resolve --previous` after a confirmed run, with one Product cell changed, writes `changes.json` naming that id, and the report has a `Changes since the previous mapping` section.
  - `generate` on a hand-broken `resolved-mapping.json` exits non-zero, and stderr names the id.
- [ ] **Step 2: Run** `node --test docs/prototypes/tools/expected-responses/cli.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `report.mjs` and `cli.mjs`.
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: add the expected-response CLI with readiness report and manifest`

---

### Task 11: Evaluation set and end-to-end check

**Files:** Create `eval.test.mjs`, `golden/vendorb-corrected.resolved.json`, `golden/vendorc-corrected.resolved.json`, `golden/vendord-original.resolved.json`, and `README.md` in the module folder (usage, the four commands, the confirm workflow).

- [ ] **Step 1: Write `eval.test.mjs`.** For each golden id, `resolve()` must deep-equal the golden file. When `UPDATE_GOLDEN=1`, the test writes the file instead.
- [ ] **Step 2: Generate the golden files** with `UPDATE_GOLDEN=1 node --test docs/prototypes/tools/expected-responses/eval.test.mjs`. Then **hand-check** these facts in each file before committing:
  - **B:** 7 objective codes as listed in Task 3, all `inferred`. The namespace is `stated`.
  - **C:** the performance level's reporting method is `inferred` `#Scale score`, and there are no objectives.
  - **D:**
    - the dialect is `published`
    - the code is `BOYKGVendorDTXAssessmentCMP` with 3 evidence entries
    - the reporting method is `…AssessmentReportingMethodDescriptor#22`
    - `activityColumn` is null
- [ ] **Step 3: Run** `node --test docs/prototypes/tools/expected-responses/eval.test.mjs`. Expected: PASS.
- [ ] **Step 4: Run every module test file** one by one, plus `node --test docs/prototypes/certification-prototype.test.mjs` and `node --test docs/prototypes/tools/build-fixture.test.mjs`. Expected: all pass.
- [ ] **Step 5: Manual Bruno check** (needs network; record the outcome in the commit message).
  - Generate the Vendor B collection.
  - Start a throwaway stub HTTP server, in the scratchpad and not committed. It answers each GET with the expected record found by query.
  - Run `npx --yes @usebruno/cli@<pinned> run --env certification --env-var baseUrl=http://localhost:<port>/data/v3 --env-var accessToken=x --reporter-json out.json` in `collection/`.
  - Expected: every test passes, and test names start with `[value]`, `[record-not-found]`, `[descriptor-not-loaded]` or `[objective-not-found]`.
  - If the CLI rejects the `.bru` syntax, fix `bruno.mjs` and add a regression assertion to `bruno.test.mjs`.
- [ ] **Step 6: Commit** `test: add the resolver evaluation set and document the expected-response CLI`
