import 'reflect-metadata';
import '@testing-library/jest-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OdsManageJobDto } from '@edanalytics/models';
import { methods } from '../../api/methods';
import { OdsManageJobPage } from './OdsManageJobPage';

jest.mock('@edanalytics/common-ui', () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    PageTemplate: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <div>
        <h1>{title}</h1>
        {children}
      </div>
    ),
    ContentSection: passthrough,
    AttributesGrid: passthrough,
    AttributeContainer: ({ label, children }: { label: string; children: React.ReactNode }) => (
      <div>
        {label}
        {children}
      </div>
    ),
    Attribute: ({ label, value }: { label: string; value?: unknown }) => (
      <div>
        {label}: {value === undefined || value === null ? '' : String(value)}
      </div>
    ),
  };
});

// ESM-only packages that Jest cannot load; not exercised by this page.
jest.mock('kebab-case', () => ({ __esModule: true, default: (value: string) => value }));

jest.mock('react-router', () => ({
  useParams: () => ({ asId: '1', edfiTenantId: '3', operation: 'create', jobId: 'job-1' }),
}));

jest.mock('../../helpers', () => ({
  useOdsTerminology: () => ({ singular: 'Data Store', plural: 'Data Stores' }),
}));

jest.mock('../../api/methods', () => ({
  apiClient: {},
  methods: { getOne: jest.fn() },
}));

const mockGetOne = methods.getOne as jest.Mock;

const makeJob = (state: string, output: { message: string } | null = null) =>
  Object.assign(new OdsManageJobDto(), {
    id: 'job-1',
    state,
    createdon: new Date('2026-01-01T00:00:00Z'),
    completedon: new Date('2026-01-01T00:00:05Z'),
    output,
    data: {
      sbEnvironmentId: 2,
      edfiTenantId: 3,
      adminApiJobId: 'api-1',
      operation: 'create',
      odsName: 'My New Datastore',
      odsId: null,
    },
  });

const renderPage = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <OdsManageJobPage />
    </QueryClientProvider>
  );
};

describe('OdsManageJobPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests the team-scoped job endpoint and shows the datastore name', async () => {
    mockGetOne.mockResolvedValue(makeJob('completed', { message: 'Admin API job api-1 completed.' }));
    renderPage();

    expect(await screen.findByText(/My New Datastore/)).toBeInTheDocument();
    expect(mockGetOne.mock.calls[0][0]).toBe('teams/1/edfi-tenants/3/odss/jobs/create/job-1');
  });

  it('renders output.message as the error for a failed job', async () => {
    mockGetOne.mockResolvedValue(makeJob('failed', { message: 'Database name already exists' }));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Database name already exists');
  });

  it('polls while state is active and stops once completed', async () => {
    jest.useFakeTimers();
    mockGetOne
      .mockResolvedValueOnce(makeJob('active'))
      .mockResolvedValueOnce(makeJob('active'))
      .mockResolvedValue(makeJob('completed', { message: 'Admin API job api-1 completed.' }));
    renderPage();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(mockGetOne).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(mockGetOne).toHaveBeenCalledTimes(2);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(mockGetOne).toHaveBeenCalledTimes(3);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30000);
    });
    expect(mockGetOne).toHaveBeenCalledTimes(3);
  });

  it('shows "This job is no longer available." on 404', async () => {
    mockGetOne.mockRejectedValue({ statusCode: 404, message: 'Not Found' });
    renderPage();

    expect(await screen.findByText('This job is no longer available.')).toBeInTheDocument();
  });

  it('shows a generic message, not "no longer available", for a non-404 error with no data', async () => {
    mockGetOne.mockRejectedValue({ statusCode: 500, message: 'boom' });
    renderPage();

    expect(await screen.findByText(/Couldn't load this job/)).toBeInTheDocument();
    expect(screen.queryByText('This job is no longer available.')).not.toBeInTheDocument();
  });

  it('keeps rendering the last data when a later poll errors', async () => {
    jest.useFakeTimers();
    mockGetOne
      .mockResolvedValueOnce(makeJob('active'))
      .mockRejectedValueOnce({ statusCode: 500, message: 'boom' })
      .mockResolvedValue(makeJob('active'));
    renderPage();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/My New Datastore/)).toBeInTheDocument();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(3100);
    });
    expect(mockGetOne).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/My New Datastore/)).toBeInTheDocument();
    expect(screen.queryByText('This job is no longer available.')).not.toBeInTheDocument();
  });
});
