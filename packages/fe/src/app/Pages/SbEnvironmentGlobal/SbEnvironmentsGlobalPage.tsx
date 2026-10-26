import { useQuery } from '@tanstack/react-query';
import { HStack } from '@chakra-ui/react';
import {
  PageActions,
  SbaaTableAllInOne,
  PageTemplate,
  TableRowActions,
  ValueAsDate,
  SbaaCellContext,
} from '@edanalytics/common-ui';
import { GetSbEnvironmentDto } from '@edanalytics/models';
import omit from 'lodash/omit';
import { sbEnvironmentQueries, userQueries } from '../../api';
import { getRelationDisplayName } from '../../helpers/getRelationDisplayName';
import { SbEnvironmentGlobalLink, UserGlobalLink } from '../../routes';
import { useSbEnvironmentGlobalActions } from './useSbEnvironmentGlobalActions';
import { useSbEnvironmentsGlobalActions } from './useSbEnvironmentsGlobalActions';
import { useAuthorize } from '../../helpers';

const SbEnvironmentsNameCell = (info: SbaaCellContext<GetSbEnvironmentDto>) => {
  const actions = useSbEnvironmentGlobalActions(info.row.original);
  return (
    <HStack justify="space-between">
      <SbEnvironmentGlobalLink id={info.row.original.id} sbEnvironment={info.row.original} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};

export const SbEnvironmentsGlobalPage = () => {
  const sbEnvironments = useQuery(sbEnvironmentQueries.getAll({}));
  const users = useQuery({
    ...userQueries.getAll({}),
    enabled: useAuthorize({
      privilege: 'user:read',
      subject: {
        id: '__filtered__',
      },
    }),
  });
  const actions = useSbEnvironmentsGlobalActions();

  return (
    <PageTemplate actions={<PageActions actions={omit(actions, 'View')} />} title="Environments">
      <SbaaTableAllInOne
        data={Object.values(sbEnvironments?.data || {})}
        columns={[
          {
            accessorKey: 'displayName',
            cell: SbEnvironmentsNameCell,
            header: 'Name',
          },
          {
            id: 'odsApiVersion',
            accessorFn: (info) => info.odsApiVersion ?? '-',
            cell: (info) => (info.getValue() === '-' ? '' : info.getValue()),
            header: 'API version',
            filterFn: 'equalsString',
            meta: {
              type: 'options',
            },
          },
          {
            id: 'odsDsVersion',
            accessorFn: (info) => info.odsDsVersion ?? '-',
            cell: (info) => (info.getValue() === '-' ? '' : info.getValue()),
            header: 'Data standard',
            filterFn: 'equalsString',
            meta: {
              type: 'options',
            },
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
    </PageTemplate>
  );
};
