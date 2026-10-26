# Audit Logging

The Admin App API keeps an audit trail of who changed what, and of sign-in activity. Entries are
written to the `audit_log` table in the Admin App database (PostgreSQL or SQL Server). There is no
API or UI for reading the log; query the table with SQL.

## What is logged

Every entry has an `eventType`:

| `eventType`    | Produced when                                                                   |
| -------------- | ------------------------------------------------------------------------------- |
| `Action`       | A `POST`, `PUT`, `PATCH` or `DELETE` request reaches the API, whatever the outcome. |
| `LoginSuccess` | An OIDC login completes and the session is saved.                               |
| `LoginFailure` | An OIDC login fails. One row per login attempt.                                 |
| `Logout`       | `auth/logout` is called, including without a session (the actor is then null).  |

A session that ends other than through `auth/logout` leaves no `Logout` row, for example when the
session of a deactivated user is destroyed on that user's next request.

Because `POST /api/auth/logout` is a write request, one logout produces two rows: the `Logout` row and an
`Action` row for the request (status 302, the redirect). The login callback is a `GET`, so a login
produces only a `LoginSuccess` or `LoginFailure` row.

`Action` rows are written by a middleware that runs before the body parser and the CSRF origin guard,
so requests rejected by those, or by an authorization guard, are recorded too, with their final
`statusCode` (for example 400, 401 or 403). The actor is resolved when the response finishes, and is
null if the request was rejected before authentication. Callers that authenticate with a machine
(client credentials) bearer token are recorded with `actorType = 'machine'`. A human's bearer token is
recorded with `actorType = 'user'`, and, having no session, has no `oidcIssuer`. Requests made with a session also carry `oidcIssuer`, the issuer URL of the
OIDC provider the session was authenticated through; it is null for bearer-token callers and
unauthenticated requests.

If the connection closes before the response is finished (for example the client disconnects early),
the row gets the sentinel `statusCode = 499` ("client closed request"). The outcome of such a request
is unknown: the handler may or may not have completed its change.

Not logged:

- `GET` and other read-only requests.
- Request bodies, headers, cookies, tokens and session ids.
- Query strings, which are stripped from `httpUrl`.

### Login events

Login and logout rows carry `sourceIpAddress` and `oidcIssuer` (the issuer URL of the OIDC provider
used to sign in). On failures, `details`
holds a short reason code, never the raw error message:

| `details`        | Meaning                                                                    |
| ---------------- | -------------------------------------------------------------------------- |
| `user-not-found` | The provider authenticated the user but no Admin App user exists.          |
| `no-role`        | The user exists but has no role assigned.                                  |
| `error`          | Any other failure.                                                         |

A `LoginFailure` row records the username claimed by the identity provider. The Admin App has not
verified that claim, so treat it as unconfirmed. `actorUsername` is null when no claim is available.
`LoginSuccess` rows have `actorType = 'user'`.

## The `audit_log` table

The table has no foreign keys. Entries are denormalized (names, not ids) so they outlive the rows they
describe. The application only inserts into it; it never updates or deletes entries.

| Column            | PostgreSQL                 | SQL Server              | Notes                                                    |
| ----------------- | -------------------------- | ----------------------- | -------------------------------------------------------- |
| `id`              | `bigint` identity, PK      | `BIGINT` identity, PK   | Constraint `PK_audit_log`.                               |
| `eventType`       | `varchar(30)` not null     | `NVARCHAR(30)` not null | See above.                                               |
| `timestamp`       | `timestamptz` not null     | `datetimeoffset` not null | An absolute instant, when the request or login event started. Indexed (`IDX_audit_log_timestamp`). |
| `actorUsername`   | `varchar(256)`             | `NVARCHAR(256)`         | Null if unknown. Indexed (`IDX_audit_log_actorUsername`). |
| `actorType`       | `varchar(20)`              | `NVARCHAR(20)`          | `user` or `machine`; null if unknown. Human bearer-token callers are `user`. |
| `sourceIpAddress` | `varchar(45)`              | `NVARCHAR(45)`          | Client address as seen by Express (`req.ip`).            |
| `httpVerb`        | `varchar(10)`              | `NVARCHAR(10)`          | `Action` rows only.                                      |
| `httpUrl`         | `varchar(2048)`            | `NVARCHAR(2048)`        | `Action` rows only; no query string.                     |
| `statusCode`      | `integer`                  | `INT`                   | `Action` rows only.                                      |
| `oidcIssuer`      | `varchar(512)`             | `NVARCHAR(512)`         | Issuer URL of the OIDC provider the session was authenticated through (not the numeric provider id, which means nothing once that provider row is deleted); set on login, logout and on every write request made with a session; null for bearer-token callers and unauthenticated requests. |
| `details`         | `text`                     | `NVARCHAR(max)`         | Delete snapshot JSON, or login failure reason.           |

