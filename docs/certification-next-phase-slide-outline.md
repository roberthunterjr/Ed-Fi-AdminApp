# Certification Automation, Next Phase: Slide Outline

> Outline for an overview deck. Drafted with AI assistance; disclose AI use when
> presenting, and review before use. Detail lives in the three PRDs:
> [Admin App 4.2](./PRD-AdminApp-v4.2.md),
> [Automation Platform](./PRD-Automation-Platform.md),
> [Bruno Assertion Model Generator](./PRD-Bruno-Assertion-Model-Generator.md).

1. **Title.** Certification Automation: Admin App 4.2, Automation Platform, and
   the Bruno Assertion Model Generator.

2. **Where we are.** The MVP shipped with the SIS v5 scenarios only.
   - Runs are checked one step at a time.
   - A run can be sent to review, then approved, rejected or sent back for
     changes.
   - There's an Ed-Fi staff dashboard and the vendor's My products page.
   - MTSS and Assessments scripts are in active development.
   - Not yet built: artifacts, run history, Entra ID login, hosting.

3. **Built vs. planned.** What we're keeping as the baseline:
   - the product is a data store plus a certification model
   - the run is what gets reviewed
   - a pick-up step before review
   - collections come from a tagged release
   - every scenario must pass before review

   Gaps carried forward: artifacts, MTSS, Assessments, run history.

4. **Why split the work.** The MVP PRD mixed product features, infrastructure
   and Assessments logic in one document. Vendor files (for example Vendor D)
   showed that Assessments logic varies too much to build into the platform.

5. **The approach: three concerns, three PRDs.** Diagram:
   - Generator (offline, Ed-Fi representative) → **Bruno collection** →
     Admin App 4.2 (runs and review).
   - The Automation Platform sits underneath: hosting, identity, environments,
     storage.

6. **The contract: the Bruno collection.**
   - It carries the endpoints, parameters, expected responses, which fields are
     checked, and how values are compared.
   - The platform runs it unchanged. It fills in `baseUrl` and `accessToken`,
     uses the pinned Bruno CLI version, and reads results by result kind.

7. **Admin App 4.2.**
   - Must have (gates the release):
     - MTSS runs
     - run history
     - activity timeline (may slip) and raw step output
   - Fast follow:
     - the reworked Request Certification dialog with an Assessments
       walkthrough
     - product artifacts
     - Assessments runs with a preview of expected values

8. **Bruno scripts workstream.** MTSS / Intervention scenarios in the
   certification-testing repo cover six groups, including recovery. They're
   released under a tag together with SIS, and Admin App picks them up the same
   way.

9. **Automation Platform.**
   - Vendor ODS environments in their own containers, scaling out.
   - One-action provisioning by an Ed-Fi administrator during onboarding;
     environments scale to zero when idle (configurable). Automatic deletion is
     deferred.
   - A smaller, always-on Admin App VM.
   - Entra ID sign-in; Keycloak for local use.
   - Blob artifact storage.
   - A GitHub Actions + Bicep pipeline.
   - Runs execute in job containers.
   - Nice to have: Admin App on Container Apps.
   - Stretch: vendor-hosted environments.

10. **Bruno Assertion Model Generator.**
    - Only the Ed-Fi representative generates the collection.
    - The pre-certification conversation (live or offline, AI optional) over the
      vendor's mapping and sample data is how the representative confirms keys
      and parameters.
    - It works out endpoints, ed-orgs and students, parameters, expected
      responses, and the fields to check.
    - Provenance is recorded on every value, and output is deterministic.
    - The representative uploads the collection to the product.

11. **The vendor's path end to end.**
    - SIS and MTSS: Request certification → load data → run the fixed collection
      from the certification repo → review → decision.
    - Assessments: Request certification → share the mapping and samples →
      pre-certification conversation → the representative generates and uploads
      the collection → load data → run → review → decision.
    - Only Assessments has a generated collection; the others use fixed
      collections.

12. **What this enables.**
    - SIS and MTSS can be extended through Bruno scripts in the certification
      repo.
    - Assessments readiness is checked outside the platform, before
      certification.
    - Domain runs can be tailored through the Bruno contract.
    - Lower cloud costs, by scaling environments out instead of growing the VM.

13. **Sequencing.**
    - 4.2 ships when MTSS works, on today's setup.
    - Assessments in Admin App and the generator are a parallel fast follow,
      joined by the contract.
    - The platform work runs in parallel and aims to finish as soon as possible.

14. **Open decisions / what we need from you.** Pick from the open questions in
    the three PRDs, for example:
    - Which Ed-Fi role provisions environments?
    - Which AI provider, if any?
    - Recovery deletions performed by the vendor or by Ed-Fi?
    - Default idle period.

15. **Appendix.** The reconciliation table (Admin App 4.2 PRD §2.2).
