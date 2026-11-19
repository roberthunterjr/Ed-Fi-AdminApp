# Assessments Expected-Response Generator: Design

**Date:** 2026-11-19
**Branch:** `certification-mapping-v2`
**Builds on:** `2026-11-17-mapping-validation-report-design.md` (cited below as *MVR §n*). This design
moves that report's derivation out of the platform into an offline module, and changes who runs it and
what it produces.
**Prototype:** `docs/prototypes/certification-prototype.html`. **Fixtures:** Vendor B, C and D, built by
`docs/prototypes/tools/build-fixture.mjs`.

## 1. Intent

The run compares live Ed-Fi responses with **expected responses**. The expected responses are the thing to
get right: a wrong expected value fails a vendor who is correct, or passes one who isn't.

The MVR made the platform derive them from the vendor's workbook and samples. Working through Vendor D
showed that the files don't always state what's needed. Vendor D's objective code is buried in a sample
column header, and that header disagrees with the workbook about whether the code includes the `1A` prefix.
Its reporting method is declared but has no value.

This design:

- moves derivation into an **offline module** run by an **Ed-Fi representative**, outside the platform
- has the module produce a **Bruno collection** that is the source of truth for a run. The platform runs it
  exactly as uploaded.
- splits the module into a **resolver** and a **generator**. The resolver may use heuristics or an LLM to
  read whatever the vendor sent. The generator is deterministic.
- sets a rule for anything the files don't state outright: **keys need a person's confirmation; everything
  else may be inferred with a visible warning**

Why: an accurate expected response matters most for the next iteration of the tool. Handling it offline,
with a representative working alongside the vendor, gets there faster than making the platform's validator
handle every template dialect. The Data Mapping Template should still change to match (§12), but that's
not a blocker.

## 2. Goals, non-goals, anti-goals

**Goals**

- Derive correct expected responses for `assessments`, `objectiveAssessments`, `studentAssessments`, and
  every Ed-Fi standard and vendor descriptor those payloads use.
- Accept vendor files in more than one template shape: the extended dialect the MVR reads, and the
  published template's shape that Vendor D followed.
- Never let a key reach a collection without either being stated in the files or confirmed by a person.
- Produce a Bruno collection the platform can run with the Bruno CLI, unchanged.
- Make every output reproducible from saved inputs (§6.3).

**Non-goals**

- `assessmentItems` (deferred, §11).
- Editing, narrowing or excluding anything inside the platform.
- Vendors running the module themselves.
- Choosing an LLM provider or provisioning credentials for one. The resolver's interface allows an LLM, but
  this iteration ships heuristics (§5.4).

**Anti-goals** (failures even if it technically works)

- A key chosen by a model or heuristic with nobody confirming it.
- An inference with no visible evidence: the representative can't tell where a value came from.
- Two generations from the same approved inputs producing different collections.
- The platform's results disagreeing with the collection's own pass/fail.

## 3. Roles and flow

| Who | Does |
|---|---|
| **Vendor** | Produces the mapping workbook and per-assessment sample files from their platform. Loads the matching data into their Ed-Fi API. |
| **Ed-Fi representative** | Runs the module on the vendor's files. Reviews the resolved mapping, confirms proposed keys, accepts or rejects warnings. Iterates with the vendor until the readiness report is clean. Uploads the generated collection to the platform. |
| **Platform** | Stores the uploaded collection as a versioned artifact. Trusts it. Runs it with the Bruno CLI against the vendor's live endpoints and records results. |

```
vendor files ──► RESOLVE ──► resolved mapping ──► representative review ──► approved resolved mapping
                 (heuristic/LLM)  (draft, with provenance)  (confirm keys,             │
                                                             accept warnings)          ▼
                                            readiness report + Bruno collection ◄── GENERATE (deterministic)
                                                              │
                                                              ▼
                                              representative uploads to platform ──► run (Bruno CLI)
```

Only Ed-Fi staff can upload the collection. The platform doesn't re-check it: trust is established
by the representative's review outside the platform.

## 4. Outputs

One generation produces a folder:

| Output | Purpose |
|---|---|
| `resolved-mapping.json` | The canonical mapping (§5.1) with provenance on every value and the representative's confirmations. Saved and reused on regeneration. |
| `readiness-report.md` (and `.json`) | The MVR checklist: verdict, findings with fix locations (MVR §4.6), derived endpoints, inferred values with evidence. |
| `collection/` | The Bruno collection (§7). |
| `manifest.json` | Module version, a SHA-256 of each input file, a SHA-256 of the approved resolved mapping, and the generation time. |

