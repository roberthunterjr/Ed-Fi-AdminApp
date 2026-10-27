# Intervention / MTSS API v5 Certification - Test Scenarios (Draft)

> **Status:** Working draft. Formalizes the scenarios in the Confluence page
> [Intervention MTSS Certification Draft](https://edfi.atlassian.net/wiki/spaces/EDFICERT/pages/2413428742/Intervention+MTSS+Certification+Draft)
> using the layout of the SIS v5 test scenarios (for example,
> [BellSchedule Scenarios](https://docs.ed-fi.org/partners/certification/available-certifications/sis-v5/test-scenarios/bellschedule-scenarios)). Each scenario lists its tables and
> payloads first, followed by a **Comments** section with notes and proposed
> changes to the Confluence draft.

## Conventions

- Properties, data types, and cardinality are verified against the ODS/API
  v7.3 resources OpenAPI metadata (Data Standard 5.2.0,
  `https://api.ed-fi.org/v7.3/api/metadata/data/v3/resources/swagger.json`)
  and the [Data Standard v5.2 Data Handbook](https://edfidocs.blob.core.windows.net/$web/handbook/v5.2/index.html).
- Default descriptor values are verified against the Data Standard
  [v5.2.0 descriptor set](https://github.com/Ed-Fi-Alliance-OSS/Ed-Fi-Standard/tree/v5.2.0/Descriptors).
- Sample data uses the Grand Bend populated template: Grand Bend ISD
  (`educationOrganizationId` 255901), staff `207288`, student `604863`.
- Each scenario column in a table is one API call, in order. A blank cell under
  a scenario means the property is not sent in that call.
- **Required** reflects the certification requirement, which can be stricter
  than the Data Standard. Where they differ, the Comments say so.
- Descriptor values are shown by code value. Send them as full URIs, for
  example `uri://ed-fi.org/DeliveryMethodDescriptor#Small Group`. Where a
  default `uri://ed-fi.org` value does not fit, the provider publishes a
  descriptor in its own namespace and uses that.
- Rows for a reference or collection item type (such as `staffReference`)
  describe the properties inside that object.
---

## v5 Intervention > Intervention Scenarios

The Intervention entity is "an implementation of an instructional approach
focusing on the specific techniques and materials used to teach a given
subject." For certification it is the provider's definition of an intervention:
its identifier, classification, delivery parameters, owning education
organization, and the staff who deliver it.

### Prerequisites

- Education organization `255901` (Grand Bend ISD).
- Staff `207288` and `207289`.
- DiagnosisDescriptor `uri://www.intervention-provider.com/DiagnosisDescriptor#Reading Fluency`.
  The default DS 5.2 Diagnosis values are only `Dropout Risk` and
  `Low Attendance`, so an academic intervention needs a provider-namespaced
  value. Publish it with:

  POST `/ed-fi/diagnosisDescriptors`

  ```json
  {
    "codeValue": "Reading Fluency",
    "namespace": "uri://www.intervention-provider.com/DiagnosisDescriptor",
    "shortDescription": "Reading Fluency",
    "description": "Student needs support with oral reading fluency."
  }
  ```

### Scenarios

1. Create a small-group reading intervention, `READ-T2-001`, targeting a
   provider-namespaced diagnosis and delivered by one staff member.
2. Create an individual attendance intervention, `ATTD-T2-001`, targeting a
   default Ed-Fi diagnosis.
3. Update `READ-T2-001`: set an end date, raise the maximum dosage, and add a
   second staff member.
4. Delete `ATTD-T2-001`.

| Resource | Property Name | Is Collection | Data Type | Required | Scenario 1: POST | Scenario 2: POST | Scenario 3: PUT | Scenario 4: DELETE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Intervention | interventionIdentificationCode | FALSE | string | REQUIRED | READ-T2-001 | ATTD-T2-001 | READ-T2-001 | ATTD-T2-001 |
| Intervention | educationOrganizationReference | FALSE | educationOrganizationReference | REQUIRED | | | | |
| educationOrganizationReference | educationOrganizationId | FALSE | integer | REQUIRED | 255901 | 255901 | 255901 | 255901 |
| Intervention | interventionClassDescriptor | FALSE | interventionClassDescriptor | REQUIRED | Practice | Supplement | Practice | |
| Intervention | deliveryMethodDescriptor | FALSE | deliveryMethodDescriptor | REQUIRED | Small Group | Individual | Small Group | |
| Intervention | beginDate | FALSE | date | REQUIRED | 2026-08-24 | 2026-08-24 | 2026-08-24 | |
| Intervention | endDate | FALSE | date | OPTIONAL | | | 2027-05-28 | |
| Intervention | minDosage | FALSE | integer | OPTIONAL | 300 | | 300 | |
| Intervention | maxDosage | FALSE | integer | OPTIONAL | 1200 | | 1800 | |
| Intervention | namespace | FALSE | string | REQUIRED | uri://www.intervention-provider.com | uri://www.intervention-provider.com | uri://www.intervention-provider.com | |
| Intervention | diagnoses | TRUE | interventionDiagnosis | REQUIRED | | | | |
| interventionDiagnosis | diagnosisDescriptor | FALSE | diagnosisDescriptor | REQUIRED | Reading Fluency (provider namespace) | Low Attendance | Reading Fluency (provider namespace) | |
| Intervention | staffs | TRUE | interventionStaff | REQUIRED (Path 1) | | | | |
| interventionStaff | staffReference | FALSE | staffReference | REQUIRED | | | | |
| staffReference | staffUniqueId | FALSE | string | REQUIRED | 207288 | | 207288 | |
| staffReference | staffUniqueId | FALSE | string | REQUIRED | | | 207289 | |
| Intervention | meetingTimes | TRUE | interventionMeetingTime | OPTIONAL | | | | |
| interventionMeetingTime | startTime | FALSE | string (hh:mm:ss) | REQUIRED | 09:00:00 | | 09:00:00 | |
| interventionMeetingTime | endTime | FALSE | string (hh:mm:ss) | REQUIRED | 09:30:00 | | 09:30:00 | |

### Scenario 1: POST `/ed-fi/interventions`

```json
{
  "interventionIdentificationCode": "READ-T2-001",
  "educationOrganizationReference": {
    "educationOrganizationId": 255901
  },
  "interventionClassDescriptor": "uri://ed-fi.org/InterventionClassDescriptor#Practice",
  "deliveryMethodDescriptor": "uri://ed-fi.org/DeliveryMethodDescriptor#Small Group",
  "beginDate": "2026-08-24",
  "minDosage": 300,
  "maxDosage": 1200,
  "namespace": "uri://www.intervention-provider.com",
  "diagnoses": [
    {
      "diagnosisDescriptor": "uri://www.intervention-provider.com/DiagnosisDescriptor#Reading Fluency"
    }
  ],
  "staffs": [
    {
      "staffReference": {
        "staffUniqueId": "207288"
      }
    }
  ],
  "meetingTimes": [
    {
      "startTime": "09:00:00",
      "endTime": "09:30:00"
    }
  ]
}
```

### Scenario 2: POST `/ed-fi/interventions`

```json
{
  "interventionIdentificationCode": "ATTD-T2-001",
  "educationOrganizationReference": {
    "educationOrganizationId": 255901
  },
  "interventionClassDescriptor": "uri://ed-fi.org/InterventionClassDescriptor#Supplement",
  "deliveryMethodDescriptor": "uri://ed-fi.org/DeliveryMethodDescriptor#Individual",
  "beginDate": "2026-08-24",
  "namespace": "uri://www.intervention-provider.com",
  "diagnoses": [
    {
      "diagnosisDescriptor": "uri://ed-fi.org/DiagnosisDescriptor#Low Attendance"
    }
  ]
}
```

### Scenario 3: PUT `/ed-fi/interventions/{id}`

`{id}` is the resource id of `READ-T2-001` returned by Scenario 1.

```json
{
  "interventionIdentificationCode": "READ-T2-001",
  "educationOrganizationReference": {
    "educationOrganizationId": 255901
  },
  "interventionClassDescriptor": "uri://ed-fi.org/InterventionClassDescriptor#Practice",
  "deliveryMethodDescriptor": "uri://ed-fi.org/DeliveryMethodDescriptor#Small Group",
  "beginDate": "2026-08-24",
  "endDate": "2027-05-28",
  "minDosage": 300,
  "maxDosage": 1800,
  "namespace": "uri://www.intervention-provider.com",
  "diagnoses": [
    {
      "diagnosisDescriptor": "uri://www.intervention-provider.com/DiagnosisDescriptor#Reading Fluency"
    }
  ],
  "staffs": [
    {
      "staffReference": {
        "staffUniqueId": "207288"
      }
    },
    {
      "staffReference": {
        "staffUniqueId": "207289"
      }
    }
  ],
  "meetingTimes": [
    {
      "startTime": "09:00:00",
      "endTime": "09:30:00"
    }
  ]
}
```

### Scenario 4: DELETE `/ed-fi/interventions/{id}`

`{id}` is the resource id of `ATTD-T2-001` returned by Scenario 2. No body.

### Comments

#### Notes

- The natural key is `educationOrganizationReference` +
  `interventionIdentificationCode`. A PUT cannot change either value.
- `namespace` and `diagnoses` are optional in the Data Standard but required
  for certification. `diagnoses` is a collection; DS 5.2 has no top-level
  `diagnosisDescriptor` on Intervention.
- `staffs` is optional in the Data Standard. It is required only for providers
  using Path 1 (see the Staff scenarios). Path 2 providers may omit it.
- `deliveryMethodDescriptor` and `beginDate` are checked for presence only. A
  catalog-level default is acceptable where the product records these per
  student. Data Standard 5 requires both on Intervention, so the API rejects a
  record without them.
- Recording `beginDate`, `endDate`, `deliveryMethodDescriptor`, meeting times,
  and staff per student assignment is a future consideration (Data Standard 7),
  outside v1.
- `minDosage` and `maxDosage` are "the minimum/maximum duration of time in
  minutes that may be assigned for the intervention." They use the same scale
  as StudentInterventionAssociation `dosage`, which certification defines as
  total assigned minutes. So the values are totals for an assignment (300 to
  1,200 minutes), not minutes per session.
- DS 5.2 default values: InterventionClass is `Curriculum`, `Other`,
  `Practice`, `Supplement`. DeliveryMethod is `Individual`, `Small Group`,
  `Whole Class`, `Whole School`. Diagnosis is `Dropout Risk`, `Low Attendance`.
- Scenario 4 deletes `ATTD-T2-001` because it has no dependent
  StudentInterventionAssociation. The API rejects deleting an intervention
  that has associations.
- Not exercised: `appropriateGradeLevels`, `appropriateSexes`,
  `populationServeds`, `interventionPrescriptions`, `educationContents`,
  `learningResourceMetadataURIs`, `uris`.

#### Proposed changes to the Confluence draft

1. **Reference payload.** Remove the top-level `"diagnosisDescriptor"`. DS 5.2
   Intervention has only the `diagnoses` collection, so the API rejects the
   payload as written. In the Required Fields table, rename "Diagnosis
   (Descriptor)" to "Diagnoses (collection)".
2. **Diagnosis values.** DS 5.2 ships only two default Diagnosis values:
   `Dropout Risk` and `Low Attendance`. Academic interventions need a
   provider-namespaced descriptor, which the provider must publish first. The
   reference payload's `uri://gbisd.edu/DiagnosisDescriptor#Dropout Risk`
   also duplicates a default value in another namespace.
3. **DeliveryMethod values.** The DS 5.2 defaults are `Individual`,
   `Small Group`, `Whole Class`, and `Whole School`. Add `Whole School` to the
   list in the Required Fields table and Scenario 1.
4. **Dosage scale.** `minDosage`/`maxDosage` are "the minimum/maximum duration
   of time in minutes that may be assigned for the intervention." This is the
   same scale as StudentInterventionAssociation `dosage`, which the draft
   defines as total assigned minutes. The reference payloads use 10/40 on the
   Intervention and 30 on the assignment, which read as per-session minutes.
   Use totals (for example 300/1,200 and 600).
5. **Reference payload dates.** The Intervention `beginDate` is 2021-08-23 but
   the attendance event is 2026-10-13. Align them to one school year.
6. **Typo.** Scenario 1 table: "MeetingTime (collectio)" → "MeetingTimes
   (collection)".

---

## v5 Intervention > StudentInterventionAssociation Scenarios

The StudentInterventionAssociation "indicates the students participating in an
intervention." For certification it is the student's assignment to an
intervention, with the total minutes assigned and, where the product supports
it, the reason for the assignment.

### Prerequisites

- Intervention `READ-T2-001` for education organization `255901` (Intervention
  Scenarios 1 and 3).
- Students `604863` and `604854`, each enrolled in a Grand Bend ISD school. The
  ODS/API authorizes this resource through the student's enrollment, so the
  student needs a StudentSchoolAssociation within `255901`.

### Scenarios

1. Assign student `604863` to `READ-T2-001` with 600 assigned minutes and a
   diagnostic statement.
2. Assign student `604854` to the same intervention with 600 assigned minutes
   and no diagnostic statement.
3. Update student `604863`'s assignment to 900 assigned minutes.
4. Delete student `604854`'s assignment.

| Resource | Property Name | Is Collection | Data Type | Required | Scenario 1: POST | Scenario 2: POST | Scenario 3: PUT | Scenario 4: DELETE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| StudentInterventionAssociation | studentReference | FALSE | studentReference | REQUIRED | | | | |
| studentReference | studentUniqueId | FALSE | string | REQUIRED | 604863 | 604854 | 604863 | 604854 |
| StudentInterventionAssociation | interventionReference | FALSE | interventionReference | REQUIRED | | | | |
| interventionReference | educationOrganizationId | FALSE | integer | REQUIRED | 255901 | 255901 | 255901 | 255901 |
| interventionReference | interventionIdentificationCode | FALSE | string | REQUIRED | READ-T2-001 | READ-T2-001 | READ-T2-001 | READ-T2-001 |
| StudentInterventionAssociation | dosage | FALSE | integer | REQUIRED | 600 | 600 | 900 | |
| StudentInterventionAssociation | diagnosticStatement | FALSE | string | OPTIONAL | Student demonstrates reading fluency needs. | | Student demonstrates reading fluency needs. | |
| StudentInterventionAssociation | cohortReference | FALSE | cohortReference | OPTIONAL (REQUIRED for Staff Path 2) | | | | |
| cohortReference | cohortIdentifier | FALSE | string | REQUIRED | | | | |
| cohortReference | educationOrganizationId | FALSE | integer | REQUIRED | | | | |
| StudentInterventionAssociation | interventionEffectivenesses | TRUE | studentInterventionAssociationInterventionEffectiveness | OPTIONAL | | | | |

### Scenario 1: POST `/ed-fi/studentInterventionAssociations`

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "dosage": 600,
  "diagnosticStatement": "Student demonstrates reading fluency needs."
}
```

### Scenario 2: POST `/ed-fi/studentInterventionAssociations`

```json
{
  "studentReference": {
    "studentUniqueId": "604854"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "dosage": 600
}
```

### Scenario 3: PUT `/ed-fi/studentInterventionAssociations/{id}`

`{id}` is the resource id of student `604863`'s association returned by
Scenario 1.

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "dosage": 900,
  "diagnosticStatement": "Student demonstrates reading fluency needs."
}
```

### Scenario 4: DELETE `/ed-fi/studentInterventionAssociations/{id}`

`{id}` is the resource id of student `604854`'s association returned by
Scenario 2. No body.

### Comments

#### Notes

- The natural key is `studentReference` + `interventionReference`. A student can
  have only one association per intervention, and a PUT cannot change the
  student or the intervention. To move a student to another intervention, the
  provider deletes the old association and posts a new one.
- `dosage` is optional in the Data Standard but required for certification.
  It is "the duration of time in minutes for which the student was assigned to
  participate in the intervention": the total for the assignment, not minutes
  per session. 600 minutes is, for example, 20 sessions of 30 minutes.
- `diagnosticStatement` is optional (max 1,024 characters). Scenario 2 omits it
  to show that it isn't required. With it optional, Intervention `diagnoses` is
  the only required element describing an intervention's purpose.
- The 21-Oct workgroup is asking agencies what extensions, if any, they add to
  StudentInterventionAssociation. One agency extended it to meet its dosage
  reporting needs.
- `cohortReference` is used only by providers on Staff Path 2. The Staff
  Association Scenarios exercise it.
- `interventionEffectivenesses` is optional and not exercised. If published,
  each item requires `diagnosisDescriptor`, `gradeLevelDescriptor`,
  `populationServedDescriptor`, and `interventionEffectivenessRatingDescriptor`,
  plus an optional `improvementIndex` (integer).
- Scenario 4 deletes `604854`'s association because it will have no dependent
  attendance events. `604863`'s association is used by the attendance and
  dosage scenarios.

#### Proposed changes to the Confluence draft

7. **Dosage.** The Required Fields table marks `Dosage` as required for the
   Data Standard. It is optional in DS 5.2. Mark it "No" for the standard and
   "Yes" for certification.
8. **Key.** Note that the natural key is student + intervention, so a student
   has one association per intervention. A PUT cannot move a student to
   another intervention; that takes a DELETE and a POST.

## v5 Intervention > StudentInterventionAttendanceEvent Scenarios

The StudentInterventionAttendanceEvent "represents the recording of whether a
student is in attendance for an intervention service." For certification it is
the session-level record of delivery: one event per student, intervention,
session date, and attendance category, with the minutes actually delivered.

### Prerequisites

- Intervention `READ-T2-001` for education organization `255901` (Intervention
  Scenarios 1 and 3). Event dates must fall between its `beginDate`
  (2026-08-24) and `endDate` (2027-05-28).
- Student `604863` assigned to `READ-T2-001` (StudentInterventionAssociation
  Scenarios 1 and 3).
- For Scenario 8 only: AttendanceEventCategoryDescriptor
  `uri://www.intervention-provider.com/AttendanceEventCategoryDescriptor#Session Not Held`.
  None of the DS 5.2 default values describes a session that did not take
  place. Publish it with:

  POST `/ed-fi/attendanceEventCategoryDescriptors`

  ```json
  {
    "codeValue": "Session Not Held",
    "namespace": "uri://www.intervention-provider.com/AttendanceEventCategoryDescriptor",
    "shortDescription": "Session Not Held",
    "description": "The scheduled intervention session did not take place for reasons outside the student's control."
  }
  ```

### Scenarios

1. Record that student `604863` attended the full 30-minute `READ-T2-001`
   session on 2026-09-08.
2. Record a second full session on 2026-09-09.
3. Record a partial session on 2026-09-10: the student left after 15 minutes.
4. Record an unexcused absence on 2026-09-11.
5. Update the 2026-09-09 event: only 25 minutes were delivered.
6. Delete the 2026-09-11 unexcused absence, which was recorded in error.
7. Record the 2026-09-11 session again, as an excused absence.
8. Required when the product records sessions that don't fit the DS 5.2
   default categories: record that the 2026-09-14 session was not held, using
   a provider-namespaced descriptor.

| Resource | Property Name | Is Collection | Data Type | Required | Scenario 1: POST | Scenario 2: POST | Scenario 3: POST | Scenario 4: POST | Scenario 5: PUT | Scenario 6: DELETE | Scenario 7: POST | Scenario 8: POST |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| StudentInterventionAttendanceEvent | studentReference | FALSE | studentReference | REQUIRED | | | | | | | | |
| studentReference | studentUniqueId | FALSE | string | REQUIRED | 604863 | 604863 | 604863 | 604863 | 604863 | 604863 | 604863 | 604863 |
| StudentInterventionAttendanceEvent | interventionReference | FALSE | interventionReference | REQUIRED | | | | | | | | |
| interventionReference | educationOrganizationId | FALSE | integer | REQUIRED | 255901 | 255901 | 255901 | 255901 | 255901 | 255901 | 255901 | 255901 |
| interventionReference | interventionIdentificationCode | FALSE | string | REQUIRED | READ-T2-001 | READ-T2-001 | READ-T2-001 | READ-T2-001 | READ-T2-001 | READ-T2-001 | READ-T2-001 | READ-T2-001 |
| StudentInterventionAttendanceEvent | eventDate | FALSE | date | REQUIRED | 2026-09-08 | 2026-09-09 | 2026-09-10 | 2026-09-11 | 2026-09-09 | 2026-09-11 | 2026-09-11 | 2026-09-14 |
| StudentInterventionAttendanceEvent | attendanceEventCategoryDescriptor | FALSE | attendanceEventCategoryDescriptor | REQUIRED | In Attendance | In Attendance | Partial | Unexcused Absence | In Attendance | Unexcused Absence | Excused Absence | Session Not Held (provider namespace) |
| StudentInterventionAttendanceEvent | interventionDuration | FALSE | integer | REQUIRED | 30 | 30 | 15 | 0 | 25 | | 0 | 0 |
| StudentInterventionAttendanceEvent | attendanceEventReason | FALSE | string | OPTIONAL | | | Left early for nurse visit | | | | Family emergency | Interventionist absent |
| StudentInterventionAttendanceEvent | educationalEnvironmentDescriptor | FALSE | educationalEnvironmentDescriptor | OPTIONAL | | | | | | | | |
| StudentInterventionAttendanceEvent | eventDuration | FALSE | number | OPTIONAL | | | | | | | | |

### Scenario 1: POST `/ed-fi/studentInterventionAttendanceEvents`

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "eventDate": "2026-09-08",
  "attendanceEventCategoryDescriptor": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#In Attendance",
  "interventionDuration": 30
}
```

### Scenario 2: POST `/ed-fi/studentInterventionAttendanceEvents`

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "eventDate": "2026-09-09",
  "attendanceEventCategoryDescriptor": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#In Attendance",
  "interventionDuration": 30
}
```

### Scenario 3: POST `/ed-fi/studentInterventionAttendanceEvents`

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "eventDate": "2026-09-10",
  "attendanceEventCategoryDescriptor": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#Partial",
  "interventionDuration": 15,
  "attendanceEventReason": "Left early for nurse visit"
}
```

### Scenario 4: POST `/ed-fi/studentInterventionAttendanceEvents`

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "eventDate": "2026-09-11",
  "attendanceEventCategoryDescriptor": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#Unexcused Absence",
  "interventionDuration": 0
}
```

### Scenario 5: PUT `/ed-fi/studentInterventionAttendanceEvents/{id}`

`{id}` is the resource id of the 2026-09-09 event returned by Scenario 2.

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "eventDate": "2026-09-09",
  "attendanceEventCategoryDescriptor": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#In Attendance",
  "interventionDuration": 25
}
```

### Scenario 6: DELETE `/ed-fi/studentInterventionAttendanceEvents/{id}`

`{id}` is the resource id of the 2026-09-11 unexcused absence returned by
Scenario 4. No body.

### Scenario 7: POST `/ed-fi/studentInterventionAttendanceEvents`

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "eventDate": "2026-09-11",
  "attendanceEventCategoryDescriptor": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#Excused Absence",
  "interventionDuration": 0,
  "attendanceEventReason": "Family emergency"
}
```

### Scenario 8 (required when needed): POST `/ed-fi/studentInterventionAttendanceEvents`

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "eventDate": "2026-09-14",
  "attendanceEventCategoryDescriptor": "uri://www.intervention-provider.com/AttendanceEventCategoryDescriptor#Session Not Held",
  "interventionDuration": 0,
  "attendanceEventReason": "Interventionist absent"
}
```

### Comments

#### Notes

- The natural key is `studentReference` + `interventionReference` +
  `eventDate` + `attendanceEventCategoryDescriptor`. The API does not support
  key changes on this resource, so a PUT can change only `interventionDuration`,
  `attendanceEventReason`, `educationalEnvironmentDescriptor`, and
  `eventDuration`. Correcting the category takes a DELETE and a POST
  (Scenarios 6 and 7).
- Because the key has no time of day, a second session for the same student,
  intervention, date, and category upserts over the first. A product that
  delivers two sessions in one day publishes one event with the total minutes.
- `interventionDuration` is optional in the Data Standard but required for
  certification: "the duration in minutes of the intervention attendance
  event." Certification expects it on every event, including absences (0).
- `eventDuration` is a fraction of a school day (1 day = 1, 1/2 day = 0.5). It
  is not a substitute for `interventionDuration`, which is in minutes. Not
  exercised.
- The event has no reference to the StudentInterventionAssociation. It links to
  the assignment only through the shared student and intervention, and the API
  does not enforce the link. Certification requires every event to match a
  StudentInterventionAssociation for the same student and intervention. The
  association must already exist, or be created earlier in the same scenario.
- Scenario 8 is required when the product records sessions that don't fit
  the DS 5.2 default categories, such as a session not held because of a
  school closure or an absent interventionist. Certification checks that these
  sessions use a descriptor in the provider's own namespace, not a default
  category such as `Excused Absence` or `Unexcused Absence`. Providers whose
  sessions all fit the defaults skip Scenario 8. This check replaces adding a
  new required field (21-Oct workgroup agreement).
- Events in a "session not held" category record that a session did not take
  place. They are excluded from delivered minutes and session counts in the
  Assigned vs. Delivered Dosage Scenarios. Comparing scheduled with held
  sessions is a future consideration.
- `attendanceEventReason` is optional (max 255 characters).
- `educationalEnvironmentDescriptor` is optional and not exercised.
- DS 5.2 AttendanceEventCategory default values are `Early departure`,
  `Excused Absence`, `In Attendance`, `Partial`, `Present`, `Tardy`,
  `Unexcused Absence`.
- After Scenario 7, the delivered minutes for `604863` on `READ-T2-001` are
  30 + 25 + 15 + 0 = 70. The Assigned vs. Delivered Dosage Scenarios use this
  total.

#### Proposed changes to the Confluence draft

9. **Required resources.** Scenario 3 lists StudentInterventionAssociation as a
   required resource, but the event does not reference it. The API does not
   enforce the link. State the certification rule instead: every event must
   match an existing StudentInterventionAssociation for the same student and
   intervention, unless the scenario creates that association first.
10. **Key and corrections.** The natural key includes `eventDate` and
    `attendanceEventCategoryDescriptor`, and the API does not allow key changes
    on this resource. Correcting a category (for example Unexcused to Excused)
    takes a DELETE and a POST, not a PUT.
11. **One event per day.** Because the key has no time of day, a second session
    on the same date in the same category overwrites the first. Products that
    deliver more than one session a day publish one event with the total
    minutes.
12. **Namespaced category check.** Add to Scenario 3's test activities a
    check that the provider uses its own namespaced AttendanceEventCategory
    descriptors where the defaults don't fit (for example, a session not
    held), per the 21-Oct workgroup agreement. Required only for products that
    record such sessions. These events are excluded from delivered minutes
    and session counts, and are reported separately. Scheduled vs. held
    sessions stays a future consideration.
13. **Absences.** Publish `interventionDuration` 0 on absence events, so every
    event has the certification-required duration.

## Assigned vs. Delivered Dosage Scenarios

These scenarios check that the data published in the StudentInterventionAssociation
and StudentInterventionAttendanceEvent scenarios supports fidelity tracking:
assigned minutes on the association can be compared with delivered minutes
summed from attendance events. No new resources are published. The scenarios
read back what the provider published and calculate the comparison.

### Prerequisites

- StudentInterventionAssociation Scenarios 1 to 4 completed.
- StudentInterventionAttendanceEvent Scenarios 1 to 7 completed, plus
  Scenario 8 where the product records sessions not held.

### Scenarios

1. Read student `604863`'s assignment to `READ-T2-001` and confirm the assigned
   minutes.
2. Read student `604863`'s attendance events for `READ-T2-001` and confirm the
   delivered minutes for each session.
3. Calculate assigned vs. delivered minutes and confirm the results.

| Resource | Property Name | Is Collection | Data Type | Required | Scenario 1: GET | Scenario 2: GET |
| --- | --- | --- | --- | --- | --- | --- |
| StudentInterventionAssociation | studentReference | FALSE | studentReference | REQUIRED | | |
| studentReference | studentUniqueId | FALSE | string | REQUIRED | 604863 | |
| StudentInterventionAssociation | interventionReference | FALSE | interventionReference | REQUIRED | | |
| interventionReference | educationOrganizationId | FALSE | integer | REQUIRED | 255901 | |
| interventionReference | interventionIdentificationCode | FALSE | string | REQUIRED | READ-T2-001 | |
| StudentInterventionAssociation | dosage | FALSE | integer | REQUIRED | 900 | |
| StudentInterventionAttendanceEvent | studentReference | FALSE | studentReference | REQUIRED | | |
| studentReference | studentUniqueId | FALSE | string | REQUIRED | | 604863 |
| StudentInterventionAttendanceEvent | interventionReference | FALSE | interventionReference | REQUIRED | | |
| interventionReference | educationOrganizationId | FALSE | integer | REQUIRED | | 255901 |
| interventionReference | interventionIdentificationCode | FALSE | string | REQUIRED | | READ-T2-001 |
| StudentInterventionAttendanceEvent | eventDate | FALSE | date | REQUIRED | | See expected events |
| StudentInterventionAttendanceEvent | attendanceEventCategoryDescriptor | FALSE | attendanceEventCategoryDescriptor | REQUIRED | | See expected events |
| StudentInterventionAttendanceEvent | interventionDuration | FALSE | integer | REQUIRED | | See expected events |

### Scenario 1: GET `/ed-fi/studentInterventionAssociations`

Query: `?studentUniqueId=604863&educationOrganizationId=255901&interventionIdentificationCode=READ-T2-001`

Expected: exactly one record, with `dosage` 900 (set by the
StudentInterventionAssociation Scenario 3 update).

### Scenario 2: GET `/ed-fi/studentInterventionAttendanceEvents`

Query: `?studentUniqueId=604863&educationOrganizationId=255901&interventionIdentificationCode=READ-T2-001`

Expected events:

| eventDate | attendanceEventCategoryDescriptor | interventionDuration | Counted toward delivered minutes | Source |
| --- | --- | --- | --- | --- |
| 2026-09-08 | In Attendance | 30 | Yes | Attendance Scenario 1 |
| 2026-09-09 | In Attendance | 25 | Yes | Attendance Scenarios 2 and 5 |
| 2026-09-10 | Partial | 15 | Yes | Attendance Scenario 3 |
| 2026-09-11 | Excused Absence | 0 | Yes | Attendance Scenario 7 |
| 2026-09-14 | Session Not Held (provider namespace) | 0 | No | Attendance Scenario 8, where required |

No event is returned for 2026-09-11 with `Unexcused Absence`. Attendance
Scenario 6 deleted it.

### Scenario 3: Calculate assigned vs. delivered minutes

No API call. The comparison is calculated from the records returned by
Scenarios 1 and 2.

| Measure | Rule | Expected |
| --- | --- | --- |
| Assigned minutes | `dosage` on the StudentInterventionAssociation | 900 |
| Delivered minutes | Sum of `interventionDuration` across the student's events for the intervention, excluding "session not held" categories | 70 |
| Percent delivered | Delivered minutes ÷ assigned minutes, rounded to one decimal place | 7.8% |
| Minutes remaining | Assigned minutes − delivered minutes | 830 |
| Sessions attended | Events with `In Attendance`, `Present`, `Partial`, `Tardy`, or `Early departure` | 3 |
| Sessions missed | Events with `Excused Absence` or `Unexcused Absence` | 1 |
| Sessions not held | Events in a provider "session not held" category; reported separately, not counted above | 1 where Attendance Scenario 8 applies, otherwise 0 |

### Comments

#### Notes

- Every event returned by Scenario 2 matches the assignment returned by
  Scenario 1 (same student and intervention), as the attendance scenarios
  require.
- Every event date falls within the intervention's `beginDate` (2026-08-24) and
  `endDate` (2027-05-28).
- Events in "session not held" categories are excluded from delivered minutes
  and from session counts. Distinguishing scheduled from held sessions is a
  future consideration for the Data Standard and certification. Until then,
  these events are reported separately so they don't count against the
  student's attendance.
- Provider-namespaced categories other than "session not held" must map to
  either attended or missed. The provider documents that mapping as part of
  certification.
- Delivered minutes can exceed assigned minutes. That is a fidelity finding,
  not a certification failure.
- **Open question: who performs Scenario 3, and what counts as a pass.**
  Options under consideration:
  - **Ed-Fi validator calculates.** The certification validator computes the
    measures from the ODS and compares them with the expected values above.
    Pass if they match. This checks the published data only.
  - **Provider demonstrates.** The provider shows the same student and
    intervention in its own fidelity or dosage report. Pass if the product's
    assigned and delivered minutes match the measures calculated from the
    ODS. This also checks that the published data agrees with what the
    product shows users.
- **Open question: sessions attended vs. sessions scheduled.** One state
  agency measures fidelity as sessions attended compared with sessions
  scheduled, including sessions scheduled but not held. This draft compares
  delivered minutes with assigned minutes. The 21-Oct workgroup moved
  scheduled vs. held sessions to future consideration and is asking agencies
  whether they need it.

#### Proposed changes to the Confluence draft

14. **Calculation rules.** Add the category mapping (attended: `In Attendance`,
    `Present`, `Partial`, `Tardy`, `Early departure`; missed: `Excused Absence`,
    `Unexcused Absence`). Require providers to document how their own
    categories map. Round percent delivered to one decimal place. State that
    delivering more than assigned is a fidelity finding, not a failure.
15. **Open question.** Decide who performs the comparison and what counts as a
    pass: the Ed-Fi validator calculating from the ODS, or the provider
    showing a matching report in its product.

## Staff Association Scenarios

These scenarios check that every published intervention can be linked to at
least one valid staff member responsible for delivering it. Certification
accepts either of two paths. A provider completes the scenarios for the path
its product uses, not both.

- **Path 1: Intervention.Staffs.** Staff are listed on the Intervention's
  `staffs` collection. This suits products where the same staff deliver the
  intervention to every participating student.
- **Path 2: StaffCohortAssociation.** Staff are associated with a Cohort, and
  each StudentInterventionAssociation references that Cohort through
  `cohortReference`. This suits products that deliver an intervention to
  groups, where staff differ by group.

Cohort and StudentCohortAssociation remain optional in v1. They are needed
only for Path 2. Assigning staff to an individual student's plan is not
supported in Data Standard 5. It is a Data Standard 7 item and not part of v1.

Per the 21-Oct workgroup agreement, elements that move in Data Standard 7 and
are not required by the model must be sent, but certification is flexible on
the path they take. For staff, that means either path above.

**Open question: staff requirement.** Agencies are split on whether staff
should be required for certification. Some track staff by student, cohort, or
role rather than by name. The workgroup is asking agencies to confirm, so treat
the staff requirement as provisional.

### Prerequisites

- Intervention `READ-T2-001` for education organization `255901` (Intervention
  Scenarios 1 and 3).
- Student `604863` assigned to `READ-T2-001` (StudentInterventionAssociation
  Scenarios 1 and 3).
- Staff `207288` and `207289`, each with a
  StaffEducationOrganizationAssignmentAssociation within `255901`. The ODS/API
  authorizes StaffCohortAssociation through the staff member's assignment.

### Path 1 Scenarios: Intervention.Staffs

1. Read `READ-T2-001` and confirm it lists staff `207288` and `207289`, added
   by Intervention Scenarios 1 and 3.
2. Update `READ-T2-001` to remove staff `207289`, leaving `207288`.

| Resource | Property Name | Is Collection | Data Type | Required | Scenario 1: GET | Scenario 2: PUT |
| --- | --- | --- | --- | --- | --- | --- |
| Intervention | interventionIdentificationCode | FALSE | string | REQUIRED | READ-T2-001 | READ-T2-001 |
| Intervention | educationOrganizationReference | FALSE | educationOrganizationReference | REQUIRED | | |
| educationOrganizationReference | educationOrganizationId | FALSE | integer | REQUIRED | 255901 | 255901 |
| Intervention | staffs | TRUE | interventionStaff | REQUIRED | | |
| interventionStaff | staffReference | FALSE | staffReference | REQUIRED | | |
| staffReference | staffUniqueId | FALSE | string | REQUIRED | 207288 | 207288 |
| staffReference | staffUniqueId | FALSE | string | REQUIRED | 207289 | |

#### Path 1 Scenario 1: GET `/ed-fi/interventions`

Query: `?educationOrganizationId=255901&interventionIdentificationCode=READ-T2-001`

Expected: one record whose `staffs` collection contains `207288` and `207289`.

#### Path 1 Scenario 2: PUT `/ed-fi/interventions/{id}`

`{id}` is the resource id of `READ-T2-001`. The `staffs` collection is
replaced in full, so omitting `207289` removes it.

```json
{
  "interventionIdentificationCode": "READ-T2-001",
  "educationOrganizationReference": {
    "educationOrganizationId": 255901
  },
  "interventionClassDescriptor": "uri://ed-fi.org/InterventionClassDescriptor#Practice",
  "deliveryMethodDescriptor": "uri://ed-fi.org/DeliveryMethodDescriptor#Small Group",
  "beginDate": "2026-08-24",
  "endDate": "2027-05-28",
  "minDosage": 300,
  "maxDosage": 1800,
  "namespace": "uri://www.intervention-provider.com",
  "diagnoses": [
    {
      "diagnosisDescriptor": "uri://www.intervention-provider.com/DiagnosisDescriptor#Reading Fluency"
    }
  ],
  "staffs": [
    {
      "staffReference": {
        "staffUniqueId": "207288"
      }
    }
  ],
  "meetingTimes": [
    {
      "startTime": "09:00:00",
      "endTime": "09:30:00"
    }
  ]
}
```

### Path 2 Scenarios: StaffCohortAssociation

1. Create cohort `READ-T2-001-GRP-A` for the small group that receives
   `READ-T2-001`.
2. Associate staff `207288` with the cohort.
3. Associate staff `207289` with the cohort.
4. Update student `604863`'s assignment to `READ-T2-001` to reference the
   cohort.
5. Update staff `207288`'s association: they stop delivering the group on
   2026-12-18.
6. Delete staff `207289`'s association, which was recorded in error.

| Resource | Property Name | Is Collection | Data Type | Required | Scenario 1: POST | Scenario 2: POST | Scenario 3: POST | Scenario 4: PUT | Scenario 5: PUT | Scenario 6: DELETE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cohort | cohortIdentifier | FALSE | string | REQUIRED | READ-T2-001-GRP-A | | | | | |
| Cohort | educationOrganizationReference | FALSE | educationOrganizationReference | REQUIRED | | | | | | |
| educationOrganizationReference | educationOrganizationId | FALSE | integer | REQUIRED | 255901 | | | | | |
| Cohort | cohortTypeDescriptor | FALSE | cohortTypeDescriptor | REQUIRED | Academic Intervention | | | | | |
| Cohort | cohortScopeDescriptor | FALSE | cohortScopeDescriptor | OPTIONAL | District | | | | | |
| Cohort | academicSubjectDescriptor | FALSE | academicSubjectDescriptor | OPTIONAL | Reading | | | | | |
| Cohort | cohortDescription | FALSE | string | OPTIONAL | READ-T2-001 small group A | | | | | |
| StaffCohortAssociation | staffReference | FALSE | staffReference | REQUIRED | | | | | | |
| staffReference | staffUniqueId | FALSE | string | REQUIRED | | 207288 | 207289 | | 207288 | 207289 |
| StaffCohortAssociation | cohortReference | FALSE | cohortReference | REQUIRED | | | | | | |
| cohortReference | cohortIdentifier | FALSE | string | REQUIRED | | READ-T2-001-GRP-A | READ-T2-001-GRP-A | | READ-T2-001-GRP-A | READ-T2-001-GRP-A |
| cohortReference | educationOrganizationId | FALSE | integer | REQUIRED | | 255901 | 255901 | | 255901 | 255901 |
| StaffCohortAssociation | beginDate | FALSE | date | REQUIRED | | 2026-08-24 | 2026-08-24 | | 2026-08-24 | 2026-08-24 |
| StaffCohortAssociation | endDate | FALSE | date | OPTIONAL | | | | | 2026-12-18 | |
| StaffCohortAssociation | studentRecordAccess | FALSE | boolean | OPTIONAL | | true | true | | true | |
| StudentInterventionAssociation | studentReference | FALSE | studentReference | REQUIRED | | | | | | |
| studentReference | studentUniqueId | FALSE | string | REQUIRED | | | | 604863 | | |
| StudentInterventionAssociation | interventionReference | FALSE | interventionReference | REQUIRED | | | | | | |
| interventionReference | educationOrganizationId | FALSE | integer | REQUIRED | | | | 255901 | | |
| interventionReference | interventionIdentificationCode | FALSE | string | REQUIRED | | | | READ-T2-001 | | |
| StudentInterventionAssociation | cohortReference | FALSE | cohortReference | REQUIRED (Path 2) | | | | | | |
| cohortReference | cohortIdentifier | FALSE | string | REQUIRED | | | | READ-T2-001-GRP-A | | |
| cohortReference | educationOrganizationId | FALSE | integer | REQUIRED | | | | 255901 | | |
| StudentInterventionAssociation | dosage | FALSE | integer | REQUIRED | | | | 900 | | |
| StudentInterventionAssociation | diagnosticStatement | FALSE | string | OPTIONAL | | | | Student demonstrates reading fluency needs. | | |

#### Path 2 Scenario 1: POST `/ed-fi/cohorts`

```json
{
  "cohortIdentifier": "READ-T2-001-GRP-A",
  "educationOrganizationReference": {
    "educationOrganizationId": 255901
  },
  "cohortTypeDescriptor": "uri://ed-fi.org/CohortTypeDescriptor#Academic Intervention",
  "cohortScopeDescriptor": "uri://ed-fi.org/CohortScopeDescriptor#District",
  "academicSubjectDescriptor": "uri://ed-fi.org/AcademicSubjectDescriptor#Reading",
  "cohortDescription": "READ-T2-001 small group A"
}
```

#### Path 2 Scenario 2: POST `/ed-fi/staffCohortAssociations`

```json
{
  "staffReference": {
    "staffUniqueId": "207288"
  },
  "cohortReference": {
    "cohortIdentifier": "READ-T2-001-GRP-A",
    "educationOrganizationId": 255901
  },
  "beginDate": "2026-08-24",
  "studentRecordAccess": true
}
```

#### Path 2 Scenario 3: POST `/ed-fi/staffCohortAssociations`

```json
{
  "staffReference": {
    "staffUniqueId": "207289"
  },
  "cohortReference": {
    "cohortIdentifier": "READ-T2-001-GRP-A",
    "educationOrganizationId": 255901
  },
  "beginDate": "2026-08-24",
  "studentRecordAccess": true
}
```

#### Path 2 Scenario 4: PUT `/ed-fi/studentInterventionAssociations/{id}`

`{id}` is the resource id of student `604863`'s association to `READ-T2-001`.

```json
{
  "studentReference": {
    "studentUniqueId": "604863"
  },
  "interventionReference": {
    "educationOrganizationId": 255901,
    "interventionIdentificationCode": "READ-T2-001"
  },
  "cohortReference": {
    "cohortIdentifier": "READ-T2-001-GRP-A",
    "educationOrganizationId": 255901
  },
  "dosage": 900,
  "diagnosticStatement": "Student demonstrates reading fluency needs."
}
```

#### Path 2 Scenario 5: PUT `/ed-fi/staffCohortAssociations/{id}`

`{id}` is the resource id of staff `207288`'s association returned by Path 2
Scenario 2.

```json
{
  "staffReference": {
    "staffUniqueId": "207288"
  },
  "cohortReference": {
    "cohortIdentifier": "READ-T2-001-GRP-A",
    "educationOrganizationId": 255901
  },
  "beginDate": "2026-08-24",
  "endDate": "2026-12-18",
  "studentRecordAccess": true
}
```

#### Path 2 Scenario 6: DELETE `/ed-fi/staffCohortAssociations/{id}`

`{id}` is the resource id of staff `207289`'s association returned by Path 2
Scenario 3. No body.

### Comments

#### Path 1 notes

- Adding staff is covered by Intervention Scenario 3, which adds `207289`.
- The intervention must keep at least one staff member. Removing the last one
  leaves the intervention without a valid staff link, which fails
  certification on Path 1.

#### Path 2 notes

- The link from intervention to staff is: Intervention ←
  StudentInterventionAssociation (`cohortReference`) → Cohort ←
  StaffCohortAssociation → Staff. Certification checks that each published
  intervention has at least one StudentInterventionAssociation whose cohort
  has at least one StaffCohortAssociation with a valid staff member.
- Cohort's natural key is `cohortIdentifier` (max 36 characters) +
  `educationOrganizationReference`. `cohortTypeDescriptor` is required.
- StaffCohortAssociation's natural key is `staffReference` + `cohortReference`
  + `beginDate`. The API does not support key changes on this resource, so a
  PUT can change only `endDate` and `studentRecordAccess`. Changing the begin
  date takes a DELETE and a POST.
- An association with an `endDate` still counts as a valid staff link for the
  sessions delivered before that date. Scenario 5 does not remove the link.
- `cohortReference` is not part of the StudentInterventionAssociation key, so a
  PUT can add, change, or remove it.
- The cohort's `educationOrganizationId` can differ from the intervention's,
  for example a school-level cohort for a district intervention.
- DS 5.2 CohortType default values include `Academic Intervention`,
  `Attendance Intervention`, and `Classroom Pullout`. CohortScope default
  values include `Classroom`, `District`, `School`, and `Teacher`.
- StudentCohortAssociation is not required on Path 2. The student is linked to
  the cohort through the StudentInterventionAssociation `cohortReference`.

#### Proposed changes to the Confluence draft

16. **Cohort type.** Path 2 requires a Cohort, and Cohort requires
    `cohortTypeDescriptor` (for example `Academic Intervention`). Add it to the
    Path 2 requirements.
17. **StaffCohortAssociation key.** The natural key includes `beginDate`, and
    the API does not allow key changes. An update can change only `endDate`
    and `studentRecordAccess`. Note this in the Scenario 5 update step.
18. **Staff authorization.** The ODS/API authorizes StaffCohortAssociation
    through the staff member's StaffEducationOrganizationAssignmentAssociation.
    Add it as a prerequisite for Path 2.
19. **Path 2 pass rule.** State that each intervention needs at least one
    StudentInterventionAssociation whose cohort has at least one
    StaffCohortAssociation, and that an end-dated association still counts.

## Recovery and Resubmission Scenarios

These scenarios check that the provider can recover from synchronization
failures or missing records. Ed-Fi removes a subset of the records published in
the earlier scenarios from the certification sandbox. The provider restores
them through its normal synchronization process, not by hand-crafted API calls.
Ed-Fi then confirms the restored data matches what was there before.

### Prerequisites

- Intervention, StudentInterventionAssociation, StudentInterventionAttendanceEvent,
  Assigned vs. Delivered Dosage, and Staff Association scenarios completed on
  the provider's chosen staff path.
- The provider's product still holds the source data for every record below.

### Scenarios

1. Ed-Fi deletes one attendance event: the 2026-09-10 `Partial` event.
2. Ed-Fi deletes student `604863`'s assignment to `READ-T2-001` and the
   student's remaining attendance events for that intervention.
3. Ed-Fi deletes intervention `READ-T2-001`. With step 2 complete, nothing
   references it.
4. Path 2 only: Ed-Fi deletes staff `207288`'s StaffCohortAssociation. Cohort
   `READ-T2-001-GRP-A` is left in place.
5. The provider runs its normal synchronization.
6. Ed-Fi reads back the restored records and recalculates assigned vs.
   delivered minutes.

Records removed by Ed-Fi and the state expected after synchronization:

| Step | Resource | Record (natural key) | Expected after synchronization |
| --- | --- | --- | --- |
| 1 | StudentInterventionAttendanceEvent | 604863 / READ-T2-001 / 2026-09-10 / Partial | Restored: `interventionDuration` 15, `attendanceEventReason` "Left early for nurse visit" |
| 2 | StudentInterventionAssociation | 604863 / 255901 / READ-T2-001 | Restored: `dosage` 900, `diagnosticStatement` unchanged; Path 2: `cohortReference` READ-T2-001-GRP-A |
| 2 | StudentInterventionAttendanceEvent | 604863 / READ-T2-001 / 2026-09-08 / In Attendance | Restored: `interventionDuration` 30 |
| 2 | StudentInterventionAttendanceEvent | 604863 / READ-T2-001 / 2026-09-09 / In Attendance | Restored: `interventionDuration` 25 (the Attendance Scenario 5 value, not the original 30) |
| 2 | StudentInterventionAttendanceEvent | 604863 / READ-T2-001 / 2026-09-11 / Excused Absence | Restored: `interventionDuration` 0, `attendanceEventReason` "Family emergency" |
| 2 | StudentInterventionAttendanceEvent | 604863 / READ-T2-001 / 2026-09-14 / Session Not Held | Restored, where Attendance Scenario 8 applies |
| 3 | Intervention | 255901 / READ-T2-001 | Restored with the Intervention Scenario 3 values; Path 1: `staffs` contains only `207288` |
| 4 | StaffCohortAssociation (Path 2) | 207288 / READ-T2-001-GRP-A / 255901 / 2026-08-24 | Restored: `endDate` 2026-12-18, `studentRecordAccess` true |

Records that must **not** reappear, because the provider deleted them in
earlier scenarios:

| Resource | Record (natural key) | Deleted by |
| --- | --- | --- |
| Intervention | 255901 / ATTD-T2-001 | Intervention Scenario 4 |
| StudentInterventionAssociation | 604854 / 255901 / READ-T2-001 | StudentInterventionAssociation Scenario 4 |
| StudentInterventionAttendanceEvent | 604863 / READ-T2-001 / 2026-09-11 / Unexcused Absence | Attendance Scenario 6 |
| StaffCohortAssociation (Path 2) | 207289 / READ-T2-001-GRP-A / 255901 / 2026-08-24 | Staff Path 2 Scenario 6 |
| Intervention `staffs` item (Path 1) | READ-T2-001 / 207289 | Staff Path 1 Scenario 2 |

### Scenario 6: Verify the restored records

Ed-Fi repeats these reads and compares the results with the tables above:

- GET `/ed-fi/interventions?educationOrganizationId=255901&interventionIdentificationCode=READ-T2-001`
- GET `/ed-fi/interventions?educationOrganizationId=255901&interventionIdentificationCode=ATTD-T2-001`
  (expect no records)
- GET `/ed-fi/studentInterventionAssociations?educationOrganizationId=255901&interventionIdentificationCode=READ-T2-001`
  (expect only `604863`)
- GET `/ed-fi/studentInterventionAttendanceEvents?studentUniqueId=604863&educationOrganizationId=255901&interventionIdentificationCode=READ-T2-001`
- Path 2: GET `/ed-fi/staffCohortAssociations?cohortIdentifier=READ-T2-001-GRP-A&educationOrganizationId=255901`
  (expect only `207288`)

Ed-Fi then repeats Assigned vs. Delivered Dosage Scenario 3. Expected: 900
assigned minutes, 70 delivered, 7.8% delivered, the same as before the
deletions.

### Pass Criteria

The provider passes if, after one normal synchronization:

- Every removed record is restored with the same natural key and the latest
  values the provider had published.
- No record deleted by the provider in an earlier scenario reappears.
- Relationships are intact: every event matches the restored assignment, the
  assignment references the restored intervention, and the intervention links
  to at least one valid staff member on the provider's path.
- The assigned vs. delivered calculation gives the same results as before the
  deletions.

### Comments

#### Notes

- "Consistent identifiers" means the same natural keys: student, intervention
  code, education organization, event date and category, cohort identifier,
  and begin date. The resource `id` is generated by the ODS/API, so a restored
  record gets a new `id`. Certification does not compare `id` values.
- The ODS/API enforces some of the dependency order. An attendance event and an
  assignment both reference the intervention, so the intervention must be
  restored first. A StaffCohortAssociation references the cohort, which was
  not deleted. Certification also requires each event to match an assignment
  (see the attendance scenarios), so the assignment must be restored before
  its events.
- The provider chooses how to detect the missing records. One option is the
  ODS/API Change Queries deletes endpoints (for example
  `/ed-fi/studentInterventionAttendanceEvents/deletes`). Another is comparing
  its own data with the ODS. A third is republishing everything in scope.
- Restoring a record with values older than the latest ones fails. For
  example, the 2026-09-09 event must come back with 25 minutes, not 30.

#### Proposed changes to the Confluence draft

20. **Identifiers.** Define "consistent identifiers" as natural keys. Restored
    records get a new resource `id` from the ODS/API.
21. **Pass criteria.** Add three checks: records the provider deleted earlier
    must not reappear, restored records must carry the latest values, and the
    assigned vs. delivered calculation must match the pre-deletion results.
