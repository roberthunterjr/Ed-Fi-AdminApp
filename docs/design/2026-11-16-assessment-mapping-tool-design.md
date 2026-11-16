# Assessment Mapping Tool — Design

Date: 2026-11-16
Status: Draft for review
Scope: Assessments v5 certification — `docs/prototypes/certification-prototype.html` and `docs/PRD-Certification-v2.md`

## 1. Intent

Assessment vendors document how their product's fields map to Ed-Fi today by filling in the
*Data Mapping Template* workbook (tabs: How To, Product, Assessments, ElementDefinitions,
EnumerationDefinitions, EnumerationItems) and uploading it as the **Vendor mapping CSV** artifact.

The costly gap for reviewers is on the Ed-Fi side of that workbook:

1. **Which Ed-Fi ODS/API element(s)** a vendor element should map to. The column is free text,
   and vendors guess (the template's own examples use v2.5 paths such as
   `assessments.assessment.scores.assessmentReportingMethodType`; the reference vendor workbook uses v6.2-style
   `assessment.scores/studentAssessment.scoreResults`).
2. **Whether the type is right.** Data Type is free text ("Interger", "integer", "percentage").
3. **Whether every required field is accounted for.** Nothing in the workbook shows what the v5 model
   requires.

The mapping tool turns the workbook into a guided editor inside the certification flow. The vendor
still authors the mapping, but every Ed-Fi target is picked from the Assessments v5 model,
types are checked against the target, required fields are tracked, and descriptor values come from a
**descriptor bank** the vendor curates. The output is a new version of the Vendor mapping CSV
artifact, with any remaining issues and vendor notes attached for the reviewer.

Reference data: a real vendor's filled mapping workbook (seed example; held privately, not in this repo) and
`Data Mapping Template.xlsx` (structure), both held in the certification documents folder.

## 2. Goals

- An entry point on the **Vendor mapping CSV** row of *Required artifacts* that opens the tool.
- **Import** a filled workbook as the primary path, then fix up. **Build from scratch** as the second path.
- Map each vendor element to one or more Ed-Fi v5 targets chosen from the model, never free text.
- Check the vendor data type against the target type.
- Show which v5 required fields are mapped and which are not.
- A **descriptor bank**: adding a descriptor value to the bank is what makes it selectable in the
  mapping ("loads" it into the mapping).
- Let the vendor submit with issues outstanding. The issues are flagged for the reviewer, with vendor notes explaining
  special circumstances.

## 3. Non-goals

- Covering the full Ed-Fi Data Standard in the prototype. A representative slice of the
  Assessments v5 model is enough.
- Domains other than Assessments (SIS, MTSS). The structure should not prevent them later.
- Parsing real files in the prototype. Import is simulated, consistent with the existing upload modal.
- Changing how runs consume the mapping (§5 / D2 stays: the mapping CSV is the source of truth for
  Assessments scope).

## 4. Anti-goals (failure even if it works)

- **The platform decides the mapping.** The tool may check, flag and suggest structure, but every
  element-to-target choice is the vendor's act. No auto-mapping by name similarity.
- **Issues block submission.** Vendors must be able to generate the artifact with open issues. The
  reviewer is the decision-maker (§5.4).
- **The bank opens overloaded.** Standard Ed-Fi descriptors must not flood the vendor at first open.
- **Issues are silently auto-corrected.** Every normalization made on import is visible and reversible.

## 5. Decided behavior

### 5.1 Entry point (Required artifacts card)

On the **Vendor mapping CSV** row, vendor view only:

| Current version | Actions |
|---|---|
| none | **Import workbook** (primary), **Build from scratch**, Upload CSV |
| exists | **Open in mapping tool** (primary), Import workbook, Replace CSV |

- Upload/Replace CSV stays as it is today, with structural validation (D9, FR6).
- Reviewer view: **View** opens the tool read-only (§5.7). When the current version has open issues,
  the row shows an issue-count badge (e.g. "4 issues · 3 explained").
- These actions appear only for submissions whose model is Assessments v5. Other models keep the
  plain Upload/Replace.

### 5.2 Import workbook

The workbook is read tab by tab:

| Workbook tab | Lands in |
|---|---|
| Product | Product & assessments → product name, namespace, description |
| Assessments | Product & assessments → one row per assessment (title, identifier, adaptive, category descriptor, family, max raw score) |
| EnumerationDefinitions | Descriptor bank → descriptor types |
| EnumerationItems | Descriptor bank → values (code value, short description, description) |
| ElementDefinitions | Element mappings → one row per element |
| How To | ignored |

