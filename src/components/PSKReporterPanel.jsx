/**
 * PSKReporter Panel
 * Shows where your digital mode signals are being received
 * Styled to match DXClusterPanel
 */
import React, { useState } from 'react';
import { usePSKReporter } from '../hooks/usePSKReporter.js';
import { getBandColor } from '../utils/callsign.js';

const PSKReporterPanel = ({ callsign, onShowOnMap, showOnMap, onToggleMap }) => {
  const [timeWindow, setTimeWindow] = useState(15);
  const [activeTab, setActiveTab] = useState('rx'); // Default to 'rx' (Hearing) - more useful
  
  const { 
    txReports, 
    txCount, 
    rxReports, 
    rxCount, 
    loading, 
    error,
    refresh 
  } = usePSKReporter(callsign, { 
    minutes: timeWindow,
    enabled: callsign && callsign !== 'N0CALL'
  });

  const reports = activeTab === 'tx' ? txReports : rxReports;
  const count = activeTab === 'tx' ? txCount : rxCount;

  // Get band color from frequency
  const getFreqColor = (freqMHz) => {
    if (!freqMHz) return 'var(--text-muted)';
    const freq = parseFloat(freqMHz);
    return getBandColor(freq);
  };

  // Format age
  const formatAge = (minutes) => {
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes/60)}h`;
  };

  if (!callsign || callsign === 'N0CALL') {
    return (
      <div className="panel" style={{ padding: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: '700', marginBottom: '6px' }}>
          📡 PSKReporter
        </div>
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '10px', fontSize: '11px' }}>
          Set callsign in Settings
        </div>
      </div>
    );
  }

  return (
    <div className="panel" style={{ 
      padding: '10px', 
      display: 'flex', 
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden'
    }}>
      {/* Header - matches DX Cluster style */}
      <div style={{ 
        fontSize: '12px', 
        color: 'var(--accent-primary)', 
        fontWeight: '700', 
        marginBottom: '6px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center' 
      }}>
        <span>📡 PSKReporter</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <select 
            value={timeWindow}
            onChange={(e) => setTimeWindow(parseInt(e.target.value))}
            style={{
              background: 'rgba(100, 100, 100, 0.3)',
              border: '1px solid #666',
              color: '#aaa',
              padding: '2px 4px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: 'JetBrains Mono',
              cursor: 'pointer'
            }}
          >
            <option value={5}>5m</option>
            <option value={15}>15m</option>
            <option value={30}>30m</option>
            <option value={60}>1h</option>
          </select>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              background: 'rgba(100, 100, 100, 0.3)',
              border: '1px solid #666',
              color: '#888',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            🔄
          </button>
          {onToggleMap && (
            <button
              onClick={onToggleMap}
              style={{
                background: showOnMap ? 'rgba(68, 136, 255, 0.3)' : 'rgba(100, 100, 100, 0.3)',
                border: `1px solid ${showOnMap ? '#4488ff' : '#666'}`,
                color: showOnMap ? '#4488ff' : '#888',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                fontFamily: 'JetBrains Mono',
                cursor: 'pointer'
              }}
            >
              🗺️ {showOnMap ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      </div>
      
      {/* Tabs - compact style */}
      <div style={{ 
        display: 'flex', 
        gap: '4px',
        marginBottom: '6px'
      }}>
        <button
          onClick={() => setActiveTab('tx')}
          style={{
            flex: 1,
            padding: '4px 6px',
            background: activeTab === 'tx' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(100, 100, 100, 0.2)',
            border: `1px solid ${activeTab === 'tx' ? '#4ade80' : '#555'}`,
            borderRadius: '3px',
            color: activeTab === 'tx' ? '#4ade80' : '#888',
            cursor: 'pointer',
            fontSize: '10px',
            fontFamily: 'JetBrains Mono'
          }}
        >
          📤 Being Heard ({txCount})
        </button>
        <button
          onClick={() => setActiveTab('rx')}
          style={{
            flex: 1,
            padding: '4px 6px',
            background: activeTab === 'rx' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(100, 100, 100, 0.2)',
            border: `1px solid ${activeTab === 'rx' ? '#60a5fa' : '#555'}`,
            borderRadius: '3px',
            color: activeTab === 'rx' ? '#60a5fa' : '#888',
            cursor: 'pointer',
            fontSize: '10px',
            fontFamily: 'JetBrains Mono'
          }}
        >
          📥 Hearing ({rxCount})
        </button>
      </div>

      {/* Reports list - matches DX Cluster style */}
      {error ? (
        <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontSize: '11px' }}>
          ⚠️ Temporarily unavailable
        </div>
      ) : loading && reports.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
          <div className="loading-spinner" />
        </div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontSize: '11px' }}>
          No {activeTab === 'tx' ? 'reception reports' : 'stations heard'}
        </div>
      ) : (
        <div style={{ 
          flex: 1, 
          overflow: 'auto',
          fontSize: '12px',
          fontFamily: 'JetBrains Mono, monospace'
        }}>
          {reports.slice(0, 20).map((report, i) => {
            const freqMHz = report.freqMHz || (report.freq ? (report.freq / 1000000).toFixed(3) : '?');
            const color = getFreqColor(freqMHz);
            const displayCall = activeTab === 'tx' ? report.receiver : report.sender;
            const grid = activeTab === 'tx' ? report.receiverGrid : report.senderGrid;
            
            return (
              <div
                key={`${displayCall}-${report.freq}-${i}`}
                onClick={() => onShowOnMap && report.lat && report.lon && onShowOnMap(report)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '55px 1fr auto',
                  gap: '6px',
                  padding: '4px 6px',
                  borderRadius: '3px',
                  marginBottom: '2px',
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  cursor: report.lat && report.lon ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  borderLeft: '2px solid transparent'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(68, 136, 255, 0.15)'}
                onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent'}
              >
                <div style={{ color, fontWeight: '600', fontSize: '11px' }}>
                  {freqMHz}
                </div>
                <div style={{ 
                  color: 'var(--text-primary)', 
                  fontWeight: '600',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '11px'
                }}>
                  {displayCall}
                  {grid && <span style={{ color: 'var(--text-muted)', fontWeight: '400', marginLeft: '4px', fontSize: '9px' }}>{grid}</span>}
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '4px',
                  fontSize: '10px'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>{report.mode}</span>
                  {report.snr !== null && report.snr !== undefined && (
                    <span style={{ 
                      color: report.snr >= 0 ? '#4ade80' : report.snr >= -10 ? '#fbbf24' : '#f97316',
                      fontWeight: '600'
                    }}>
                      {report.snr > 0 ? '+' : ''}{report.snr}
                    </span>
                  )}
                  <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
                    {formatAge(report.age)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PSKReporterPanel;

export { PSKReporterPanel };
