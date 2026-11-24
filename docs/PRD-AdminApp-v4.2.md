# Admin App Product Requirements Document for Version 4.2

> **Status:** draft \
> **Owner:** _TBD_ \
> **Jira Project:** AC \
> **Repository:** `Ed-Fi-Alliance-OSS/Ed-Fi-AdminApp` \
> **Baseline PRDs:** [v4.0](./PRD-AdminApp-v4.0.md), [v4.1](./PRD-AdminApp-v4.1.md),
> [Certification Automation Platform MVP](./PRD-Platform-Automation-MVP.md) \
> **Companion PRDs:** [Automation Platform](./PRD-Automation-Platform.md),
> [Bruno Assertion Model Generator](./PRD-Bruno-Assertion-Model-Generator.md)
>
> Drafted with AI assistance. Review before relying on it, and disclose AI use
> when sharing it.

## 1. Product Overview

Admin App v4.2 continues the certification module that shipped as the MVP. It
adds the MTSS / Interventions certification model, run history and run
traceability. A fast follow adds Assessments certification.

The MVP PRD covered three different concerns in one document: product features,
hosting and infrastructure, and the business logic that turns a vendor's
Assessments mapping into expected API responses. From this release they are
split into three PRDs:

| PRD | Concern |
| --- | --- |
| **Admin App 4.2** (this document) | What vendors, reviewers and Ed-Fi staff do in Admin App. |
| [Automation Platform](./PRD-Automation-Platform.md) | Hosting, deployment, identity, vendor environments, run execution infrastructure, artifact storage. |
| [Bruno Assertion Model Generator](./PRD-Bruno-Assertion-Model-Generator.md) | The offline tool an Ed-Fi representative uses to turn a vendor's Assessments mapping and sample data into a Bruno collection. **Owns the collection contract** that Admin App runs. |

Like v4.1, this is a release delta. It does not restate the v4.0 product
overview, personas or enterprise architecture.

### 1.1 Release Objectives

**Release gate.** v4.2 ships when MTSS certification works end to end.
Assessments certification is a parallel effort released as a fast follow; it
does not hold the release. v4.2 ships on today's hosting and identity setup. The
Automation Platform work proceeds in parallel and does not block it.

#### Must Have (ships in 4.2)

1. **MTSS / Interventions certification runs**, working the same way as SIS v5.
2. **Run history** for each product.
3. **Run activity timeline and raw step output.** The timeline may slip to the
   fast follow if time is short (§5.3). Raw step output does not slip.

#### Fast Follow (Assessments)

1. Reworked **Request Certification** dialog with a guided Assessments
   walkthrough.
2. **Product artifacts** for Assessments: vendor-uploaded mapping workbook,
   sample data and score report, plus a staff-uploaded generated collection.
3. **Assessments runs** that execute the generated collection.
4. An Ed-Fi staff dashboard section for Assessments products waiting on a
   representative.
5. The activity timeline, if it slipped.

#### Nice to Have

1. A guided walkthrough for first-time vendors (data store, credentials, first
   run), for every model.
2. A reviewer option to skip or ignore an individual failed result.

### 1.2 Carried-Forward Product Context

Personas from the MVP PRD remain valid: Vendor Certification Administrator,
Vendor Integration Engineer, Certification Reviewer and Ed-Fi Platform
Administrator. This release adds one role in practice:

- **Ed-Fi Representative.** An Ed-Fi staff member who works with an Assessments
  vendor before certification. They review the vendor's mapping and sample data
  with the vendor, run the generator, and upload the resulting collection. They
  may also be a Certification Reviewer, but the two jobs are distinct.

## 2. Baseline: the MVP as built

What shipped on `main` (as of commit `8401c92`) differs from the MVP PRD in
several places. This section reconciles the two, so that 4.2 builds on what
exists.

- **Accepted**: the shipped behavior is now the requirement. The MVP PRD is
  superseded on that point.
- **Gap**: not built. The table says which document now owns it.

### 2.1 What shipped

- Certification for **SIS v5 only**. `CERT_MODEL` names SIS, MTSS and
  ASSESSMENTS, but only SIS is supported. MTSS and Assessments scripts are in
  active development.
- Runs are checked **one step at a time** (`POST .../runs/:runId/steps/:stepId/run`).
  The API runs the Bruno CLI with the vendor's token passed through an
  environment variable. Values captured by one step carry forward to later
  steps.
