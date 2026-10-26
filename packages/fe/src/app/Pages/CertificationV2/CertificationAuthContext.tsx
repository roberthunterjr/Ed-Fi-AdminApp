import { CertificationTokenDto } from '@edanalytics/models';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Outlet } from 'react-router';

/** The ODS/API token for the current certification flow. Lives in this tab's memory only (AC-673). */
export type CertificationAuth = CertificationTokenDto & { edfiTenantId: number; odsId?: number };

export type ClearReason = 'expired' | 'user' | null;

type CertificationAuthContextValue = {
  auth: CertificationAuth | null;
  setAuth: (auth: CertificationAuth) => void;
  clearAuth: () => void;
  /** True from five minutes before the token expires until it is replaced or cleared. */
  expiringSoon: boolean;
  /** Why the token is gone: it ran out, or the user cleared it. Null before any token or after setAuth. */
  clearReason: ClearReason;
};

export const EXPIRY_WARNING_MS = 5 * 60 * 1000;

const CertificationAuthContext = createContext<CertificationAuthContextValue | null>(null);

export const isAuthValidFor = (
  auth: CertificationAuth | null,
  edfiTenantId: number | undefined,
  odsId: number | undefined,
  now: number = Date.now(),
): auth is CertificationAuth =>
  !!auth &&
  auth.edfiTenantId === edfiTenantId &&
  auth.odsId === odsId &&
  Date.parse(auth.expiresAt) > now;

export const CertificationAuthProvider = ({ children }: { children: ReactNode }) => {
  const [auth, setAuthState] = useState<CertificationAuth | null>(null);
  const [expiringSoon, setExpiringSoon] = useState(false);
  const [clearReason, setClearReason] = useState<ClearReason>(null);
  const clearAuth = useCallback(() => {
    setClearReason('user');
    setAuthState(null);
  }, []);
  const setAuth = useCallback((next: CertificationAuth) => {
    setClearReason(null);
    setAuthState(next);
  }, []);

  useEffect(() => {
    if (!auth) return undefined;
    const timer = setTimeout(
      () => {
        setClearReason('expired');
        setAuthState(null);
      },
      Math.max(Date.parse(auth.expiresAt) - Date.now(), 0),
    );
    return () => clearTimeout(timer);
  }, [auth]);

  useEffect(() => {
    setExpiringSoon(false);
    if (!auth) return undefined;
    const delay = Date.parse(auth.expiresAt) - EXPIRY_WARNING_MS - Date.now();
    if (delay <= 0) {
      setExpiringSoon(true);
      return undefined;
    }
    const timer = setTimeout(() => setExpiringSoon(true), delay);
    return () => clearTimeout(timer);
  }, [auth]);

  const value = useMemo(
    () => ({ auth, setAuth, clearAuth, expiringSoon, clearReason }),
    [auth, setAuth, clearAuth, expiringSoon, clearReason],
  );
  return (
    <CertificationAuthContext.Provider value={value}>{children}</CertificationAuthContext.Provider>
  );
};

/** Layout route for the certification pages: leaving the flow unmounts it and drops the token. */
export const CertificationLayout = () => (
  <CertificationAuthProvider>
    <Outlet />
  </CertificationAuthProvider>
);

export const useCertificationAuth = () => {
  const value = useContext(CertificationAuthContext);
  if (!value) throw new Error('useCertificationAuth must be used inside CertificationAuthProvider');
  return value;
};
