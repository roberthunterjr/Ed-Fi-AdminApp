import {
  PageActions,
  PageTemplate,
  SbaaTableAllInOne,
} from '@edanalytics/common-ui';
import { Badge } from '@chakra-ui/react';
import { UseQueryOptions, useQuery } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { NameCell } from './NameCell';
import { useMultiApiClientsActions } from './useApiClientActions';
import { ApiClientEntity, useApiClientConfig } from './apiClientConfig';
import { useParams } from 'react-router';

export const ApiClientsPageV2 = () => {
  return (
    <PageTemplate title="Credentials" actions={<ApiClientsPageActions />}>
      <AllApiClientsTable />
    </PageTemplate>
  );
};

export const ApiClientsPageActions = () => {
  const params = useParams() as { applicationId: string };
  const { asId } = useTeamEdfiTenantNavContextLoaded();

  const actions = useMultiApiClientsActions({
    teamId: asId,
    applicationId: Number(params.applicationId),
  });
  return <PageActions actions={actions} />;
};

export const AllApiClientsTable = () => {
  const params = useParams() as { applicationId: string; };

  const { edfiTenant, asId } = useTeamEdfiTenantNavContextLoaded();
  const { queries } = useApiClientConfig();

  // TypeScript cannot resolve union-typed overloaded functions; cast to the
  // actual return type. Same workaround as ClaimsetsPage.tsx/NameCell.tsx.
  const apiClients = useQuery(
    queries.getAll(
      {
        teamId: asId,
        edfiTenant,
      },
      {
        applicationId: Number(params.applicationId),
      }
    ) as UseQueryOptions<Record<string | number, ApiClientEntity>>
  );
  return (
    <SbaaTableAllInOne
      data={Object.values(apiClients?.data || {})}
      columns={[
        {
          accessorKey: 'name',
          cell: NameCell,
          header: 'Name',
        },
        {
          accessorKey: 'key',
          header: 'Key',
        },
        {
          accessorKey: 'isApproved',
          header: 'Enabled',
          cell: (info) => (
            <Badge colorScheme={info.row.original.isApproved ? 'green' : 'red'}>
              {info.row.original.isApproved ? 'Enabled' : 'Disabled'}
            </Badge>
          ),
        },
      ]}
    />
  );
};