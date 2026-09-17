import { UseQueryOptions, useQuery } from '@tanstack/react-query';
import { useTeamEdfiTenantNavContextLoaded } from '../../helpers';
import { ApiClientEntity, useApiClientConfig } from './apiClientConfig';

/**
 * Single definition of "this Application's credentials" for the
 * ApiClientV2Plus pages. Three components need it and previously each built
 * the query themselves: the credentials table row (NameCell), the Delete
 * guard (useApiClientActions) and the last-credential warning
 * (CredentialsRequiredLegend). A change to the query shape had to be made in
 * all three in lockstep, with nothing enforcing it.
 *
 * All callers produce the same query key, so TanStack Query serves them from
 * one cache entry rather than issuing a request per consumer.
 *
 * Callers derive their own thresholds from `count`, because the two in use
 * mean different things and must not be conflated:
 *
 * - **`count <= 1` — enforcement.** Blocks deletion. Deliberately includes 0,
 *   so an Application that somehow reaches zero credentials cannot lose more.
 *   Mirrors the BFF's own `<= 1` guard.
 * - **`count === 1` — display.** Drives user-facing copy that says "this is
 *   the only credential", which is a false statement at 0. Never widen this
 *   to `<= 1`.
 *
 * Always check `isCountKnown` first: while the query is pending or has
 * errored, `count` is 0, which is indistinguishable from a genuine zero.
 */
export const useApplicationApiClients = (
  applicationId: number,
  { throwOnError = false }: { throwOnError?: boolean } = {},
) => {
  const { teamId, edfiTenant } = useTeamEdfiTenantNavContextLoaded();
  const { queries } = useApiClientConfig();

  // TypeScript cannot resolve union-typed overloaded functions; cast to the
  // actual return type. Same workaround as ApiClientsPage.tsx.
  //
  // `throwOnError` defaults to false because the query builder defaults it to
  // true, and two of the three consumers render inside trees with no
  // ErrorBoundary of their own — a failed credential count would otherwise
  // throw during render and blank the page. They fail closed instead. NameCell
  // opts back in to preserve its pre-existing behaviour.
  const query = useQuery({
    ...(queries.getAll(
      {
        teamId,
        edfiTenant,
      },
      {
        applicationId,
      },
    ) as UseQueryOptions<Record<string | number, ApiClientEntity>>),
    throwOnError,
  });

  return {
    query,
    count: Object.keys(query.data ?? {}).length,
    isCountKnown: query.isSuccess,
  };
};
