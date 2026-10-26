import '@tanstack/react-table';

declare module '@tanstack/table-core' {
  interface ColumnMeta<
    _TFeatures extends TableFeatures,
    _TData extends RowData,
    _TValue extends CellData = CellData,
  > {
    type: 'date' | 'duration' | 'number' | 'options' | undefined;
  }
}
