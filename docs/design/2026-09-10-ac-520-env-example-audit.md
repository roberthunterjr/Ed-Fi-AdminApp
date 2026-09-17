# AC-520 — `compose/.env.example` audit

**Ticket:** [AC-520](https://edfi.atlassian.net/browse/AC-520) — Remove duplicate and/or unused variables in the `.env.example`
**Date:** 2026-09-10
**Status:** Resolved — see [Resolution](#resolution). Sections 1–4 below describe the state **before**
this change; line-number citations are relative to the pre-change tree.

## Method

Extracted all 88 active and 12 commented keys from `compose/.env.example`, then cross-referenced
each against every surface that can consume it:

| Surface | Mechanism |
|---|---|
| `compose/*.yml` | Compose `${VAR}` interpolation, before containers start |
| `compose/settings/*`, `compose/adminapp/*`, `compose/DB-Ods/*` | `sed`/`envsubst` template rendering and shell scripts |
| `eng/**/*.ps1` | Line-regex patching (see "CI coupling" below) |
| `packages/**` | Runtime `process.env` reads |

A variable is "used" only if it appears in one of these. Declaring it in `.env.example` alone does
nothing.

## Verified non-issues

Checked and ruled out, so they are not re-investigated later:

- **No literal duplicate keys.** Every key appears exactly once.
- **Inline comments are safe.** Verified with `docker compose config`: `A=pre # comment` resolves to
  `pre`. Compose's dotenv parser strips inline comments for both quoted and unquoted values.
- **`.env` self-interpolation works.** `ALLOWED_ORIGINS=${BASE_URL}` resolves to `https://localhost`.
- **Nothing hard-required is missing.** Every `${VAR}` lacking a `:-` fallback is declared.
- **Formatting is `.editorconfig`-clean.** LF, UTF-8, final newline, no trailing whitespace.

## Findings

### 1. Unused — zero references repo-wide

| Entry | Evidence |
|---|---|
| `ODS_API_VERSION_6X=6.1` | 0 hits outside `.env*` |
| `ODS_DB_IMAGE_6X=ods-api-db-ods` | 0 hits. `edfi-services.yml:665,684` hardcodes `edfialliance/ods-api-db-ods:${ODS_DB_TAG_6X}` |
| `#ODS_DB_IMAGE_6X=ods-api-db-ods-sandbox` | Broken instruction — uncommenting it does nothing, since the image name is not interpolated |
| `#ODS_DB_IMAGE_7X`, `#ODS_DB_TAG_7X` | Dead. v7 ODS DBs are `edfiadminapp/db-ods:local`, built from `compose/DB-Ods` |

The NOTE at lines 16–21 also contains a false claim: it states the 7X variables "are still used by the
v6.2 topology's own `ODS_DB_IMAGE_6X` / `ODS_DB_TAG_6X`", but `ODS_DB_IMAGE_6X` is used by nothing.

### 2. Duplicated values — 10 variables, 2 distinct strings

Eight variables hold `"wget --no-check-certificate --spider http://localhost/health"`; two hold the
`--header="tenant: tenant1"` variant. These are constants — they have never differed per environment,
so they are not configuration. All 10 are consumed at `edfi-services.yml:80–776` with **no `:-`
default**, meaning their absence is a hard failure rather than a fallback.

Naming is also inconsistent for the same concept: `*_API_HEALTHCHECK` (single-tenant) vs
`*_API_HEALTHCHECK_TEST` (multi-tenant).

`V6_API_HEALTHCHECK_TEST` has two consumers, not one: the healthcheck at `edfi-services.yml:728` and
an `API_HEALTHCHECK_TEST` container env passthrough at `edfi-services.yml:713`.

### 3. Wrong or misleading

1. **`## PostgreSQL Configuration (uncomment to use PostgreSQL instead of SQL Server)`** sits above
   three already-uncommented lines, and `POSTGRES_USER` / `POSTGRES_PASSWORD` are not engine-optional
   — every ODS and Admin database container uses them regardless of `DB_ENGINE`. Following the
   header's advice would break the whole ODS stack.
2. **`VITE_SHOW_REQUEST_CERTIFICATION=false` is inert.** `packages/fe/entrypoint.sh:15` reads it, but
   `adminapp-services.yml:193–202` never forwards it to the container. Tracked under
   [AC-603](https://edfi.atlassian.net/browse/AC-603), not fixed here.
3. **Misplaced tag comments.** The "Admin API 2.4" note sits above `ADMIN_DB_TAG_7X` (the Admin
   *database* image, not the API). The "Admin API 2.3 / use `pre`" note sits above
   `ADMIN_DB_TAG_6X=v1.4.3@sha…`, which is pinned, not `pre`; the actual `pre` is on `ADMIN_TAG_6X`.
4. **Section header drift.** `# Ed-Fi v7.3.0` while `ODS_API_TAG_7X=v7.3.2`. That block is the Admin
   API v2 topology but only the following block is labelled by Admin API version.
5. **`DB_SSL=false`** here vs `${DB_SSL:-true}` in `adminapp-services.yml:155` — divergent defaults
   for the same knob.

### 4. Missing — supported by compose, documented nowhere

`API_NODE_OPTIONS`, `KEYCLOAK_HOSTNAME`, `KEYCLOAK_HOSTNAME_PROTOCOL`, `KEYCLOAK_PORT_EXPOSED`,
`KEYCLOAK_REALM_CONFIG_TEMPLATE`, `MSSQL_PID`, `POSTGRESQL_IMAGE_TAG`. All have `:-` defaults, so they
are optional — but undiscoverable.

**Deliberately not documented: `MSSQL_DB`.** `adminapp-services.yml:91` sets it as a *container*
variable from `ADMIN_APP_DB_NAME`, but line 99's `${MSSQL_DB:-sbaa}` is interpolated by Compose from
the *host* environment. Declaring it in `.env` would desync the created database name from
`ADMIN_APP_DB_NAME`. Same token, two different resolvers.

## CI coupling — constrains any reformat

`eng/testing/run-e2e-ui.ps1:132–175` (`Set-AdminAppEnvFile`) regenerates `compose/.env` from this
file on every E2E run and, for `-DbEngine mssql`, line-regex patches it. Each of its seven rewrites
is counted separately and must match **exactly once**; anything else throws, naming the pattern and
its count (see [Resolution](#resolution) — it previously required only an aggregate of 6). These 7
lines must survive byte-for-byte, and none may be duplicated:

```
DB_ENGINE=pgsql
# MSSQL_PORT_EXPOSED=1433
# MSSQL_ACCEPT_EULA=Y
# MSSQL_SA_PASSWORD=…
# MSSQL_IMAGE_TAG=2022-latest
DB_SECRET_VALUE={"DB_HOST"…
# DB_SECRET_VALUE={"MSSQL_DB_HOST"…
```

`.env.example` is therefore not just documentation — it is a build input for the MSSQL E2E matrix.

## Out of scope

- **Certification artifact checksum** and the `CERT_BRUNO_*` quoted-default bug — see
  [AC-603](https://edfi.atlassian.net/browse/AC-603).
- `packages/api/typings/config.d.ts:99` types `CERT_BRUNO_ON_DOWNLOAD_ERROR` as
  `'error' | 'warn' | 'skip'`, but code and config use `'error' | 'warning'`.
- ~~`eng/testing/run-e2e-ui.ps1:173` sets `$expectedSubstitutions = 6` against 7 patterns~~ — pulled
  into scope and fixed. The aggregate counter is gone entirely; see [Resolution](#resolution).
- Values duplicated between `ADMIN_APP_DB_NAME` / `POSTGRES_USER` / `POSTGRES_PASSWORD` and the JSON
  inside `DB_SECRET_VALUE`, which must be kept in sync by hand.

## Resolution

### Closed by this change

| Finding | What was done |
|---|---|
| §1 Unused | `ODS_API_VERSION_6X`, `ODS_DB_IMAGE_6X` (active + commented sandbox variant), `#ODS_DB_IMAGE_7X`, `#ODS_DB_TAG_7X` removed, along with the NOTE containing the false "still used by the v6.2 topology" claim. The populated-template instruction now carries the sandbox image's own digest, which the old commented entry supplied. |
| §2 Duplicated healthchecks | All 10 variables removed. The commands moved into `edfi-services.yml`, and are now declared once each as YAML anchors — see [Follow-on](#follow-on-healthcheck-definitions-consolidated) below. `compose/readme.md` gained a Healthchecks section describing them. |
| §3.1 PostgreSQL header | `POSTGRES_USER` / `POSTGRES_PASSWORD` moved to the Shared section with an explicit note that every ODS and Admin database container needs them regardless of `DB_ENGINE`. |
| §3.3 Misplaced tag comments | Each tag now carries a comment describing the image it actually selects. |
| §3.4 Section header drift | Sections renamed by topology (`Admin API v2` / `Admin API v3` / `v6.2`) rather than by a version string that drifts. |
| §3.5 `DB_SSL` divergent defaults | Annotated in place — the file now states that compose falls back to `true` when the key is absent. |
| §4 Missing variables | All seven documented as commented entries alongside their compose fallbacks. `MSSQL_DB` deliberately still omitted, for the reason given in §4. |

### Also fixed, found during review of this change

- **`MSSQL_SA_PASSWORD` was booby-trapped.** The line read `# MSSQL_SA_PASSWORD=  # Required — …`.
  Compose's dotenv parser only strips an inline `#` when a value precedes it, so uncommenting the
  line verbatim set the SA password to the comment prose — which satisfies SQL Server's complexity
  rules, so the container came up healthy and the API then failed to connect for no visible reason.
  The warning now sits on its own line above the key.
- **Switching to SQL Server needs three edits, not one.** The block header now names all three
  (`DB_ENGINE`, `MSSQL_SA_PASSWORD`, `DB_SECRET_VALUE`) and states that the remaining `MSSQL_*`
  lines merely mirror compose defaults. The `DB_SECRET_VALUE` sync note now covers the MSSQL pair.
- **The CI coupling is documented where it binds.** A warning above the SQL Server block names
  `Set-AdminAppEnvFile` and the reformat that would break the `mssql` matrix leg — previously this
  constraint lived only in this document.
- **Two commented entries violated the file's own `# VAR=value` convention.** `#ADMIN_API_TAG_7X`
  and `#ADMIN_TAG_6X` lacked the space. Left as-is they invited a future maintainer to normalise in
  the wrong direction and break the `Set-AdminAppEnvFile` regexes.
- **The tag-pinning instruction contradicted itself** ("comment the active line out *and* uncomment
  the digest below — the alternative must come last"). Reworded to one action, with the last-key-wins
  mechanism stated inline rather than 60 lines away in the header.
- **The aggregate substitution counter was replaced by per-pattern counters**
  (`eng/testing/run-e2e-ui.ps1`). It first went from 6 to 7, but a total cannot distinguish "all
  seven fired once" from "one line duplicated and another removed" — both sum to 7. Each rewrite now
  has its own counter and must match exactly once, which also rejects a duplicated key. The original
  slack mattered because `MSSQL_IMAGE_TAG`, `MSSQL_PORT_EXPOSED` and `MSSQL_ACCEPT_EULA` have compose
  defaults identical to the values the patcher writes, so a broken regex on any of those three would
  have produced no observable difference.

### Follow-on: healthcheck definitions consolidated

Inlining the healthcheck commands (§2) removed 10 variables but left 11 literal copies of two
commands in `edfi-services.yml`. Looking at the whole file rather than only the lines §2 touched,
there were **25 healthcheck blocks, all sharing an identical five-line shape**, across four distinct
probes:

| Probe | Sites |
|---|---|
| `pg_isready  -U ${POSTGRES_USER}` | 9 |
| `wget --no-check-certificate --spider http://localhost/health` | 8, plus the `API_HEALTHCHECK_TEST` passthrough |
| `pg_isready -U ${POSTGRES_USER} -h localhost -p ${POSTGRES_PORT:-5432}` | 6 |
| the same `wget` with `--header="tenant: tenant1"` | 2 |

All 25 now reference one of four YAML anchors declared at the top of the file as `x-healthcheck-*`
keys, which Compose ignores. The file drops from 849 to 792 lines, and changing a probe is one edit
rather than up to 25.

The four anchors are self-contained: each carries its own `test` and its own timing. An earlier
revision factored the shared `start_period`/`retries`/`interval` into a fifth anchor merged in with
`<<:`, and hoisted the `wget` string into a sixth scalar anchor shared with the v6 ODS API's
`API_HEALTHCHECK_TEST` environment variable. Both were reverted during review: the merge key saved
three lines while introducing a second, less familiar YAML feature to a repo that had no anchors at
all, and the scalar anchor bound a Compose healthcheck probe to an unrelated container environment
variable, so tightening the probe would silently have rewritten what the container's own entrypoint
runs. `API_HEALTHCHECK_TEST` carries its own literal again.

The database anchors are named for the mechanism that distinguishes them — `*healthcheck-db-socket`
and `*healthcheck-db-tcp` — rather than the earlier `*healthcheck-db` / `*healthcheck-db-localhost`,
which did not say which to pick. That matters because the membership is not what you would guess:
the v6 ODS databases use the socket probe while the v7 ODS databases use TCP, so "this is an ODS
database" does not determine the answer.

This was scoped into AC-520 rather than split out. A separate ticket would have cost another person
or agent a full re-derivation of this context for a mechanical, provably neutral change; keeping it
here as its own commit preserves the ability to revert it independently, which was the only thing
the split would have bought. The scope change is recorded on the AC-520 Jira issue.

Two things deliberately not done:

- **The two `pg_isready` probes were not unified** — see Deferred below. Collapsing them would change
  behaviour, not structure.
- **`x-*` anchors are a new idiom for this repo** (no tracked YAML used anchors before this change),
  so the anchor block carries a comment explaining what `x-*` keys and aliases are, which anchor to
  use for a new service, and that anchors are scoped to a single file. `compose/readme.md` has a
  Healthchecks section with the same guidance.

### Deferred

- **§3.2 `VITE_SHOW_REQUEST_CERTIFICATION` is inert** — annotated in the file, fix tracked under
  [AC-603](https://edfi.atlassian.net/browse/AC-603).
- **`POSTGRES_PORT` is pseudo-configuration too.** `edfi-services.yml` honours `${POSTGRES_PORT:-5432}`
  at 11 sites but hardcodes `POSTGRES_PORT: 5432` at 10 others, so changing it half-works. Same class
  as §2; missed by this audit. Needs its own ticket.
- **The two `pg_isready` probes differ and probably should not.** Nine database containers probe with
  `pg_isready  -U ${POSTGRES_USER}` (default local socket, `*healthcheck-db-socket`) while six use
  `pg_isready -U ${POSTGRES_USER} -h localhost -p ${POSTGRES_PORT:-5432}` (explicit TCP,
  `*healthcheck-db-tcp`). Nothing appears to have decided this; it reads as copy-paste drift, and it
  cuts across topology — the v6 ODS databases use the socket probe while the v7 ODS databases use TCP.
  They are preserved as two distinct anchors rather than unified, because collapsing them would change
  behaviour, not just structure.
- **`compose:check` cannot see a variable whose compose reference has a `:-` default.** Compose falls
  back silently and emits no warning, so roughly two thirds of the variables referenced across
  `compose/*.yml` are outside the check's reach. This is not theoretical: several compose defaults
  differ from the value declared in `.env.example`, so deleting the declaration would change the
  stack while CI stayed green — `DB_SSL` flips `false` to `true`, `KEYCLOAK_TAG` loses its pinned
  digest, and the Keycloak client secrets change. Closing this means first reconciling those
  divergences, which is a behaviour decision rather than a cleanup, so it needs its own ticket.
- **Container health is never asserted at runtime.** None of the `depends_on` entries in
  `edfi-services.yml` uses `condition: service_healthy`, and `run-e2e-ui.ps1` waits on HTTPS
  endpoints rather than container health, so a probe that parses correctly but never succeeds leaves
  its container `unhealthy` indefinitely while the E2E suite passes. A `docker ps --filter
  health=unhealthy` gate after startup would close this.

## Verification

Behavioural neutrality was established by rendering the full stack configuration before and after and
diffing it, rather than by reasoning about parser behaviour:

```bash
docker compose -f edfi-services.yml -f nginx-compose.yml -f adminapp-services.yml \
  --env-file <version> --project-directory compose \
  --profile postgresql --profile mssql --profile adminapp config
```

- **Rendered output is byte-identical** before and after, for both the `postgresql` and `mssql`
  profile sets. Warning output is identical too: the same three pre-existing
  `MSSQL_SA_PASSWORD is not set` lines on each side, and no new interpolation warnings.
- **All 11 healthcheck sites render the same strings**, including the `--header="tenant: tenant1"`
  variant — compose-go's dotenv unescapes `\"` to `"`, so the old quoted `.env` value and the new
  single-quoted YAML scalar resolve identically, double space and all.
- **All 7 `Set-AdminAppEnvFile` regexes match exactly once each** against the new file — verified by
  replaying the actual `switch -Regex` block, including negative cases: a duplicated key and a
  removed key each fail, naming the pattern and its count.
- **Zero dangling references**: none of the 14 removed variables appears anywhere in `compose/`,
  `eng/`, `packages/` or `.github/`. The only surviving mentions repo-wide are prose in
  `docs/design/custom-ods-db-container-summary.md` and this document.

The healthcheck anchor consolidation was verified the same way, separately:

- **Every service definition renders identically.** `diff` between the before and after renders is
  empty once the four top-level `x-healthcheck-*` keys are excluded, for both the `postgresql` and
  `mssql` profile sets. Those keys are the sole difference: Compose echoes them back in `config`
  output and ignores them at runtime.

  Deliberately no hash is quoted here. `docker compose config` embeds absolute host paths in
  bind-mount sources, so any digest of its output is specific to one machine and one checkout
  location and cannot be reproduced by the next reader. The `diff` is the reproducible evidence.
- **Warning output is unchanged** — the same three `MSSQL_SA_PASSWORD is not set` lines, nothing new.
- **All 25 blocks were replaced**, verified by count per alias: 9 `*healthcheck-db-socket`,
  8 `*healthcheck-api`, 6 `*healthcheck-db-tcp`, 2 `*healthcheck-api-tenant1`.
- **The replacement is now guarded**, not merely verified once. `eng/testing/check-compose-config.ps1`
  compares every service's rendered healthcheck command against a golden file, which is what catches
  a service pointed at the wrong anchor — that renders as valid YAML and emits no warning, so the
  undeclared-variable assertion is structurally blind to it. Confirmed by pointing an ODS/API service
  at `*healthcheck-db-socket` and watching the check fail with the exact offending service named.
