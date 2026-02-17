# OpenHamClock Rig Control Daemon

This standalone Node.js service acts as a bridge between the OpenHamClock web application and your local radio control software. It exposes a simple HTTP JSON API that the frontend consumes.

> 📖 **New to Rig Control?** Check out the step-by-step [User Guide](./UserGuide.md) for easy setup instructions!

## Features

- **Unified API**: Abstracts differences between `rigctld` (HAMlib) and `flrig`.
- **Lightweight**: Minimal dependencies, runs anywhere Node.js runs.
- **PTT Support**: Can trigger PTT transmission.
- **Polling**: Automatically polls the radio for Frequency, Mode, and PTT status updates.
- **Auto-Tune**: Supports delayed antenna tuning commands (flrig only).

## Supported Backends

1.  **rigctld** (HAMlib): Uses the TCP text protocol (Default port 4532).
2.  **flrig**: Uses XML-RPC (Default port 12345).
3.  **flexradio**: Native FlexRadio SmartSDR API (Default port 4992).
4.  **tci**: TCI (Transceiver Control Interface) WebSocket protocol (Default port 50001).
5.  **mock**: Simulation mode (logs to console, no hardware needed).

## Installation

```bash
cd rig-control
npm install
```

## Configuration

Configuration is loaded from `rig-config.json`. On first run, this file is automatically created from `rig-config.json.example`:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 5555,
    "cors": "*"
  },
  "radio": {
    "type": "flrig", // Options: "rigctld" or "flrig"
    "host": "127.0.0.1",
    "port": 12345, // rigctld default: 4532, flrig default: 12345
    "pollInterval": 1000, // How often to poll the radio (ms)
    "pttEnabled": false // Set to true to allow PTT commands
  }
}
```

**Important:** Your `rig-config.json` customizations are preserved during updates. The file is excluded from git tracking, so your local changes won't be overwritten when pulling new versions.

### Configuration Options

- **server.host**: IP to bind to (default 0.0.0.0)
- **server.port**: Port to listen on (default 5555)
- **radio.type**: `rigctld` (Hamlib) or `flrig`
- **radio.host**: Hostname/IP of the rig control software
- **radio.port**: Port of the rig control software
- **radio.pttEnabled**: Set to `true` to allow PTT commands. Defaults to `false` for safety.

### Remote Access

By default, the daemon binds to `0.0.0.0`, meaning it is accessible from other machines on your network.

- **Firewall**: Ensure port `5555` is open.
- **Connect**: In OpenHamClock Settings, use the daemon's IP (e.g., `http://192.168.1.50:5555`).

### FlexRadio SmartSDR API

For Flex-6000 and Flex-8000 series radios, you can connect directly to the SmartSDR API without rigctld or flrig.

**Configuration:**
```json
{
  "radio": {
    "type": "flexradio",
    "host": "192.168.1.100",
    "port": 4992,
    "pttEnabled": true,
    "flexradio": {
      "slice": 0,
      "clientName": "OpenHamClock"
    }
  }
}
```

**Features:**
- Direct TCP/IP connection to radio
- Sub-second latency
- Real-time status updates
- Full slice control (8 independent VFOs)
- PTT support
- Automatic reconnection

**Requirements:**
- FlexRadio on same network
- SmartSDR running (creates API server)
- Port 4992 accessible

**Slice Selection:**
- Slice 0-7 (default: 0)
- Each slice is an independent VFO
- Choose the slice used by your operating software
- OpenHamClock will control only the selected slice

**Client Naming:**
- Set `clientName` to identify this connection in SmartSDR
- Helps distinguish between multiple API clients
- Default: "OpenHamClock"

### TCI (Transceiver Control Interface)

For Expert Electronics SDR software (ExpertSDR2/3) and other TCI-compatible transceivers.

**Configuration:**
```json
{
  "radio": {
    "type": "tci",
    "host": "127.0.0.1",
    "port": 50001,
    "pttEnabled": true,
    "tci": {
      "trx": 0,
      "vfo": 0,
      "clientName": "OpenHamClock"
    }
  }
}
```

