import { HStack } from '@chakra-ui/react';
import { TableRowActions } from '@edanalytics/common-ui';
import { CellContext } from '@tanstack/react-table';
import omit from 'lodash/omit';
import { useSingleApiClientActions } from './useApiClientActions';
import { ApiClientLinkV2 } from '../../routes/apiClients.routes';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { ApiClientEntity, useApiClientConfig } from './apiClientConfig';
import { UseQueryOptions, useQuery } from '@tanstack/react-query';

export const NameCell = (
  info: CellContext<ApiClientEntity, unknown>
) => {
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const { queries } = useApiClientConfig();
  // TypeScript cannot resolve union-typed overloaded functions; cast to the
  // actual return type. Same workaround as ClaimsetV2Plus/NameCell.tsx.
  const apiClients = useQuery(
    queries.getAll(
      {
        teamId,
        edfiTenant,
      },
      {
        applicationId: info.row.original.applicationId,
      }
    ) as UseQueryOptions<Record<string | number, ApiClientEntity>>
  );
  const actions = useSingleApiClientActions({
    apiClient: info.row.original,
    applicationId: info.row.original.applicationId,
  });
  return (
    <HStack justify="space-between">
      <ApiClientLinkV2
        id={info.row.original.id}
        applicationId={info.row.original.applicationId}
        query={apiClients}
      />
      <TableRowActions actions={omit(actions, 'Create')} />
    </HStack>
  );
};