A collection is produced only when the readiness report has no errors.

## 5. Resolve

### 5.1 The resolved mapping

The resolver reads the vendor's files and produces one canonical shape, whatever template dialect it came
from:

- **product:** namespace, product name, and a **descriptor namespace** for vendor descriptors. *Claude's
  call:* the descriptor namespace defaults to the product namespace with a trailing `/` added, so
  `uri://tea.texas.gov/assessment` gives `uri://tea.texas.gov/assessment/AssessmentReportingMethodDescriptor#22`.
  The default is `inferred`, so it needs confirming (§5.2).
- **assessments:** one per assessment: type (the sample slot name), `assessmentIdentifier`, title, category,
  adaptive, family, max raw score, performance levels
- **objectives:** one per objective: assessment, `identificationCode`, description, optional max raw score,
  optional parent objective code. This is the Objectives table (§5.3).
- **elements:** one per mapped field: assessment, name, Ed-Fi target path, data type, sample column,
  reporting method and result datatype for scores, objective code for objective scores, enumeration name
  for descriptors
- **enumerations:** code values per vendor enumeration (MVR §4.3a)
- **samples:** per assessment, the file, its column headers, and the pre-arranged columns (MVR §3.3)

Every leaf value carries **provenance**:

| Provenance | Meaning | Shown as |
|---|---|---|
| `stated` | Read literally from a cell. Records file, tab or column, and row. | Normal value |
| `inferred` | Proposed by the resolver. Records the evidence (cells it read) and a one-line reason. | Warning in the report |
| `confirmed` | An inferred value the representative accepted. Records who and when. | Normal value, with a "confirmed" note |
| `overridden` | A value the representative typed in place of an inferred one. Records who, when and why. | Normal value, with an "overridden" note |

### 5.2 Keys and everything else

**Keys** are the values a run looks records up by. A wrong key fails every record that uses it.

