# Assessment Mapping Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mapping tool to the Assessments v5 certification prototype. It is reached from the Vendor mapping CSV row, imports a filled mapping workbook (or starts blank), and lets the vendor map elements to Ed-Fi v5 targets using a descriptor bank. It checks types and required-field coverage, then generates a new mapping artifact version that carries issues and notes for the reviewer.

**Architecture:** The tool has a pure model layer and a thin UI layer. The model layer holds v5-slice data, workbook parsing, bank and element operations, and checks. Its functions take and return a plain `MappingDoc` object and touch neither `APP` nor the DOM, so tests drive them directly. The UI layer adds a `#/mapping/<subId>[/<tab>]` route, modals and `data-act` handlers that call those functions. A submission holds a working draft (`sub.mappingDraft`). Generate snapshots the draft into an artifact version (`source:'tool'`, `doc`, `issues`).

**Tech Stack:** Single-file HTML prototype (vanilla JS, template literals, hash routing, no build step). Tests: `node --test docs/prototypes/certification-prototype.test.mjs` using the existing `loadPrototype()` harness.

**Spec:** `docs/design/2026-11-16-assessment-mapping-tool-design.md`

## Global Constraints

- **Single self-contained file.** `docs/prototypes/certification-prototype.html` has no imports, no network calls, no new libraries, and must still open from `file://`.
- **Assessments only.** The mapping tool actions and route appear only when `MODELS[sub.model].kind === 'assessments'`. SIS and MTSS rows keep plain Upload/Replace.
- **Avoid TDZ errors.** `seed()` runs at load. All new data constants go **above** `/* ---------- mutable application state ---------- */` (line ~967). All new logic is `function` declarations, never `const` arrows.
- **No real vendor data.** The repo is public. The reference vendor workbook is reproduced **anonymized** as `Vendor B Diagnostic`, with namespace `uri://vendor-b.example.com/` and identifiers `VENDORB-DIAGNOSTIC-ELA` / `-MATH`. Its structure and quirks are kept: element names, v6.2-style paths, column-H JSON, type typos and `CustomValue` rows. Its definitions are paraphrased.
- **No auto-mapping.** Import resolves targets only from the workbook's explicit column G. Nothing guesses a target from an element's name.
- **Issues never block** (proposed D27). Generate is always enabled.
- **The bank is the only source of descriptor values** (proposed D28). Ed-Fi standard values start `enabled:false`.
- **Reviewers never edit.** The reviewer route renders the current tool-generated version read-only and never touches `mappingDraft`.
- **Prototype-only controls are labeled.** The import selector reads "Simulate (prototype only — no file is really parsed)", matching the existing upload modal.
- **Copy:** issue states are "Explained" / "Unexplained". The badge format is `"<n> issues · <m> explained"`. The draft banner is `"Unsaved changes since v<n>"`.
- `.editorconfig`: LF line endings, 2-space indent, final newline, no trailing whitespace.

## Review Focus

1. **Re-importing over a draft that has notes.** The vendor expects a warning before losing work. `importWorkbook` returns `{needsConfirm:true}` unless `{replace:true}` is passed. Tested in Task 5.
2. **Removing an element that carries notes.** The notes must not vanish ("nothing silent"). `removeElement` moves them to `doc.orphanNotes`. Tested in Task 3.
3. **Adding a bank value whose code already exists for that type** (compared case-insensitively). This is rejected with a message. Tested in Task 3.
4. **Switching persona to reviewer while the vendor has an unsaved draft.** The reviewer sees the last generated version, not the draft. Tested in Task 8.
5. **Generating straight after "Build from scratch" with no assessments or elements.** This is allowed. The version carries an "No assessments defined" issue, and runs pinned to the prior version go stale. Tested in Task 5.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `docs/prototypes/certification-prototype.html` | Prototype. Model layer goes in a new block `/* ---------- mapping tool: data ---------- */` above mutable state, and `/* ---------- mapping tool: model ---------- */` after `/* ---------- result builders ---------- */`. UI functions go after `assessmentResultsHTML`. |
| `docs/prototypes/certification-prototype.test.mjs` | Append tests under a `/* ---- mapping tool ---- */` comment. |
| `docs/PRD-Certification-v2.md` | §5.5, §12, §7.4, §7.6, §7.9 and the decision entries (Task 9). |

## Shared Types (referenced by every task)

```js
// MappingDoc
{
  product: {name, namespace, description},
  assessments: [{id, type, title, identifier, adaptive, category, family, maxRawScore}],
  bank: {
    types:  [{type, definition}],                 // e.g. 'AssessmentReportingMethodDescriptor'
    values: [{id, type, ns:'vendor'|'edfi', uri, code, short, desc, enabled}]
  },
  elements: [{id, assessmentId, objective /* string|null */, name, definition,
              type /* DATA_TYPES member | null */, enumType /* descriptor type|null */,
              targets: [{path, entryKey /* bank value id|null */}],
              notes, importNote /* {originalTarget, unresolved:[string], corrections:[string]}|null */}],
  issueNotes: {/* issueKey */: string},
  orphanNotes: [{from, text}],
  importReport: null | {source:'workbook'|'csv'|'blank', resolved, needsTarget,
                        typesCorrected, valuesAdded, standardEnabled, placeholders:[type]}
}
// Issue
{key, kind, message, elementId /* optional */, valueId /* optional */}
// kind ∈ 'unmapped'|'needs-target'|'type-mismatch'|'type-unknown'|'enum-empty'|'unused-value'|'placeholder'
```

