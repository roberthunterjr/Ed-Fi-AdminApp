import {
  Badge,
  Box,
  HStack,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Text,
  chakra,
} from '@chakra-ui/react';
import {
  DateFormat,
  PageTemplate,
  SbaaTable,
  SbaaTableAdvancedButton,
  SbaaTableFilters,
  SbaaTablePagination,
  SbaaTableProviderServerSide,
  TableRowActions,
  ValueAsDate,
  getColumnFilterParam,
  getPaginationParams,
  getPrefixedName,
  getSortParams,
  stringifyColumnFilters,
} from '@edanalytics/common-ui';
import {
  PgBossJobState,
  SbSyncQueueDto,
  SbSyncQueueFacetedValuesDto,
  SyncQueuePaginatedResults,
} from '@edanalytics/models';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CellContext, ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { methods, queryKey } from '../../api';
import { useIsStartingBlocksDeployment } from '../../helpers';
import { SbSyncQueueLink } from '../../routes';
import { useSbSyncQueueActions } from './useSbSyncQueueActions';

export const jobStateColorSchemes: Record<PgBossJobState, string> = {
  active: 'purple',
  cancelled: 'orange',
  completed: 'green',
  created: 'blue',
  expired: 'orange',
  failed: 'red',
  retry: 'yellow',
};

/** Job states that indicate a sync queue row is still in-flight. */
export const pendingSyncQueueStates: PgBossJobState[] = ['created', 'active', 'retry'];

/** Interval (ms) to poll the sync queue at while any row is still pending. */
export const syncQueuePollingIntervalMs = 3000;

/** Whether any row in a paginated sync-queue result is still pending (not yet terminal). */
export const hasPendingSyncQueueRows = (
  data: SyncQueuePaginatedResults | undefined,
  sbEnvironmentId?: number
) =>
  (data?.data ?? []).some(
    (row) =>
      pendingSyncQueueStates.includes(row.state) &&
      (sbEnvironmentId === undefined || row.sbEnvironmentId === sbEnvironmentId)
  );

const urlStatePrefix = 'snc';

const SbSyncQueueNameCell = (info: CellContext<SbSyncQueueDto, unknown>) => {
  const actions = useSbSyncQueueActions(info.row.original);
  return (
    <HStack justify="space-between">
      <SbSyncQueueLink
        id={info.row.original.id}
        query={{ data: { [info.row.original.id]: info.row.original } }}
      />
      <TableRowActions actions={actions} />
    </HStack>
  );
};
const makeDataUrl = (
  pageIndex: number,
  sort: SortingState,
  filter: ColumnFiltersState,
  pageSize: number
) =>
  `/sb-sync-queues?colFilter=${stringifyColumnFilters(
    filter
  )}&pageIndex=${pageIndex}&pageSize=${pageSize}&${sort
    .map((s) => `sortCol=${s.id}&sortDesc=${s.desc}`)
    .join('&')}`;

const makeFacetedValuesUrl = (filter: ColumnFiltersState) =>
  `/sb-sync-queues/faceted-values?colFilter=${stringifyColumnFilters(filter)}`;

const fetchSyncQueues = (
  pageIndex: number,
  sort: SortingState,
  filter: ColumnFiltersState,
  pageSize: number
) => methods.getOne(makeDataUrl(pageIndex, sort, filter, pageSize), SyncQueuePaginatedResults);

const fetchSyncQueueFacetedValuess = (filter: ColumnFiltersState) =>
  methods.getOne(makeFacetedValuesUrl(filter), SbSyncQueueFacetedValuesDto);

