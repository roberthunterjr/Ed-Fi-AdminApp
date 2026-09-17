# Interactive Run Model for SIS and MTSS Certification

**Status:** Design for review
**Affects:** `docs/PRD-Platform-Automation-MVP.md` (§8, §8.1, §13, FR10, FR11, FR13, D22),
`docs/prototypes/certification-prototype.html`
**Related:** `Ed-Fi-Alliance-OSS/certification-testing` at `bruno/SIS/v5`

---

## 1. Problem

The MVP PRD models a run as an instant: the vendor presses a button, the platform
executes every scenario against their environment, and a result lands. That is a
faithful model of an Assessments run, which is a batch of GETs against resources
declared in a mapping CSV. It is not a faithful model of a SIS or MTSS run.

A SIS run is not something the platform does *to* a vendor's environment. It is
something the vendor works through. The Bruno collection's every step is a GET,
because the vendor loads the data into their own SIS by hand first — the folder
documentation spells out the CREATE, UPDATE and DELETE tasks — and the suite then
reads it back and asserts on it. The steps are ordered, and the order matters:
before a vendor PUTs an update, they need to know the POST landed correctly in the
first place. That is why `03 - 1st Section - availableCredits was Updated` calls
`validateDependency()` against variables that `01 - 1st Section is valid` set, and
why 49 of the collection's 142 steps do the same.

Modelling this as a single batch execution forces the real workflow into the
wrong shape. The vendor has to get all 45 scenarios loaded correctly before they
learn anything, or else generate a long tail of throwaway runs. Neither is what
the certification process actually asks of them.

## 2. What this design changes

A run for a Bruno-based model becomes a record the vendor accumulates. They start
it, work through scenarios task by task, and check each task as they finish
loading its data. Each check executes that one step against their environment and
records the result. The run holds the latest check per task. When the vendor
seals it, the accumulated checks *are* the evidence — nothing re-executes.

Assessments is unaffected and keeps the existing batch run.

The split follows a seam the system already has: `MODELS[...].kind` is `bruno` for
SIS and MTSS and `assessments` for Assessments, and the prototype already branches
on it throughout.

## 3. Decisions

| # | Decision |
| --- | --- |
| **ID1** | **A Bruno-model run is interactive; an Assessments run stays batch.** The two kinds are distinguished by `MODELS[...].kind`. No other certification model is contemplated in the MVP. |
| **ID2** | **Sealing does not re-execute.** The latest check per task is frozen as the run's result. There is no end-to-end verification pass, and therefore no "run all" for SIS or MTSS. |
| **ID3** | **The run holds the latest check per task, not a history.** Re-checking a task overwrites its slot. A reviewer sees the state each task ended in — a failure the vendor never corrected, or the parameters and response that finally produced a pass. |
| **ID4** | **Parameters are scoped to the scenario.** A scenario's steps share variables (`01` writes `firstSectionUniqueId`, `03` reads it), so the vendor supplies a scenario's identifiers once rather than per step. |
| **ID5** | **A vendor may abandon an open run.** Abandoning discards its accumulated checks. The alternative — forcing a seal — would push meaningless records into the review queue. |
| **ID6** | **An open run does not hold the product's execution slot.** D22 is revised: the constraint is one *check* executing per environment at a time, not one run open per product. An open run is idle between checks, and blocking a product for the days a SIS run takes would serialize independent certifications for no benefit. |
| **ID7** | **Artifact versions pin at run start; mid-run changes flag the run stale and invalidate nothing.** This is §8.1's existing rule, unchanged. It holds up here because a SIS check never reads the artifacts: the assertions hit the vendor's API, the mapping CSV is the source of truth for Assessments scope (D2), and sample data is the Assessments expected-result set (D17). |
| **ID8** | **Reviewers see sealed runs by default and can opt into open ones.** The review queue holds sealed runs. A reviewer may filter or search for open runs in order to give feedback on work in progress. |
| **ID9** | **A run may be sealed with tasks unchecked.** An unchecked task is recorded as *not attempted*, which is reported distinctly from failed. Whether partial evidence suffices is the reviewer's call, not the platform's (§12, D25). |

## 4. Tasks and steps

The collection's structure is not one-step-per-task, and the design depends on
reading it correctly.

Each scenario folder documents an ordered list of **tasks** — what the vendor
loads. A subset of those tasks carry a **verification step**, numbered to match.
`StudentSchoolAttendanceEvents` documents 5 tasks and ships steps `01`, `02` and
`05`: tasks 3 and 4 are the two updates, and they are not asserted.
`BellSchedules` documents 4 tasks with three struck through as out of scope, and
ships only step `01`.

