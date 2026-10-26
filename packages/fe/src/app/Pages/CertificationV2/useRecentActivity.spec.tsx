import { act, fireEvent, renderHook } from '@testing-library/react';
import { useRecentActivity } from './useRecentActivity';

describe('useRecentActivity', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('starts active, goes inactive after the window, and returns on a keydown', () => {
    const { result } = renderHook(() => useRecentActivity(1000));
    expect(result.current).toBe(true);
    act(() => jest.advanceTimersByTime(1001));
    expect(result.current).toBe(false);
    act(() => {
      fireEvent.keyDown(window, { key: 'a' });
    });
    expect(result.current).toBe(true);
  });

  it('a pointerdown extends the window', () => {
    const { result } = renderHook(() => useRecentActivity(1000));
    act(() => jest.advanceTimersByTime(800));
    act(() => {
      fireEvent.pointerDown(window);
    });
    act(() => jest.advanceTimersByTime(800));
    expect(result.current).toBe(true);
    act(() => jest.advanceTimersByTime(300));
    expect(result.current).toBe(false);
  });

  it('removes its listeners on unmount', () => {
    const remove = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useRecentActivity(1000));
    unmount();
    expect(remove).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
    remove.mockRestore();
  });
});
