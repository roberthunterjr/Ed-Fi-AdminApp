# Certification Automation Platform PRD

**Owner:** Robert H on behalf of Nathan G
**Status:** Draft — Revision 5
**Last Updated:** November 16, 2026

> **Revision note:** Revision 2 incorporated feedback content additively, in place, inside the original PRD structure. Revision 3 restructures the document so the feedback's own logic drives the outline: Scope → **Confirmed Product Decisions** → **Certification Decision Ownership** → **Feature Requirements** (organized so each "Decision Requiring Documentation" is traceable to a specific feature) → **Workflow Assumptions** → **Nice to Have** → **Out of Scope**. No content from Revision 2 was dropped — supporting context (Personas, JTBD, NFRs, Architecture) is retained but now sits around this policy spine rather than alongside it as parallel structure. Revision 4 (2026-08-13) adds three things without changing that spine: **Intervention/MTSS Certification** as a third certification model (§5.2, §7.10, §9); the **Certifying Agent** pre-review determination gate and Run Report structure, derived from a real agent output (§7.5, §7.7.2, §15 OQ13); and a terminology/consistency pass reconciling "Certification Agent" → "Certifying Agent," "deny" → "reject," and the Ready for Review → Under Review transition across all sequence diagrams. Revision 5 (2026-11-16) adds the **Assessment Mapping Tool** (§7.4) and, with it, a deliberate revision of a feedback-sourced decision: artifact ownership is now *vendor-authored, platform-assisted* (§5.5, §12), and two proposed decisions D27/D28 are recorded (§5.7). The revised wording is marked inline; design: `docs/design/2026-11-16-assessment-mapping-tool-design.md`.
>
> **Fidelity note:** Everything in §5 (Confirmed Product Decisions), §6 (Ownership Matrix), and the feedback-sourced bullet lists throughout §7/§10/§11/§12 is a direct transcription of the first-round feedback — treated as authoritative and not reworded for substance. A small number of places in §7.7, §7.8, and §12 extended the feedback's literal wording to make the PRD internally consistent (e.g., giving workflow states entry/exit criteria, since the feedback only named the labels). Those gaps were resolved on 2026-08-10 (workflow state diagram and gating logic, §7.7/§7.7.1; notification event consolidation, §7.8; renewal-workflow deferral, §12/§13) and are marked "confirmed 2026-08-10" inline, tracked in §15 (OQ8–OQ11) for traceability back to the original feedback.

---

# 1. Overview

The Ed-Fi Certification Automation Platform is a hosted platform designed to modernize and automate Ed-Fi certification workflows while replacing operational processes currently supported through the legacy Sandbox Admin experience.

The platform provides a unified experience for:

| Feature | Details |
| --- | --- |
| Vendor onboarding | Automated tenant, environment, and vendor identity setup so a vendor can begin testing immediately upon a certification request (§7.1). |
| Certification environment provisioning | Automatic provisioning of tenants, single-tenant environments, and ODS instances per certification run (§7.1). |
| Credential management | Automatic generation of application credentials as part of provisioning; credential lifecycle managed by the platform (§5.3, §7.1). |
| SIS certification workflows | Guided execution of SIS certification scenarios with tracked progress and automated validation; SIS scenarios cannot be substituted by domain certification (§5.2, §7.2). |
| Domain API certification workflows | Certification against one or more selected Ed-Fi domains, with required resources/endpoints identified and validated per domain (§5.6, §7.3). |
| Intervention/MTSS certification workflows | Baseline interoperability certification against the Ed-Fi Intervention Domain — intervention definitions, student assignments, participation/dosage data, and a recovery scenario (§5.2, §7.10). Provisional; see §7.10. |
| Validation and reporting | Automated validation of endpoints, resources, and data structures, with pass/fail reporting by domain, resource, and element, plus a reviewer-facing Run Report (§7.5). |
| Reviewer approval workflows | Reviewer workbench for artifact review, spot-checking, and final certification judgment, with approve/reject/request-changes dispositions (§5.4, §7.6). |

The platform builds upon the Admin App and Admin API foundation, extending administrative capabilities into certification lifecycle management.

**Governing principle:** The platform *implements* certification requirements; it does not *govern* them. See §5.1 for the confirmed decision behind this.

---

# 2. Purpose and Strategic Alignment

## Strategic Goals
| Objective | Description |
| --- | --- |
| Reduce certification onboarding time | Automated provisioning (§7.1) eliminates manual tenant/environment setup, letting vendors begin testing immediately. |
| Reduce operational effort required by Ed-Fi staff | Automated provisioning, validation execution, and artifact management (§5.3) remove manual administrative work from certification staff. |
| Improve vendor certification experience | Guided workflows (§7.2, §7.3), visible progress/status (§7.7, §10.4), and proactive notifications (§7.8) replace opaque, staff-mediated processes. |
| Accelerate certification completion | Automated validation (§7.5) and a guided artifact submission gate (§7.7.1) reduce back-and-forth cycles between vendor and reviewer. |
| Improve consistency of certification validation | A standardized validation engine (§7.5) and reporting by domain/resource/element (§5.6) replace ad hoc manual checks. |
| Enable certification expansion into new domains and standards versions | Extensible validation and scenario framework designed to support additional domains and Data Standard versions (§14 Extensibility; §9 Scope). |

## Administrative Tooling Alignment
| Tooling | Details |
| --- | --- |
| Admin App | Certification workflows surface within the Admin App as an extension of existing administrative UI, not a separate tool. |
| Admin API | Certification operations (provisioning, credentials) build on Admin API automation; dedicated Certification APIs are a future enhancement (§13). |
| Credential Management | Certification reuses the platform's existing credential generation and management capabilities (§5.3, §7.1). |
| Environment Provisioning | Certification environments are provisioned through the same tenant/environment model used for other hosted Ed-Fi environments (§7.1). |
| Hosted Ed-Fi Infrastructure | Certification runs on the same hosted infrastructure supporting other Ed-Fi tenants, rather than separate certification-specific infrastructure. |

Rather than operating as a standalone certification tool, certification becomes an extension of Ed-Fi administrative tooling.

## Market-Led Growth Alignment
| Benefit | Description |
| --- | --- |
| Reducing vendor integration costs | Automated provisioning and guided workflows reduce vendor effort and elapsed time to certify (§7.1, §7.2). |
| Shortening implementation timelines | Faster onboarding and clearer validation feedback shorten the vendor's path to certification (§7.1, §7.5). |
| Improving certification scalability | Automation reduces staff effort per certification run, enabling more concurrent certifications (§14 Scalability). |
| Increasing partner satisfaction | Vendor visibility into status and proactive notifications (§10.4, §7.8) reduce uncertainty and support burden. |

---

# 3. Target Market

## Primary Audience

### Certifying Vendors
Organizations seeking certification against Ed-Fi APIs. ("Certified" describes the post-approval state; this audience is the set of vendors pursuing it.)

### Vendor Engineering Teams
Engineers implementing and validating Ed-Fi integrations.

### Ed-Fi Certification Staff
| Responsibility | Details |
| --- | --- |
| Certification management | Oversee certification runs end-to-end — provisioning, status tracking, and coordinating with vendors (§5.3, §7.7). |
| Validation | Configure and interpret automated validation results produced by the Validation Engine (§7.5). |
| Review | Reviewer role — evaluate submitted artifacts, spot-check validation results, review mapping documentation (§5.4, §7.6). |
| Approval | Exercise final certification judgment — approve, reject, or request changes (§5.4, §7.6). |

## Future Audiences
| Audience | Details |
| --- | --- |
| State Education Agencies (SEAs) | Potential future consumers of certified products for state-level deployment, not part of current certification scope (§13 Deployable Certification Packages). |
| Education Service Agencies (ESAs) | Regional service agencies that may deploy certified products on behalf of member districts (§13). |
| Managed Service Providers (MSPs) | Third parties managing Ed-Fi deployments on behalf of districts/states — a future certification/deployment audience (§13). |
| Data Hub operators | Operators of Data Hub infrastructure who may consume certification results for deployment decisions, and may also run their own self-hosted certification instance to support internal application development (§13). |

