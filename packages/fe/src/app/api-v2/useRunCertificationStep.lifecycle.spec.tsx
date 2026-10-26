import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { apiClient } from './apiClient';
import { useRunCertificationStep } from './useRunCertificationStep';

jest.mock('./apiClient', () => ({ apiClient: { post: jest.fn() } }));

const variables = {
  sbEnvironmentId: 1,
  edfiTenantId: 10,
  sisVersion: 'v5',
  stepId: 189,
  body: { token: 't', inputs: {} },
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderRun = (options: Parameters<typeof useRunCertificationStep>[0]) => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRunCertificationStep(options), { wrapper });
};

describe('useRunCertificationStep lifecycle', () => {
  it('still handles the result when the observer is reset while the run is in flight', async () => {
    const response = deferred<unknown>();
    (apiClient.post as jest.Mock).mockReturnValue(response.promise);
    const onSuccess = jest.fn();
    const { result } = renderRun({ onSuccess, onError: jest.fn() });

    act(() => result.current.mutate(variables));
    act(() => result.current.reset());
    const saved = { stepId: 189, status: 'success' };
    await act(async () => response.resolve(saved));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(saved, variables));
  });

  it('still handles a failure when the observer is reset while the run is in flight', async () => {
    const response = deferred<unknown>();
    (apiClient.post as jest.Mock).mockReturnValue(response.promise);
    const onError = jest.fn();
    const { result } = renderRun({ onSuccess: jest.fn(), onError });

    act(() => result.current.mutate(variables));
    act(() => result.current.reset());
    await act(async () => response.reject('<html>504</html>'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith('<html>504</html>', variables));
  });
});
