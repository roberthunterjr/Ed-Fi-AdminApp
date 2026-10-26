// SPDX-License-Identifier: Apache-2.0
// Licensed to the Ed-Fi Alliance under one or more agreements.
// The Ed-Fi Alliance licenses this file to you under the Apache License, Version 2.0.
// See the LICENSE and NOTICES files in the project root for more information.

import { HStack } from '@chakra-ui/react';
import {
  PageActions,
  PageTemplate,
  SbaaTableAllInOne,
  TableRowActions,
  ValueAsDate,
  SbaaCellContext,
} from '@edanalytics/common-ui';
import { GetEdfiTenantDto } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import omit from 'lodash/omit';
import { edfiTenantQueriesGlobal, userQueries } from '../../api';
import { useSbEnvironmentNavContext, withLoader } from '../../helpers';
import { getRelationDisplayName } from '../../helpers/getRelationDisplayName';
import { EdfiTenantGlobalLink, UserGlobalLink } from '../../routes';
import { useEdfiTenantGlobalActions } from './useEdfiTenantGlobalActions';
import { useEdfiTenantsGlobalActions } from './useEdfiTenantsGlobalActions';

export const EdfiTenantsNameCell = (info: SbaaCellContext<GetEdfiTenantDto>) => {
  const tenant = info.row.original;
  const actions = useEdfiTenantGlobalActions(tenant);
  // Resolve the link from the row itself rather than from the tenants query
  // map: after a refetch (e.g. sync completion) the table's rows and the
  // query data can briefly be different snapshots, which made the link render
  // `can't find "<id>"` for a tenant that is plainly in this row.
  const rowQuery = { data: { [tenant.id]: tenant } };
  return (
    <HStack justify="space-between">
      <EdfiTenantGlobalLink id={tenant.id} query={rowQuery} />
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
          cell: (info) => <EdfiTenantsNameCell {...info} />,
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