Issue keys (stable, so notes survive re-renders):
`unmapped:<assessmentId>:<objective|->:<reportingMethodValueId|->:<field>`, `needs-target:<elementId>`,
`type-mismatch:<elementId>:<path>`, `type-unknown:<elementId>`, `enum-empty:<elementId>`,
`unused-value:<valueId>`, `placeholder:<descriptorType>`.

---

### Task 1: v5 slice, standard descriptors, type and path helpers

**Files:**
- Modify: `docs/prototypes/certification-prototype.html` (new data block above mutable state, helpers in the model block)
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Produces:
  - `DATA_TYPES = ['String','Integer','Decimal','Percent','Percentile','Boolean','Date','Range','Level','Enumeration']`
  - `EDFI_V5_TARGETS`: an array of `{path, entity, type, required, collection, keyedBy, descriptor, def}`.
    - `type ∈ 'String'|'Integer'|'Decimal'|'Boolean'|'Date'|'Descriptor'|'Score'`.
    - Collections have `collection:true` and `keyedBy` (a descriptor type).
    - `descriptor` is set on `type:'Descriptor'` targets.
  - `SCORE_COLLECTIONS = ['assessment.scores','studentAssessment.scoreResults','objectiveAssessment.scores','studentObjectiveAssessment.scoreResults']`
  - `STANDARD_DESCRIPTORS`: an array of `{type, definition, values:[{code, short}]}` (Ed-Fi namespace).
  - `normalizeType(raw: string) -> {type: string|null, corrected: boolean}`
  - `resolveTargets(completeName: string) -> {paths: string[], unresolved: string[]}`
  - `targetByPath(path) -> target|undefined`

`EDFI_V5_TARGETS` must contain at least the following, with `required:true` where marked (*):

| path | type | notes |
|---|---|---|
| `assessment.assessmentIdentifier`* | String | covered by assessment row |
| `assessment.namespace`* | String | covered by product namespace |
| `assessment.assessmentTitle`* | String | covered by assessment row |
| `assessment.academicSubjects`* | Descriptor | descriptor `AcademicSubjectDescriptor` |
| `assessment.assessedGradeLevels`* | Descriptor | `GradeLevelDescriptor` |
| `assessment.assessmentCategoryDescriptor` | Descriptor | `AssessmentCategoryDescriptor` |
| `assessment.maxRawScore` | Decimal | |
| `assessment.adaptiveAssessment` | Boolean | |
| `assessment.assessmentFamily` | String | |
| `assessment.period` | Descriptor | `AssessmentPeriodDescriptor` |
| `assessment.languages` | Descriptor | collection, keyedBy `LanguageDescriptor` |
| `assessment.scores` | Score | collection, keyedBy `AssessmentReportingMethodDescriptor` |
| `assessment.performanceLevels` | Descriptor | collection, keyedBy `PerformanceLevelDescriptor` |
| `objectiveAssessment.identificationCode` | String | |
| `objectiveAssessment.scores` | Score | collection, keyed as above |
| `studentAssessment.studentAssessmentIdentifier`* | String | |
| `studentAssessment.studentReference`* | String | |
| `studentAssessment.administrationDate`* | Date | |
| `studentAssessment.administrationLanguageDescriptor` | Descriptor | `LanguageDescriptor` |
| `studentAssessment.eventCircumstanceDescriptor` | Descriptor | `EventCircumstanceDescriptor` |
| `studentAssessment.retestIndicatorDescriptor` | Descriptor | `RetestIndicatorDescriptor` |
| `studentAssessment.whenAssessedGradeLevelDescriptor` | Descriptor | `GradeLevelDescriptor` |
| `studentAssessment.scoreResults` | Score | collection, keyed as above |
| `studentAssessment.performanceLevels` | Descriptor | collection, keyedBy `PerformanceLevelDescriptor` |
| `studentObjectiveAssessment.scoreResults` | Score | collection, keyed as above |

`STANDARD_DESCRIPTORS` must include `AssessmentReportingMethodDescriptor` (`Scale score`, `Percentile`, `Lexile Measure`, `Quantile Measure`, `Raw score`), `AssessmentCategoryDescriptor` (`Diagnostic`, `Benchmark test`), `AcademicSubjectDescriptor` (`English Language Arts`, `Mathematics`, `Reading`), `GradeLevelDescriptor` (`Kindergarten`, `First grade` … `Eighth grade`), `LanguageDescriptor` (`English`, `Spanish`), `ResultDatatypeTypeDescriptor` (`Decimal`, `Integer`, `Level`, `Percentage`, `Percentile`, `Range`), `AssessmentPeriodDescriptor` (`Beginning of Year`, `Middle of Year`, `End of Year`), `RetestIndicatorDescriptor` (`Primary Administration`, `Retest`), `EventCircumstanceDescriptor` (`Other`), and `PerformanceLevelDescriptor` (`Advanced`, `Proficient`, `Basic`, `Below Basic`).

`normalizeType` matches case-insensitively against `DATA_TYPES` plus these aliases: `interger→Integer`, `int→Integer`, `percentage→Percent`, `pct→Percent`, `bool→Boolean`, `enum→Enumeration`, `text→String`. `corrected` is true only when the lower-cased raw value differs from the lower-cased result. Unknown values give `{type:null, corrected:false}`.

