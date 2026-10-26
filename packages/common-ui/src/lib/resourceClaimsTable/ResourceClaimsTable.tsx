import { Badge, BadgeProps, Box, Flex, IconButton, StyleProps, Text } from '@chakra-ui/react';
import { GetClaimsetDto, ResourceClaimDto131 } from '@edanalytics/models';
import { SbaaTableAllInOne, useSbaaTableContext, SbaaCellContext } from '../sbaaTable';
import { Icons } from '../Icons';

const AuthStrategyBadge = (props: {
  authDefault: (string | null)[];
  authOverride: (string | null)[];
  hasAtAll: boolean;
}) => {
  const { authDefault, authOverride, hasAtAll } = props;
  const badgeProps: Partial<StyleProps & BadgeProps> = hasAtAll
    ? authOverride.length
      ? { colorScheme: 'blue' }
      : authDefault.length
      ? { colorScheme: 'gray', color: 'gray.600', fontStyle: 'italic' }
      : { colorScheme: 'orange' }
    : { colorScheme: 'red' };
  const values = (
    hasAtAll
      ? authOverride.length
        ? authOverride
        : authDefault.length
        ? authDefault
        : ['Auth strategy unknown']
      : ['Denied']
  ).filter((v) => v !== null);
  return (
    <>
      {values.map((str) => (
        <Badge key={str} textTransform="none" {...badgeProps}>
          {str}
        </Badge>
      ))}
    </>
  );
};

type ResourceClaimRow = Pick<
  ResourceClaimDto131,
  'name' | 'create' | 'read' | 'update' | 'delete'
