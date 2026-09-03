import 'reflect-metadata';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ViewApiClient } from './ViewApiClient';
import { useOdsTerminology } from '../../helpers';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(() => ({ data: {} })) }));

jest.mock('../../helpers', () => ({
  useTeamEdfiTenantNavContextLoaded: jest.fn(() => ({ edfiTenant: {}, teamId: 1 })),
  useOdsTerminology: jest.fn(() => ({
    singular: 'ODS',
    plural: "ODS's",
    listTitle: 'Operational Data Stores',
    createTitle: 'Create new ODS',
  })),
}));

jest.mock('../../api', () => ({
  odsQueries: { getAll: jest.fn() },
}));

jest.mock('../../routes', () => ({
  OdsLink: ({ id }: { id: number }) => <span>ods-{id}</span>,
}));

// './apiClientConfig' transitively pulls in the real '../../api/queries/queries.v7'
// chain, which Jest can't parse without extra config (see apiClientConfig.spec.ts
// for the full explanation). Mock the module wholesale, but re-export the real
// `getDataStoreIds` from './apiClientEntity' — which has zero dependency on that
// chain — so this spec still exercises the real extraction logic, per the
// apiClientEntity.ts/apiClientConfig.ts split.
jest.mock('./apiClientConfig', () => ({
  getDataStoreIds: jest.requireActual('./apiClientEntity').getDataStoreIds,
}));

jest.mock('@edanalytics/common-ui', () => ({
  Attribute: ({ value }: { value: unknown }) => <span>{String(value)}</span>,
  AttributeContainer: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <span>{label}</span>
      {children}
    </div>
  ),
  AttributesGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ContentSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@chakra-ui/react', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUseOdsTerminology = useOdsTerminology as jest.Mock;

const v2ApiClient = {
  id: 1,
  name: 'Client1',
  key: 'key-1',
  isApproved: true,
  keyStatus: 'Active',
  odsInstanceIds: [7],
};

describe('ViewApiClient', () => {
  beforeEach(() => {
    // jest.clearAllMocks() (below) clears call history but not a mock's
    // configured return value, so restore the v2 default before each test —
    // otherwise a mockReturnValue set by one test (e.g. the v3 terminology
    // test) leaks into the next.
    mockUseOdsTerminology.mockReturnValue({
      singular: 'ODS',
      plural: "ODS's",
      listTitle: 'Operational Data Stores',
      createTitle: 'Create new ODS',
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('does not render a Status label', () => {
    render(<ViewApiClient apiClient={v2ApiClient as never} />);

    expect(screen.queryByText('Status')).not.toBeInTheDocument();
  });

  it('labels the ODS attribute "Data Store" for a v3 terminology stub', () => {
    mockUseOdsTerminology.mockReturnValue({
      singular: 'Data Store',
      plural: 'Data Stores',
      listTitle: 'Data Stores',
      createTitle: 'Create new Data Store',
    });

    render(
      <ViewApiClient
        apiClient={{ id: 2, name: 'Client2', key: 'key-2', isApproved: true, keyStatus: 'Active', dataStoreIds: [4] } as never}
      />
    );

    expect(screen.getByText('Data Store')).toBeInTheDocument();
  });

  it('labels the ODS attribute "ODS" for a v2 terminology stub', () => {
    render(<ViewApiClient apiClient={v2ApiClient as never} />);

    expect(screen.getByText('ODS')).toBeInTheDocument();
  });

  it('renders one OdsLink for a V3 entity via getDataStoreIds, not a direct odsInstanceIds read', () => {
    const v3ApiClient = {
      id: 2,
      name: 'Client2',
      key: 'key-2',
      isApproved: true,
      keyStatus: 'Active',
      dataStoreIds: [4],
    };

    render(<ViewApiClient apiClient={v3ApiClient as never} />);

    expect(screen.getByText('ods-4')).toBeInTheDocument();
  });
});
