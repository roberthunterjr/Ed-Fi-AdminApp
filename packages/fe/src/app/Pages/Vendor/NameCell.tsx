import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetVendorDto } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';

import { vendorQueriesV1 } from '../../api';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { VendorLinkV1 } from '../../routes';
import { useVendorActions } from './useVendorActions';

export const NameCell = (info: SbaaCellContext<GetVendorDto>) => {
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const entities = useQuery(
    vendorQueriesV1.getAll({
      teamId,
      edfiTenant,
    })
  );
  const actions = useVendorActions(info.row.original);
  return (
    <HStack justify="space-between">
      <VendorLinkV1 id={info.row.original.id} query={entities} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
