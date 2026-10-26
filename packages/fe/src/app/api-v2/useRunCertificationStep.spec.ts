import { useMutation } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { useRunCertificationStep } from './useRunCertificationStep';

jest.mock('./apiClient', () => ({ apiClient: { post: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({ useMutation: jest.fn() }));

describe('useRunCertificationStep', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not keep the token in the mutation cache', () => {
    useRunCertificationStep({ onSuccess: jest.fn(), onError: jest.fn() });
    expect((useMutation as jest.Mock).mock.calls[0][0]).toMatchObject({ gcTime: 0 });
  });

  it('posts the body to the step run route and returns the result', async () => {
    const result = {
      stepId: 189,
      status: 'success',
      ranAt: 'x',
      scenarioStatus: 'inprogress',
      errors: [],
    };
    (apiClient.post as jest.Mock).mockResolvedValue(result);
    useRunCertificationStep({ onSuccess: jest.fn(), onError: jest.fn() });
    const { mutationFn } = (useMutation as jest.Mock).mock.calls[0][0];
    const body = { odsId: 5, token: 't', inputs: { schoolId: '255901' } };

    await expect(
      mutationFn({ sbEnvironmentId: 1, edfiTenantId: 10, sisVersion: 'v5', stepId: 189, body }),
    ).resolves.toEqual(result);
    expect(apiClient.post).toHaveBeenCalledWith(
      'sb-environments/1/edfi-tenants/10/certification/sis/v5/steps/189/run',
      body,
    );
  });
});
