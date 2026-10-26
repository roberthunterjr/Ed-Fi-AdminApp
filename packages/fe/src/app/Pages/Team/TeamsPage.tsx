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
import { GetTeamDto } from '@edanalytics/models';

import omit from 'lodash/omit';
import { teamQueries, userQueries } from '../../api';
import { getRelationDisplayName } from '../../helpers/getRelationDisplayName';
import { TeamLink, UserGlobalLink } from '../../routes';
import { useTeamActions } from './useTeamActions';
import { useTeamsActions } from './useTeamsActions';

const TeamNameCell = (info: SbaaCellContext<GetTeamDto>) => {
  const teams = useQuery(teamQueries.getAll({}));
  const actions = useTeamActions(info.row.original);
  return (
    <HStack justify="space-between">
      <TeamLink id={info.row.original.id} query={teams} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};

export const TeamsPage = () => {
  const teams = useQuery(teamQueries.getAll({}));
  const users = useQuery(userQueries.getAll({ optional: true }));
  const actions = useTeamsActions();

  return (
    <PageTemplate title="Teams" actions={<PageActions actions={omit(actions, 'View')} />}>
      <SbaaTableAllInOne
        data={Object.values(teams?.data || {})}
        columns={[
          {
            accessorKey: 'displayName',
            cell: TeamNameCell,
            header: 'Name',
          },
          {
            id: 'modifiedBy',
            accessorFn: (info) => getRelationDisplayName(info.modifiedById, users),
            header: 'Modified by',
            cell: (info) => <UserGlobalLink id={info.row.original.modifiedById} />,
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
            cell: (info) => <UserGlobalLink id={info.row.original.createdById} />,
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