`resolveTargets` trims the input, splits on `/`, and checks each part against `EDFI_V5_TARGETS` paths exactly. Parts with no match go into `unresolved` (original text kept).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `node --test docs/prototypes/certification-prototype.test.mjs`. Expected: 3 failures (`normalizeType` / `resolveTargets` / `EDFI_V5_TARGETS` is not defined).
- [ ] **Step 3: Implement** the constants and the three functions listed under Interfaces.
- [ ] **Step 4: Run the tests and confirm they pass.** Same command. Expected: all pass (63).
- [ ] **Step 5: Commit** with message `feat: add Ed-Fi v5 assessment slice and mapping type helpers to prototype`.

---

### Task 2: Workbook fixtures and `parseWorkbook`

**Files:**
- Modify: `docs/prototypes/certification-prototype.html`
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `WORKBOOK_FIXTURES = {clean, vendorb, malformed}`. Each fixture is `{tabs:{Product:[[...]], Assessments:[[...]], ElementDefinitions:[[...]], EnumerationDefinitions:[[...]], EnumerationItems:[[...]]}}`. Each tab is an array of rows, and row 0 is the header row, copied verbatim from the template.
  - `DESCRIPTOR_TYPE_ALIASES = {Accomodation:'AccommodationDescriptor', resultDatatypeType:'ResultDatatypeTypeDescriptor'}`. Any other name gets `Descriptor` appended if it doesn't already end with it.
  - `emptyMappingDoc() -> MappingDoc`. Product fields are empty, there are no assessments or elements, and the bank holds every `STANDARD_DESCRIPTORS` value with `ns:'edfi'`, `enabled:false` and `uri:'uri://ed-fi.org/<Type>#<code>'`.
  - `parseWorkbook(wb) -> {ok:true, doc, report} | {ok:false, errors:string[]}`

**Required tabs and headers.** Return `ok:false` when any of these are missing:
- Product: `Vendor Product, Namespace, Description`
- Assessments: first two columns `Assessment Type, Description`
- ElementDefinitions: `Assessment Type, Element, Definition, Data Type, Ed-Fi ODS/API Version, Ed-Fi ODS/API Element, Ed-Fi ODS/API Element Complete Name`
- EnumerationDefinitions: `Enumeration, Definition`
- EnumerationItems: `Enumeration, Code Value, Short Description, Description`

Each error reads `Tab "<name>" is missing.` or `Tab "<name>": expected column "<col>".`

**Import rules** (design §5.2):
- **Product and Assessments.** These fill `doc.product` and `doc.assessments`. Optional Assessments columns (`assessmentTitle`, `assessmentIdentifier`, `adaptiveAssessment`, `assessmentCategoryDescriptor`, `assessmentFamily`, `maxRawScore`) are read by header name when present.
- **EnumerationDefinitions** add bank types.
- **EnumerationItems** add vendor values (`ns:'vendor'`, `enabled:true`, `uri: namespace + '<Type>#' + code`), with two exceptions:
  - A row whose code is `CustomValue` is skipped and its type is pushed to `report.placeholders`.
  - A row whose code is a full `uri://ed-fi.org/<Type>#<Code>` enables that standard value instead.
- **ElementDefinitions.** Each row becomes an element:
  - `assessmentId` is matched by Assessment Type. A type that contains an assessment's type (e.g. `Vendor B ELA Diagnostic` contains `ELA Diagnostic`) also matches.
  - `type` comes from `normalizeType`. Corrections are recorded in `importNote.corrections` as `"Interger → Integer"`.
  - `targets` come from `resolveTargets(col G)`. Unresolved parts are kept in `importNote.unresolved` and `importNote.originalTarget`.
- **Column H.** If present, extract `"assessmentReportingMethodDescriptor": "<uri>"` with a regex. Find the bank value with that `uri`, enabling it when it's a standard value. Set `entryKey` on every Score-collection target of that element.
- **Objective.** When any target starts with `objectiveAssessment.` or `studentObjectiveAssessment.`, `objective` is the element name with the reporting method's `code` removed from the end and trimmed (e.g. `Phonics Scale Score` + `Scale Score` → `Phonics`). If the name doesn't end with that code, `objective` is the whole name.
- **enumType.** For an Enumeration element, `enumType` is the `descriptor` of its first Descriptor target, or null.
- **Category.** `assessment.category` values in the `uri://ed-fi.org/...` form also enable that standard value.
- **Report.** `{source:'workbook', resolved:<elements with no unresolved parts>, needsTarget:<elements with ≥1 unresolved>, typesCorrected, valuesAdded, standardEnabled, placeholders}`.

**Fixture content:**
- **`clean`.** Product `Vendor B Reading Screener`, namespace `uri://vendor-b.example.com/`, one assessment `Reading Screener`. Elements cover every required field:
  - `StudentID` → `studentAssessment.studentReference`
  - `TestID` → `studentAssessmentIdentifier`
  - `TestDate` (Date) → `administrationDate`
  - `Subject` (Enumeration) → `assessment.academicSubjects`
  - `Grade` (Enumeration) → `assessment.assessedGradeLevels`
  - `Scale Score` (Integer) → `assessment.scores/studentAssessment.scoreResults`, with H referencing `uri://ed-fi.org/AssessmentReportingMethodDescriptor#Scale score`

  EnumerationItems enable `uri://ed-fi.org/AcademicSubjectDescriptor#Reading` and `uri://ed-fi.org/GradeLevelDescriptor#Third grade`. It must produce **zero issues** (asserted in Task 4).
