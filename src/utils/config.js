/**
 * Configuration Utilities
 * Handles app configuration, localStorage persistence, and theme management
 */

export const DEFAULT_CONFIG = {
  callsign: 'N0CALL',
  location: { lat: 40.0150, lon: -105.2705 }, // Boulder, CO (default)
  defaultDX: { lat: 35.6762, lon: 139.6503 }, // Tokyo
  theme: 'dark', // 'dark', 'light', 'legacy', or 'retro'
  layout: 'modern', // 'modern' or 'legacy'
  refreshIntervals: {
    spaceWeather: 300000,
    bandConditions: 300000,
    pota: 60000,
    dxCluster: 30000,
    terminator: 60000
  }
};

/**
 * Load config from localStorage or use defaults
 */
export const loadConfig = () => {
  try {
    const saved = localStorage.getItem('openhamclock_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return DEFAULT_CONFIG;
};

/**
 * Save config to localStorage
 */
export const saveConfig = (config) => {
  try {
    localStorage.setItem('openhamclock_config', JSON.stringify(config));
  } catch (e) {
    console.error('Error saving config:', e);
  }
};

/**
 * Apply theme to document
 */
export const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
};

/**
 * Map Tile Providers
 */
export const MAP_STYLES = {
  dark: {
    name: 'Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
  },
  streets: {
    name: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  },
  topo: {
    name: 'Topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  },
  watercolor: {
    name: 'Ocean',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  },
  hybrid: {
    name: 'Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google'
  },
  gray: {
    name: 'Gray',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri'
  }
};

export default {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  applyTheme,
  MAP_STYLES
};
