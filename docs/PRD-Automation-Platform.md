# Certification Automation Platform: Hosting and Infrastructure PRD

**Status:** Draft for review \
**Owner:** _TBD_ \
**Primary audience:** The team building and operating the hosted certification
platform. \
**Companion PRDs:** [Admin App 4.2](./PRD-AdminApp-v4.2.md),
[Bruno Assertion Model Generator](./PRD-Bruno-Assertion-Model-Generator.md) \
**Supersedes:** The hosting and infrastructure parts of the
[Certification Automation Platform MVP PRD](./PRD-Platform-Automation-MVP.md)
(§3.1, §4, D3, D4, D6, FR1, FR4) and §7.1 FT1 of the
[parent PRD](./PRD-Certification-v2.md).

> Drafted with AI assistance. Review before relying on it, and disclose AI use
> when sharing it.

---

# 1. Overview

Admin App's certification module shipped as an MVP that runs SIS v5
certification. Hosting did not ship with it:
- Vendors sign in through generic OIDC (Keycloak in the reference setup).
- Certification data stores are provisioned by hand.
- Bruno runs inside the Admin App API process.
- There is no deployment pipeline or infrastructure-as-code in the repository.

This PRD covers the platform under the certification module:
- where it runs
- how it is built and deployed
- how people sign in
- how vendor environments are created, scaled and removed
- where runs execute
- where uploaded artifacts are stored

It does not cover product features (Admin App 4.2 PRD) or the Assessments
business logic (generator PRD).

**Relationship to Admin App 4.2.** 4.2 ships on today's setup. This work runs in
parallel and aims to finish as soon as possible. Nothing in 4.2 waits for it.
Where 4.2 needs something from the platform (for example artifact storage),
4.2 states a fallback.

---

# 2. Purpose

- **Lower cloud cost.** Today, more vendors means a bigger VM. Moving vendor
  ODS environments into their own containers that scale out, and stopping them
  when idle, makes cost follow use.
- **Less reliance on Keycloak.** The hosted product signs in through Entra ID.
- **Repeatable deployment.** The hosted Admin App is built and deployed from
  source through a pipeline, not by hand.
- **Faster onboarding.** An Ed-Fi administrator provisions a vendor's
  environment in one action, not the manual sequence in the parent PRD's FT1.
- **Safe, scalable run execution.** Runs leave the API process, so many vendors
  can run at once without crowding the API.

---

# 3. Current State