- **`vendorb`.** The anonymized reference vendor workbook: two assessments (`ELA Diagnostic`, `Math Diagnostic`) and 20–30 elements taken from the real ElementDefinitions names. It **must include** these rows (Assessment Type / Element / Data Type / G / H reporting method):
  - `Vendor B ELA Diagnostic` / `Scale Score` / `Integer` / `assessment.scores/studentAssessment.scoreResults` / edfi `Scale score`
  - … / `Annual Typical Growth Measure` / `Interger` / same G / vendor `Typical Growth Measure`
  - … / `Percent Progress to Annual Typical Growth (%)` / `percentage` / same G / vendor `Progress To Typical Growth`
  - … / `Placement Level` / `String` / same G / vendor `Placement Level`
  - … / `Baseline Diagnostic (Y/N)` / `Enumeration` / same G / vendor `Is Baseline Diagnostic?`
  - … / `Diagnostic Gain` / `Integer` / `studentAssessment.scoreResults` / vendor `Diagnostic Gain`
  - … / `Rush Flag` / `Enumeration` / `studentAssessment.eventCircumstanceDescriptor` / —
  - … / `Most Recent Diagnostic (Y/N)` / `Enumeration` / `studentAssessment.retestIndicatorDescriptor` / —
  - … / `Diagnostic Language` / `Enumeration` / `assessment.languages.studentAssessment/studentAssessment.administrationLanguageDescriptor` / —
  - … / `Phonics Scale Score` / `Integer` / `objectiveAssessment.scores/studentObjectiveAssessment.scoreResults` / edfi `Scale score`
  - `Vendor B Math Diagnostic` / `AssessmentID` / `String` / `assessments.assessment.id` / —
  - `Vendor B Math Diagnostic` / `Scale Score` / `Integer` / scores+scoreResults / edfi `Scale score`
  - `Vendor B Math Diagnostic` / `Percentile` / `Percentile` / scores+scoreResults / edfi `Percentile`

  EnumerationItems carry the real code values (`Diagnostic Gain`, `Is Baseline Diagnostic?`, `Progress To Typical Growth`, `Typical Growth Measure`, `Placement Level`, `Yellow Rush Flag`, `Red Rush Flag`, `Latest Diagnostic`, `Previous Diagnostic`, the four `Accomodation` rows, the three `AssessmentPeriod` rows), plus `PerformanceLevel` / `CustomValue`. No element maps administrationDate, studentAssessmentIdentifier, studentReference, academicSubjects or assessedGradeLevels; this is deliberate.
- **`malformed`.** The `vendorb` fixture with the `ElementDefinitions` tab removed, and `Namespace` renamed to `Namespace URI` on the Product tab.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: 3 failures.
- [ ] **Step 3: Implement** the fixtures, `DESCRIPTOR_TYPE_ALIASES`, `emptyMappingDoc` and `parseWorkbook`. `parseWorkbook` starts from `emptyMappingDoc()`. Ids come from `uid('mel')` / `uid('mval')` / `uid('masm')`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with message `feat: parse mapping workbooks into a mapping doc in prototype`.

---

### Task 3: Bank and element operations

**Files:**
- Modify: `docs/prototypes/certification-prototype.html`
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Consumes: `MappingDoc` (Tasks 1–2).
- Produces. All of these mutate `doc` in place:
  - `selectableValues(doc, type?) -> value[]`: values with `ns==='vendor' || enabled`, filtered by type when given.
  - `valueUsers(doc, valueId) -> string[]`: the names of users of a value. Users are elements with a target whose `entryKey === valueId` or whose `enumType === value.type`, plus assessment rows whose `category === value.uri` (named by assessment title). An assessment's category counts as a use, so an imported category value is never flagged "Unused".
  - `addBankValue(doc, {type, code, short, desc}) -> {ok:true, value} | {ok:false, error}`. This rejects a duplicate `type`+`code` (case-insensitive) with the error `'"<code>" already exists in <type>.'`. The type is added to `bank.types` if it's new.
  - `setStandardEnabled(doc, valueId, on) -> {ok:true} | {ok:false, blockedBy:string[]}`. Disabling a used value is blocked; `blockedBy` lists element names.
  - `removeBankValue(doc, valueId) -> {ok:true} | {ok:false, blockedBy:string[]}`. This works on vendor values only and is blocked while the value is used.
  - `addElement(doc, {assessmentId, name, definition, type}) -> element`
  - `removeElement(doc, elementId) -> void`. If the element has notes, `{from:<name>, text}` is pushed to `doc.orphanNotes`. Keys in `issueNotes` that contain the element id are moved there too.
  - `setElementField(doc, elementId, field, value) -> void`. Allowed fields: `name|definition|type|enumType|notes|objective`.
  - `addTarget(doc, elementId, path, entryKey=null) -> {ok:true} | {ok:false, error}`. This rejects paths not in `EDFI_V5_TARGETS` and exact duplicates.
  - `removeTarget(doc, elementId, index) -> void`
  - `setTargetKey(doc, elementId, index, valueId) -> void`
  - `collectionEntries(doc, assessmentId) -> [{collection, objective, key /* value */, elements /* element[] */}]`. This groups the Score/keyed-collection targets of that assessment's elements by `(collection, objective, entryKey)`, sorted by collection, then objective, then key code.
  - `addCollectionEntry(doc, {assessmentId, objective, collection, keyValueId, elementId}) -> {ok:true} | {ok:false, error}`. This calls `addTarget` on the given element with `entryKey = keyValueId`. If `keyValueId` isn't selectable, it returns `{ok:false, error:'Add or enable this descriptor value in the bank first.'}`.

