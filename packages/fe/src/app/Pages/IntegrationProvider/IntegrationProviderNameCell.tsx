import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetIntegrationProviderDto } from '@edanalytics/models';
import { IntegrationProviderLink } from './IntegrationProviderLink';
import { useOneIntegrationProviderGlobalActions } from './useOneIntegrationProviderGlobalActions';

export const IntegrationProviderNameCell = (
  info: SbaaCellContext<GetIntegrationProviderDto>
) => {
  const actions = useOneIntegrationProviderGlobalActions(info.row.original);
  return (
    <HStack justify="space-between">
      <IntegrationProviderLink id={info.row.original.id} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
