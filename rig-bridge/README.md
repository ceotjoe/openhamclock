# 📻 OpenHamClock Rig Bridge

**One download. One click. Your radio is connected.**

The Rig Bridge connects OpenHamClock directly to your radio via USB — no flrig, no rigctld, no complicated setup. Just plug in your radio, run the bridge, pick your COM port, and go.

Built on a **plugin architecture** — each radio integration is a standalone module, making it easy to add new integrations without touching existing code.

## Supported Radios

### Direct USB (Recommended)

| Brand       | Protocol | Tested Models                                       |
| ----------- | -------- | --------------------------------------------------- |
| **Yaesu**   | CAT      | FT-991A, FT-891, FT-710, FT-DX10, FT-DX101, FT-5000 |
| **Kenwood** | Kenwood  | TS-890, TS-590, TS-2000, TS-480                     |
| **Icom**    | CI-V     | IC-7300, IC-7610, IC-9700, IC-705, IC-7851          |

Also works with **Elecraft** radios (K3, K4, KX3, KX2) using the Kenwood plugin.

### SDR Radios via TCI (WebSocket)

TCI (Transceiver Control Interface) is a WebSocket-based protocol used by modern SDR applications. Unlike serial CAT, TCI **pushes** frequency, mode, and PTT changes in real-time — no polling, no serial port conflicts.

| Application   | Radios                | Default TCI Port |
| ------------- | --------------------- | ---------------- |
| **Thetis**    | Hermes Lite 2, ANAN   | 40001            |
| **ExpertSDR** | SunSDR2               | 40001            |
| **SmartSDR**  | Flex (via TCI bridge) | varies           |

### Via Control Software (Legacy)

| Software    | Protocol | Default Port |
| ----------- | -------- | ------------ |
| **flrig**   | XML-RPC  | 12345        |
| **rigctld** | TCP      | 4532         |

### rigctld Configuration

Edit `rig-bridge-config.json` (or use the setup UI at `http://localhost:5555`):

```json
{
  "radio": {
    "type": "rigctld",
    "rigctldHost": "127.0.0.1",
    "rigctldPort": 4532,
    "fixSplit": false
  }
}
```

| Field         | Description                                                | Default     |
| ------------- | ---------------------------------------------------------- | ----------- |
| `rigctldHost` | Host running rigctld                                       | `127.0.0.1` |
| `rigctldPort` | rigctld TCP port                                           | `4532`      |
| `fixSplit`    | Send `ST0` after each frequency change to reset split mode | `false`     |

**Yaesu split mode issue:** Radios using Hamlib's newcat backend (FT-991A, FT-DX10, FT-950, FT-891, etc.) may enter split mode whenever OpenHamClock sets the frequency. This is a Hamlib internals issue — the backend sends a TX-VFO-select CAT command while resolving the active VFO, which the radio interprets as activating split. Enable `fixSplit` to send `S 0 VFOA` after each frequency change to reset split automatically.

> **Permanent fix:** Start rigctld with `--set-conf=rig_vfo=1` to avoid VFO disambiguation entirely — this eliminates the side-effect without requiring `fixSplit`.

---

### For Testing (No Hardware Required)

| Type                | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| **Simulated Radio** | Fake radio that drifts through several bands — no serial port needed |

Enable by setting `radio.type = "mock"` in `rig-bridge-config.json` or selecting **Simulated Radio** in the setup UI.

---

## Quick Start

### Option A: Download the Executable (Easiest)

1. Download the right file for your OS from the Releases page
2. Double-click to run
3. Open **http://localhost:5555** in your browser
4. Select your radio type and COM port
5. Click **Save & Connect**
6. Copy the **API Token** from the Security card on the same page
7. In OpenHamClock → **Settings → Rig Control → API Token**, paste the token

### Option B: Run with Node.js

```bash
cd rig-bridge
npm install
node rig-bridge.js
```

Then open **http://localhost:5555** to configure.

**Options:**

```bash
node rig-bridge.js --port 8080   # Use a different port
node rig-bridge.js --debug       # Enable raw hex/ASCII CAT traffic logging
```

---

## Radio Setup Tips

### Yaesu FT-991A

1. Connect USB-B cable from radio to computer
2. On the radio: **Menu → Operation Setting → CAT Rate → 38400**
3. In Rig Bridge: Select **Yaesu**, pick your COM port, baud **38400**, stop bits **2**, and enable **Hardware Flow (RTS/CTS)**