- [ ] **Step 1: Write the failing tests**

```js
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
  const el = p.addElement(d, {assessmentId:ela.id, name:'Lexile Measure', definition:'', type:'Level'});
  const lex = d.bank.values.find(v => v.uri.endsWith('#Lexile Measure'));
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
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: 4 failures.
- [ ] **Step 3: Implement** the functions listed under Interfaces.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with message `feat: add descriptor bank and element mapping operations to prototype`.

---

### Task 4: Checks — coverage, issues, notes

**Files:**
- Modify: `docs/prototypes/certification-prototype.html`
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `coverage(doc) -> [{assessmentId, objective, reportingMethodId, field, mapped:boolean, by:string[] /* element names or 'Assessment row'|'Product' */}]`
  - `computeIssues(doc) -> Issue[]`
  - `reconcileNotes(doc) -> void`
  - `issueSummary(issues, doc) -> {total, explained}`. An issue is explained when `doc.issueNotes[issue.key]` is a non-empty string.

**Coverage rules** (design §5.8, §8 Q2). These are evaluated **per assessment**:
- **Assessment-level required fields.** `assessmentIdentifier` and `assessmentTitle` are mapped when the assessment row has them (`by:['Assessment row']`). `namespace` is mapped when `doc.product.namespace` is set (`by:['Product']`). `academicSubjects` and `assessedGradeLevels` are mapped only by an element target.
- **StudentAssessment required fields** (`studentAssessmentIdentifier`, `studentReference`, `administrationDate`) are mapped by an element target. These rows have `objective:null` and `reportingMethodId:null`.
- **Score coverage.** This applies to each distinct `(objective, entryKey)` used by any Score-collection target of the assessment, with `objective:null` for assessment level. Three rows are produced, and the field names are exact:
  - `scores` is mapped when some element targets `assessment.scores`, or `objectiveAssessment.scores` when an objective is set, with that key.
  - `scoreResults.result` is mapped when some element targets `studentAssessment.scoreResults`, or `studentObjectiveAssessment.scoreResults` when an objective is set, with that key.
  - `scoreResults.resultDatatypeType` is mapped when the element(s) behind `scoreResults.result` have a type in `SCORE_TYPES = {Integer:'Integer', Decimal:'Decimal', Percent:'Percentage', Percentile:'Percentile', Range:'Range', Level:'Level'}`.
- **Score target with no key.** A Score target whose `entryKey` is null produces a `needs-target` issue (`"Pick the reporting method for <path>"`). It produces no coverage row.

**Issue rules:**
- `unmapped`, empty mapping: when `doc.assessments` is empty, emit one issue with key `unmapped:-:-:-:assessments` and message `"No assessments defined — every required field is unmapped"`.
- `unmapped`: one issue per coverage row with `mapped:false`, with message `"<Assessment title><' › '+objective|''><' › '+key code|''>: <field> is not mapped"`.
- `needs-target`: an element with no targets, or with `importNote.unresolved.length > 0`, or with a keyless Score target.
- `type-unknown`: `element.type === null`.
- `type-mismatch`: for each target, the element type is incompatible with the target type:
  - Score accepts only `SCORE_TYPES` keys.
  - Descriptor accepts only `Enumeration`.
  - Date accepts `Date`.
  - Boolean accepts `Boolean`.
  - Decimal accepts `Decimal`, `Integer`.
  - String accepts `String`, `Integer`.

  Message: `"<name>: <type> can't map to <path> (expects <expected list>)"`.
- `enum-empty`: an `Enumeration` element whose `enumType` is null, or has zero `selectableValues` of that type.
- `unused-value`: a vendor value, or an enabled standard value, with `valueUsers(...).length === 0`.
- `placeholder`: each type in `doc.importReport.placeholders` that still has zero selectable values.

**`reconcileNotes`.** For each `issueNotes` key not present in `computeIssues(doc)`:
- If the key carries an element id, append `"[issue resolved] " + text` to that element's `notes`, separated by a newline.
- Otherwise push `{from:key, text}` to `orphanNotes`.

Then delete the key.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: 4 failures.
- [ ] **Step 3: Implement** `SCORE_TYPES` (a constant in the data block), `coverage`, `computeIssues`, `reconcileNotes` and `issueSummary`.
- [ ] **Step 4: Run the tests and confirm they pass.**
- [ ] **Step 5: Commit** with message `feat: check mapping coverage and types per assessment and reporting method`.

---

### Task 5: Submission lifecycle — draft, import, generate, seed

**Files:**
- Modify: `docs/prototypes/certification-prototype.html` (actions block near `uploadArtifact`, and `seed()`)
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–4, plus the existing `hist`, `tick`, `me`, `recomputeStatus`, `currentVersion`, `suggestName` and `isStale`.
- Produces:
  - `sub.mappingDraft`: `null | {doc, baseVersion /* number|null */, dirty:boolean}`
  - **Artifact versions made by the tool** add the fields `source:'tool'`, `doc` (deep clone made with `JSON.parse(JSON.stringify(...))`), `issues` (from `computeIssues`) and `summary` (from `issueSummary`). Uploaded versions get `source:'upload'`; set this in `uploadArtifact` and in `artifactSet`.
  - `openMappingDraft(sub) -> draft|null`. It returns the existing draft. If there is none:
    - current version with `source:'tool'`: clone its doc into a new draft.
    - current version with `source:'upload'`: parse `WORKBOOK_FIXTURES.vendorb`, set `importReport.source='csv'`, and create a draft.
    - no version: return `null`.

    New drafts have `baseVersion` set to the current version number (or null) and `dirty:false`.
  - `startBlankMapping(sub) -> draft`. The draft holds `emptyMappingDoc()` with `importReport:{source:'blank', ...zeros, placeholders:[]}` and `dirty:true`. History: `'Mapping started from scratch in mapping tool'`.
  - `importWorkbook(sub, sim /* 'clean'|'vendorb'|'malformed' */, opts={}) -> {needsConfirm:true} | {ok:false, errors} | {ok:true, report}`.
    - If a draft exists and `!opts.replace`, return `{needsConfirm:true}` without changing anything.
    - On failure, write the history entry `'Mapping workbook import rejected — <n> problems'`.
    - On success, replace the draft (`dirty:true`) and write `'Mapping workbook imported — <resolved> resolved, <needsTarget> need a target'`.
  - `markDraftDirty(sub) -> void`, which every UI edit calls.
  - `generateMapping(sub) -> version`. This calls `reconcileNotes` first, then:
    - pushes a version with `name = suggestName(sub,'mapping',cur)`;
    - writes the history entry `'Mapping generated in mapping tool: Vendor mapping CSV v<n> (<total> issues, <explained> explained)'`;
    - sets `sub.artifactsChangedAt` and calls `recomputeStatus`;
    - leaves the draft in place with `baseVersion=n` and `dirty:false`.
  - `mappingIssueBadge(version) -> string`. This returns `''` for uploads and for zero issues; otherwise `<span class="badge b-amber">${total} issues · ${explained} explained</span>`.

**Seed changes:**
- `s2`'s v1 gets `source:'upload'` (it's the vendor-side "Open in mapping tool" demo).
- `f2` gets a third mapping version `nw-assessments-mapping-v3.csv`, made by the tool. Build its doc from `parseWorkbook(WORKBOOK_FIXTURES.clean)` with product `Northwind Assess` and namespace `uri://northwind.example.com/`. Then remove the `TestDate` element and change `Grade` to type `String`, which gives exactly 4 issues. Attach notes to 3 of them.
- Construct this with the Task 3–4 functions. They are `function` declarations, so they can be called from `seed()`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail.** Expected: 5 failures.
- [ ] **Step 3: Implement** the functions and seed changes listed under Interfaces.
- [ ] **Step 4: Run the full test file and confirm all tests pass, the existing 60 included.** If a seed-time `ReferenceError` appears, it's a TDZ issue: move the constant above mutable state.
- [ ] **Step 5: Commit** with message `feat: add mapping draft, workbook import and generate to submissions`.

