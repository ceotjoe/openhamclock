'use strict';

import { useEffect, useState, useCallback } from 'react';
import NoSleep from '@zakj/no-sleep';

/**
 * useScreenWakeLock
 *
 * Prevents the display from sleeping while the app is open.
 * - Web:      uses @zakj/no-sleep, which wraps the native Screen Wake Lock API
 *             with a muted-video fallback for older browsers.
 * - Electron: uses powerSaveBlocker via the preload bridge (window.electronAPI).
 *
 * IMPORTANT — user-gesture requirement
 * ─────────────────────────────────────
 * Browsers require wake lock activation to happen inside a user-gesture handler.
 * This hook therefore does NOT activate on mount. Instead it returns two callbacks:
 *
 *   onFullscreenEnter  – call this inside the fullscreen button's onClick chain
 *   onFullscreenExit   – call this when fullscreen is exited (button or Esc key)
 *
 * Pass these to useFullscreen so the lock is acquired/released in the correct
 * gesture context. The Settings toggle only records the user's *intent*; the
 * fullscreen transition is what actually enables/disables the lock.
 *
 * Returns a `wakeLockStatus` object so the UI can show real-time state:
 *   { active: bool, reason: string | null }
 *
 * Possible reason values:
 *   null          – lock is active (web)
 *   'waiting'     – enabled in settings but waiting for fullscreen entry
 *   'disabled'    – user has preventSleep turned off
 *   'error'       – NoSleep.enable() rejected (e.g. Low Power Mode on iOS)
 *   'electron'    – running in Electron (handled by powerSaveBlocker)
 *
 * @param {object} config - app config object; reads config.preventSleep (boolean)
 * @returns {{ wakeLockStatus: { active: boolean, reason: string|null }, onFullscreenEnter: Function, onFullscreenExit: Function }}
 */

// Singleton — one NoSleep instance for the lifetime of the app.
// Creating it outside the hook avoids re-creating the internal video element
// on every render cycle.
const noSleep = new NoSleep();

export default function useScreenWakeLock(config) {
  const [wakeLockStatus, setWakeLockStatus] = useState({ active: false, reason: 'disabled' });

  // Called by useFullscreen when fullscreen is entered (inside user-gesture context)
  const onFullscreenEnter = useCallback(() => {
    if (!config.preventSleep) return;

    // Electron: activate powerSaveBlocker via IPC bridge
    if (window.electronAPI) {
      window.electronAPI.setPreventSleep(true);
      setWakeLockStatus({ active: true, reason: 'electron' });
      return;
    }

    // Web: enable NoSleep (must be in gesture context — we are, via fullscreen button)
    noSleep
      .enable()
      .then(() => {
        setWakeLockStatus({ active: true, reason: null });
        console.log('[WakeLock] NoSleep enabled.');
      })
      .catch((e) => {
        console.warn('[WakeLock] NoSleep.enable() failed:', e.message);
        setWakeLockStatus({ active: false, reason: 'error' });
      });
  }, [config.preventSleep]);

  // Called by useFullscreen when fullscreen is exited (button or Esc)
  const onFullscreenExit = useCallback(() => {
    if (noSleep.isEnabled) {
      noSleep.disable();
      console.log('[WakeLock] NoSleep disabled.');
    }
    window.electronAPI?.setPreventSleep(false);
    // Only update status if the feature is still enabled in settings;
    // show 'waiting' so the user knows it will re-activate on next fullscreen.
    setWakeLockStatus({ active: false, reason: config.preventSleep ? 'waiting' : 'disabled' });
  }, [config.preventSleep]);

  // React to the settings toggle changing while the app is running
  useEffect(() => {
    if (!config.preventSleep) {
      // User turned the feature off — release immediately regardless of fullscreen state
      if (noSleep.isEnabled) {
        noSleep.disable();
        console.log('[WakeLock] NoSleep disabled (setting turned off).');
      }
      window.electronAPI?.setPreventSleep(false);
      setWakeLockStatus({ active: false, reason: 'disabled' });
    } else if (!noSleep.isEnabled && !window.electronAPI) {
      // Feature enabled in settings but lock not yet acquired — waiting for fullscreen
      setWakeLockStatus({ active: false, reason: 'waiting' });
    }
    // If Electron and feature enabled, activate immediately (no gesture restriction)
    if (config.preventSleep && window.electronAPI) {
      window.electronAPI.setPreventSleep(true);
      setWakeLockStatus({ active: true, reason: 'electron' });
    }
  }, [config.preventSleep]);

  return { wakeLockStatus, onFullscreenEnter, onFullscreenExit };
}
