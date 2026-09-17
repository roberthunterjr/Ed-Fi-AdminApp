import 'reflect-metadata';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { useApiClientConfig } from './apiClientConfig';
import { CredentialsRequiredLegend } from './CredentialsRequiredLegend';

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../../helpers', () => ({
  useTeamEdfiTenantNavContextLoaded: jest.fn(() => ({ teamId: 1, edfiTenant: { id: 3 } })),
}));

jest.mock('./apiClientConfig', () => ({
  useApiClientConfig: jest.fn(() => ({
    queries: { getAll: jest.fn(() => ({ queryKey: ['v3-api-clients'], queryFn: jest.fn() })) },
  })),
}));

// The rest of this folder mocks Chakra away entirely (see
// ApiClientsPage.spec.tsx/ViewApiClient.spec.tsx); do the same here, with
// stand-ins minimal enough to assert the `status="warning"` wiring and the
// exact copy without pulling in real Chakra/theme machinery.
jest.mock('@chakra-ui/react', () => ({
  Alert: ({ status, children }: { status: string; children: React.ReactNode }) => (
    <div role="alert" data-status={status}>
      {children}
    </div>
  ),
  AlertIcon: () => <svg data-testid="alert-icon" />,
  Text: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

const mockUseQuery = useQuery as jest.Mock;
const mockUseApiClientConfig = useApiClientConfig as jest.Mock;
const mockUseTeamEdfiTenantNavContextLoaded = useTeamEdfiTenantNavContextLoaded as jest.Mock;

// Mandated verbatim (see docs/design/ac-616-application-disappears.md and
// followup-1-brief.md) — a test that only checks for *some* text would let a
// reworded legend through, so this is asserted byte-exact.
const MANDATED_LEGEND_TEXT =
  'An Application needs at least one credential to work. To replace a credential, create the new one first, then delete the old one.';

describe('CredentialsRequiredLegend', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTeamEdfiTenantNavContextLoaded.mockReturnValue({ teamId: 1, edfiTenant: { id: 3 } });
    mockUseApiClientConfig.mockReturnValue({
      queries: { getAll: jest.fn(() => ({ queryKey: ['v3-api-clients'], queryFn: jest.fn() })) },
    });
  });

  it('renders the warning, with the exact mandated string, at exactly one credential', () => {
    mockUseQuery.mockReturnValue({
      data: { 1: {} },
      isPending: false,
      isError: false,
      isSuccess: true,
    });

    render(<CredentialsRequiredLegend applicationId={7} />);

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-status')).toBe('warning');
    expect(screen.getByText(MANDATED_LEGEND_TEXT)).toBeInTheDocument();
  });

  it('renders nothing at two or more credentials', () => {
    mockUseQuery.mockReturnValue({
      data: { 1: {}, 2: {} },
      isPending: false,
      isError: false,
      isSuccess: true,
    });

    const { container } = render(<CredentialsRequiredLegend applicationId={7} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing at zero credentials', () => {
    mockUseQuery.mockReturnValue({ data: {}, isPending: false, isError: false, isSuccess: true });

    const { container } = render(<CredentialsRequiredLegend applicationId={7} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the credential count is pending', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true, isError: false });

    const { container } = render(<CredentialsRequiredLegend applicationId={7} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the credential count query has errored', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });

    const { container } = render(<CredentialsRequiredLegend applicationId={7} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('resolves the count via useApiClientConfig().queries.getAll with the same key NameCell/useApiClientActions use, and overrides throwOnError to false', () => {
    const getAllSpy = jest.fn(() => ({ queryKey: ['v3-api-clients'], queryFn: jest.fn() }));
    mockUseApiClientConfig.mockReturnValue({ queries: { getAll: getAllSpy } });
    mockUseQuery.mockReturnValue({
      data: { 1: {} },
      isPending: false,
      isError: false,
      isSuccess: true,
    });

    render(<CredentialsRequiredLegend applicationId={7} />);

    expect(getAllSpy).toHaveBeenCalledWith(
      { teamId: 1, edfiTenant: { id: 3 } },
      { applicationId: 7 },
    );
    expect(mockUseQuery.mock.calls[0][0]).toEqual(
      expect.objectContaining({ queryKey: ['v3-api-clients'], throwOnError: false }),
    );
  });
});