---

### Task 6: Entry point, import modal, route

**Files:**
- Modify: `docs/prototypes/certification-prototype.html` (`artifactCard`, `vendorScreen`, `reviewerScreen`, `bind`, `bindOverlay`, plus new `importModal` and `importSummaryModal`)
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Consumes: Task 5.
- Produces:
  - **Mapping row actions in `artifactCard(sub, false)`**, when `MODELS[sub.model].kind === 'assessments'` and `a.id === 'mapping'`:
    - No version: `data-act="mapimport"` "Import workbook" (primary `btn sm`), `data-act="mapblank"` "Build from scratch" (`btn ghost sm`), and the existing upload button labeled "Upload CSV".
    - Version exists: `data-act="mapopen"` "Open in mapping tool" (primary), `mapimport` "Import workbook" (ghost), and the existing button labeled "Replace CSV".
    - The current-version cell appends `mappingIssueBadge(cur)`.
  - **Reviewer view (`artifactCard(sub, true)`).** The mapping row's View button becomes `data-act="mapview"` when the current version is `source:'tool'`. The badge is shown here too.
  - `importModal(sub)`:
    - **File field:** text input `#fileName`, default `'<slug>-mapping-workbook.xlsx'`.
    - **Simulate radios:** `name="mapsim"` with values `clean` ("A clean workbook — every required field mapped"), `vendorb` ("The Vendor B Diagnostic workbook as-is — old paths, type typos, missing required fields, placeholders") and `malformed` ("A workbook that isn't the template — missing tabs and headers"). The heading reads "Simulate (prototype only — no file is really parsed)".
    - **Confirm button:** `data-act="mapimportconfirm"`.
    - **When a draft exists**, a banner reads "Importing replaces your current draft, including its notes."
  - `importSummaryModal(sub, report)`. It shows counts for resolved, need a target, types corrected, descriptor values added, standard descriptors enabled, and placeholders skipped (each placeholder type listed). Its button `data-act="mapgoeditor"` reads "Open mapping tool".
  - **Malformed result:** reuse the existing "rejected" modal style with the title `'Mapping workbook rejected'`.
  - **Routes:** `vendorScreen` `case 'mapping': return mappingScreen(route.args[0], route.args[1] || 'elements', false);` and `reviewerScreen` `case 'mapping': return mappingScreen(route.args[0], route.args[1] || 'issues', true);`. `mappingScreen` is a stub returning `crumbs` plus the heading "Mapping tool" until Task 7.
  - **Actions:**
    - `mapopen`: call `openMappingDraft`, then `go('#/mapping/'+sub.id)`.
    - `mapblank`: call `startBlankMapping` and go.
    - `mapimport`: open `importModal`.
    - `mapimportconfirm`: call `importWorkbook(sub, sim, {replace:true})`. The modal already warned, so confirmation is the radio submit; then open the summary or rejection modal.
    - `mapview`: go to the reviewer route.

