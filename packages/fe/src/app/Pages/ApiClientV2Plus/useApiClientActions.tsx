import { ActionsType, Icons } from '@edanalytics/common-ui';

import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import {
  useAuthorize,
  useTeamEdfiTenantNavContext,
  useTeamEdfiTenantNavContextLoaded,
} from '../../helpers';
import { usePopBanner } from '../../Layout/FeedbackBanner';
import { ApiClientEntity, useApiClientConfig } from './apiClientConfig';
import { mutationErrCallback } from '../../helpers/mutationErrCallback';
import { useSearchParamsObject } from '../../helpers/useSearch';
import { useApplicationApiClients } from './useApplicationApiClients';

export const useSingleApiClientActions = ({
  apiClient,
  applicationId,
}: {
  apiClient: ApiClientEntity | undefined;
  applicationId: number;
}): ActionsType => {
  const queryClient = useQueryClient();
  const { edfiTenantId, asId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const navigate = useNavigate();
  const { apiClientId } = useParams();
  const popBanner = usePopBanner();
  const { queries } = useApiClientConfig();

  const deleteApiClient = queries.delete({
    edfiTenant,
    teamId: asId,
  });
  // Resolved through the version config rather than the api-v2
  // `useResetIntegrationApiClientCredentials` hook (which is hard-wired to
  // apiClientQueriesV2), so a v3 tenant hits the V3 reset-credential endpoint.
  const resetApiClientCredentials = queries.resetCreds({
    edfiTenant,
    teamId: asId,
  });

  // An Application with no credentials disappears from the UI entirely (AC-616),
  // so the last one may not be deleted. NameCell already runs this exact query
  // with the same key, so TanStack Query serves it from cache there rather than
  // issuing a second request.
  const {
    query: apiClientsQuery,
    count: apiClientCount,
    isCountKnown,
  } = useApplicationApiClients(applicationId);

  // Enforcement threshold: <= 1, matching the BFF's own guard. Deliberately
  // includes 0 so an Application that somehow reaches zero credentials cannot
  // lose more. An unknown count (pending or errored) also blocks — failing
  // closed costs the user a disabled button, whereas failing open could orphan
  // the Application.
  const blockDelete = !isCountKnown || apiClientCount <= 1;
  // Display threshold: exactly one. Everything below that says "the only
  // credential", which is false at 0, so this must never be widened to <= 1.
  const isOnlyApiClient = isCountKnown && apiClientCount === 1;

  // Four states, because a disabled button with a generic tooltip reads as
  // broken. Pending and errored are transient and the user should be told so;
  // "only credential" persists until they act.
  const deleteTooltip = !isCountKnown
    ? apiClientsQuery.isError
      ? "Couldn't check the credential count — try refreshing the page."
      : 'Checking credential count…'
    : isOnlyApiClient
      ? "This is the Application's only credential and can't be deleted. Create another credential first."
      : 'Delete API client credentials';

  // A disabled control has to say why, and say it to everyone. `title` alone
  // reaches only sighted pointer users: the icon-button variant sets
  // `aria-label` from `text`, and `aria-label` outranks `title` in
  // accessible-name computation, so assistive technology would announce just
  // "Delete, dimmed". Carrying the reason into the accessible name fixes that.
  // Left undefined while Delete is enabled, so the default "Delete" name and
  // the terse enabled-state tooltip are untouched.
  const deleteAriaLabel = blockDelete ? deleteTooltip : undefined;

  const search = useSearchParamsObject();
  const onApiClientPage = !!apiClientId;
  const inEdit = onApiClientPage && 'edit' in search && search?.edit === 'true';

  const canView = true;
  const canCreate = true;
  const canReset = true;
  const canEdit = true;
  const canDelete = useAuthorize(
    apiClient && {
      privilege: 'team.sb-environment.edfi-tenant.ods.edorg.application:delete',
      subject: {
        edfiTenantId: Number(edfiTenantId),
        teamId: Number(asId),
        id: '__filtered__',
      },
    },
  );
  const toView = `/as/${asId}/sb-environments/${edfiTenant.sbEnvironmentId}/edfi-tenants/${edfiTenantId}/applications/${applicationId}/apiClients/${apiClient?.id}`;
  const toCreate = `/as/${asId}/sb-environments/${edfiTenant.sbEnvironmentId}/edfi-tenants/${edfiTenantId}/applications/${applicationId}/apiClients/create`;
  const toEdit = `${toView}?edit=true`;

  return apiClient === undefined
    ? {}
    : {
        ...(canView
          ? {
              View: {
                icon: Icons.View,
                text: 'View',
                title: 'View ' + apiClient.name,
                to: toView,
                onClick: () => navigate(toView),
              },
            }
          : undefined),
        ...(canCreate
          ? {
              Create: {
                icon: Icons.Plus,
                text: 'New',
                title: 'New credentials',
                to: toCreate,
                onClick: () => navigate(toCreate),
              },
            }
          : undefined),
        ...(canReset
          ? {
              Reset: {
                isPending: resetApiClientCredentials.isPending,
                isDisabled: false,
                icon: Icons.ShieldX,
                text: 'Reset creds',
                title: 'Reset ' + apiClient.name,
                onClick: () => {
                  resetApiClientCredentials.mutateAsync(
                    { entity: { id: apiClient.id }, pathParams: {} },
                    {
                      ...mutationErrCallback({ popGlobalBanner: popBanner }),
                      onSuccess: (result) => {
                        // Same fix as the put mutation in EditApiClient.tsx: resetCreds'
                        // custom `path` (queries.v7.ts) doubles as the builder's default
                        // invalidation key, which never matches the Credentials list's
                        // `?applicationId=...` key (ApiClientsPage.tsx via
                        // `queries.getAll`). Recompute the exact list key instead,
                        // matching the working Delete pattern below.
                        queryClient.invalidateQueries({
                          queryKey: queries.getAll(
                            {
                              teamId: asId,
                              edfiTenant,
                            },
                            {
                              applicationId,
                            },
                          ).queryKey,
                        });
                        navigate(toView, { state: result });
                      },
                    },
                  );
                },
                confirm: true,
                confirmBody:
                  'Are you sure you want to reset the credentials? Anything using the current ones will stop working.',
              },
            }
          : undefined),
        ...(canEdit
          ? {
              Edit: {
                isDisabled: !!inEdit,
                icon: Icons.Edit,
                text: 'Edit',
                title: 'Edit ' + apiClient.name,
                to: toEdit,
                onClick: () => navigate(toEdit),
              },
            }
          : undefined),
        ...(canDelete
          ? {
              Delete: {
                isPending: deleteApiClient.isPending,
                isDisabled: blockDelete,
                icon: Icons.Delete,
                text: 'Delete',
                title: deleteTooltip,
                ariaLabel: deleteAriaLabel,
                confirmBody:
                  'All systems using these credentials to access Ed-Fi will no longer be able to do so. This action cannot be undone, but you will be able to create new credentials for this application if you want.',
                onClick: () =>
                  deleteApiClient.mutate(
                    { id: apiClient.id, pathParams: {} },
                    {
                      ...mutationErrCallback({ popGlobalBanner: popBanner }),
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: queries.getAll(
                            {
                              teamId: asId,
                              edfiTenant,
                            },
                            {
                              applicationId,
                            },
                          ).queryKey,
                        });
                        if (onApiClientPage) {
                          navigate(
                            `/as/${asId}/sb-environments/${edfiTenant.sbEnvironmentId}/edfi-tenants/${edfiTenantId}/applications/${applicationId}/apiClients`,
                          );
                        }
                      },
                    },
                  ),
                confirm: true,
              },
            }
          : undefined),
      };
};

export const useMultiApiClientsActions = ({
  teamId,
  applicationId,
}: {
  teamId: string | number;
  applicationId: number;
}): ActionsType => {
  const navigate = useNavigate();
  const { sbEnvironmentId, edfiTenantId } = useTeamEdfiTenantNavContext();
  const to = `/as/${teamId}/sb-environments/${sbEnvironmentId}/edfi-tenants/${edfiTenantId}/applications/${applicationId}/apiClients/create`;
  const canCreate = true;
  return canCreate
    ? {
        Create: {
          icon: Icons.Plus,
          text: 'New',
          title: 'New credentials',
          to,
          onClick: () => navigate(to),
        },
      }
    : {};
};
