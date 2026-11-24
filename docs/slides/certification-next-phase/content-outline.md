# Certification Automation, Next Phase: Content Outline

What the deck (`certification-next-phase.pptx`) presents, slide by slide: the
main message, the supporting points, and the talking points from the speaker
notes. Sources: [Admin App 4.2](../../PRD-AdminApp-v4.2.md),
[Automation Platform](../../PRD-Automation-Platform.md),
[Bruno Assertion Model Generator](../../PRD-Bruno-Assertion-Model-Generator.md).

Drafted with AI assistance. Review before presenting, and say AI helped prepare
it.

**Purpose of the deck:** explain why the certification work is being split into
three PRDs, what each one covers, how they connect, and what decisions are still
open.

---

## Section 1: Where we are

### 1. Title: Next phase: three concerns, three PRDs

- Covers Admin App 4.2, the Automation Platform, and the Bruno Assertion Model
  Generator.
- Draft for discussion, prepared with AI assistance.
- **Talking point:** the three PRDs build on the shipped MVP. They separate
  product changes, cloud infrastructure and Assessments business logic.

### 2. The MVP shipped with SIS v5 only

- **Shipped:**
  - SIS v5 scenarios, checked one step at a time
  - sending a run to review; approve, reject or request changes
  - the Ed-Fi staff dashboard and the vendor's My products page
  - expected vs. observed values and response snapshots
  - collections pinned to a tagged release
- **Not yet built:**
  - MTSS and Assessments (scripts in active development)
  - artifact upload
  - run history
  - Entra ID sign-in
  - hosting and deployment
- **Talking point:** everything not yet built is picked up by one of the three
  PRDs.

### 3. What shipped becomes the baseline

| Topic | MVP PRD said | As built, now the requirement |
| --- | --- | --- |
| Product | The application record | A data store plus a certification model |
| Review unit | A submission | The run |
| Review flow | Ready for Review, then decision | Adds a reviewer pick-up step |
| Collections | Promoted tag plus commit SHA | Tagged release plus checksum |
| Gate | Failures may go to review | Every scenario must pass |

- Gaps carried forward: artifacts, MTSS, Assessments, run history, Entra ID,
  hosting.
- **Talking point:** the 4.2 PRD's 24-row reconciliation table marks each
  difference as accepted, or as a gap with an owner. The Confluence MVP PRD gets
  a pointer to it, not a rewrite.

## Section 2: The approach

### 4. Why split the work

- **Message:** one document mixed product features, infrastructure and
  Assessments logic.
- Vendor files showed that Assessments logic varies too much from vendor to
  vendor to build into the platform.
- **Talking point:** a vendor that followed the published template exactly was
  still rejected. Deriving expected responses in the platform would mean coding
  in every template variation.

### 5. Three concerns, three PRDs

- **Generator PRD:** an offline tool run by an Ed-Fi representative.
- **The contract:** a Bruno collection with endpoints, parameters and expected
  responses.
- **Admin App 4.2 PRD:** runs, review and decisions.
- **Automation Platform PRD:** underneath everything: hosting, identity, vendor
  environments, run execution, artifact storage.
- **Talking point:** the collection is the only thing the generator and Admin
  App have to agree on.

### 6. The Bruno collection joins the two systems

- **What it carries:**
  - the endpoints to call, in a fixed order
  - the parameters for each request
  - the expected response for each record
  - which fields are checked, and how values are compared
  - a manifest and a readiness report
- **How Admin App runs it:**
  - unchanged, exactly as uploaded
  - Admin App supplies the API address and access token
  - it uses the Bruno CLI version pinned in the manifest
  - results are sorted by result kind
- **Talking point:** the generator PRD owns the contract (terms C1–C11). The
  token never lands in a file, and contract changes are versioned on both sides.

## Section 3: What each PRD covers

### 7. Admin App 4.2: MTSS gates the release; Assessments follows fast

- **Must have:**
  - MTSS runs, using the same model as SIS
  - run history per product
  - raw step output
  - activity timeline (may slip)
- **Fast follow:**
  - reworked Request Certification, with an Assessments walkthrough
  - versioned product artifacts
  - Assessments runs with an expected-values preview
- **Nice to have:**
  - first-time vendor walkthrough
  - reviewer option to skip a result
