import { DateFormat, DateValue } from '..';
import type { SbaaCellContext } from './sbaaTableFeatures';

export function ValueAsDate(param?: { default?: DateFormat }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (info: SbaaCellContext<any>) => {
    const value = info.getValue();
    return typeof value === 'number' ? (
      <DateValue value={new Date(value)} defaultDateFmt={param?.default} />
    ) : value instanceof Date ? (
      <DateValue value={value} defaultDateFmt={param?.default} />
    ) : null;
  };
}
