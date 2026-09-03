import 'reflect-metadata';
import { AllApiClientsTable } from './ApiClientsPage';
import { useQuery } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { useApiClientConfig } from './apiClientConfig';
import { useParams } from 'react-router';

jest.mock('@edanalytics/common-ui', () => ({
  PageTemplate: ({ children }: { children: React.ReactNode }) => children,
  PageActions: () => null,
  SbaaTableAllInOne: jest.fn(() => null),
}));

jest.mock('@chakra-ui/react', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('react-router', () => ({
  useParams: jest.fn(),
}));

jest.mock('../../helpers', () => ({
  useTeamEdfiTenantNavContextLoaded: jest.fn(),
}));

jest.mock('./NameCell', () => ({
  NameCell: () => null,
}));

jest.mock('./useApiClientActions', () => ({
  useMultiApiClientsActions: jest.fn(() => ({})),
}));

jest.mock('./apiClientConfig', () => ({
  useApiClientConfig: jest.fn(),
}));

const mockUseQuery = useQuery as jest.Mock;
const mockUseTeamEdfiTenantNavContextLoaded = useTeamEdfiTenantNavContextLoaded as jest.Mock;
const mockUseApiClientConfig = useApiClientConfig as jest.Mock;
const mockUseParams = useParams as jest.Mock;

describe('AllApiClientsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ applicationId: '7' });
    mockUseTeamEdfiTenantNavContextLoaded.mockReturnValue({
      edfiTenant: { id: 3 },
      asId: 1,
    });
    mockUseApiClientConfig.mockReturnValue({
      queries: { getAll: jest.fn(() => ({ queryKey: ['v3-api-clients'], queryFn: jest.fn() })) },
    });
    mockUseQuery.mockReturnValue({ data: {} });
  });

  it('has no Status column', () => {
    const columns = (AllApiClientsTable() as React.ReactElement).props.columns;
    expect(columns.map((c: { accessorKey?: string }) => c.accessorKey)).not.toContain('keyStatus');
    expect(columns.map((c: { header?: string }) => c.header)).not.toContain('Status');
  });

  it('looks up api clients via useApiClientConfig().queries, not a hardcoded v2 query', () => {
    const getAllSpy = jest.fn(() => ({ queryKey: ['v3-api-clients'], queryFn: jest.fn() }));
    mockUseApiClientConfig.mockReturnValue({ queries: { getAll: getAllSpy } });

    AllApiClientsTable();

    expect(getAllSpy).toHaveBeenCalledWith(
      { teamId: 1, edfiTenant: { id: 3 } },
      { applicationId: 7 }
    );
  });
});
