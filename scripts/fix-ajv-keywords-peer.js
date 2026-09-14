#!/usr/bin/env node
/**
 * Workaround for a broken peer dependency in the committed dependency tree:
 * ajv-keywords@5.x declares `ajv@^8` as a peerDependency, but this project's
 * install must run with --legacy-peer-deps (to work around an unrelated
 * @chakra-ui/storybook-addon / storybook peer conflict). --legacy-peer-deps
 * disables npm's automatic peer-conflict nesting, so ajv-keywords ends up
 * resolving the top-level ajv@6 (hoisted for @eslint/eslintrc) instead of
 * the ajv@8 it actually needs -- breaking the webpack build used by
 * `nx run api:serve` with "Cannot find module 'ajv/dist/compile/codegen'".
 *
 * This script nests a working ajv@8 copy under ajv-keywords/node_modules
 * after every install, by cloning the ajv@8 that ajv-formats already gets
 * correctly (ajv-formats depends on ajv as a normal dependency, which npm
 * nests fine even under --legacy-peer-deps).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const destAjv = path.join(root, 'node_modules', 'ajv-keywords', 'node_modules', 'ajv');
const destCodegen = path.join(destAjv, 'dist', 'compile', 'codegen', 'index.js');

if (fs.existsSync(destCodegen)) {
  process.exit(0);
}

const candidateSources = [
  path.join(root, 'node_modules', 'ajv-formats', 'node_modules', 'ajv'),
  path.join(root, 'node_modules', 'schema-utils', 'node_modules', 'ajv'),
];

const source = candidateSources.find((candidate) =>
  fs.existsSync(path.join(candidate, 'dist', 'compile', 'codegen', 'index.js')),
);

if (!source) {
  console.warn(
    '[fix-ajv-keywords-peer] Could not find a nested ajv@8 to copy from ' +
      '(checked ajv-formats, schema-utils). Skipping -- `nx run api:serve` ' +
      "may fail with \"Cannot find module 'ajv/dist/compile/codegen'\".",
  );
  process.exit(0);
}

fs.rmSync(destAjv, { recursive: true, force: true });
fs.cpSync(source, destAjv, { recursive: true });

if (fs.existsSync(destCodegen)) {
  console.log(`[fix-ajv-keywords-peer] Nested ajv@8 under ajv-keywords (copied from ${path.relative(root, source)}).`);
} else {
  console.warn('[fix-ajv-keywords-peer] Copy completed but codegen module still missing -- check manually.');
}
