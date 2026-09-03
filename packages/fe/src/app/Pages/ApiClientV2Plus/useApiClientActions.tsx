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
    }
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
                        navigate(toView, { state: result });
                      },
                    }
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
                icon: Icons.Delete,
                text: 'Delete',
                title: 'Delete API client credentials',
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
                            }
                          ).queryKey,
                        });
                        if (onApiClientPage) {
                          navigate(
                            `/as/${asId}/sb-environments/${edfiTenant.sbEnvironmentId}/edfi-tenants/${edfiTenantId}/applications/${applicationId}/apiClients`
                          );
                        }
                      },
                    }
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