# Assessments Mapping Validation Report: Design

**Date:** 2026-11-17
**Branch:** `certification-mapping-v2`, cut from `9a7b878`, before any mapping-tool work
**Supersedes:** the in-platform mapping editor (v1), archived on `archive/mapping-tool-v1`. That branch
holds `2026-11-16-assessment-mapping-tool-design.md` and `2026-11-17-assessment-run-scope-design.md`.
**Prototype:** `docs/prototypes/certification-prototype.html`. **PRD:** `docs/PRD-Certification-v2.md`.

## 1. Intent

v1 made the platform an **editor**: vendors rebuilt their mapping inside the platform, added translations,
bound sample columns and generated versions. This design reverses that. The platform becomes a
**validator**:

- The vendor's filled **Data Mapping Template workbook** and their **sample data** are the source of
  truth. The vendor edits both outside the platform and re-uploads them.
- The platform reads the two files, pushes each sample row through the mapping, and produces a
  **mapping validation report**.
- The report answers one question first: *can the run compare expected and actual responses properly?*
  When the answer is no, the report shows exactly what's wrong and where in which file to fix it.
- When the report has **no errors**, the artifacts are sufficient. The report then shows the endpoints
  the run will turn on and the **expected response** for each. The expected response is the generated
  artifact that the run's GETs are compared against.

Why: it's a simpler experience for vendors, who keep working in the template they already know. It
also keeps the platform out of authoring the mapping, as §5.5 (vendor-owned artifacts) requires. A clean
report shows that the sample data and the mapping agree, and that together they produce valid Ed-Fi
payloads.

## 2. Goals, non-goals, anti-goals

**Goals**

- Parse the workbook and the per-assessment samples, and validate that together they produce valid
  expected payloads.
- Make **completeness** the headline: a single verdict, *Ready to run* or *Not ready: N errors*.
- Tell the vendor, for every error, **which file, tab, row or column** to fix, with a suggestion where one
  can be computed.
- Once the report is clean, show the endpoints to turn on and the expected response for each.
- Gate Assessments runs on a clean report.
- Make it quick to try another vendor's files (§9).

**Non-goals**

- Editing the mapping, the descriptor values or the sample inside the platform.
- Inferring translations from raw values to Ed-Fi values.
- Validating domains other than Assessments.
- Parsing real files in the browser (considered as option 2 in §11).

**Anti-goals** (this would be a failure even if it technically works)

- A report that buries the verdict under detail. The user must see whether the run can start without
  scrolling.
- The platform silently "fixing" vendor data. Anything it can't take literally from the files is an
  error or a visible warning, never a quiet correction.
- An error that doesn't say where to fix it.

## 3. Inputs

### 3.1 Workbook (Data Mapping Template)

Tabs and columns, as used by the reference i-Ready workbook:

| Tab | Columns used |
|---|---|
| Product | Vendor Product, Namespace, Description |
| Assessments | Assessment Type, Description, assessmentTitle, assessmentIdentifier, adaptiveAssessment, assessmentCategoryDescriptor, assessmentFamily, maxRawScore |
| ElementDefinitions | A Assessment Type, B Element, C Definition, D Data Type, E Ed-Fi ODS/API Version, F Ed-Fi ODS/API Element, G Ed-Fi ODS/API Element Complete Name, H descriptor snippet (JSON fragment holding `assessmentReportingMethodDescriptor` and `resultDatatypeTypeDescriptor`) |
| EnumerationDefinitions | Enumeration, Definition |
| EnumerationItems | Enumeration, Code Value, Short Description, Description |

A workbook missing a required tab or header is **malformed**. It is rejected outright, with a message
naming what's missing, and no report is produced.

### 3.2 Sample data: one slot per assessment

- Sample data is one artifact slot per assessment in the workbook's Assessments tab, for example
  *Sample data — ELA Diagnostic*.
- Each slot is versioned on its own.
- The sample holds the vendor's fields with the **values as posted to Ed-Fi**.

### 3.3 Pre-arranged sample columns

A few identity values aren't in the template, so the platform fixes them by convention. They are listed in
a **Required sample columns** reference, in the PRD (§7.4) and in the prototype as a panel linked from the
upload screen and from the report:

| Pre-arranged column | Ed-Fi field |
|---|---|
| `Student ID` | `studentAssessment.studentReference.studentUniqueId` |
| `Activity Id` | `studentAssessment.studentAssessmentIdentifier` |
| *(the slot the file was uploaded to)* | `studentAssessment.assessmentReference` (identifier from the Assessments tab, namespace from Product) |

- A missing pre-arranged column is an **error**.
- A **duplicate header** is a **warning**: the first occurrence is used, and the report says so. The
  i-Ready sample has two `Student ID` columns.
- In the report and in expected payloads these fields carry a **Pre-arranged** tag.

## 4. Validation rules

Every finding has a **severity**, a **check category** (the report's checklist rows, §6.1) and a **fix
location**. An error blocks the run. A warning doesn't.

### 4.1 Assessments

- Each Assessment Type value in ElementDefinitions must match an Assessment Type in the Assessments tab,
  exactly and ignoring case.
  - A mismatch is an **error**, with a suggestion when there's a close match. For example, `i-Ready ELA
    Diagnostic` → `ELA Diagnostic`.
- Each assessment must have a sample in its slot. A missing sample is an **error**: that assessment can't
  be validated, so the run can't check it.
- Assessments-tab fields map onto the `assessments` payload. Required fields are `assessmentIdentifier`,
  `namespace`, `assessmentTitle` and `assessmentCategoryDescriptor`. A blank one is an **error**.

### 4.2 Linking elements to sample columns

- **Match rule:** an element is linked to the sample column with the **same name**, exactly after
  trimming and ignoring case.
- **Unlinked element:** an **error**. It includes a **"Did you mean `<column>`?"** suggestion from the
  closest unclaimed sample header, by normalized edit distance with a threshold left to the builder.
  Examples:
  - `Placement Level` → `Overall Placement`
  - `Most Recent Diagnostic (Y/N)` → `Most Recent Diagnostic YTD (Y/N)`
  - `Date` → `Completion Date`
- **Sample columns with no element:** listed in an informational *Sample columns not checked* list. They
  aren't errors: vendors export more than they post.

### 4.3 Ed-Fi targets

- Column G must name a known target in the prototype's Ed-Fi v5 assessment slice. An unknown target is an
  **error**, with the closest known target suggested.
- Score targets (`…scoreResults`) need column H to parse into both an `assessmentReportingMethodDescriptor`
  and a `resultDatatypeTypeDescriptor`. A missing or unparseable snippet is an **error**.
- A descriptor URI in column H must resolve:
  - In the vendor namespace, it must match an EnumerationItems Code Value.
  - In `uri://ed-fi.org/`, it must be a standard Ed-Fi value.
  - Otherwise it's an **error**.

### 4.3a Which enumeration a descriptor element uses (added 2026-11-17 while planning)

An element row doesn't name its enumeration, so the platform resolves it from the target's descriptor type,
for example `studentAssessment.accommodations` → `AccommodationDescriptor`. In order:

1. The vendor enumeration whose name equals the descriptor type without `Descriptor`, ignoring case
   (`AccommodationDescriptor` → `Accommodation`).
2. Otherwise, the prototype's standard Ed-Fi list for that descriptor type (`GradeLevelDescriptor`).
3. Otherwise, an **error**: *Workbook › EnumerationDefinitions: no enumeration for
   `AccommodationDescriptor`. Did you mean `Accomodation`?*

The reference workbook spells it `Accomodation`, so this is one of its real errors. Vendor descriptor URIs
are built as `<namespace><DescriptorType>#<Code Value>`.

### 4.4 Values

Applied to every value in a linked column, across all sample rows. Blank cells are allowed and produce no
field in the payload.

| Target type | Rule | On failure |
|---|---|---|
| Vendor descriptor (Enumeration whose items are in EnumerationItems) | Value equals a Code Value for that enumeration, after trimming and ignoring case | **Error** per distinct value, with the closest Code Value as a hint |
| Standard Ed-Fi descriptor (for example `GradeLevelDescriptor`) | Value equals a code in the prototype's standard list for that type | **Error** per distinct value, with the closest code as a hint (`3` → `Third grade`) |
| Boolean result | `true` or `false` | **Error**. `Y` / `N` isn't accepted, because the sample is the values as posted. |
| Integer, Decimal, Percentage, Percentile results | Parses as that number type | **Error** |
| Level, Range, String results | Any non-blank text | none |
| Date (`administrationDate`) | ISO 8601 date or date-time | **Error**, with the hint "expected YYYY-MM-DD". For example, `9/1/24` fails. |

Each error is reported **once per distinct value per column**, with a count of the rows affected, not once
per row.

### 4.5 Objective codes

The vendor's posted `identificationCode` isn't in either file, so the platform derives it. Comparison
against live data relies on **normalized matching**, not exact codes:

- **Derive:** the code is the element name with the score suffix removed. *(Corrected 2026-11-17 while
  planning: the reporting method's name isn't the suffix. `Phonics Scale Score` reports `Raw Score`.)* The
  suffix is the name of the **assessment-level element with the same reporting method** in the same
  assessment. `Raw Score` is reported by `Scale Score`, so `Phonics Scale Score` becomes `Phonics`.
  - When no assessment-level element shares the reporting method, the suffix is the longest common
    trailing run of words among the objective elements with that reporting method.
  - If neither rule yields a non-empty prefix, it's an **error**.
- **Normalized key:** lowercase, with whitespace and punctuation removed.
  `Reading Comprehension:  Literature` and `Reading Comprehension - Literature` produce the same key.
- **Errors:**
  - an element under `objectiveAssessment…` whose name doesn't end in its reporting method's name
  - elements whose derived codes produce the same key but are spelled differently. This is a **warning**,
    and the expected payload uses the first spelling.
- **At run time:** expected objectives are paired with live `objectiveAssessments` by normalized key. A
  live record with no match is reported as *Objective not found*, with the live codes listed next to it.
- The report lists the derived codes per assessment.

### 4.6 Fix locations and wording

Every finding renders as `<File> › <Tab or Column> [row N]: <problem>. <hint>`, for example:

- *Workbook › ElementDefinitions row 7: `Placement Level` has no sample column. Did you mean `Overall Placement`?*
- *Workbook › EnumerationItems (Accomodation): sample value `Off` isn't a code value. Closest: `Read Aloud Off`. 214 rows.*
- *Sample › column `Student Grade`: `3` isn't a GradeLevelDescriptor. Closest: `Third grade`. 31 rows.*

## 5. Expected payloads, endpoints and rows

- **Endpoints to turn on** are derived from the mapping:
  - `assessments`
  - `objectiveAssessments` (only if any objective element exists)
  - `studentAssessments`
  - one descriptor endpoint per descriptor type the expected payloads use
- **Expected payloads:**
  - `assessments` and `objectiveAssessments` come from the Assessments tab plus the derived objectives.
  - One `studentAssessments` payload per selected sample row.
  - Keyed collections are built as in v1:
    - `scoreResults` keyed by reporting method
    - `studentObjectiveAssessments` keyed by objective
    - `accommodations`
- **Rows:** the run uses a **coverage-based subset**. This is the smallest set of rows that shows every
  distinct descriptor value and every objective that has a score. Ties go to the lower row index. Each
  selected row records *why it was picked*, for example "first Red Rush Flag".
- Expected payloads are only built when the report has no errors. A dirty report shows the checklist only.

## 6. Report UI

### 6.1 Top: readiness checklist

- **Verdict banner:**
  - **Ready to run**, in green, with the warning count, or
  - **Not ready to run: N errors**, in red, with "Fix these in the workbook or sample, then re-upload."
- **Checklist rows,** one per check category, each with a ✅ ⚠️ or ❌ and a count:
  1. Assessments
  2. Element ↔ column links
  3. Ed-Fi targets
  4. Values
  5. Pre-arranged columns
  6. Objectives
- **Expanding a row** lists its findings in the §4.6 wording, grouped by fix location (file › tab or
  column). That is the "where to fix it" view.
- *Sample columns not checked* and *Derived objective codes* are expandable informational lines.

### 6.2 Below, once ready: endpoints and expected responses

- **Default view, an endpoint list:** one line per endpoint, showing the record count, field count and
  descriptor count.
- **Expanding an endpoint** shows:
  - a record picker, listing selected rows with their *why picked* reason
  - the expected JSON for the chosen record
  - pre-arranged fields tagged as **Pre-arranged**
- **"Show sample row" toggle:** inside an expanded record, it switches to a **side-by-side** view: the raw
  sample row on the left and the expected payload on the right. Hovering a sample value highlights where
  it lands in the payload.
- While the report has errors, this section is collapsed and labelled *Available once ready*.

### 6.3 Where the report appears

- **Artifacts card:** the Assessments submission's mapping row shows the verdict as a badge, for example
  *Not ready · 6 errors*, and opens the report.
- **Start-a-run screen:** this replaces v0's fixed "In-scope resources" panel and its "needs a mapping CSV
  first" banner.
  - The Assessments run button is enabled only when the report is *Ready to run*.
  - When the button is disabled, the reason links to the report.
- **Reviewer submission view:** the same report, read-only, plus the run-scope narrowing controls (§7).

## 7. Runs

- **Start condition:** a run starts only from a *Ready* report. It pins the workbook version, each sample
  slot version and the run scope.
- **What a run does:** for each selected row, the run GETs `studentAssessments?studentUniqueId=…`, matches
  on `studentAssessmentIdentifier`, and compares field by field after §9.1 normalization:
  - trimmed strings
  - parsed numbers
  - dates compared as instants
  - descriptor codes ignoring case
  - keyed collections matched by key, with objectives matched by normalized key
- **Result kinds:**
  - Pass
  - Fail (value)
  - Fail (descriptor not loaded)
  - *Record not found*
  - *Objective not found*
  - *Excluded by reviewer*
- **"Cannot check" is dropped** (Claude's call). Strict validation means nothing untranslated reaches a
  run.
- **Reviewer narrowing is carried over from v1** (Claude's call). The reviewer can exclude endpoints or
  add and remove rows for one submission:
  - Every change needs a reason.
  - Every change is visible to the vendor and written to history.
  - Every change makes earlier runs stale.
  - The reviewer can't add endpoints the mapping doesn't imply.
- **Simulated outcomes:** the prototype simulates GET responses with a labelled outcome switch, as the
  prototype's other runs do.

## 8. Prototype data: fixtures and the outcome switch

- **Fixture shape:** a validator input is one object,
  `{ name, workbook: { Product, Assessments, ElementDefinitions, EnumerationDefinitions, EnumerationItems }, samples: { <assessmentType>: { name, columns, rows } } }`.
  Tabs are arrays of row objects keyed by header. The validator knows nothing about where a fixture came
  from.
- **Fixtures** (all fictitious test data, no real PII):
  - **i-Ready, original files:** the real workbook and ELA sample as provided. Expected verdict: *Not
    ready*, with the errors in §4 (unlinked `Placement Level` and `Most Recent Diagnostic (Y/N)`, Read
    Aloud values, Most Recent Y/N, Grade values, Baseline Y/N, `M/D/YY` dates, the Assessment Type
    mismatch, and others the code finds).
  - **i-Ready, corrected:** the same files with those errors fixed, and with the **Math Diagnostic
    assessment and its elements removed** from the workbook. There is no Math sample, and the vendor only
    certifies what they sampled; this was decided 2026-11-17. Expected verdict: *Ready to run*. The
    original workbook still has Math, so the missing Math sample is one of its errors.
  - **Malformed workbook:** a required tab removed. The upload is rejected.
- **Vendor name in the public repo (Claude's call):** fixtures are committed under the pseudonym
  **Vendor B**, following the repo's existing convention (commit `d356e66`). The converter takes a
  `--rename "i-Ready=Vendor B" --rename "uri://cainc.com/=uri://vendorb.example/"` map, applied to
  every string. Values are otherwise kept as provided, so the original errors survive. The archive's
  pre-anonymized `SAMPLE_ELA` is **not** reused, because it altered `Activity Id`.
- **Outcome switch, per slot (Claude's call):**
  - The mapping slot's upload modal offers workbook variants (original, corrected, malformed).
  - Each sample slot offers sample variants (original, corrected).
  - Variants can be mixed, so a corrected workbook with the original sample is a valid, instructive
    state.
  - A **Load fixture set** shortcut on an Assessments submission fills every slot in one step, for
    trying another vendor quickly.
  - Each slot records its own version.
- **Seeds (Claude's call):** all three existing Assessments submissions move to the validator, and the
  hard-coded `ASSESSMENT_RESULTS` is removed:
  - `s2` (Vendor B): original files → *Not ready*.
  - `f2` (Northwind): corrected files renamed to Northwind → *Ready*, with a passed qualifying run, In
    Review.
  - `f4` (Acme): corrected files renamed to Acme → *Ready*, Approved.

  The same data under three names is acceptable for a demo.
- **Labels (Claude's call):** for Assessments submissions only, "Vendor mapping CSV" is shown as
  **Mapping workbook**, and Sample data is shown per assessment. Other models keep their labels. The
  product-documentation *Incomplete* stamp (§8.1) stays separate from report readiness. Both must hold
  for a submission to be complete and runnable.

## 9. Converter: trying another vendor's files

`docs/prototypes/tools/build-fixture.mjs`:

```
node docs/prototypes/tools/build-fixture.mjs --name vendorc \
  --workbook path/to/mapping.xlsx --sample "ELA Diagnostic=path/to/ela.csv" [--sample …]
```

- It reads the `.xlsx` with Node's standard library: an xlsx file is a zip, unpacked with `zlib`, with
  shared strings and sheet XML parsed directly. There are **no dependencies**.
- It reads each CSV with the quote-aware parser from v1's `build-sample-data.mjs`.
- It prints a fixture `const` to paste in, or writes it into a marked fixtures block in the prototype.
- A workbook that doesn't follow the template's tabs and headers fails with the same *malformed* message
  the report would show.
- **No anonymization step.** Test files are fictitious, a decision made 2026-11-17. If real exports are
  ever used, a scrub step must be added first.

Moving to real in-browser upload later (§11, option 2) would mean putting a browser front end on the same
converter. The validator and the report don't change.

## 10. Reuse from `archive/mapping-tool-v1`

Copy these, don't re-derive them, and adapt them to the fixture shape:

- the Ed-Fi v5 assessment slice (`EDFI_V5_TARGETS`, and the result datatypes per target)
- the anonymized ELA sample (`SAMPLE_ELA`) and the CSV parser in `tools/build-sample-data.mjs`
  - The original sample is fictitious, so either source is acceptable. The original keeps the original
    errors visible.
- the expected-payload builders (`expectedAssessment`, `expectedObjectives`, `expectedStudentAssessment`)
- row selection (`selectRows`, `rowKey`)
- endpoint derivation (`deriveEndpoints`)
- run comparison (`compareValue`, `compareRecord`, `simulateResponses`, `runAssessmentChecks`)
- reviewer run scope (`runScopeOf`, `effectiveScope`, scope change and undo functions)
  - Watch v1's TDZ lesson: any `const` reached from `seed()` must be declared above the mutable-state
    marker.

**Not carried over:**

- the in-platform editor
- the descriptor bank
- translation tables
- sample-column bindings
- Generate and mapping versions created in the platform
- the "Cannot check" result

## 11. Approaches considered

| Approach | Trade-off | Outcome |
|---|---|---|
| **1. Embedded fixtures + outcome switch + offline converter** | Deterministic demo of the failure and success paths. No dependencies. Another vendor's files take one command. Testers can't drop files into the page. | **Chosen** |
| 2. Real `.xlsx` / `.csv` upload parsed in the browser | Anyone can try files, but it adds the page's first external library and binary test fixtures, and most of the effort goes into parsing edge cases that don't inform the PRD | Deferred. It can be layered on the converter later. |
| 3. Both | Most reach, but double the surface for a prototype | Not chosen |

**Earlier conceptual choices** (made in conversation on 2026-11-17):

- **Raw values vs Ed-Fi values:** exact Code Value matching. This is strict, the template is the
  authority, and there's no translation column.
- **Element ↔ column links:** exact name match, with suggestions in the report.
- **Identity fields:** pre-arranged sample columns with a published reference, chosen over requiring
  them in the workbook or deriving them.
- **Objective codes:** derived from element names and matched by normalized key, chosen for consistency
  with live data.

## 12. PRD impact (`PRD-Certification-v2.md`)

- **New §5.7, Assessments Mapping Validation decisions (proposed):**
  - **D32:** the workbook and samples are the source of truth, and the platform validates and never edits.
  - **D33:** an Assessments run requires a report with no errors.
  - **D34:** values must equal the template's Code Values or standard Ed-Fi codes, with no translation.
  - **D35:** identity comes from pre-arranged sample columns.
  - **D36:** objectives are matched by normalized key.
  - IDs D27–D31 were used by the archived v1 proposals and are left unused to avoid confusion.
- **§7.3:** Assessments' required endpoints are derived from the mapping. Runs compare against the
  report's expected responses.
- **§7.4:** the mapping validation report. Includes the Required sample columns reference, sample data as
  one slot per assessment, and the malformed-workbook rejection.
- **§7.5:** result kinds per §7, and §9.1 normalization including the normalized objective key.
- **§7.6:** the reviewer sees the report and the run-scope narrowing controls.
- **§7.9:** history events for report generation (with verdict and counts), malformed rejection, and
  run-scope changes.
- **§15:**
  - OQ7 is partly answered: the format is the Data Mapping Template workbook, plus raw sample CSVs with
    the pre-arranged columns.
  - OQ1 is partly answered for Assessments.
  - **New OQ:** can a submission certify only some of a product's assessments, by marking an
    assessment in the workbook as out of scope? Today every assessment in the workbook needs a sample.
    Raised 2026-11-17 for the workgroup.

## 13. Left to the builder

- the edit-distance metric and suggestion threshold
- the exact standard Ed-Fi code lists included in the prototype (at least GradeLevel, AssessmentCategory,
  ResultDatatypeType and the standard AssessmentReportingMethods the i-Ready workbook references)
- the visual details of the checklist and the side-by-side view, within the prototype's existing styles
- whether the converter writes into the HTML directly or prints a block to paste

## 14. Deferred follow-ups (recorded 2026-11-18, after the final review)

Built and reviewed on `certification-mapping-v2`; these were consciously left for later.

**Not built from this design**
- **Hover highlight in the side-by-side view (§6.2).** Hovering a sample value should highlight where it lands in the expected payload. The sample row is shown beside the payload, but nothing highlights.

**Validator input handling**
- Required headers are matched case-sensitively: a lowercase `code value` makes the workbook malformed, though links and Assessment Type matching ignore case.
- An ElementDefinitions row holding only an Assessment Type becomes an element with a blank name; it should be reported as "Element is blank" and skipped.
- A Product `Namespace` without a trailing `/` produces many "doesn't resolve" errors with no hint; validate it once with a clear finding.
- Two sample rows with the same `Student ID` + `Activity Id` still pass; a warning would match "values as posted" (a real GET returns one record).

**Run scope**
- *Include again* and *Undo* take no reason, though §7 says every change needs one. Decide whether to require one.
- `effectiveScope` lazily creates `sub.runScope` during render (impure; harmless).
- A failed reason dialog re-renders and loses the typed reason.

**Report and runs**
- `APP.reportView` (expanded category/endpoint/record, side-by-side toggle) is global, so it carries over between submissions and between the vendor and reviewer pages; key it by submission.
- The realistic run's *Record not found* fault depends on the value fault's row not being the last selected row; make each fault independent.
- The run results page renders every record (~600 KB for a realistic run).
- Descriptor endpoint records use the code as `shortDescription`; the workbook's Short Description isn't threaded through.

**Converter (`tools/build-fixture.mjs`)**
- Fixture JSON is written into a `<script>` without escaping `</script>` or `<!--`; escape `<` as `<`.

**Still owed**
- A human click-through of the report, start-a-run and reviewer screens in a browser (only a headless render was done).
- Workgroup confirmation of D32–D36 and an answer to PRD OQ14 (partial-assessment certification).