- Bruno collections are downloaded at API start from a **tagged
  certification-testing release** (`CERT_BRUNO_SRC_REF`) and verified with a
  checksum. A catalog of scenarios, steps and parameters is synced from it.
- Each step shows expected vs. observed values and an encrypted response
  snapshot of up to 64 KB.
- A vendor **sends a run to review**. A reviewer **picks it up**, then
  **approves, rejects or requests changes** with comments. The vendor sees
  those comments.
- **My products** for vendors and a **certification dashboard** for Ed-Fi staff.
- A **Certification vendor** team role, with `certification:read`, `:run` and
  `:review` privileges.
- Certification is offered only for data model 5.0.0 or later, and the whole
  module sits behind a `CERT_ENABLED` switch.
- A generic `audit_log` table records every write request. There is no API or
  UI for reading it.

### 2.2 Reconciliation

| # | MVP PRD said | As built | Disposition |
| --- | --- | --- | --- |
| B1 | The product is the **application record**; certification starts from the applications list (D26). | The product is a **data store (ODS) plus a certification model**. Certification starts from **Request certification** on My products. | **Accepted.** "Product" means data store + model from here on. |
| B2 | A **submission** gathers artifacts and runs and is what gets reviewed. | No submission entity. The **run** is the unit of review. | **Accepted.** Artifacts attach to the product (D4.2-3), not to a submission. |
| B3 | Statuses: Draft, Submission Incomplete, Ready for Review, In Review, Changes Requested, Approved, Rejected. | Run statuses: `DRAFT`, `READY_FOR_REVIEW`, `IN_REVIEW`, `CHANGES_REQUESTED`, `READY_FOR_REVIEW_WITH_CHANGES`, `APPROVED`, `REJECTED`. A reviewer pick-up moves a run to `IN_REVIEW`. | **Accepted.** |
| B4 | Readiness gate: all artifacts present plus a finished run stamped Complete; failures may go to review (D25). | Send to review requires **every scenario completed successfully**. No Complete/Incomplete stamp. | **Accepted**, and extended to Assessments (D4.2-6). D25 is superseded. Reviewer override is a nice-to-have. |
| B5 | One run *executing* per product (D22) / one check per environment (ID6 in the [interactive run model design](./design/2026-09-17-interactive-run-model-design.md)). | At most **one open run per data store per model**; at most two steps executing at once per API instance. | **Accepted.** Run concurrency at scale moves to the Automation Platform PRD (job containers). |
| B6 | Credentials reuse Admin App's existing mechanism and are handed to the executor (D20). | The **vendor enters a key and secret**; the API exchanges them for a token, which the browser holds. Credentials are not stored. | **Accepted** for 4.2. |
| B7 | Interactive run: open, check, **seal or abandon**; a run may be sealed with tasks unchecked (ID1–ID9 in the [interactive run model design](./design/2026-09-17-interactive-run-model-design.md), not the MVP PRD). | Step-by-step checks ship. No seal or abandon; send to review requires all scenarios completed. | **Accepted.**<br>• Kept: ID1 (Bruno runs interactive, Assessments batch), ID3 (latest check per step counts), ID4 (parameters per scenario), ID7 (artifact versions pinned, applied to Assessments executions).<br>• Superseded by B4: ID2, ID5 and ID9.<br>• Superseded by B5: ID6.<br>• ID8 (reviewers can see open runs): kept; reviewers can open any run from run history (FR-CERT-HIST-6). |
| B8 | Runs execute a Product-Owner-promoted tag and record its SHA (D21). | A configured release tag plus checksum, loaded at API start. Each run already stores the catalog version, which carries the tag. | **Accepted.** The checksum stands in for the SHA. 4.2 only adds display (FR-CERT-HIST-2). |
| B9 | Entra ID login (FR1, D4). | Generic OIDC; Keycloak in the reference setup. | **Gap → Automation Platform PRD.** |
| B10 | Ed-Fi provisions a certification environment per team (FR4, D6). | The vendor chooses a data store their team already owns, provisioned by hand. | **Gap → Automation Platform PRD.** |
| B11 | Artifact upload, versioning, validation (FR6, §9). | Not built. | **Gap → this PRD, fast follow, Assessments only** (D4.2-2). |
| B12 | MTSS scenarios authored and executed (D19, FR8). | Not built. | **Gap → this PRD, must have**, plus the Bruno scripts workstream (§6). |
| B13 | Assessments validation inside the platform (FR9). | Not built. | **Gap → split.** Expected responses come from the generator; Admin App runs the collection (fast follow). In-platform validation is dropped. |
| B14 | Run history (FR11). | Latest run per model only. | **Gap → this PRD, must have.** |
| B15 | Certification audit history (FR17). | Generic `audit_log` only; no read path. | **Gap → this PRD** (activity timeline, may slip). |
| B16 | Vendor administrator invites teammates (FR3). | Generic team invite only. | **Unchanged.** Not in 4.2 scope. |
| B17 | Outbound email. | Not built (in-app only, as planned). | **Unchanged.** Still deferred. |
| B18 | Vendor record with name and primary contact (FR2). | Vendors are Admin App **teams**. | **Accepted.** |
| B19 | Run history filtered to qualifying runs; a "current run" marker (FR11). | Not built. | **Superseded.** With no Complete/Incomplete stamp and one open run per product, the open run is the current one (FR-CERT-HIST-1). |
| B20 | Reviewers see "artifacts changed since you last looked" (FR12, FR16). | Not built; `READY_FOR_REVIEW_WITH_CHANGES` marks a resubmission after changes were requested. | **Changed.** No changes during review (FR-CERT-ART-9). The indicator applies when a run returns after changes were requested (FR-CERT-ART-10). |
| B21 | Rejection requires a reason (FR15). | A comment is required for some decisions. | **Accepted as built.** To confirm that reject is one of them. |
| B22 | Determinism for every model (MVP §13, §14.2). | Not specified. | **Carried** by NFR-CERT-3. |
| B23 | Type-aware value comparison (D16, §9.1). | Not built (no Assessments). | **Moved to the generator.** The comparison rules ship inside the collection (generator PRD C6). |
| B24 | Outcome metric "first vendor certified end to end" (§14.2). | — | **Carried** by RC-4.2-1 for MTSS and RC-4.2-F1 for Assessments. |

