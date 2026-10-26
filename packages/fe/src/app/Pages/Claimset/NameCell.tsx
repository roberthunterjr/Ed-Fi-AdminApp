import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetClaimsetDto } from '@edanalytics/models';
import { claimsetQueriesV1 } from '../../api';

import { useQuery } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { ClaimsetLinkV1 } from '../../routes';
import { useClaimsetActions } from './useClaimsetActions';

export const NameCell = (info: SbaaCellContext<GetClaimsetDto>) => {
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const entities = useQuery(
    claimsetQueriesV1.getAll({
      teamId,
      edfiTenant,
    })
  );

  const actions = useClaimsetActions({
    claimset: info.row.original,
  });
  return (
    <HStack justify="space-between">
      <ClaimsetLinkV1 id={info.row.original.id} query={entities} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