> & {
  id: string;
  createDefault: (string | null)[];
  readDefault: (string | null)[];
  updateDefault: (string | null)[];
  deleteDefault: (string | null)[];
  readChangesDefault: (string | null)[];
  createOverride: (string | null)[];
  readOverride: (string | null)[];
  updateOverride: (string | null)[];
  deleteOverride: (string | null)[];
  readChangesOverride: (string | null)[];
  subRows: ResourceClaimRow[];
};
const mapRc = (rc: ResourceClaimDto131): ResourceClaimRow => {
  // Sometimes the length is other than 4, which is a bug. We need to just return 'unknown' in that case.
  const correctLength = rc.readChanges === undefined ? 4 : 5;
  const defaults =
    rc.defaultAuthStrategiesForCRUD.length >= correctLength
      ? rc.defaultAuthStrategiesForCRUD
      : undefined;
  return {
    ...rc,
    id: rc.name,
    createDefault: rc.create
      ? defaults?.[0]?.authorizationStrategies?.map((as) => as.authStrategyName) ?? []
      : [],
    readDefault: rc.read
      ? defaults?.[1]?.authorizationStrategies?.map((as) => as.authStrategyName) ?? []
      : [],
    updateDefault: rc.update
      ? defaults?.[2]?.authorizationStrategies?.map((as) => as.authStrategyName) ?? []
      : [],
    deleteDefault: rc.delete
      ? defaults?.[3]?.authorizationStrategies?.map((as) => as.authStrategyName) ?? []
      : [],
    readChangesDefault: rc.readChanges
      ? defaults?.[4]?.authorizationStrategies?.map((as) => as.authStrategyName) ?? []
      : [],
    createOverride: rc.create
      ? rc.authStrategyOverridesForCRUD[0]?.authorizationStrategies?.map(
          (as) => as.authStrategyName
        ) ?? []
      : [],
    readOverride: rc.read
      ? rc.authStrategyOverridesForCRUD[1]?.authorizationStrategies?.map(
          (as) => as.authStrategyName
        ) ?? []
      : [],
    updateOverride: rc.update
      ? rc.authStrategyOverridesForCRUD[2]?.authorizationStrategies?.map(
          (as) => as.authStrategyName
        ) ?? []
      : [],
    deleteOverride: rc.delete
      ? rc.authStrategyOverridesForCRUD[3]?.authorizationStrategies?.map(
          (as) => as.authStrategyName
        ) ?? []
      : [],
    readChangesOverride: rc.readChanges
      ? rc.authStrategyOverridesForCRUD[4]?.authorizationStrategies?.map(
          (as) => as.authStrategyName
        ) ?? []
      : [],
    subRows: rc.children?.map(mapRc),
  };
};
const NameHeader = () => {
  const table = useSbaaTableContext().table;
  const canAnyExpand = table?.getCanSomeRowsExpand();
  return (
    <Text as="span" pl={canAnyExpand ? '20px' : undefined}>
      Name
    </Text>
  );
};
const NameCell = (props: SbaaCellContext<ResourceClaimRow>) => {
  const table = useSbaaTableContext().table;
  const canAnyExpand = table?.getCanSomeRowsExpand();
  const canThisRowExpand = props.row.getCanExpand();

  return (
    <Box
      ml={`${props.row.depth * 1.5}rem`}
      pl={canThisRowExpand || !canAnyExpand ? undefined : '20px'}
    >
      {canThisRowExpand && (
        <IconButton
          display="inline-block"
          onClick={() => props.row.toggleExpanded()}
          aria-label="open or close"
          title="open or close"
          variant="unstyled"
          w="20px"
          h="20px"
          minH="20px"
          minW="20px"
          size="xs"
          className={props.row.getIsExpanded() ? 'opened' : undefined}
          css={{
            '&.opened': {
              transition: '0.5s',
              transform: 'rotate(90deg)',
            },
            svg: {
              margin: 'auto',
            },
          }}
          icon={<Icons.CaretRightFill />}
        />
      )}
      {props.row.original.name}
    </Box>
  );
};
export const ResourceClaimsTable = ({ claimset }: { claimset: GetClaimsetDto }) => {
  const hasReadChanges = claimset.resourceClaims.some((rc) => rc.readChanges !== undefined);
  return (
    <>
      <SbaaTableAllInOne
        useSubRows
        data={claimset.resourceClaims.map(mapRc)}
        columns={[
          {
            accessorKey: 'name',
            header: NameHeader,
            cell: NameCell,
          },
          {
            id: 'read',
            header: 'Read',
            accessorFn: (rc) =>
              rc.read ? rc.readOverride ?? rc.readDefault ?? 'Auth strategy unknown' : 'Denied',
            cell: ({ row: { original } }) => (
              <AuthStrategyBadge
                authOverride={original.readOverride}
                authDefault={original.readDefault}
                hasAtAll={original.read}
              />
            ),
            meta: {
              type: 'options',
            },
          },
          {
            id: 'create',
            header: 'Create',
            accessorFn: (rc) =>
              rc.create
                ? rc.createOverride ?? rc.createDefault ?? 'Auth strategy unknown'
                : 'Denied',
            cell: ({ row: { original } }) => (
              <AuthStrategyBadge
                authOverride={original.createOverride}
                authDefault={original.createDefault}
                hasAtAll={original.create}
              />
            ),
            meta: {
              type: 'options',
            },
          },
          {
            id: 'update',
            header: 'Update',
            accessorFn: (rc) =>
              rc.update
                ? rc.updateOverride ?? rc.updateDefault ?? 'Auth strategy unknown'
                : 'Denied',
            cell: ({ row: { original } }) => (
              <AuthStrategyBadge
                authOverride={original.updateOverride}
                authDefault={original.updateDefault}
                hasAtAll={original.update}
              />
            ),
            meta: {
              type: 'options',
            },
          },
          {
            id: 'delete',
            header: 'Delete',
            accessorFn: (rc) =>
              rc.delete
                ? rc.deleteOverride ?? rc.deleteDefault ?? 'Auth strategy unknown'
                : 'Denied',
            cell: ({ row: { original } }) => (
              <AuthStrategyBadge
                authOverride={original.deleteOverride}
                authDefault={original.deleteDefault}
                hasAtAll={original.delete}
              />
            ),
            meta: {
              type: 'options',
            },
          },
          ...(hasReadChanges
            ? ([
                {
                  id: 'readChanges',
                  header: 'Read Changes',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  accessorFn: (rc: any) =>
                    rc.readChanges
                      ? rc.readChangesOverride ?? rc.readChangesDefault ?? 'Auth strategy unknown'
                      : 'Denied',
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  cell: ({ row: { original } }: any) => (
                    <AuthStrategyBadge
                      authOverride={original.readChangesOverride}
                      authDefault={original.readChangesDefault}
                      hasAtAll={original.readChanges}
                    />
                  ),
                  meta: {
                    type: 'options',
                  },
                },
              ] as const)
            : []),
        ]}
      />
      <Flex
        borderTop="1px solid"
        borderColor="gray.200"
        mt={3}
        pt={3}
        css={{
          '& span': {
            width: 'fit-content',
          },
        }}
        gap={1}
        flexDir="column"
      >
        <AuthStrategyBadge authDefault={['Default auth strategy']} authOverride={[]} hasAtAll />
        <AuthStrategyBadge authOverride={['Override auth strategy']} authDefault={[]} hasAtAll />
        <AuthStrategyBadge authOverride={[]} authDefault={[]} hasAtAll={false} />
        <AuthStrategyBadge authOverride={[]} authDefault={[]} hasAtAll />
      </Flex>
    </>
  );
};
