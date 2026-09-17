import 'reflect-metadata';
import React from 'react';
import { AllApiClientsTable } from './ApiClientsPage';
import { useQuery } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { useApiClientConfig } from './apiClientConfig';
import { useParams } from 'react-router';
import { CredentialsRequiredLegend } from './CredentialsRequiredLegend';

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
    const rendered = AllApiClientsTable() as React.ReactElement;
    const table = React.Children.toArray(
      (rendered.props as { children: React.ReactNode }).children,
    )[0] as React.ReactElement;
    const columns = (table.props as { columns: { accessorKey?: string; header?: string }[] })
      .columns;
    expect(columns.map((c: { accessorKey?: string }) => c.accessorKey)).not.toContain('keyStatus');
    expect(columns.map((c: { header?: string }) => c.header)).not.toContain('Status');
  });

  it('looks up api clients via useApiClientConfig().queries, not a hardcoded v2 query', () => {
    const getAllSpy = jest.fn(() => ({ queryKey: ['v3-api-clients'], queryFn: jest.fn() }));
    mockUseApiClientConfig.mockReturnValue({ queries: { getAll: getAllSpy } });

    AllApiClientsTable();

    expect(getAllSpy).toHaveBeenCalledWith(
      { teamId: 1, edfiTenant: { id: 3 } },
      { applicationId: 7 },
    );
  });
});

describe('AllApiClientsTable — last-credential legend', () => {
  // Its own priming rather than whatever the previous describe happened to
  // leave behind: that block overrides useApiClientConfig mid-run, so relying
  // on leftover state made this depend on file order and would break under
  // test randomisation.
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseParams.mockReturnValue({ applicationId: '7' });
    mockUseTeamEdfiTenantNavContextLoaded.mockReturnValue({
      edfiTenant: { sbEnvironmentId: 2 },
      teamId: 1,
      asId: 1,
    });
    mockUseApiClientConfig.mockReturnValue({
      queries: { getAll: jest.fn(() => ({ queryKey: ['apiClients'] })) },
    });
    mockUseQuery.mockReturnValue({ data: {} });
  });

  it('renders CredentialsRequiredLegend with the Application id from the route', () => {
    // CredentialsRequiredLegend now owns both the "exactly one credential"
    // condition and the mandated copy itself (see
    // CredentialsRequiredLegend.spec.tsx for the exhaustive display-case
    // coverage and the byte-exact string assertion). This page's only
    // responsibility is wiring the Application id through.
    const rendered = AllApiClientsTable() as React.ReactElement;
    const children = React.Children.toArray(
      (rendered.props as { children: React.ReactNode }).children,
    ) as React.ReactElement[];
    const legendElement = children.find((child) => child.type === CredentialsRequiredLegend);
    expect(legendElement).toBeDefined();
    expect(legendElement!.props).toEqual({ applicationId: 7 });
  });
});
