import { Link, Text } from '@chakra-ui/react';
import { RouteObject, Link as RouterLink, useParams } from 'react-router';
import {
  VersioningHoc,
  getEntityFromQuery,
  getRelationDisplayName,
  useTeamEdfiTenantNavContextLoaded,
  withLoader,
} from '../helpers';
import { ApiClientsPageV2 } from '../Pages/ApiClientV2Plus/ApiClientsPage';
import { ApiClientPageV2 } from '../Pages/ApiClientV2Plus/ApiClientPage';
import { CreateApiClientPage } from '../Pages/ApiClientV2Plus/CreateApiClientPage';
import { ApiClientEntity } from '../Pages/ApiClientV2Plus/apiClientConfig';
import { UseQueryOptions, UseQueryResult, useQuery } from '@tanstack/react-query';
import { apiClientQueriesV2, apiClientQueriesV3 } from '../api';
import { createVersionedResource } from '../api/queries/versioned';

export const apiClientCreateRoute: RouteObject = {
  path: '/as/:asId/sb-environments/:sbEnvironmentId/edfi-tenants/:edfiTenantId/applications/:applicationId/apiClients/create',
  element: <VersioningHoc v2={<CreateApiClientPage />} v3={<CreateApiClientPage />} />,
  handle: { crumb: () => 'Create Credentials' },
};

// v2/v3 breadcrumbs are byte-for-byte identical except which queries module
// they call — same dedupe shape as application.routes.tsx's
// useApplicationBreadcrumbQueries. Like Application (and unlike Vendor, whose
// V2/V3 DTOs are structurally identical), ApiClient's V2/V3 `getOne` return
// types differ (odsInstanceIds vs dataStoreIds), so this must be a real
// discriminated union rather than one shared function type.
type ApiClientBreadcrumbConfig =
  | { version: 'v2'; getOne: typeof apiClientQueriesV2.getOne }
  | { version: 'v3'; getOne: typeof apiClientQueriesV3.getOne };

const useApiClientBreadcrumbQueries = createVersionedResource<ApiClientBreadcrumbConfig>({
  v2: { version: 'v2', getOne: apiClientQueriesV2.getOne },
  v3: { version: 'v3', getOne: apiClientQueriesV3.getOne },
});

const ApiClientBreadcrumbV2Plus = () => {
  const params = useParams() as {
    applicationId: string;
    apiClientId: string;
  };
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const { getOne } = useApiClientBreadcrumbQueries();
  // TypeScript cannot resolve union-typed overloaded functions; cast to the
  // actual return type. Same workaround as ApiClientPage.tsx/NameCell.tsx.
  const apiClient = useQuery(
    getOne(
      {
        id: params.apiClientId,
        edfiTenant,
        teamId,
      },
      {}
    ) as UseQueryOptions<ApiClientEntity>
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (apiClient.data?.displayName ?? params.apiClientId) as any;
};
export const apiClientIndexRoute: RouteObject = {
  path: '/as/:asId/sb-environments/:sbEnvironmentId/edfi-tenants/:edfiTenantId/applications/:applicationId/apiClients/:apiClientId/',
  element: <VersioningHoc v2={<ApiClientPageV2 />} v3={<ApiClientPageV2 />} />,
};

export const apiClientRoute: RouteObject = {
  path: '/as/:asId/sb-environments/:sbEnvironmentId/edfi-tenants/:edfiTenantId/applications/:applicationId/apiClients/:apiClientId',
  handle: {
    crumb: withLoader(() => (
      <VersioningHoc v2={<ApiClientBreadcrumbV2Plus />} v3={<ApiClientBreadcrumbV2Plus />} />
    )),
    fallbackCrumb: () => 'Credentials',
  },
};
export const apiClientsIndexRoute: RouteObject = {
  path: '/as/:asId/sb-environments/:sbEnvironmentId/edfi-tenants/:edfiTenantId/applications/:applicationId/apiClients',
  element: <VersioningHoc v2={<ApiClientsPageV2 />} v3={<ApiClientsPageV2 />} />,
};
export const apiClientsRoute: RouteObject = {
  path: '/as/:asId/sb-environments/:sbEnvironmentId/edfi-tenants/:edfiTenantId/applications/:applicationId/apiClients',
  handle: { crumb: () => 'Credentials' },
};

export const ApiClientLinkV2 = (props: {
  id: number | undefined;
  applicationId: number | undefined;
  query: UseQueryResult<Record<string | number, ApiClientEntity>, unknown>;
}) => {
  const apiClient = getEntityFromQuery(props.id, props.query);
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();

  if (apiClient) {
    return (
      <Link as="span">
        <RouterLink
          title="Go to application credentials"
          to={`/as/${teamId}/sb-environments/${edfiTenant.sbEnvironmentId}/edfi-tenants/${edfiTenant.id}/applications/${props.applicationId}/apiClients/${props.id}`}
        >
          {getRelationDisplayName(props.id, props.query)}
        </RouterLink>
      </Link>
    );
  }

  if (props.id !== null && props.id !== undefined) {
    return (
      <Text title="Credentials may have been deleted, or you lack access." as="i" color="gray.500">
        can't find &#8220;{props.id}&#8221;
      </Text>
    );
  }

  return null;
};