The table is created by migration `1792000000001-CreateAuditLog` for both engines. Before storage,
every string column except `details` is capped at its column length (for example `actorUsername` at
256 characters, `sourceIpAddress` at 45, `httpUrl` at 2048), and control characters are removed from
them.

## Delete snapshots

A deleted row can no longer be looked up, so for deletes of the entities below the `Action` row's
`details` column holds a JSON snapshot of the entity taken just before the handler runs. Each snapshot
is an allowlist of fields and uses names rather than ids. Email fields, secrets, credentials and tokens
are never included; note that a `username` is often an email address and is stored as is.

| Entity                 | Snapshot fields                                           |
| ---------------------- | --------------------------------------------------------- |
| User                   | `username`, `userType`, `role`                            |
| Team                   | `name`                                                    |
| Ownership              | `team`, `role`, `resourceType`, `resource` (an ODS or edorg resource is labelled with its tenant, e.g. `ods_1 (tenant1)`) |
| User team membership   | `username`, `team`, `role`                                |
| Ed-Fi tenant           | `name`, `environment`                                     |
| ODS                    | `dbName`, `tenant`                                        |
| Education organization | `nameOfInstitution`, `educationOrganizationId`, `ods`     |
| Role                   | `name`, `type`                                            |
| Integration provider   | `name`                                                    |
| Environment            | `name` (its URL and encrypted configuration are not read) |

Limits:

- The snapshot is taken only after the authorization guard passes. A delete denied with 401 or 403
  gets the basic `Action` row and no snapshot. The same applies when the handler itself rejects the
  delete after the snapshot was loaded (any response status of 400 or above): the row is kept
  without `details`, because nothing was deleted.
- There is no snapshot if the id is not numeric or the row does not exist, or if loading it fails (a
  warning goes to the application log and the request proceeds).
- Admin API resources (Starting Blocks v1, v2 and v3) are snapshotted from the Ed-Fi Admin API:
  v1 vendors, applications and claim sets; v2 and v3 vendors, applications, API clients, claim sets,
  instances (read from the local ODS row) and profiles. The snapshot is one extra read before the
  delete, so those deletes call the Admin API once more than before (some handlers read the
  resource again themselves). The read waits at most 5 seconds; on a timeout or error the delete
  proceeds and the row has no snapshot.
- Admin API snapshots rely on the controller's interceptor order: `AuditAdminApiDeleteInterceptor`
  must come after `SbEnvironmentEdfiTenantInterceptor`, which sets the tenant on the request. If it
  runs before, no snapshot is taken and a warning (`Admin API delete snapshot skipped`) is logged.

## Configuration

`AUDIT_LOGGING_ENABLED` turns audit logging on or off. It defaults to on, and an unset variable means
on. Only an explicit `false` (any case) turns it off; any other value, such as `0` or `no`, leaves it
on. When it is off, a warning is logged at startup. It is read from the environment variable of the same name (see
`packages/api/config/custom-environment-variables.js`; with Docker Compose, set it in `compose/.env`)
once at startup, so changing it requires a
restart of the API. When it is off, no rows are written, the background writer does nothing, and
deletes do not load the entity for a snapshot.

## Queue, retries and fallback