> **Placeholder, to be filled in by the platform owner:** what runs on the
> certification VM today (Admin App API and front end, Keycloak, database, each
> vendor's ODS/API or DMS, and so on), its size, and its monthly cost. This is
> the baseline for the cost goal in §11.

What the repository shows (`main`, commit `8401c92`):

- Admin App API and front end have Dockerfiles. `compose/` runs them locally
  with Keycloak and nginx.
- `dms/` starts a local DMS from published images. It is for development only.
- Bruno runs are spawned by the API process (`runner/bruno-cli.ts`), at most two
  at a time per instance, with a 45-second timeout. The token goes in through
  an environment variable.
- Bruno collections are downloaded from a tagged certification-testing release
  when the API starts.
- No Azure, Bicep, Terraform or Helm files exist.

---

# 4. Scope

| Area | Priority |
| --- | --- |
| Vendor ODS environments in their own containers (§7.1) | Must have |
| Environment lifecycle: provision, scale to zero, manual delete (§7.2) | Must have |
| Automatic deletion rules | Deferred |
| Smaller, always-on Admin App host (§7.3) | Must have |
| Entra ID sign-in (§7.4) | Must have |
| Artifact storage (§7.5) | Must have |
| Build and deployment pipeline (§7.6) | Must have |
| Run execution in job containers (§7.7) | Must have |
| Operations: monitoring, alerts, backups, security review (§7.8) | Must have |
| Admin App itself on Azure Container Apps or similar (§8) | Nice to have |
| Vendor-hosted environments (§9) | Stretch goal |

---

# 5. Personas

- **Ed-Fi Platform Administrator.** Provisions environments while onboarding
  vendors, and watches cost and health. Main user of this PRD's features.
- **Platform Operator / DevOps.** Owns the pipeline, infrastructure, monitoring
  and incident response.
- **Vendor Integration Engineer.** Never sees the infrastructure directly. They
  notice it when an environment is starting up, or when a run fails for
  infrastructure reasons.
- **Certification Reviewer.** Relies on evidence surviving after an environment
  is deleted.

---

# 6. Decisions

| # | Decision |
| --- | --- |
| P1 | **Azure** hosts the platform (carries MVP D3). |
| P2 | **Ed-Fi runs every certification environment** (carries MVP D6). Vendors cannot point the platform at their own instance in this scope. Vendor-hosted environments are a stretch goal (§9). |
| P3 | **Each vendor environment runs in its own containers**, separate from the Admin App host. Capacity grows by adding containers, not by growing the VM. |
| P4 | **Provisioning is one administrator action, with no vendor-facing request.** An Ed-Fi Platform Administrator provisions directly while onboarding a vendor; the request itself is handled outside Admin App. The platform creates the environment, tenant, data store and application credentials in one operation. Ed-Fi still onboards vendors (MVP D7). |
| P5 | **Idle environments scale to zero and keep their data.** They start again on the next sign-in or run. The idle period is configurable. |
| P6 | **Automatic deletion is deferred.** In this scope, an Ed-Fi Platform Administrator deletes environments by hand. Evidence lives in Admin App, so deleting an environment loses none. |
| P7 | **The Admin App host stays always on, and gets smaller.** The ODS load moves out (P3). |
| P8 | **Entra ID is the identity provider for the hosted product**, through Admin App's existing generic OIDC support. Keycloak remains supported for local development and self-hosted Admin App. "Less reliance" means production no longer needs it, not that it is removed. |
| P9 | **Artifacts live in Azure Blob Storage**, encrypted at rest. Metadata and checksums live in the Admin App database. Only the Admin App API reads or writes them. |
| P10 | **Infrastructure is code**, deployed by GitHub Actions to dev, staging and prod. Prod deploys need a manual approval. The tool is the builder's choice; **Bicep is recommended**, because the platform is Azure-only. |
| P11 | **Runs execute in short-lived job containers, one job each.** The token is passed in as a secret, never on a command line or in a log. This replaces in-process execution for the hosted product. |
| P12 | **A security review is required before vendors get access** (carries MVP §4). |

---

# 7. Requirements

## 7.1 Vendor Environments in Containers

- **PR-ENV-1:** A certification environment SHALL be an ODS/API or DMS
  deployment, with its own database, running in containers separate from the
  Admin App host. The container service is likely Azure Container Apps; the
  final choice is left to the builder.
- **PR-ENV-2:** Each environment SHALL be isolated per vendor team. One vendor's
  environment SHALL NOT be reachable with another vendor's credentials.
- **PR-ENV-3:** Admin App SHALL connect to each environment as a remote
  environment through its existing environment and Admin API integration. No
  certification-specific connection path.
- **PR-ENV-4:** Environments SHALL run a data model of 5.0.0 or later, so Admin
  App's certification support check passes.
- **PR-ENV-5:** The data standard version and ODS/API or DMS image version
  SHALL be selectable from an approved list at provisioning time.

## 7.2 Environment Lifecycle

- **PR-LIFE-1 Provision:** While onboarding a vendor, an Ed-Fi Platform
  Administrator SHALL be able to create the following with one action and
  associate them with the vendor's team:
  - the environment's containers and database
  - the Admin App environment and tenant records
  - the data store
  - application credentials
- **PR-LIFE-2:** Provisioning SHALL report progress and SHALL either complete
  or roll back cleanly. A partial environment SHALL NOT be left associated
  with a team.
- **PR-LIFE-3 Scale to zero:** An environment with no activity for the idle
  period (configurable, `CERT_ENV_IDLE_PERIOD`) SHALL stop its compute and keep
  its data. Activity means an API request or a run.
- **PR-LIFE-4 Resume:** A stopped environment SHALL start on the next vendor
  sign-in to that team, or on the next run. Admin App SHALL show a visible
  "starting up" state, and a run SHALL wait for the environment rather than
  fail.
- **PR-LIFE-5 Delete:** An Ed-Fi Platform Administrator SHALL be able to delete
  an environment. Admin App SHALL warn if any product on it has an open run.
  Automatic deletion rules are deferred (P6).
- **PR-LIFE-6:** Before deletion, run results, snapshots, raw output, comments,
  artifacts and audit records SHALL already be in Admin App's own database and
  storage. Deletion SHALL NOT remove any of them.
- **PR-LIFE-7:** Provisioning, stop, resume and deletion SHALL be recorded with
  actor and timestamp.
- **PR-LIFE-8:** Ed-Fi staff SHALL see every environment's state (running,
  stopped, starting), its team and its last activity.
