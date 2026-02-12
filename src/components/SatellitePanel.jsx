import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as satellite from "satellite.js";
import { useRig } from "../contexts/RigContext";
import useSatellites from "../hooks/useSatellites";
import {
  calculateRangeRate,
  calculateDopplerShift,
  parseFrequency,
  formatDopplerFreq,
} from "../utils/satelliteMath";

// Helper for cardinal direction
const cardinalDirection = (az) => {
  if (typeof az !== 'number') return '';
  const val = Math.floor((az / 45) + 0.5);
  const arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return arr[val % 8];
};

const SatellitePanel = ({ config }) => {
  const { t } = useTranslation();

  // Get Station Location from config prop
  const observerGd = useMemo(() => {
    const lat = config?.location?.lat || 0;
    const lon = config?.location?.lon || 0;
    return {
      latitude: satellite.degreesToRadians(lat),
      longitude: satellite.degreesToRadians(lon),
      height: 0.1, // km
    };
  }, [config]);

  const { data: satellites, loading } = useSatellites({
    lat: config?.location?.lat || 0,
    lon: config?.location?.lon || 0,
  });

  const { connected, setFreq, setMode, ptt, enabled: rigEnabled } = useRig();

  const [selectedSatNorad, setSelectedSatNorad] = useState(null);
  const [dopplerEnabled, setDopplerEnabled] = useState(false);
  const [loOffset, setLoOffset] = useState(0); // Hz
  const [now, setNow] = useState(new Date());

  // 1Hz Ticker
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Find selected satellite object
  const selectedSat = useMemo(() => {
    return satellites.find((s) => s.norad === selectedSatNorad);
  }, [satellites, selectedSatNorad]);

  // Calculations
  const calculations = useMemo(() => {
    if (!selectedSat || !selectedSat.tle1 || !selectedSat.tle2) return null;

    const satrec = satellite.twoline2satrec(selectedSat.tle1, selectedSat.tle2);
    const positionAndVelocity = satellite.propagate(satrec, now);

    // Check if sat is currently viewable (can rely on useSatellites pre-calc, but this is real-time 1Hz)
    const gmst = satellite.gstime(now);
    const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);
    const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);

    const rangeRate = calculateRangeRate(positionAndVelocity, observerGd, now);

    // Frequencies
    const downlinkHz = parseFrequency(selectedSat.downlink);
    const uplinkHz = parseFrequency(selectedSat.uplink); // Uplink usually 70cm, Downlink 2m or vice versa

    const dlShift = downlinkHz
      ? calculateDopplerShift(downlinkHz, rangeRate)
      : 0;
    const ulShift = uplinkHz ? calculateDopplerShift(uplinkHz, rangeRate) : 0;

    return {
      azimuth: satellite.radiansToDegrees(lookAngles.azimuth),
      elevation: satellite.radiansToDegrees(lookAngles.elevation),
      range: lookAngles.rangeSat, // km
      rangeRate, // km/s
      downlink: downlinkHz,
      uplink: uplinkHz,
      dlShift,
      ulShift,
      dlCorrected: downlinkHz ? downlinkHz + dlShift : 0,
      ulCorrected: uplinkHz ? uplinkHz + ulShift : 0,
    };
  }, [selectedSat, now, observerGd]);

  // Rig Control Loop
  useEffect(() => {
    if (dopplerEnabled && connected && calculations && calculations.downlink) {
      // Tune Radio
      // Note: This sets the "Active VFO". Ideally we'd set Split.
      // Applying LO Offset for Transverters

      const rawFreq = calculations.dlCorrected - loOffset;
      // Round to nearest 10Hz to avoid sending floats (e.g. 145950435.08...)
      const targetFreq = Math.round(rawFreq / 10) * 10;

      // Basic throttling is needed. The setFreq checks if changed, but 1Hz is safe.
      setFreq(targetFreq);

      // If we could set Uplink (VFO B), we would do (ulCorrected - loOffset).
    }
  }, [dopplerEnabled, connected, calculations, loOffset, setFreq]);

  // Handlers
  const handleTune = () => {
    if (!calculations || !connected) return;
    const target =
      (calculations.downlink || 0) + (calculations.dlShift || 0) - loOffset;
    setFreq(target);
    // Also try to set mode
    if (selectedSat.mode) {
      // Simple mapping
      if (selectedSat.mode.includes("FM")) setMode("FM");
      else if (selectedSat.mode.includes("CW")) setMode("CW");
      else if (
        selectedSat.mode.includes("SSB") ||
        selectedSat.mode.includes("Linear")
      )
        setMode("USB");
    }
  };

  // Filter satellites
  const [filterVisible, setFilterVisible] = useState(true);

  // Apply filters
  const visibleSatellites = useMemo(() => {
    return satellites
      .filter(s => !filterVisible || s.visible || s.isPopular)
      .sort((a, b) => {
        // Sort visible first, then alphabetical
        if (a.visible && !b.visible) return -1;
        if (!a.visible && b.visible) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [satellites, filterVisible]);


  if (loading) return <div className="panel-loading">{t('common.loading')}</div>;

  return (
    <div className="satellite-panel" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      color: 'var(--text-primary)',
      gap: '10px',
      padding: '10px'
    }}>
      <div className="panel-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '5px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <h3 style={{ margin: 0 }}>{t('satellite.panel.title', { defaultValue: 'Satellite Tracker' })}</h3>
        <div style={{ fontSize: '0.85rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={filterVisible}
              onChange={e => setFilterVisible(e.target.checked)}
            />
            {t('satellite.panel.visibleOnly', { defaultValue: 'Visible Only' })}
          </label>
        </div>
      </div>

      <div className="panel-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Selector */}
        <div className="sat-selector">
          <select
            value={selectedSatNorad || ''}
            onChange={e => setSelectedSatNorad(parseInt(e.target.value))}
            style={{
              width: '100%',
              padding: '8px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px'
            }}
          >
            <option value="">{t('satellite.panel.select', { defaultValue: '-- Select Satellite --' })}</option>
            {visibleSatellites.map(s => (
              <option key={s.norad || s.name} value={s.norad}>
                {s.name} {s.visible ? '●' : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedSat ? (
          <>
            {/* Info Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
              fontSize: '0.9rem',
              background: 'var(--bg-secondary)',
              padding: '10px',
              borderRadius: '6px'
            }}>
              <div style={{ color: 'var(--text-secondary)' }}>{t('satellite.panel.azimuth', { defaultValue: 'Azimuth:' })}</div>
              <div style={{ fontWeight: 'bold', color: 'var(--accent-cyan)' }}>
                {calculations ? calculations.azimuth.toFixed(1) : (selectedSat.azimuth || 0).toFixed(1)}° <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>({cardinalDirection(calculations ? calculations.azimuth : selectedSat.azimuth)})</span>
              </div>

              <div style={{ color: 'var(--text-secondary)' }}>{t('satellite.panel.elevation', { defaultValue: 'Elevation:' })}</div>
              <div style={{ fontWeight: 'bold', color: (calculations ? calculations.elevation : (selectedSat.elevation || 0)) > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {calculations ? calculations.elevation.toFixed(1) : (selectedSat.elevation || 0).toFixed(1)}°
              </div>

              <div style={{ color: 'var(--text-secondary)' }}>{t('satellite.panel.range', { defaultValue: 'Range:' })}</div>
              <div>{calculations ? Math.round(calculations.range) : (selectedSat.range || 0)} km</div>

              <div style={{ color: 'var(--text-secondary)' }}>{t('satellite.panel.rate', { defaultValue: 'Rate:' })}</div>
              <div>{calculations && calculations.rangeRate ? calculations.rangeRate.toFixed(3) : '0.000'} km/s</div>
            </div>

            {/* Frequencies & Doppler */}
            <div style={{
              background: 'var(--bg-secondary)',
              padding: '10px',
              borderRadius: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '5px',
                marginBottom: '5px'
              }}>
                <span style={{ fontWeight: 'bold' }}>{t('satellite.panel.radioControl', { defaultValue: 'Radio Control' })}</span>
                {rigEnabled ? (
                  <button
                    onClick={() => setDopplerEnabled(!dopplerEnabled)}
                    style={{
                      background: dopplerEnabled ? 'var(--accent-green)' : 'var(--bg-tertiary)',
                      color: dopplerEnabled ? '#000' : 'var(--text-primary)',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '0.8rem'
                    }}
                  >
                    {t('satellite.panel.doppler', { defaultValue: 'DOPPLER' })} {dopplerEnabled ? 'ON' : 'OFF'}
                  </button>
                ) : (
                  <span style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>{t('satellite.panel.rigDisconnected', { defaultValue: 'Rig Disconnected' })}</span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '5px', alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('satellite.panel.downlink', { defaultValue: 'Downlink:' })}</span>
                <span style={{ fontFamily: 'monospace' }}>{selectedSat.downlink || '---'}</span>
                <span style={{ color: dopplerEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {calculations && calculations.dlCorrected ? formatDopplerFreq(calculations.dlCorrected) : ''}
                </span>

                <span style={{ color: 'var(--text-secondary)' }}>{t('satellite.panel.uplink', { defaultValue: 'Uplink:' })}</span>
                <span style={{ fontFamily: 'monospace' }}>{selectedSat.uplink || '---'}</span>
                <span style={{ color: dopplerEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {calculations && calculations.ulCorrected ? formatDopplerFreq(calculations.ulCorrected) : ''}
                </span>
              </div>

              {/* Transverter Offset */}
              <div style={{ marginTop: '5px', paddingTop: '5px', borderTop: '1px dashed var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('satellite.panel.transverterOffset', { defaultValue: 'Transverter Offset (Hz):' })}</span>
                  <input
                    type="number"
                    value={loOffset}
                    onChange={e => setLoOffset(parseInt(e.target.value) || 0)}
                    style={{
                      width: '100px',
                      padding: '2px',
                      fontSize: '0.8rem',
                      background: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      textAlign: 'right'
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleTune}
                disabled={!connected}
                style={{
                  marginTop: '5px',
                  width: '100%',
                  padding: '6px',
                  background: 'var(--accent-blue)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: connected ? 'pointer' : 'not-allowed',
                  opacity: connected ? 1 : 0.6
                }}
              >
                {t('satellite.panel.tuneCenter', { defaultValue: 'TUNE CENTER' })}
              </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {t('satellite.panel.nextPass', { defaultValue: 'Next Pass:' })} {selectedSat.nextPass ? new Date(selectedSat.nextPass).toLocaleTimeString() : t('satellite.panel.calculating', { defaultValue: 'Calculating...' })}
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-muted)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '10px' }}>🛰️</div>
            <div>{t('satellite.panel.placeholder', { defaultValue: 'Select a satellite to begin tracking' })}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SatellitePanel;