---

# 4. Personas

## Vendor Certification Administrator
**Primary Motivations:** Register products; manage certification submissions; monitor certification progress.
**Success Looks Like:** Minimal waiting on Ed-Fi staff; clear certification status; self-service management.

## Vendor Integration Engineer
**Primary Motivations:** Validate Ed-Fi integrations; understand certification requirements; resolve certification issues quickly.
**Success Looks Like:** Immediate feedback; clear validation failures; guided certification workflow.

## Certification Reviewer
**Primary Motivations:** Validate submissions; ensure certification quality; reduce manual effort.
**Success Looks Like:** Standardized evidence; efficient review process; consistent certification decisions.

## Ed-Fi Platform Administrator
**Primary Motivations:** Provision environments; manage tenants; manage credentials; support certification infrastructure.
**Success Looks Like:** Automated provisioning; reduced operational overhead; repeatable deployment processes.

---

# 5. Confirmed Product Decisions

*(This section mirrors "Decisions Confirmed" from the first round of PRD feedback verbatim. It is the canonical policy layer — Sections 7 (Feature Requirements) and 10 (Workflow Assumptions) implement these decisions; they do not redefine them.)*

## 5.1 Certification Governance
- Published certification requirements are the authoritative source of truth.
- Certification requirements are owned by the Product Owner.
- The platform implements certification requirements but does not govern them.

