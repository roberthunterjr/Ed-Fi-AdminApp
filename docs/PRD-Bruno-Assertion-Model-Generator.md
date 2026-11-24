# Bruno Assertion Model Generator PRD

**Status:** Draft for review \
**Owner:** _TBD_ \
**Primary audience:** The team building the generator, and the Admin App team
that consumes its output. \
**Companion PRDs:** [Admin App 4.2](./PRD-AdminApp-v4.2.md),
[Automation Platform](./PRD-Automation-Platform.md) \
**Design:**
[`docs/design/2026-11-19-expected-response-generator-design.md`](./design/2026-11-19-expected-response-generator-design.md)
(cited as *Design §n*). This PRD sets the product requirements; the design holds
the detail and worked examples (Vendors B, C and D). \
**Supersedes:** In-platform Assessments validation (MVP PRD FR9, §9.1) and the
mapping validation report as a run gate (Certification PRD Revision 5, D32–D36).

> Drafted with AI assistance. Review before relying on it, and disclose AI use
> when sharing it.

---

# 1. Overview

Assessments certification compares a vendor's live Ed-Fi API responses with
**expected responses**. Getting those right is the whole game: a wrong expected
value fails a correct vendor or passes a wrong one.

Expected responses come from the vendor's mapping workbook and sample data. The
files vary: different template versions, keys buried in column headers, values
declared in one place and contradicted in another. Building every variation into
the certification platform would couple the platform to vendor-by-vendor logic.

The **Bruno Assertion Model Generator** moves that logic into a separate tool.
An **Ed-Fi representative** uses it during a **pre-certification conversation**
with the vendor. The representative reconciles the mapping, confirms the keys
and parameters, and generates a **Bruno collection**. That collection is the
contract between the two systems: Admin App runs it unchanged.

```
vendor files ──► generator (representative + vendor, live or offline)
                      │  resolve → review → generate
                      ▼
         Bruno collection + readiness report + manifest
                      │  representative uploads
                      ▼
          Admin App runs it against the vendor's environment
```

---

# 2. Purpose

- **Accurate expected responses.** Every key is confirmed by a person, and every
  value records where it came from.
- **Keep business logic out of the platform.** Admin App runs a collection; it
  doesn't interpret workbooks.
- **Readiness before certification.** Mapping problems are found and fixed with
  the vendor before they use a run.
- **Domain runs tailored to the vendor.** The endpoints, parameters and
  assertions come from what the vendor actually uses, through the contract.

---

# 3. Scope

**In scope:**
- Assessments only: `assessments`, `objectiveAssessments`, `studentAssessments`
  and the descriptors they use.
- Ed-org and student handling (§6.4).

**Deferred:**
- `assessmentItems`. It must be addable by extending the tool, not reworking it
  (NFR-G-4).
- Objective codes that vary by row (Design §11).

**Out of scope:**
- Other domains. The architecture must allow them (NFR-G-4), but none is
  committed.
- Vendors running the tool.
- Editing anything inside Admin App.
- Choosing or provisioning an AI provider. That goes through Ed-Fi's standard
  technology approval process.

---

# 4. Personas

- **Ed-Fi Representative (primary user).** Runs the tool, holds the
  pre-certification conversation with the vendor, confirms keys, and uploads
  the collection to Admin App.
- **Vendor Certification Administrator / Integration Engineer.** Provides the
  workbook and samples, takes part in the conversation, and fixes their files.
  Never runs the tool.
- **Certification Reviewer.** Reads the readiness report and the provenance of
  each value when judging a run.

---

# 5. Decisions

