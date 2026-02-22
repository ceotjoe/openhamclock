'use strict';

import { useState, useEffect, useCallback } from 'react';

/**
 * useFullscreen
 *
 * Manages the browser Fullscreen API.
 *
 * Accepts optional side-effect callbacks that are invoked inside the
 * requestFullscreen / exitFullscreen promise resolution — i.e. within the
 * browser's user-gesture context. This allows callers (e.g. useScreenWakeLock)
 * to piggyback on the gesture without tight coupling.
 *
 * @param {object}   [options]
 * @param {Function} [options.onEnter] - Called after entering fullscreen
 * @param {Function} [options.onExit]  - Called after exiting fullscreen
 */
export default function useFullscreen({ onEnter, onExit } = {}) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleFullscreenToggle = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
          onEnter?.();
        })
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => {
          setIsFullscreen(false);
          onExit?.();
        })
        .catch(() => {});
    }
  }, [onEnter, onExit]);

  useEffect(() => {
    const handler = () => {
      const nowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(nowFullscreen);
      // Sync callbacks when fullscreen is exited externally (e.g. user presses Esc)
      if (!nowFullscreen) {
        onExit?.();
      }
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [onExit]);

  return { isFullscreen, handleFullscreenToggle };
}
