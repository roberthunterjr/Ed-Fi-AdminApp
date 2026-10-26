import { HStack } from '@chakra-ui/react';
import { TableRowActions, SbaaCellContext } from '@edanalytics/common-ui';
import { GetUserDto } from '@edanalytics/models';
import { UserGlobalLink } from '../../routes';
import { useUserGlobalActions } from './useUserGlobalActions';

export const UsersTableNameCell = (info: SbaaCellContext<GetUserDto>) => {
  const actions = useUserGlobalActions(info.row.original);
  return (
    <HStack justify="space-between">
      <UserGlobalLink id={info.row.original.id} />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
