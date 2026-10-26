import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetEdorgDto } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { edorgQueries } from '../../api';

import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { useReadTeamEntity } from '../../helpers/useStandardRowActionsNew';
import { EdorgLink, edorgIndexRoute } from '../../routes';
import { useEdorgActions } from './useEdorgActions';

export const NameCell = (info: SbaaCellContext<GetEdorgDto>) => {
  const { teamId, edfiTenant, edfiTenantId, sbEnvironmentId } = useTeamEdfiTenantNavContextLoaded();

  const entities = useQuery(
    edorgQueries.getAll({
      teamId,
      edfiTenant,
    })
  );

  const View = useReadTeamEntity({
    entity: info.row.original,
    params: { edfiTenantId, sbEnvironmentId, asId: teamId, edorgId: info.row.original.id },
    privilege: 'team.sb-environment.edfi-tenant.ods.edorg:read',
    route: edorgIndexRoute,
  });
  const actions = {
    ...(View ? { View } : undefined),
    ...useEdorgActions(info.row.original),
  };
  return (
    <HStack justify="space-between">
      <EdorgLink id={info.row.original.id} query={entities} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
