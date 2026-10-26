import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

const toId = (value: string | null) => {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Tenant, ODS and scenario choice, kept in the query string so a refresh keeps it (AC-673). */
export const useCertificationSelection = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const edfiTenantId = toId(searchParams.get('edfiTenantId'));
  const odsId = toId(searchParams.get('odsId'));
  const scenarioId = toId(searchParams.get('scenarioId'));

  const setSelection = useCallback(
    (next: { edfiTenantId?: number; odsId?: number; scenarioId?: number }) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          (['edfiTenantId', 'odsId', 'scenarioId'] as const).forEach((name) => {
            if (!(name in next)) return;
            const value = next[name];
            if (value === undefined) params.delete(name);
            else params.set(name, String(value));
          });
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const toSearch = useCallback(
    (extra: { scenarioId?: number } = {}) => {
      const params = new URLSearchParams();
      if (edfiTenantId !== undefined) params.set('edfiTenantId', String(edfiTenantId));
      if (odsId !== undefined) params.set('odsId', String(odsId));
      const scenario = extra.scenarioId ?? scenarioId;
      if (scenario !== undefined) params.set('scenarioId', String(scenario));
      return `?${params.toString()}`;
    },
    [edfiTenantId, odsId, scenarioId],
  );

  return { edfiTenantId, odsId, scenarioId, setSelection, toSearch };
};