Resolution rules:

- **Ed-Fi target.** Column G (Complete Name) is matched against the v5 model. A match fills the target.
  No match (old version paths, typos) leaves the element **Needs target** and keeps the original text
  next to it for reference.
- **Score row identity and datatype.** Column H (a JSON descriptor snippet, present in vendor workbooks but
  not in the template) is parsed for both `assessmentReportingMethodDescriptor` and
  `resultDatatypeTypeDescriptor`. Both are set on every score target of that row. A standard value is
  enabled. A vendor value (e.g. `uri://<vendor>/ResultDatatypeTypeDescriptor#Boolean`) is matched against
  the bank, where EnumerationItems' `resultDatatypeType` rows have added it. *(Revised 2026-11-16.)*
- **Data type.** This is normalized to the fixed type list. Every change is recorded as an import correction
  ("Interger → Integer"). Values that cannot be mapped become **Type unknown**.
- **Placeholders.** `CustomValue` rows are not added to the bank. Each one becomes an import note.
- **Standard descriptors referenced** by the workbook (e.g.
  `uri://ed-fi.org/AssessmentCategoryDescriptor#Diagnostic`) are enabled in the bank automatically.
- **Malformed workbook** (missing required tabs or headers): rejected outright, with nothing imported,
  mirroring the current malformed-CSV path.

After import, an **Import summary** shows: elements resolved / needing a target, types
corrected, descriptor values added, standard descriptors enabled, placeholders skipped. The vendor then lands in
the editor.

### 5.3 Build from scratch

This opens the same editor with Product & assessments empty, no elements, and the bank holding only
standard descriptors, all disabled.

### 5.4 Editor layout — four areas

1. **Product & assessments.** Product name, namespace (e.g. `uri://vendor-b.example.com/`), description, and
   the assessment rows.
2. **Descriptor bank** (§5.5).
3. **Element mappings** (§5.6).
4. **Checks panel.** Required-field coverage and type checks, live as the vendor edits (§5.8).

### 5.5 Descriptor bank

- The bank is organized by descriptor type (`AssessmentReportingMethodDescriptor`,
  `EventCircumstanceDescriptor`, `RetestIndicatorDescriptor`, `AssessmentPeriodDescriptor`, ...).
- **Vendor values** live under the product namespace. Fields: code value, short description,
  description. The vendor can add, edit and remove them.
- **Standard Ed-Fi values** (`uri://ed-fi.org/...`) are listed but **disabled by default**. The vendor
  enables the ones they use. They cannot be edited.
- **Only enabled or vendor-defined values are selectable in the mapping.** That is the "load" step.
- A value that no element uses is flagged **Unused**. Removing or disabling a value an element depends
  on is blocked, and the message lists the dependent elements.

### 5.6 Element mappings

Each row has the following fields:

- **Assessment** (from Product & assessments)
- **Vendor element**, **definition**
- **Data type**, from a fixed list: String, Integer, Decimal, Percent, Percentile, Boolean, Date, Range, Level,
  Enumeration
- **Ed-Fi targets**: one or more, chosen with a searchable picker over the v5 slice (Assessment,
  ObjectiveAssessment, StudentAssessment, StudentObjectiveAssessment and their collections). The picker
  shows the full path and the Ed-Fi definition. Example: *Scale Score* →
  `assessment.scores` and `studentAssessment.scoreResults`.
- **Row identity**: when a target is a keyed collection (scores, scoreResults, performanceLevels), the
  vendor picks the reporting-method descriptor value from the bank.
- **Result datatype** (revised 2026-11-16): every score target (`assessment.scores`,
  `studentAssessment.scoreResults` and the objective equivalents) carries **its own**
  `ResultDatatypeTypeDescriptor` value, picked on the target chip next to the reporting method. The vendor's
  data type and the Ed-Fi result datatype are different things: a String in the vendor's system ("Level 5")
  is reported to Ed-Fi as Level. The Collections view can set the datatype for every target of one entry at
  once. Vendors may add their own datatype values to the bank (e.g. Boolean). Standard values in use
  can't be switched off.
- **Enumeration source**: when the type is Enumeration, the vendor picks a descriptor type from the bank.
  That type must have at least one enabled or vendor value.
- **Notes**: free text, optional.

