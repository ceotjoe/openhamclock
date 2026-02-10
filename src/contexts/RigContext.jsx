import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getModeFromFreq, mapModeToRig } from '../utils/bandPlan.js';


// Default config
// Default config (fallback)
const DEFAULT_RIG_URL = 'http://localhost:5555';
const POLL_INTERVAL = 1000;


const RigContext = createContext(null);

export const useRig = () => {
    const context = useContext(RigContext);
    if (!context) {
        throw new Error('useRig must be used within a RigProvider');
    }
    return context;
};

export const RigProvider = ({ children, rigConfig }) => {
    const [rigState, setRigState] = useState({
        connected: false,
        freq: 0,
        mode: '',
        ptt: false,
        width: 0,
        lastUpdate: 0
    });

    const [error, setError] = useState(null);

    // Construct URL from config or default
    const rigUrl = rigConfig && rigConfig.host && rigConfig.port
        ? `${rigConfig.host}:${rigConfig.port}`
        : DEFAULT_RIG_URL;

    // Poll Daemon
    const pollRig = useCallback(async () => {
        if (rigConfig && !rigConfig.enabled) {
            setRigState(prev => ({ ...prev, connected: false }));
            return;
        }

        try {
            const resp = await fetch(`${rigUrl}/status`);
            if (!resp.ok) throw new Error('Daemon unreachable');

            const data = await resp.json();
            setRigState(prev => ({
                ...prev,
                connected: data.connected,
                freq: data.freq,
                mode: data.mode,
                ptt: data.ptt,
                width: data.width,
                lastUpdate: Date.now()
            }));
            setError(null);
        } catch (err) {
            setError(err.message);
            setRigState(prev => ({ ...prev, connected: false }));
        }
    }, []);

    // Set Interval
    useEffect(() => {
        const timer = setInterval(pollRig, POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [pollRig]);

    // Command: Set Frequency
    const setFreq = useCallback(async (freq) => {
        if (!rigConfig?.enabled) return;
        try {
            await fetch(`${rigUrl}/freq`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ freq, tune: rigConfig.tuneEnabled })
            });
            // Poll immediately to update UI
            pollRig();
        } catch (err) {
            console.error('Failed to set freq:', err);
        }
    }, [pollRig, rigUrl, rigConfig]);

    // Command: Set Mode
    const setMode = useCallback(async (mode) => {
        if (!rigConfig?.enabled) return;
        try {
            await fetch(`${rigUrl}/mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            pollRig();
        } catch (err) {
            console.error('Failed to set mode:', err);
        }
    }, [pollRig, rigUrl, rigConfig]);

    // Command: PTT
    const setPTT = useCallback(async (enabled) => {
        if (!rigConfig?.enabled) return;
        // Optimistic update for immediate UI response
        setRigState(prev => ({ ...prev, ptt: enabled }));

        try {
            await fetch(`${rigUrl}/ptt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ptt: enabled })
            });
            pollRig();
        } catch (err) {
            console.error('Failed to set PTT:', err);
            // Revert on error (or just let next poll fix it)
            pollRig();
        }
    }, [pollRig]);

    // Helper: Tune To Frequency (Centralized Logic)
    const tuneTo = useCallback((freqInput, modeInput = null) => {
        // Removed strict connected check to match direct setFreq behavior
        // if (!rigState.connected) {
        //    console.warn('Cannot tune: Rig not connected');
        //    return;
        // }

        if (!freqInput) return;

        let hz = 0;
        // Handle number
        if (typeof freqInput === 'number') {
            // If small number (< 1000), assume MHz -> Hz
            // If medium number (< 100000), assume kHz -> Hz
            // If large number (> 100000), assume Hz
            if (freqInput < 1000) hz = freqInput * 1000000;
            else if (freqInput < 100000) hz = freqInput * 1000;
            else hz = freqInput;
        }
        // Handle string
        else if (typeof freqInput === 'string') {
            // Remove non-numeric chars except dot
            const clean = freqInput.replace(/[^\d.]/g, '');
            const val = parseFloat(clean);
            if (isNaN(val)) return;

            // Heuristic: If string contains "MHz", treat as MHz
            if (freqInput.toLowerCase().includes('mhz')) {
                hz = val * 1000000;
            }
            // If string contains "kHz", treat as kHz
            else if (freqInput.toLowerCase().includes('khz')) {
                hz = val * 1000;
            }
            // Otherwise use magnitude heuristic
            else {
                if (val < 1000) hz = val * 1000000;
                else if (val < 100000) hz = val * 1000;
                else hz = val;
            }
        }

        if (hz > 0) {
            // console.log(`[RigContext] Tuning to ${hz} Hz`);
            setFreq(hz);

            // Determine mode: Use input if valid, otherwise auto-calculate
            let targetMode = modeInput || getModeFromFreq(hz);

            // Map generic modes (FT8, CW) to rig-specific modes (DATA-USB, CW-LSB)
            targetMode = mapModeToRig(targetMode, hz);

            if (targetMode && targetMode !== rigState.mode) {
                // console.log(`[RigContext] Setting Mode to ${targetMode}`);
                setMode(targetMode);
            }
        }
    }, [rigState.mode, setFreq, setMode]);


    const value = {
        ...rigState,
        enabled: rigConfig?.enabled,
        tuneEnabled: rigConfig?.tuneEnabled,
        error,
        setFreq,
        setMode,
        setPTT,
        tuneTo
    };


    return (
        <RigContext.Provider value={value}>
            {children}
        </RigContext.Provider>
    );
};
