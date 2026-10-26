import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetSbEnvironmentDto } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { sbEnvironmentQueries } from '../../api';
import { useTeamNavContext } from '../../helpers';
import { useReadTeamEntity } from '../../helpers/useStandardRowActionsNew';
import { SbEnvironmentLink, sbEnvironmentRoute } from '../../routes';

export const NameCell = (info: SbaaCellContext<GetSbEnvironmentDto>) => {
  const { teamId, asId } = useTeamNavContext();
  const sbEnvironments = useQuery(
    sbEnvironmentQueries.getAll({
      teamId,
    })
  );
  const View = useReadTeamEntity({
    entity: info.row.original,
    params: { asId, sbEnvironmentId: info.row.original.id },
    privilege: 'team.sb-environment:read',
    route: sbEnvironmentRoute,
  });
  const actions = {
    ...(View ? { View } : undefined),
  };
  return (
    <HStack justify="space-between">
      <SbEnvironmentLink id={info.row.original.id} query={sbEnvironments} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