**Features:**
- WebSocket connection (ws://host:port)
- Real-time bidirectional control
- Push notifications (no polling needed)
- Multi-client support
- TRX/VFO selection
- Automatic reconnection

**Requirements:**
- ExpertSDR2/3 running with TCI enabled
- Port 50001 accessible (default)
- TCI protocol version 1.9+

**TRX/VFO Selection:**
- TRX 0-N (transceiver/receiver index)
- VFO 0-1 (VFO A/B)
- OpenHamClock controls only selected TRX/VFO
- Choose the TRX/VFO used by your operating software

**Client Naming:**
- Set `clientName` to identify this connection in ExpertSDR
- Helps distinguish between multiple API clients
- Default: "OpenHamClock"

## Usage

### Start with Config File (Recommended)

```bash
node rig-daemon.js
```

### Start with CLI Arguments (Overrides Config)

You can override specific settings using CLI flags:

**For rigctld (Default port 4532):**

```bash
node rig-daemon.js --type rigctld --rig-port 4532
```

**For flrig (Default port 12345):**

```bash
node rig-daemon.js --type flrig
```

**For FlexRadio SmartSDR API:**

```bash
node rig-daemon.js --type flexradio --rig-host 192.168.1.100 --rig-port 4992
```

**For TCI (Expert Electronics SDR):**

```bash
node rig-daemon.js --type tci --rig-host 127.0.0.1 --rig-port 50001
```

**For Simulation Mode:**

```bash
node rig-daemon.js --type mock
```

## API Endpoints

The daemon listens on port `5555` (configurable) and provides the following endpoints:

| Method | Endpoint  | Description                                                         |
| :----- | :-------- | :------------------------------------------------------------------ |
| `GET`  | `/status` | Returns JSON object with `freq`, `mode`, `ptt`, `connected` status. |
| `POST` | `/freq`   | Sets frequency. Body: `{ "freq": 14074000, "tune": true }` (Hz)     |
| `POST` | `/mode`   | Sets mode. Body: `{ "mode": "USB" }`                                |
| `POST` | `/ptt`    | Sets PTT. Body: `{ "ptt": true }`                                   |

## Troubleshooting

- **Check Connection**: Ensure `rigctld` or `flrig` is running and accessible.
- **CORS Errors**: The daemon enables CORS for all origins by default (`*`) to allow local development.
- **Port Conflicts**: If port 5555 is in use, change `server.port` in `rig-config.json`.

### Mixed Content Issues (HTTPS → HTTP)

**Problem:** If OpenHamClock is accessed via **HTTPS** (e.g., `https://yourdomain.com` or `https://localhost:3000`), browsers will block HTTP requests to the rig daemon (`http://localhost:5555`) due to **Mixed Content** security policies.

**Browser Behavior:**

| Browser | Behavior | Workaround |
|---------|----------|------------|
| **Safari (macOS/iOS)** | ❌ **Strictly blocks** all mixed content. No override option. | Must use proxy solution (see below) |
| **Chrome** | ⚠️ Blocks by default. Shows shield icon in address bar to allow insecure content. | Click shield icon → "Load unsafe scripts" |
| **Firefox** | ⚠️ Blocks by default. Shows shield icon in address bar. | Click shield icon → "Disable protection for this session" |
| **Edge** | ⚠️ Blocks by default. Similar to Chrome. | Click shield icon → Allow |

**Solutions:**

1. **Use HTTP for OpenHamClock** (Development only):
   ```bash
   # Access via http://localhost:3000 instead of https://
   ```
   ⚠️ Not recommended for production/remote access.

2. **Use the Internal Proxy** (Recommended):
   - OpenHamClock can proxy rig daemon requests through its main HTTPS server
   - In Settings → Rig Control, enable "Use Internal Proxy"
   - This routes all rig control through the same HTTPS origin
   - Works on all browsers including Safari

3. **Run Rig Daemon with HTTPS** (Advanced):
   - Configure the rig daemon to use SSL/TLS certificates
   - Requires self-signed cert setup and browser trust configuration
   - Not recommended for local-only setups

**Recommendation:** For remote/HTTPS deployments, use the **Internal Proxy** feature in OpenHamClock Settings. For local development over HTTP, direct connection works fine.


## Experimental Scripts

The `scripts/` folder contains experimental installation and utility scripts. These are currently **in testing** and may not function properly on all systems. Use them with caution.
