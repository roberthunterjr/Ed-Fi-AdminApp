import { useEffect, useRef, useState } from 'react';

export const RECENT_ACTIVITY_WINDOW_MS = 2 * 60 * 1000;

/** True while the user has pressed a key or clicked within the last `windowMs`. */
export const useRecentActivity = (windowMs: number = RECENT_ACTIVITY_WINDOW_MS): boolean => {
  const [active, setActive] = useState(true);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => {
          if (Date.now() - lastActivity.current >= windowMs) {
            setActive(false);
          } else {
            schedule();
          }
        },
        windowMs - (Date.now() - lastActivity.current),
      );
    };
    const onActivity = () => {
      lastActivity.current = Date.now();
      setActive(true);
      schedule();
    };

    lastActivity.current = Date.now();
    schedule();
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [windowMs]);

  return active;
};
