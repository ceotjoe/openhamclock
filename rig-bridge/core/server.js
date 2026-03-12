'use strict';
/**
 * server.js — Express HTTP server, all API routes, SSE endpoint, and live log
 *
 * Exposes the openhamclock-compatible API:
 *   GET  /             Setup UI (HTML) or JSON health check
 *   GET  /status       Current rig state snapshot
 *   GET  /stream       SSE stream for real-time state updates
 *   POST /freq         Set frequency  { freq: Hz }
 *   POST /mode         Set mode       { mode: string }
 *   POST /ptt          Set PTT        { ptt: boolean }
 *   GET  /api/ports    List available serial ports
 *   GET  /api/config   Get current config
 *   POST /api/config   Update config and reconnect
 *   POST /api/test     Test a serial port connection
 *   GET  /api/log/stream  SSE stream of live console log output
 *   GET  /api/logging     Get console logging enabled state
 *   POST /api/logging     Enable or disable console log capture { logging: bool }
 */

const express = require('express');
const cors = require('cors');
const { getSerialPort, listPorts } = require('./serial-utils');
const { state, addSseClient, removeSseClient } = require('./state');
const { config, saveConfig } = require('./config');

// ─── Console log interceptor ───────────────────────────────────────────────
// Wraps console.log/warn/error so every line is buffered and broadcast
// to connected SSE log clients in addition to the normal stdout output.

const LOG_BUFFER_MAX = 200; // lines kept in memory for late-joining clients
const logBuffer = []; // { ts, level, text }
let logSseClients = []; // { id, res }

function broadcastLog(entry) {
  // Named SSE event "line" so the browser can use addEventListener('line', ...)
  const msg = `event: line\ndata: ${JSON.stringify(entry)}\n\n`;
  logSseClients.forEach((c) => c.res.write(msg));
}

function pushLog(level, args) {
  if (!config.logging) return; // logging disabled — skip capture & broadcast
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const entry = { ts: Date.now(), level, text };
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
  broadcastLog(entry);
}

// Patch console — keep originals for actual stdout output
const _log = console.log.bind(console);
const _warn = console.warn.bind(console);
const _error = console.error.bind(console);

console.log = (...args) => {
  _log(...args);
  pushLog('log', args);
};
console.warn = (...args) => {
  _warn(...args);
  pushLog('warn', args);
};
console.error = (...args) => {
  _error(...args);
  pushLog('error', args);
};

// ──────────────────────────────────────────────────────────────────────────

