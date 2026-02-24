import { useState, useEffect, useRef } from 'react';
import { makeDraggable } from "./makeDraggable.js";

/**
 * VOACAP-Style Propagation Heatmap Plugin v1.0.0
 *
 * Shows color-coded propagation predictions from your DE location to
 * the entire world for a selected HF band — green (good), yellow
 * (marginal), red (poor). Inspired by the original HamClock VOACAP overlay.
 *
 * Data source: /api/propagation/heatmap (server-side, uses ITU-R P.533-style model)
 * Update interval: 5 minutes
 */

export const metadata = {
  id: 'voacap-heatmap',
  name: 'VOACAP Propagation Map',
  description: 'Color-coded HF propagation predictions from your station to the world',
  icon: '🌐',
  category: 'propagation',
  defaultEnabled: false,
  defaultOpacity: 0.55,
  version: '1.0.0',
};

// HF bands: label, frequency in MHz
const BANDS = [
  { label: '160m', freq: 1.8 },
  { label: '80m', freq: 3.5 },
  { label: '40m', freq: 7 },
  { label: '30m', freq: 10 },
  { label: '20m', freq: 14 },
  { label: '17m', freq: 18 },
  { label: '15m', freq: 21 },
  { label: '12m', freq: 24 },
  { label: '10m', freq: 28 },
];

// Reliability to color: HamClock-style wide spectrum
// magenta (0%) → red → orange → yellow → green (100%)
function reliabilityColor(r) {
  // Poor (< 15%) — no overlay; let the map show through
  if (r < 15) return null;
  if (r >= 99) return 'rgba(0,220,0,0.85)';

  let red, green, blue;
  if (r < 30) {
    // Low: Red-Orange (15–30%)
    const t = (r - 15) / 15;
    red = 255;
    green = Math.round(t * 100);
    blue = 0;
  } else if (r < 50) {
    // Fair-Low: Orange → Yellow (30–50%)
    const t = (r - 30) / 20;
    red = 255;
    green = 100 + Math.round(t * 155);
    blue = 0;
  } else if (r < 70) {
    // Fair: Yellow → Yellow-Green (50–70%)
    const t = (r - 50) / 20;
    red = 255 - Math.round(t * 130);
    green = 255;
    blue = 0;
  } else {
    // Good: Yellow-Green → Green (70–100%)
    const t = (r - 70) / 30;
    red = 125 - Math.round(t * 125);
    green = 220 + Math.round(t * 35);
    blue = 0;
  }
  return `rgba(${red},${green},${blue},0.85)`;
}


// Minimize/maximize toggle
function addMinimizeToggle(container, storageKey) {
  if (!container) return;

  const contentWrapper = container.querySelector('.voacap-panel-content');
  const minimizeBtn = container.querySelector('.voacap-minimize-btn');
  if (!contentWrapper || !minimizeBtn) return;

  const minKey = storageKey + '-minimized';
  const isMinimized = localStorage.getItem(minKey) === 'true';

  if (isMinimized) {
    contentWrapper.style.display = 'none';
    minimizeBtn.textContent = '▶';
  }

  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const hidden = contentWrapper.style.display === 'none';
    contentWrapper.style.display = hidden ? 'block' : 'none';
    minimizeBtn.textContent = hidden ? '▼' : '▶';
    localStorage.setItem(minKey, !hidden);
  });
}

