import 'reflect-metadata';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { EnvironmentsNav } from './EnvironmentsNav';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

// jsdom has no layout, so render every row instead of a measured window of them
jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 35,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, size: 35, start: index * 35 })),
  }),
}));

jest.mock('react-router', () => ({
  useNavigate: jest.fn(() => jest.fn()),
  Link: ({ children, to, ...props }: { children?: React.ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('../api', () => ({
  teamQueries: { navSearchList: jest.fn(() => ({ queryKey: ['nav-search-key'] })) },
}));

jest.mock('../helpers', () => ({
  getOdsTerminology: jest.requireActual('../helpers/useOdsTerminology').getOdsTerminology,
  useAuthorize: jest.fn(() => true),
  useTeamNavContext: jest.fn(() => ({ teamId: 1 })),
}));

jest.mock('@edanalytics/common-ui', () => ({
  Icons: new Proxy(
    {},
    {
      get: () => () => null,
    },
  ),
  // Types a search term on mount so the results table is populated.
  SearchWithResults: ({
    items,
    onChange,
  }: {
    items: React.ReactNode;
    onChange: (value: string) => void;
  }) => {
    jest.requireActual('react').useEffect(() => onChange('tenant'), [onChange]);
    return <div>{items}</div>;
  },
  TableRowActions: ({
    actions,
  }: {
    actions: Record<string, { to: string; title: string; text: string }>;
  }) => (
    <>
      {Object.entries(actions).map(([key, action]) => (
        <a key={key} href={action.to} title={action.title}>
          {action.text}
        </a>
      ))}
    </>
  ),
}));

const mockUseQuery = useQuery as jest.Mock;

const tenantRow = (
  sbEnvironmentId: number,
  edfiTenantId: number,
  edfiTenantName: string,
  version: string | undefined,
) => ({
  sbEnvironmentId,
  sbEnvironmentName: `env${sbEnvironmentId}`,
  edfiTenantId,
  edfiTenantName,
  version,
  odss: true,
  edorgs: true,
  vendors: false,
  claimsets: false,
  applications: false,
  profiles: false,
});

const getRow = (tenantName: string) => screen.getByText(tenantName).closest('tr') as HTMLElement;

describe('EnvironmentsNav — Tenant resources ODS/Data Store label', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: {
        '10-100': tenantRow(10, 100, 'tenantv3', 'v3'),
        '20-200': tenantRow(20, 200, 'tenantv2', 'v2'),
        '30-300': tenantRow(30, 300, 'tenantv1', 'v1'),
        '40-400': tenantRow(40, 400, 'tenantunknown', undefined),
      },
    });
  });

  it('shows "Data Stores" on a v3 tenant row', () => {
    render(<EnvironmentsNav />);

    const row = within(getRow('tenantv3'));
    expect(row.getByText('Data Stores')).toHaveAttribute('title', 'Go to Data Stores');
    expect(row.queryByText('ODSs')).not.toBeInTheDocument();
  });

  it.each(['tenantv2', 'tenantv1', 'tenantunknown'])('shows "ODSs" on the %s row', (tenant) => {
    render(<EnvironmentsNav />);

    const row = within(getRow(tenant));
    expect(row.getByText('ODSs')).toHaveAttribute('title', 'Go to ODSs');
    expect(row.queryByText('Data Stores')).not.toBeInTheDocument();
  });

  it('keeps the odss route regardless of version', () => {
    render(<EnvironmentsNav />);

    expect(within(getRow('tenantv3')).getByText('Data Stores')).toHaveAttribute(
      'href',
      '/as/1/sb-environments/10/edfi-tenants/100/odss',
    );
    expect(within(getRow('tenantv2')).getByText('ODSs')).toHaveAttribute(
      'href',
      '/as/1/sb-environments/20/edfi-tenants/200/odss',
    );
  });

  it('leaves the other resource labels unchanged', () => {
    render(<EnvironmentsNav />);

    expect(within(getRow('tenantv3')).getByText('Ed-Orgs')).toBeInTheDocument();
    expect(within(getRow('tenantv2')).getByText('Ed-Orgs')).toBeInTheDocument();
  });
});