function buildSetupHtml(version) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenHamClock Rig Bridge v${version}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #0a0e14;
      color: #c4c9d4;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 30px 15px;
    }
    .container { max-width: 600px; width: 100%; }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 24px;
      color: #00ffcc;
      margin-bottom: 6px;
    }
    .header .subtitle {
      font-size: 13px;
      color: #6b7280;
    }
    .status-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 12px;
      background: #111620;
      border: 1px solid #1e2530;
      border-radius: 8px;
      margin-bottom: 20px;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 13px;
    }
    .status-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      background: #ef4444;
    }
    .status-dot.connected { background: #22c55e; }
    .status-freq { color: #00ffcc; font-size: 16px; font-weight: 700; }
    .status-mode { color: #f59e0b; }

    /* ── Tabs ── */
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 16px;
      border-bottom: 1px solid #1e2530;
      padding-bottom: 0;
    }
    .tab-btn {
      padding: 8px 18px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #6b7280;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: -1px;
      transition: color 0.15s, border-color 0.15s;
    }
    .tab-btn:hover { color: #c4c9d4; }
    .tab-btn.active { color: #00ffcc; border-bottom-color: #00ffcc; }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }

    /* ── Config tab ── */
    .card {
      background: #111620;
      border: 1px solid #1e2530;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 14px;
      font-weight: 700;
      color: #f59e0b;
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    label {
      display: block;
      font-size: 12px;
      color: #8b95a5;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    select, input[type="number"], input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      background: #0a0e14;
      border: 1px solid #2a3040;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 14px;
      font-family: inherit;
      margin-bottom: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    select:focus, input:focus { border-color: #00ffcc; }
    .row { display: flex; gap: 12px; }
    .row > div { flex: 1; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
    }
    .btn-primary { background: #00ffcc; color: #0a0e14; }
    .btn-primary:hover { background: #00e6b8; }
    .btn-secondary {
      background: #1e2530;
      color: #c4c9d4;
      border: 1px solid #2a3040;
    }
    .btn-secondary:hover { background: #2a3040; }
    .btn-row { display: flex; gap: 10px; margin-top: 8px; }
    .btn-row .btn { flex: 1; }
    .toast {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      padding: 10px 20px; border-radius: 6px; font-size: 13px;
      opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 1000;
    }
    .toast.show { opacity: 1; }
    .toast.success { background: #166534; color: #bbf7d0; }
    .toast.error { background: #991b1b; color: #fecaca; }
    .help-text {
      font-size: 11px;
      color: #4b5563;
      margin-top: -8px;
      margin-bottom: 14px;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
    }
    .checkbox-row input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
    .checkbox-row span { font-size: 13px; color: #c4c9d4; }
    .serial-opts { display: none; }
    .serial-opts.show { display: block; }
    .legacy-opts { display: none; }
    .legacy-opts.show { display: block; }
    .section-divider {
      border-top: 1px solid #1e2530;
      margin: 16px 0;
      padding-top: 16px;
    }
    .icom-addr { display: none; }
    .icom-addr.show { display: block; }
    .tci-opts { display: none; }
    .tci-opts.show { display: block; }
    .rigctld-opts { display: none; }
    .rigctld-opts.show { display: block; }

    /* ── Login gate ── */
    .login-overlay {
      position: fixed; inset: 0; background: #0a0e14;
      display: none; align-items: center; justify-content: center;
      z-index: 9999; padding: 20px;
    }
    .login-box {
      background: #111620; border: 1px solid #1e2530;
      border-radius: 12px; padding: 32px; width: 100%; max-width: 400px;
      text-align: center;
    }
    .login-box h2 { color: #00ffcc; font-size: 20px; margin-bottom: 8px; }
    .login-sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
    .login-input-row { position: relative; margin-bottom: 8px; }
    .login-input-row input {
      width: 100%; padding: 10px 42px 10px 12px;
      background: #0a0e14; border: 1px solid #2a3040; border-radius: 6px;
      color: #e2e8f0; font-size: 14px; font-family: monospace;
      outline: none; transition: border-color 0.2s; margin-bottom: 0;
    }
    .login-input-row input:focus { border-color: #00ffcc; }
    .login-eye {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: #6b7280; cursor: pointer; font-size: 16px;
    }
    .login-error { color: #f87171; font-size: 12px; min-height: 18px; margin-bottom: 12px; text-align: left; }
    .login-hint {
      margin-top: 20px; font-size: 11px; color: #4b5563; text-align: left;
      border-top: 1px solid #1e2530; padding-top: 14px; line-height: 1.7;
    }
    .login-hint strong { color: #6b7280; }
    .login-hint code { background: #1a1f2a; padding: 1px 5px; border-radius: 3px; color: #f59e0b; font-family: monospace; }
    @keyframes loginShake {
      0%,100% { transform: translateX(0); }
      20%,60% { transform: translateX(-6px); }
      40%,80% { transform: translateX(6px); }
    }
    .login-box.shake { animation: loginShake 0.4s ease; }

    /* ── Welcome banner ── */
    .welcome-banner {
      background: #0f1923; border: 1px solid #00ffcc44;
      border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; display: none;
    }
    .welcome-banner.show { display: block; }
    .wb-title { color: #00ffcc; font-size: 14px; font-weight: 700; margin-bottom: 6px; }
    .wb-sub { color: #8b95a5; font-size: 12px; margin-bottom: 12px; line-height: 1.5; }
    .welcome-token-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .welcome-token-row input {
      flex: 1; background: #0a0e14; border: 1px solid #2a3040;
      border-radius: 6px; color: #00ffcc; font-family: monospace;
      font-size: 12px; padding: 8px 10px; outline: none; margin-bottom: 0;
    }
    .welcome-token-row .btn { width: auto; padding: 8px 14px; font-size: 12px; }
    .wb-dismiss {
      font-size: 12px; color: #6b7280; cursor: pointer;
      background: none; border: none; padding: 0; text-decoration: underline;
    }
    .wb-dismiss:hover { color: #c4c9d4; }

    /* ── Logout link ── */
    .logout-link {
      font-size: 11px; color: #4b5563; cursor: pointer;
      background: none; border: none; padding: 0; text-decoration: underline;
      display: inline-block; margin-top: 4px;
    }
    .logout-link:hover { color: #9ca3af; }

    .ohc-instructions {
      background: #0f1923;
      border: 1px dashed #2a3040;
      border-radius: 8px;
      padding: 16px;
      margin-top: 20px;
      font-size: 13px;
      line-height: 1.6;
    }
    .ohc-instructions strong { color: #00ffcc; }
    .ohc-instructions code {
      background: #1a1f2a;
      padding: 2px 6px;
      border-radius: 3px;
      color: #f59e0b;
      font-family: monospace;
    }

    /* ── Console Log tab ── */
    .log-toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .log-toolbar .log-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: opacity 0.15s;
    }
    .log-badge.active { opacity: 1; }
    .log-badge.inactive { opacity: 0.35; }
    .log-badge.lvl-log { background: #1e2d1e; color: #86efac; border-color: #166534; }
    .log-badge.lvl-warn { background: #2d2210; color: #fcd34d; border-color: #92400e; }
    .log-badge.lvl-error { background: #2d1010; color: #fca5a5; border-color: #991b1b; }
    .log-scroll-wrap {
      background: #060a0f;
      border: 1px solid #1e2530;
      border-radius: 8px;
      height: 420px;
      overflow-y: auto;
      padding: 10px 12px;
      font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.6;
    }
    .log-line {
      display: flex;
      gap: 10px;
      padding: 1px 0;
      border-bottom: 1px solid #0d1117;
    }
    .log-line:last-child { border-bottom: none; }
    .log-ts {
      color: #374151;
      white-space: nowrap;
      flex-shrink: 0;
      user-select: none;
    }
    .log-text { color: #9ca3af; word-break: break-all; flex: 1; }
    .log-line.lvl-log .log-text { color: #9ca3af; }
    .log-line.lvl-warn .log-text { color: #fcd34d; }
    .log-line.lvl-error .log-text { color: #fca5a5; }
    .log-empty {
      color: #374151;
      text-align: center;
      padding: 40px 0;
      font-style: italic;
    }
    .log-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      font-size: 11px;
      color: #374151;
    }
    .log-footer .log-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .log-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #374151;
    }
    .log-dot.live { background: #22c55e; animation: pulse 1.5s infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    @media (max-width: 500px) {
      .row { flex-direction: column; gap: 0; }
    }
    .page-footer {
      margin-top: 28px;
      text-align: center;
      font-size: 11px;
      color: #374151;
    }
    .page-footer a { color: #374151; text-decoration: none; }
    .page-footer a:hover { color: #6b7280; }
  </style>
</head>
<body>

  <!-- Login gate — shown when no valid session is stored in localStorage -->
  <div class="login-overlay" id="loginOverlay">
    <div class="login-box" id="loginBox">
      <h2>🔐 rig-bridge Setup</h2>
      <div class="login-sub">Enter your API token to continue</div>
      <div class="login-input-row">
        <input type="password" id="loginToken" placeholder="Paste your API token…"
               autocomplete="off" onkeydown="if(event.key==='Enter')doLogin()">
        <button class="login-eye" id="loginEye" onclick="toggleLoginEye()" title="Show/hide">👁</button>
      </div>
      <div class="login-error" id="loginError"></div>
      <button class="btn btn-primary" onclick="doLogin()">Unlock Setup</button>
      <div class="login-hint">
        <strong>First time?</strong> Find your token in:<br>
        • Terminal output when rig-bridge started<br>
        • <code>rig-bridge-config.json</code> → <code>"apiToken"</code> field
      </div>
    </div>
  </div>

  <div class="container">
    <!-- First-run / token-regenerated welcome banner -->
    <div class="welcome-banner" id="welcomeBanner">
      <div class="wb-title">🎉 Welcome to rig-bridge!</div>
      <div class="wb-sub">
        Your API token has been generated. Copy it and paste it into<br>
        <strong>OpenHamClock → Settings → Rig Control → API Token</strong>
      </div>
      <div class="welcome-token-row">
        <input type="text" id="welcomeToken" readonly>
        <button class="btn btn-secondary" onclick="copyWelcomeToken()">📋 Copy</button>
      </div>
      <button class="wb-dismiss" onclick="dismissWelcomeBanner()">Dismiss</button>
    </div>

    <div class="header">
      <h1>📻 OpenHamClock Rig Bridge</h1>
      <div class="subtitle">Direct USB connection to your radio — no flrig or rigctld needed</div>
      <button class="logout-link" onclick="logout()" title="Clear saved session and show login screen">Logout</button>
    </div>

    <!-- Live Status -->
    <div class="status-bar" id="statusBar">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusLabel">Disconnected</span>
      <span class="status-freq" id="statusFreq">—</span>
      <span class="status-mode" id="statusMode"></span>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('radio', this)">📻 Radio</button>
      <button class="tab-btn" onclick="switchTab('integrations', this)">🔌 Integrations</button>
      <button class="tab-btn" onclick="switchTab('log', this)">🖥️ Console Log</button>
    </div>

    <!-- ══ Tab: Radio ══ -->
    <div class="tab-panel active" id="tab-radio">
      <div class="card">
        <div class="card-title">⚡ Radio Connection</div>

        <label>Radio Type</label>
        <select id="radioType" onchange="onTypeChange()">
          <option value="none">— Select your radio —</option>
          <optgroup label="Direct USB (Recommended)">
            <option value="yaesu">Yaesu (FT-991A, FT-891, FT-710, FT-DX10, etc.)</option>
            <option value="kenwood">Kenwood (TS-890, TS-590, TS-2000, etc.)</option>
            <option value="icom">Icom (IC-7300, IC-7610, IC-9700, IC-705, etc.)</option>
          </optgroup>
          <optgroup label="SDR Radios (TCI)">
            <option value="tci">TCI/SDR (Thetis, ExpertSDR, SunSDR2, etc.)</option>
          </optgroup>
          <optgroup label="Via Control Software (Legacy)">
            <option value="flrig">flrig (XML-RPC)</option>
            <option value="rigctld">rigctld / Hamlib (TCP)</option>
          </optgroup>
          <optgroup label="Development">
            <option value="mock">Simulated Radio (Mock)</option>
          </optgroup>
        </select>

        <!-- Serial options (Yaesu/Kenwood/Icom) -->
        <div class="serial-opts" id="serialOpts">
          <label>Serial Port</label>
          <div style="display: flex; gap: 8px; margin-bottom: 14px;">
            <select id="serialPort" style="flex: 1; margin-bottom: 0;"></select>
            <button class="btn btn-secondary" onclick="refreshPorts()" style="width: auto; padding: 8px 14px;">🔄 Scan</button>
          </div>

          <div class="row">
            <div>
              <label>Baud Rate</label>
              <select id="baudRate">
                <option value="4800">4800</option>
                <option value="9600">9600</option>
                <option value="19200">19200</option>
                <option value="38400" selected>38400</option>
                <option value="57600">57600</option>
                <option value="115200">115200</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div>
              <label>Stop Bits</label>
              <select id="stopBits">
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <div style="display: flex; align-items: flex-end; padding-bottom: 14px;">
              <div class="checkbox-row" style="margin-bottom: 0;">
                <input type="checkbox" id="rtscts">
                <span>Hardware Flow (RTS/CTS)</span>
              </div>
            </div>
          </div>
          <div class="help-text">Yaesu default: 38400 baud, 2 stop bits. Match your radio's CAT Rate setting.</div>

          <div class="icom-addr" id="icomAddr">
            <label>CI-V Address</label>
            <input type="text" id="icomAddress" value="0x94" placeholder="0x94">
            <div class="help-text">IC-7300: 0x94 · IC-7610: 0x98 · IC-9700: 0xA2 · IC-705: 0xA4</div>
          </div>
        </div>

        <!-- Legacy options (flrig/rigctld) -->
        <div class="legacy-opts" id="legacyOpts">
          <div class="row">
            <div>
              <label>Host</label>
              <input type="text" id="legacyHost" value="127.0.0.1">
            </div>
            <div>
              <label>Port</label>
              <input type="number" id="legacyPort" value="12345">
            </div>
          </div>
        </div>

        <!-- rigctld-only options -->
        <div class="rigctld-opts" id="rigctldOpts">
          <div class="checkbox-row">
            <input type="checkbox" id="fixSplit">
            <span>Fix split mode (Yaesu newcat / FT-991A)</span>
          </div>
          <div class="help-text">Send ST0 after each frequency change to prevent Hamlib from accidentally activating split mode. Enable if your radio enters split mode whenever OpenHamClock changes frequency.</div>
        </div>

        <!-- TCI/SDR options -->
        <div class="tci-opts" id="tciOpts">
          <div class="row">
            <div>
              <label>TCI Host</label>
              <input type="text" id="tciHost" value="localhost" placeholder="localhost">
            </div>
            <div>
              <label>TCI Port</label>
              <input type="number" id="tciPort" value="40001" placeholder="40001" min="1" max="65535">
            </div>
          </div>
          <div class="row">
            <div>
              <label>Transceiver (TRX)</label>
              <input type="number" id="tciTrx" value="0" min="0" max="7" placeholder="0">
            </div>
            <div>
              <label>VFO (0 = A, 1 = B)</label>
              <input type="number" id="tciVfo" value="0" min="0" max="1" placeholder="0">
            </div>
          </div>
          <div class="help-text">Enable TCI in your SDR app: Thetis → Setup → CAT Control → Enable TCI Server (port 40001)</div>
        </div>

        <div class="section-divider"></div>

        <div class="row">
          <div>
            <label>Poll Interval (ms)</label>
            <input type="number" id="pollInterval" value="500" min="100" max="5000">
          </div>
          <div style="display: flex; align-items: flex-end; padding-bottom: 14px;">
            <div class="checkbox-row" style="margin-bottom: 0;">
              <input type="checkbox" id="pttEnabled">
              <span>Enable PTT</span>
            </div>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-secondary" onclick="testConnection()">🔍 Test Port</button>
          <button class="btn btn-primary" onclick="saveAndConnect()">💾 Save & Connect</button>
        </div>
      </div>

      <!-- Instructions -->
      <div class="ohc-instructions">
        <strong>Setup in OpenHamClock:</strong><br>
        1. Open <strong>Settings</strong> → <strong>Station Settings</strong> → <strong>Rig Control</strong><br>
        2. Check <strong>Enable Rig Control</strong><br>
        3. Set Host URL to: <code>http://localhost:5555</code><br>
        4. Paste the <strong>API Token</strong> shown below into the <strong>API Token</strong> field<br>
        5. Click any DX spot, POTA, or SOTA to tune your radio! 🎉
      </div>

      <!-- Security Card -->
      <div id="security-card" style="margin-top:12px; background:var(--card-bg,#1a1a2e); border:1px solid var(--border,#333); border-radius:8px; padding:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <strong style="font-size:13px;">🔐 API Security Token</strong>
          <span id="auth-badge" style="font-size:11px; padding:2px 8px; border-radius:10px; background:#22c55e22; color:#22c55e; border:1px solid #22c55e44;">Auth enabled</span>
        </div>
        <div style="font-size:12px; color:#aaa; margin-bottom:10px; line-height:1.5;">
          Write endpoints (PTT, frequency, config) require this token. Copy it and paste it into
          <strong>OpenHamClock → Settings → Rig Control → API Token</strong>. You only need to do this once.
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input id="token-display" type="text" readonly
            style="flex:1; font-family:monospace; font-size:12px; padding:6px 10px;
                   background:#0d0d1a; border:1px solid #333; border-radius:4px; color:#e0e0e0;"
            value="Loading…">
          <button onclick="copyToken()"
            style="padding:6px 14px; font-size:12px; background:#6366f1; color:#fff;
                   border:none; border-radius:4px; cursor:pointer; white-space:nowrap;">
            📋 Copy
          </button>
          <button onclick="regenerateToken()"
            style="padding:6px 14px; font-size:12px; background:#374151; color:#ddd;
                   border:1px solid #4b5563; border-radius:4px; cursor:pointer; white-space:nowrap;"
            title="Generate a new token (you will need to update OpenHamClock settings)">
            🔄 Regenerate
          </button>
        </div>
      </div>
    </div>

    <!-- ══ Tab: Integrations ══ -->
    <div class="tab-panel" id="tab-integrations">
      <div class="card">
        <div class="card-title">📡 WSJT-X Relay</div>
        <p class="help-text" style="margin-bottom:14px; color:#6b7280;">
          Captures WSJT-X UDP packets on your machine and forwards decoded messages
          to an OpenHamClock server in real time. In WSJT-X: Settings → Reporting → UDP Server: 127.0.0.1 port 2237.
        </p>

        <div class="checkbox-row">
          <input type="checkbox" id="wsjtxEnabled" onchange="toggleWsjtxOpts()">
          <span>Enable WSJT-X Relay</span>
        </div>

        <div id="wsjtxOpts" style="display:none;">
          <label>OpenHamClock Server URL</label>
          <input type="text" id="wsjtxUrl" placeholder="https://openhamclock.com">

          <label>Relay Key</label>
          <input type="text" id="wsjtxKey" placeholder="Your relay authentication key">

          <label>Session ID</label>
          <input type="text" id="wsjtxSession" placeholder="Your browser session ID">
          <div class="help-text">The session ID links your relayed decodes to your OpenHamClock dashboard.</div>

          <div class="row">
            <div>
              <label>UDP Port</label>
              <input type="number" id="wsjtxPort" value="2237" min="1024" max="65535">
            </div>
            <div>
              <label>Batch Interval (ms)</label>
              <input type="number" id="wsjtxInterval" value="2000" min="500" max="30000">
            </div>
          </div>

          <div class="checkbox-row">
            <input type="checkbox" id="wsjtxMulticast" onchange="toggleWsjtxMulticastOpts()">
            <span>Enable Multicast</span>
          </div>
          <div class="help-text" style="margin-top:-8px; margin-bottom:10px;">
            Join a UDP multicast group so multiple apps can receive WSJT-X packets simultaneously.
            In WSJT-X set UDP Server to <code>224.0.0.1</code> instead of <code>127.0.0.1</code>.
          </div>

          <div id="wsjtxMulticastOpts" style="display:none;">
            <div class="row">
              <div>
                <label>Multicast Group</label>
                <input type="text" id="wsjtxMulticastGroup" placeholder="224.0.0.1">
              </div>
              <div>
                <label>Multicast Interface</label>
                <input type="text" id="wsjtxMulticastInterface" placeholder="Leave blank for OS default">
              </div>
            </div>
          </div>

          <div style="font-size:12px; color:#6b7280; margin-bottom:14px;">
            Status: <span id="wsjtxStatusText" style="color:#c4c9d4;">—</span>
          </div>
        </div>

        <div class="btn-row">
          <button class="btn btn-primary" onclick="saveIntegrations()">💾 Save Integrations</button>
        </div>
      </div>
    </div>

    <!-- ══ Tab: Console Log ══ -->
    <div class="tab-panel" id="tab-log">
      <div class="log-toolbar">
        <span style="font-size:12px; color:#6b7280; margin-right:4px;">Filter:</span>
        <span class="log-badge lvl-log active" data-level="log" onclick="toggleFilter('log', this)">INFO</span>
        <span class="log-badge lvl-warn active" data-level="warn" onclick="toggleFilter('warn', this)">WARN</span>
        <span class="log-badge lvl-error active" data-level="error" onclick="toggleFilter('error', this)">ERROR</span>
        <span style="flex:1"></span>
        <button id="logToggleBtn" class="btn btn-secondary" onclick="toggleLogging()" style="width:auto; padding:5px 14px; font-size:12px;">⏸ Pause</button>
        <button class="btn btn-secondary" onclick="clearLog()" style="width:auto; padding:5px 14px; font-size:12px;">🗑 Clear</button>
      </div>

      <div class="log-scroll-wrap" id="logScroll">
        <div class="log-empty" id="logEmpty">Waiting for log output…</div>
      </div>

      <div class="log-footer">
        <div class="log-indicator">
          <div class="log-dot" id="logDot"></div>
          <span id="logStatus">Connecting…</span>
        </div>
        <div>
          <label style="display:inline; text-transform:none; font-size:11px; color:#374151;">
            <input type="checkbox" id="logAutoScroll" checked style="width:auto; margin:0 4px 0 0; vertical-align:middle;">
            Auto-scroll
          </label>
        </div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <footer class="page-footer">
    OpenHamClock Rig Bridge v${version} &nbsp;·&nbsp;
    <a href="https://openhamclock.com" target="_blank" rel="noopener">openhamclock.com</a>
  </footer>

  <script>
    // ── Tab switching ──────────────────────────────────────────────────────
    function switchTab(name, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + name).classList.add('active');
    }

    // ── Integrations tab ───────────────────────────────────────────────────

    function populateIntegrations(cfg) {
      const w = cfg.wsjtxRelay || {};
      document.getElementById('wsjtxEnabled').checked = !!w.enabled;
      document.getElementById('wsjtxUrl').value = w.url || '';
      document.getElementById('wsjtxKey').value = w.key || '';
      document.getElementById('wsjtxSession').value = w.session || '';
      document.getElementById('wsjtxPort').value = w.udpPort || 2237;
      document.getElementById('wsjtxInterval').value = w.batchInterval || 2000;
      document.getElementById('wsjtxMulticast').checked = !!w.multicast;
      document.getElementById('wsjtxMulticastGroup').value = w.multicastGroup || '224.0.0.1';
      document.getElementById('wsjtxMulticastInterface').value = w.multicastInterface || '';
      toggleWsjtxOpts();
      toggleWsjtxMulticastOpts();
    }

    function toggleWsjtxOpts() {
      const enabled = document.getElementById('wsjtxEnabled').checked;
      document.getElementById('wsjtxOpts').style.display = enabled ? 'block' : 'none';
    }

    function toggleWsjtxMulticastOpts() {
      const on = document.getElementById('wsjtxMulticast').checked;
      document.getElementById('wsjtxMulticastOpts').style.display = on ? 'block' : 'none';
    }

    async function saveIntegrations() {
      const wsjtxRelay = {
        enabled: document.getElementById('wsjtxEnabled').checked,
        url: document.getElementById('wsjtxUrl').value.trim(),
        key: document.getElementById('wsjtxKey').value.trim(),
        session: document.getElementById('wsjtxSession').value.trim(),
        udpPort: parseInt(document.getElementById('wsjtxPort').value) || 2237,
        batchInterval: parseInt(document.getElementById('wsjtxInterval').value) || 2000,
        multicast: document.getElementById('wsjtxMulticast').checked,
        multicastGroup: document.getElementById('wsjtxMulticastGroup').value.trim() || '224.0.0.1',
        multicastInterface: document.getElementById('wsjtxMulticastInterface').value.trim(),
      };
      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ wsjtxRelay }),
        });
        if (res.status === 401) { showToast('❌ Auth failed — check API token', 'error'); return; }
        const data = await res.json();
        if (data.success) {
          currentConfig = { ...currentConfig, ...data.config, apiToken: currentConfig?.apiToken };
          showToast('✅ Integrations saved!', 'success');
        }
      } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
      }
    }

    let wsjtxStatusInterval = null;

    function startWsjtxStatusPoll() {
      if (wsjtxStatusInterval) clearInterval(wsjtxStatusInterval);
      wsjtxStatusInterval = setInterval(async () => {
        try {
          const res = await fetch('/api/wsjtxrelay/status');
          if (!res.ok) return;
          const data = await res.json();
          const el = document.getElementById('wsjtxStatusText');
          if (!el) return;
          if (!data.running) {
            el.textContent = 'Not running';
            el.style.color = '#6b7280';
          } else if (!data.serverReachable) {
            el.textContent = 'Running — connecting to server...';
            el.style.color = '#f59e0b';
          } else {
            el.textContent = 'Running — ' + data.decodeCount + ' decodes, ' + data.relayCount + ' relayed';
            el.style.color = '#22c55e';
          }
        } catch (e) {}
      }, 5000);
    }

    // ── Radio tab ──────────────────────────────────────────────────────────
    let currentConfig = null;
    let statusInterval = null;

    function authHeaders() {
      const token = currentConfig?.apiToken || '';
      return {
        'Content-Type': 'application/json',
        ...(token ? { 'X-RigBridge-Token': token } : {}),
      };
    }

    async function init() {
      try {
        // Save token before GET /api/config overwrites currentConfig — apiToken
        // is intentionally omitted from that response for security.
        const savedToken = currentConfig?.apiToken;
        const [cfgRes, logRes] = await Promise.all([fetch('/api/config'), fetch('/api/logging')]);
        currentConfig = await cfgRes.json();
        if (savedToken) currentConfig.apiToken = savedToken; // restore after overwrite
        const logData = await logRes.json();
        populateTokenDisplay();
        populateForm(currentConfig);
        populateIntegrations(currentConfig);
        setLoggingBtn(logData.logging !== false); // default true
        refreshPorts();
        startStatusPoll();
        startLogStream();
        startWsjtxStatusPoll();
      } catch (e) {
        showToast('Failed to load config', 'error');
      }
    }

    // ── Security token UI ─────────────────────────────────────────────────
    // Synchronous — reads from currentConfig (token saved across init() overwrite).
    function populateTokenDisplay() {
      const input = document.getElementById('token-display');
      const badge = document.getElementById('auth-badge');
      if (!input) return;
      if (currentConfig?.apiToken) {
        input.value = currentConfig.apiToken;
        if (badge) { badge.textContent = 'Auth enabled'; badge.style.color = '#22c55e'; }
      } else {
        input.value = '(no token — auth disabled)';
        if (badge) { badge.textContent = 'Auth disabled'; badge.style.color = '#f59e0b'; badge.style.background = '#f59e0b22'; badge.style.borderColor = '#f59e0b44'; }
      }
    }

    async function copyToken() {
      const val = document.getElementById('token-display')?.value;
      if (!val || val.startsWith('(')) return;
      try {
        await navigator.clipboard.writeText(val);
        showToast('Token copied to clipboard!', 'success');
      } catch (e) {
        showToast('Copy failed — select and copy manually', 'error');
      }
    }

    async function regenerateToken() {
      if (!confirm('Regenerate API token? You will need to update the token in OpenHamClock settings.')) return;
      try {
        const res = await fetch('/api/token/regenerate', {
          method: 'POST',
          headers: authHeaders(),
        });
        if (!res.ok) { showToast('Regenerate failed — auth error', 'error'); return; }
        const data = await res.json();
        if (currentConfig) currentConfig.apiToken = data.apiToken;
        document.getElementById('token-display').value = data.apiToken;
        showToast('New token generated — update OpenHamClock settings', 'success');
      } catch (e) {
        showToast('Regenerate failed: ' + e.message, 'error');
      }
    }

    function populateForm(cfg) {
      const r = cfg.radio || {};
      document.getElementById('radioType').value = r.type || 'none';
      document.getElementById('baudRate').value = r.baudRate || 38400;
      document.getElementById('stopBits').value = r.stopBits || 2;
      document.getElementById('rtscts').checked = !!r.rtscts;
      document.getElementById('icomAddress').value = r.icomAddress || '0x94';
      document.getElementById('pollInterval').value = r.pollInterval || 500;
      document.getElementById('pttEnabled').checked = !!r.pttEnabled;
      document.getElementById('legacyHost').value =
        r.type === 'rigctld' ? (r.rigctldHost || '127.0.0.1') : (r.flrigHost || '127.0.0.1');
      document.getElementById('legacyPort').value =
        r.type === 'rigctld' ? (r.rigctldPort || 4532) : (r.flrigPort || 12345);
      document.getElementById('fixSplit').checked = !!r.fixSplit;
      const tci = cfg.tci || {};
      document.getElementById('tciHost').value = tci.host || 'localhost';
      document.getElementById('tciPort').value = tci.port || 40001;
      document.getElementById('tciTrx').value = tci.trx ?? 0;
      document.getElementById('tciVfo').value = tci.vfo ?? 0;
      onTypeChange(true); // Don't overwrite loaded values with model defaults
    }

    function onTypeChange(skipDefaults) {
      const type = document.getElementById('radioType').value;
      const isDirect = ['yaesu', 'kenwood', 'icom'].includes(type);
      const isLegacy = ['flrig', 'rigctld'].includes(type);
      const isTci = type === 'tci';

      document.getElementById('serialOpts').className = 'serial-opts' + (isDirect ? ' show' : '');
      document.getElementById('legacyOpts').className = 'legacy-opts' + (isLegacy ? ' show' : '');
      document.getElementById('icomAddr').className = 'icom-addr' + (type === 'icom' ? ' show' : '');
      document.getElementById('tciOpts').className = 'tci-opts' + (isTci ? ' show' : '');
      document.getElementById('rigctldOpts').className = 'rigctld-opts' + (type === 'rigctld' ? ' show' : '');

      if (!skipDefaults) {
        if (type === 'yaesu') {
          document.getElementById('baudRate').value = '38400';
          document.getElementById('stopBits').value = '2';
          document.getElementById('rtscts').checked = false;
        } else if (type === 'kenwood' || type === 'icom') {
          document.getElementById('stopBits').value = '1';
          document.getElementById('rtscts').checked = false;
        }
        if (type === 'rigctld') {
          document.getElementById('legacyPort').value = '4532';
        } else if (type === 'flrig') {
          document.getElementById('legacyPort').value = '12345';
        }
      }
    }

    async function refreshPorts() {
      const sel = document.getElementById('serialPort');
      sel.innerHTML = '<option value="">Scanning...</option>';
      try {
        const res = await fetch('/api/ports', { headers: authHeaders() });
        const ports = await res.json();
        sel.innerHTML = '<option value="">— Select port —</option>';
        if (ports.length === 0) {
          sel.innerHTML += '<option value="" disabled>No ports found — is your radio plugged in via USB?</option>';
        }
        ports.forEach((p) => {
          const label = p.manufacturer ? p.path + ' (' + p.manufacturer + ')' : p.path;
          const opt = document.createElement('option');
          opt.value = p.path;
          opt.textContent = label;
          if (currentConfig && currentConfig.radio && currentConfig.radio.serialPort === p.path) {
            opt.selected = true;
          }
          sel.appendChild(opt);
        });
      } catch (e) {
        sel.innerHTML = '<option value="" disabled>Error scanning ports</option>';
      }
    }

    async function testConnection() {
      const stopBits = parseInt(document.getElementById('stopBits').value);
      const rtscts = document.getElementById('rtscts').checked;
      const type = document.getElementById('radioType').value;

      if (['yaesu', 'kenwood', 'icom'].includes(type)) {
        const serialPort = document.getElementById('serialPort').value;
        const baudRate = parseInt(document.getElementById('baudRate').value);
        if (!serialPort) return showToast('Select a serial port first', 'error');
        try {
          const res = await fetch('/api/test', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ serialPort, baudRate, stopBits, rtscts }),
          });
          const data = await res.json();
          showToast(
            data.success ? '✅ ' + data.message : '❌ ' + data.error,
            data.success ? 'success' : 'error',
          );
        } catch (e) {
          showToast('Test failed: ' + e.message, 'error');
        }
      } else {
        showToast('Test is for direct serial connections only', 'error');
      }
    }

    async function saveAndConnect() {
      const type = document.getElementById('radioType').value;
      const radio = {
        type,
        serialPort: document.getElementById('serialPort').value,
        baudRate: parseInt(document.getElementById('baudRate').value),
        stopBits: parseInt(document.getElementById('stopBits').value),
        rtscts: document.getElementById('rtscts').checked,
        icomAddress: document.getElementById('icomAddress').value,
        pollInterval: parseInt(document.getElementById('pollInterval').value),
        pttEnabled: document.getElementById('pttEnabled').checked,
      };

      if (type === 'rigctld') {
        radio.rigctldHost = document.getElementById('legacyHost').value;
        radio.rigctldPort = parseInt(document.getElementById('legacyPort').value);
        radio.fixSplit = document.getElementById('fixSplit').checked;
      } else if (type === 'flrig') {
        radio.flrigHost = document.getElementById('legacyHost').value;
        radio.flrigPort = parseInt(document.getElementById('legacyPort').value);
      }

      const tci = {
        host: document.getElementById('tciHost').value.trim() || 'localhost',
        port: parseInt(document.getElementById('tciPort').value) || 40001,
        trx: Math.max(0, parseInt(document.getElementById('tciTrx').value) || 0),
        vfo: Math.max(0, parseInt(document.getElementById('tciVfo').value) || 0),
      };

      if (type === 'tci') {
        if (!tci.host) return showToast('TCI host cannot be empty', 'error');
        if (tci.port < 1 || tci.port > 65535) return showToast('TCI port must be 1–65535', 'error');
      }

      try {
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ radio, tci }),
        });
        if (res.status === 401) { showToast('❌ Auth failed — check API token', 'error'); return; }
        const data = await res.json();
        if (data.success) {
          currentConfig = { ...currentConfig, ...data.config, apiToken: currentConfig?.apiToken };
          showToast('✅ Saved! Connecting to radio...', 'success');
        }
      } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
      }
    }

    function startStatusPoll() {
      if (statusInterval) clearInterval(statusInterval);
      statusInterval = setInterval(async () => {
        try {
          const res = await fetch('/status');
          const s = await res.json();

          const dot = document.getElementById('statusDot');
          const label = document.getElementById('statusLabel');
          const freq = document.getElementById('statusFreq');
          const mode = document.getElementById('statusMode');

          dot.className = 'status-dot' + (s.connected ? ' connected' : '');
          label.textContent = s.connected ? 'Connected' : 'Disconnected';

          if (s.freq > 0) {
            const mhz = (s.freq / 1000000).toFixed(s.freq >= 100000000 ? 4 : 6);
            freq.textContent = mhz + ' MHz';
          } else {
            freq.textContent = '—';
          }
          mode.textContent = s.mode || '';
        } catch (e) {}
      }, 1000);
    }

    function showToast(msg, type) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast show ' + type;
      setTimeout(() => { t.className = 'toast'; }, 3000);
    }

    // ── Console Log tab ────────────────────────────────────────────────────
    const activeFilters = { log: true, warn: true, error: true };
    let logLines = []; // all received lines (unfiltered)

    function toggleFilter(level, el) {
      activeFilters[level] = !activeFilters[level];
      el.classList.toggle('active', activeFilters[level]);
      el.classList.toggle('inactive', !activeFilters[level]);
      renderLog();
    }

    function clearLog() {
      logLines = [];
      renderLog();
    }

    let loggingEnabled = true;

    function setLoggingBtn(enabled) {
      loggingEnabled = enabled;
      const btn = document.getElementById('logToggleBtn');
      if (btn) {
        btn.textContent = enabled ? '⏸ Pause' : '▶ Resume';
        btn.title = enabled ? 'Pause console log capture' : 'Resume console log capture';
      }
    }

    async function toggleLogging() {
      try {
        const res = await fetch('/api/logging', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ logging: !loggingEnabled }),
        });
        const data = await res.json();
        if (data.success) setLoggingBtn(data.logging);
      } catch (e) {
        showToast('Failed to toggle logging: ' + e.message, 'error');
      }
    }

    function fmtTime(ts) {
      const d = new Date(ts);
      return d.toTimeString().substring(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    }

    function renderLog() {
      const wrap = document.getElementById('logScroll');
      const empty = document.getElementById('logEmpty');
      const autoScroll = document.getElementById('logAutoScroll').checked;
      const wasAtBottom = wrap.scrollHeight - wrap.scrollTop <= wrap.clientHeight + 40;

      const visible = logLines.filter((l) => activeFilters[l.level]);

      if (visible.length === 0) {
        empty.style.display = 'block';
        // Remove all line elements
        [...wrap.querySelectorAll('.log-line')].forEach((el) => el.remove());
        return;
      }
      empty.style.display = 'none';

      // Full re-render (simple; log volume is low)
      [...wrap.querySelectorAll('.log-line')].forEach((el) => el.remove());
      const frag = document.createDocumentFragment();
      visible.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'log-line lvl-' + line.level;
        row.innerHTML =
          '<span class="log-ts">' + fmtTime(line.ts) + '</span>' +
          '<span class="log-text">' + escHtml(line.text) + '</span>';
        frag.appendChild(row);
      });
      wrap.appendChild(frag);

      if (autoScroll && wasAtBottom) {
        wrap.scrollTop = wrap.scrollHeight;
      }
    }

    function appendLogLine(entry) {
      logLines.push(entry);
      if (!activeFilters[entry.level]) return; // filtered out — skip DOM update

      const wrap = document.getElementById('logScroll');
      const empty = document.getElementById('logEmpty');
      const autoScroll = document.getElementById('logAutoScroll').checked;
      const wasAtBottom = wrap.scrollHeight - wrap.scrollTop <= wrap.clientHeight + 40;

      empty.style.display = 'none';

      const row = document.createElement('div');
      row.className = 'log-line lvl-' + entry.level;
      row.innerHTML =
        '<span class="log-ts">' + fmtTime(entry.ts) + '</span>' +
        '<span class="log-text">' + escHtml(entry.text) + '</span>';
      wrap.appendChild(row);

      if (autoScroll && wasAtBottom) {
        wrap.scrollTop = wrap.scrollHeight;
      }
    }

    function escHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function setLogStatus(live) {
      document.getElementById('logDot').className = 'log-dot' + (live ? ' live' : '');
      document.getElementById('logStatus').textContent = live ? 'Live' : 'Reconnecting…';
    }

    function startLogStream() {
      let es;

      function connect() {
        es = new EventSource('/api/log/stream?token=' + encodeURIComponent(currentConfig?.apiToken || ''));

        es.onopen = () => setLogStatus(true);

        es.addEventListener('history', (e) => {
          const lines = JSON.parse(e.data);
          lines.forEach((l) => logLines.push(l));
          renderLog();
        });

        es.addEventListener('line', (e) => {
          const entry = JSON.parse(e.data);
          appendLogLine(entry);
        });

        es.onerror = () => {
          setLogStatus(false);
          es.close();
          setTimeout(connect, 3000);
        };
      }

      connect();
    }

    // ── Login gate ────────────────────────────────────────────────────────────
    // __FIRST_RUN__ is injected server-side: true when the token has never been
    // shown before (new install, upgrade, or token regeneration).
    window.__FIRST_RUN__ = ${!config.tokenDisplayed};
    window.__INITIAL_TOKEN__ = ${!config.tokenDisplayed ? JSON.stringify(config.apiToken) : 'null'};

    function setLoggedIn(token) {
      if (!currentConfig) currentConfig = {};
      currentConfig.apiToken = token;
      const overlay = document.getElementById('loginOverlay');
      if (overlay) overlay.style.display = 'none';
      init();
    }

    function showLoginForm() {
      const overlay = document.getElementById('loginOverlay');
      if (!overlay) return;
      overlay.style.display = 'flex';
      setTimeout(() => document.getElementById('loginToken')?.focus(), 50);
    }

    async function doLogin() {
      const input = document.getElementById('loginToken');
      const token = input?.value?.trim();
      const errEl = document.getElementById('loginError');
      const box = document.getElementById('loginBox');
      if (!token) { errEl.textContent = 'Please enter your token.'; return; }

      // Isolate the network request so localStorage/DOM errors don't masquerade
      // as "connection error" (e.g. Safari private browsing throws SecurityError
      // on localStorage.setItem, which would otherwise be caught here).
      let ok = false;
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        ok = res.ok;
      } catch (e) {
        errEl.textContent = 'Connection error — ' + (e.message || 'check that rig-bridge is running');
        return;
      }

      if (ok) {
        errEl.textContent = '';
        try { localStorage.setItem('rigbridge_token', token); } catch (_) {} // no-op if storage disabled
        setLoggedIn(token);
      } else {
        errEl.textContent = 'Invalid token — try again.';
        box.classList.remove('shake');
        void box.offsetWidth; // force reflow to restart animation
        box.classList.add('shake');
      }
    }

    function toggleLoginEye() {
      const inp = document.getElementById('loginToken');
      const eye = document.getElementById('loginEye');
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
      eye.textContent = inp.type === 'password' ? '👁' : '🙈';
    }

    function showFirstRunBanner(token) {
      const banner = document.getElementById('welcomeBanner');
      const tokenInput = document.getElementById('welcomeToken');
      if (!banner || !tokenInput) return;
      tokenInput.value = token;
      banner.classList.add('show');
    }

    async function copyWelcomeToken() {
      const val = document.getElementById('welcomeToken')?.value;
      if (!val) return;
      try {
        await navigator.clipboard.writeText(val);
        showToast('Token copied to clipboard!', 'success');
      } catch (e) {
        showToast('Copy failed — select and copy manually', 'error');
      }
    }

    async function dismissWelcomeBanner() {
      document.getElementById('welcomeBanner')?.classList.remove('show');
      try { await fetch('/api/setup/token-seen', { method: 'POST' }); } catch (e) {}
    }

    function logout() {
      localStorage.removeItem('rigbridge_token');
      location.reload();
    }

    async function doAutoLogin() {
      // 1. Try stored token from a previous session.
      const stored = localStorage.getItem('rigbridge_token');
      if (stored) {
        try {
          const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: stored }),
          });
          if (res.ok) { setLoggedIn(stored); return; }
        } catch (e) {}
        localStorage.removeItem('rigbridge_token'); // stale / token changed
      }

      // 2. First run (or token just regenerated): auto-login and show welcome banner.
      // Token is embedded in the page HTML as window.__INITIAL_TOKEN__ — no network
      // call needed, and GET /api/token is now auth-gated.
      if (window.__FIRST_RUN__ && window.__INITIAL_TOKEN__) {
        try { localStorage.setItem('rigbridge_token', window.__INITIAL_TOKEN__); } catch (_) {} // no-op if storage disabled
        setLoggedIn(window.__INITIAL_TOKEN__);
        showFirstRunBanner(window.__INITIAL_TOKEN__);
        return;
      }

      // 3. No stored session and not first run — show the login form.
      showLoginForm();
    }

    doAutoLogin();
  </script>
</body>
</html>`;
}

function createServer(registry, version) {
  const app = express();

  // SECURITY: Restrict CORS to OpenHamClock origins instead of wildcard.
  // Wildcard CORS allows any website the user visits to silently call localhost:5555
  // endpoints (including PTT) via the browser's fetch API.
  const allowedOrigins = (config.corsOrigins || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Always allow the local setup UI and common OHC origins
  const defaultOrigins = [
    `http://localhost:${config.port}`,
    `http://127.0.0.1:${config.port}`,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://openhamclock.com',
    'https://www.openhamclock.com',
  ];
  const origins = [...new Set([...defaultOrigins, ...allowedOrigins])];

  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        // Allow requests with no origin (curl, Postman, server-to-server)
        if (!requestOrigin) return callback(null, true);
        if (origins.includes(requestOrigin)) return callback(null, true);
        callback(null, false);
      },
      methods: ['GET', 'POST'],
    }),
  );
  app.use(express.json());

  // ─── Rate limiting ───────────────────────────────────────────────────────
  // Simple in-memory sliding-window limiter — no extra dependencies.
  const _rlWindows = new Map(); // key → [timestamp, ...]
  setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of _rlWindows) {
      const fresh = ts.filter((t) => now - t < 60000);
      if (fresh.length === 0) _rlWindows.delete(key);
      else _rlWindows.set(key, fresh);
    }
  }, 300000); // purge stale entries every 5 min

  function rateLimit(maxRequests, windowMs) {
    return (req, res, next) => {
      if (!config.apiToken) return next(); // no auth configured — skip rate limiting
      const key = (req.ip || '') + req.path;
      const now = Date.now();
      const ts = (_rlWindows.get(key) || []).filter((t) => now - t < windowMs);
      if (ts.length >= maxRequests) {
        return res.status(429).json({ error: 'Too many requests — slow down' });
      }
      ts.push(now);
      _rlWindows.set(key, ts);
      next();
    };
  }

  // SECURITY: Token-based authentication for write (state-changing) endpoints.
  // Enforced only when config.apiToken is non-empty, so existing installs with
  // no token in their config file continue to work unchanged (soft rollout).
  const requireAuth = (req, res, next) => {
    if (!config.apiToken) return next(); // auth disabled — backwards-compatible
    const provided = req.headers['x-rigbridge-token'];
    if (provided && provided === config.apiToken) return next();
    res.status(401).json({ error: 'Unauthorized — provide the correct X-RigBridge-Token header' });
  };

  // Allow plugins to register their own routes
  registry.registerRoutes(app);

  // ─── Setup Web UI ───
  app.get('/', (req, res) => {
    if (!req.headers.accept || !req.headers.accept.includes('text/html')) {
      return res.json({ status: 'ok', connected: state.connected, version });
    }
    res.send(buildSetupHtml(version));
  });

  // ─── API: Live console log stream (SSE) ───
  // SECURITY: Do NOT set Access-Control-Allow-Origin manually here — the CORS
  // middleware above handles origin filtering for all routes. A manual wildcard
  // header here would bypass that and expose the log stream to any origin.
  app.get('/api/log/stream', (req, res) => {
    // EventSource cannot send custom headers, so the token is passed as a query param.
    if (config.apiToken && req.query.token !== config.apiToken) {
      return res.status(401).end('Unauthorized');
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send buffered history so a freshly opened tab sees recent output
    res.write(`event: history\ndata: ${JSON.stringify(logBuffer)}\n\n`);

    const clientId = Date.now() + Math.random();
    logSseClients.push({ id: clientId, res });

    req.on('close', () => {
      logSseClients = logSseClients.filter((c) => c.id !== clientId);
    });
  });

  // ─── API: Console logging toggle ───
  app.get('/api/logging', (req, res) => {
    res.json({ logging: config.logging });
  });

  app.post('/api/logging', requireAuth, (req, res) => {
    const { logging } = req.body;
    if (typeof logging !== 'boolean') return res.status(400).json({ error: 'logging must be a boolean' });
    config.logging = logging;
    saveConfig();
    console.log(`[Server] Console logging ${logging ? 'enabled' : 'disabled'}`);
    res.json({ success: true, logging: config.logging });
  });

  // ─── API: List serial ports ───
  app.get('/api/ports', requireAuth, async (req, res) => {
    const ports = await listPorts();
    res.json(ports);
  });

  // ─── API: Get/Set config ───

  // Validate serial port paths to prevent arbitrary file access
  const isValidSerialPort = (p) => {
    if (!p || typeof p !== 'string') return false;
    // Windows: COM1-COM256
    if (/^COM\d{1,3}$/i.test(p)) return true;
    // Linux: /dev/ttyUSB*, /dev/ttyACM*, /dev/ttyS*, /dev/ttyAMA*
    if (/^\/dev\/tty(USB|ACM|S|AMA)\d+$/.test(p)) return true;
    // macOS: /dev/cu.* or /dev/tty.*
    if (/^\/dev\/(cu|tty)\.[A-Za-z0-9._-]+$/.test(p)) return true;
    return false;
  };

  // SECURITY: Validate plugin host values (flrig, rigctld, tci) to prevent
  // SSRF via the config API. Private IP ranges are deliberately allowed since
  // these backends legitimately run on a Pi or another machine on the same LAN.
  // What we reject is URL-scheme injection ("http://...") and path traversal.
  const isValidPort = (p) => Number.isInteger(p) && p >= 1 && p <= 65535;

  const isValidRemoteHost = (h) => {
    if (!h || typeof h !== 'string') return false;
    // Reject anything that looks like a URL (scheme present)
    if (/[/:]{2}/.test(h)) return false;
    // Reject path separators
    if (/[/\\]/.test(h)) return false;
    // Allow: localhost, IPv4, bracketed IPv6, plain hostnames/FQDNs
    if (/^localhost$/i.test(h)) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
    if (/^\[[\da-fA-F:]+\]$/.test(h)) return true;
    if (/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(h))
      return true;
    return false;
  };

  app.get('/api/config', (req, res) => {
    // Omit apiToken — callers that need it use GET /api/token instead.
    const { apiToken: _omit, ...safeConfig } = config;
    res.json(safeConfig);
  });

  // ─── API: Token management ───
  // Returns the token for authenticated callers (external tools, scripts).
  // The setup UI no longer calls this — the first-run token is injected into
  // the HTML as window.__INITIAL_TOKEN__; subsequent loads restore from
  // currentConfig (saved across the GET /api/config overwrite in init()).
  // requireAuth passes through automatically when apiToken is empty (auth disabled).
  app.get('/api/token', requireAuth, (req, res) => {
    res.json({ tokenSet: !!config.apiToken, apiToken: config.apiToken });
  });

  // Regenerate token — requires the current token to prevent CSRF.
  app.post('/api/token/regenerate', rateLimit(3, 60000), requireAuth, (req, res) => {
    config.apiToken = require('crypto').randomBytes(16).toString('hex');
    config.tokenDisplayed = false; // trigger first-run banner for the new token
    saveConfig();
    console.log('[Server] API token regenerated');
    res.json({ success: true, apiToken: config.apiToken });
  });

  // ─── API: Auth verify (login gate) ───
  // Validates a token submitted from the setup UI login form. No requireAuth
  // middleware — this endpoint IS the authentication step.
  app.post('/api/auth/verify', (req, res) => {
    const { token } = req.body || {};
    if (!config.apiToken || token === config.apiToken) return res.json({ success: true });
    res.status(401).json({ success: false });
  });

  // ─── API: Mark token as seen ───
  // Called when the user dismisses the first-run welcome banner. No auth
  // required — it is called during first-run auto-login before the user has
  // a stored session. Sets tokenDisplayed = true so the normal login gate is
  // shown on subsequent visits.
  app.post('/api/setup/token-seen', (req, res) => {
    config.tokenDisplayed = true;
    saveConfig();
    res.json({ ok: true });
  });

  app.post('/api/config', rateLimit(10, 60000), requireAuth, (req, res) => {
    const newConfig = req.body;
    // config.port is intentionally not live-editable — changing the listen port
    // requires a restart; silently applying it here would break the running server.
    if (newConfig.radio) {
      // Validate serial port path if provided
      if (newConfig.radio.serialPort && !isValidSerialPort(newConfig.radio.serialPort)) {
        return res.status(400).json({ success: false, error: 'Invalid serial port path' });
      }
      // SECURITY: Validate plugin host fields to prevent SSRF
      if (newConfig.radio.flrigHost !== undefined && !isValidRemoteHost(newConfig.radio.flrigHost)) {
        return res.status(400).json({ success: false, error: 'Invalid flrig host' });
      }
      if (newConfig.radio.rigctldHost !== undefined && !isValidRemoteHost(newConfig.radio.rigctldHost)) {
        return res.status(400).json({ success: false, error: 'Invalid rigctld host' });
      }
      if (newConfig.radio.flrigPort !== undefined && !isValidPort(newConfig.radio.flrigPort)) {
        return res.status(400).json({ success: false, error: 'Invalid flrig port (1–65535)' });
      }
      if (newConfig.radio.rigctldPort !== undefined && !isValidPort(newConfig.radio.rigctldPort)) {
        return res.status(400).json({ success: false, error: 'Invalid rigctld port (1–65535)' });
      }
      config.radio = { ...config.radio, ...newConfig.radio };
    }
    if (typeof newConfig.logging === 'boolean') {
      config.logging = newConfig.logging;
    }
    if (newConfig.wsjtxRelay) {
      if (newConfig.wsjtxRelay.udpPort !== undefined && !isValidPort(newConfig.wsjtxRelay.udpPort)) {
        return res.status(400).json({ success: false, error: 'Invalid UDP port (1–65535)' });
      }
      config.wsjtxRelay = { ...config.wsjtxRelay, ...newConfig.wsjtxRelay };
    }
    if (newConfig.tci) {
      // SECURITY: Validate TCI host to prevent SSRF
      if (newConfig.tci.host !== undefined && !isValidRemoteHost(newConfig.tci.host)) {
        return res.status(400).json({ success: false, error: 'Invalid TCI host' });
      }
      if (newConfig.tci.port !== undefined && !isValidPort(newConfig.tci.port)) {
        return res.status(400).json({ success: false, error: 'Invalid TCI port (1–65535)' });
      }
      config.tci = { ...config.tci, ...newConfig.tci };
    }
    // macOS: tty.* (dial-in) blocks open() — silently upgrade to cu.* (call-out)
    if (process.platform === 'darwin' && config.radio.serialPort?.startsWith('/dev/tty.')) {
      config.radio.serialPort = config.radio.serialPort.replace('/dev/tty.', '/dev/cu.');
    }
    saveConfig();

    // Restart radio connection if radio config changed
    if (newConfig.radio) {
      registry.switchPlugin(config.radio.type);
    }

    // Restart WSJT-X relay if its config changed
    if (newConfig.wsjtxRelay) {
      registry.restartIntegration('wsjtx-relay');
    }

    res.json({ success: true, config });
  });

  // ─── API: Test serial port connection ───
  app.post('/api/test', requireAuth, async (req, res) => {
    const testPort = req.body.serialPort || config.radio.serialPort;
    if (!isValidSerialPort(testPort)) {
      return res.json({ success: false, error: 'Invalid serial port path' });
    }
    const testBaud = req.body.baudRate || config.radio.baudRate;
    const testStopBits = req.body.stopBits || config.radio.stopBits || 1;
    const testRtscts = req.body.rtscts !== undefined ? !!req.body.rtscts : !!config.radio.rtscts;

    const SP = getSerialPort();
    if (!SP) return res.json({ success: false, error: 'serialport module not available' });

    try {
      const testConn = new SP({
        path: testPort,
        baudRate: testBaud,
        stopBits: testStopBits,
        rtscts: testRtscts,
        autoOpen: false,
      });

      testConn.open((err) => {
        if (err) {
          return res.json({ success: false, error: err.message });
        }
        // Even for test, set DTR/RTS if not using hardware flow
        if (!testRtscts) {
          testConn.set({ dtr: true, rts: true }, (setErr) => {
            if (setErr) console.warn(`[Server] Could not set DTR/RTS during test: ${setErr.message}`);
          });
        }
        testConn.close(() => {
          res.json({ success: true, message: `Successfully opened ${testPort} at ${testBaud} baud` });
        });
      });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });

  // ─── OHC-compatible API ───
  app.get('/status', (req, res) => {
    res.json({
      connected: state.connected,
      freq: state.freq,
      mode: state.mode,
      width: state.width,
      ptt: state.ptt,
      timestamp: state.lastUpdate,
    });
  });

  app.get('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const initialData = {
      type: 'init',
      connected: state.connected,
      freq: state.freq,
      mode: state.mode,
      width: state.width,
      ptt: state.ptt,
    };
    res.write(`data: ${JSON.stringify(initialData)}\n\n`);

    const clientId = Date.now() + Math.random();
    addSseClient(clientId, res);

    req.on('close', () => {
      removeSseClient(clientId);
    });
  });

  app.post('/freq', rateLimit(20, 1000), requireAuth, (req, res) => {
    const { freq } = req.body;
    const hz = Number(freq);
    if (!Number.isFinite(hz) || hz < 1000 || hz > 75000000000) {
      return res.status(400).json({ error: 'freq must be a number between 1 kHz and 75 GHz' });
    }
    registry.dispatch('setFreq', hz);
    res.json({ success: true });
  });

  app.post('/mode', rateLimit(10, 1000), requireAuth, (req, res) => {
    const { mode } = req.body;
    if (typeof mode !== 'string' || mode.length === 0 || mode.length > 20 || !/^[A-Za-z0-9-]+$/.test(mode)) {
      return res.status(400).json({ error: 'mode must be 1–20 alphanumeric characters' });
    }
    registry.dispatch('setMode', mode);
    res.json({ success: true });
  });

  app.post('/ptt', rateLimit(5, 1000), requireAuth, (req, res) => {
    const { ptt } = req.body;
    if (ptt && !config.radio.pttEnabled) {
      return res.status(403).json({ error: 'PTT disabled in configuration' });
    }
    registry.dispatch('setPTT', !!ptt);
    res.json({ success: true });
  });

  return app;
}

function startServer(port, registry, version) {
  const app = createServer(registry, version);

  // SECURITY: Bind to localhost by default. Set bindAddress to '0.0.0.0' in
  // rig-bridge-config.json only if you need LAN access (e.g. bridge on a Pi,
  // browser on a desktop).
  const bindAddress = config.bindAddress || '127.0.0.1';

  const server = app.listen(port, bindAddress, () => {
    const versionLabel = `v${version}`.padEnd(8);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log(`  ║   📻  OpenHamClock Rig Bridge  ${versionLabel}      ║`);
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║   Setup UI:  http://localhost:${port}          ║`);
    console.log(`  ║   Radio:     ${(config.radio.type || 'none').padEnd(30)}║`);
    if (bindAddress !== '127.0.0.1') {
      console.log(`  ║   ⚠ Bound to ${bindAddress.padEnd(33)}║`);
    }
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Server] ERROR: Port ${port} is already in use.`);
      console.error(`         Another instance of Rig Bridge might be running.`);
      console.error(`         Please close it or use --port <new_port> to start another one.\n`);
      process.exit(1);
    } else {
      console.error(`\n[Server] Unexpected error: ${err.message}\n`);
      process.exit(1);
    }
  });
}

module.exports = { startServer };
