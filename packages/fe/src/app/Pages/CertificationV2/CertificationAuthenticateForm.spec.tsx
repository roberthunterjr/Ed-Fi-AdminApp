import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CertificationAuthenticateForm } from './CertificationAuthenticateForm';
import { CertificationAuthProvider, useCertificationAuth } from './CertificationAuthContext';
import { useRequestCertificationToken } from '../../api-v2/useRequestCertificationToken';

jest.mock('react-router', () => ({ Outlet: () => null }));
jest.mock('../../api-v2/apiClient', () => ({ apiClient: { post: jest.fn() } }));
jest.mock('../../api-v2/useRequestCertificationToken', () => ({
  ...jest.requireActual('../../api-v2/useRequestCertificationToken'),
  useRequestCertificationToken: jest.fn(),
}));

const mutateAsync = jest.fn();
const mockReset = jest.fn();
const mockedHook = useRequestCertificationToken as jest.Mock;

const renderForm = (props: Partial<Parameters<typeof CertificationAuthenticateForm>[0]> = {}) =>
  render(
    <CertificationAuthProvider>
      <CertificationAuthenticateForm sbEnvironmentId={1} edfiTenantId={10} odsId={5} {...props} />
    </CertificationAuthProvider>,
  );

const HINT_START = /Credentials are checked with the Ed-Fi API and are never saved/;
const tokenFor = (expiresInMs: number) => ({
  token: 't',
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  oauthUrl: 'https://h/oauth/token',
  resourceBaseUrl: 'https://h/data/v3',
});

