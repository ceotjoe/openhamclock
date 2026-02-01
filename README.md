# 🌐 OpenHamClock

<div align="center">

![OpenHamClock Banner](https://img.shields.io/badge/OpenHamClock-v3.9.0-orange?style=for-the-badge)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)](CONTRIBUTING.md)

**A modern, open-source amateur radio dashboard with real-time space weather, band conditions, DX cluster, and interactive world maps.**

*In loving memory of Elwood Downey, WB0OEW, creator of the original HamClock*

[**Live Demo**](https://openhamclock.up.railway.app) · [**Download**](#-installation) · [**Documentation**](#-features) · [**Contributing**](#-contributing)

![OpenHamClock Screenshot](screenshot.png)

</div>

---

## 📡 About

OpenHamClock is a spiritual successor to the beloved HamClock application created by Elwood Downey, WB0OEW. After Elwood's passing and the announcement that HamClock will cease functioning in June 2026, the amateur radio community came together to create an open-source alternative that carries forward his vision.

### Why OpenHamClock?

- **Open Source**: MIT licensed, community-driven development
- **Cross-Platform**: Runs on Windows, macOS, Linux, and Raspberry Pi
- **Modern Stack**: Built with web technologies for easy customization
- **Real Maps**: Actual satellite/terrain imagery, not approximations
- **Live Data**: Real-time feeds from NOAA, POTA, SOTA, and DX clusters
- **Self-Hosted**: Run locally or deploy to your own server

---

## ✨ Features

### 🗺️ Interactive World Map
- **8 map styles**: Dark, Satellite, Terrain, Streets, Topo, Ocean, NatGeo, Gray
- **Real-time day/night terminator** (gray line)
- **Great circle paths** between DE and DX
- **Click anywhere** to set DX location
- **POTA activators** displayed on map with callsigns
- **DX cluster paths** - Lines connecting spotters to DX stations with band colors
- **Moon tracking** - Real-time sublunar point with phase display
- **Zoom and pan** with full interactivity

### 📡 Propagation Prediction
- **Hybrid ITU-R P.533-14** - Combines professional model with real-time data
  - ITURHFProp engine provides base P.533-14 predictions
  - KC2G/GIRO ionosonde network provides real-time corrections
  - Automatic fallback when services unavailable
- **Real-time ionosonde data** from KC2G/GIRO network (~100 stations)
- **Visual heat map** showing band conditions to DX
- **24-hour propagation chart** with hourly predictions
- **Solar flux, K-index, and sunspot** integration

### 📊 Live Data Integration

| Source | Data | Update Rate |
|--------|------|-------------|
| NOAA SWPC | Solar Flux, K-Index, Sunspots | 5 min |
| KC2G/GIRO | Ionosonde foF2, MUF data | 10 min |
| POTA | Parks on the Air spots | 1 min |
| SOTA | Summits on the Air spots | 1 min |
| DX Cluster | Real-time DX spots | 30 sec |
| HamQSL | Band conditions | 5 min |

### 🔍 DX Cluster
- **Real-time spots** from DX Spider network
- **Visual paths on map** with band-specific colors
- **Hover highlighting** - Mouse over spots to highlight on map
- **Grid square display** - Parsed from spot comments
- **Filtering** by band, mode, continent, and search
- **Spotter locations** shown on map

### 🕐 Station Information
- **UTC and Local time** with date
- **Maidenhead grid square** (6 character)
- **Sunrise/Sunset times** for DE and DX
- **Short path/Long path bearings**
- **Great circle distance** calculation
- **Space weather conditions** assessment

### 📻 Band Conditions
- Visual display for 160m through 70cm
- Color-coded: Good (green), Fair (amber), Poor (red)
- Based on real propagation data

---

## 🚀 Installation

### Quick Start (Any Platform)

```bash
# Clone the repository
git clone https://github.com/accius/openhamclock.git
cd openhamclock

# Install dependencies
npm install

# Start the server
npm start

# Open http://localhost:3000 in your browser
```

### One-Line Install

**Linux/macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/accius/openhamclock/main/scripts/setup-linux.sh | bash
```

**Windows (PowerShell as Admin):**
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/accius/openhamclock/main/scripts/setup-windows.ps1'))
```

### 🍓 Raspberry Pi

```bash
# Download and run the Pi setup script
curl -fsSL https://raw.githubusercontent.com/accius/openhamclock/main/scripts/setup-pi.sh -o setup-pi.sh
chmod +x setup-pi.sh

# Standard installation
./setup-pi.sh

# Or with kiosk mode (fullscreen, auto-start on boot)
./setup-pi.sh --kiosk
```

**Supported Pi Models:**
- Raspberry Pi 3B / 3B+ ✓
- Raspberry Pi 4 (2GB+) ✓✓ (Recommended)
- Raspberry Pi 5 ✓✓✓ (Best performance)

### 🖥️ Desktop App (Electron)

```bash
# Development
npm run electron

# Build for your platform
npm run electron:build

# Build for specific platform
npm run electron:build:win   # Windows
npm run electron:build:mac   # macOS
npm run electron:build:linux # Linux
```

### 🐳 Docker

```bash
# Build the image
docker build -t openhamclock .

# Run the container
docker run -p 3000:3000 openhamclock

# Or use Docker Compose
docker compose up -d
```

### ☁️ Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/openhamclock)

#### Full Deployment (3 Services)

For the complete hybrid propagation system, deploy all three services:

**1. Main OpenHamClock Service**
```bash
# From repository root
railway init
railway up
```

**2. DX Spider Proxy** (optional - enables live DX cluster paths)
```bash
cd dxspider-proxy
railway init
railway up
# Note the URL, e.g., https://dxspider-proxy-xxxx.railway.app
```

**3. ITURHFProp Service** (optional - enables hybrid propagation)
```bash
cd iturhfprop-service
railway init
railway up
# Note the URL, e.g., https://iturhfprop-xxxx.railway.app
```

**4. Link Services**

In the main OpenHamClock service, add environment variable:
```
ITURHFPROP_URL=https://your-iturhfprop-service.railway.app
```

---

## ⚙️ Configuration

Edit your callsign and location in `public/index.html`:

```javascript
const CONFIG = {
  callsign: 'YOUR_CALL',
  location: { lat: YOUR_LAT, lon: YOUR_LON },
  defaultDX: { lat: 35.6762, lon: 139.6503 },
  // ...
};
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `ITURHFPROP_URL` | `null` | ITURHFProp service URL (enables hybrid mode) |

---

## 🗺️ Map Styles

| Style | Provider | Best For |
|-------|----------|----------|
| **Dark** | CartoDB | Night use, low-light shacks |
| **Satellite** | ESRI | Terrain visualization |
| **Terrain** | OpenTopoMap | SOTA operations |
| **Streets** | OpenStreetMap | Urban navigation |
| **Topo** | ESRI | Detailed terrain |
| **Ocean** | ESRI | Maritime operations |
| **NatGeo** | ESRI | Classic cartography |
| **Gray** | ESRI | Minimal, distraction-free |

---

## 🛠️ Development

```bash
# Clone and setup
git clone https://github.com/accius/openhamclock.git
cd openhamclock
npm install

# Start development server
npm run dev

# Run Electron in dev mode
npm run electron
```

### Project Structure

```
openhamclock/
├── public/             # Static web files
│   ├── index.html      # Main application
│   └── icons/          # App icons
├── electron/           # Electron main process
│   └── main.js         # Desktop app entry
├── dxspider-proxy/     # DX Cluster proxy service
│   ├── server.js       # Telnet-to-WebSocket proxy
│   ├── package.json    # Proxy dependencies
│   └── README.md       # Proxy documentation
├── iturhfprop-service/ # HF Propagation prediction service
│   ├── server.js       # ITU-R P.533 API wrapper
│   ├── Dockerfile      # Builds ITURHFProp engine
│   └── README.md       # Service documentation
├── scripts/            # Setup scripts
│   ├── setup-pi.sh     # Raspberry Pi setup
│   ├── setup-linux.sh
│   └── setup-windows.ps1
├── server.js           # Express server & API proxy
├── Dockerfile          # Container build
├── railway.toml        # Railway config
└── package.json
```

---

## 🤝 Contributing

We welcome contributions from the amateur radio community! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Priority Areas

1. **Satellite Tracking** - TLE parsing and pass predictions
2. **Rotator Control** - Hamlib integration
3. **Additional APIs** - QRZ, LoTW, ClubLog
4. **Accessibility** - Screen reader support, high contrast modes
5. **Translations** - Internationalization
6. **WebSocket DX Cluster** - Direct connection to DX Spider nodes

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Elwood Downey, WB0OEW** - Creator of the original HamClock. Your work inspired thousands of amateur radio operators worldwide. Rest in peace, OM. 🕊️
- **Leaflet.js** - Outstanding open-source mapping library
- **OpenStreetMap** - Community-driven map data
- **ESRI** - Satellite and specialty map tiles
- **NOAA Space Weather Prediction Center** - Space weather data
- **Parks on the Air (POTA)** - Activator spot API
- **Summits on the Air (SOTA)** - Summit spot API
- **The Amateur Radio Community** - For keeping the spirit of experimentation alive

---

## 📞 Contact

- **Email**: chris@cjhlighting.com
- **GitHub Issues**: [Report bugs or request features](https://github.com/accius/openhamclock/issues)
- **Discussions**: [Join the conversation](https://github.com/accius/openhamclock/discussions)

---

<div align="center">

**73 de K0CJH and the OpenHamClock contributors!**

*"The original HamClock will cease to function in June 2026. OpenHamClock carries forward Elwood's legacy with modern technology and open-source community development."*

</div>