- **PR-LIFE-9:** The Admin App screens for PR-LIFE-4 and PR-LIFE-8 belong to
  this PRD, not to Admin App 4.2. They ship with the platform work.

## 7.3 Admin App Host

- **PR-HOST-1:** The Admin App API and front end SHALL stay always on.
- **PR-HOST-2:** Once vendor environments have moved out (§7.1), the host SHALL
  be resized to Admin App's own needs. Target size is set against the §3
  baseline.
- **PR-HOST-3:** The Bruno collection download at API start SHALL fail startup
  in the hosted product if it fails, rather than only logging a warning. A host
  that can't run certification SHALL NOT appear healthy.

## 7.4 Identity

- **PR-ID-1:** Vendors and Ed-Fi staff SHALL sign in to the hosted Admin App
  through Entra ID, using Admin App's existing OIDC support. Vendors are
  invited as guest or external identities, by the Entra ID tenant's policy.
- **PR-ID-2:** Admin App's machine (client credentials) token handling SHALL be
  verified against Entra ID-issued tokens. Any gap SHALL be logged as follow-up
  work (carries v4.1 FR-AUTH-6 to FR-AUTH-8).
- **PR-ID-3:** Keycloak SHALL remain a supported provider for local development
  and self-hosted deployments.
- **PR-ID-4:** Entra ID tenant and app registration setup is an Ed-Fi
  dependency (§10). It goes through Ed-Fi's normal approval process.

## 7.5 Artifact Storage

- **PR-ART-1:** Uploaded artifacts SHALL be stored in Azure Blob Storage,
  encrypted at rest, under a path per product, artifact type and version.
- **PR-ART-2:** The Admin App database SHALL hold each artifact's metadata:
  product, type, version, uploader, time, size and SHA-256.
- **PR-ART-3:** Blobs SHALL NOT be publicly reachable. Downloads go through the
  Admin App API, which checks authorization.
- **PR-ART-4:** Artifact versions SHALL never be overwritten. Retention SHALL be
  at least as long as run evidence is kept.
- **PR-ART-5:** Storage SHALL be behind an interface, so self-hosted Admin App
  can use local or database storage.

## 7.6 Build and Deployment

- **PR-CD-1:** GitHub Actions SHALL build and test the Admin App images and
  publish them to a registry, tagged by commit and release.
- **PR-CD-2:** All Azure resources SHALL be defined as infrastructure-as-code in
  source control (Bicep recommended, not required).
  No hand-made production resources.
- **PR-CD-3:** There SHALL be dev, staging and prod environments. Prod deploys
  SHALL need a manual approval.
- **PR-CD-4:** Database migrations SHALL run as a step in the deployment, and a
  failed migration SHALL stop the deploy.
- **PR-CD-5:** Secrets (database, OIDC client, encryption keys) SHALL come from
  Azure Key Vault, not from pipeline variables or images.
- **PR-CD-6:** Changing the certification-testing release tag
  (`CERT_BRUNO_SRC_REF` with `CERT_BRUNO_SRC_CHECKSUM`) SHALL be a configuration
  change, deployable without a code change. Releases still used by open runs
  SHALL stay available to the API and run jobs (Admin App 4.2
  FR-CERT-HIST-5).

## 7.7 Run Execution

- **PR-RUN-1:** Each run of a step (SIS, MTSS) or a collection (Assessments)
  SHALL execute in its own short-lived container, from an image holding the
  pinned Bruno CLI version and the collection.
- **PR-RUN-2:** The run's token SHALL be passed as a secret, and SHALL NOT
  appear in command lines, container logs, raw output or metrics.
- **PR-RUN-3:** The container SHALL reach only the target environment. No other
  network access.
- **PR-RUN-4:** Many runs across vendors SHALL be able to execute at once. Admin
  App's rule of one open run per data store per model still applies.
- **PR-RUN-5:** Run timeouts SHALL be configurable per model. A whole
  Assessments collection takes longer than one SIS step.
