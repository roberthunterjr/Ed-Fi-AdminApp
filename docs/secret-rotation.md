# Secret Rotation

Images built before AC-639 shipped `packages/api/config/production.js-edfi` as `production.js`
with a publicly known `DB_ENCRYPTION_SECRET_VALUE.KEY`, the Keycloak sample client secret
(`big-secret-123`) and sample database passwords. If a deployment ever ran with those values,
treat them as compromised and rotate everything below.

## What each secret protects

| Secret | Where it is set | Protects |
|---|---|---|
| `DB_ENCRYPTION_SECRET_VALUE.KEY` | env var (JSON) or AWS Secrets Manager | `sb_environment.configPrivate`: stored Admin API client secrets (AES-256-CBC) |
| `DB_SECRET_VALUE` password | env var (JSON) or AWS Secrets Manager | Admin App database |
| `SAMPLE_OIDC_CONFIG.clientSecret` | env var (JSON) | OIDC client secret seeded on first run; also stored in the `oidc` table |
| `SESSION_SECRET_VALUE` | env var (JSON array) or AWS Secrets Manager | Session cookie signing |

## Procedure

1. Back up the Admin App database.
   Stop the Admin App API before re-encrypting (step 4) so nothing reads or writes `sb_environment` while the rows change.
2. Generate a new key: `openssl rand -hex 32`.
3. Rotate the downstream Admin API client secrets that `configPrivate` held. They were readable by anyone with a dump and the old key, so changing the encryption key alone is not enough.
4. Re-encrypt `sb_environment.configPrivate` from the old key to the new key (script below), then deploy with the new `DB_ENCRYPTION_SECRET_VALUE`. Rows still encrypted with the old key cannot be read by the app.
5. Change the database password in the database server and in `DB_SECRET_VALUE`.
6. Change the OIDC client secret in the identity provider and in the `oidc` table (`clientSecret` column) or through the Admin App.
7. Replace the session secret(s): put the new one first and keep the old one second until existing sessions expire (see `SESSION_SECRET_VALUE` in `compose/.env.example`).

## Re-encrypting `configPrivate`

The app encrypts this column with `JSONEncryptionTransformer` from `typeorm-encrypted`
(`algorithm: 'aes-256-cbc'`, `ivLength: 16`; see `packages/models-server/src/entities/sb-environment.entity.ts`).
A one-off script must use exactly the same settings. PostgreSQL example (adapt the query for
SQL Server: its simple-json column stores the encrypted JSON as text, so write the
`JSON.stringify(...)` text with a normal parameterized `UPDATE`, not `::jsonb`). Run it against a **copy** of the database first.

This script is provided as a starting point. It has not been run by the maintainers, so review
and test it before relying on it.

```js
// reencrypt.js - run from the repo root: OLD_KEY=... NEW_KEY=... DATABASE_URL=... node reencrypt.js
const { JSONEncryptionTransformer } = require('typeorm-encrypted');
const { Client } = require('pg');

const make = (key) => new JSONEncryptionTransformer({ key, algorithm: 'aes-256-cbc', ivLength: 16 });
const oldT = make(process.env.OLD_KEY);
const newT = make(process.env.NEW_KEY);

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // One transaction: a failed run leaves the table unchanged.
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, "configPrivate" FROM sb_environment WHERE "configPrivate" IS NOT NULL');
    for (const row of rows) {
      const plain = oldT.from(row.configPrivate);
      await client.query('UPDATE sb_environment SET "configPrivate" = $1::jsonb WHERE id = $2', [
        JSON.stringify(newT.to(plain)),
        row.id,
      ]);
    }
    await client.query('COMMIT');
    console.log(`re-encrypted ${rows.length} row(s)`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
})();
```

Confirm the table and column names with `\d sb_environment` before running, and verify one
environment in the Admin App after the switch.

## Upgrading from an image built before AC-639

Images built from AC-639 onward no longer carry any database password, encryption key or OIDC
client secret, and the API refuses to start in production until real values are supplied (see the
[procedure](#procedure) above for rotating anything that previously ran on the old, public
values). Also note that `DB_SECRET_VALUE` set through the environment is now honored; it was
previously ignored silently because of a configuration mapping bug, so double-check the value you
set is the one you want the application to use.
