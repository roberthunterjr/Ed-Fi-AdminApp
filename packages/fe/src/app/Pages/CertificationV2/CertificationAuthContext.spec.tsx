import { act, render, screen } from '@testing-library/react';
import {
  CertificationAuth,
  CertificationAuthProvider,
  EXPIRY_WARNING_MS,
  isAuthValidFor,
  useCertificationAuth,
} from './CertificationAuthContext';

jest.mock('react-router', () => ({ Outlet: () => null }));

const auth: CertificationAuth = {
  token: 't',
  expiresAt: '2026-10-06T20:30:00.000Z',
  oauthUrl: 'https://h/oauth/token',
  resourceBaseUrl: 'https://h/data/v3',
  edfiTenantId: 10,
  odsId: 5,
};

let api: ReturnType<typeof useCertificationAuth>;
const Probe = () => {
  api = useCertificationAuth();
  return <span>{api.auth ? 'authenticated' : 'anonymous'}</span>;
};

describe('isAuthValidFor', () => {
  const now = Date.parse('2026-10-06T20:00:00.000Z');
  it('is valid for the same tenant and ODS before expiry', () => {
    expect(isAuthValidFor(auth, 10, 5, now)).toBe(true);
  });
  it('is invalid for another tenant or ODS, after expiry, or when empty', () => {
    expect(isAuthValidFor(auth, 11, 5, now)).toBe(false);
    expect(isAuthValidFor(auth, 10, 6, now)).toBe(false);
    expect(isAuthValidFor(auth, 10, 5, Date.parse('2026-10-06T20:30:00.000Z'))).toBe(false);
    expect(isAuthValidFor(null, 10, 5, now)).toBe(false);
  });
});

describe('CertificationAuthProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-10-06T20:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('holds the token in memory and clears it on demand', () => {
    render(
      <CertificationAuthProvider>
        <Probe />
      </CertificationAuthProvider>,
    );
    expect(screen.getByText('anonymous')).toBeTruthy();
    act(() => api.setAuth(auth));
    expect(screen.getByText('authenticated')).toBeTruthy();
    act(() => api.clearAuth());
    expect(screen.getByText('anonymous')).toBeTruthy();
  });

  it('clears the token when it expires', () => {
    render(
      <CertificationAuthProvider>
        <Probe />
      </CertificationAuthProvider>,
    );
    act(() => api.setAuth(auth));
    act(() => jest.advanceTimersByTime(30 * 60 * 1000));
    expect(screen.getByText('anonymous')).toBeTruthy();
  });

  it('flips expiringSoon five minutes before expiry and resets when auth clears', () => {
    render(
      <CertificationAuthProvider>
        <Probe />
      </CertificationAuthProvider>,
    );
    act(() => api.setAuth(auth));
    expect(api.expiringSoon).toBe(false);
    act(() => jest.advanceTimersByTime(30 * 60 * 1000 - EXPIRY_WARNING_MS - 1));
    expect(api.expiringSoon).toBe(false);
    act(() => jest.advanceTimersByTime(1));
    expect(api.expiringSoon).toBe(true);
    act(() => api.clearAuth());
    expect(api.expiringSoon).toBe(false);
  });

  it('is expiringSoon immediately when already inside the warning window', () => {
    render(
      <CertificationAuthProvider>
        <Probe />
      </CertificationAuthProvider>,
    );
    act(() => api.setAuth({ ...auth, expiresAt: '2026-10-06T20:03:00.000Z' }));
    expect(api.expiringSoon).toBe(true);
  });

  it('reports why the token is gone: expired by timer, user by clearAuth, null after setAuth', () => {
    render(
      <CertificationAuthProvider>
        <Probe />
      </CertificationAuthProvider>,
    );
    expect(api.clearReason).toBeNull();
    act(() => api.setAuth(auth));
    act(() => jest.advanceTimersByTime(30 * 60 * 1000));
    expect(api.clearReason).toBe('expired');
    act(() => api.setAuth(auth));
    expect(api.clearReason).toBeNull();
    act(() => api.clearAuth());
    expect(api.clearReason).toBe('user');
    act(() => api.setAuth(auth));
    expect(api.clearReason).toBeNull();
  });

  it('throws when used outside the provider', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(
      'useCertificationAuth must be used inside CertificationAuthProvider',
    );
  });
});
