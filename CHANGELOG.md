# Changelog

All notable changes to OpenHamClock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Satellite tracking with pass predictions
- SOTA API integration
- WebSocket DX cluster connection
- Azimuthal equidistant projection option

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

## [2.0.0] - 2024-01-29

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

## [1.0.0] - 2024-01-29

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
| 3.3.0 | 2026-01-30 | Contest calendar, classic layout, themes |
| 3.2.0 | 2026-01-30 | Theme system (dark/light/legacy) |
| 3.1.0 | 2026-01-30 | User settings, DX cluster fixes |
| 3.0.0 | 2026-01-30 | Real maps, Electron, Docker, Railway |
| 2.0.0 | 2024-01-29 | Live APIs, improved map |
| 1.0.0 | 2024-01-29 | Initial release |

---

*73 de OpenHamClock contributors*
