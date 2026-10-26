import { useBoolean } from '@chakra-ui/react';
import {
  ColumnFiltersState,
  OnChangeFn,
  ReactTable,
  RowSelectionState,
  useTable,
} from '@tanstack/react-table';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { SbaaTableContext, diffSearchParams } from '.';
import {
  fuzzyFilter,
  getColumnFilterParam,
  getGlobalFilterParam,
  getPaginationParams,
  getSortParams,
  setColumnFilterParam,
  setGlobalFilterParam,
  setPaginationParams,
  setSortParams,
} from '../dataTable';
import { SbaaColumnDef, SbaaTableFeatures, sbaaTableFeatures } from './sbaaTableFeatures';

export function SbaaTableProviderServerSide<
  UseSubRows extends boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends UseSubRows extends true ? { id: any; subRows: T[] } : { id: any }
>(props: {
  useSubRows?: UseSubRows;
  children?: React.ReactNode;
  data: T[] | IterableIterator<T>;
  columns: SbaaColumnDef<T>[];
  enableRowSelection?: boolean;
  rowSelectionState?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState> | undefined;
  pageSizes?: number[];
  rowCount: number;
  getFacetedMinMaxValues: NonNullable<SbaaTableFeatures['facetedMinMaxValues']>;
  getFacetedUniqueValues: NonNullable<SbaaTableFeatures['facetedUniqueValues']>;
  queryKeyPrefix?: string | undefined;
}) {
  const data = useMemo(() => [...props.data], [props.data]);
  const columns = props.columns;
  const pageSizes = props.pageSizes ?? [10, 25, 50, 100];
  const [_searchParams, _setSearchParams] = useSearchParams();
  // detach mutations which ruin diff
  const searchParams = new URLSearchParams(_searchParams);

  const setSearchParams = (newValue: URLSearchParams) => {
    if (diffSearchParams(_searchParams, newValue)) {
      _setSearchParams(newValue);
    }
  };

  const columnFilters = getColumnFilterParam(searchParams, props.queryKeyPrefix);
  const setColumnFilters = (
    updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)
  ) => {
    if (typeof updater === 'function') {
      setSearchParams(
        setColumnFilterParam(updater(columnFilters), searchParams, props.queryKeyPrefix)
      );
    } else {
      setSearchParams(setColumnFilterParam(updater, searchParams, props.queryKeyPrefix));
    }
  };
  const [pendingFilterColumn, setPendingFilterColumn] = React.useState<string | boolean>(false);

  const globalFilter = getGlobalFilterParam(searchParams, props.queryKeyPrefix);
  const setGlobalFilter = (value: string | undefined) => {
    setSearchParams(
      setGlobalFilterParam(value === '' ? undefined : value, searchParams, props.queryKeyPrefix)
    );
  };
  const sortParams = getSortParams(searchParams, props.queryKeyPrefix);

  const paginationParams = getPaginationParams(searchParams, pageSizes[0], props.queryKeyPrefix);

  const showSettings = useBoolean(sortParams.length > 1 || columnFilters.length > 0);

  // Filtering, sorting, and pagination happen on the server (see the `manual*`
  // options below), so only the faceting slots are swapped for the caller's
  // server-backed implementations. TanStack Table v9 caches each column's facet
  // function on the table for its whole lifetime, so the registered slots are
  // stable delegates that call through to the latest props on every read —
  // otherwise facets would freeze at whatever data existed on first access.
  const facetFnsRef = useRef({
    getFacetedUniqueValues: props.getFacetedUniqueValues,
    getFacetedMinMaxValues: props.getFacetedMinMaxValues,
  });
  facetFnsRef.current = {
    getFacetedUniqueValues: props.getFacetedUniqueValues,
    getFacetedMinMaxValues: props.getFacetedMinMaxValues,
  };
  const [features] = useState<SbaaTableFeatures>(() => ({
    ...sbaaTableFeatures,
    facetedUniqueValues: (table, columnId) => () =>
      facetFnsRef.current.getFacetedUniqueValues(table, columnId)(),
    facetedMinMaxValues: (table, columnId) => () =>
      facetFnsRef.current.getFacetedMinMaxValues(table, columnId)(),
  }));

  const table = useTable({
    features,
    data,
    columns,
    state: {
      sorting: sortParams,
      globalFilter,
      columnFilters,
      ...(props.rowSelectionState ? { rowSelection: props.rowSelectionState } : {}),
      pagination: paginationParams,
    },
    onSortingChange: (updater) =>
      setSearchParams(
        setSortParams(
          typeof updater === 'function' ? updater(sortParams) : updater,
          searchParams,
          props.queryKeyPrefix
        )
      ),
    onPaginationChange: (updater) =>
      setSearchParams(
        setPaginationParams(
          typeof updater === 'function' ? updater(paginationParams) : updater,
          searchParams,
          pageSizes[0],
          props.queryKeyPrefix
        )
      ),
    globalFilterFn: fuzzyFilter,
    ...(props.onRowSelectionChange ? { onRowSelectionChange: props.onRowSelectionChange } : {}),
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    manualExpanding: !props.useSubRows,
    enableMultiRowSelection: props.enableRowSelection,
    getRowId: (row) => row.id,
    enableMultiSort: true,
    debugTable: false,
    autoResetPageIndex: false,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    pageCount: Math.ceil(props.rowCount / paginationParams.pageSize),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: pageSizes[0],
      },
    },
  });

  useEffect(() => {
    if (table.state.pagination.pageIndex > table.getPageCount() - 1) {
      table.setPageIndex(table.getPageCount() - 1);
    }
  });

  return (
    <SbaaTableContext.Provider
      value={{
        // The context is shared by tables of every row type; v9's invariant `TData`
        // generic means the concrete table has to be widened explicitly here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        table: table as unknown as ReactTable<SbaaTableFeatures, any>,
        pageSizes,
        pendingFilterColumn,
        setPendingFilterColumn,
        isRowSelectionEnabled: props.enableRowSelection,
        showSettings,
      }}
    >
      {props.children}
    </SbaaTableContext.Provider>
  );
}