- **PR-RUN-6:** An infrastructure failure (container failed to start, timeout,
  environment unreachable) SHALL be reported to Admin App as distinct from a
  check failure.
- **PR-RUN-7:** For an Assessments collection, the job SHALL run the Bruno CLI
  version pinned in the collection's manifest.

## 7.8 Operations

- **PR-OPS-1:** Logs and metrics from the Admin App host, run jobs and
  environments SHALL go to Azure Monitor, so these system logs are kept
  separate from Admin App's certification timeline.
- **PR-OPS-2:** There SHALL be alerts for:
  - provisioning failures
  - run infrastructure failures
  - an environment that fails to resume
  - the collection download failing
  - cost passing a set budget
- **PR-OPS-3:** The Admin App database SHALL be backed up nightly, with a
  documented, tested restore. Environment databases need no backup, because
  evidence lives in Admin App.
- **PR-OPS-4:** A security review SHALL be completed before vendor access
  (P12). It covers token hand-off to run jobs, artifact storage access, network
  isolation between vendor environments, and Entra ID setup.

---

# 8. Nice to Have: Admin App on Container Apps

- Run the Admin App API and front end on Azure Container Apps or similar,
  instead of a VM, so it scales like the rest of the platform.
- If done, PR-HOST-1 (always on) still holds: at least one instance stays
  running.

---

# 9. Stretch Goal: Vendor-Hosted Environments

Not committed. Recorded so the design does not rule it out.

- A vendor would register their own ODS/API or DMS base URL, key and secret.
- The vendor would let the platform's published outbound IP addresses through
  their firewall.
- The data model 5.0.0+ check would run before the environment is accepted.
- Every run would show whether it ran on an Ed-Fi-hosted or vendor-hosted
  environment.
- **Open:** can a vendor-hosted run be sent to review? The lean is **no, trial
  runs only**: Ed-Fi can't verify what a vendor-hosted instance really is (for
  example, a stub returning expected answers), and that undermines the audit
  claim.

---

# 10. Dependencies (Ed-Fi-owned)

| Dependency | Why it blocks |
| --- | --- |
| Azure subscription and budget | Nothing runs without it. |
| Entra ID tenant, app registration, guest-access policy | Sign-in (§7.4). |
| Security review | Vendor access (P12). |
| Approved ODS/API and DMS images and versions | Provisioning (PR-ENV-5). |

Creating credentials, app registrations or API keys for any of these goes through
Ed-Fi's standard technology approval process, not this project.

---

# 11. Success Metrics

| # | Metric |
| --- | --- |
| PM-1 | Monthly cost per active vendor falls against the §3 baseline, and cost no longer grows with the number of idle vendors. |
| PM-2 | Admin App host size reduced from the §3 baseline once environments move out. |
| PM-3 | Provisioning a vendor environment takes one administrator action and completes unattended. |
| PM-4 | Prod deploys only through the pipeline; no manual production changes. |
| PM-5 | Hosted sign-in works with no Keycloak instance in production. |
| PM-6 | A stopped environment resumes and completes a run without vendor intervention. |

---

# 12. Open Questions

| # | Question |
| --- | --- |
| OQ-P1 | What runs on the VM today, and what does it cost (§3)? |
| OQ-P2 | ODS/API, DMS, or both, as the certification environment runtime? |
| OQ-P3 | Default value for the idle period? |
| OQ-P4 | Does Entra ID issue tokens Admin App's machine-token handling accepts (PR-ID-2)? |
| OQ-P5 | Which Ed-Fi role can provision environments: any Ed-Fi Platform Administrator, or a named role? |
| OQ-P6 | Stretch goal: are vendor-hosted runs trial-only (§9)? |

---

# 13. Glossary

| Term | Definition |
| --- | --- |
| **Admin App host** | Where the Admin App API and front end run. A VM today; possibly Container Apps later. |
| **Certification environment** | An ODS/API or DMS deployment with its own database, run by Ed-Fi for one vendor team. |
| **Scale to zero** | Stopping an environment's compute while keeping its data, until it is next used. |
| **Run job** | A short-lived container that executes one step or collection run and exits. |
| **Vendor-hosted environment** | A vendor's own ODS/API or DMS connected for certification. Stretch goal only. |