describe('CertificationAuthenticateForm', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedHook.mockReturnValue({ mutateAsync, isPending: false, error: null, reset: mockReset });
  });

  it('enables Validate credentials when key, secret and tenant are present', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 's' } });
    expect(
      (screen.getByRole('button', { name: 'Validate credentials' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('sends a trimmed key and the secret untouched', async () => {
    mutateAsync.mockRejectedValue(new Error('rejected'));
    renderForm();
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: ' k ' } });
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: ' s ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate credentials' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0].body).toEqual({ key: 'k', secret: ' s ', odsId: 5 });
  });

  it('clears a previous error when the tenant or ODS changes', () => {
    const { rerender } = renderForm();
    mockReset.mockClear();
    rerender(
      <CertificationAuthProvider>
        <CertificationAuthenticateForm sbEnvironmentId={1} edfiTenantId={11} odsId={5} />
      </CertificationAuthProvider>,
    );
    expect(mockReset).toHaveBeenCalled();
  });

  it('enables Validate credentials only when key, secret and tenant are present', () => {
    renderForm({ edfiTenantId: undefined });
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 's' } });
    expect(
      (screen.getByRole('button', { name: 'Validate credentials' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('uses autocomplete settings that keep password managers away', () => {
    renderForm();
    expect(screen.getByLabelText('Key').getAttribute('autocomplete')).toBe('off');
    expect(screen.getByLabelText('Secret').getAttribute('autocomplete')).toBe('new-password');
  });

  it('validates, clears the inputs and shows the status', async () => {
    mutateAsync.mockResolvedValue({
      token: 't',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      oauthUrl: 'https://h/oauth/token',
      resourceBaseUrl: 'https://h/data/v3',
    });
    renderForm();
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 's' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate credentials' }));

    await waitFor(() =>
      expect(screen.getByText(/^Credentials validated · next refresh around /)).toBeTruthy(),
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      sbEnvironmentId: 1,
      edfiTenantId: 10,
      body: { key: 'k', secret: 's', odsId: 5 },
    });
    expect(screen.queryByLabelText('Secret')).toBeNull();
  });

  it('shows the hint in both states', async () => {
    mutateAsync.mockResolvedValue(tokenFor(30 * 60 * 1000));
    renderForm();
    expect(screen.getByText(HINT_START)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
    fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 's' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validate credentials' }));
    await waitFor(() =>
      expect(screen.getByText(/^Credentials validated · next refresh around /)).toBeTruthy(),
    );
    expect(screen.getByText(HINT_START)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Validate credentials' })).toBeNull();
  });

  describe('Refresh validity', () => {
    let api: ReturnType<typeof useCertificationAuth>;
    const Probe = () => {
      api = useCertificationAuth();
      return null;
    };
    const STATUS = /^Credentials validated · next refresh around /;
    const renderValid = () => {
      render(
        <CertificationAuthProvider>
          <Probe />
          <CertificationAuthenticateForm sbEnvironmentId={1} edfiTenantId={10} odsId={5} />
        </CertificationAuthProvider>,
      );
      act(() =>
        api.setAuth({ ...tokenFor(30 * 60 * 1000), token: 'old', edfiTenantId: 10, odsId: 5 }),
      );
    };
    const openRefresh = () =>
      fireEvent.click(screen.getByRole('button', { name: 'Refresh validity' }));
    const fillAndValidate = () => {
      fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
      fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 's' } });
      fireEvent.click(screen.getByRole('button', { name: 'Validate credentials' }));
    };

    it('shows the inputs inline, keeps the status and the current token', () => {
      renderValid();
      openRefresh();
      expect(mockReset).toHaveBeenCalled();
      expect(screen.getByLabelText('Key')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Validate credentials' })).toBeTruthy();
      expect(screen.getByText(STATUS)).toBeTruthy();
      expect(screen.getByText(HINT_START)).toBeTruthy();
      expect(api.auth?.token).toBe('old');
      expect(api.clearReason).toBeNull();
    });

    it('replaces the token and closes the inline form on success', async () => {
      mutateAsync.mockResolvedValue({ ...tokenFor(30 * 60 * 1000), token: 'new' });
      renderValid();
      openRefresh();
      fillAndValidate();
      await waitFor(() => expect(api.auth?.token).toBe('new'));
      expect(screen.queryByLabelText('Key')).toBeNull();
      expect(screen.getByText(STATUS)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Refresh validity' })).toBeTruthy();
    });

    it('closes the inline form and clears the inputs when the tenant changes', () => {
      const tree = (edfiTenantId: number) => (
        <CertificationAuthProvider>
          <Probe />
          <CertificationAuthenticateForm
            sbEnvironmentId={1}
            edfiTenantId={edfiTenantId}
            odsId={5}
          />
        </CertificationAuthProvider>
      );
      const { rerender } = render(tree(10));
      act(() =>
        api.setAuth({ ...tokenFor(30 * 60 * 1000), token: 'old', edfiTenantId: 10, odsId: 5 }),
      );
      openRefresh();
      fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'k' } });
      fireEvent.change(screen.getByLabelText('Secret'), { target: { value: 's' } });

      rerender(tree(11));
      expect((screen.getByLabelText('Key') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Secret') as HTMLInputElement).value).toBe('');

      rerender(tree(10));
      expect(screen.queryByLabelText('Key')).toBeNull();
      expect(screen.getByRole('button', { name: 'Refresh validity' })).toBeTruthy();
    });

    it('Cancel closes the inline form and keeps the token', () => {
      renderValid();
      openRefresh();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByLabelText('Key')).toBeNull();
      expect(screen.getByText(STATUS)).toBeTruthy();
      expect(api.auth?.token).toBe('old');
      expect(api.clearReason).toBeNull();
    });

    it('shows the error on failure and keeps the old token', async () => {
      mutateAsync.mockRejectedValue(new Error('rejected'));
      mockedHook.mockReturnValue({
        mutateAsync,
        isPending: false,
        error: {
          data: {
            errors: { 'root.serverError': { message: 'Key or secret not valid for this tenant.' } },
          },
        },
        reset: mockReset,
      });
      renderValid();
      openRefresh();
      fillAndValidate();
      await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
      expect(screen.getByText('Key or secret not valid for this tenant.')).toBeTruthy();
      expect(screen.getByLabelText('Key')).toBeTruthy();
      expect(screen.getByText(STATUS)).toBeTruthy();
      expect(api.auth?.token).toBe('old');
    });
  });

  describe('expiry nudge', () => {
    let api: ReturnType<typeof useCertificationAuth>;
    const Probe = () => {
      api = useCertificationAuth();
      return null;
    };
    const renderValid = (expiresInMs: number) => {
      render(
        <CertificationAuthProvider>
          <Probe />
          <CertificationAuthenticateForm sbEnvironmentId={1} edfiTenantId={10} odsId={5} />
        </CertificationAuthProvider>,
      );
      act(() => api.setAuth({ ...tokenFor(expiresInMs), edfiTenantId: 10, odsId: 5 }));
    };
    const nudge = () => screen.queryByText(/A quick refresh will be needed soon/);

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('is hidden until five minutes before expiry', () => {
      renderValid(10 * 60 * 1000);
      expect(nudge()).toBeNull();
      act(() => jest.advanceTimersByTime(5 * 60 * 1000 - 1));
      expect(nudge()).toBeNull();
      act(() => {
        fireEvent.keyDown(window, { key: 'a' });
      });
      act(() => jest.advanceTimersByTime(1));
      expect(nudge()).toBeTruthy();
    });

    it('is shown only while the user has been recently active', () => {
      renderValid(4 * 60 * 1000);
      expect(nudge()).toBeTruthy();
      act(() => jest.advanceTimersByTime(2 * 60 * 1000 + 1));
      expect(nudge()).toBeNull();
      act(() => {
        fireEvent.pointerDown(window);
      });
      expect(nudge()).toBeTruthy();
    });
  });

  it('shows the server message on failure', () => {
    mockedHook.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: {
        data: {
          errors: { 'root.serverError': { message: 'Key or secret not valid for this tenant.' } },
        },
      },
      reset: mockReset,
    });
    renderForm();
    expect(screen.getByText('Key or secret not valid for this tenant.')).toBeTruthy();
  });
});