Across the 45 SIS scenarios: 19 have one step per task, 16 have more tasks than
steps, and 10 document no tasks at all.

This gives the Prepare panel its spine:

- **Tasks are the rows.** They carry the vendor's instructions and their order.
- **A task with a step gets a Check action**, which executes that step and records
  the result against the task.
- **A task without a step is marked as not independently verified.** It is still
  a load instruction the vendor must follow; it simply has no assertion of its
  own, and a later scenario's prerequisites may depend on it.
- **A struck-through task is shown as out of scope** and requires nothing.
- **The 10 scenarios with no documented tasks fall back to their step list.**
  Those show verification steps without prose instructions. This is a content gap
  in the upstream collection, acknowledged and not something the platform can
  invent. It is recorded in §10.

Cross-scenario ordering comes from the collection too: each folder's `seq` gives
the intended load order (Sections is 12 of 45, Grades is 39), and all 45 folders
declare their prerequisites (Sections needs ClassPeriod, Location and
CourseOffering).

## 5. Run lifecycle

A Bruno-model run has three states. These are *run* states and are distinct from
the §8 submission statuses, which are unchanged.

| State | Meaning | Leaves by |
| --- | --- | --- |
| **Open** | The vendor is working through tasks. Checks accumulate. | Vendor seals or abandons |
| **Sealed** | Latest check per task is frozen. The run is immutable and is the evidence. | Terminal |
| **Abandoned** | Vendor discarded the run and its checks. Retained as a record that it happened, with no results. | Terminal |

Completeness stamps at start and never recalculates (§8.1, unchanged). Artifact
versions pin at start (§8.1, unchanged). A sealed run stamped **Complete**
satisfies the readiness gate whether or not its checks passed (D25, unchanged).

An open run never satisfies the gate. A submission whose only run is open shows
**Submission Incomplete** with "artifacts are complete, but no qualifying run has
been sealed since" — the FR13 wording that already distinguishes a missing
artifact from a missing run needs one more case for this.

An abandoned run never satisfies the gate and is excluded from qualifying-run
filters.

### 5.1 Sealing with unchecked tasks

A vendor may seal a run in which some tasks were never checked. The platform does
not require a complete sweep, for the same reason FR13 does not evaluate outcomes:
completeness is about artifacts, and whether partial evidence is sufficient is the
reviewer's judgment, not the platform's (§12, D25).

An unchecked task is recorded as **not attempted**, which is distinct from failed.
The distinction has to survive into the reviewer's view, because "the vendor tried
this and it did not work" and "the vendor never tried this" call for different
responses.

This means run tallies carry three counts rather than two — passed, failed, and
not attempted — wherever a Bruno run is summarized: the run header, the scenario
table, the submission, and the reviewer dashboard. A scenario is counted as failed
if any checked task in it failed, and as not attempted only if none of its tasks
were checked.