The MVP PRD in Confluence should get a short note pointing here, not a rewrite.

## 3. Jobs to Be Done

> [!TIP]
> The JTBD numbering continues from the v4.1 PRD.

### JTBD 8: Complete MTSS / Interventions Certification

**Personas:** Vendor Integration Engineer, Certification Reviewer

**When** my product publishes intervention data to Ed-Fi, \
**I want** to work through the MTSS scenarios against my certification data store
and send the result to review, \
**so that** my product can be certified for the Intervention domain the same way
SIS products are.

### JTBD 9: Certify an Assessments Product

**Personas:** Vendor Certification Administrator, Vendor Integration Engineer,
Ed-Fi Representative, Certification Reviewer

**When** my assessment product sends results to Ed-Fi, \
**I want** to hand over my mapping and sample data, settle any questions with
Ed-Fi, and then run checks built from my own data, \
**so that** I know exactly what Ed-Fi expects before I run, and can fix my data
load until every check passes.

### JTBD 10: Trace a Certification Decision

**Personas:** Certification Reviewer, Ed-Fi Platform Administrator, Vendor
Certification Administrator

**When** a certification decision is questioned, or I'm picking up a run someone
else worked on, \
**I want** to see the product's earlier runs and what happened on each one, \
**so that** I can tell what was tested, against what, by whom and when.

## 4. Decisions