### 5.7 Generate artifact, issues and notes

- **Generate mapping CSV** is always available. A summary step lists all open issues before the vendor
  confirms.
- Confirming creates a new Vendor mapping CSV version. Earlier runs that pinned the prior version are
  marked stale (D14, FR11), exactly as Replace does today.
- **Issue types:** required field unmapped, element needs target, type mismatch, type unknown,
  enumeration with no values, unused descriptor value, import placeholder skipped, result datatype not
  chosen, datatypes disagree, vendor-defined datatype to verify.
- **Notes** can be attached to an element row or to an individual issue. An issue with a note is
  **Explained**; one without is **Unexplained**. Notes never clear an issue. The reviewer judges.
- The issue list and notes are stored with the artifact version and are visible in audit history.
- **Reviewer view:** the tool opens read-only, with an issues tab grouping issues by type and showing each vendor note
  inline.

### 5.8 Checks

- **Required-field coverage** comes from the v5 model, not the vendor. The prototype slice includes at least:
  `assessmentIdentifier`, `namespace`, `assessmentTitle`, `academicSubjects`, `assessedGradeLevels`
  (Assessment); `studentAssessmentIdentifier`, student reference, `administrationDate`
  (StudentAssessment); and on each score result `assessmentReportingMethodDescriptor`,
  `resultDatatypeTypeDescriptor`, `result`.
- The panel lists every required field as **Mapped** (with the element(s) that cover it) or **Unmapped**,
  per assessment and per reporting method (§8 Q2).
- **Type check** (revised 2026-11-16) works differently by target:
  - **Non-score targets:** the vendor type is compared with the target type (e.g. a Descriptor target needs Enumeration).
  - **Score targets:** the vendor type is compared with **that target's** result datatype, using this table:

    | Vendor type | Fits these Ed-Fi datatypes |
    |---|---|
    | String | Level |
    | Integer | Integer, Decimal |
    | Decimal | Decimal |
    | Percent | Percentage |
    | Percentile | Percentile |
    | Range | Range |
    | Level | Level |
    | Enumeration | Level |
    | Boolean, Date | none of the standard six |

  - **Vendor-defined datatypes:** the tool can't know what these mean. One counts as compatible only when its
    code matches the vendor type's name; otherwise it is flagged *to verify*, not as a mismatch.
  - **No datatype chosen:** a score target with no datatype is flagged *Result datatype not chosen*.
  - **Datatypes disagree:** when `scores` and `scoreResults` for the same assessment, objective and reporting
    method declare different datatypes, that is flagged but not blocked.
  - **Coverage:** `scoreResults.resultDatatypeType` counts as mapped once the `scoreResults` target has a datatype.

### 5.9 Prototype specifics

- **Simulated-outcome selector** on Import, labeled as prototype-only, with three choices: *Clean
  template workbook*, *Vendor B Diagnostic workbook as-is* (v6.2 paths, type typos, missing required fields,
  `CustomValue` placeholders), and *Malformed workbook*.
- **The reference vendor workbook is the seed data**, so the editor opens with realistic content: 2 assessments
  (ELA and Math Diagnostic), with the bank values from EnumerationItems. It is **anonymized** as "Vendor B Diagnostic"
  (`uri://vendor-b.example.com/`) because this repo is public. The structure and quirks are kept, but none of
  the vendor's identifiers or definition text. About 20–30 representative elements are used rather than all 75.
- The editor is a new route, `#/mapping/<submissionId>`, with a back link to the submission.
- New behaviour gets tests in `certification-prototype.test.mjs` (run by file; watch for `seed()`
  temporal-dead-zone ordering).

### 5.10 Working state (builder-check calls, marked as Claude's call)

