import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetEdfiTenantDto } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { edfiTenantQueries } from '../../api';
import { useTeamSbEnvironmentNavContext } from '../../helpers';
import { EdfiTenantLink } from '../../routes';
import { useEdfiTenantActions } from './useEdfiTenantActions';

export const NameCell = (info: SbaaCellContext<GetEdfiTenantDto>) => {
  const { teamId, sbEnvironmentId } = useTeamSbEnvironmentNavContext();

  const edfiTenants = useQuery(
    edfiTenantQueries.getAll({
      teamId,
      sbEnvironmentId,
    })
  );
  const actions = useEdfiTenantActions(info.row.original);
  return (
    <HStack justify="space-between">
      <EdfiTenantLink id={info.row.original.id} query={edfiTenants} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
