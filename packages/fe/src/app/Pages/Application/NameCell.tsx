import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetApplicationDto } from '@edanalytics/models';

import { useQuery } from '@tanstack/react-query';
import { applicationQueriesV1 } from '../../api';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { ApplicationLinkV1 } from '../../routes';
import { useSingleApplicationActions } from './useApplicationActions';

export const NameCell = (info: SbaaCellContext<GetApplicationDto>) => {
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const entities = useQuery(
    applicationQueriesV1.getAll({
      teamId,
      edfiTenant,
    })
  );
  const actions = useSingleApplicationActions({
    application: info.row.original,
    edfiTenant: edfiTenant,
    teamId,
  });
  return (
    <HStack justify="space-between">
      <ApplicationLinkV1 id={info.row.original.id} query={entities} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