- [ ] **Step 1: Write the failing tests**

```js
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

test('a reviewer sees the issue badge and a read-only view action', () => {
  const p = loadPrototype();
  const html = p.artifactCard(p.APP.submissions.find(s => s.productId === 'p5'), true);
  assert.match(html, /4 issues · 3 explained/);
  assert.match(html, /data-act="mapview"/);
  assert.doesNotMatch(html, /mapimport|mapopen/);
});

test('the mapping route resolves for both personas', () => {
  const p = loadPrototype();
  assert.match(p.vendorScreen({name:'mapping', args:[asmSub(p).id]}), /Mapping tool/);
  p.APP.persona = 'reviewer';
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  assert.match(p.reviewerScreen({name:'mapping', args:[f2.id]}), /Mapping tool/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement** the card changes, both modals, the routes, the stub `mappingScreen(subId, tab, readOnly)` and the bind cases.
- [ ] **Step 4: Run the tests and confirm they pass.** Then open the file in a browser:
  - Products → Test Assessment App → Assessments submission shows the three actions.
  - Import with each sim shows the summary or the rejection modal.
- [ ] **Step 5: Commit** with message `feat: add mapping tool entry point and workbook import to Vendor mapping CSV row`.

---

### Task 7: Editor screen — tabs, bank, elements, collections, checks

**Files:**
- Modify: `docs/prototypes/certification-prototype.html` (`mappingScreen` and helpers, `bind`, CSS in the `<style>` block)
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  - `mappingScreen(subId, tab, readOnly) -> html`.
    - **Source doc.** Vendor: `openMappingDraft(sub).doc`. Reviewer: `currentVersion(sub,'mapping').doc`. If the vendor has no draft, render an empty state with the Import / Build buttons from Task 6.
    - **Layout.** The page has crumbs, a header (product name, `Vendor mapping CSV v<n>` or "not generated yet", and `"Unsaved changes since v<n>"` when `dirty`) and the tab bar.
  - **Tab bar:** links to `#/mapping/<id>/<tab>` for `product`, `bank`, `elements`, `collections`, `checks`, and, for the reviewer or once any issue exists, `issues`. Each tab label shows its count (e.g. `Elements (24)`, `Checks (9 open)`).
  - **Render helpers:** `mapProductHTML(doc, ro)`, `mapBankHTML(doc, ro)`, `mapElementsHTML(doc, ro)`, `mapCollectionsHTML(doc, ro)`, `mapChecksHTML(doc)` and `mapIssuesHTML(doc, issues, ro)`.
    - **Bank** is grouped by type. Vendor values are editable rows; standard values show a toggle (`data-act="maptoggle"`); unused values carry an "Unused" badge. There is a "+ Add value" form (`data-act="mapaddvalue"`). Blocked actions toast `"In use by: <names>"`.
    - **Elements** has one row per element:
      - assessment, objective, name, a type `<select>` (`DATA_TYPES`), and an enumType `<select>` when the type is Enumeration;
      - **target chips** with `×` (`data-act="maprmtarget"`);
      - **+ Add target**, a `<select>` over `EDFI_V5_TARGETS` that shows path plus `def`, with `data-act="mapaddtarget"`;
      - a key `<select>` next to each keyed-collection chip, listing `selectableValues(doc, keyedBy)`;
      - `importNote` (original text, corrections) in muted text, a notes textarea, and per-row issue chips.

      There is also a "+ Add element" row.
    - **Collections** is grouped by assessment and then collection. One row per `collectionEntries` entry shows the key, objective, the feeding element names, and that entry's coverage (✓ / ✗ for `scores`, `scoreResults.result`, `scoreResults.resultDatatypeType`). "+ Add entry" picks a collection, a key (selectable values only) and an element (`data-act="mapaddentry"`).
    - **Checks** is `coverage(doc)` grouped assessment → objective → reporting method, with Mapped/Unmapped and the "by" list. Below it, type issues are listed.
  - **Read-only rendering:** when `ro` is set, no inputs or `data-act` edit attributes are rendered.
  - **Edit actions:** every edit action calls the Task 3 function, then `markDraftDirty(sub)` and `render()`. Selects and textareas bind on `change`; add `mapsettype`, `mapsetenum`, `mapsetkey`, `mapnotes` and `mapissuenote` to `ACTION_EVENT` as `'change'`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement** the screen, helpers, bind cases and CSS (chips: `.chip` with border radius and the existing badge palette; tab bar: the existing `.tabs` style if present, otherwise a simple flex underline).
- [ ] **Step 4: Run the tests and confirm they pass.** Then check in a browser:
  - Open the Assessments submission and click Open in mapping tool.
  - Change "Placement Level" to Level and confirm its issue chip clears.
  - Enable `Lexile Measure` in the bank, then add a collection entry with it.
  - Disable `Scale score` and confirm the "In use by" toast appears.
- [ ] **Step 5: Commit** with message `feat: add mapping editor with bank, element, collection and checks views`.

---

### Task 8: Generate step, issues tab, reviewer view