| # | Decision |
| --- | --- |
| G1 | **Only Ed-Fi representatives run the generator and upload its output.** Admin App enforces this with a collection-upload privilege on an Ed-Fi Representative role (4.2 FR-CERT-ART-5). Admin App trusts the uploaded collection; trust comes from the representative's review. |
| G2 | **The collection is the source of truth for an Assessments run.** Admin App runs it unchanged. This PRD owns the contract (§7). |
| G3 | **Resolver + generator.** The resolver reads whatever the vendor sent, using rules and optionally AI, and may be non-deterministic. The generator turns an approved mapping into output and is deterministic. |
| G4 | **Keys must be stated or confirmed by a person.** Everything else may be inferred, with a visible warning. An inferred key blocks generation. |
| G5 | **AI is optional and only ever suggests.** The tool works fully without it. AI suggestions are marked as such and never count as confirmation. |
| G6 | **One tool, live or offline.** The representative can work through the mapping with the vendor on a call, or alone afterwards. A session can be saved and resumed. |
| G7 | **It is a separate product:** its own repository, a CLI with an interactive review, run on the representative's machine. *Claude's call.* |
| G8 | **Objective codes are declared once, in an Objectives table** (Design §5.3). |
| G9 | **Ed-org scope is a key.** The representative confirms the ed-orgs the vendor certifies under. |
| G10 | **The tool never changes sample values.** A wrongly formatted value is an error for the vendor to fix, not something to translate. |

---

# 6. Requirements

## 6.1 Reading the Vendor's Files

- **FR-G-1:** The tool SHALL read the vendor's Data Mapping Template workbook
  and one or more sample files (CSV or XLSX).
- **FR-G-2:** It SHALL accept at least two template layouts: the extended
  layout and the published template's layout (Design §5.4). Anything it had to
  interpret SHALL be marked `inferred`.
- **FR-G-3:** It SHALL split one sample file that covers several assessments
  into one sample per assessment.
- **FR-G-4:** It SHALL produce one **resolved mapping** in a single canonical
  shape: product and namespaces, assessments, objectives, elements, enumerations,
  samples and ed-org scope (Design §5.1).

## 6.2 Provenance and Keys

- **FR-G-5:** Every value in the resolved mapping SHALL record its provenance:
  - `stated`, with the file, tab or column, and row
  - `inferred`, with the evidence and a reason
  - `suggested-by-ai`, with the evidence and a reason
  - `confirmed`, with who and when
  - `overridden`, with who, when and why
- **FR-G-6:** These are keys:
  - namespaces
  - `assessmentIdentifier`
  - objective `identificationCode`
  - each sample's Student ID and Activity Id columns
  - descriptors that key entries in a record (reporting method, performance
    level)
  - the ed-org scope

  A key SHALL be `stated`, `confirmed` or `overridden` before generation.
- **FR-G-7:** A non-key `inferred` or `suggested-by-ai` value SHALL appear in the
  readiness report as a warning showing its evidence. Generation proceeds.

## 6.3 The Mapping Conversation

- **FR-G-8:** The tool SHALL provide an **interactive review**. It walks the
  representative through every key awaiting confirmation, then every warning,
  one at a time, showing the evidence. The representative can confirm, override
  with a reason, or skip (non-keys only).
- **FR-G-9:** The review SHALL work **live** (the representative shares a
  screen with the vendor) and **offline**. Progress SHALL be saved after every
  answer, and a session SHALL be resumable.
- **FR-G-10:** The tool SHALL produce a **question list** for the vendor: the
  open keys and warnings written in plain language, with file and cell
  locations. It can be sent ahead of the call or after it.
- **FR-G-11:** With **AI assistance** turned on, the tool MAY:
  - suggest values, marked `suggested-by-ai`, with a reason
  - explain a finding
  - answer the representative's questions about the vendor's files

  It SHALL NOT confirm a key or change provenance to `confirmed`.
- **FR-G-12:** When the vendor sends revised files, the tool SHALL re-resolve
  only what changed. Values whose evidence didn't change keep their resolution,
  including confirmations. Values whose evidence changed go back to needing
  review. The tool SHALL show a diff against the previous approved mapping.

## 6.4 Ed-Orgs and Students

- **FR-G-13:** The representative SHALL confirm the **ed-org scope**: the
  education organization IDs the vendor certifies under. Every query in the
  collection SHALL be limited to that scope.
