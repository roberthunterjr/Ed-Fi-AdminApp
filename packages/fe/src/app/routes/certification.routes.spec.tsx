import type { RouteObject } from 'react-router';
import { sbEnvironmentGlobalCertRoute } from './certification.routes';

jest.mock('react-router', () => ({ Outlet: () => null }));
jest.mock('../Pages/CertificationV2/CertificationPageExecution', () => ({
  CertificationPageExecution: () => null,
}));
jest.mock('../Pages/CertificationV2/RequestCertificationPage', () => ({
  RequestCertificationPage: () => null,
}));

const REQUEST_PATH = '/sb-environments/:sbEnvironmentId/request-certification';

describe('sbEnvironmentGlobalCertRoute', () => {
  it('is a pathless layout whose children have absolute paths', () => {
    expect(sbEnvironmentGlobalCertRoute.path).toBeUndefined();
    expect(sbEnvironmentGlobalCertRoute.children?.map((c) => c.path)).toEqual([
      REQUEST_PATH,
      `${REQUEST_PATH}/execution`,
    ]);
  });

  it('keeps the full path in handle.path so useNavToParent can prefix-match it', () => {
    // Same transform as addPathToHandle in routes/index.tsx
    const addPathToHandle = (r: RouteObject) => {
      r.handle = { ...r.handle, path: r.path };
      r.children?.forEach(addPathToHandle);
    };
    const route: RouteObject = {
      ...sbEnvironmentGlobalCertRoute,
      children: sbEnvironmentGlobalCertRoute.children?.map((c) => ({ ...c })),
    };
    addPathToHandle(route);
    const execution = route.children?.[1];
    expect(execution?.handle.path.startsWith(REQUEST_PATH)).toBe(true);
  });
});
