import 'reflect-metadata';
import { useQuery } from '@tanstack/react-query';
import { ViewSbSyncQueue } from './ViewSbSyncQueue';
import { syncQueueRefetchInterval } from './syncQueueStates';

jest.mock('./syncQueueStates', () => ({
  jobStateColorSchemes: {},
  syncQueueRefetchInterval: jest.fn(),
}));
jest.mock('@chakra-ui/react', () => ({ Badge: () => null, chakra: { pre: () => null } }));
jest.mock('@edanalytics/common-ui', () => ({
  Attribute: () => null,
  AttributeContainer: () => null,
  AttributesGrid: () => null,
  ContentSection: () => null,
}));
jest.mock('@edanalytics/utils', () => ({ stdDuration: jest.fn() }));
jest.mock('react-router', () => ({ useParams: jest.fn(() => ({ sbSyncQueueId: 'q1' })) }));
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('../../routes', () => ({
  EdfiTenantGlobalLink: () => null,
  SbEnvironmentGlobalLink: () => null,
}));
jest.mock('../../api', () => ({
  edfiTenantQueriesGlobal: { getOne: jest.fn(() => ({})) },
  sbEnvironmentQueriesGlobal: { getOne: jest.fn(() => ({})) },
  sbSyncQueueQueries: { getOne: jest.fn(() => ({ queryKey: ['q'] })) },
}));

const mockUseQuery = useQuery as jest.Mock;

describe('ViewSbSyncQueue', () => {
  it('polls while pending', () => {
    mockUseQuery.mockReturnValue({ data: undefined });
    ViewSbSyncQueue();

    const options = mockUseQuery.mock.calls[0][0];
    expect(options.refetchInterval).toBe(syncQueueRefetchInterval);
  });
});