- **FR-G-14:** Where the mapping maps ed-org fields on `studentAssessments` (for
  example `reportedSchoolReference`, `schoolYear`) to sample columns, those
  values SHALL be in the expected responses.
- **FR-G-15:** The collection SHALL begin with a **prerequisites** folder. It
  checks that each ed-org in scope, and each student in the selected sample
  rows, exists in the environment. A missing one is reported as
  `fail:prerequisite-missing`, not as a run of record-not-found failures.

## 6.5 What It Derives

- **FR-G-16:** For the approved mapping and samples, the generator SHALL derive:
  - the **endpoints** that are enabled, in fixed order
  - the **parameters** for each request
  - the **expected response** for each record
  - the **fields asserted** on each response

  The derivation follows Design §6.1. This includes `performanceLevels` and
  objectives from the Objectives table.
- **FR-G-17:** It SHALL select sample rows by coverage, so every mapped column
  and value is exercised without asserting every row (Design §6.1).
- **FR-G-18:** It SHALL apply the table checks (Design §5.3) and value checks,
  and SHALL list every error with where to fix it.

## 6.6 Output

- **FR-G-19:** One generation SHALL produce every file in contract term C1:
  - the `resolved-mapping.json`
  - a **readiness report** (Markdown and JSON)
  - `expected-values.json`
  - the **Bruno collection**
  - a `manifest.json` (C2)
- **FR-G-20:** A collection SHALL be produced only when the readiness report has
  no errors.
- **FR-G-21:** The tool SHALL package the C1 files as one zip for upload to
  Admin App.

---

# 7. The Contract with Admin App

Admin App and the generator agree on this, and only this. A change to it is a
versioned change to both (C2). Admin App 4.2 FR-CERT-ART-4, FR-CERT-ART-8 and
FR-CERT-ASM-2 to FR-CERT-ASM-4 depend on it.

| # | Contract term |
| --- | --- |
| C1 | **Package:** a zip with these files:<br>• `manifest.json`<br>• `readiness-report.md`<br>• `readiness-report.json`<br>• `expected-values.json`<br>• `resolved-mapping.json`, so reviewers can see where each value came from<br>• `collection/` |
| C2 | **Manifest schema:**<br>• `contractVersion`. Admin App rejects versions it doesn't support.<br>• `toolVersion`<br>• `generatedAt`<br>• `bruCliVersion`<br>• `inputs`: one entry per input file, with `role` (`workbook` or `sample`), `fileName` and `sha256`. Admin App compares these against uploaded artifacts.<br>• `resolvedMappingSha256` |
| C3 | **Readiness report JSON:**<br>• `errors[]` and `warnings[]`, each with `code`, `message` and `location`<br>• `endpoints[]`<br><br>Admin App rejects a package with any error. |
| C4 | **Expected values:** `expected-values.json` lists, per endpoint and per record:<br>• the record key<br>• the request<br>• the expected fields<br>• the request file's path in the collection<br><br>Admin App reads it for the preview and for grouping results. It is generated from the same model as the collection, so the two always agree. |
| C5 | **Environment:** Admin App supplies the environment file at run time. The collection SHALL NOT include one or depend on one of its own. It uses only two variables:<br>• `baseUrl`, up to and including the data path, for example `https://host/data/v3`<br>• `accessToken`, which Admin App maps from a process environment variable so it never lands in a file or on a command line<br><br>The collection contains no credentials or hostnames. |
| C6 | **Safe mode:** no `require` and no file reads. Matching rules, including type-aware comparison, are inline in each request's tests (Design §7.1, §7.2). |
| C7 | **Bruno CLI version:** pinned in the manifest. Admin App runs that version. |
| C8 | **Request paths:** `{{baseUrl}}/ed-fi/<resource>`. The data standard version is not in the collection. |
| C9 | **Folder order:** `00 prerequisites`, `01 assessments`, `02 objectiveAssessments` (if any), `03 studentAssessments`, `04 descriptors`. |
| C10 | **Result kinds and assertion names.** Each assertion is named `<kind> <endpoint> <recordKey>[ <fieldPath>]`, read from the CLI's JSON reporter. The kinds are:<br>• `pass`<br>• `fail:value`<br>• `fail:descriptor-not-loaded`<br>• `fail:record-not-found`<br>• `fail:objective-not-found`<br>• `fail:prerequisite-missing`<br><br>The `recordKey` matches C4. |
| C11 | **Read-only:** the collection issues GET requests only. |