| # | Decision |
| --- | --- |
| D4.2-1 | **v4.2 is gated on MTSS.** Assessments and the generator are a parallel fast follow. The Automation Platform is a parallel effort; 4.2 ships on today's setup. |
| D4.2-2 | **Artifact upload is Assessments-only.** SIS and MTSS have no artifacts in 4.2; their gate stays "every scenario passed". |
| D4.2-3 | **Artifacts belong to the product (data store + model).** They persist across runs and are versioned. Each Assessments execution pins the artifact versions it used. |
| D4.2-4 | **The generated collection is an artifact that only Ed-Fi staff can upload**, under its own privilege. Admin App runs it unchanged and does not re-derive or edit it. The [generator PRD](./PRD-Bruno-Assertion-Model-Generator.md) owns its format. |
| D4.2-5 | **An Assessments run executes the whole collection at once**, not step by step. It can be executed again while the run is `DRAFT` or `CHANGES_REQUESTED`, the same statuses in which SIS steps can run. The latest execution is what counts. |
| D4.2-6 | **Assessments uses the same gate as SIS:** a run can be sent to review only when its latest execution passed every check against the product's **current collection version**. Replacing the workbook or samples doesn't make a run stale. It shows a fingerprint mismatch, because the collection needs regenerating (FR-CERT-ART-8). Replacing the score report affects neither. *Claude's call.* |
| D4.2-7 | **The vendor can see the expected values before running.** They come from the vendor's own samples. |
| D4.2-8 | **"Request certification" is reworked, not replaced.** It gains artifact upload, Assessments setup and a guided Assessments walkthrough. |
| D4.2-9 | **MTSS runs work exactly like SIS runs.** They use the same step-by-step execution, catalog sync from the tagged release, and gate. |
| D4.2-10 | **The activity timeline uses certification-specific events**, not the generic `audit_log`. `audit_log` records HTTP writes without bodies and has no read path, which is not enough to say what changed on a run. *Claude's call, to confirm.* |
| D4.2-11 | **MTSS recovery deletions are Bruno steps the vendor triggers.** The recovery scenario has Ed-Fi delete records. In 4.2 these are steps in the MTSS collection, run with the vendor's token like any other step, behind an explicit confirmation. *Claude's call, to confirm.* |

## 5. Functional Requirements

### 5.1 MTSS / Interventions Certification (Must Have)

- **FR-CERT-MTSS-1:** The application SHALL offer MTSS as a certification model
  in Request certification for data stores on data model 5.0.0 or later, the
  same way SIS is offered.
- **FR-CERT-MTSS-2:** The catalog sync SHALL read MTSS scenarios from the tagged
  certification-testing release, alongside SIS. It SHALL NOT assume that `SIS`
  is the only collection root.
- **FR-CERT-MTSS-3:** MTSS runs SHALL use the existing step-by-step execution:
  parameters per scenario, values carried between steps, expected vs. observed
  values, and response snapshots.
- **FR-CERT-MTSS-4:** MTSS runs SHALL use the existing statuses, review
  actions, My products and dashboard behavior with no MTSS-specific workflow.
- **FR-CERT-MTSS-5:** Where a collection marks alternative paths (WS-2), for
  example the MTSS draft's Staff Association *Path 1* `Intervention.Staffs` vs.
  *Path 2* `StaffCohortAssociation`, the vendor SHALL choose a path for the
  run. Send to
  review SHALL require every scenario on the chosen path, not on both. The
  chosen path SHALL be visible to the reviewer.
- **FR-CERT-MTSS-6:** Steps the collection marks as destructive (WS-2), such as
  the recovery scenario's deletions (D4.2-11), SHALL be labeled as destructive and SHALL require
  the vendor to confirm before they execute.
- **FR-CERT-MTSS-7:** The application SHALL show which collection release tag a
  run's scenarios came from.

### 5.2 Run History (Must Have)

- **FR-CERT-HIST-1:** For each product (data store + model), the application
  SHALL list every run, open and closed, newest first, with status, who started
  it, start date, last activity and the final decision.
- **FR-CERT-HIST-2:** Each run SHALL display the collection release tag and
  checksum from its catalog version, which is already stored. For Assessments,
  each execution records and displays the collection artifact version it ran.
- **FR-CERT-HIST-3:** Closed runs SHALL be read-only and SHALL keep their step
  results, snapshots and reviewer comments.
- **FR-CERT-HIST-4:** For Assessments, a run whose latest execution used a
  collection version that is no longer current SHALL be marked **stale**.
- **FR-CERT-HIST-5:** A run SHALL finish on the certification-testing release
  it started with. When `CERT_BRUNO_SRC_REF` changes, new runs use the new
  release, and the API SHALL keep every release that an open run still uses.
  Release changes are expected to be rare.
- **FR-CERT-HIST-6:** Vendors SHALL see run history for their own team's
  products only. Reviewers and Ed-Fi staff SHALL see it for all products,
  including open runs, so they can give feedback on work in progress.

### 5.3 Activity Timeline and Raw Output (Must Have; the timeline may slip)