Requests do not wait for audit rows to be written. Events are sanitized and put in an in-memory
queue with a capacity of 10 000 events. The only wait on the request path is the delete snapshot: a
delete of one of the entities listed under [Delete snapshots](#delete-snapshots) waits for the entity
to be loaded before its handler runs. For Admin API resources that load is a call to the Ed-Fi Admin
API, which is waited on for at most 5 seconds; after that the delete proceeds and its row has no
snapshot.

- A background writer flushes every 1 second. Within a tick it keeps writing batches of up to 100
  events for as long as at least a full batch is waiting, so a backlog drains faster than 100 events
  per second.
- A failed insert is retried twice, after 250 ms and 1 000 ms. If the third attempt fails, the application log gets `Audit insert failed after 3 attempts: {error}`. When the error is a
  database error, the events of the batch are then inserted one at a time, so one bad event cannot
  keep the others out of the table. When the database cannot be reached (connection errors), that
  fallback is skipped and the whole batch is written to the application log, so an outage does not
  hold the writer for minutes. Each event that is not persisted is written to the application log
  (`Audit event not persisted: {json}`).
- When the queue is full, the new event is written to the application log instead
  (`Audit queue full, event not persisted: {json}`).
- On graceful shutdown the writer finishes any in-flight batch and drains the queue, waiting at most
  5 seconds. Events still unwritten after that (for example because the database hangs) are written
  to the application log (`Audit event not persisted: {json}`).
- Events still in memory are lost if the process is killed without a graceful shutdown.

A failure while recording an event is logged and never affects the request.

## Retention

The Admin App does not purge or archive the table. Rows accumulate until the operator removes them,
for example with a scheduled job that deletes by `timestamp`. The table is append-only by application
behaviour only; use database permissions if you need protection against tampering.

## Examples

Sample rows (some columns omitted; `actorType`, `sourceIpAddress` and `oidcIssuer` are also populated):

| id  | eventType    | timestamp (UTC)     | actorUsername     | httpVerb | httpUrl                | statusCode | details                         |
| --- | ------------ | ------------------- | ----------------- | -------- | ---------------------- | ---------- | ------------------------------- |
| 101 | LoginSuccess | 2026-10-20 14:02:11 | maria@example.org |          |                        |            |                                 |
| 102 | Action       | 2026-10-20 14:05:40 | maria@example.org | POST     | /api/teams             | 201        |                                 |
| 103 | Action       | 2026-10-20 14:09:02 | maria@example.org | DELETE   | /api/teams/12          | 200        | `{"name":"District Analytics"}` |
| 104 | Action       | 2026-10-20 14:11:37 | sam@example.org   | DELETE   | /api/teams/12          | 403        |                                 |
| 105 | LoginFailure | 2026-10-20 15:30:05 | lee@example.org   |          |                        |            | `user-not-found`                |
| 106 | Logout       | 2026-10-20 16:00:00 | maria@example.org |          |                        |            |                                 |
| 107 | Action       | 2026-10-20 16:00:00 | maria@example.org | POST     | /api/auth/logout       | 302        |                                 |

Row 104 was denied by authorization, so it has no snapshot. Rows 106 and 107 are the two rows one logout produces.

`timestamp` is an absolute instant on both engines, whatever the time zone of the API host:
PostgreSQL `timestamptz` (shown in the session time zone) and SQL Server `datetimeoffset` (stored with
the API host's UTC offset at the time of the event). Compare it with `NOW()` on PostgreSQL and
`SYSDATETIMEOFFSET()` on SQL Server, as below; both comparisons are offset-aware.

PostgreSQL needs double quotes around the camelCase column names. SQL Server accepts brackets, or the
bare names.

PostgreSQL:

```sql
-- Failed logins in the last 24 hours
SELECT "timestamp", "actorUsername", "sourceIpAddress", "details"
FROM audit_log
WHERE "eventType" = 'LoginFailure' AND "timestamp" > NOW() - INTERVAL '1 day'
ORDER BY "timestamp" DESC;

-- Deletes with their snapshots, newest first
SELECT "timestamp", "actorUsername", "httpUrl", "statusCode", "details"
FROM audit_log
WHERE "eventType" = 'Action' AND "httpVerb" = 'DELETE'
ORDER BY "timestamp" DESC;
```

SQL Server:

```sql
-- Failed logins in the last 24 hours
SELECT [timestamp], [actorUsername], [sourceIpAddress], [details]
FROM audit_log
WHERE [eventType] = 'LoginFailure' AND [timestamp] > DATEADD(day, -1, SYSDATETIMEOFFSET())
ORDER BY [timestamp] DESC;

-- Deletes with their snapshots, newest first
SELECT [timestamp], [actorUsername], [httpUrl], [statusCode], [details]
FROM audit_log
WHERE [eventType] = 'Action' AND [httpVerb] = 'DELETE'
ORDER BY [timestamp] DESC;
```