**Where this PRD and the design differ, this PRD governs:** the prerequisites
folder, `fail:prerequisite-missing`, `contractVersion`, the CLI version in the
manifest, the expected-values and resolved-mapping files in the package, and a
separate repository (the design put the tool next to `build-fixture.mjs`). The
design doc should be updated to match.

---

# 8. Non-Functional Requirements

- **NFR-G-1 Determinism:** The same approved mapping, samples and tool version
  SHALL produce a byte-identical collection and report.
- **NFR-G-2 No drift:** Re-resolving unchanged files SHALL NOT change confirmed
  values, even if the resolver itself is non-deterministic.
- **NFR-G-3 Data handling:** Vendor files stay on the representative's machine
  or approved Ed-Fi storage. With AI turned on, vendor files are sent only to
  the approved provider. The tool SHALL make it obvious when AI is on.
- **NFR-G-4 Extensibility:** Resource-specific rules (which keys a resource has,
  how its payload is built, its checks) SHALL sit behind an interface. Adding
  `assessmentItems`, or a later domain, SHALL mean adding a module, not changing
  the resolver core, the generator core or the contract. Any change to the
  contract follows C2.
- **NFR-G-5 Offline-capable:** Everything except AI assistance SHALL work
  without network access.

---

# 9. Template Revision (Recommended, Not a Blocker)

The Data Mapping Template should eventually state keys directly, so less needs
inferring:
- an Objectives tab
- explicit reporting method and result datatype columns
- an ed-org scope field
- a version bump from v2.5

Until then, the resolver and the representative bridge the gap (Design §12).

---

# 10. Success Metrics

| # | Metric |
| --- | --- |
| GM-1 | The tool reproduces the hand-checked resolved mapping for Vendors B, C and D exactly, with rules only (Design §10). |
| GM-2 | A generated Vendor B collection run against a stub server gives all passes, and one failure of each result kind when faults are injected. |
| GM-3 | Two generations from the same approved inputs are byte-identical. |
| GM-4 | First real Assessments vendor: every run failure traces to a vendor data or load issue, not a wrong expected value. |

---

# 11. Open Questions

| # | Question |
| --- | --- |
| OQ-G1 | Which AI provider, if any, is approved for vendor files? (Ed-Fi approval process.) |
| OQ-G2 | Where do representatives keep sessions and vendor files between calls: the representative's machine, or shared Ed-Fi storage? |
| OQ-G3 | Must the ed-org scope be stated by the vendor (in the template), or may the representative enter it from the conversation? |
| OQ-G4 | `assessmentItems`: per-student responses as extra sample columns, or a second long-format file (Design §11)? |
| OQ-G5 | Who maintains the tool and cuts its releases, and does a tool release need the same Product Owner promotion as a certification-testing tag? |

---

# 12. Glossary

| Term | Definition |
| --- | --- |
| **Resolved mapping** | The vendor's mapping in one canonical shape, with provenance on every value. |
| **Key** | A value that records are looked up by. A wrong key fails every record using it, so a person must confirm it. |
| **Provenance** | Where a value came from: stated, inferred, suggested by AI, confirmed or overridden. |
| **Readiness report** | The tool's checklist: errors with fix locations, warnings with evidence, and the derived endpoints. |
| **Pre-certification conversation** | The representative and vendor reconciling the mapping, live or offline, before a collection is generated. |
| **Contract** | The terms in §7 that Admin App and the generator both follow. |