The seal action states what is being sealed ("12 of 45 scenarios checked, 33 not
attempted") so that sealing a partial run is a deliberate act rather than an
accident.

## 6. The check record

Each checked task stores:

| Field | Purpose |
| --- | --- |
| Result | Pass, or one of the failure kinds below |
| Element rows | The assertion table: element path, Ed-Fi type, assertions, observed value |
| Response status | Observed against the step's expected status |
| Parameters used | The scenario parameter values in effect when the check ran |
| Checked at, checked by | Provenance |
| Attempt count | How many times this task was checked, so a reviewer can see a task that took many tries even though only the latest result is kept |

Failure kinds are the ones the collection can produce, already implemented:
assertion failed, element absent, value not updated, unexpected status.

Attempt count is the one addition beyond "latest only". It costs one integer and
answers a question a reviewer will otherwise ask — whether a passing task passed
first time — without retaining a history we have decided not to show.

## 7. Prepare panel

The panel opens from the Scenarios table on the submission, one row per scenario.

```
MasterSchedule / Sections                          load order 12 of 45
Prerequisites: ClassPeriod ✓   Location ✓   CourseOffering ✓

Parameters   School ID [255901107]  School Year [2017]
             Local Course Code [ELA-01]  Session Name [2016-2017 Fall Semester]
             Section Identifier [ELA012017RM555]

1. CREATE a first Section for Grand Bend Elementary, referencing the
   Course Offering for "English Language Arts, Grade 1"        ✓ Verified   [Re-check]
2. CREATE a second Section for Grand Bend High, referencing
   the Course Offering for "ALGEBRA 1"                         ✓ Verified   [Re-check]
3. UPDATE availableCredits on the first Section                ● Not checked [Check]
4. UPDATE availableCredits on the second Section               ● Not checked [Check]
```

Checking a task expands the element table already built for run results — the
same component, at the moment the vendor needs it rather than after the fact.

A scenario's **Check all** action runs its tasks in order and stops at the first
failure, matching the collection's own dependency behaviour.

Prerequisites are shown with their state but do not block. A vendor who knows
their data is loaded should not be stopped by the platform's view of ordering;
a check against missing prerequisite data will fail on its own, with a clearer
message than a pre-emptive block could give. This follows D24's reasoning: fail
loudly and report what was missing rather than refusing to start.

## 8. Prototype implementation

**Approach: materialize at start, fill in progressively.**

`brunoResults()` already builds the whole scenario tree at run start. It changes
to emit every task in an `unchecked` state, and a new `runCheck(run, scenarioKey,
taskNo)` fills one entry in place. The step accordion, `resultTally` and the
scenario table keep working: a checked task renders exactly as it does today, and
`unchecked` is a new empty state.

This was chosen over a sparse overlay (smaller record, but every renderer would
need to join static definitions against recorded checks at display time) and over
an append-only event log (faithful to a vendor's struggle, but ID3 keeps only the
latest result, so the retained history would never be shown).

Work needed:

1. **Generator** — extract each folder's task list, `seq` and prerequisites from
   the `docs` block, alongside the assertion data already parsed. Preserve
   strikethrough markers so out-of-scope tasks can be rendered as such.
2. **Data** — add tasks, load order and prerequisites to `COLLECTION`; map tasks
   to step indices by their leading number.
3. **Run model** — `startRun` for a Bruno model creates an open run with all
   tasks unchecked and no timers. `runCheck` executes one task. `sealRun` and
   `abandonRun` close it. `finishRun`'s timer path stays for Assessments.
4. **`busyRun`** — test for a check in flight rather than an open run (ID6).
5. **Prepare panel** — new view, opened from the Scenarios table.
6. **Parameters** — per-scenario form, persisted on the run.
7. **Reviewer** — queue defaults to sealed; add an open-run filter (ID8).
8. **Simulated outcomes** — the existing outcome selector extends to a check, so
   a prototype user can drive a check to pass, fail, or hit an infra or auth
   error. Keeping the selector's per-branch labelling is a house style for these
   prototypes.

## 9. PRD impact

The PRD's canonical home is Confluence; this repo's copy is a snapshot. The one
exception is the §8 mermaid diagram, whose source in this repo is canonical and
must be edited here, then mirrored into the Confluence page.

| Section | Change |
| --- | --- |
| **§8 rules** | "Only one run may be *executing* for a product at any moment (D22)" is revised per ID6 to one check executing per environment. |
| **§8 diagram** | The "Vendor may start trial runs" node becomes the interactive loop for Bruno models: start run → check tasks → seal or abandon. Canonical in this repo; mirror to Confluence after commit. |
| **§8.1** | Unchanged in substance. Add that for a Bruno model, "at start" means the start of an open run that may stay open for days, and that the stale marker is expected to fire more often as a result (ID7). |
| **§13 Determinism** | Narrowed. "Re-running an unchanged submission against an unchanged environment produces the same result" holds for Assessments. For a Bruno model the guarantee becomes: each recorded check is individually reproducible against an unchanged environment. A sealed run is not re-executable as a whole, by design (ID2). |
| **FR10** | Bruno results are shown by scenario *and* by element within a step. The "states what was expected and what was observed" wording needs care: Bruno assertions are constraints, not expected values. |
| **FR11** | Add run states (ID5). Immutability applies to a sealed run; an open run is mutable by its owner, which is what it is for. Add the check record's fields (§6). |
| **FR13** | Add the "no qualifying run has been *sealed*" case to the unmet-condition messages. |
| **FR10 tallies** | Bruno run summaries report passed, failed and not attempted (§5.1), rather than the current two-way split. |
| **D22** | Revised per ID6. |
| **New decisions** | ID1–ID9 above enter the decision log. |

## 10. Known gaps

- **10 of 45 SIS scenarios document no tasks**, and 16 more document tasks that
  have no verification step. The Prepare panel degrades honestly in both cases,
  but a vendor working those scenarios gets less guidance. Closing this is
  upstream work in `certification-testing`, not platform work.
- **MTSS has no upstream collection.** Its 8 scenarios, their steps and their
  assertions are authored for the prototype in the SIS constraint style. When a
  real MTSS collection exists, that data is replaced wholesale.

## 11. Out of scope

- Any change to the Assessments run path beyond leaving it alone.
- Retaining check history beyond latest-plus-attempt-count (ID3).
- Automatic prerequisite enforcement or load-order blocking (§7).
- Outbound notification when a run has sat open a long time.