- **Talking point:** 4.2 ships on today's setup. Artifacts are Assessments-only,
  and every check must pass before review, for every model.

### 8. Bruno scripts workstream

- Six MTSS scenario groups in the certification-testing repo:
  - Intervention
  - Student intervention association
  - Attendance events
  - Assigned vs. delivered dosage
  - Staff association (two paths)
  - Recovery and resubmission
- They're released under one tag with SIS, and Admin App picks them up the same
  way.
- **Talking point:** two model-neutral conventions are needed: alternative paths
  the vendor chooses between, and destructive steps that ask the vendor to
  confirm.

### 9. Automation Platform: scale out environments, shrink the VM

- **Must have:**
  - vendor ODS environments in their own containers
  - one-action provisioning during onboarding
  - idle environments scale to zero (configurable)
  - a smaller, always-on Admin App VM
  - Entra ID sign-in, with Keycloak kept for local use
  - Blob artifact storage, and runs in job containers
  - GitHub Actions with infrastructure as code
- **Nice to have:** Admin App itself on Container Apps.
- **Stretch:** vendor-hosted environments.
- **Deferred:** automatic environment deletion.
- **Talking point:** this runs in parallel and never blocks 4.2. Bicep is
  recommended, not required. Ed-Fi still runs every environment.

### 10. Generator: the representative confirms; the tool generates

1. **Resolve:** read the vendor's mapping and sample files, in any template
   layout.
2. **Review:** the pre-certification conversation, live or offline, with AI
   optional. A person confirms every key.
3. **Generate:** a deterministic collection, readiness report and manifest.

- It works out endpoints, ed-orgs and students, parameters, expected responses
  and checked fields.
- Every value records where it came from. The representative uploads the
  collection.
- **Talking point:** Assessments only for now. Assessment items are deferred,
  but must be addable by extending the tool.

## Section 4: Path, outcomes and sequencing

### 11. The vendor's path: only Assessments has a generated collection

- **SIS and MTSS:** Request certification → Load data → Run the fixed
  collection → Review → Decision.
- **Assessments:**
  1. Request certification
  2. Share mapping and samples
  3. Pre-certification conversation
  4. Representative uploads collection
  5. Load data
  6. Run
  7. Review
  8. Decision
- **Talking point:** steps 1–4 come before the vendor can run anything. The
  walkthrough shows the vendor where they are.

### 12. What this enables

- **Extensible SIS and MTSS,** through Bruno scripts in the certification repo.
- **Readiness before certification,** with Assessments checked outside the
  platform.
- **Tailored domain runs,** with endpoints, parameters and assertions set by the
  contract.
- **Lower cloud costs,** because environments scale out instead of growing the
  VM.

### 13. Sequencing: one gate, two parallel efforts

- **Admin App 4.2:** ships when MTSS works, on today's setup.
- **Assessments and generator:** a parallel fast follow, joined by the contract.
- **Automation Platform:** parallel from the start, as soon as possible. It
  never blocks 4.2.
- The bars show order and overlap, not dates.

## Section 5: Decisions and reference

### 14. Open decisions: what we need from you

- **Admin App and generator:**
  - Are recovery deletions performed by the vendor or by Ed-Fi?
  - How do vendors reach their representative?
  - Which AI provider, if any, for vendor files?
  - Where do representatives keep sessions and files?
- **Platform:**
  - Which Ed-Fi role provisions environments?
  - What's the default idle period before scale to zero?
  - ODS/API, DMS, or both, for environments?
  - What runs on the VM today, and what does it cost?
- **Talking point:** choosing an AI provider and setting up any new credentials
  go through Ed-Fi's standard approval process.

### 15. Appendix: gaps and where they went

| MVP PRD item | As built | Now owned by |
| --- | --- | --- |
| Artifact upload | Not built | Admin App 4.2, fast follow (Assessments only) |
| MTSS scenarios | Not built | Admin App 4.2, must have, plus scripts |
| Assessments validation | Not built | Generator, then Admin App runs it |
| Run history | Latest run only | Admin App 4.2, must have |
| Certification audit trail | Generic audit log | Admin App 4.2 activity timeline |
| Entra ID sign-in | Generic OIDC | Automation Platform |
| Environment provisioning | By hand | Automation Platform |

Full 24-row table: Admin App 4.2 PRD, section 2.2.
