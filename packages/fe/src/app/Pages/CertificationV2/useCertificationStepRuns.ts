import {
  CertificationSavedStepRunDto,
  CertificationStepRunsDto,
  CertScenarioStatus,
} from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { methods } from '../../api';
import { certificationQueryKeys } from './useCertificationCatalog';

type UseCertificationStepRunsArgs = {
  sbEnvironmentId: number;
  edfiTenantId: number | undefined;
  odsId: number | undefined;
  sisVersion: string | undefined;
  scenarioId: number | undefined;
};

/**
 * The saved result of each step of one scenario (AC-475). Reading results needs no ODS
 * token, so a returning vendor sees them before validating their credentials again.
 */
export const useCertificationStepRuns = ({
  sbEnvironmentId,
  edfiTenantId,
  odsId,
  sisVersion,
  scenarioId,
}: UseCertificationStepRunsArgs) => {
  const queryKey = certificationQueryKeys.stepRuns(
    sbEnvironmentId,
    edfiTenantId,
    odsId,
    scenarioId,
  );
  const enabled =
    edfiTenantId !== undefined && sisVersion !== undefined && scenarioId !== undefined;
  const stepRunsQuery = useQuery({
    queryKey,
    queryFn: () =>
      methods.getOne(
        `sb-environments/${sbEnvironmentId}/edfi-tenants/${edfiTenantId}/certification/sis/${sisVersion}/step-runs`,
        CertificationStepRunsDto,
        { params: odsId === undefined ? { scenarioId } : { scenarioId, odsId } },
      ),
    enabled,
    // Only a failed first load goes to the error page; a failed refetch (e.g. after a dropped
    // connection) keeps the page, the vendor's typed inputs and the results already shown.
    throwOnError: (_error, query) => query.state.data === undefined,
  });
  const { data, refetch } = stepRunsQuery;
  const runsByStepId = useMemo(
    () =>
      Object.fromEntries((data?.steps ?? []).map((step) => [step.stepId, step])) as Record<
        number,
        CertificationSavedStepRunDto
      >,
    [data],
  );
  const scenarioStatus: CertScenarioStatus | null = data?.scenarioStatus ?? null;

  // A disabled query reports isPending forever, so only count it when it can run.
  return {
    runsByStepId,
    scenarioStatus,
    isPending: enabled && stepRunsQuery.isPending,
    refetch: () => void refetch(),
    queryKey,
  };
};
