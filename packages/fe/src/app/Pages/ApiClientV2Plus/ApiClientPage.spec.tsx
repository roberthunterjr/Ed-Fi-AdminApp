import 'reflect-metadata';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ApiClientPageContent } from './ApiClientPage';
import { useQuery } from '@tanstack/react-query';
import { CredentialsRequiredLegend } from './CredentialsRequiredLegend';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ apiClientId: '4', applicationId: '7' })),
}));

jest.mock('../../helpers', () => ({
  useTeamEdfiTenantNavContextLoaded: jest.fn(() => ({ teamId: 1, edfiTenant: { id: 3 } })),
}));

jest.mock('../../helpers/useSearch', () => ({
  useSearchParamsObject: jest.fn(() => ({ edit: false })),
}));

jest.mock('./apiClientConfig', () => ({
  useApiClientConfig: jest.fn(() => ({
    queries: { getOne: jest.fn(() => ({ queryKey: ['api-client'] })) },
  })),
}));

jest.mock('./ViewApiClient', () => ({
  ViewApiClient: () => <div>view-api-client</div>,
}));

jest.mock('./EditApiClient', () => ({
  EditApiClient: () => <div>edit-api-client</div>,
}));

// CredentialsRequiredLegend now owns both the "exactly one credential"
// condition and the mandated copy itself (see CredentialsRequiredLegend.spec.tsx
// for the exhaustive display-case coverage and the byte-exact string
// assertion). This page's only responsibility is wiring the Application id
// through, so the legend is stubbed out here rather than exercised for real.
jest.mock('./CredentialsRequiredLegend', () => ({
  CredentialsRequiredLegend: jest.fn(() => null),
}));

const mockUseQuery = useQuery as jest.Mock;
const mockCredentialsRequiredLegend = CredentialsRequiredLegend as jest.Mock;

describe('ApiClientPageContent — last-credential legend', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: { id: 4, name: 'Cred A' } });
  });

  afterEach(() => jest.clearAllMocks());

  // The credential detail page needs the same explanatory legend as the
  // credentials list page (ApiClientsPage.spec.tsx) so a user who lands
  // directly on a lone credential's page also sees why Delete is disabled,
  // via the shared, standing warning (the disabled Delete action's `title`
  // tooltip is the separate, point-of-action explanation).
  it('renders CredentialsRequiredLegend with the Application id from the route', () => {
    render(<ApiClientPageContent />);

    expect(mockCredentialsRequiredLegend.mock.calls[0][0]).toEqual({ applicationId: 7 });
  });

  it('still renders the credential view content alongside the legend', () => {
    render(<ApiClientPageContent />);

    expect(screen.getByText('view-api-client')).toBeInTheDocument();
  });
});
