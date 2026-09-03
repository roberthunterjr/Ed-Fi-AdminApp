/**
 * Longest database name portable across PostgreSQL (63-byte identifier limit) and SQL Server.
 *
 * Mirrors `MaxPortableDatabaseNameLength` in ODS-Admin-API's
 * `OdsInstanceManageDatabaseNameFormatter` (V2) and `DataStoreManageDatabaseNameFormatter` (V3).
 */
export const MAX_PORTABLE_DATABASE_NAME_LENGTH = 63;

/** Prefix those formatters prepend when building `EdFi_Ods_{name}_{template}`. */
const CANONICAL_DATABASE_PREFIX = 'EdFi_Ods';

/** Longest `SandboxType` value the Template select can submit (`Minimal` | `Sample`). */
const LONGEST_DATABASE_TEMPLATE = 'Minimal';

/** The two `_` separators in `EdFi_Ods` _ name _ template. */
const SEPARATOR_COUNT = 2;

/**
 * Longest ODS / Data Store name that can never produce a database name over the portable limit.
 *
 * 63 - 8 (`EdFi_Ods`) - 2 (separators) - 7 (`Minimal`) = 46.
 *
 * Derived rather than hardcoded so the coupling to the AdminApi formatter stays auditable: a
 * longer `SandboxType` value tightens this automatically instead of silently overflowing.
 */
export const MAX_ODS_NAME_LENGTH =
  MAX_PORTABLE_DATABASE_NAME_LENGTH -
  CANONICAL_DATABASE_PREFIX.length -
  SEPARATOR_COUNT -
  LONGEST_DATABASE_TEMPLATE.length;

/** Shared so the message can never drift from the limit it describes. */
export const MAX_ODS_NAME_LENGTH_MESSAGE =
  `Name must be ${MAX_ODS_NAME_LENGTH} characters or fewer so the generated database name ` +
  `stays within the ${MAX_PORTABLE_DATABASE_NAME_LENGTH}-character limit.`;

/**
 * Characters ODS-Admin-API accepts in an ODS / Data Store name, mirroring
 * `_validOdsInstanceManageNamePattern` (V2) and `_validDataStoreManageNamePattern` (V3).
 *
 * This is also what keeps {@link MAX_ODS_NAME_LENGTH} meaningful: PostgreSQL's limit is 63
 * *bytes* while `@MaxLength` counts UTF-16 code units, and the two coincide only for ASCII.
 */
export const ODS_NAME_PATTERN = /^[A-Za-z0-9 _]+$/;

export const ODS_NAME_PATTERN_MESSAGE =
  'Name must only contain letters, numbers, spaces, and underscores.';
