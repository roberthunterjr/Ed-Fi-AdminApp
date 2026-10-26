import 'reflect-metadata';
import { splitActions } from '@edanalytics/common-ui';
import { GetSbEnvironmentDto } from '@edanalytics/models';
import omit from 'lodash/omit';
import { useSbEnvironmentGlobalActions } from './useSbEnvironmentGlobalActions';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('../../Layout/FeedbackBanner', () => ({
  usePopBanner: jest.fn(),
}));

jest.mock('../../api', () => ({
  sbEnvironmentQueriesGlobal: {
    refreshResources: jest.fn(() => ({ isPending: false, mutateAsync: mockRefreshMutate })),
    delete: jest.fn(() => ({ isPending: false, mutateAsync: mockDeleteMutate })),
    reloadTenants: jest.fn(() => ({ isPending: false, mutateAsync: mockReloadMutate })),
  },
}));

jest.mock('../../helpers', () => ({
  useAuthorize: jest.fn(() => false),
  globalOwnershipAuthConfig: jest.fn((privilege) => ({ privilege })),
  globalSbEnvironmentAuthConfig: jest.fn((id, privilege) => ({ privilege, subject: { id } })),
  globalEdfiTenantAuthConfig: jest.fn((id, privilege) => ({ privilege, subject: { id } })),
  popSyncBanner: jest.fn(),
}));

jest.mock('../../helpers/mutationErrCallback', () => ({
  mutationErrCallback: jest.fn(() => ({})),
}));

jest.mock('../../helpers/useSearch', () => ({
  useSearchParamsObject: jest.fn(() => ({})),
}));

jest.mock('../../../config/config', () => ({
  config: { showRequestCertification: false },
}));

import { useNavigate } from 'react-router';
import { usePopBanner } from '../../Layout/FeedbackBanner';
import { popSyncBanner, useAuthorize } from '../../helpers';
import { useSearchParamsObject } from '../../helpers/useSearch';
import { config } from '../../../config/config';

// Referenced lazily from the `../../api` mock factory (only when the hook
// runs), so these are initialized by the time they're read.
const mockRefreshMutate = jest.fn();
const mockDeleteMutate = jest.fn();
const mockReloadMutate = jest.fn();

const mockUseNavigate = useNavigate as jest.Mock;
const mockUsePopBanner = usePopBanner as jest.Mock;
const mockUseAuthorize = useAuthorize as jest.Mock;
const mockUseSearchParamsObject = useSearchParamsObject as jest.Mock;
const mockPopSyncBanner = popSyncBanner as jest.Mock;

const buildSbEnvironment = (
  version: 'v1' | 'v2' | 'v3',
  startingBlocks: boolean,
  configPublic: Record<string, unknown> = {}
) =>
  ({
    id: 1,
    displayName: 'Test Env',
    version,
    startingBlocks,
    configPublic,
    odsDsVersion: '5.2.0',
  }) as unknown as GetSbEnvironmentDto;

type Auth = {
  canGrantOwnership?: boolean;
  canView?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  canRefreshResources?: boolean;
  canReadTenants?: boolean;
  canReadOdss?: boolean;
};

const PRIVILEGE_BY_AUTH: Record<keyof Auth, string> = {
  canGrantOwnership: 'ownership:create',
  canView: 'sb-environment:read',
  canUpdate: 'sb-environment:update',
  canDelete: 'sb-environment:delete',
  canRefreshResources: 'sb-environment:refresh-resources',
  canReadTenants: 'sb-environment.edfi-tenant:read',
  canReadOdss: 'ods:read',
};

let navigate: jest.Mock;
let popBanner: jest.Mock;

// Every privilege defaults to unauthorized; each test grants only the ones
// relevant to the action under test.
const setup = (sbEnvironment: GetSbEnvironmentDto | undefined, auth: Auth = {}) => {
  navigate = jest.fn();
  popBanner = jest.fn();
  mockUseNavigate.mockReturnValue(navigate);
  mockUsePopBanner.mockReturnValue(popBanner);
  const granted = new Set(
    (Object.keys(auth) as Array<keyof Auth>)
      .filter((key) => auth[key])
      .map((key) => PRIVILEGE_BY_AUTH[key])
  );
  mockUseAuthorize.mockImplementation((cfg?: { privilege: string }) =>
    granted.has(cfg?.privilege ?? '')
  );
  return useSbEnvironmentGlobalActions(sbEnvironment);
};

