import { RouteObject } from 'react-router';
import { CertificationLayout } from '../Pages/CertificationV2/CertificationAuthContext';
import { CertificationPageExecution } from '../Pages/CertificationV2/CertificationPageExecution';
import { RequestCertificationPage as RequestCertificationPageV2 } from '../Pages/CertificationV2/RequestCertificationPage';

/**
 * One pathless parent so the in-memory token survives moving between the two pages.
 * The children keep absolute paths because `useNavToParent` relies on the full `handle.path`.
 */
export const sbEnvironmentGlobalCertRoute: RouteObject = {
  element: <CertificationLayout />,
  children: [
    {
      path: '/sb-environments/:sbEnvironmentId/request-certification',
      element: <RequestCertificationPageV2 />,
    },
    {
      path: '/sb-environments/:sbEnvironmentId/request-certification/execution',
      element: <CertificationPageExecution />,
    },
  ],
};
