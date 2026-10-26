import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { useQuery } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { ProfileLink } from '../../routes';
import { useProfileActions } from './useProfileActions';
import { ProfileEntity, useProfileConfig } from './profileConfig';

export const NameCell = (info: SbaaCellContext<ProfileEntity>) => {
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const { queries } = useProfileConfig();
  const entities = useQuery(
    queries.getAll({
      teamId,
      edfiTenant,
    })
  );

  const actions = useProfileActions(info.row.original);
  return (
    <HStack justify="space-between">
      <ProfileLink id={info.row.original.id} query={entities} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