*(Resolves PRD Open Question #3 — see §15.)*

## 5.2 Certification Model
- Certifications are granted to **products**, not vendors.
- A vendor may have multiple products.
- Only one active certification run may exist per product at a given time.
- SIS Certification and Domain Certification are distinct certification models.
- A SIS must complete SIS certification scenarios and does not qualify through domain certification.
- Intervention/MTSS Certification is a third, distinct certification model, scoped to the existing Ed-Fi Intervention Domain (§7.10). **Added 2026-08-13**, sourced from the [Intervention/MTSS Certification Draft Use Cases and Resource Elements](https://edfi.atlassian.net/wiki/spaces/EDFICERT/pages/2413428742) page — that page is itself marked "Draft for Feedback," so this model is provisional pending finalization there.

## 5.3 Platform Responsibilities
The platform is responsible for:
- Environment provisioning
- Credential management
- Certification workflow execution
- Validation execution
- Artifact collection and storage
- Status tracking
- Reviewer workflow support
- Audit history

*(Implemented in §7, FT1–FT10.)*

## 5.4 Reviewer Responsibilities
The reviewer remains the certification decision-maker and is responsible for:
- Reviewing certification artifacts
- Spot-checking validation results
- Reviewing mapping documentation
- Evaluating semantic alignment
- Approving or rejecting certification submissions

*(Implemented in §7.6, FT6: Reviewer Workbench.)*

## 5.5 Artifact Ownership
*(Revised 2026-11-16 — vendor-authored, platform-assisted; see `docs/design/2026-11-16-assessment-mapping-tool-design.md`. This replaces the first-round feedback wording, which said "The platform does not generate certification artifacts.")*

- Certification artifacts are vendor-owned and vendor-authored.
- Vendors may upload artifacts or author them with platform-provided tools, such as the Assessment Mapping Tool (§7.4).
- The platform stores and presents artifacts, and may assist authoring with structure, pickers and checks, but never makes mapping choices on a vendor's behalf.

*(See also §12 Out of Scope: Artifact Generation.)*

## 5.6 Domain Certification
- Vendors may certify one domain or multiple domains in a single submission.
- Validation results should show pass/fail status by domain, resource, and element.
- Certification remains at reviewer discretion based on submitted evidence.

*(Implemented in §7.3, FT3, and §7.5, FT5.)*

## 5.7 Assessment Mapping Tool Decisions (proposed 2026-11-16)
- **D27 (proposed):** Mapping issues are flagged for the reviewer and never block generating a mapping version.
- **D28 (proposed):** The descriptor bank is the only source of selectable descriptor values in the mapping tool; standard Ed-Fi values start disabled.

*(Implemented in §7.4, Assessment Mapping Tool. Proposed, not yet confirmed by the certification workgroup.)*

---

# 6. Certification Decision Ownership

*(This is the feedback's Ownership Matrix, transcribed as-given and positioned here — immediately after Confirmed Decisions §5.3–5.4 — because it is the single-glance summary of the platform/reviewer split that governs every feature below. This is the section to point to whenever scope discussions drift toward "should the platform decide this?")*

The platform is responsible for workflow orchestration, validation execution, evidence collection, and reporting. Reviewers remain responsible for certification judgment.

| Activity | Platform | Reviewer |
| --- | :---: | :---: |
| Provision environment | ✅ | |
| Manage credentials | ✅ | |
| Execute validation | ✅ | |
| Track certification workflow | ✅ | |
| Store artifacts | ✅ | |
| Report validation outcomes | ✅ | |
| Identify missing artifacts | ✅ | |
| Generate automated readiness determination (Certifying Agent, §7.5, §7.7.2) | ✅ | |
| Review artifacts | | ✅ |
| Spot-check validation results | | ✅ |
| Review mapping documentation | | ✅ |
| Evaluate semantic alignment | | ✅ |
| Determine if re-validation is needed | | ✅ |
| Approve/reject certification | | ✅ |

---

# 7. Feature Requirements (Must Have)

*(This section mirrors "Decisions Requiring Documentation" from feedback: each item in that list is called out below at the feature it belongs to, so the traceability from feedback → PRD is explicit rather than implied.)*

## 7.1 FT1: Automated Environment Provisioning

**Goal:** Automatically provision vendors, tenants, ODS instances, applications, and credentials.

**Conditions of Satisfaction:**
- Vendor can begin testing immediately
- Credentials are generated automatically
- Reviewer can assign environments

**Provisioning Flow:** Steps from external certification request through a testable vendor environment:

```mermaid
sequenceDiagram
    actor PA as "Platform Admin"
    participant Platform

    Note over PA: Receives request to certify externally
    PA->>Platform: Create new tenant under the Certification Team
    PA->>Platform: Add a new single-tenant environment to the team
    PA->>Platform: Add a user to the environment
    PA->>Platform: Create a vendor identity
    PA->>Platform: Create a new claim set for the SIS to use
    PA->>Platform: Create an application mapping linking the tenant, environment, user, vendor identity, and claim set
    Platform->>Platform: Generate credentials automatically
    Note over Platform: Notify vendor - credentials ready, vendor can begin testing immediately
```

The steps shown in the Platform Admin lane are the *current* manual sequence, captured here as the baseline this feature automates. The target state is that a certification request triggers these steps as a single platform-executed operation, with the Platform Admin approving or overriding rather than performing each step by hand — that is what "automatically provision" in the Goal above means.

## 7.2 FT2: SIS Certification Workflow

**Goal:** Provide guided execution of SIS certification scenarios.

**Conditions of Satisfaction:**
- Workflow progression tracked
- Validation performed automatically
- Progress status visible
- A SIS must complete SIS certification scenarios; domain certification does not substitute (§5.2)

**SIS Certification Sequence:** Application selection through approval/rejection, spanning Vendor, Platform, and Reviewer:

```mermaid
sequenceDiagram
    actor Vendor as "Vendor (Artifact Owner)"
    participant Platform
    actor Reviewer as "Reviewer (Decision Maker)"

    Vendor->>Platform: Select application to certify
    Platform->>Vendor: Display API version for the application - v5 or v6

    loop Until all required artifacts are present
        Vendor->>Platform: Upload an artifact
        Platform->>Vendor: Status - Submission Incomplete, missing artifacts listed
    end

    Note over Platform: All required artifacts present
    Note over Platform: Status switches to Ready for Review

    Note over Platform: Certification suite runs, covering required elements
    Platform->>Vendor: Display progress per element

    loop For each required element
        alt Endpoint runs successfully
            Note over Platform: Mark element as checked
        else Endpoint fails
            Note over Platform: Flag element as failed
        end
    end

    Note over Platform: Scenarios complete, or a dependency fails
    Note over Platform: Certifying Agent gate runs (§7.7.2) - status stays Ready for Review

    Platform->>Reviewer: Present Run Report - element status vs expectations
    Platform->>Vendor: Present Run Report - element status vs expectations

    Reviewer->>Platform: Begin evaluation
    Note over Platform: Status switches to Under Review

    alt Results do not match expectations
        Reviewer->>Vendor: Request changes
    else Certification rejected outright
        Reviewer->>Vendor: Reject certification
    else Results match expectations
        Note over Reviewer: Perform live inspection - see note on possible Live Review state
        Reviewer->>Vendor: Approve certification
    end
```

**Note — possible "Live Review" state:** The description above calls for a reviewer "live inspection" step once automated results match expectations, before final approval. The diagram currently places this inside "Under Review" rather than as its own workflow state. Whether §7.7's state model needs a distinct **Live Review** state (between Under Review and Approved) — e.g., to give the reviewer a scheduling/tracking hook for a live session with the vendor, separate from asynchronous artifact review — is an open question; see §15 OQ12.

## 7.3 FT3: Domain API Certification Workflow

**Goal:** Enable certification against selected domains.

**Conditions of Satisfaction:**
- Required resources identified
- Required endpoints identified
- Certification requirements visible
- A single submission may cover one or multiple domains (§5.6)

**Open Questions:** Whether certification should be driven by domain resources, endpoint coverage, or sample data remains open (§15). §5.6 confirms the certification *decision* stays with the reviewer regardless of which technical signal drives validation — but not which signal(s) the validation engine should use.

**Domain API Certification Sequence:** Domain selection through automated GET-shape verification and live write verification:

```mermaid
sequenceDiagram
    actor Vendor as "Vendor (Artifact Owner)"
    participant Platform
    actor Reviewer as "Reviewer (Decision Maker)"

    loop Until all required artifacts are present
        Vendor->>Platform: Upload an artifact - score report, sample data, data mapping
        Platform->>Vendor: Status - Submission Incomplete, missing artifacts listed
    end

    Note over Platform: All required artifacts present
    Note over Platform: Status switches to Ready for Review

    Vendor->>Platform: Select one or more domains to certify against
    Note over Platform: Identify required element resources and endpoints for the selected domains

    loop For each required resource
        Platform->>Platform: Perform GET request against the resource
        Platform->>Platform: Compare response shape to expected shape from uploaded artifacts
    end

    alt Response shapes match expectations
        Note over Platform: Certifying Agent gate runs (§7.7.2) - status stays Ready for Review
        Platform->>Reviewer: Notify - submission ready for review, Run Report attached
        Reviewer->>Platform: Begin evaluation
        Note over Platform: Status switches to Under Review
    else Response shapes do not match
        Note over Platform: Flag mismatch for vendor correction
    end

    Note over Reviewer: Perform live verification of endpoints, including writes - PUT and POST

    alt Changes needed
        Reviewer->>Vendor: Request changes
    else Results meet expectations
        Reviewer->>Vendor: Approve certification
    end
```

The artifact upload loop is now explicit in the diagram, rather than assumed: a vendor must successfully add the required artifacts (score report, sample data, data mapping) and reach "Ready for Review" *before* domain selection begins — domain selection is not a substitute path around the artifact gate in §7.7.1. The GET-shape verification loop that follows domain selection is a distinct, later automated check against the resources/endpoints for the *selected domains*, not a re-check of artifact presence. The live PUT/POST verification step also raises the same question flagged in §15 OQ12 for §7.2: whether "live verification" of write endpoints should be its own workflow state distinct from "Under Review."

## 7.4 FT4: Certification Artifact Management

**Goal:** Provide management of product mappings, reports, sample data, and validation results, so reviewers can compare mappings, sample data, reports, and API responses using a common structure.

**Ownership and authoring boundary** (§5.5, revised 2026-11-16): Certification artifacts are vendor-owned and vendor-authored. The platform stores and presents them, and may provide authoring tools (the Assessment Mapping Tool below) in which the vendor makes every choice.

**"Decision Requiring Documentation" — Artifact Updates During Review** (feedback verbatim):
- Vendors may replace artifacts during review.
- Reviewers are notified when artifacts change (§7.8, FT8: Notifications).
- Reviewers decide whether a change requires re-validation.
- Reviewers do not upload artifacts on behalf of vendors.

**Artifact Submission Sequence:** Environment/application selection through the Ready for Review gate:

```mermaid
sequenceDiagram
    actor Vendor as "Vendor (Artifact Owner)"
    participant Platform

    Vendor->>Platform: Select environment and application to certify against
    Note over Platform: Certification status switches to In Progress

    Vendor->>Platform: Select certification type - SIS, Domain API, or Intervention/MTSS

    alt Domain API selected
        Vendor->>Platform: Select one or more domains - starting with Assessments
        Note over Platform: Corresponding resources and endpoints for the selected domains become available to verify against
    end

    Platform->>Vendor: Display three artifact fields - Certification Mapping, Score Report, Sample Data

    loop Until all three artifacts are uploaded
        Vendor->>Platform: Upload an artifact
        Platform->>Vendor: Indicate upload success for that field
        Note over Platform: Status switches to Submission Incomplete
    end

    Note over Platform: All three artifacts uploaded - indicated green
    Note over Platform: Status switches to Ready for Review
    Platform->>Vendor: Enable Begin Automation Workflow option
```

This is the same three-artifact set (Certification Mapping, Score Report, Sample Data) referenced generically in §5.5/§7.7.1 — here shown as the specific fields the vendor sees on screen. The "Domain API selected" branch is the entry point into §7.3's domain-selection step; Assessments is called out as the first domain available, with other domains following the same resource/endpoint pattern.

### Assessment Mapping Tool (added 2026-11-16)

An authoring path for the **Vendor mapping CSV** of an Assessments submission. It replaces hand-filling the Data Mapping Template workbook's free-text Ed-Fi columns with pickers over the Assessments v5 model, plus checks. Design: `docs/design/2026-11-16-assessment-mapping-tool-design.md`; clickable in `docs/prototypes/certification-prototype.html`.

**Conditions of Satisfaction:**
- **Entry point:** the Vendor mapping CSV row of Required artifacts offers *Import workbook* (primary), *Build from scratch* and *Upload CSV* when no version exists, and *Open in mapping tool*, *Import workbook* and *Replace CSV* once one does. Assessments submissions only.
- **Import:** a filled Data Mapping Template workbook is read tab by tab. Ed-Fi paths are matched against the v5 model; unmatched paths are flagged *Needs target* with the original text kept. Data types are normalized, and every correction is shown. `CustomValue` placeholders are skipped and flagged. Standard Ed-Fi descriptors the workbook references are enabled. A workbook that is not the template is rejected and nothing is imported. An import summary shows the counts.
- **Build from scratch:** opens the same editor with an empty mapping.
- **Descriptor bank (D28):** vendor descriptor values under the product namespace, plus Ed-Fi standard values listed but disabled until the vendor enables them. Only enabled or vendor values are selectable. A value in use cannot be removed or disabled, and unused values are flagged.
- **Multi-target elements:** one vendor element can map to several Ed-Fi fields (e.g. *Scale Score* → `assessment.scores` and `studentAssessment.scoreResults`). Keyed-collection targets take a reporting-method descriptor from the bank.
- **Collection entries:** an Ed-Fi-first view lists each keyed entry of `scores` / `scoreResults` / `performanceLevels` per assessment, with the feeding elements and their coverage. Entries can be added from the bank.
- **Checks:** required-field coverage comes from the v5 model and is checked **per assessment and per reporting method** (and per objective assessment when one is targeted). Vendor data types are checked against the target type.
- **Generate with issues (D27):** generating is always allowed. A summary lists open issues first. The new version carries its issues and notes, and runs pinned to the prior version are marked stale (D14).
- **Notes:** the vendor can attach notes to elements and to individual issues (*Explained* / *Unexplained*). Notes never clear an issue. A note on an issue that no longer applies moves to the element, tagged "issue resolved", and is never dropped.
- **Draft:** edits are kept in a working draft per submission. Only Generate creates a version, and reviewers see only generated versions.

## 7.5 FT5: Validation Engine

**Goal:** Validate endpoints, resources, data structures, required fields, and data types, such that results are actionable and understandable.

**"Decision Requiring Documentation" — Reporting granularity:** Per §5.6, Domain Certification validation results must show pass/fail status by **domain, resource, and element**, not only at the endpoint/resource level.

**Validation Sequence:** Test suite loading through the automated readiness gate to the reviewer's own decision to begin evaluation, and their disposition of the run:

```mermaid
sequenceDiagram
    actor Vendor as "Vendor (Artifact Owner)"
    participant Platform
    participant Agent as "Certifying Agent"
    actor Reviewer as "Reviewer (Decision Maker)"

    Vendor->>Platform: Select workflow to test against - SIS, Domains, or Intervention/MTSS
    Note over Platform: Load test suite in dependency order - sequence, parallel, fan-out as needed

    loop For each test in suite
        Vendor->>Platform: Make request using client id and secret
        alt SIS or Intervention/MTSS workflow
            Note over Platform: Includes writes and updates - POST and PUT
        else Domain workflow
            Note over Platform: Automated portion uses GET requests
        end
        Platform->>Platform: Compare response to expected response in report artifact, based on sample data
        Platform->>Platform: Verify required fields present and types match
    end

    Note over Platform: Automated workflow completes

    Platform->>Agent: Compile mapping, report, sample data, and endpoint response evidence
    Agent->>Agent: Run per-area checks - mapping review, optional-field treatment,<br/>JSON payload review, report-to-payload comparison, dependency reconciliation
    Agent->>Platform: Return Run Report - per-area PASS / FAIL / PASS WITH CLARIFICATION,<br/>blocking deficiencies, recommended next steps, readiness decision

    alt Blocking deficiencies identified
        Platform->>Vendor: Notify of deficiencies - status remains Ready for Review, not yet visible to reviewer
    else No blocking deficiencies
        Note over Platform: Status remains Ready for Review
        Platform->>Reviewer: Notify - submission ready for review, Run Report attached

        Reviewer->>Platform: Begin evaluation
        Note over Platform: Status switches to Under Review
        Reviewer->>Platform: Match each response against what was expected from artifacts

        alt Changes needed
            Reviewer->>Vendor: Request changes
        else Certification rejected
            Reviewer->>Vendor: Reject certification
        else Schedule live session
            Reviewer->>Vendor: Schedule live session
            Note over Reviewer: See OQ12 - possible new Pending Live Review state
            Reviewer->>Vendor: Approve certification after live session
        end
    end
```

**Run Report structure** (revised 2026-08-13, based on a real Certifying Agent output — see §15 OQ13 for provenance): the Run Report is a platform-generated, per-area determination compiled by the **Certifying Agent** (renamed from "Certification Agent," §8/JTBD5 — same capability, name and description reconciled to match actual behavior). It is not simply a request/response log; it contains:
- **Scope statement** — explicitly limited to the submitted evidence package; does not evaluate runtime behavior, source code, UI workflows, or connectivity configuration.
- **Per-area results** — e.g., Mapping Review, Optional Field Treatment, JSON Payload Review, Report-to-Payload Comparison, dependency reconciliation (e.g., a referenced resource like `Program` exists and resolves correctly) — each scored PASS / FAIL / PASS WITH CLARIFICATION, at the domain/resource/element granularity required by §5.6.
- **Blocking deficiencies** — if any are identified, the submission stays in "Ready for Review" and the vendor is notified; the reviewer is not notified or queued until this list is empty (§7.7's gate, formalized in §7.7.2). Even once clean, moving into "Under Review" itself remains the reviewer's own action, not an automatic transition.
- **Recommended reviewer note, clarification questions, and next steps** — auxiliary guidance surfaced to the human reviewer, not a substitute for their judgment.
- **Readiness decision** — e.g., "Ready for certification review" — this is a *readiness-to-proceed* determination, not a certification outcome; approve/reject remains exclusively the reviewer's call (§5.4, §6). See §12's Out of Scope note on AI-generated recommendations for why this distinction matters.

The Run Report is separate from the vendor-provided artifacts it's compared against (score report, sample data, mapping — §5.5), gives the reviewer a tangible, comprehensive basis for comparison rather than relying on the live run state or scattered logs, and is retained under §7.9's Audit History requirements.

Validation here is primarily field-presence and type-matching against the sample data/report artifacts, not deep semantic checks (semantic alignment remains a manual reviewer activity per §5.4/§7.6). The three reviewer dispositions shown — Changes Requested, Rejected, or scheduling a live session before Approved — sharpen OQ12: a "schedule live session" action implies a *waiting* period between Under Review and Approved that isn't well represented by either state today, reinforcing the case for a distinct **Pending Live Review** (or similarly named) state rather than treating live verification as instantaneous within Under Review.

## 7.6 FT6: Reviewer Workbench

**Goal:** Support certification review workflows.

**"Decision Requiring Documentation" — Reviewer Approval Criteria** (implements §5.4 in full — feedback's "Reviewer Approval Criteria" list merged with the "Approving/rejecting" and "leave feedback" items from Reviewer Responsibilities; no wording changed): Reviewers can:
- Review submitted artifacts
- Spot-check validation results
- Review mapping documentation
- Evaluate semantic alignment
- Exercise final certification judgment
- Leave feedback
- Approve or reject certifications

**Mapping review (added 2026-11-16, §7.4 Assessment Mapping Tool):** for a mapping generated in the mapping tool, the reviewer opens a read-only view of exactly the submitted version. It shows the issue list grouped by kind, each issue's *Explained* / *Unexplained* state with the vendor's note inline, and the coverage and collection views. The Required artifacts row shows an issue badge (e.g. "4 issues · 3 explained").

**"Decision Requiring Documentation" — Reviewer Landing Page** (feedback verbatim): The reviewer homepage must prominently display, per certification run:
- Certification Type (SIS, Domain, or Intervention/MTSS — the feedback named the first two; the third follows from §5.2)
- Product Name
- Vendor Name
- Submission Date
- Validation Status
- Scenario Completion Status
- Artifact Checklist
- Missing Artifacts

**Review Activity Diagram:** Converts the Reviewer Approval Criteria above into discrete activities per actor, showing the loop back to the vendor when changes are requested rather than a straight-through approval path:

```mermaid
sequenceDiagram
    actor Vendor as "Vendor (Artifact Owner)"
    actor Reviewer as "Reviewer (Decision Maker)"

    Vendor->>Reviewer: Submit certification artifacts

    Note over Reviewer: Review submitted artifacts
    Note over Reviewer: Spot-check validation results
    Note over Reviewer: Review mapping documentation
    Note over Reviewer: Evaluate semantic alignment
    Note over Reviewer: Exercise final certification judgment

    alt Changes needed
        Reviewer->>Vendor: Leave feedback and request changes
        Vendor->>Reviewer: Update and resubmit artifacts
        Note over Reviewer: Repeats review activities above
    else Approve
        Reviewer->>Vendor: Approve certification
    else Reject
        Reviewer->>Vendor: Reject certification
    end
```

Every note in the Reviewer lane maps directly to a bullet in the Reviewer Approval Criteria list above, and the "Changes needed" branch is the only path that hands control back to the Vendor — consistent with §6's ownership split (reviewers judge, vendors act on that judgment).

## 7.7 FT7: Certification Status Tracking

**Goal:** Provide end-to-end certification visibility — current status, failed validations, pending actions, reviewer feedback.

**"Decision Requiring Documentation" — Workflow States** (state labels are feedback verbatim; entry/exit criteria below are **confirmed 2026-08-10** — the feedback named the states but did not define their gating logic, so this is where that logic was decided):

| State | Entry / Exit Criteria |
| --- | --- |
| In Progress | Vendor is actively working the certification scenarios/environment |
| Submission Incomplete | One or more required artifact types are missing |
| Ready for Review | All required artifact types are present (even if individually incomplete) — vendor cannot force this transition manually; see §7.7.1 |
| Under Review | Reviewer has begun evaluation |
| Changes Requested | Reviewer has requested artifact updates or clarification |
| Approved | Reviewer has approved the certification |
| Rejected | Reviewer has rejected the certification |

**Workflow State Diagram:**

```mermaid
stateDiagram-v2
    state "In Progress" as InProgress
    state "Submission Incomplete" as SubmissionIncomplete
    state "Ready for Review" as ReadyForReview
    state "Under Review" as UnderReview
    state "Changes Requested" as ChangesRequested
    state "Approved" as Approved
    state "Rejected" as Rejected

    [*] --> InProgress
    InProgress --> SubmissionIncomplete : vendor submits with required artifact type(s) missing
    InProgress --> ReadyForReview : all required artifact types present
    SubmissionIncomplete --> ReadyForReview : remaining required artifact type(s) added
    ReadyForReview --> UnderReview : reviewer begins evaluation
    ReadyForReview --> ReadyForReview : Certifying Agent identifies blocking deficiencies; vendor notified
    UnderReview --> ChangesRequested : reviewer requests updates or clarification
    UnderReview --> Approved : reviewer approves
    UnderReview --> Rejected : reviewer rejects
    ChangesRequested --> UnderReview : vendor updates artifacts; reviewer resumes evaluation
    Approved --> [*]
    Rejected --> [*]

    note right of ReadyForReview
        Within this state, the Certifying Agent runs
        automatically (§7.7.2). Blocking deficiencies keep
        the submission here, visible only to the vendor.
        A clean result notifies/queues the reviewer with
        the Run Report attached, but the state stays
        "Ready for Review" - the reviewer still decides
        when to begin evaluation (Under Review is a pull,
        not an automatic transition).
    end note

    note right of UnderReview
        Live inspection/verification steps (§7.2, §7.3, §7.5)
        currently occur inside this state.
        OQ12 (§15): open question on whether a distinct
        Live Review / Pending Live Review state is needed.
    end note
```

Note the diagram enforces that **both** paths into "Ready for Review" require all required artifact types to be present — there is no transition that lets a vendor enter review early. The Certifying Agent's blocking-deficiency check (§7.7.2) is a finer-grained gate layered *within* "Ready for Review," not a separate state — it determines whether the reviewer is notified/queued, but the reviewer still decides when to actually begin evaluation, which is what triggers the move to "Under Review."

## 7.7.1 Submission Readiness Flow (resolves OQ8)

A vendor cannot transition a product into "Ready for Review" until all required artifact types have been added. The path leading up to that gate is a guided flow that prepares the vendor to submit artifacts correctly, rather than a bare pass/fail check at the end:

```mermaid
flowchart TD
    A[Vendor starts certification run] --> B["Platform displays required artifact checklist for the selected certification type / domain(s)"]
    B --> C[Platform shows format and content guidance per artifact type]
    C --> D[Vendor uploads an artifact]
    D --> E{Artifact type recognized and required?}
    E -- No --> F["Platform flags artifact as unrecognized or extra - vendor corrects"]
    F --> D
    E -- Yes --> G[Platform marks artifact type as present on checklist]
    G --> H{All required artifact types present?}
    H -- No --> I["Status - Submission Incomplete, missing artifacts listed"]
    I --> D
    H -- Yes --> J[Status automatically transitions to Ready for Review]
    J --> K["Reviewers notified - vendor cannot manually force this transition early"]
```

## 7.7.2 Automated Pre-Review Determination Gate (added 2026-08-13, resolves OQ13)

*(Sourced from a real Certifying Agent output for a Domain API v5 submission — see §15 OQ13 for provenance and open scope questions. This gate is content-level and runs after §7.7.1's presence-level gate has already been satisfied.)*

Reaching "Ready for Review" only confirms that all required artifact types are present (§7.7.1). It does not confirm the artifacts are internally consistent or that the vendor's endpoints actually match them. That second, content-level check is the Certifying Agent's job. It runs automatically while the submission is still "Ready for Review" and determines whether the reviewer is notified — it does **not** move the submission into "Under Review" itself; that transition is still the reviewer's own action (§7.7):

```mermaid
flowchart TD
    A[Automated validation run completes - §7.5] --> B["Certifying Agent compiles evidence: mapping, report, sample data, endpoint responses"]
    B --> C["Run per-area checks: mapping review, optional-field treatment, JSON payload review, report-to-payload comparison, dependency reconciliation"]
    C --> D{Blocking deficiencies identified?}
    D -- Yes --> E["Vendor notified of deficiencies; status remains Ready for Review, not yet visible to reviewer"]
    E --> F[Vendor revises artifacts]
    F --> A
    D -- No --> G["Status remains Ready for Review; reviewer notified and Run Report attached to their queue"]
    G --> H{Reviewer begins evaluation?}
    H -- Not yet --> G
    H -- Yes --> I["Status switches to Under Review (§7.7) - reviewer's own action, not automatic"]
```

This gate does not decide certification, and it does not decide when review starts either — it decides whether the submission is *fit to be shown to* a human reviewer at all. A "no blocking deficiencies" result surfaces the submission and its Run Report to the reviewer's queue; the reviewer still chooses when to begin evaluation, and still exercises full judgment once in "Under Review" (§5.4, §6, §7.7). This distinction is also what keeps the Certifying Agent's output from crossing into the "AI-generated recommendations" boundary in §12.

## 7.8 FT8: Notifications

**Goal:** Notify all users associated with a certification run of status-relevant events.

**"Decision Requiring Documentation" — Notification Requirements** (**confirmed 2026-08-10**): Notify all associated users when:
- Validation completes
- Validation fails
- Reviewer comments
- Artifact updates are requested — reviewer requests changes/clarification from the vendor
- Certification is approved
- Certification is rejected
- **Artifact Change** — distinct from the above: fires when a vendor actually replaces/updates an artifact during review (§7.4/§10.2). "Artifact updates are requested" and "Artifact Change" are two separate events, not a single generalized one — the former is the reviewer asking, the latter is the vendor acting.

**Review-in-progress indicator:** While a submission is in the "Under Review" state, the platform should display a status indicator to the vendor (e.g., on their certification dashboard) showing review is underway. This does **not** need to be a separate notification event — it's a persistent status indicator, not a point-in-time alert.

**Notification Trigger Diagram:** The seven events above are independent triggers — from the Vendor, the Reviewer, or the platform's own validation execution — that all resolve through the platform to the same "notify associated users" action, rather than a fixed sequence of steps. Shown as a use case view: actors as stadium nodes, each trigger as a use-case ellipse inside the "Notification System" boundary, and every one including a shared "Notify Associated Users" use case (Mermaid has no native UML use-case shape, so this is approximated with `flowchart`):

```mermaid
flowchart LR
    Vendor(["Vendor (Artifact Owner)"])
    Reviewer(["Reviewer (Decision Maker)"])
    Engine(["Validation Engine"])
    Users(["All Associated Users"])

    subgraph System["Notification System"]
        UC1((Validation Completes))
        UC2((Validation Fails))
        UC3((Reviewer Comments))
        UC4((Request Artifact Updates))
        UC5((Artifact Change))
        UC6((Approve Certification))
        UC7((Reject Certification))
        UC8((Notify Associated Users))
    end

    Engine --> UC1
    Engine --> UC2
    Reviewer --> UC3
    Reviewer --> UC4
    Reviewer --> UC6
    Reviewer --> UC7
    Vendor --> UC5

    UC1 -.include.-> UC8
    UC2 -.include.-> UC8
    UC3 -.include.-> UC8
    UC4 -.include.-> UC8
    UC5 -.include.-> UC8
    UC6 -.include.-> UC8
    UC7 -.include.-> UC8

    UC8 --> Users
```

## 7.9 FT9: Audit History

**Goal:** Retain a complete, reviewable audit trail for every certification run.

**"Decision Requiring Documentation" — Audit History Requirements** (feedback verbatim, implements §5.3's "audit history" platform responsibility): Retain:
- Certification submission date
- Validation results
- Validation execution history
- Uploaded artifacts
- Artifact version history
- Reviewer comments
- Reviewer identity
- Reviewer decision date
- Approval/rejection history
- **Mapping tool events** — added 2026-11-16 (§7.4): mapping workbook imported (with resolved / needs-target counts), mapping workbook rejected, mapping started from scratch, and mapping generated (version number, issue count, explained count).
- **Run Report** — added 2026-08-10, structure revised 2026-08-13 (§7.5, §7.7.2): the Certifying Agent's structured determination for an automated validation run — per-area PASS/FAIL/PASS WITH CLARIFICATION results, blocking deficiencies (if any), recommended reviewer note, and readiness decision — handed to the reviewer at the start of Under Review. Distinct from "Validation execution history" above (which is the raw execution log); the Run Report is the reviewer-facing comparison artifact and should be retained alongside it, not folded into it.

## 7.10 FT10: Intervention / MTSS Certification Workflow

*(Added 2026-08-13, sourced from the [Intervention/MTSS Certification Draft Use Cases and Resource Elements](https://edfi.atlassian.net/wiki/spaces/EDFICERT/pages/2413428742) Confluence page — that source is marked "Draft for Feedback," so scope here is provisional and should be revisited once it's finalized.)*

**Goal:** Enable certification of Intervention/MTSS products against the existing Ed-Fi Intervention Domain, establishing a baseline level of interoperability for publishing intervention definitions, student assignments, and participation/dosage data. This is a third certification model, distinct from SIS Certification (§7.2) and Domain API Certification (§7.3) (§5.2).

**Conditions of Satisfaction:**
- Vendor can publish and maintain intervention definitions (identifiers, delivery parameters, class, diagnosis, delivery method)
- Vendor can publish student intervention assignments, including assigned dosage and a diagnostic statement
- Vendor can publish session-level attendance/participation events, including delivered duration
- Platform can compare assigned dosage against delivered duration for fidelity tracking
- Vendor can associate staff with intervention delivery
- Vendor can recover from a simulated synchronization failure — restoring deleted records while preserving identifiers and relationships

**Required resources:** `Intervention`, `StudentInterventionAssociation`, `StudentInterventionAttendanceEvent`, `Student`, `Staff`, `EducationOrganization` (`Student`, `Staff`, and `EducationOrganization` may be read-only references from an existing Ed-Fi ODS, consistent with §5.5's artifact-ownership boundary).

**Not in scope for v1** (baseline interoperability only; deferred pending further Ed-Fi Intervention Domain/Data Standard support — same "deferred, not excluded" treatment as Renewal Workflows in §12/§13): intervention effectiveness/outcome measures, intervention goals/skills/progress-monitoring metrics, associations to assessments, MTSS tier data, exit reasons and lifecycle status beyond participation, engagement/fidelity indicators beyond attendance and duration, `InterventionPrescription`/`InterventionStudy` resources, and cohort-based assignment workflows (`Cohort`/`StudentCohortAssociation`).

**Intervention/MTSS Certification Sequence:** Artifact submission through automated validation of the required use cases, including the recovery scenario, to reviewer disposition:

```mermaid
sequenceDiagram
    actor Vendor as "Vendor (Artifact Owner)"
    participant Platform
    actor Reviewer as "Reviewer (Decision Maker)"

    loop Until all required artifacts are present
        Vendor->>Platform: Upload an artifact
        Platform->>Vendor: Status - Submission Incomplete, missing artifacts listed
    end

    Note over Platform: All required artifacts present
    Note over Platform: Status switches to Ready for Review

    Vendor->>Platform: Publish Intervention definitions
    Vendor->>Platform: Publish StudentInterventionAssociation records - assignment, dosage, diagnostic statement
    Vendor->>Platform: Publish StudentInterventionAttendanceEvent records - delivered duration
    Vendor->>Platform: Associate staff with intervention delivery

    loop For each required use case
        alt Use case validated successfully
            Note over Platform: Mark use case as checked
        else Use case fails
            Note over Platform: Flag use case as failed
        end
    end

    Note over Platform: Compare assigned dosage to delivered duration for fidelity tracking

    Note over Platform: Recovery scenario - platform removes a subset of previously published records
    Vendor->>Platform: Resubmit data, restore missing records, preserve identifiers
    Platform->>Platform: Verify relationships and data remain consistent after recovery

    Note over Platform: Scenarios complete, or a dependency fails
    Note over Platform: Certifying Agent gate runs (§7.7.2) - status stays Ready for Review

    Platform->>Reviewer: Present Run Report - use case status vs expectations
    Platform->>Vendor: Present Run Report - use case status vs expectations

    Reviewer->>Platform: Begin evaluation
    Note over Platform: Status switches to Under Review

    alt Results do not match expectations
        Reviewer->>Vendor: Request changes
    else Certification rejected outright
        Reviewer->>Vendor: Reject certification
    else Results match expectations
        Reviewer->>Vendor: Approve certification
    end
```

This mirrors §7.2's SIS sequence structure, with one addition specific to this certification model: a **recovery/resubmission check**, which validates that a vendor can restore deleted records and preserve identifier/relationship consistency after a simulated synchronization failure — a check not present in the SIS or Domain API flows.

---

# 8. Jobs To Be Done

*(Retained as supporting rationale for Section 7's features — each JTBD explains the "why" behind one or more FTs above.)*

## JTBD 1: Obtain Certification Environment → supports FT1
**When** a vendor begins certification, **I want** a certification environment provisioned automatically, **so that** I can immediately begin testing.
Signals: environment created automatically; credentials generated automatically; vendor access assigned automatically.
Notes: population state, ed-org/permissions needed, ODS/DMS version, single-tenant environment used.

## JTBD 2: Complete SIS Certification → supports FT2
**When** I am certifying my product, **I want** a guided certification workflow, **so that** I understand exactly what must be completed.
Signals: scenario status tracking; automated validation; certification progress visibility.

## JTBD 3: Complete Domain API Certification → supports FT3
**When** I select one or more domains to certify, **I want** the platform to identify required resources and endpoints, **so that** I understand my certification scope.
Signals: endpoint coverage identified; required resources identified; certification readiness visible.

## JTBD 4: Submit Certification Evidence → supports FT4, FT7
**When** I complete validation activities, **I want** to submit certification artifacts in a standardized format, **so that** reviewers can efficiently evaluate my certification.
Signals: consistent evidence structure; reduced back-and-forth; faster review cycles.
Artifacts to submit: mapping; sample data; score report (assessment) / sample report (domain). Vendors should be informed of the report so they can review/resubmit if necessary.

## JTBD 5: Review Certification Submission → supports FT6, FT9
**When** a vendor submits certification, **I want** a consistent set of artifacts and validation results, **so that** I can confidently approve or reject certification.
Signals: reduced manual investigation; standardized review process; faster certification decisions.

The expectation is to review a report similar to what the **Certifying Agent** outputs (JTBD 4 could feed this system). *Terminology reconciled 2026-08-13* (previously "Certification Agent" — renamed to match a real example output, §7.5/§7.7.2/§15 OQ13): the Certifying Agent compiles submitted evidence (mapping, report, sample data, endpoint responses) into a structured, per-area PASS/FAIL/PASS WITH CLARIFICATION determination and a readiness-to-proceed recommendation. It is rules-based evidence checking, not an AI recommendation or decision system, and it does not decide the certification outcome — that remains the reviewer's call (§5.4, §6, §7.7.2). This distinction is what keeps it consistent with §12 Out of Scope: AI-generated recommendations, despite producing something labeled a "recommendation."

Vendors should also have visibility into what's been submitted and where they stand in the process, so they can be proactive and resubmit if necessary.

## JTBD 6: Complete Intervention/MTSS Certification → supports FT10
*(Added 2026-08-13 alongside §7.10; numbered last because it postdates JTBD 1–5 rather than because it is lower priority.)*
**When** I am certifying an intervention/MTSS product, **I want** the platform to validate that I can publish and maintain intervention definitions, assignments, and participation data, **so that** I can demonstrate baseline interoperability against the Ed-Fi Intervention Domain.
Signals: required use cases tracked and validated; assigned-vs-delivered dosage comparison visible; recovery/resubmission scenario passes with identifiers and relationships preserved.

---

# 9. Scope

## SIS Certification
- **SIS v5:** Migration of SIS v4 certification scenarios to Data Standard v5.
- **SIS v6:** Next-generation SIS certification scenarios aligned with Data Standard v6.

## Domain API Certification
- **Domain API v5:** Certification of resources and endpoints within Data Standard v5 domains.
- **Domain API v6:** Certification of resources and endpoints within Data Standard v6 domains.

## Intervention / MTSS Certification
- **Intervention/MTSS v1:** Baseline interoperability certification against the existing Ed-Fi Intervention Domain — intervention definitions, student assignments, attendance/participation events, and dosage fidelity tracking (§7.10). Effectiveness ratings, MTSS tier data, progress-monitoring, and cohort-based workflows are deferred pending future Data Standard enhancements.

*(Certification model rules governing this scope — products vs. vendors, one active run per product, SIS/Domain non-substitutability — are defined once, in §5.2, rather than repeated here.)*

---

# 10. Workflow Assumptions

*(These mirror the feedback's "Workflow Assumptions" section verbatim. They are cross-cutting ground rules that recur across JTBD 4, JTBD 5, and FT4/FT7 above; they're stated once here rather than repeated at each occurrence.)*

## 10.1 Submission Model
- Vendors may submit incomplete certification packages.
- Missing artifacts should be clearly identified.
- Documentation must be present before review activities begin. **Resolved 2026-08-10 (§15 OQ8):** means all required artifact types collectively, not just the specific "documentation" artifact — operationalized in §7.7 as "all required artifact types must be present, even if individually incomplete" before entering "Ready for Review." See §7.7.1's flowchart for the guided path to that gate.

## 10.2 Artifact Updates
- Vendors may replace artifacts during review.
- Reviewers are notified when artifacts change.
- Reviewers do not upload artifacts on behalf of vendors.

*(Full detail at §7.4, FT4.)*

## 10.3 Review Process
- Reviewers review artifacts.
- Reviewers spot-check validation results.
- Reviewers then approve or reject.

*(Full detail at §5.4 and §7.6, FT6.)*

## 10.4 Vendor Visibility

*(Added from JTBD 5, §8: "Vendors should also have visibility into what's been submitted and where they stand in the process, so they can be proactive and resubmit if necessary." §10.1–10.3 state the rules from the platform/reviewer side; this states the corresponding rule from the vendor's side.)*

- Vendors can see submission and review status at any time — this is not a one-time confirmation but a persistent, checkable state (§7.7's status tracking; §7.8's review-in-progress indicator).
- Vendors are notified of the events that change their required actions (artifact updates requested, approval, rejection — §7.8), so they can act proactively rather than polling for status.
- Vendors are not blocked from resubmitting once a status change gives them something to act on — the "Changes Requested" and "Submission Incomplete" states above are for the vendor to close, not the platform.

**Vendor-Visible Submission-to-Resolution Loop:** §10.1–10.3's rules described independently, in one loop, from the vendor's point of view:

```mermaid
flowchart TD
    A[Vendor submits/updates artifacts - 10.1] --> B{All required artifact types present? - 10.1}
    B -- No --> C["Status visible to vendor: Submission Incomplete, missing artifacts listed"]
    C --> A
    B -- Yes --> D["Status visible to vendor: Ready for Review"]
    D --> E[Reviewer reviews artifacts and spot-checks validation results - 10.3]
    E --> F{Reviewer decision}
    F -- Requests changes/clarification --> G["Status visible to vendor: Changes Requested"]
    G --> H[Vendor replaces/updates artifacts - 10.2]
    H --> I[Reviewer notified of Artifact Change - 10.2]
    I --> E
    F -- Approves --> J["Status visible to vendor: Approved"]
    F -- Rejects --> K["Status visible to vendor: Rejected"]
```

*(This is the same state model as §7.7's diagram and the same gate as §7.7.1's flowchart, redrawn here to make the vendor-visibility rule in this section concrete rather than abstract.)*

---

# 11. Nice to Have

- **Mapping review automation** — would assist, not replace, reviewer judgment (per confirmed reviewer decision authority, §5.4/§6).
- **Semantic validation automation** — would assist, not replace, reviewer judgment. Relates to §15 OQ6 (how much semantic validation can be automated).

---

# 12. Out of Scope

*(Feedback verbatim list; §15 OQ11 flags the one place Rev 3 added a characterization not stated by the feedback.)*

- **Authoring artifact content on a vendor's behalf** *(revised 2026-11-16, was "Artifact generation")*. The platform and reviewers do not author artifact content on a vendor's behalf — no auto-mapping, no reviewer edits. Platform-provided authoring tools in which the vendor makes every choice (§5.5, §7.4 Assessment Mapping Tool) are in scope.
- **AI-generated recommendations.** The platform does not produce AI-generated certification recommendations — i.e., no automated approve/reject judgment. The Certifying Agent (JTBD 5, §7.5, §7.7.2) is a non-AI, rules-based evidence checker; its "readiness to proceed" output is not a certification recommendation and is not affected by this boundary. See §15 OQ13 for the open question on how far this distinction can be pushed before it needs reviewer re-confirmation.
- **Certification confidence/risk scoring.** The platform does not produce a computed confidence or risk score for a submission.
- **Renewal workflows.** Out of scope for the current release, **deferred** (confirmed 2026-08-10) — not a permanent exclusion. Tracked separately under "Automated Re-Certification" in Future Enhancements (§13). Renewal is expected to closely resemble the original certification workflow, so the deferral is a sequencing decision rather than a signal that a materially different workflow needs to be designed later.
- **Certification governance/version management workflows.** Governance of certification requirements remains owned by the Product Owner outside the platform (§5.1); the platform implements but does not govern.

---

# 13. Future Enhancements

| Enhancement | Details |
| --- | --- |
| Certification Registry Integration | Automated publication of certification results. |
| Vendor Self-Service Registration | Allow vendors to create and manage certification accounts. |
| Automated Re-Certification | Support certification renewal workflows. Deferred, not excluded (§12) — expected to closely resemble the original certification workflow rather than requiring a distinct design. |
| Certification APIs | Provide Admin API endpoints for certification operations. |
| Deployable Certification Packages | Support deployment to Data Hubs, SEAs, ESAs, MSPs. |
| State-Specific Certification Programs | Enable state-level certification extensions. |

*(See also §11, Nice to Have, for mapping/semantic validation automation.)*

---

# 14. Non-Functional Requirements

## Security
| Requirement | Details |
| --- | --- |
| Secure credential generation | Credentials are generated and stored following the same secure practices as existing Admin App/API credential issuance (§7.1, §5.3). |
| Audit logging | See §7.9, FT9: Audit History, for the specific retained data set. |
| Role-based authorization | Access to certification functions (vendor, reviewer, platform admin) is scoped by role, consistent with the platform/reviewer ownership split in §6. |
| Tenant isolation | Each vendor's certification environment is isolated within its own single-tenant environment (§7.1), preventing cross-vendor data exposure. |

## Scalability
| Requirement | Details |
| --- | --- |
| Support concurrent certification activities | Multiple certification runs across different vendors/products must execute in parallel without contention — only one active run per product is allowed, but many products may certify simultaneously (§5.2). |
| Support multiple active environments | The platform must provision and manage many concurrent single-tenant environments (§7.1) as certification volume grows. |

## Extensibility
| Requirement | Details |
| --- | --- |
| Additional certification types | The workflow model (§7.7) and validation engine (§7.5) should accommodate certification types beyond SIS, Domain API, and Intervention/MTSS without redesign. Intervention/MTSS (§7.10) is the first test of this — it was added as a third model reusing the same states, gates, and Run Report structure. |
| Additional Data Standard versions | Scope already spans v5 and v6 (§9); the platform should support future Data Standard versions through configuration rather than rework. |
| Domain expansion | New domains beyond the initial set (starting with Assessments, §7.4) should be addable without changing the underlying certification workflow. |

## Maintainability
| Requirement | Details |
| --- | --- |
| Scenario updates should not require code changes where possible | Certification scenarios, required artifacts, and resource/endpoint requirements should be data/configuration-driven rather than hardcoded, so staff can update them without a deployment. |
| Validation rules should be versioned | Validation rules must be versioned alongside Data Standard versions so results remain traceable to the rule set that produced them (§7.5). |

---

# 15. Open Questions

| ID | Question | Answers / Notes |
| --- | --- | --- |
| 1 | Should Domain API automation be driven by sample data? | Open. |
| 2 | Do Admin and Security databases require isolated environments? | Open. |
| 3 | What is the authoritative source of certification definitions? | **Resolved** — see §5.1. |
| 4 | Can certification definitions be generated from Data Standard metadata? | Open. |
| 5 | Should vendors self-register? | Open (see §13, Vendor Self-Service Registration). |
| 6 | How much semantic validation can be automated? | **Partially resolved** — baseline is manual reviewer evaluation (§5.4); automation is Nice to Have only (§11), assisting rather than replacing judgment. |
| 7 | What is the standard format for mappings, reports, and sample data? | Open. |
| 8 | Does "documentation must be present before review activities begin" (feedback, Submission Model) mean the specific "documentation" artifact type, or all required artifact types collectively? | **Resolved 2026-08-10** — means all required artifact types collectively; a vendor cannot enter "Ready for Review" until every required artifact type is present. See §7.7.1 flowchart. §10.1 carried an "unconfirmed" note past this resolution date; corrected 2026-08-11 to match. |
| 9 | What should the entry/exit criteria be for each workflow state (In Progress, Submission Incomplete, Ready for Review, Under Review, Changes Requested, Approved, Rejected)? | **Resolved 2026-08-10** — see state diagram in §7.7. |
| 10 | Should "artifact replaced/updated by vendor during review" be added as an explicit 7th event in the Notification Requirements list (§7.8), or is it already covered by the general Artifact Updates notification rule? | **Resolved 2026-08-10** — added as a distinct "Artifact Change" event, separate from "Artifact updates are requested" (§7.8): the requested-update event fires when the reviewer asks for changes; the Artifact Change event fires when the vendor actually makes a change. A persistent "review in progress" status indicator is also required but does not need its own notification event. |
| 11 | Is "Renewal workflows" out of scope permanently, or deferred to a future release (tracked as "Automated Re-Certification," §13)? | **Resolved 2026-08-10** — deferred, not excluded (§12/§13); expected to closely resemble the original certification workflow. |
| 12 | Should the workflow state model (§7.7) have a distinct "Live Review" or "Pending Live Review" state for the reviewer's live inspection/verification step (§7.2's live inspection, §7.3's live PUT/POST verification, §7.5's "schedule live session" disposition), separate from the general "Under Review" state? | Open — raised 2026-08-10 while diagramming §7.2's SIS certification sequence; recurs in §7.3's domain certification sequence and §7.5's validation engine sequence, where scheduling a live session implies a waiting period not currently modeled by any state. |
| 13 | Is "Certifying Agent" the right permanent name for this capability, and does "blocking deficiencies" need its own vocabulary distinct from workflow states? Also: should the "no blocking deficiencies" gate (§7.7.2) ever be allowed to notify/queue the reviewer automatically for *some* certification types, or should it always require this same manual-pull model? | Open — raised 2026-08-13 after reviewing a real Certifying Agent output (a Tomorrow Today Domain API v5 "Certification Reviewer Determination" report for `studentCTEProgramAssociations`). §7.5/§7.7.2 now model "Ready for Review" as a single state throughout: the Certifying Agent gate only controls whether the reviewer is notified/queued; the reviewer still decides when to begin evaluation, which is what triggers "Under Review" — consistent with the original feedback-verbatim state list and with §5.4/§6's reviewer-authority model. Not yet confirmed against the source Confluence process the sample came from. |

**Still open beyond this table** (sub-questions not yet promoted to their own IDs):
- **From OQ1/§7.3** — whether resources, endpoints, or sample data (or a combination) should drive Domain API certification requirements.
- **From OQ5/§13** — whether Vendor Self-Service Registration intersects with the vendor/product/certification-run model in §5.2.
- **From OQ13/§7.5** — whether dependency reconciliation (e.g., validating a referenced `Program` resource alongside `studentCTEProgramAssociations`) should be formalized as a general pattern for every domain resource with references, rather than documented ad hoc per resource.
- **From §7.10** — Intervention/MTSS scope is provisional; the source Confluence page is still "Draft for Feedback," so the v1 in-scope/deferred split needs re-confirmation once that page is finalized.

---

# 16. Enterprise Architecture

## Core Components
- **Admin App** — administrative interface and provisioning workflows.
- **Admin API** — automation and platform integration.
- **Certification Platform** — coordinates certification workflows.
- **Validation Engine** — executes automated validations.
- **Artifact Store** — stores mappings, reports, sample data, validation results.
- **Hosted Certification Infrastructure** — the single-tenant certification environments (§7.1), provisioned on the same hosted Ed-Fi infrastructure used by other tenants rather than on separate certification-specific infrastructure (§2, Administrative Tooling Alignment).

---

# 17. Success Metrics

## Operational Metrics
Reduction in certification provisioning time; reduction in reviewer effort; reduction in certification support requests.

## Vendor Metrics
Faster certification completion; improved vendor satisfaction; reduced certification remediation cycles.

## Platform Metrics
Increased certification throughput; reduced dependency on Sandbox Admin; increased automation coverage.

---

# Appendix A: Potential Architecture Decisions

1. Certification Artifact Model — must account for artifacts belonging to products (not vendors directly), with a vendor able to own multiple products, and only one active certification run per product (§5.2).
2. Scenario Definition Framework
3. Domain Metadata Management
4. Certification Registry Integration
5. Shared vs Isolated Environment Model
6. Admin App / Admin API Integration Boundaries

---

# Appendix B: Glossary

| Term | Description |
| --- | --- |
| Certification Run | A single certification attempt for a **product** (not a vendor). Only one active run per product at a given time (§5.2). |
| Certification Artifact | Mapping, report, sample data, or validation result submitted during certification. Vendor-owned (§5.5). |
| Domain Certification | Certification against one or more Ed-Fi domains; may cover a single domain or multiple domains in one submission. |
| SIS Certification | Certification against SIS workflows and scenarios. Distinct from Domain Certification — not substitutable (§5.2). |
| Validation Engine | Component responsible for executing automated certification checks. |
| Certifying Agent | Platform capability (renamed 2026-08-13 from "Certification Agent") that compiles submitted evidence into a structured, per-area PASS/FAIL/PASS WITH CLARIFICATION determination and readiness-to-proceed recommendation. Rules-based, not AI; does not decide certification outcome (§5.4, §7.5, §7.7.2). |
| Run Report | The Certifying Agent's output artifact: per-area determination, blocking deficiencies, recommended reviewer note, clarification questions, and readiness decision (§7.5). Retained under Audit History (§7.9). |
| Blocking Deficiency | A content-level problem found by the Certifying Agent that keeps a submission from being surfaced to a reviewer. It is *not* a workflow state — the submission stays in "Ready for Review" and is visible only to the vendor until the deficiency list is empty (§7.7.2). Naming is open, §15 OQ13. |
| Intervention/MTSS Certification | Third certification model (§7.10), scoped to the existing Ed-Fi Intervention Domain. Provisional pending finalization of its source requirements (§5.2). |
| MTSS / Interventions | Multi-Tiered System of Supports. Refers to Intervention/MTSS Certification, a third certification model scoped to the existing Ed-Fi Intervention Domain, covering intervention definitions, student assignments, and attendance/participation data (§5.2, §7.10). |
