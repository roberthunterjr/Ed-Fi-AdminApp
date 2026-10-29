import { CertificationScenarioStatusDto, CertScenarioStatus } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { methods } from '../../api';
import { certificationQueryKeys } from './useCertificationCatalog';

type UseCertificationScenarioStatusesArgs = {
  sbEnvironmentId: number;
  edfiTenantId: number | undefined;
  odsId: number | undefined;
  sisVersion: string | undefined;
  /** True once the tenant/ODS selection is complete and valid. */
  enabled: boolean;
};

/**
 * Every scenario's saved status for the current tenant/ODS (AC-689), keyed under
 * `certificationQueryKeys.scenarioStatuses`. It refetches on every mount, so a run saved on
 * the execution page shows when the vendor comes back; that page also invalidates the key
 * after a step run.
 *
 * `isUnknown` is true until a list has loaded (query not runnable yet, loading, or failed).
 * It is not the same as an empty list: with a loaded list, a scenario that has no entry
 * really has no saved run.
 */
export const useCertificationScenarioStatuses = ({
  sbEnvironmentId,
  edfiTenantId,
  odsId,
  sisVersion,
  enabled,
}: UseCertificationScenarioStatusesArgs) => {
  const queryEnabled = enabled && edfiTenantId !== undefined && sisVersion !== undefined;
  const statusesQuery = useQuery({
    queryKey: certificationQueryKeys.scenarioStatuses(
      sbEnvironmentId,
      edfiTenantId,
      odsId,
      sisVersion,
    ),
    queryFn: () =>
      methods.getMany(
        `sb-environments/${sbEnvironmentId}/edfi-tenants/${edfiTenantId}/certification/sis/${sisVersion}/scenario-statuses`,
        CertificationScenarioStatusDto,
        { params: odsId === undefined ? {} : { odsId } },
      ),
    enabled: queryEnabled,
    refetchOnMount: 'always',
  });
  const { data } = statusesQuery;
  const statusByScenarioId = useMemo(
    () =>
      Object.fromEntries((data ?? []).map((item) => [item.scenarioId, item.status])) as Record<
        number,
        CertScenarioStatus
      >,
    [data],
  );

  return {
    statusByScenarioId,
    isUnknown: data === undefined,
    // A disabled query reports isPending forever, so only count it when it can run.
    isLoading: queryEnabled && statusesQuery.isPending,
    isError: queryEnabled && statusesQuery.isError,
    // A failed refresh that left older statuses on screen.
    isStale: statusesQuery.isError && data !== undefined,
    refetch: statusesQuery.refetch,
  };
};