- `product.namespace` and the descriptor namespace
- `assessment.assessmentIdentifier`
- `objective.identificationCode`
- each assessment's `Student ID` and `Activity Id` columns (pre-arranged, MVR §3.3)
- **descriptors that identify entries inside a record** (decided 2026-11-19): each score element's
  reporting method (it keys `scores` and `scoreResults`), and each performance level's reporting method and
  level code (they key `performanceLevels`). A wrong one fails every entry it keys. When the workbook
  declares a vendor code (Vendor D's `AssessmentReportingMethod` `22`), the vendor URI is what's proposed,
  not the Ed-Fi standard value it describes.

**Rule:** a key must be `stated`, `confirmed` or `overridden`. An `inferred` key is an **error** in the
readiness report ("proposed key awaiting confirmation") and blocks generation.

**Everything else** may stay `inferred`. Each inferred non-key value is a **warning** that shows its
evidence and reason. The representative may confirm it, override it, or leave it as a warning. Generation
proceeds with warnings.

The MVR's anti-goal "never silently fix vendor data" still holds. An inference is never silent: it's a
warning with evidence, or a key that can't proceed until someone confirms it.

### 5.3 Objectives table

An objective's `identificationCode` is declared once, in the Objectives table, the same way assessments
are. Elements point to an objective by code.

| Column | Required | Notes |
|---|---|---|
| Assessment Type | yes | Matches the Assessments table |
| identificationCode | yes | Key |
| Description | no | `objectiveAssessment.description` |
| maxRawScore | no | |
| Parent identificationCode | no | Must exist in the same assessment |

**Where the table comes from:**

1. **The vendor's workbook has an Objectives tab** (the revised template, §12). Values are `stated`.
2. **It doesn't.** The resolver proposes the table, with each code `inferred`:
   - From element names, using the MVR §4.5 rule ("Phonics Scale Score" less "Scale Score" gives `Phonics`).
     This covers Vendor B.
   - From sample column headers that carry a code. Vendor D's
     `Dibels 8 - Composite Score - 1ABOYKGVendorDTXAssessmentCMP` gives a candidate code.
   - When sources disagree (Vendor D's header has `1A…`, the workbook's example omits it), the resolver
     proposes the candidate it ranks higher and lists the others in the evidence.

**Checks on the table:**

- every element whose target is `objectiveAssessment.*` or `studentObjectiveAssessment.*` names an objective
  that exists (error)
- every objective has at least one score element with a sample column (error: an objective with no scores
  can't be checked)
- codes in one assessment are unique on the normalized key (MVR §4.5) (error)
- a parent code exists and there are no cycles (error)

**Codes that encode grade or period** (Vendor D's `BOY` + `KG`): each combination is its own row. Only
combinations the sample actually exercises produce expected records. A declared objective with no sample
rows is a **warning** ("declared, not exercised by the sample"), not an error.

**Codes are fixed per column** (decided 2026-11-19). An element, and so a sample column, belongs to exactly
one objective. A vendor who uses one column for every grade and period, with the code depending on the
row, isn't supported in this iteration (§11).

### 5.4 Resolver implementation in this iteration

*Claude's call.* The resolver is a pluggable interface: `resolve(files, previous?) → resolvedMapping`. This
iteration ships a **heuristic resolver** that:

- reads the extended dialect (the MVR's contract) and marks what it reads `stated`
- reads the published template's shape (Vendor D: Ed-Fi-label element names, full API paths, separate rows
  for reporting method and datatype, no column H) and maps it to the canonical shape, marking anything it
  had to interpret as `inferred`
- proposes objective codes as in §5.3

**What the resolver may and may not touch** (*Claude's call*):

- It resolves the **mapping only**. It may infer which sample column an element uses and which enumeration
  an element means (the MVR's "Did you mean" suggestions become `inferred` values). Those are warnings
  unless the value is a key.
- It **never changes sample values**. The sample holds what the vendor actually posts (MVR §3.2), so a
  value in the wrong format (`09/15/2025`) or not in the enumeration (`well below benchmark`) stays an
  error, as in the MVR. Translating it would make the expected response describe our guess, not their data.
- **One file for several assessments** (Vendor D sends one spreadsheet in both slots): the resolver splits
  it into one sample per assessment. Each assessment's `Student ID` and `Activity Id` columns are keys, so a
  shared or guessed column needs confirming.

An LLM resolver can be added later behind the same interface. It must output the same provenance. The
§5.2 key rule doesn't change.

### 5.5 Representative review

*Claude's call on the medium.* The review happens by editing `resolved-mapping.json`: changing a value's
provenance from `inferred` to `confirmed`, or replacing it and marking it `overridden` with a reason. The
module's `review` command lists what's awaiting confirmation. A review UI is out of scope for this
iteration.

### 5.6 Regeneration

When the vendor sends new files, the module re-resolves **only what changed**:

- a value whose evidence cells didn't change keeps its previous resolution, including confirmations
- a value whose evidence changed goes back to `inferred` and needs review again
- the report shows a **diff** against the previous approved resolved mapping

So the resolver being non-deterministic can't cause drift between runs on unchanged files.

## 6. Generate

### 6.1 What it derives

The generator takes the approved resolved mapping and the samples. It applies MVR §4 checks (values,
links, targets, pre-arranged columns) and the §5.3 table checks, and produces:

- **Endpoints**, in fixed order: `assessments`, `objectiveAssessments` (if any objective is exercised),
  `studentAssessments`, then one per descriptor type used.
- **Expected payloads** as MVR §5, with these changes:
  - `objectiveAssessments` come from the Objectives table, not from element names.
  - **`performanceLevels` are included** on `assessments`, `objectiveAssessments` and in student results.
    The MVR validated these targets but dropped them from payloads. That's a known gap, and fixing it is
    in scope because the expected response must be complete. *Claude's calls:*
    - Assessment and objective level: one entry per code in the element's performance-level enumeration,
      each with its reporting method (a key, §5.2).
    - Student level: one entry for the value in the sample row, with the same reporting method.
    - `minimumScore`, `maximumScore` and a performance level's result datatype aren't in the files. They're
      left out of the expected payload, and so not checked.
  - `objectiveAssessment.description`, `maxRawScore` and `parentObjectiveAssessmentReference` are included
    when stated or accepted.
- **Rows**: the MVR §5 coverage-based subset.
- **Descriptors**: every standard (`uri://ed-fi.org/…`) and vendor descriptor value that appears in an
  expected payload, one record per value.

### 6.2 What's no longer in the generator

- The MVR §4.5 name-derived objective code. It moves to the resolver as a proposal.
- Reviewer narrowing (MVR §7). Scope is whatever the approved resolved mapping and samples produce.

### 6.3 Determinism

Same approved resolved mapping + same samples + same module version → **byte-identical** collection and
report. That means stable ordering everywhere (endpoints, records, keys within payloads, files in the
collection) and no timestamps inside the collection except in `manifest.json`.

## 7. Bruno collection

### 7.1 Shape

*Claude's call on layout:*

```
collection/
  bruno.json
  environments/certification.bru     # baseUrl, accessToken: filled by the platform at run time
  01 assessments/
  02 objectiveAssessments/
  03 studentAssessments/
  04 descriptors/
```

- **assessments, objectiveAssessments:** one request per expected record, a GET filtered by its key.
- **studentAssessments:** one request per selected row,
  `GET studentAssessments?studentUniqueId=…`, matched on `studentAssessmentIdentifier` (MVR §7).
- **descriptors:** one request per descriptor value, filtered by namespace and code value.
- Each request's `tests` block carries its expected JSON and the matching code **inline**. *Claude's
  call:* no `require` and no file reads, so the collection runs in Bruno's default safe mode. The generator
  writes the same helper into every request; that duplication is cheap because nobody edits the output.

**Runtime contract with the platform** (*Claude's calls*, fixed now so the two sides can't guess
differently):

- Environment variables: `baseUrl` (up to and including the data path, for example
  `https://host/data/v3`) and `accessToken`. The platform fills both. The collection never contains
  credentials.
- Request paths: `{{baseUrl}}/ed-fi/<resource>`. The data standard version isn't in the collection. It's a
  run setting the platform resolves into `baseUrl`.
- The Bruno CLI version is pinned in `manifest.json`, and the platform runs that version.
- The platform reads the CLI's JSON reporter output and sorts results by the assertion-name prefixes in
  §7.3.

### 7.2 Matching rules travel with the collection

The inline helper holds MVR §7's comparison rules, so the collection is self-contained:

- trimmed strings, parsed numbers, dates compared as instants
- descriptor URIs: namespace exact, code ignoring case
- keyed collections matched by key, ignoring order (`scoreResults` by reporting method,
  `studentObjectiveAssessments` by objective, `performanceLevels` by reporting method plus level,
  `accommodations` by descriptor)
- objective codes matched on the normalized key (MVR §4.5)
- extra fields on the live record are ignored; missing expected fields fail

### 7.3 Result kinds

Each assertion is named with its kind, so the platform can sort the Bruno CLI's JSON report without
re-implementing anything:

| Kind | When |
|---|---|
| `pass` | Every expected field matched |
| `fail:value` | A field differs (assertion names the path, expected and actual) |
| `fail:descriptor-not-loaded` | A descriptor value the payload uses isn't returned by its descriptor endpoint |
| `fail:record-not-found` | No live record has the key |
| `fail:objective-not-found` | No live objective matches on the normalized key; the assertion lists the live codes |

*Excluded by reviewer* (MVR §7) is dropped: nothing is excluded in the platform.

## 8. Platform changes (separate step)

These follow from the design but are a separate piece of work, along with the prototype changes:

- New artifact type on Assessments submissions: **generated collection** (a zip of §4's folder), versioned.
  Only Ed-Fi staff can upload it.
- The platform reads `manifest.json` to show the module version and input fingerprints, and shows
  `readiness-report.md` alongside the collection.
- **Run gate:** an Assessments run can start once a collection is uploaded. A run pins the collection
  version. Uploading a new version makes earlier runs stale.
- **Run:** `bru run` with the platform's environment, JSON reporter. Results are grouped by endpoint and
  record using §7.3 kinds.
- **Removed:** the in-platform validation report as a gate, reviewer narrowing, and per-slot sample uploads
  as run inputs. Whether vendors still upload the workbook and samples to the platform, for the record, is
  left open (§13).

## 9. Worked examples

**Vendor B** (extended dialect, no Objectives tab)
- Resolver proposes 7 objective codes from element names (`Phonics`, `Vocabulary`, …), each `inferred`.
- Report: 7 errors, "proposed key awaiting confirmation". Representative confirms all 7.
- Generator: `objectiveAssessments` with 7 records, as the prototype produces today, plus performance
  levels.

**Vendor C** (small, no objectives)
- No objective elements, so no Objectives table and no `objectiveAssessments` endpoint.
- Its `Performance Level` element now appears in expected payloads (it's silently dropped today).

**Vendor D** (published template shape)
- Resolver maps the published shape: the Assessments tab's `1A` and `2A` become `assessmentIdentifier`s
  (`stated`), and titles come from Description (`inferred`, a warning).
- Namespace: `uri://tea.texas.gov/assessment`, `stated` on the Product tab. The descriptor namespace
  defaults to it with a `/` added, `inferred`, so it's a key error until confirmed.
- One spreadsheet covers both assessments. The resolver splits it per assessment. `Student ID (State ID)` is
  proposed as each assessment's `Student ID` (a key, needs confirming). There's no `Activity Id` column for
  either assessment, which is an error the vendor must fix (MVR §3.3).
- Objectives: three sources give candidate codes.
  - The sample header: `1ABOYKGVendorDTXAssessmentCMP`.
  - The element definition's example: `BOYKGVendorDTXAssessmentCMP`.
  - The Product tab's "Vendor Product" column: `BOYKGVendorDTXAssessmentCMP`.
  The resolver proposes the code without `1A` (two of three agree) and lists all three as evidence. It's a
  key error until the representative confirms what the vendor actually posts.
- Reporting method and result datatype: the element rows are blank, but EnumerationItems declares vendor
  codes `AssessmentReportingMethod` `22` and `ResultDatatypeType` `02`. The resolver proposes the vendor URIs
  (`…/AssessmentReportingMethodDescriptor#22`). The reporting method is a key, so it needs confirming. The
  result datatype isn't, so it's a warning.
- Performance levels: mapped, with one vendor code (`01`), but no sample column. Assessment level expects
  the one declared level. Student level gets a warning: "mapped, no values in the sample, not checked".
- `administrationDate`: no sample column. It's a warning; the field isn't expected.
- Only K/BOY is exercised, so one objective per assessment is expected.

## 10. Testing

- **Generator:** unit tests in `node:test`, as the prototype and converter use today. Every MVR rule
  carries over. Add tests for the Objectives table checks, performance levels, determinism (generate
  twice, compare bytes) and the Bruno file layout.
- **Resolver:** an evaluation set. Vendors B, C and D, each with a hand-checked expected resolved mapping.
  The heuristic resolver must reproduce it exactly. A future LLM resolver is measured against the same set.
- **Collection:** run the generated Vendor B collection with the Bruno CLI against a stub server that
  returns the expected payloads (all pass), then the prototype's simulated failures (one of each §7.3
  kind).

## 11. Deferred

**`assessmentItems`** is left out until there's a streamlined approach. What's known:

- Vendors would supply **item definitions in the workbook** and **per-student item responses** in samples.
- The item `identificationCode` is a key, so §5.2 applies.
- Open: the shape of the per-student responses. The candidates are columns in the existing sample, or a
  second long-format file per assessment with one row per student × item.

**Also deferred: objective codes that vary by row** (decided 2026-11-19). Some vendors may use one score
column for every grade and period, with the code depending on each row's values. Supporting that needs
code templates built from row values. None of the current vendors need it.

## 12. Template revision (not a blocker)

The resolved mapping should eventually be reflected in the Data Mapping Template so vendors state keys
themselves:

- an **Objectives** tab (§5.3)
- explicit reporting method and result datatype columns, in place of column H's JSON fragment
- a version bump from the template's current "v2.5"

Until then, the resolver bridges the gap and the representative confirms keys.

## 13. Approaches considered

**Where an objective code is stated**
- A. A field in each element's column H JSON. Repeats the code on every element (Vendor B has 4 per
  objective), so typos create phantom objectives, and there's no place for objective-level fields.
- **B. An Objectives table. Chosen.** Each key is declared once, it handles lone and parent objectives, and
  it can be checked.
- C. An objective-code column in a long-format sample. Reshapes every sample and still has no place for
  objective-level fields.

**Who generates and uploads the collection**
- **Ed-Fi staff. Chosen.** The representative works with the vendor outside the platform, so the platform
  can trust what's uploaded.
- Vendors generate, and the platform checks a manifest against uploaded inputs.
- Vendors generate, and the platform trusts it.

**What the module outputs**
- A neutral expectations file with Bruno as one rendering of it. Rejected: the collection is the source of
  truth, so the matching rules ship inside it.
- **Bruno as the primary output, with a shared helper. Chosen.**

**How values are derived**
- Deterministic rules only (the MVR). Every template dialect has to be coded in, and Vendor D is rejected.
- **Resolver (heuristic now, LLM-capable) plus deterministic generator, with person-confirmed keys.
  Chosen.**

## 14. Left to the builder

- Where the module lives and how it's invoked (*Claude's call:* a no-dependency Node CLI next to
  `build-fixture.mjs`, with `resolve`, `review` and `generate` commands)
- The exact JSON schema of `resolved-mapping.json` and of the report
- Bruno request file details, within §7.1's inline, safe-mode constraint, and the exact Bruno CLI version
  to pin
- Ranking rules for competing objective-code candidates
- How the stub server for collection tests is built
