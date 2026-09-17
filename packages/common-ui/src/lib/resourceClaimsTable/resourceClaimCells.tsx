import { Badge, BadgeProps, Flex, IconButton, StyleProps, Text } from '@chakra-ui/react';
import { CellContext } from '@tanstack/react-table';
import { useSbaaTableContext } from '../sbaaTable';
import { Icons } from '../Icons';

// Shared by ResourceClaimsTableV2/V3 (and, via NameCell/NameHeader, the
// generic row shape both define). Their row types genuinely diverge in
// shape elsewhere (see 530-design.md), but these three components never
// read anything beyond a row's `name` and the row/table's own expand-state
// API, so there's nothing version-specific to duplicate — this file used to
// exist twice, byte-for-byte, which is exactly why a past fix (the arrow/
// name wrapping onto separate lines) had to be applied in both places.

export const AuthStrategyBadge = (props: {
  authDefault: string | null;
  authOverride: string | null;
  hasAtAll: boolean;
}) => {
  const { authDefault, authOverride, hasAtAll } = props;
  const badgeProps: Partial<StyleProps & BadgeProps> = hasAtAll
    ? authOverride
      ? { colorScheme: 'blue' }
      : authDefault
      ? { colorScheme: 'gray', color: 'gray.600', fontStyle: 'italic' }
      : { colorScheme: 'orange' }
    : { colorScheme: 'red' };
  return (
    <Badge textTransform="none" {...badgeProps}>
      {hasAtAll ? authOverride ?? authDefault ?? 'Auth strategy unknown' : 'Denied'}
    </Badge>
  );
};

export const NameHeader = () => {
  const table = useSbaaTableContext().table;
  const canAnyExpand = table?.getCanSomeRowsExpand();
  return (
    <Text as="span" pl={canAnyExpand ? '20px' : undefined}>
      Name
    </Text>
  );
};

export function NameCell<T extends { name: string }>(props: CellContext<T, unknown>) {
  const table = useSbaaTableContext().table;
  const canAnyExpand = table?.getCanSomeRowsExpand();
  const canThisRowExpand = props.row.getCanExpand();

  return (
    // A plain Box let the expand arrow and the name wrap onto separate
    // lines whenever the row's depth indentation left too little room on
    // the line for the full name — a flex row keeps them on one line
    // together, letting the name itself wrap instead if it's still too long.
    <Flex
      ml={`${props.row.depth * 1.5}rem`}
      pl={canThisRowExpand || !canAnyExpand ? undefined : '20px'}
      align="center"
    >
      {canThisRowExpand && (
        <IconButton
          flexShrink={0}
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
      <Text as="span">{props.row.original.name}</Text>
    </Flex>
  );
}
