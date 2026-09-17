import 'reflect-metadata';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import {
  SbSyncQueuesPage,
  SbSyncQueuesTable,
  hasPendingSyncQueueRows,
} from './SbSyncQueuesPage';
import { useIsStartingBlocksDeployment } from '../../helpers';

jest.mock('@chakra-ui/react', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Box: ({ children }: { children: React.ReactNode }) => children,
  HStack: ({ children }: { children: React.ReactNode }) => children,
  Popover: () => null,
  PopoverArrow: () => null,
  PopoverBody: () => null,
  PopoverContent: () => null,
  PopoverTrigger: () => null,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  chakra: { pre: () => null },
}));

jest.mock('@edanalytics/common-ui', () => ({
  DateFormat: { Long: 'Long' },
  PageTemplate: ({ children }: { children: React.ReactNode }) => children,
  SbaaTable: () => null,
  SbaaTableAdvancedButton: () => null,
  SbaaTableFilters: () => null,
  SbaaTablePagination: () => null,
  SbaaTableProviderServerSide: ({ children }: { children: React.ReactNode }) => children,
  TableRowActions: () => null,
  ValueAsDate: jest.fn(() => () => null),
  getColumnFilterParam: jest.fn(() => []),
  getPaginationParams: jest.fn(() => ({})),
  getPrefixedName: jest.fn((name: string) => name),
  getSortParams: jest.fn(() => []),
  stringifyColumnFilters: jest.fn(() => ''),
}));

jest.mock('@tanstack/react-query', () => ({
  keepPreviousData: 'keepPreviousData',
  useQuery: jest.fn(),
}));

jest.mock('react-router', () => ({
  useSearchParams: jest.fn(() => [new URLSearchParams()]),
}));

jest.mock('../../api', () => ({
  methods: { getOne: jest.fn() },
  queryKey: jest.fn(() => []),
}));

jest.mock('../../routes', () => ({
  SbSyncQueueLink: () => null,
}));

jest.mock('./useSbSyncQueueActions', () => ({
  useSbSyncQueueActions: jest.fn(() => ({})),
}));

jest.mock('../../helpers', () => ({
  useIsStartingBlocksDeployment: jest.fn(),
}));

const mockUseIsStartingBlocksDeployment = useIsStartingBlocksDeployment as jest.Mock;

describe('SbSyncQueuesPage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('keeps the Starting Blocks title for a Starting Blocks deployment', () => {
    mockUseIsStartingBlocksDeployment.mockReturnValue(true);

    const page = SbSyncQueuesPage() as React.ReactElement;

    expect(page.props.title).toBe('Starting Blocks sync queue');
  });

  it('uses the Ed-Fi Data Store title for a non-Starting-Blocks deployment', () => {
    mockUseIsStartingBlocksDeployment.mockReturnValue(false);

    const page = SbSyncQueuesPage() as React.ReactElement;

    expect(page.props.title).toBe('Ed-Fi Data Store Sync Queue');
  });
});

describe('hasPendingSyncQueueRows', () => {
  const row = (state: string, sbEnvironmentId = 1) => ({ state, sbEnvironmentId }) as never;

  it('returns false when data is undefined', () => {
    expect(hasPendingSyncQueueRows(undefined)).toBe(false);
  });

  it('returns false when data.data is empty', () => {
    expect(hasPendingSyncQueueRows({ data: [], rowCount: 0 } as never)).toBe(false);
  });

  it('returns false when every row is in a terminal state', () => {
    const data = { data: [row('completed'), row('failed'), row('cancelled')], rowCount: 3 };
    expect(hasPendingSyncQueueRows(data as never)).toBe(false);
  });

  it('returns true when at least one row is created, active, or retry', () => {
    for (const state of ['created', 'active', 'retry']) {
      const data = { data: [row('completed'), row(state)], rowCount: 2 };
      expect(hasPendingSyncQueueRows(data as never)).toBe(true);
    }
  });

  it('ignores a pending row outside the given sbEnvironmentId filter', () => {
    const data = { data: [row('active', 2)], rowCount: 1 };
    expect(hasPendingSyncQueueRows(data as never, 1)).toBe(false);
  });

  it('matches a pending row inside the given sbEnvironmentId filter', () => {
    const data = { data: [row('active', 1)], rowCount: 1 };
    expect(hasPendingSyncQueueRows(data as never, 1)).toBe(true);
  });
});