- **FR-CERT-LOG-1:** Each run SHALL have an **activity timeline** showing who
  did what and when:
  - run created
  - step or collection executed, with its result
  - path chosen
  - sent to review
  - picked up
  - comments
  - decision
  - for Assessments, artifact versions uploaded while the run was open
- **FR-CERT-LOG-2:** Timeline events SHALL be append-only and SHALL record the
  actor and a timestamp.
- **FR-CERT-LOG-3:** For each executed step (SIS, MTSS) or execution
  (Assessments), reviewers SHALL be able to view and download the **raw Bruno
  CLI output** (the JSON reporter output). It contains response bodies, so
  storage and encryption SHOULD follow the existing response snapshots
  (encrypted, size-capped, same retention). This is recommended, not required.
- **FR-CERT-LOG-4:** Raw output, timeline entries and snapshots SHALL never
  contain tokens, keys or secrets.
- **FR-CERT-LOG-5:** Vendors SHALL see the timeline and raw output for their
  own runs.

FR-CERT-LOG-1 and FR-CERT-LOG-2 may move to the fast follow if time is short.
FR-CERT-LOG-3 to FR-CERT-LOG-5 may not.

### 5.4 Request Certification Rework (Fast Follow)

- **FR-CERT-REQ-1:** Request certification SHALL keep its current behavior
  for SIS and MTSS: choose a data store and model, and open a DRAFT run.
- **FR-CERT-REQ-2:** For Assessments, Request certification SHALL open a
  **guided walkthrough** on the product with these steps:
  1. upload the mapping workbook and sample data
  2. pre-certification review with Ed-Fi
  3. Ed-Fi uploads your test collection
  4. load your data and start a run
- **FR-CERT-REQ-3:** Each walkthrough step SHALL show its state (done, in
  progress, waiting, locked) and what the vendor needs to do next. Step 4 SHALL
  unlock automatically when a collection is uploaded.
- **FR-CERT-REQ-4:** The walkthrough SHALL tell the vendor that the
  pre-certification review happens with an Ed-Fi representative outside Admin
  App, and SHALL show how to reach them. *The contact mechanism is open (§10).*
- **FR-CERT-REQ-5:** The vendor SHALL be able to return to the walkthrough from
  My products at any time.

### 5.5 Product Artifacts (Fast Follow, Assessments only)

- **FR-CERT-ART-1:** An Assessments product SHALL accept these artifact types:

  | Artifact | Uploaded by | Required to send a run to review |
  | --- | --- | --- |
  | Mapping workbook (Data Mapping Template) | Vendor | Yes |
  | Sample data (one or more files) | Vendor | Yes |
  | Example score report | Vendor | Yes |
  | Generated collection (zip: collection, readiness report, manifest) | Ed-Fi staff only | Yes, and required to start a run |

- **FR-CERT-ART-2:** Uploading a file of an existing type SHALL create a new
  version. Earlier versions SHALL remain downloadable.
- **FR-CERT-ART-3:** Admin App SHALL NOT validate the mapping workbook's
  contents. Interpreting it is the generator's job. It SHALL check only file
  type and size.
- **FR-CERT-ART-4:** On collection upload, Admin App SHALL read `manifest.json`
  (generator PRD C2) and show:
  - the generator version
  - the input file fingerprints
  - the pinned Bruno CLI version
  - the readiness report, next to the collection

  It SHALL reject a package that doesn't follow the contract: an unsupported
  `contractVersion`, missing files, or a readiness report with errors (C1–C3).
- **FR-CERT-ART-5:** A new privilege (for example
  `certification:collection:upload`) SHALL gate collection upload. It is
  granted to an **Ed-Fi Representative** role, matching generator G1. Vendors
  can view and download the collection and readiness report but cannot upload
  or replace them.
- **FR-CERT-ART-6:** Reviewers SHALL be able to download every version of every
  artifact on a product they review.
- **FR-CERT-ART-7:** The product SHALL show which required artifacts are
  missing.
- **FR-CERT-ART-8:** Ed-Fi staff SHALL be able to see which input fingerprints
  in the collection's manifest match the vendor's currently uploaded workbook
  and samples. A mismatch SHALL be shown as a warning, not a block. *Claude's
  call: it catches a collection generated from files the vendor has since
  replaced.*
