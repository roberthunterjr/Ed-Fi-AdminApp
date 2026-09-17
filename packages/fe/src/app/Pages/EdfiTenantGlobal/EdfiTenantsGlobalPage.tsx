import { HStack } from '@chakra-ui/react';
import {
  PageActions,
  PageTemplate,
  SbaaTableAllInOne,
  TableRowActions,
  ValueAsDate,
} from '@edanalytics/common-ui';
import { GetEdfiTenantDto } from '@edanalytics/models';
import { UseQueryResult, useQuery } from '@tanstack/react-query';
import { CellContext } from '@tanstack/react-table';
import omit from 'lodash/omit';
import { edfiTenantQueriesGlobal, userQueries } from '../../api';
import { useSbEnvironmentNavContext, withLoader } from '../../helpers';
import { getRelationDisplayName } from '../../helpers/getRelationDisplayName';
import { EdfiTenantGlobalLink, UserGlobalLink } from '../../routes';
import { useEdfiTenantGlobalActions } from './useEdfiTenantGlobalActions';
import { useEdfiTenantsGlobalActions } from './useEdfiTenantsGlobalActions';

const EdfiTenantsNameCell = (
  info: CellContext<GetEdfiTenantDto, unknown> & {
    edfiTenants: Pick<UseQueryResult<Record<string | number, GetEdfiTenantDto>>, 'data'>;
  }
) => {
  const actions = useEdfiTenantGlobalActions(info.row.original);
  return (
    <HStack justify="space-between">
      <EdfiTenantGlobalLink id={info.row.original.id} query={info.edfiTenants} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};

export const EdfiTenantsGlobalTable = () => {
  const { sbEnvironmentId } = useSbEnvironmentNavContext();

  const edfiTenants = useQuery(
    edfiTenantQueriesGlobal.getAll({
      sbEnvironmentId,
    })
  );
  const users = useQuery({
    ...userQueries.getAll({}),
    enabled: true, // TODO add auth to this so it doesn't error on unauthorized
  });
  return (
    <SbaaTableAllInOne
      queryKeyPrefix="tnt"
      data={Object.values(edfiTenants?.data || {})}
      columns={[
        {
          accessorKey: 'displayName',
          cell: (info) => <EdfiTenantsNameCell {...info} edfiTenants={edfiTenants} />,
          header: 'Name',
        },
        {
          id: 'modifiedBy',
          accessorFn: (info) => getRelationDisplayName(info.modifiedById, users),
          header: 'Modified by',
          cell: (info) => <UserGlobalLink query={users} id={info.row.original.modifiedById} />,
          filterFn: 'equalsString',
          meta: {
            type: 'options',
          },
        },
        {
          accessorKey: 'createdNumber',
          cell: ValueAsDate(),
          header: 'Created',
          meta: {
            type: 'date',
          },
        },
        {
          id: 'createdBy',
          accessorFn: (info) => getRelationDisplayName(info.createdById, users),
          header: 'Created by',
          cell: (info) => <UserGlobalLink query={users} id={info.row.original.createdById} />,
          filterFn: 'equalsString',
          meta: {
            type: 'options',
          },
        },
      ]}
    />
  );
};

export const EdfiTenantsGlobalPage = withLoader(() => {
  const actions = useEdfiTenantsGlobalActions();
  return (
    <PageTemplate actions={<PageActions actions={omit(actions, 'View')} />} title="Tenants">
      <EdfiTenantsGlobalTable />
    </PageTemplate>
  );
});