describe('SbSyncQueuesTable', () => {
  const mockUseQuery = useQuery as jest.Mock;
  let queueData: { data: unknown[]; rowCount: number } | undefined;

  beforeEach(() => {
    queueData = undefined;
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) =>
      options.queryKey.includes('faceted-values')
        ? { data: undefined, isFetching: false, isError: false }
        : { data: queueData, isFetching: false, isError: false }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('polls (returns a truthy interval) while a row is pending, and stops once settled', () => {
    queueData = { data: [{ state: 'active', sbEnvironmentId: 1 }], rowCount: 1 };
    render(<SbSyncQueuesTable defaultFilters={[]} />);

    const queueCall = mockUseQuery.mock.calls.find(
      (call) => !call[0].queryKey.includes('faceted-values')
    );
    expect(queueCall[0].refetchInterval({ state: { data: queueData } })).toBeTruthy();
    expect(
      queueCall[0].refetchInterval({ state: { data: { data: [], rowCount: 0 } } })
    ).toBe(false);
  });

  it('does not call onSyncSettled on initial mount when there is no pending row', () => {
    queueData = { data: [{ state: 'completed', sbEnvironmentId: 1 }], rowCount: 1 };
    const onSyncSettled = jest.fn();

    render(<SbSyncQueuesTable defaultFilters={[]} onSyncSettled={onSyncSettled} />);

    expect(onSyncSettled).not.toHaveBeenCalled();
  });

  it('calls onSyncSettled exactly once when rows transition from pending to settled', () => {
    queueData = { data: [{ state: 'active', sbEnvironmentId: 1 }], rowCount: 1 };
    const onSyncSettled = jest.fn();

    const { rerender } = render(
      <SbSyncQueuesTable defaultFilters={[]} onSyncSettled={onSyncSettled} />
    );
    expect(onSyncSettled).not.toHaveBeenCalled();

    queueData = { data: [{ state: 'completed', sbEnvironmentId: 1 }], rowCount: 1 };
    rerender(<SbSyncQueuesTable defaultFilters={[]} onSyncSettled={onSyncSettled} />);
    expect(onSyncSettled).toHaveBeenCalledTimes(1);

    // Re-rendering again with the same settled data must not re-fire it.
    rerender(<SbSyncQueuesTable defaultFilters={[]} onSyncSettled={onSyncSettled} />);
    expect(onSyncSettled).toHaveBeenCalledTimes(1);
  });

  it('does not call onSyncSettled while rows remain pending across renders', () => {
    queueData = { data: [{ state: 'created', sbEnvironmentId: 1 }], rowCount: 1 };
    const onSyncSettled = jest.fn();

    const { rerender } = render(
      <SbSyncQueuesTable defaultFilters={[]} onSyncSettled={onSyncSettled} />
    );

    queueData = { data: [{ state: 'retry', sbEnvironmentId: 1 }], rowCount: 1 };
    rerender(<SbSyncQueuesTable defaultFilters={[]} onSyncSettled={onSyncSettled} />);

    expect(onSyncSettled).not.toHaveBeenCalled();
  });

  it('shows an auto-refreshing indicator while a row is pending', () => {
    queueData = { data: [{ state: 'active', sbEnvironmentId: 1 }], rowCount: 1 };

    render(<SbSyncQueuesTable defaultFilters={[]} />);

    expect(screen.getByText(/auto-refreshing/i)).toBeInTheDocument();
  });

  it('shows no auto-refreshing indicator once settled', () => {
    queueData = { data: [{ state: 'completed', sbEnvironmentId: 1 }], rowCount: 1 };

    render(<SbSyncQueuesTable defaultFilters={[]} />);

    expect(screen.queryByText(/auto-refreshing/i)).not.toBeInTheDocument();
  });

  it('shows a retry message when the poll errors', () => {
    queueData = { data: [{ state: 'completed', sbEnvironmentId: 1 }], rowCount: 1 };
    mockUseQuery.mockImplementation((options: { queryKey: unknown[] }) =>
      options.queryKey.includes('faceted-values')
        ? { data: undefined, isFetching: false, isError: false }
        : { data: queueData, isFetching: false, isError: true }
    );

    render(<SbSyncQueuesTable defaultFilters={[]} />);

    expect(screen.getByText(/couldn't refresh/i)).toBeInTheDocument();
  });
});