export function useLayer({ map, enabled, opacity, callsign, locator }) {
  const [selectedBand, setSelectedBand] = useState(() => {
    const saved = localStorage.getItem('voacap-heatmap-band');
    return saved ? parseInt(saved) : 4; // Default: 20m (index 4)
  });
  const [gridSize, setGridSize] = useState(() => {
    const saved = localStorage.getItem('voacap-heatmap-grid');
    return saved ? parseInt(saved) : 5;
  });
  const [propMode, setPropMode] = useState(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('openhamclock_config') || '{}');
      return cfg.propagation?.mode || 'SSB';
    } catch {
      return 'SSB';
    }
  });
  const [propPower, setPropPower] = useState(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem('openhamclock_config') || '{}');
      return cfg.propagation?.power || 100;
    } catch {
      return 100;
    }
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const layersRef = useRef([]);
  const controlRef = useRef(null);
  const intervalRef = useRef(null);

  // Listen for config changes (fired by saveConfig in config.js)
  useEffect(() => {
    const onConfigChange = (e) => {
      const cfg = e.detail || {};
      const newMode = cfg.propagation?.mode || 'SSB';
      const newPower = cfg.propagation?.power || 100;
      setPropMode((prev) => (prev !== newMode ? newMode : prev));
      setPropPower((prev) => (prev !== newPower ? newPower : prev));
    };

    window.addEventListener('openhamclock-config-change', onConfigChange);
    return () => window.removeEventListener('openhamclock-config-change', onConfigChange);
  }, []);

  // Parse DE location from locator grid square
  const deLocation = (() => {
    if (!locator || locator.length < 4) return null;
    const g = locator.toUpperCase();
    const lon = (g.charCodeAt(0) - 65) * 20 - 180;
    const lat = (g.charCodeAt(1) - 65) * 10 - 90;
    const lonMin = parseInt(g[2]) * 2;
    const latMin = parseInt(g[3]) * 1;
    return { lat: lat + latMin + 0.5, lon: lon + lonMin + 1 };
  })();

  // Fetch heatmap data
  useEffect(() => {
    if (!enabled || !deLocation) return;

    const fetchData = async () => {
      const band = BANDS[selectedBand];
      if (!band) return;

      setLoading(true);
      try {
        const url = `/api/propagation/heatmap?deLat=${deLocation.lat.toFixed(1)}&deLon=${deLocation.lon.toFixed(1)}&freq=${band.freq}&grid=${gridSize}&mode=${propMode}&power=${propPower}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setLastFetch(Date.now());
        }
      } catch (err) {
        console.error('[VOACAP Heatmap] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    intervalRef.current = setInterval(fetchData, 5 * 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, deLocation?.lat, deLocation?.lon, selectedBand, gridSize, propMode, propPower]);

  // Create control panel
  useEffect(() => {
    if (!map || !enabled) return;

    // Avoid duplicate controls
    if (controlRef.current) {
      try {
        map.removeControl(controlRef.current);
      } catch (e) {}
      controlRef.current = null;
    }

    const VOACAPControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const container = L.DomUtil.create('div', 'voacap-heatmap-control');
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        const bandOptions = BANDS.map(
          (b, i) => `<option value="${i}" ${i === selectedBand ? 'selected' : ''}>${b.label} (${b.freq} MHz)</option>`,
        ).join('');

        const gridOptions = [5, 10, 15, 20]
          .map((g) => `<option value="${g}" ${g === gridSize ? 'selected' : ''}>${g}°</option>`)
          .join('');

        const modeOptions = ['SSB', 'CW', 'FT8', 'FT4', 'RTTY', 'AM', 'FM']
          .map((m) => `<option value="${m}" ${m === propMode ? 'selected' : ''}>${m}</option>`)
          .join('');

        const powerOptions = [5, 10, 25, 50, 100, 200, 400, 500, 750, 1000, 1500]
          .map((p) => `<option value="${p}" ${p === propPower ? 'selected' : ''}>${p}W</option>`)
          .join('');

        container.innerHTML = `
          <div style="
            background: rgba(20, 20, 40, 0.92);
            border: 1px solid rgba(255, 170, 0, 0.4);
            border-radius: 8px;
            padding: 10px 12px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            color: #ddd;
            min-width: 180px;
            backdrop-filter: blur(8px);
          ">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <span style="color: #ffaa00; font-weight: 700; font-size: 12px;">🌐 VOACAP Heatmap</span>
              <button class="voacap-minimize-btn" style="
                background: none; border: none; color: #888; font-size: 10px;
                cursor: pointer; padding: 2px 4px;
              ">▼</button>
            </div>
            <div class="voacap-panel-content">
              <div style="margin-bottom: 6px;">
                <label style="color: #888; font-size: 10px;">Band</label>
                <select id="voacap-band-select" style="
                  width: 100%; margin-top: 2px; padding: 4px;
                  background: rgba(0,0,0,0.5); color: #fff;
                  border: 1px solid #555; border-radius: 4px;
                  font-family: 'JetBrains Mono', monospace; font-size: 11px;
                ">${bandOptions}</select>
              </div>
              <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                <div style="flex: 1;">
                  <label style="color: #888; font-size: 10px;">Mode</label>
                  <select id="voacap-mode-select" style="
                    width: 100%; margin-top: 2px; padding: 4px;
                    background: rgba(0,0,0,0.5); color: #fff;
                    border: 1px solid #555; border-radius: 4px;
                    font-family: 'JetBrains Mono', monospace; font-size: 11px;
                  ">${modeOptions}</select>
                </div>
                <div style="flex: 1;">
                  <label style="color: #888; font-size: 10px;">Power</label>
                  <select id="voacap-power-select" style="
                    width: 100%; margin-top: 2px; padding: 4px;
                    background: rgba(0,0,0,0.5); color: #fff;
                    border: 1px solid #555; border-radius: 4px;
                    font-family: 'JetBrains Mono', monospace; font-size: 11px;
                  ">${powerOptions}</select>
                </div>
              </div>
              <div style="margin-bottom: 8px;">
                <label style="color: #888; font-size: 10px;">Grid Resolution</label>
                <select id="voacap-grid-select" style="
                  width: 100%; margin-top: 2px; padding: 4px;
                  background: rgba(0,0,0,0.5); color: #fff;
                  border: 1px solid #555; border-radius: 4px;
                  font-family: 'JetBrains Mono', monospace; font-size: 11px;
                ">${gridOptions}</select>
              </div>
              <div style="
                display: flex; justify-content: space-between; align-items: center;
                background: rgba(0,0,0,0.3); border-radius: 4px; padding: 4px 6px;
              ">
                <span style="display: inline-block; width: 12px; height: 12px; background: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 4px); border: 1px solid rgba(255,255,255,0.3); border-radius: 2px;" title="No overlay"></span>
                <span style="color: #888; font-size: 9px;">Poor</span>
                <span style="display: inline-block; width: 12px; height: 12px; background: rgba(255,80,0,0.9); border-radius: 2px;"></span>
                <span style="color: #888; font-size: 9px;">Low</span>
                <span style="display: inline-block; width: 12px; height: 12px; background: rgba(255,255,0,0.9); border-radius: 2px;"></span>
                <span style="color: #888; font-size: 9px;">Fair</span>
                <span style="display: inline-block; width: 12px; height: 12px; background: rgba(0,220,0,0.9); border-radius: 2px;"></span>
                <span style="color: #888; font-size: 9px;">Good</span>
              </div>
              <div id="voacap-status" style="color: #666; font-size: 9px; margin-top: 6px; text-align: center;">
                ${loading ? 'Loading...' : data ? `${data.mode || 'SSB'} ${data.power || 100}W | SFI: ${data.solarData?.sfi} K: ${data.solarData?.kIndex}` : 'Ready'}
              </div>
            </div>
          </div>
        `;

        return container;
      },
    });

    controlRef.current = new VOACAPControl();
    map.addControl(controlRef.current);

    // Helper to update both plugin state AND global config in localStorage
    const updateGlobalConfig = (mode, power) => {
      try {
        const cfg = JSON.parse(localStorage.getItem('openhamclock_config') || '{}');
        if (!cfg.propagation) cfg.propagation = {};
        cfg.propagation.mode = mode;
        cfg.propagation.power = power;
        localStorage.setItem('openhamclock_config', JSON.stringify(cfg));
        // Don't dispatch event here — we're already updating local state directly
      } catch (e) {}
    };

    // Wire up event handlers after DOM is ready
    setTimeout(() => {
      const container = controlRef.current?._container;
      if (!container) return;

      // Apply saved position
      const saved = localStorage.getItem('voacap-heatmap-position');
      if (saved) {
        try {
          const { top, left } = JSON.parse(saved);
          container.style.position = 'fixed';
          container.style.top = top + 'px';
          container.style.left = left + 'px';
          container.style.right = 'auto';
          container.style.bottom = 'auto';
        } catch (e) {}
      }

      makeDraggable(container, 'voacap-heatmap-position');
      addMinimizeToggle(container, 'voacap-heatmap-position');

      const bandSelect = document.getElementById('voacap-band-select');
      const gridSelect = document.getElementById('voacap-grid-select');
      const modeSelect = document.getElementById('voacap-mode-select');
      const powerSelect = document.getElementById('voacap-power-select');

      if (bandSelect) {
        bandSelect.addEventListener('change', (e) => {
          const val = parseInt(e.target.value);
          setSelectedBand(val);
          localStorage.setItem('voacap-heatmap-band', val);
        });
      }
      if (gridSelect) {
        gridSelect.addEventListener('change', (e) => {
          const val = parseInt(e.target.value);
          setGridSize(val);
          localStorage.setItem('voacap-heatmap-grid', val);
        });
      }
      if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
          const val = e.target.value;
          setPropMode(val);
          updateGlobalConfig(val, propPower);
        });
      }
      if (powerSelect) {
        powerSelect.addEventListener('change', (e) => {
          const val = parseFloat(e.target.value);
          setPropPower(val);
          updateGlobalConfig(propMode, val);
        });
      }
    }, 150);
  }, [enabled, map]);

  // Update status text and sync panel dropdowns when mode/power change
  useEffect(() => {
    if (!enabled) return;

    const statusEl = document.getElementById('voacap-status');
    if (statusEl) {
      if (loading) {
        statusEl.textContent = 'Loading...';
      } else if (data) {
        statusEl.textContent = `${data.mode || 'SSB'} ${data.power || 100}W | SFI: ${data.solarData?.sfi} K: ${data.solarData?.kIndex}`;
      }
    }

    // Sync dropdowns if changed externally (e.g. from Settings panel)
    const modeSelect = document.getElementById('voacap-mode-select');
    const powerSelect = document.getElementById('voacap-power-select');
    if (modeSelect && modeSelect.value !== propMode) modeSelect.value = propMode;
    if (powerSelect && parseFloat(powerSelect.value) !== propPower) powerSelect.value = propPower;
  }, [loading, data, enabled, propMode, propPower]);

  // Render heatmap rectangles on the map
  useEffect(() => {
    if (!map || !enabled) return;

    // Clear old layers
    layersRef.current.forEach((layer) => {
      try {
        map.removeLayer(layer);
      } catch (e) {}
    });
    layersRef.current = [];

    if (!data?.cells?.length) return;

    const half = (data.gridSize || 10) / 2;
    // Tiny overlap prevents sub-pixel rendering gaps between adjacent cells
    // (anti-aliasing creates visible seams when rectangles share exact edges)
    const overlap = 0.15;
    const newLayers = [];

    // Use a shared canvas renderer for all cells — avoids SVG anti-aliasing
    // seams and is significantly faster for hundreds of rectangles
    const renderer = L.canvas({ padding: 0.5 });

    data.cells.forEach((cell) => {
      const color = reliabilityColor(cell.r);
      if (!color) return; // Poor — no overlay
      const band = BANDS[selectedBand];

      // Fade opacity near the poor threshold for smooth visual edges
      // instead of hard color-to-transparent cutoffs at grid boundaries
      const cellOpacity = cell.r < 30 ? opacity * ((cell.r - 15) / 15) : opacity;

      // Create rectangles in 3 world copies for dateline support
      for (const offset of [-360, 0, 360]) {
        const bounds = [
          [cell.lat - half - overlap, cell.lon - half - overlap + offset],
          [cell.lat + half + overlap, cell.lon + half + overlap + offset],
        ];

        const rect = L.rectangle(bounds, {
          stroke: false,
          fillColor: color,
          fillOpacity: cellOpacity,
          weight: 0,
          interactive: false,
          bubblingMouseEvents: true,
          renderer,
        });

        rect.addTo(map);
        newLayers.push(rect);
      }
    });

    layersRef.current = newLayers;

    return () => {
      newLayers.forEach((layer) => {
        try {
          map.removeLayer(layer);
        } catch (e) {}
      });
    };
  }, [map, enabled, data, opacity, selectedBand]);

  // Cleanup on disable
  useEffect(() => {
    if (!enabled && map) {
      if (controlRef.current) {
        try {
          map.removeControl(controlRef.current);
        } catch (e) {}
        controlRef.current = null;
      }
      layersRef.current.forEach((layer) => {
        try {
          map.removeLayer(layer);
        } catch (e) {}
      });
      layersRef.current = [];
    }
  }, [enabled, map]);

  return { data, loading, selectedBand };
}

// Quick haversine for popup display (no need for full precision)
function haversineApprox(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Format distance using global units preference from config
function formatDistanceApprox(km) {
  try {
    const cfg = JSON.parse(localStorage.getItem('openhamclock_config') || '{}');
    if (cfg.units === 'metric') return `${km.toLocaleString()} km`;
  } catch (e) {}
  return `${Math.round(km * 0.621371).toLocaleString()} mi`;
}