**Files:**
- Modify: `docs/prototypes/certification-prototype.html`
- Test: `docs/prototypes/certification-prototype.test.mjs`

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces:
  - **"Generate mapping CSV" button** (`data-act="mapgenerate"`) in the vendor header, always enabled. It opens `generateModal(sub)`:
    - The modal lists `computeIssues(draft.doc)` grouped by kind, each marked Explained/Unexplained, with the counts.
    - It shows the banner "Issues don't block generation. They travel with this version for the reviewer (D27)."
    - If runs exist, it shows "Runs pinned to v<n> will be marked stale (D14)."
    - Confirm (`data-act="mapgenerateconfirm"`) calls `generateMapping`, shows a toast, then returns to `#/submission/<id>`.
  - **Issues tab** (`mapIssuesHTML`):
    - Issues are grouped by kind (headings: "Required fields not mapped", "Needs a target", "Type mismatches", "Unknown types", "Enumerations without values", "Unused descriptor values", "Import placeholders").
    - Each issue shows its message and an Explained/Unexplained badge.
    - Vendor: a note textarea (`data-act="mapissuenote"`, `data-key`). Reviewer: the note text, or "No note from vendor".
    - `doc.orphanNotes` are listed under "Notes from removed items".
  - **Reviewer source of truth:** `mappingScreen(..., true)` reads only `currentVersion(sub,'mapping')`. It uses the stored `version.issues`, never recomputing, so the reviewer sees exactly what was submitted.

- [ ] **Step 1: Write the failing tests**

```js
test('the reviewer sees the generated version, not the vendor draft', () => {
  const p = loadPrototype();
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  f2.mappingDraft = {doc:p.emptyMappingDoc(), baseVersion:3, dirty:true};
  f2.mappingDraft.doc.product.name = 'DRAFT ONLY';
  const html = p.mappingScreen(f2.id, 'issues', true);
  assert.doesNotMatch(html, /DRAFT ONLY/);
  assert.match(html, /Unexplained/);
  assert.match(html, /Explained/);
});

test('issue notes are shown to the reviewer inline', () => {
  const p = loadPrototype();
  const f2 = p.APP.submissions.find(s => s.productId === 'p5');
  const cur = p.currentVersion(f2, 'mapping');
  const note = Object.values(cur.doc.issueNotes)[0];
  assert.ok(p.mappingScreen(f2.id, 'issues', true).includes(p.esc(note)));
});

test('generate modal never disables confirm', () => {
  const p = loadPrototype(); const s = asmSub(p);
  p.openMappingDraft(s);
  const {body, footer} = p.generateModalHTML(s);
  assert.match(footer, /data-act="mapgenerateconfirm"/);
  assert.doesNotMatch(footer, /disabled/);
  assert.match(body, /D27/);
  assert.match(body, /Unexplained/);
});
```

`generateModal(sub)` is `generateModalHTML(sub) -> {body, footer}` (pure) followed by `modal('Generate mapping CSV', body, footer)`.

- [ ] **Step 2: Run the tests and confirm they fail.**
- [ ] **Step 3: Implement** the items listed under Interfaces.
- [ ] **Step 4: Run the full test file and confirm everything passes.** Then check in a browser:
  - As the vendor, generate and confirm the row badge updates and the old run shows stale.
  - Switch persona to reviewer, open Northwind Assess, and click View on the mapping. The issues tab shows 4 issues, 3 explained, with notes.
- [ ] **Step 5: Commit** with message `feat: generate mapping versions with issues and add reviewer mapping view`.

---

### Task 9: PRD updates

**Files:**
- Modify: `docs/PRD-Certification-v2.md`

No tests. Make these edits, copying text verbatim from design §8 where it is given:

- [ ] **Step 1: §5.5 Artifact Ownership.** Replace the four bullets with the §8 Q1 text. Add *(Revised 2026-11-16 — vendor-authored, platform-assisted; see `docs/design/2026-11-16-assessment-mapping-tool-design.md`.)*
- [ ] **Step 2: §12 Out of Scope.** Replace the *Artifact generation* bullet with the narrowed §8 Q1 text.
- [ ] **Step 3: §7.4 FT4.**
  - Edit the "Ownership and generation boundary" line to point at the revised §5.5.
  - Add a subsection **"Assessment Mapping Tool (added 2026-11-16)"** that summarizes design §5.1–§5.8 and §8.1 as Conditions of Satisfaction bullets: entry point, import, build from scratch, descriptor bank, multi-target elements, collection entries, per-assessment/per-reporting-method checks, generate with issues, and notes.
- [ ] **Step 4: §7.6 FT6.** Add a bullet: the read-only mapping view with issue list, Explained/Unexplained state and vendor notes.
- [ ] **Step 5: §7.9 FT9.** Add audit entries for: workbook imported, workbook rejected, mapping started from scratch, and mapping generated (version, issue count).
- [ ] **Step 6: Decisions.** Where §5 or §7 records dated decisions, add **D27 (proposed):** "Mapping issues are flagged for the reviewer and never block generating a mapping version." and **D28 (proposed):** "The descriptor bank is the only source of selectable descriptor values in the mapping tool; standard Ed-Fi values start disabled."
- [ ] **Step 7: Commit** with message `docs: revise artifact ownership and add assessment mapping tool requirements to certification PRD`.

---

### Final verification

- [ ] Run `node --test docs/prototypes/certification-prototype.test.mjs`. Expected: every test passes, with 0 failures (60 existing plus about 26 new).
- [ ] Open `docs/prototypes/certification-prototype.html` from `file://` and walk through these paths:
  - vendor Import (all three sims)
  - Build from scratch → Generate
  - Open in mapping tool → edit → Generate
  - reviewer View on Northwind
- [ ] Check that no names, namespaces or identifiers from the reference vendor workbook appear in the repo diff. Grep for them locally; the list is deliberately not recorded here. Expected: no matches.
