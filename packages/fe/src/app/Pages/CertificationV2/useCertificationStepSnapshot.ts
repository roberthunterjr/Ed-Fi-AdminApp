import { CertificationStepSnapshotDto } from '@edanalytics/models';
import { useQuery } from '@tanstack/react-query';
import { methods } from '../../api';
import { certificationQueryKeys } from './useCertificationCatalog';

export type UseCertificationStepSnapshotArgs = {
  sbEnvironmentId: number;
  edfiTenantId: number | undefined;
  odsId: number | undefined;
  sisVersion: string | undefined;
  stepId: number | undefined;
  ranAt: string | undefined;
  /** True once the vendor opens the response panel; the snapshot is never loaded before. */
  enabled: boolean;
};

/** The saved Ed-Fi API response of one step's latest run (AC-690). */
export const useCertificationStepSnapshot = ({
  sbEnvironmentId,
  edfiTenantId,
  odsId,
  sisVersion,
  stepId,
  ranAt,
  enabled: isOpen,
}: UseCertificationStepSnapshotArgs) => {
  const enabled =
    isOpen && edfiTenantId !== undefined && sisVersion !== undefined && stepId !== undefined;
  const query = useQuery({
    queryKey: certificationQueryKeys.stepSnapshot(
      sbEnvironmentId,
      edfiTenantId,
      odsId,
      stepId,
      ranAt,
    ),
    queryFn: () =>
      methods.getOne(
        `sb-environments/${sbEnvironmentId}/edfi-tenants/${edfiTenantId}/certification/sis/${sisVersion}/step-runs/${stepId}/snapshot`,
        CertificationStepSnapshotDto,
        odsId === undefined ? undefined : { params: { odsId } },
      ),
    enabled,
  });

  // A disabled query reports isPending forever, so only count it when it can run.
  return {
    snapshot: query.data as CertificationStepSnapshotDto | undefined,
    isPending: enabled && query.isPending,
    isError: query.isError,
  };
};
