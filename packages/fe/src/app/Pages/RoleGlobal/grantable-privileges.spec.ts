import 'reflect-metadata';
import { IPrivilege, PRIVILEGES, PrivilegeCode } from '@edanalytics/models';
import { filterGrantablePrivileges } from './grantable-privileges';

const privilege = (code: PrivilegeCode): IPrivilege => PRIVILEGES[code];
const codes = (privileges: IPrivilege[] | undefined) => privileges?.map((p) => p.code);

const offered = [
  privilege('me:read'),
  privilege('team:read'),
  privilege('integration-provider:read'),
  privilege('team.integration-provider.application:read'),
];

describe('filterGrantablePrivileges', () => {
  it('waits (returns undefined) while the actor privileges are loading', () => {
    expect(filterGrantablePrivileges(offered, undefined)).toBeUndefined();
  });

  it('returns undefined when there is no privilege list to filter', () => {
    expect(filterGrantablePrivileges(undefined, ['team:read'])).toBeUndefined();
  });

  it('offers only privileges the actor holds, so "All" cannot select ungrantable ones', () => {
    // A Global admin after the integration-provider privileges were withheld.
    const held: PrivilegeCode[] = ['me:read', 'team:read'];

    expect(codes(filterGrantablePrivileges(offered, held))).toEqual(['me:read', 'team:read']);
  });

  it('always offers me:read, which every role must include', () => {
    expect(codes(filterGrantablePrivileges(offered, []))).toEqual(['me:read']);
  });

  it("keeps privileges already on the role when editing, even if the actor doesn't hold them", () => {
    const held: PrivilegeCode[] = ['me:read', 'team:read'];
    const alreadyOnRole: PrivilegeCode[] = ['integration-provider:read'];

    expect(codes(filterGrantablePrivileges(offered, held, alreadyOnRole))).toEqual([
      'me:read',
      'team:read',
      'integration-provider:read',
    ]);
  });

  it('keeps the order of the offered list', () => {
    const held: PrivilegeCode[] = ['team.integration-provider.application:read', 'team:read'];

    expect(codes(filterGrantablePrivileges(offered, held))).toEqual([
      'me:read',
      'team:read',
      'team.integration-provider.application:read',
    ]);
  });
});
