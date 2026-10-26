import { PgBossJobState } from '@edanalytics/models';

export const jobStateColorSchemes: Record<PgBossJobState, string> = {
  active: 'purple',
  cancelled: 'orange',
  completed: 'green',
  created: 'blue',
  expired: 'orange',
  failed: 'red',
  retry: 'yellow',
};

/** Job states that indicate a sync queue row is still in-flight. */
export const pendingSyncQueueStates: PgBossJobState[] = ['created', 'active', 'retry'];

/** Interval (ms) to poll the sync queue at while any row is still pending. */
export const syncQueuePollingIntervalMs = 3000;

/** `refetchInterval` for a single-job query: poll while the job is pending, stop once it is terminal. */
export const syncQueueRefetchInterval = (query: {
  state: { data: { state: PgBossJobState } | undefined };
}) =>
  query.state.data && pendingSyncQueueStates.includes(query.state.data.state)
    ? syncQueuePollingIntervalMs
    : false;
