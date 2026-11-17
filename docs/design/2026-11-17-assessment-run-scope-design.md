# Assessments Run Scope and Expected Payloads — Design

Date: 2026-11-17
Status: Draft for review
Scope: Assessments v5 certification — `docs/prototypes/certification-prototype.html`, its tests, and
`docs/PRD-Certification-v2.md`
Builds on: `docs/design/2026-11-16-assessment-mapping-tool-design.md` (this is the "later step" its §5.10
deferred: driving run scope from the tool's mappings)

## 1. Intent

An Assessments certification run is a series of **GET requests** against the vendor's certification
environment. Today the prototype's *In-scope resources* panel and the run results are fixed fixtures
(`ASSESSMENT_RESULTS`), so neither says anything about the vendor's actual artifacts.

This design makes both real. The vendor's **sample data** is the raw shape and values the vendor posted to
the Ed-Fi API. Put through the vendor's **mapping**, each sample row becomes an **expected Ed-Fi payload**.
The run GETs the matching records and checks that the response has the expected shape **and** values.

Before a run starts, everyone can see exactly what it will check: which endpoints, which fields and
descriptors, which sample rows, and the expected payload for each. The **reviewer** decides, per
submission, which endpoints the run includes.

The purpose of this iteration is to make the mechanism clickable so PRD requirements can be derived from
how it behaves, using a real vendor's ELA sample file and mapping workbook (anonymized) as the demo.

## 2. Goals

- Derive the in-scope GET endpoints from the current mapping version, not from a fixture.
- Let the vendor record, in the mapping tool, how each raw sample value becomes an Ed-Fi value.
- Let the reviewer include or exclude endpoints for one submission, with a recorded reason.
- Pick a small, coverage-based subset of sample rows to check, which the reviewer can adjust.
- Before a run, show per endpoint: fields checked, descriptors checked, the rows used and the expected
  payload for any chosen row.
- Compute run results by comparing (simulated) GET responses with the expected payloads, so every agreed
  rule is visible working: value mismatch, record not found, untranslated value, excluded endpoint, stale
  runs.

## 3. Non-goals

- Real HTTP calls. GET responses are simulated from the expected payload, driven by the existing
  prototype-only *Simulated outcome* switch.
- Writes (POST/PUT). Assessments runs stay read-only (§5 of the PRD).
- Checking every sample row.
- The Math Diagnostic sample file. Only the ELA sample is embedded (see §5.2).
- Domains other than Assessments.

## 4. Anti-goals (failure even if it works)

- **The platform authors the mapping.** Value translations and sample-column bindings are the vendor's
  choices in the mapping tool. The platform may pre-list the distinct sample values that need a
  translation, but never fills in the Ed-Fi side.
- **A mapping gap reads as an API failure.** A value the vendor never translated is reported as
  *Cannot check*, never as a failed check against the API.
- **The reviewer silently changes what a run proves.** Every scope change has a reason, is in audit
  history, is visible to the vendor, and makes earlier runs stale.
- **The scope can grow beyond the mapping.** The reviewer can only narrow what the mapping implies.
- **Real vendor identity leaks into this public repo.** The demo data stays anonymized as "Vendor B".

## 5. Decided behavior

### 5.1 Decisions made with the product owner (2026-11-17)

| # | Decision |
|---|---|
| R1 | Raw-to-Ed-Fi value translation is **vendor-authored in the mapping tool** (option 1). |
| R2 | The **reviewer** controls which endpoints are included, **scoped to one submission**. |
| R3 | An Assessments run is a series of GETs checking **shape and values** of the response against the expected payload produced from sample data through the mapping. |
| R4 | Runs check a **subset** of sample rows, chosen by **coverage**, which the reviewer can adjust. |
| R5 | A selected row's field whose sample value has no translation is reported as **Cannot check: untranslated**, not as a failure. |
| R6 | Build approach **A**: compute scope, rows, expected payloads and results from the real mapping and sample data in the prototype (see §6). |

### 5.2 Sample data artifact

- **One sample slot per assessment** (Q0, resolved). The Required artifacts card shows one *Sample data —
  <assessment>* row per assessment in the current mapping, each versioned on its own. A sample version
  carries parsed content: `{name, columns, rows}`. Runs pin a map of assessment → sample version, and
  replacing any one marks earlier runs stale.
- **Completeness**: the sample-data requirement is met only when every assessment in the current mapping
  has a sample. *(Claude's call)* In the demo, `s2` has no Math sample, so its runs are stamped Incomplete
  until one is uploaded — which also shows the rule working.
- The prototype embeds the vendor's ELA sample (156 rows, all 80 columns) as the seed for the Vendor B ELA
  Diagnostic. Anonymization: keep the generic certification identifiers (`EdFiCertificationStudentN`,
  Grand Bend school IDs) and the score values; **blank the Class Teacher(s) column** (synthetic but reads
  like real names, and nothing maps to it); regenerate Activity Id values. *(Claude's call)*
- The Math Diagnostic has no sample file in the demo. Its student-level checks show *Cannot check: no
  sample data for this assessment*. Assessment-level and descriptor checks still run.
- **Source and extraction.** The source files are the vendor's ELA sample CSV and filled mapping workbook,
  held privately in the certification documents folder (not in this repo). A one-off script in
  `docs/prototypes/tools/` (like `build-collection-data.mjs`) reads them by path argument and writes the
  anonymized data into the prototype. The product owner reviews the anonymized diff before it is committed.
  *(Claude's call)*
- Simulated sample uploads reuse the embedded dataset under the new file name. *(Claude's call)*
- A sample is still **not** required to start an Assessments run (D15 unchanged). Without one, only
  assessment-level and descriptor checks are in scope.

### 5.3 Mapping tool additions

Each element gains:

- **Sample column**: which column of the sample file feeds it. The sample's column names don't match the
  workbook's element names (*Duration (minutes)* vs `Duration (min)`, *Scale Score* vs
  `Overall Scale Score`, *Most Recent Diagnostic (Y/N)* vs `Most Recent Diagnostic YTD (Y/N)`, *Date* vs
  `Start Date`/`Completion Date`), so the binding must be explicit.
  **Suggested prefills** (Q1, resolved): when a column name matches an element name exactly (trimmed,
  case-insensitive), the tool pre-fills it as a *suggested* binding, visibly marked, with **Confirm** per
  element and **Confirm all suggestions**. A suggestion counts as a binding only once confirmed; an
  unconfirmed suggestion is listed under *No sample column*. The vendor can change any suggestion.
- **Value translations** (enumeration and Boolean elements): a table of *sample value → Ed-Fi value*. Rows are
  pre-listed from the distinct non-blank values found in that column of the current sample version. The
  Ed-Fi side depends on the **target**, not the element's type: a descriptor target takes a bank value; a
  score target takes the result string its result datatype calls for (e.g. *Baseline Diagnostic (Y/N)* is an
  Enumeration element targeting `scoreResults` with datatype Boolean, so `Y` → `true`). An element whose
  targets need different kinds of value gets one translation column per kind. *(Claude's call)* Example:

  | Sample value (Read Aloud) | Ed-Fi value |
  |---|---|
  | `Off` | `uri://vendor-b.example.com/AccommodationDescriptor#Read Aloud Off` |
  | `Directions, Questions, and Answer Choices` | `…#Read Aloud Directions Questions Answers` |
  | `Directions, Questions, Answer Choices, and Passages` | *(not translated)* |

- **Date format** (Date elements): picked from a fixed list (`M/D/YY`, `M/D/YYYY`, `YYYY-MM-DD`). A sample
  value that doesn't parse under the chosen format raises the mapping issue *Sample value doesn't fit the
  date format*, and the field is *Cannot check* in runs. *(Claude's call)*
- Other types pass through, normalized per §9.1 rules (numbers parsed, strings trimmed).
- **Identity elements.** `studentAssessment.studentReference` and `studentAssessment.studentAssessmentIdentifier`
  are already required in the v5 slice, so the as-is workbook correctly shows them unmapped. The demo's
  seeded mapping maps *Student ID* → `studentReference` and *Activity Id* → `studentAssessmentIdentifier`.
- **Objective identification code**: each objective assessment in *Product & assessments* gets an
  editable `identificationCode`. The platform cannot know it, so it starts empty and is flagged when empty.
  *(Claude's call)*
- **v5 slice additions**: `studentAssessment.accommodations` (AccommodationDescriptor, collection) and
  `studentAssessment.period` (AssessmentPeriodDescriptor), so Read Aloud and Norming Window can be
  mapped. *(Claude's call)*
- **New issue kinds** (flag, never block — D27):
  - *Untranslated sample value* — a distinct sample value with no Ed-Fi value.
  - *No sample column* — a mapped element with no column, raised only when a sample exists for its
    assessment.
  - *Objective code missing*.
- Sample-dependent issues are computed against the **current** sample version. A generated mapping version
  keeps the issue snapshot it was generated with, as today.

### 5.4 Derived scope: endpoints

From the mapping version and sample version a run would pin, the platform derives:

| Endpoint | Records | Source of expected values |
|---|---|---|
| `assessments` | one per mapped assessment | Product & assessments rows + `assessment.*` targets (incl. `scores` definitions: reporting method + datatype) |
| `objectiveAssessments` | one per objective assessment | objective rows + `objectiveAssessment.scores` |
| `studentAssessments` | one per selected sample row | sample row through the mapping; objective scores nested in `studentObjectiveAssessments` |
| one `…Descriptors` endpoint per descriptor type used | each Ed-Fi value used by translations, reporting methods and datatypes | the bank |

For the ELA demo that is `assessments`, `objectiveAssessments` (7 domains), `studentAssessments`, and about 8
descriptor endpoints (reporting method, result datatype, assessment period, event circumstance, retest
indicator, accommodation, language, grade level).

### 5.5 Derived scope: sample rows (coverage subset)

- **Features** come from mapped elements only: every distinct sample value of each enumeration/Boolean
  element, **translated or not**, so an untranslated value is always surfaced as *Cannot check* without the
  reviewer having to go looking for it *(Claude's call)*; each objective assessment with a non-blank score;
  one "all domain scores blank" case.
- **Selection**: greedy — repeatedly take the row covering the most uncovered features, ties broken by
  file order, until every feature is covered. Deterministic, so the same artifacts always give the same
  rows. Expected size for the ELA demo: about 10–15 of 156.
- Each selected row shows **why it was picked** (e.g. *covers: Red Rush Flag, Spanish*).
- Rows with an untranslated value are still eligible; their untranslated fields become *Cannot check*.
- Earlier proposal corrected: schools are **not** a coverage feature, because nothing in the mapping
  targets the school, so it isn't checked.

### 5.6 Reviewer scope controls

- On the reviewer's submission view, a **Run scope** card lists the derived endpoints with an on/off
  control each, and the selected rows with *Remove* and an *Add row* picker over the whole sample.
- **Default**: every derived endpoint on; rows = the coverage subset. Vendors can run before a reviewer
  touches it.
- Turning an endpoint off, adding a row or removing a row **requires a reason**. Each is a history entry.
  Turning an endpoint back on, or undoing a row change, is also recorded.
- Adjustments are keyed by **Student ID + Activity Id**. If a later sample version no longer contains the
  row, the adjustment shows *Row no longer in sample* and is ignored. A new mapping version adds newly
  implied endpoints as on; endpoints no longer implied drop out with their exclusion.
- **Excluding `studentAssessments`** excludes all row checks. **Excluding a descriptor endpoint** skips the
  existence check of those descriptors; descriptor URIs inside payloads are still compared.
- The vendor sees excluded endpoints and row changes read-only, with the reviewer's reason.
- Reviewers can't change the mapping or sample (§5.5, D-unchanged); scope is the only lever.

### 5.7 Pre-run preview ("In-scope resources")

- On the vendor's **Start a run** screen (read-only) and the reviewer's **Run scope** card (editable), the same
  panel:

  ```
  In-scope resources        mapping v2 · sample data v1 (156 rows, 12 selected)
   [on]  assessments                 2 records   9 fields   3 descriptors   ▸
   [on]  objectiveAssessments        7 records   4 fields   2 descriptors   ▸
   [on]  studentAssessments         12 records  26 fields   9 descriptors   ▸
   [off] accommodationDescriptors   Excluded by reviewer: "…"               ▸
  ```

- Expanding an endpoint shows: the GET request(s) it will make; each field checked with its source
  element, sample column and type rule; descriptors checked; and the **expected payload** as JSON for one
  record, with a picker to switch records. Fields that can't be checked are listed with the reason
  (*untranslated*, *no sample column*, *blank in sample*).
- A separate list shows **sample columns not checked** because nothing maps them (e.g. Placement For Families,
  Grouping, Reading Difficulty Indicator).
- Blank sample cells produce **no expected value** (not "expect empty").

### 5.8 Run execution and results

- At start, the run pins mapping version, sample version **and the effective scope** (endpoints on/off, row
  list). A later scope change marks the run **stale**, exactly as an artifact change does (D14, FR11).
- GET plan per selected row: `studentAssessments?studentUniqueId=<id>`, then match the record whose
  `studentAssessmentIdentifier` equals the translated Activity Id and whose assessment reference matches.
  Single fetches for `assessments`, `objectiveAssessments` and each descriptor endpoint.
- Comparison reuses the §9.1 normalization (trim strings, parse numbers, parse dates to instants).
  Descriptor URIs compare case-insensitively on the code value. *(Claude's call)* Keyed collections
  (`scoreResults`, `studentObjectiveAssessments`) are matched by key, not position.
- **Result kinds**: existing *Pass*, *Missing element*, *Invalid descriptor*, *Value mismatch*, *Type error*,
  *No data returned* (endpoint empty), plus new:
  - *Record not found* — a selected row's student assessment isn't returned.
  - *Descriptor not loaded* — a used descriptor value is absent from its descriptor endpoint.
  - *Cannot check* — untranslated value, no sample column, or no sample for the assessment. Neither pass nor
    fail.
  - *Excluded by reviewer* — shown for traceability, not counted.
- **Outcome** (Q2, resolved): a run passes when it has no failures; *Cannot check* never stops a run from
  passing or qualifying. It must be **visibly flagged**: a distinct amber *Cannot check* badge per field; a
  count beside pass/fail in the run summary and the runs table (e.g. *Passed · 3 cannot check*); a banner on
  the run results listing the reasons with links to the fields; and the same count on the reviewer's
  submission view.
- Results are grouped endpoint → record (row) → field, so a reviewer can open one student's full
  expected-vs-observed comparison.
- **Simulated responses** (prototype only): *All checks pass* returns the expected payload with harmless
  formatting differences (dates as ISO instants, trailing spaces, `100.0`). *Realistic first run* additionally
  injects, deterministically: one row's Phonics and Vocabulary scale scores swapped (value mismatch), one
  row not returned (record not found), one `whenAssessedGradeLevelDescriptor` absent (missing element), one
  vendor descriptor value not loaded. *Infrastructure* and *Authentication* outcomes are unchanged.

### 5.9 Demo seed

- `s2` (vendor's Assessments submission): keeps v1 (as-is import) and gains **v2 generated in the tool** with
  all 42 ELA elements, identity elements, sample columns and translations — except Read Aloud's
  *…and Passages* value, left untranslated so *Cannot check* is visible. Sample data v1 = the embedded ELA
  file. *(Claude's call)*
- `f2` (reviewer side, Northwind, In Review) keeps mapping v3 and its issues/notes untouched, so the
  reviewer mapping view demo still works. It gains **mapping v4** (the same ELA mapping content under
  Northwind's anonymized namespace, carrying v3's issues and notes forward) and the ELA sample. One scope
  change is seeded (an excluded descriptor endpoint with a reason), **then** a computed passed run, so the
  reviewer opens to a current qualifying run with a non-default scope; older runs show as stale. Tests that
  assert on `f2`'s current mapping version are updated. *(Claude's call)*
- The Vendor B workbook fixture is extended from ~19 ELA elements to all 42 ELA elements of the reference
  workbook, anonymized as before; Math stays as is.
- Existing fixed `ASSESSMENT_RESULTS` and the seeded historical runs are replaced by results computed from
  this seed.

## 6. Approaches considered

### 6.1 Who translates raw sample values to Ed-Fi values

| Option | Trade-off | Decision |
|---|---|---|
| **1. Vendor, in the mapping tool** | Keeps "vendor makes every mapping choice" (§5.5); adds a translation section and issue kind to the tool. | **Chosen (R1)** |
| 2. Vendor uploads sample data already in Ed-Fi values | Simplest for the platform; loses "sample = raw data as posted", so the mapping's translations are never tested. | Considered, set aside. Revisit if translation tables prove too costly for vendors. |
| 3. Platform infers translations; reviewer confirms each | Least vendor effort; the platform would author part of the mapping, against §5.5 and the mapping tool's anti-goal. | Considered, set aside. Revisit only as *suggestions* the vendor accepts, if §5.5 is relaxed. |

### 6.2 What a run checks

Shape only (presence, types, descriptor resolution) was considered: cheaper and less brittle, but blind to
a value in the wrong place. **Shape plus values** chosen (R3).

### 6.3 Which rows

All 156 rows: complete but slow and noisy. Reviewer picks from scratch: burdens the reviewer. **Coverage
subset with reviewer adjustment** chosen (R4).

### 6.4 How to build it in the prototype

| Option | Trade-off | Decision |
|---|---|---|
| **A. Compute everything** from embedded sample + extended mapping fixture with pure, tested functions; simulate GET responses | Most work (~mapping-tool sized); every rule is exercisable and reacts to edits | **Chosen (R6)** |
| B. Hand-authored static screens | Fast; nothing reacts, hides the edge cases requirements must come from | Rejected |
| C. Compute the preview, fake the results | ~⅓ cheaper; results no longer follow from expected payloads | Rejected |

## 7. Constraints

- Single-file HTML prototype, existing helpers (`modal`, `esc`, `hist`, `currentVersion`, `isStale`), no new
  libraries. The embedded sample adds roughly 100–150 KB.
- New derivation logic is pure functions over (mapping doc, sample, scope) that don't touch `APP` or the DOM,
  tested in `certification-prototype.test.mjs` (run by file; declare data above `seed()` to avoid TDZ).
- Public repo: anonymized data only.
- Reviewers never edit artifacts (§5.5); vendors never edit scope.

## 8. PRD impact

| PRD location | Change |
|---|---|
| §7.3 / §7.5 | Assessments automated validation = GETs comparing shape and values against expected payloads derived from sample data through the mapping; coverage-based row subset; new result kinds. |
| §7.4 FT4 (mapping tool) | Sample-column binding, value-translation tables, date format, objective identification code, new issue kinds. |
| §7.4 FT4 (artifacts) | Sample data is one file per assessment and is parsed, not just stored. |
| §7.6 FT6 | Reviewer *Run scope* card: endpoint include/exclude and row adjustments, reasons required. |
| §7.9 FT9 | Audit entries for scope changes; runs pin scope. |
| §15 Open Questions | OQ1 (what drives validation) partly answered for Assessments; OQ7 (sample data format) partly answered. |
| New decisions | Proposed D29: run scope is reviewer-owned per submission and can only narrow the mapping. D30: value translations are vendor-authored in the mapping. D31: runs check a coverage-based, reviewer-adjustable row subset. Record §6.1 options 2 and 3 as considered alternatives. |

## 9. Resolved with the product owner (2026-11-17)

- **Q0.** Several assessments → **one sample slot per assessment**, versioned and pinned separately (§5.2).
- **Q1.** Sample columns → **suggested prefills on exact name match, confirmed by the vendor** (§5.3).
- **Q2.** *Cannot check* → **never stops a run**, but must carry a clear visual indicator (§5.8).

## 10. Left to the builder

- Exact layout of the expected-payload viewer and the row picker.
- Data structure for scope adjustments and how the pinned scope snapshot is compared for staleness.
- How the embedded sample is stored in the file (array of arrays plus header is fine).
- Which specific rows the realistic simulation injects failures into, as long as they're deterministic and
  among the selected rows.
