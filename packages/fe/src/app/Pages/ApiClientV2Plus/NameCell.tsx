import { HStack } from '@chakra-ui/react';
import { TableRowActions } from '@edanalytics/common-ui';
import { CellContext } from '@tanstack/react-table';
import omit from 'lodash/omit';
import { useSingleApiClientActions } from './useApiClientActions';
import { ApiClientLinkV2 } from '../../routes/apiClients.routes';
import { ApiClientEntity } from './apiClientConfig';
import { useApplicationApiClients } from './useApplicationApiClients';

export const NameCell = (info: CellContext<ApiClientEntity, unknown>) => {
  // `throwOnError: true` keeps this cell's pre-existing behaviour: unlike the
  // hook's other consumers, a failed load here has always propagated to an
  // ErrorBoundary rather than rendering a link with no display name.
  const { query: apiClientsQuery } = useApplicationApiClients(info.row.original.applicationId, {
    throwOnError: true,
  });
  const actions = useSingleApiClientActions({
    apiClient: info.row.original,
    applicationId: info.row.original.applicationId,
  });
  return (
    <HStack justify="space-between">
      <ApiClientLinkV2
        id={info.row.original.id}
        applicationId={info.row.original.applicationId}
        query={apiClientsQuery}
      />
      <TableRowActions actions={omit(actions, 'Create')} />
    </HStack>
  );
};
