import { useMutation } from '@tanstack/react-query';
import {
  certificationTokenErrorMessage,
  useRequestCertificationToken,
} from './useRequestCertificationToken';

jest.mock('./apiClient', () => ({ apiClient: { post: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({ useMutation: jest.fn() }));

describe('useRequestCertificationToken', () => {
  it('does not keep the submitted credentials in the mutation cache', () => {
    useRequestCertificationToken();
    expect((useMutation as jest.Mock).mock.calls[0][0]).toMatchObject({ gcTime: 0 });
  });
});

describe('certificationTokenErrorMessage', () => {
  it('returns the server message', () => {
    expect(
      certificationTokenErrorMessage({
        data: { errors: { 'root.serverError': { message: 'X' } } },
      }),
    ).toBe('X');
  });

  it.each([
    ['empty errors', { data: { errors: {} } }],
    ['undefined', undefined],
    ['a string', 'boom'],
  ])('falls back for %s', (_label, error) => {
    expect(certificationTokenErrorMessage(error)).toBe('Authentication failed. Try again.');
  });
});