**Using rigctld instead of direct USB?** See the [rigctld Configuration](#rigctld-configuration) section — enable **Fix split mode** in the setup UI (or set `fixSplit: true` in config) if the radio enters split mode on every frequency change.

### Icom IC-7300

1. Connect USB cable from radio to computer
2. On the radio: **Menu → Connectors → CI-V → CI-V USB Baud Rate → 115200**
3. In Rig Bridge: Select **Icom**, pick COM port, baud **115200**, stop bits **1**, address **0x94**

### Kenwood TS-590

1. Connect USB cable from radio to computer
2. In Rig Bridge: Select **Kenwood**, pick COM port, baud **9600**, stop bits **1**

### SDR Radios via TCI

#### 1. Enable TCI in your SDR application

**Thetis (HL2 / ANAN):** Setup → CAT Control → check **Enable TCI Server** (default port 40001)

**ExpertSDR:** Settings → TCI → Enable (default port 40001)

#### 2. Configure rig-bridge

Edit `rig-bridge-config.json`:

```json
{
  "radio": { "type": "tci" },
  "tci": {
    "host": "localhost",
    "port": 40001,
    "trx": 0,
    "vfo": 0
  }
}
```

| Field  | Description                      | Default     |
| ------ | -------------------------------- | ----------- |
| `host` | Host running the SDR application | `localhost` |
| `port` | TCI WebSocket port               | `40001`     |
| `trx`  | Transceiver index (0 = primary)  | `0`         |
| `vfo`  | VFO index (0 = VFO-A, 1 = VFO-B) | `0`         |

#### 3. Run rig-bridge

```bash
node rig-bridge.js
```

You should see:

```
[TCI] Connecting to ws://localhost:40001...
[TCI] ✅ Connected to ws://localhost:40001
[TCI] Device: Thetis
[TCI] Server ready
```

The bridge auto-reconnects every 5 s if the connection drops — just restart your SDR app and it will reconnect automatically.

---

## WSJT-X Relay

The WSJT-X Relay is an **integration plugin** (not a radio plugin) that listens for WSJT-X UDP packets on the local machine and forwards decoded messages to an OpenHamClock server in real-time. This lets OpenHamClock display your FT8/FT4 decodes as DX spots without any manual intervention.

### Setup

Edit `rig-bridge-config.json`:

```json
{
  "wsjtxRelay": {
    "enabled": true,
    "url": "https://openhamclock.com",
    "key": "your-relay-key",
    "session": "your-session-id",
    "udpPort": 2237,
    "batchInterval": 2000,
    "verbose": false,
    "multicast": false,
    "multicastGroup": "224.0.0.1",
    "multicastInterface": ""
  }
}
```

| Field                | Description                                                                                              | Default              |
| -------------------- | -------------------------------------------------------------------------------------------------------- | -------------------- |
| `enabled`            | Activate the relay on startup                                                                            | `false`              |
| `url`                | OpenHamClock server URL                                                                                  | `""`                 |
| `key`                | Relay authentication key (from your OHC account)                                                         | —                    |
| `session`            | Browser session ID for per-user isolation                                                                | —                    |
| `udpPort`            | UDP port WSJT-X is sending to                                                                            | `2237`               |
| `batchInterval`      | How often decoded messages are sent (ms)                                                                 | `2000`               |
| `verbose`            | Log every decoded message to the console                                                                 | `false`              |
| `multicast`          | Join a UDP multicast group to receive WSJT-X packets                                                     | `false`              |
| `multicastGroup`     | Multicast group IP address to join                                                                       | `224.0.0.1`          |
| `multicastInterface` | Local NIC IP for multi-homed systems; `""` = OS default                                                  | `""`                 |
| `udpBindAddress`     | UDP bind address. Set to `"0.0.0.0"` if WSJT-X runs on a different machine (unicast, non-multicast only) | `""` (→ `127.0.0.1`) |

### In WSJT-X

Make sure WSJT-X is configured to send UDP packets to `localhost` on the same port as `udpPort` (default `2237`):
**File → Settings → Reporting → UDP Server → `127.0.0.1:2237`**

The relay runs alongside your radio plugin — you can use direct USB or TCI at the same time.

### Multicast Mode

By default the relay uses **unicast** — WSJT-X sends packets directly to `127.0.0.1` and only this process receives them.

If you want multiple applications on the same machine or LAN to receive WSJT-X packets simultaneously, enable multicast:

1. In WSJT-X: **File → Settings → Reporting → UDP Server** — set the address to `224.0.0.1`
2. In `rig-bridge-config.json` (or via the setup UI at `http://localhost:5555`):

```json
{
  "wsjtxRelay": {
    "multicast": true,
    "multicastGroup": "224.0.0.1",
    "multicastInterface": ""
  }
}
```

Leave `multicastInterface` blank unless you have multiple network adapters and need to specify which one to use (enter its local IP, e.g. `"192.168.1.100"`).

> `224.0.0.1` is the WSJT-X conventional multicast group. It is link-local — packets are not routed across subnet boundaries.

---

## OpenHamClock Setup

Once the bridge is running and showing your frequency:

1. Open **OpenHamClock** → **Settings** → **Station Settings**
2. Scroll to **Rig Control**
3. Check **Enable Rig Control**
4. Set Host URL: `http://localhost:5555`
5. Paste the **API Token** shown in the **Security** card at `http://localhost:5555` into the **API Token** field
6. Click any DX spot, POTA, or SOTA to tune your radio!

---

## Configuration Reference

All settings live in `rig-bridge-config.json` in the same folder as the executable. The file is created automatically on first run by copying `rig-bridge-config.example.json`. You can edit it manually or use the setup UI at `http://localhost:5555`.

> **Do not set `apiToken` or `tokenDisplayed` manually** — both are managed automatically by rig-bridge.

### Server settings (top-level)

| Field         | Description                                                                                                                                                                                                                                                                      | Default       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `port`        | HTTP server port. **Requires a restart to take effect.**                                                                                                                                                                                                                         | `5555`        |
| `bindAddress` | Address the HTTP server binds to. Set to `"0.0.0.0"` for LAN access (e.g. bridge on a Pi, OHC on a desktop).                                                                                                                                                                     | `"127.0.0.1"` |
| `corsOrigins` | Extra browser origins allowed to call the API, comma-separated. The built-in whitelist (`openhamclock.com`, `localhost`) is always included. Only needed if OHC runs at a custom domain or on a different machine. Example: `"https://ohc.example.com,http://192.168.1.10:3000"` | `""`          |
| `debug`       | Log raw CAT traffic (hex/ASCII) to the console. Also enabled at launch with the `--debug` CLI flag.                                                                                                                                                                              | `false`       |
| `logging`     | Capture console output and stream it to the setup UI log tab. Can be toggled at runtime without a restart.                                                                                                                                                                       | `true`        |

### `radio` section

Common to all radio types:

| Field          | Description                                                                                                                           | Default  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `type`         | Radio plugin. One of: `none` · `yaesu` · `kenwood` · `icom` · `flrig` · `rigctld` · `tci` · `mock`                                    | `"none"` |
| `pollInterval` | How often to poll the radio for state (ms). Applies to rigctld, flrig, Kenwood, and Icom. Yaesu uses auto-info push and ignores this. | `500`    |
| `pttEnabled`   | Allow rig-bridge to send PTT commands.                                                                                                | `false`  |

Serial port — USB CAT (`yaesu` · `kenwood` · `icom`):

| Field        | Description                                                                                                      | Default  |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | -------- |
| `serialPort` | Serial port path — e.g. `"COM3"`, `"/dev/ttyUSB0"`, `"/dev/cu.usbserial-…"`                                      | `""`     |
| `baudRate`   | CAT baud rate. Must match the radio's setting.                                                                   | `38400`  |
| `dataBits`   | Serial data bits. Rarely needs changing.                                                                         | `8`      |
| `stopBits`   | Serial stop bits. Yaesu and many others require `2`.                                                             | `2`      |
| `parity`     | Serial parity. One of: `none` · `even` · `odd` · `mark` · `space`                                                | `"none"` |
| `dtr`        | Assert the DTR pin on open. Keeps the CAT level-converter powered. Disable only if it causes hardware conflicts. | `true`   |
| `rtscts`     | Enable hardware flow control (RTS/CTS). Required for some Yaesu models (FT-991A, FT-710) via certain adapters.   | `false`  |

Icom CI-V (`icom` only):

| Field         | Description                                                                        | Default  |
| ------------- | ---------------------------------------------------------------------------------- | -------- |
| `icomAddress` | CI-V address. IC-7300: `0x94` · IC-7610: `0x98` · IC-9700: `0xA2` · IC-705: `0xA4` | `"0x94"` |

rigctld (`rigctld` only) — see also [rigctld Configuration](#rigctld-configuration):

| Field         | Description                                                                      | Default       |
| ------------- | -------------------------------------------------------------------------------- | ------------- |
| `rigctldHost` | Host running rigctld.                                                            | `"127.0.0.1"` |
| `rigctldPort` | rigctld TCP port.                                                                | `4532`        |
| `fixSplit`    | Send `S 0 VFOA` after each frequency change to prevent Hamlib split-mode glitch. | `false`       |

flrig (`flrig` only):

| Field       | Description         | Default       |
| ----------- | ------------------- | ------------- |
| `flrigHost` | Host running flrig. | `"127.0.0.1"` |
| `flrigPort` | flrig XML-RPC port. | `12345`       |

### `tci` section

See [SDR Radios via TCI](#sdr-radios-via-tci-websocket) for the full `tci.*` reference.

### `wsjtxRelay` section

See [WSJT-X Relay](#wsjt-x-relay) for the full `wsjtxRelay.*` reference.

---

## Building Executables

To create standalone executables (no Node.js required):

```bash
npm install
npm run build:win        # Windows .exe
npm run build:mac        # macOS (Intel)
npm run build:mac-arm    # macOS (Apple Silicon)
npm run build:linux      # Linux x64
npm run build:linux-arm  # Linux ARM (Raspberry Pi)
npm run build:all        # All platforms
```

Executables are output to the `dist/` folder.

---

## Troubleshooting

| Problem                              | Solution                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No COM ports found                   | Install USB driver (Silicon Labs CP210x for Yaesu, FTDI for some Kenwood)                                                                                   |
| Port opens but no data               | Check baud rate matches radio's CAT Rate setting                                                                                                            |
| Icom not responding                  | Verify CI-V address matches your radio model                                                                                                                |
| 401 Unauthorized errors              | Copy the API Token from http://localhost:5555 (Security card) and paste into OHC → Settings → Rig Control → API Token                                       |
| WSJT-X relay not receiving (unicast) | WSJT-X must run on the same machine. In WSJT-X set UDP Server to `127.0.0.1`. For remote WSJT-X, enable multicast instead                                   |
| Port already in use                  | Close flrig/rigctld if running — you don't need them anymore                                                                                                |
| PTT not responsive                   | Enable **Hardware Flow (RTS/CTS)** (especially for FT-991A/FT-710)                                                                                          |
| rigctld: split mode activates        | Enable **Fix split mode** in the setup UI (or set `radio.fixSplit: true` in config). Permanent fix: start rigctld with `--set-conf=rig_vfo=1`               |
| macOS Comms Failure                  | The bridge automatically applies a `stty` fix for CP210x drivers.                                                                                           |
| TCI: Connection refused              | Enable TCI in your SDR app (Thetis → Setup → CAT Control → Enable TCI Server)                                                                               |
| TCI: No frequency updates            | Check `trx` / `vfo` index in config match the active transceiver in your SDR app                                                                            |
| TCI: Remote SDR                      | Set `tci.host` to the IP of the machine running the SDR application                                                                                         |
| Multicast: no packets                | Verify `multicastGroup` matches what WSJT-X sends to; check OS firewall allows multicast UDP; set `multicastInterface` to the correct NIC IP if multi-homed |

---

## API Reference

Fully backward compatible with the original rig-daemon API:

| Method | Endpoint                | Auth | Description                                      |
| ------ | ----------------------- | ---- | ------------------------------------------------ |
| GET    | `/status`               |      | Current freq, mode, PTT, connected status        |
| GET    | `/stream`               |      | SSE stream of real-time rig state updates        |
| POST   | `/freq`                 | 🔐   | Set frequency: `{ "freq": 14074000 }`            |
| POST   | `/mode`                 | 🔐   | Set mode: `{ "mode": "USB" }`                    |
| POST   | `/ptt`                  | 🔐   | Set PTT: `{ "ptt": true }`                       |
| GET    | `/api/ports`            | 🔐   | List available serial ports                      |
| GET    | `/api/config`           |      | Get current configuration (token field excluded) |
| POST   | `/api/config`           | 🔐   | Update configuration & reconnect                 |
| POST   | `/api/test`             | 🔐   | Test a serial port connection                    |
| GET    | `/api/token`            |      | Returns `{ tokenSet: bool, apiToken: string }`   |
| POST   | `/api/token/regenerate` | 🔐   | Generate a new API token                         |
| GET    | `/api/log/stream`       | †    | SSE stream of console log output (setup UI)      |

**🔐 Authentication:** Protected endpoints require the `X-RigBridge-Token: <token>` header.
Find your token at `http://localhost:5555` (Security card). Auth is only enforced when a token is set in config (see Security section below).

**† `/api/log/stream`:** `EventSource` cannot send custom headers. Pass the token as a query parameter instead: `/api/log/stream?token=<token>`.

## Setup UI Access

The setup page at `http://localhost:5555` is protected by a login gate. You need your API token to access it.

### First run / new install

On first start, rig-bridge auto-generates an API token and opens the setup page directly — no login required. A welcome banner displays your token:

1. Click **📋 Copy** to copy the token
2. Paste it into **OpenHamClock → Settings → Rig Control → API Token**
3. Click **Dismiss** — the login gate activates for all future visits

The token is also printed to the terminal on startup and stored in `rig-bridge-config.json`.

### Returning visits

The browser stores the token in `localStorage` after first login. Subsequent visits authenticate silently — the setup page loads without a login prompt.

### Logging in on a new browser

Enter your API token from one of these sources:

- Terminal output from when rig-bridge last started
- `rig-bridge-config.json` → `"apiToken"` field
- The **Security** card on the setup page (if logged in on another browser)

### Token regeneration

When you regenerate the token via the Security card, the welcome banner reappears with the new token. The old stored session is immediately invalidated.

### Upgrading from a version without a token

On first start after upgrade, a new token is generated and the welcome banner is shown — same experience as a fresh install.

---

## Security

rig-bridge is designed to run locally and defaults to a secure configuration:

- **Localhost-only binding** — the HTTP server binds to `127.0.0.1` by default. Set `bindAddress: "0.0.0.0"` in `rig-bridge-config.json` only if you need LAN access (e.g. bridge on a Pi, browser on a desktop).
- **Restricted CORS** — only `openhamclock.com` and `localhost` origins are allowed.
- **API Token** — write endpoints (`/ptt`, `/freq`, `/mode`, `/api/config`, `/api/ports`) require an `X-RigBridge-Token` header. A token is auto-generated on first run and shown at `http://localhost:5555`. The token is excluded from the `GET /api/config` response; use `GET /api/token` to retrieve it.
- **Rate limiting** — PTT, freq, and mode endpoints are rate-limited to prevent hardware damage from runaway clients.
- **Input validation** — serial port paths, plugin host values, frequencies, and port numbers are validated before use.
- **SSE log stream** — `GET /api/log/stream` (setup UI only) requires `?token=<token>` as a query parameter since `EventSource` cannot send custom headers.
- **WSJT-X UDP** — the UDP listener binds to `127.0.0.1` by default (loopback-only). Set `wsjtxRelay.udpBindAddress: "0.0.0.0"` if WSJT-X runs on a separate machine and multicast is not an option.

---

## Project Structure

```
rig-bridge/
├── rig-bridge.js          # Entry point — thin orchestrator
│
├── core/
│   ├── config.js          # Config load/save, defaults, CLI args
│   ├── state.js           # Shared rig state + SSE broadcast
│   ├── server.js          # Express HTTP server + all API routes
│   ├── plugin-registry.js # Plugin lifecycle manager + dispatcher
│   └── serial-utils.js    # Shared serial port helpers
│
└── plugins/
    ├── usb/
    │   ├── index.js            # USB serial lifecycle (open, reconnect, poll)
    │   ├── protocol-yaesu.js   # Yaesu CAT ASCII protocol
    │   ├── protocol-kenwood.js # Kenwood ASCII protocol
    │   └── protocol-icom.js    # Icom CI-V binary protocol
    ├── tci.js             # TCI/SDR WebSocket plugin (Thetis, ExpertSDR, etc.)
    ├── rigctld.js         # rigctld TCP plugin
    ├── flrig.js           # flrig XML-RPC plugin
    ├── mock.js            # Simulated radio for testing (no hardware needed)
    └── wsjtx-relay.js     # WSJT-X UDP listener → OpenHamClock relay
```

---

## Writing a Plugin

Each plugin exports an object with the following shape:

```js
module.exports = {
  id: 'my-plugin', // Unique identifier (matches config.radio.type)
  name: 'My Plugin', // Human-readable name
  category: 'rig', // 'rig' | 'integration' | 'rotator' | 'logger' | 'other'
  configKey: 'radio', // Which config section this plugin reads

  create(config, { updateState, state }) {
    return {
      connect() {
        /* open connection */
      },
      disconnect() {
        /* close connection */
      },

      // Rig category — implement these for radio control:
      setFreq(hz) {
        /* tune to frequency in Hz */
      },
      setMode(mode) {
        /* set mode string e.g. 'USB' */
      },
      setPTT(on) {
        /* key/unkey transmitter */
      },

      // Optional — register extra HTTP routes:
      // registerRoutes(app) { app.get('/my-plugin/...', handler) }
    };
  },
};
```

**Categories:**

- `rig` — radio control; the bridge dispatches `/freq`, `/mode`, `/ptt` to the active rig plugin
- `integration` — background service plugins (e.g. WSJT-X relay); started via `registry.connectIntegrations()`
- `rotator`, `logger`, `other` — use `registerRoutes(app)` to expose their own endpoints

To register a plugin at startup, call `registry.register(descriptor)` in `rig-bridge.js` before `registry.connectActive()`.
