import * as fs from 'fs';
import * as path from 'path';
import { KNOWN_SAMPLE_KEYS } from './db-encryption-secret';
import { KNOWN_SAMPLE_SECRETS } from './production-secrets';

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

// 'postgres' is also the legitimate default user name and host name in these files, so it is
// checked separately, as a password assignment only.
const publicSecrets = [
  ...KNOWN_SAMPLE_KEYS,
  ...KNOWN_SAMPLE_SECRETS.filter((secret) => secret !== 'postgres'),
];
const postgresPasswordAssignment = /PASSWORD["']?\s*[:=]\s*["']?postgres["']?/i;

describe('committed files carry no usable secrets', () => {
  it('packages/api/config/production.js-edfi contains no known sample secret', () => {
    const template = read('packages/api/config/production.js-edfi');
    for (const secret of publicSecrets) {
      expect(template).not.toContain(secret);
    }
    expect(template).not.toMatch(postgresPasswordAssignment);
  });

  it('packages/api/config/production.js-edfi no longer defines an encryption key block', () => {
    expect(read('packages/api/config/production.js-edfi')).not.toMatch(/^\s*DB_ENCRYPTION_SECRET_VALUE\s*:/m);
  });

  it('compose/.env.example contains no known sample secret', () => {
    const example = read('compose/.env.example');
    for (const secret of publicSecrets) {
      expect(example).not.toContain(secret);
    }
    expect(example).not.toMatch(postgresPasswordAssignment);
  });

  it('compose/.env.example secrets are change-me placeholders', () => {
    const example = read('compose/.env.example');
    expect(example).toMatch(/^POSTGRES_PASSWORD=change-me/m);
    expect(example).toMatch(/^KEYCLOAK_EDFIADMINAPP_CLIENT_SECRET=change-me/m);
    expect(example).toMatch(/^KEYCLOAK_EDFIADMINAPP_DEV_CLIENT_SECRET=change-me/m);
    expect(example).toMatch(/^DB_ENCRYPTION_SECRET_VALUE=\{"KEY":"change-me/m);
    expect(example).toMatch(/^DB_SECRET_VALUE=\{"DB_HOST".*"DB_PASSWORD":"change-me/m);
    expect(example).toMatch(/^# DB_SECRET_VALUE=\{"MSSQL_DB_HOST".*"MSSQL_DB_PASSWORD":"change-me/m);
  });

  it('the Dockerfile copies only the sanitized template as production.js', () => {
    const copies = read('packages/api/Dockerfile')
      .split('\n')
      .filter((line) => /^COPY\b/.test(line) && line.includes('packages/api/config/'));
    const productionCopies = copies.filter((line) => /production\.js/.test(line));
    expect(productionCopies).toHaveLength(1);
    expect(productionCopies[0]).toContain('packages/api/config/production.js-edfi ./dist/packages/api/config/production.js');
    expect(copies.some((line) => /local\.js/.test(line))).toBe(false);
  });
});
