import {
  CellContext,
  Column,
  ColumnDef,
  Row,
  columnFacetingFeature,
  columnFilteringFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  globalFilteringFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/react-table';
import { fuzzyFilter } from '../dataTable';

/**
 * Table features shared by every SbaaTable. TanStack Table v9 only exposes the
 * APIs of features registered here, so anything a table, column, row, or cell
 * component calls must have its feature listed.
 *
 * The full built-in `filterFns` and `sortFns` registries are kept so column
 * definitions can keep referring to them by name (e.g. `filterFn: 'equalsString'`)
 * and so `'auto'` resolution behaves as it did in v8.
 */
export const sbaaTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  columnFacetingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowExpandingFeature,
  rowSelectionFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  filterFns: { ...filterFns, fuzzy: fuzzyFilter },
  sortFns,
});

export type SbaaTableFeatures = typeof sbaaTableFeatures;

export type SbaaColumnDef<TData extends object, TValue = unknown> = ColumnDef<
  SbaaTableFeatures,
  TData,
  TValue
>;
export type SbaaColumn<TData extends object, TValue = unknown> = Column<
  SbaaTableFeatures,
  TData,
  TValue
>;
export type SbaaRow<TData extends object> = Row<SbaaTableFeatures, TData>;
export type SbaaCellContext<TData extends object, TValue = unknown> = CellContext<
  SbaaTableFeatures,
  TData,
  TValue
>;
