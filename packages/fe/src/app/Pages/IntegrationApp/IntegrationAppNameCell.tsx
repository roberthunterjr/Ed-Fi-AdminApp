import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetIntegrationAppDto } from '@edanalytics/models';

import { IntegrationAppLink } from './IntegrationAppLink';
import { useOneIntegrationAppActions } from './useOneIntegrationAppActions';

export const IntegrationAppNameCell = (info: SbaaCellContext<GetIntegrationAppDto>) => {
  const integrationApp = info.row.original;

  const actions = useOneIntegrationAppActions(integrationApp);

  return (
    <HStack justify="space-between">
      <IntegrationAppLink integrationApp={integrationApp} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
