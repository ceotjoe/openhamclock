# Changelog

All notable changes to OpenHamClock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- SOTA API integration
- WebSocket DX cluster connection
- Azimuthal equidistant projection option

## [3.9.0] - 2026-02-01

### Added
- **Hybrid Propagation System** - Best-of-both-worlds HF prediction
  - Combines ITURHFProp (ITU-R P.533-14) base predictions with real-time ionosonde corrections
  - Automatic fallback to built-in calculations when ITURHFProp unavailable
  - Configurable via `ITURHFPROP_URL` environment variable
- **ITURHFProp Service** - Deployable microservice for ITU-R P.533-14 predictions
  - REST API wrapper around ITURHFProp engine
  - Docker/Railway deployable
  - Endpoints: `/api/predict`, `/api/predict/hourly`, `/api/bands`, `/api/health`
- **Ionospheric Correction Factor** - Adjusts model predictions based on actual conditions
  - Compares expected foF2 (from model) vs actual foF2 (from ionosonde)
  - Applies geomagnetic (K-index) penalties
  - Reports correction confidence (high/medium/low)

### Changed
- Propagation API now reports hybrid mode status
- Response includes `model` field indicating prediction source
- Added `hybrid` object to propagation response with correction details

### Technical
- New functions: `fetchITURHFPropPrediction()`, `applyHybridCorrection()`, `calculateIonoCorrection()`
- 5-minute cache for ITURHFProp predictions
- Graceful degradation when services unavailable

## [3.8.0] - 2026-01-31

### Added
- **DX Cluster Paths on Map** - Visual lines connecting spotters to DX stations
  - Band-specific colors: 160m (red), 80m (orange), 40m (yellow), 20m (green), 15m (cyan), 10m (purple), 6m (magenta)
  - Toggle visibility with button in DX Cluster panel
  - Click paths to see spot details
- **Hover Highlighting** - Hover over spots in DX list to highlight path on map
  - Path turns white and thickens when hovered
  - Circle markers pulse on hover
- **Grid Square Extraction** - Parse grid squares from DX cluster comments
  - Supports "Grid: XX00xx" format in spot comments
  - Shows grid in spot popups on map
- **Callsign Labels on Map** - Optional labels for DX stations and spotters
  - Toggle with label button in DX Cluster panel
- **Moon Tracking** - Real-time sublunar point on map
  - Shows current moon phase emoji
  - Updates position and phase in real-time

### Changed
- Improved DX path rendering with antimeridian crossing support
- Better popup formatting with grid square display
- Enhanced spot filtering works on map paths too

## [3.7.0] - 2026-01-31

### Added
- **DX Spider Proxy Service** - Dedicated server for DX cluster data
  - Real-time Telnet connection to DX Spider nodes
  - WebSocket distribution to multiple clients
  - Grid square parsing from spot comments
  - Fallback to HTTP APIs when Telnet unavailable
- **Spotter Location Mapping** - Show where spots originate from
  - Circle markers for spotters with callsign popups
  - Lines connecting spotter to DX station
- **Map Layer Controls** - Toggle various map overlays
  - POTA activators toggle
  - DX cluster paths toggle
  - Satellite footprints toggle (placeholder)

### Technical
- New `/api/dxcluster-paths` endpoint returns enriched spot data
- Grid-to-coordinate conversion for spotter locations
- Improved caching for DX cluster data

## [3.6.0] - 2026-01-31

### Added
- **Real-Time Ionosonde Data Integration** - Enhanced propagation predictions using actual ionospheric measurements
  - Fetches real-time foF2, MUF(3000), hmF2 data from KC2G/GIRO ionosonde network (~100 stations worldwide)
  - Inverse distance weighted interpolation for path midpoint ionospheric parameters
  - 10-minute data cache with automatic refresh
  - New `/api/ionosonde` endpoint to access raw station data

### Changed
- **ITU-R P.533-based MUF Calculation** - More accurate Maximum Usable Frequency estimation
  - Uses real foF2 and M(3000)F2 values when available
  - Distance-scaled MUF calculation for varying path lengths
  - Fallback to solar index estimation when ionosonde data unavailable
- **Improved LUF Calculation** - Better Lowest Usable Frequency (D-layer absorption) model
  - Accounts for solar zenith angle, solar flux, and geomagnetic activity
  - Day/night variation with proper diurnal profile
- **Enhanced Reliability Algorithm** - ITU-R P.533 inspired reliability calculations
  - Optimum Working Frequency (OWF) centered predictions
  - Multi-hop path loss consideration
  - Polar path and auroral absorption penalties
  - Low-band nighttime enhancement

### UI Improvements
- Propagation panel shows MUF and LUF values in MHz
- Data source indicator (📡 ionosonde name vs ⚡ estimated)
- Green dot indicator when using real ionosonde data
- foF2 value displayed when available (replaces SSN in bar view)
- Distance now shown in km (not Kkm)