- **FR-CERT-ART-9:** Artifacts and collections SHALL NOT be uploaded while a
  product's run is `READY_FOR_REVIEW`, `READY_FOR_REVIEW_WITH_CHANGES` or
  `IN_REVIEW`. Changes belong before a run is sent to review, or after a
  reviewer requests changes. The UI SHALL say why upload is unavailable.
- **FR-CERT-ART-10:** When a run comes back to review after changes were
  requested, the reviewer SHALL see which artifacts changed since they last
  reviewed it.

### 5.6 Assessments Runs (Fast Follow)

- **FR-CERT-ASM-1:** An Assessments run SHALL start only when a collection is
  uploaded. The UI SHALL say so specifically.
- **FR-CERT-ASM-2:** Before executing, the vendor SHALL be able to preview the
  **expected values**: endpoints, records and the fields checked. The preview
  reads `expected-values.json` (generator PRD C4).
- **FR-CERT-ASM-3:** Executing SHALL run the whole collection with the Bruno CLI
  version pinned in the manifest, using an environment file Admin App supplies,
  as the contract defines (C5, C7). Admin App SHALL NOT modify the collection.
- **FR-CERT-ASM-3a (today's setup):** Until run job containers exist (Automation
  Platform §7.7), Admin App runs the collection in-process. That means:
  - an allowed list of Bruno CLI versions, installed in the same way as today's
    CLI
  - rejecting on upload a collection whose pinned version isn't on the list
  - a timeout configured per model, so a whole collection isn't held to the
    45-second step timeout
- **FR-CERT-ASM-4:** Results SHALL be grouped by endpoint, then record, and
  classified by the contract's result kinds:
  - `pass`
  - `fail:value`
  - `fail:descriptor-not-loaded`
  - `fail:record-not-found`
  - `fail:objective-not-found`
  - `fail:prerequisite-missing`

  Each failure SHALL show its expected and actual values.
- **FR-CERT-ASM-5:** A run MAY be executed again while it is `DRAFT` or
  `CHANGES_REQUESTED`. The latest execution replaces the previous one as the
  run's result. Earlier executions remain in the timeline and raw output.
- **FR-CERT-ASM-6:** Send to review SHALL require the latest execution to have
  passed every check, against the product's current artifact versions (D4.2-6).
  The UI SHALL say which condition is unmet.
- **FR-CERT-ASM-7:** If a new collection version is uploaded while a run is
  open, the run SHALL be marked stale and the vendor prompted to execute it
  again.
- **FR-CERT-ASM-8:** An infrastructure or authentication failure SHALL be
  reported separately from check failures. Authentication failures are
  identified from HTTP 401 and 403 responses, since the contract has no result
  kind for them.

### 5.7 Dashboard (Fast Follow)

- **FR-CERT-DASH-1:** The Ed-Fi staff dashboard SHALL have a section for
  Assessments products **waiting on a representative**: workbook and samples
  uploaded, no collection yet, or a collection whose input fingerprints no
  longer match. Oldest first.
- **FR-CERT-DASH-2:** My products SHALL show the walkthrough step each
  Assessments product is on.

## 6. Bruno Scripts Workstream (Dependency)

