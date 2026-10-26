import { IPrivilege, PrivilegeCode } from '@edanalytics/models';

/**
 * Narrows the privileges offered in a role form to the ones the current user may grant.
 *
 * The API rejects a role write that grants a privilege the actor does not hold (AC-644 no-escalation
 * rule), so offering those privileges, including through the "All" and group checkboxes, only
 * leads to an "Insufficient privileges" error on save.
 *
 * - `held`: the actor's global privileges (the session user's role). While it is still loading,
 *   returns `undefined` so the form waits instead of briefly offering everything.
 * - `alreadyOnRole`: when editing, the role's saved privileges. The API only checks privileges
 *   being *added*, so these stay visible and can be unticked and re-ticked even if the actor
 *   does not hold them.
 */
export const filterGrantablePrivileges = (
  privileges: IPrivilege[] | undefined,
  held: readonly PrivilegeCode[] | undefined,
  alreadyOnRole: readonly PrivilegeCode[] = []
): IPrivilege[] | undefined => {
  if (privileges === undefined || held === undefined) return undefined;
  const grantable = new Set<PrivilegeCode>([...held, ...alreadyOnRole, 'me:read']);
  return privileges.filter((p) => grantable.has(p.code));
};