### Technical
- New `fetchIonosondeData()` function with caching
- `interpolateFoF2()` for spatial interpolation of ionospheric parameters
- `calculateMUF()` and `calculateLUF()` helper functions
- `calculateEnhancedReliability()` with proper diurnal scaling

## [3.3.0] - 2026-01-30

### Added
- **Contest Calendar** - Shows upcoming and active ham radio contests
  - Integrates with WA7BNM Contest Calendar API
  - Fallback calculation for major recurring contests (CQ WW, ARRL, etc.)
  - Weekly mini-contests (CWT, SST, NCCC Sprint)
  - Active contest highlighting with blinking indicator
- **Classic Layout** - New layout option inspired by original HamClock
  - Side panels for DE/DX info, DX cluster, contests
  - Large centered map
  - Compact data-dense design
- **Theme System** - Three visual themes
  - 🌙 Dark (default) - Modern dark theme with amber/cyan accents
  - ☀️ Light - Bright theme for daytime use
  - 📟 Legacy - Classic green-on-black CRT style
- **Quick Stats Panel** - Overview of active contests, POTA activators, DX spots
- **4-column modern layout** - Improved data organization
- **Settings persistence** - Theme and layout saved to localStorage

### Changed
- Modern layout now uses 4-column grid for better information density
- Improved DX cluster API with multiple fallback sources
- Settings panel now includes theme and layout selection

## [3.2.0] - 2026-01-30

### Added
- Theme support (dark, light, legacy)
- Layout selection in settings
- Real-time theme preview in settings

## [3.1.0] - 2026-01-30

### Added
- User settings panel with callsign and location configuration
- Grid square entry with automatic lat/lon conversion
- Browser geolocation support ("Use My Current Location")
- Settings saved to localStorage

### Fixed
- DX cluster now uses server proxy only (no CORS errors)
- Improved DX cluster API reliability with multiple sources

## [3.0.0] - 2026-01-30

### Added
- **Real map tiles** via Leaflet.js - no more approximated shapes!
- **8 map styles**: Dark, Satellite, Terrain, Streets, Topo, Ocean, NatGeo, Gray
- **Interactive map** - click anywhere to set DX location
- **Day/night terminator** using Leaflet.Terminator plugin
- **Great circle path** visualization between DE and DX
- **POTA activators** displayed on map with callsigns
- **Express server** with API proxy for CORS-free data fetching
- **Electron desktop app** support for Windows, macOS, Linux
- **Docker support** with multi-stage build
- **Railway deployment** configuration
- **Raspberry Pi setup script** with kiosk mode option
- **Cross-platform install scripts** (Linux, macOS, Windows)
- **GitHub Actions CI/CD** pipeline

### Changed
- Complete rewrite of map rendering using Leaflet.js
- Improved responsive layout for different screen sizes
- Better error handling for API failures
- Cleaner separation of frontend and backend

### Fixed
- CORS issues with external APIs now handled by server proxy
- Map projection accuracy improved

## [2.0.0] - 2026-01-29

### Added
- Live API integrations for NOAA space weather
- POTA API integration for activator spots
- Band conditions from HamQSL (XML parsing)
- DX cluster spot display
- Realistic continent shapes (SVG paths)
- Great circle path calculations
- Interactive map (click to set DX)

### Changed
- Improved space weather display with color coding
- Better visual hierarchy in panels

## [1.0.0] - 2026-01-29

### Added
- Initial release
- World map with day/night terminator
- UTC and local time display
- DE/DX location panels with grid squares
- Short path / Long path bearing calculations
- Distance calculations
- Sunrise/sunset calculations
- Space weather panel (mock data)
- Band conditions panel
- DX cluster panel (mock data)
- POTA activity panel (mock data)
- Responsive grid layout
- Dark theme with amber/green accents

### Acknowledgments
- Created in memory of Elwood Downey, WB0OEW
- Inspired by the original HamClock

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 3.9.0 | 2026-02-01 | Hybrid propagation (ITURHFProp + ionosonde) |
| 3.8.0 | 2026-01-31 | DX paths on map, hover highlights, moon tracking |
| 3.7.0 | 2026-01-31 | DX Spider proxy, spotter locations, map toggles |
| 3.6.0 | 2026-01-31 | Real-time ionosonde data, ITU-R P.533 propagation |
| 3.3.0 | 2026-01-30 | Contest calendar, classic layout, themes |
| 3.2.0 | 2026-01-30 | Theme system (dark/light/legacy) |
| 3.1.0 | 2026-01-30 | User settings, DX cluster fixes |
| 3.0.0 | 2026-01-30 | Real maps, Electron, Docker, Railway |
| 2.0.0 | 2026-01-29 | Live APIs, improved map |
| 1.0.0 | 2026-01-29 | Initial release |

---

*73 de OpenHamClock contributors*