export const SbSyncQueuesTable = ({
  defaultFilters,
  onSyncSettled,
}: {
  defaultFilters: ColumnFiltersState;
  /**
   * Called once each time this table's rows transition from having a pending
   * row to having none (e.g. so a caller can refresh unrelated data, like a
   * Tenants list, that the now-completed sync job may have changed).
   */
  onSyncSettled?: () => void;
}) => {
  const [searchParams] = useSearchParams(
    new URLSearchParams(
      `?${getPrefixedName('colFilter', urlStatePrefix)}=${stringifyColumnFilters(defaultFilters)}`
    )
  );
  const columnFilters = getColumnFilterParam(searchParams, urlStatePrefix)
    .filter((cf) => !defaultFilters.some((df) => df.id === cf.id))
    .concat(defaultFilters);
  // const globalFilter = getGlobalFilterParam(searchParams, undefined);
  // const setGlobalFilter = (value: string | undefined) => {
  //   setSearchParams(
  //     setGlobalFilterParam(value === '' ? undefined : value, searchParams, undefined)
  //   );
  // };
  const sortParams = getSortParams(searchParams, urlStatePrefix);

  const paginationParams = getPaginationParams(searchParams, 10, urlStatePrefix);
  const paginationState = {
    pageIndex: paginationParams.pageIndex ?? 0,
    pageSize: paginationParams.pageSize ?? 10,
  };

  // Pending state is checked against this separately, NOT against `queueData`
  // below: `queueData` is scoped to whatever page/sort/column-filter the user
  // currently has selected, so a pending row sitting on another page (or
  // excluded by the user's own filter/sort) would make `queueData` alone look
  // like nothing is pending, stopping all polling and permanently skipping
  // `onSyncSettled` for that job. This query only applies `defaultFilters`
  // (the caller's base scope, e.g. sbEnvironmentId) and fetches a page large
  // enough to cover realistic queue depths, independent of the user's own
  // table state.
  const pendingCheckPageSize = 1000;
  const pendingCheckData = useQuery({
    queryKey: [
      ...queryKey({
        resourceName: 'SbSyncQueue',
        id: makeDataUrl(0, [], defaultFilters, pendingCheckPageSize),
      }),
      'pending-check',
    ],
    queryFn: () => fetchSyncQueues(0, [], defaultFilters, pendingCheckPageSize),
    // Also keep polling on its own error (see `queueData` below for why),
    // rather than going silent forever after a single failed check.
    refetchInterval: (query) =>
      hasPendingSyncQueueRows(query.state.data) || query.state.error
        ? syncQueuePollingIntervalMs
        : false,
  });
  const isAutoRefreshing = hasPendingSyncQueueRows(pendingCheckData.data);
  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (wasPendingRef.current && !isAutoRefreshing) {
      onSyncSettled?.();
    }
    wasPendingRef.current = isAutoRefreshing;
  }, [isAutoRefreshing, onSyncSettled]);
  const queueData = useQuery({
    queryKey: queryKey({
      resourceName: 'SbSyncQueue',
      id: makeDataUrl(
        paginationState.pageIndex,
        sortParams,
        columnFilters,
        paginationState.pageSize
      ),
    }),
    queryFn: () =>
      fetchSyncQueues(
        paginationState.pageIndex,
        sortParams,
        columnFilters,
        paginationState.pageSize
      ),
    placeholderData: keepPreviousData,
    // Poll while anything matching the base scope is pending, not just while
    // this specific page/sort/filter view happens to show a pending row --
    // see `pendingCheckData` above.
    // Also keep polling while this specific query is erroring, so "retrying"
    // in the error message below is actually true rather than a one-shot
    // failure that never gets attempted again.
    refetchInterval: (query) =>
      isAutoRefreshing || query.state.error ? syncQueuePollingIntervalMs : false,
  });
  const facetedValues = useQuery({
    queryKey: [
      ...queryKey({
        resourceName: 'SbSyncQueue',
        id: makeFacetedValuesUrl(columnFilters),
      }),
      'faceted-values',
    ],
    queryFn: () => fetchSyncQueueFacetedValuess(columnFilters),
    placeholderData: keepPreviousData,
    // Same scope as `pendingCheckData` above, so poll in lockstep to avoid
    // stale filter option counts while rows are still in-flight. Also keeps
    // retrying on its own error, same reasoning as `queueData` above.
    refetchInterval: (query) =>
      isAutoRefreshing || query.state.error ? syncQueuePollingIntervalMs : false,
  });
  const hasRefreshError = queueData.isError || facetedValues.isError || pendingCheckData.isError;

  return (
    <SbaaTableProviderServerSide
      queryKeyPrefix={urlStatePrefix}
      getFacetedMinMaxValues={(table, columnId) => () => {
        if (columnId === 'createdOnNumber') {
          const result = facetedValues.data?.createdon ?? [null, null];
          return [Number(result[0]), Number(result[1])];
        } else if (columnId === 'completedOnNumber') {
          const result = facetedValues.data?.completedon ?? [null, null];
          return [Number(result[0]), Number(result[1])];
        } else {
          return undefined;
        }
      }}
      getFacetedUniqueValues={(table, columnId) => () => {
        if (['completedOnNumber', 'createdOnNumber'].includes(columnId)) {
          return new Map();
        } else {
          const result = facetedValues.data?.[columnId as keyof SbSyncQueueFacetedValuesDto] ?? [];
          return new Map(result.map((v) => [v, 1]));
        }
      }}
      rowCount={queueData.data?.rowCount ?? 0}
      data={queueData.data?.data ?? []}
      columns={[
        {
          accessorKey: 'name',
          enableColumnFilter: false,
          cell: SbSyncQueueNameCell,
          header: 'Name',
        },
        {
          accessorKey: 'dataText',
          enableColumnFilter: !defaultFilters.some((cf) => cf.id === 'dataText'),
          header: 'Trigger data',
          meta: {
            type: 'options',
          },
        },
        {
          accessorKey: 'type',
          enableColumnFilter: !defaultFilters.some((cf) => cf.id === 'type'),
          header: 'Type',
          meta: {
            type: 'options',
          },
        },
        {
          accessorKey: 'state',
          enableColumnFilter: !defaultFilters.some((cf) => cf.id === 'state'),
          header: 'State',
          cell: (info) => (
            <Badge colorScheme={jobStateColorSchemes[info.row.original.state]}>
              {info.row.original.state}
            </Badge>
          ),
          filterFn: 'equalsString',
          meta: {
            type: 'options',
          },
        },
        {
          enableColumnFilter: false,
          id: 'output',
          accessorFn: (info) =>
            info.output === null ? null : JSON.stringify(info.output, null, 2),
          cell: (info) =>
            info.getValue() ? (
              <Popover trigger="hover" autoFocus={false}>
                {({ isOpen }) => (
                  <>
                    <PopoverTrigger>
                      <Text
                        as="button"
                        textOverflow="ellipsis"
                        whiteSpace="nowrap"
                        overflow="hidden"
                        maxW="9em"
                      >
                        {info.getValue() as string}
                      </Text>
                    </PopoverTrigger>
                    <PopoverContent w="auto" boxShadow="lg" display={!isOpen ? 'none' : undefined}>
                      <PopoverArrow />
                      <PopoverBody borderRadius="md" p="unset" overflow="clip">
                        <Box
                          overflow="auto"
                          minH="7rem"
                          maxH="30rem"
                          minW="30rem"
                          maxW="50rem"
                          w="auto"
                          p={2}
                        >
                          <chakra.pre fontSize="sm">{info.getValue() as string}</chakra.pre>
                        </Box>
                      </PopoverBody>
                    </PopoverContent>
                  </>
                )}
              </Popover>
            ) : null,
          header: 'Output',
          enableSorting: false,
        },
        {
          id: 'createdon',
          enableColumnFilter: !defaultFilters.some((cf) => cf.id === 'createdon'),
          accessorKey: 'createdOnNumber',
          cell: ValueAsDate({ default: DateFormat.Long }),
          header: 'Created',
          meta: {
            type: 'date',
          },
        },
        {
          id: 'completedon',
          enableColumnFilter: !defaultFilters.some((cf) => cf.id === 'completedon'),
          accessorKey: 'completedOnNumber',
          cell: ValueAsDate({ default: DateFormat.Long }),
          header: 'Completed',
          meta: {
            type: 'date',
          },
        },
        // {
        //   id: 'duration',
        //   accessorFn: (info) =>
        //     info.completedon && info.createdon
        //       ? dayjs(info.completedon).diff(info.createdon) / 1000
        //       : null,
        //   cell: (info) => info.row.original.durationDetailed,
        //   header: 'Duration',
        //   meta: {
        //     type: 'duration',
        //   },
        // },
      ]}
    >
      <Box mb={4}>
        {isAutoRefreshing || hasRefreshError ? (
          <HStack mb={2}>
            {isAutoRefreshing ? (
              <Badge colorScheme="blue">Auto-refreshing while a sync is in progress…</Badge>
            ) : null}
            {hasRefreshError ? (
              <Text color="red.500" fontSize="sm">
                Couldn't refresh — retrying…
              </Text>
            ) : null}
          </HStack>
        ) : null}
        <HStack align="end">
          {/* <SbaaTableSearch /> */}
          <SbaaTableAdvancedButton />
        </HStack>
        <SbaaTableFilters mb={4} />
      </Box>
      <SbaaTable />
      <SbaaTablePagination />
    </SbaaTableProviderServerSide>
  );
};

export const SbSyncQueuesPage = () => {
  const isStartingBlocks = useIsStartingBlocksDeployment();
  return (
    <PageTemplate
      title={isStartingBlocks ? 'Starting Blocks sync queue' : 'Ed-Fi Data Store Sync Queue'}
      //  actions={<PageActions actions={actions} />}
    >
      <SbSyncQueuesTable defaultFilters={[]} />
    </PageTemplate>
  );
};
