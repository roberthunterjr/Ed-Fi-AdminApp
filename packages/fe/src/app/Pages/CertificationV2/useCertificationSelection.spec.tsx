import { act, renderHook } from '@testing-library/react';
import { useCertificationSelection } from './useCertificationSelection';

// react-router is ESM-only under jest, so stand in a minimal state-backed useSearchParams.
let mockInitialSearch = '';
jest.mock('react-router', () => ({
  useSearchParams: () => {
    const { useState: useStateInner } = jest.requireActual('react');
    const [params, setParams] = useStateInner(() => new URLSearchParams(mockInitialSearch));
    return [
      params,
      (next: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams)) =>
        setParams((prev: URLSearchParams) => (typeof next === 'function' ? next(prev) : next)),
    ];
  },
}));

const renderSelection = (search: string) => {
  mockInitialSearch = search;
  return renderHook(() => useCertificationSelection());
};

describe('useCertificationSelection', () => {
  it('reads positive integer IDs from the query string', () => {
    const { result } = renderSelection('edfiTenantId=10&odsId=5&scenarioId=3');
    expect(result.current).toMatchObject({ edfiTenantId: 10, odsId: 5, scenarioId: 3 });
  });

  it.each(['abc', '0', '-1', '1.5', ''])('treats "%s" as unset', (value) => {
    const { result } = renderSelection(`edfiTenantId=${value}`);
    expect(result.current.edfiTenantId).toBeUndefined();
  });

  it('setSelection updates and removes only the named keys', () => {
    const { result } = renderSelection('edfiTenantId=10&odsId=5');
    act(() => result.current.setSelection({ odsId: undefined, scenarioId: 7 }));
    expect(result.current).toMatchObject({ edfiTenantId: 10, odsId: undefined, scenarioId: 7 });
  });

  it('toSearch builds a query string, letting the caller override the scenario', () => {
    const { result } = renderSelection('edfiTenantId=10&odsId=5&scenarioId=3');
    expect(result.current.toSearch()).toBe('?edfiTenantId=10&odsId=5&scenarioId=3');
    expect(result.current.toSearch({ scenarioId: 9 })).toBe(
      '?edfiTenantId=10&odsId=5&scenarioId=9',
    );
  });
});