- **Draft per submission.** Edits are kept in a working draft that persists between visits. Only
  **Generate** creates an artifact version. The editor header shows "Unsaved changes since v*n*" while
  the draft differs from the current version. *(Claude's call)*
- **Import with an existing draft or version** replaces the draft after a confirm. It does not merge.
  *(Claude's call)*
- **Open in mapping tool on an uploaded CSV.** The mapping CSV is the tool's own export format, so a
  conforming uploaded CSV is parsed back into the editor. Any column the tool doesn't know
  is listed as an import note. In the prototype, seeded submission `s2`'s uploaded v1 opens with the
  Vendor B Diagnostic seed. *(Claude's call)*
- **Notes when an issue clears.** A note on an issue that no longer applies is never dropped. It moves
  to the element's notes and is tagged "issue resolved". *(Claude's call)*
- **Reviewer-side seed.** Foreign submission `f2` (In Review) is reseeded with a tool-generated mapping
  version that has 4 issues, 3 of them explained. *(Claude's call)*
- **Run views.** The fixed in-scope resource and `ASSESSMENT_RESULTS` fixtures are left unchanged in this
  iteration. A new mapping version marks earlier runs stale but doesn't change their content.
  Driving run scope from the tool's mappings is a later step. *(Claude's call)*

## 6. Constraints

- Single-file HTML prototype, existing style and helper functions (`modal`, `esc`, `hist`,
  `currentVersion`), no new libraries.
- Assessments v5 only, and Assessments submissions only.
- Reviewers do not edit mappings on a vendor's behalf (§10.2, §5.5).

## 7. PRD impact

| PRD location | Change |
|---|---|
| §5.5 Artifact Ownership / §12 Artifact generation | Rewrite per §8 Q1 (vendor-authored, platform-assisted) |
| §7.4 FT4 | Add the mapping tool as an authoring path for the Certification Mapping artifact. Add import, the descriptor bank, checks, and issues-with-notes. |
| §7.6 FT6 | Reviewer read-only mapping view with an issue list and vendor notes |
| §7.9 FT9 | Audit entries: workbook imported, mapping generated (version, issue count) |
| New decision(s) | Proposed D27: issues flag but never block mapping generation. Proposed D28: the descriptor bank is the only source of selectable descriptor values. |

## 8. Resolved with the product owner (2026-11-16)

**Q1. Artifact ownership boundary.** This is resolved. A mapping is *vendor-authored in a platform editor*. The
platform may write out the artifact file because every mapping choice is the vendor's act. §5.5 and §12
are to be **rewritten** around this friendlier model, not just footnoted:

- §5.5: "Certification artifacts are vendor-owned and vendor-authored. Vendors may upload artifacts or
  author them with platform-provided tools, such as the Assessment mapping tool. The platform stores and
  presents artifacts, and may assist authoring with structure, pickers and checks, but never makes
  mapping choices on a vendor's behalf."
- §12 *Artifact generation*: narrowed to "The platform and reviewers do not author artifact content on a
  vendor's behalf (no auto-mapping, no reviewer edits)."

**Q2. Required-field coverage granularity.** This is resolved. Coverage is checked **per assessment** and **per
reporting method**:

- Each assessment row (e.g. ELA Diagnostic, Math Diagnostic) must cover every required Assessment and
  StudentAssessment field on its own.
- Each reporting method used by an assessment's `scores` / `scoreResults` must cover
  `assessmentReportingMethodDescriptor`, `resultDatatypeTypeDescriptor` and `result` on its own.
- *(Claude's call)* Objective-assessment fields count once an element targets an objective assessment
  (e.g. "Phonics Scale Score"). The same per-assessment and per-reporting-method rule then applies to that
  objective assessment.
- The checks panel groups coverage as: assessment → (objective assessment) → reporting method.

### 8.1 Multi-field and collection editing (from Q2)

The editor must make these shapes both readable and addable:

- **One vendor element → many Ed-Fi fields.** A mapping row shows all its targets as a list of chips.
  **+ Add target** appends another. Example: *Scale Score* → `assessment.scores` (definition) and
  `studentAssessment.scoreResults` (value).
- **Many entries in one collection.** For a given assessment, keyed collections (`scores`,
  `scoreResults`, `performanceLevels`, `periods`, `languages`) are shown as a **collection view**: one
  row per entry, keyed by its descriptor (e.g. Scale Score, Percentile, Lexile Measure, Diagnostic Gain),
  with the vendor element(s) feeding it and the entry's own required fields. **+ Add entry** creates a
  new keyed entry by picking a descriptor value from the bank. It is then linked to an existing or new vendor element.
- Both views edit the same underlying mappings. Element view is element-first, as in the workbook. Collection
  view is Ed-Fi-first, as the reviewer and the v5 model see it. The vendor can switch between them.

## 9. Left to the builder

- Visual layout of the four areas (tabs vs. stacked sections) within the existing prototype style.
- Exact v5 slice contents beyond the required list in §5.8.
- Picker search behaviour and the copy text for each issue.
- How much of the reference workbook's element list to hand-enter versus generate from the workbook rows.