const enableCertificationFlag = () =>
  jest.replaceProperty(config, 'showRequestCertification', true);

describe('useSbEnvironmentGlobalActions', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockUseSearchParamsObject.mockReturnValue({});
  });

  it('returns no actions while the environment is still loading', () => {
    expect(setup(undefined, { canView: true, canUpdate: true })).toEqual({});
  });

  describe('GrantOwnership', () => {
    it('is present and navigates to the ownership form when authorized', () => {
      const actions = setup(buildSbEnvironment('v2', false), { canGrantOwnership: true });
      const to = '/ownerships/create?sbEnvironmentId=1&type=sbEnvironment';
      expect(actions.GrantOwnership).toMatchObject({ text: 'Grant ownership', to });
      actions.GrantOwnership?.onClick();
      expect(navigate).toHaveBeenCalledWith(to);
    });

    it('is absent without ownership:create', () => {
      expect(setup(buildSbEnvironment('v2', false)).GrantOwnership).toBeUndefined();
    });
  });

  describe('View', () => {
    it('is present and navigates to the environment page when authorized', () => {
      const actions = setup(buildSbEnvironment('v2', false), { canView: true });
      expect(actions.View).toMatchObject({ text: 'View', to: '/sb-environments/1' });
      actions.View?.onClick();
      expect(navigate).toHaveBeenCalledWith('/sb-environments/1');
    });

    it('is absent without sb-environment:read', () => {
      expect(setup(buildSbEnvironment('v2', false)).View).toBeUndefined();
    });
  });

  describe('Starting Blocks-only actions (EditSbMeta, Rename)', () => {
    it('are present for a startingBlocks environment when authorized', () => {
      const actions = setup(buildSbEnvironment('v2', true), { canUpdate: true });
      expect(actions.EditSbMeta).toMatchObject({ isIrrelevant: false, isDisabled: false });
      expect(actions.Rename).toMatchObject({ isDisabled: false });

      actions.EditSbMeta?.onClick();
      expect(navigate).toHaveBeenCalledWith('/sb-environments/1?edit=sb-environment-meta');
      actions.Rename?.onClick();
      expect(navigate).toHaveBeenCalledWith('/sb-environments/1?edit=name');
    });

    it('marks EditSbMeta irrelevant once an SB meta ARN is connected', () => {
      const env = buildSbEnvironment('v2', true, { sbEnvironmentMetaArn: 'arn:aws:example' });
      expect(setup(env, { canUpdate: true }).EditSbMeta?.isIrrelevant).toBe(true);
    });

    it('disables the action whose edit form is already open', () => {
      mockUseSearchParamsObject.mockReturnValue({ edit: 'name' });
      const actions = setup(buildSbEnvironment('v2', true), { canUpdate: true });
      expect(actions.Rename?.isDisabled).toBe(true);
      expect(actions.EditSbMeta?.isDisabled).toBe(false);
    });

    it('are absent for an environment that is not startingBlocks-managed', () => {
      const actions = setup(buildSbEnvironment('v2', false), { canUpdate: true });
      expect(actions.EditSbMeta).toBeUndefined();
      expect(actions.Rename).toBeUndefined();
    });
  });

  describe('Edit', () => {
    it('is present and navigates to the edit form for a non-startingBlocks environment', () => {
      const actions = setup(buildSbEnvironment('v2', false), { canUpdate: true });
      expect(actions.Edit).toMatchObject({ text: 'Edit', to: '/sb-environments/1/edit' });
      actions.Edit?.onClick();
      expect(navigate).toHaveBeenCalledWith('/sb-environments/1/edit');
    });

    it('is absent for a startingBlocks environment', () => {
      expect(setup(buildSbEnvironment('v2', true), { canUpdate: true }).Edit).toBeUndefined();
    });

    it('is absent without sb-environment:update', () => {
      expect(setup(buildSbEnvironment('v2', false)).Edit).toBeUndefined();
    });
  });

  describe('Delete', () => {
    it('asks for confirmation and returns to the list after deleting', async () => {
      mockDeleteMutate.mockImplementation((_vars, options) => options.onSuccess());
      const actions = setup(buildSbEnvironment('v2', false), { canDelete: true });
      expect(actions.Delete).toMatchObject({ confirm: true, text: 'Delete' });

      await actions.Delete?.onClick();
      expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 1 }, expect.any(Object));
      expect(navigate).toHaveBeenCalledWith('/sb-environments');
    });

    it('is absent without sb-environment:delete', () => {
      expect(setup(buildSbEnvironment('v2', false)).Delete).toBeUndefined();
    });
  });

  describe('RefreshResources ("Sync Resources")', () => {
    it('is absent for a v1 tenant even when authorized and not startingBlocks-managed', () => {
      const actions = setup(buildSbEnvironment('v1', false), { canRefreshResources: true });
      expect(actions.RefreshResources).toBeUndefined();
    });

    it('is present for a v2 tenant when authorized and not startingBlocks-managed', () => {
      const actions = setup(buildSbEnvironment('v2', false), { canRefreshResources: true });
      expect(actions.RefreshResources).toBeDefined();
    });

    it('is present for a v3 tenant when authorized and not startingBlocks-managed', () => {
      const actions = setup(buildSbEnvironment('v3', false), { canRefreshResources: true });
      expect(actions.RefreshResources).toBeDefined();
    });

    it('is absent when the tenant is startingBlocks-managed, regardless of version', () => {
      const actions = setup(buildSbEnvironment('v2', true), { canRefreshResources: true });
      expect(actions.RefreshResources).toBeUndefined();
    });

    it('is absent when the user lacks refresh-resources authorization', () => {
      const actions = setup(buildSbEnvironment('v2', false), { canRefreshResources: false });
      expect(actions.RefreshResources).toBeUndefined();
    });

    it('pops the sync banner with the queued sync on success', async () => {
      const syncQueue = { id: 7 };
      mockRefreshMutate.mockImplementation((_vars, options) => options.onSuccess(syncQueue));
      const env = buildSbEnvironment('v2', false);
      const actions = setup(env, { canRefreshResources: true });

      await actions.RefreshResources?.onClick();
      expect(mockRefreshMutate).toHaveBeenCalledWith(
        { entity: env, pathParams: null },
        expect.any(Object)
      );
      expect(mockPopSyncBanner).toHaveBeenCalledWith({ popBanner, syncQueue });
    });
  });

  describe('Restart ("Reload tenants") — intentionally v2-only', () => {
    // The backend "reload tenants" capability (tenantMgmtService.reload in
    // starting-blocks.v2.service.ts) has no v3 equivalent yet. Do not widen
    // this to `!== 'v1'` the way RefreshResources was — that would expose a
    // "Reload tenants" action for v3 tenants the backend can't fulfill.
    // Version alone gates this off for v1/v3 regardless of startingBlocks,
    // so there's no need to cross startingBlocks with every non-v2 version.

    it('is present for a v2, startingBlocks-managed tenant when authorized', () => {
      const actions = setup(buildSbEnvironment('v2', true), { canUpdate: true });
      expect(actions.Restart).toBeDefined();
    });

    it('is absent for a v1 tenant even when startingBlocks-managed and authorized', () => {
      const actions = setup(buildSbEnvironment('v1', true), { canUpdate: true });
      expect(actions.Restart).toBeUndefined();
    });

    it('is absent for a v3 tenant even when startingBlocks-managed and authorized', () => {
      const actions = setup(buildSbEnvironment('v3', true), { canUpdate: true });
      expect(actions.Restart).toBeUndefined();
    });

    it('is absent for a v2 tenant that is not startingBlocks-managed', () => {
      const actions = setup(buildSbEnvironment('v2', false), { canUpdate: true });
      expect(actions.Restart).toBeUndefined();
    });

    it('is absent when the user lacks update authorization, even for v2 + startingBlocks', () => {
      const actions = setup(buildSbEnvironment('v2', true), { canUpdate: false });
      expect(actions.Restart).toBeUndefined();
    });

    it('pops the reload result banner on success', async () => {
      const result = { title: 'Tenants reloaded' };
      mockReloadMutate.mockImplementation((_vars, options) => options.onSuccess(result));
      const actions = setup(buildSbEnvironment('v2', true), { canUpdate: true });

      await actions.Restart?.onClick();
      expect(popBanner).toHaveBeenCalledWith(result);
    });
  });

  describe('RequestCert ("Request certification")', () => {
    // The page lists tenants and ODSs, so update alone would land on an error page.
    const certAuth = { canUpdate: true, canReadTenants: true, canReadOdss: true };

    it.each(['v1', 'v2', 'v3'] as const)(
      'is present for a %s environment when the flag is on and the user can update the environment',
      (version) => {
        enableCertificationFlag();
        const actions = setup(buildSbEnvironment(version, false), { ...certAuth });
        expect(actions.RequestCert).toMatchObject({
          text: 'Request certification',
          title: 'Request certification for Test Env',
          to: '/sb-environments/1/request-certification',
        });
      }
    );

    it('is present for a startingBlocks environment too (not SB-gated)', () => {
      enableCertificationFlag();
      const actions = setup(buildSbEnvironment('v2', true), { ...certAuth });
      expect(actions.RequestCert).toBeDefined();
    });

    it('is absent for an environment whose version is unknown, even when the flag is on', () => {
      enableCertificationFlag();
      const env = { ...buildSbEnvironment('v2', false), version: undefined } as GetSbEnvironmentDto;
      const actions = setup(env, { ...certAuth });
      expect(actions.RequestCert).toBeUndefined();
    });

    it.each(['v1', 'v2', 'v3'] as const)(
      'is absent for a %s environment on Ed-Fi Data Model 4.0.0, even when the flag is on',
      (version) => {
        enableCertificationFlag();
        const env = { ...buildSbEnvironment(version, false), odsDsVersion: '4.0.0' };
        expect(setup(env as GetSbEnvironmentDto, { ...certAuth }).RequestCert).toBeUndefined();
      }
    );

    it('is absent for an environment whose data model is unknown, even when the flag is on', () => {
      enableCertificationFlag();
      const env = { ...buildSbEnvironment('v3', false), odsDsVersion: undefined };
      expect(setup(env as GetSbEnvironmentDto, { ...certAuth }).RequestCert).toBeUndefined();
    });

    it.each([
      ['tenants', { canUpdate: true, canReadOdss: true }],
      ['ODSs', { canUpdate: true, canReadTenants: true }],
      ['both', { canUpdate: true }],
    ])('is absent when update is granted but the %s read is missing', (_name, auth) => {
      enableCertificationFlag();
      expect(setup(buildSbEnvironment('v2', false), auth).RequestCert).toBeUndefined();
    });

    it('is absent without update even when both reads are granted', () => {
      enableCertificationFlag();
      const actions = setup(buildSbEnvironment('v2', false), {
        canReadTenants: true,
        canReadOdss: true,
      });
      expect(actions.RequestCert).toBeUndefined();
    });

    it('is absent with only sb-environment:read, even when the flag is on', () => {
      // Certification starts a workflow, so read access alone isn't enough.
      enableCertificationFlag();
      const actions = setup(buildSbEnvironment('v2', false), { canView: true });
      expect(actions.RequestCert).toBeUndefined();
    });

    it.each(['v1', 'v2', 'v3'] as const)(
      'is absent for a %s environment when the flag is off',
      (version) => {
        const actions = setup(buildSbEnvironment(version, false), { canUpdate: true });
        expect(actions.RequestCert).toBeUndefined();
      }
    );

    it('goes in the "More" menu without pushing other actions out of the inline buttons', () => {
      // Mirrors SbEnvironmentGlobalPage, which renders omit(actions, 'View').
      // These four regular actions exactly fill the inline target, which is
      // where an extra counted action would push Sync into "More".
      const auth = {
        canGrantOwnership: true,
        canView: true,
        canUpdate: true,
        canDelete: true,
        canRefreshResources: true,
        canReadTenants: true,
        canReadOdss: true,
      };
      const pageSplit = () => {
        const { visible, hidden } = splitActions(
          omit(setup(buildSbEnvironment('v2', false), auth), 'View')
        );
        return { visible: visible.map(([key]) => key), hidden: hidden.map(([key]) => key) };
      };

      const inlineBefore = pageSplit().visible;
      enableCertificationFlag();
      const after = pageSplit();

      expect(inlineBefore).toEqual(['GrantOwnership', 'Edit', 'Delete', 'RefreshResources']);
      expect(after.visible).toEqual(inlineBefore);
      expect(after.hidden).toEqual(['RequestCert']);
    });

    it('navigates to the request-certification page on click', () => {
      enableCertificationFlag();
      const actions = setup(buildSbEnvironment('v2', false), { ...certAuth });
      actions.RequestCert?.onClick();
      expect(navigate).toHaveBeenCalledWith('/sb-environments/1/request-certification');
    });
  });
});