The MTSS scenarios are written in the
[certification-testing](https://github.com/Ed-Fi-Alliance-OSS/certification-testing)
repository, not in Admin App. The draft scenarios are in
[`docs/design/certification-2026/mtss-v5-test-scenarios.md`](./design/certification-2026/mtss-v5-test-scenarios.md).

- **WS-1:** The MTSS collection SHALL cover the draft's six groups:
  Intervention, StudentInterventionAssociation,
  StudentInterventionAttendanceEvent, Assigned vs. Delivered Dosage, Staff
  Association (both paths) and Recovery and Resubmission.
- **WS-2:** It SHALL follow the SIS v5 collection's conventions, so Admin App's
  catalog sync reads it with no MTSS-specific parsing: folder metadata, task
  lists, parameters, and `validateDependency()` for step order. It SHALL add two
  **model-neutral folder metadata conventions** that the catalog sync reads for
  any model:
  - **alternative paths:** a set of folders of which the vendor runs one
  - **destructive:** a step that deletes or changes data in the vendor's data
    store
- **WS-3:** It SHALL be released under a certification-testing release tag that
  includes SIS and MTSS together. Admin App adopts it by changing
  `CERT_BRUNO_SRC_REF` and `CERT_BRUNO_SRC_CHECKSUM`.
- **WS-4:** It SHALL be runnable directly from Bruno by a developer, as SIS is.
- **WS-5:** The MTSS scenario draft's source (Confluence, "Draft for Feedback")
  SHALL be confirmed final before the release tag is cut.

## 7. Non-Functional Requirements

- **NFR-CERT-1:** No new requirement weakens the shipped handling of
  credentials. Tokens stay out of command lines, logs, snapshots, raw output
  and the timeline.
- **NFR-CERT-2:** Artifact files SHALL be stored encrypted at rest and served
  only through the API, with team-scoped authorization. Where they are stored
  is the Automation Platform's concern; until then, Admin App's existing
  storage is acceptable.
- **NFR-CERT-3:** Running the same step (SIS, MTSS) or collection
  (Assessments) with the same inputs against an unchanged data store SHALL
  produce the same result.
- **NFR-CERT-4:** Adding a further certification model that uses fixed Bruno
  collections SHALL need a release tag and configuration, not new workflow
  code. MTSS is the test of this.
- **NFR-CERT-5:** New tables and migrations SHALL support PostgreSQL and SQL
  Server, like the existing `cert` schema.

## 8. Release Criteria

| # | Criterion |
| --- | --- |
| RC-4.2-1 | A vendor runs every MTSS scenario on one staff path through Admin App, including the recovery scenario, against a data model 5.x data store. The run is sent to review and approved, with every step's raw output viewable. |
| RC-4.2-2 | The same Admin App build runs SIS and MTSS from one certification-testing release tag. |
| RC-4.2-3 | Run history shows that product's earlier runs, with the tag each one used. |
| RC-4.2-4 | (If not slipped) The activity timeline shows every event in FR-CERT-LOG-1 for that run. |
| RC-4.2-F1 (fast follow) | An Assessments vendor uploads files, a representative uploads a generated collection, and the vendor previews the expected values. The vendor executes, fixes data, executes again until every check passes, and sends the run to review. A run with one failure of each result kind shows each one correctly. |

## 9. Out of Scope and Deferred

- Artifacts for SIS and MTSS.
- Generating or editing collections inside Admin App (generator PRD).
- Validating mapping workbooks inside Admin App (moved to the generator).
- Hosting, Entra ID, environment provisioning, run containers and system logs
  (Automation Platform PRD).
- Outbound email.
- Vendor administrators managing their own team membership.
- Vendor-hosted environments (Automation Platform stretch goal).

## 10. Open Questions

| # | Question |
| --- | --- |
| OQ-4.2-1 | Should the activity timeline use certification events (D4.2-10), or should `audit_log` gain a read path and enough detail instead? |
| OQ-4.2-2 | Are the recovery-scenario deletions acceptable as vendor-triggered Bruno steps (D4.2-11)? Or must an Ed-Fi staff member perform them, which would add a waiting state to the run? |
| OQ-4.2-3 | How does an Assessments vendor reach their representative from the walkthrough (FR-CERT-REQ-4): a named contact on the product, a support address, or something else? Who assigns representatives? |
| OQ-4.2-4 | Can a vendor send an Assessments run to review against a collection whose input fingerprints don't match their current files (FR-CERT-ART-8)? Or should that block, since replacing the workbook or samples doesn't make the run stale (D4.2-6)? |
| OQ-4.2-5 | Is a vendor-chosen path (FR-CERT-MTSS-5) fixed once chosen, or can the vendor switch paths in an open run? |
| OQ-4.2-6 | Size limit for uploaded artifacts? |

**Left to the builder:** the existing `artifact/artifact.service.ts` (the Bruno
release download) clashes in name with "product artifacts". Rename one of them.

## 11. Glossary Additions

- **Product:** A data store (ODS) plus a certification model. The unit that
  receives certification. (Supersedes the MVP's "application record".)
- **Product artifact:** A versioned file attached to a product. Assessments
  only in 4.2.
- **Generated collection:** The Bruno collection, readiness report and manifest
  produced by the generator and uploaded by Ed-Fi staff.
- **Execution (Assessments):** One run of the whole collection inside an
  Assessments run. The latest execution is the run's result.
- **Stale:** An Assessments run whose latest execution used a collection
  version that is no longer current.
- **Ed-Fi Representative:** The Ed-Fi staff member who works with an
  Assessments vendor before certification and produces the collection.
