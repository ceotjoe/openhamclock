'use strict';
/**
 * Rig Bridge routes — health proxy, auto-launch, cloud relay endpoints.
 *
 * Cloud Relay Architecture:
 *   Local rig-bridge (at user's home) pushes rig state to this server.
 *   The browser polls for state and pushes commands (tune, PTT, etc.).
 *   This server queues commands for the local rig-bridge to pick up.
 *
 *   Browser ←→ OHC Server ←→ Cloud Relay Plugin (in rig-bridge) ←→ Radio
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function (app, ctx) {
  const { ROOT_DIR, logInfo, logWarn, requireWriteAuth, RIG_BRIDGE_RELAY_KEY } = ctx;

  let rigBridgeProcess = null;

  const RIG_BRIDGE_DIR = path.join(ROOT_DIR, 'rig-bridge');
  const RIG_BRIDGE_ENTRY = path.join(RIG_BRIDGE_DIR, 'rig-bridge.js');

  // ─── Cloud Relay State Store ──────────────────────────────────────────
  // Per-session relay state and command queues.
  // Session = unique browser tab / user connection.
  const relaySessions = new Map(); // sessionId → { state, commands[], lastPush, lastPoll }
  const MAX_RELAY_SESSIONS = 50;
  const RELAY_SESSION_TTL = 3600000; // 1 hour

  function getRelaySession(sessionId) {
    if (!relaySessions.has(sessionId)) {
      if (relaySessions.size >= MAX_RELAY_SESSIONS) {
        // Evict oldest session
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [k, v] of relaySessions) {
          if (v.lastPush < oldestTime) {
            oldestTime = v.lastPush;
            oldestKey = k;
          }
        }
        if (oldestKey) relaySessions.delete(oldestKey);
      }
      relaySessions.set(sessionId, {
        state: { connected: false, freq: 0, mode: '', ptt: false },
        commands: [],
        lastPush: Date.now(),
        lastPoll: 0,
      });
    }
    return relaySessions.get(sessionId);
  }

  // Cleanup expired sessions periodically
  setInterval(() => {
    const cutoff = Date.now() - RELAY_SESSION_TTL;
    for (const [k, v] of relaySessions) {
      if (v.lastPush < cutoff && v.lastPoll < cutoff) {
        relaySessions.delete(k);
      }
    }
  }, 300000); // Every 5 minutes

  // ─── Relay Auth ───────────────────────────────────────────────────────
  function requireRelayAuth(req, res, next) {
    if (!RIG_BRIDGE_RELAY_KEY) {
      return res.status(503).json({ error: 'Cloud relay not configured — set RIG_BRIDGE_RELAY_KEY in .env' });
    }
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token !== RIG_BRIDGE_RELAY_KEY) {
      return res.status(401).json({ error: 'Invalid relay key' });
    }
    next();
  }

  // ─── Cloud Relay: Credentials (browser fetches to configure rig-bridge) ─
  app.get('/api/rig-bridge/relay/credentials', (req, res) => {
    if (!RIG_BRIDGE_RELAY_KEY) {
      return res.status(503).json({ error: 'Cloud relay not configured — set RIG_BRIDGE_RELAY_KEY in .env' });
    }
    // Generate a session ID for this browser tab
    const sessionId = req.query.session || crypto.randomBytes(8).toString('hex');
    res.json({
      relayKey: RIG_BRIDGE_RELAY_KEY,
      session: sessionId,
      serverUrl: `${req.protocol}://${req.get('host')}`,
    });
  });

  // ─── Cloud Relay: State Push (rig-bridge → server) ────────────────────
  app.post('/api/rig-bridge/relay/state', requireRelayAuth, (req, res) => {
    const sessionId = req.headers['x-relay-session'] || req.body.session;
    if (!sessionId) return res.status(400).json({ error: 'Missing session ID' });

    const session = getRelaySession(sessionId);
    session.state = {
      connected: req.body.connected ?? session.state.connected,
      freq: req.body.freq ?? session.state.freq,
      mode: req.body.mode ?? session.state.mode,
      ptt: req.body.ptt ?? session.state.ptt,
      width: req.body.width ?? session.state.width,
      timestamp: Date.now(),
    };
    session.lastPush = Date.now();

    res.json({ ok: true });
  });

  // ─── Cloud Relay: State Poll (browser → server) ───────────────────────
  app.get('/api/rig-bridge/relay/state', (req, res) => {
    const sessionId = req.query.session;
    if (!sessionId || !relaySessions.has(sessionId)) {
      return res.json({ connected: false, freq: 0, mode: '', ptt: false, relayActive: false });
    }
    const session = relaySessions.get(sessionId);
    const relayActive = Date.now() - session.lastPush < 15000; // Consider active if pushed in last 15s
    res.json({ ...session.state, relayActive });
  });

  // ─── Cloud Relay: Command Push (browser → server, for rig-bridge to pick up) ─
  app.post('/api/rig-bridge/relay/command', (req, res) => {
    const sessionId = req.query.session || req.body.session;
    if (!sessionId || !relaySessions.has(sessionId)) {
      return res.status(404).json({ error: 'No active relay session' });
    }
    const { type, payload } = req.body;
    if (!type) return res.status(400).json({ error: 'Missing command type' });

    const session = relaySessions.get(sessionId);
    session.commands.push({ type, payload, timestamp: Date.now() });

    // Cap command queue
    if (session.commands.length > 50) {
      session.commands = session.commands.slice(-50);
    }

    res.json({ ok: true, queued: session.commands.length });
  });

  // ─── Cloud Relay: Command Poll (rig-bridge → server) ──────────────────
  app.get('/api/rig-bridge/relay/commands', requireRelayAuth, (req, res) => {
    const sessionId = req.query.session;
    if (!sessionId || !relaySessions.has(sessionId)) {
      return res.json({ commands: [] });
    }
    const session = relaySessions.get(sessionId);
    const commands = [...session.commands];
    session.commands = []; // Drain the queue
    session.lastPoll = Date.now();
    res.json({ commands });
  });

  // ─── Cloud Relay: Configure (browser pushes config to rig-bridge) ─────
  app.post('/api/rig-bridge/relay/configure', async (req, res) => {
    const { rigBridgeUrl, rigBridgeToken } = req.body;
    if (!rigBridgeUrl) return res.status(400).json({ error: 'Missing rigBridgeUrl' });
    if (!RIG_BRIDGE_RELAY_KEY) {
      return res.status(503).json({ error: 'Cloud relay not configured — set RIG_BRIDGE_RELAY_KEY in .env' });
    }

    const sessionId = crypto.randomBytes(8).toString('hex');
    const serverUrl = `${req.protocol}://${req.get('host')}`;

    try {
      // Push cloud relay config to the local rig-bridge
      const headers = {
        'Content-Type': 'application/json',
        ...(rigBridgeToken ? { 'X-RigBridge-Token': rigBridgeToken } : {}),
      };

      const response = await ctx.fetch(`${rigBridgeUrl}/api/config`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          cloudRelay: {
            enabled: true,
            url: serverUrl,
            apiKey: RIG_BRIDGE_RELAY_KEY,
            session: sessionId,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return res.status(response.status).json({ error: `Rig Bridge rejected config: ${err}` });
      }

      res.json({ ok: true, session: sessionId, serverUrl });
    } catch (err) {
      res.status(500).json({ error: `Cannot reach Rig Bridge at ${rigBridgeUrl}: ${err.message}` });
    }
  });

  // ─── Local Management: Start/Stop/Status ──────────────────────────────

  app.post('/api/rig-bridge/start', requireWriteAuth, (req, res) => {
    if (rigBridgeProcess && !rigBridgeProcess.killed) {
      return res.status(409).json({ error: 'Rig Bridge is already running', pid: rigBridgeProcess.pid });
    }
    if (!fs.existsSync(RIG_BRIDGE_ENTRY)) {
      return res.status(404).json({ error: 'rig-bridge.js not found — only available for local installs' });
    }
    try {
      const child = spawn('node', [RIG_BRIDGE_ENTRY], {
        cwd: RIG_BRIDGE_DIR,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      rigBridgeProcess = child;
      child.on('exit', (code) => {
        logInfo(`[Rig Bridge] Process exited with code ${code}`);
        rigBridgeProcess = null;
      });
      logInfo(`[Rig Bridge] Launched (PID ${child.pid})`);
      res.json({ ok: true, pid: child.pid });
    } catch (err) {
      logWarn(`[Rig Bridge] Failed to launch: ${err.message}`);
      res.status(500).json({ error: `Failed to launch: ${err.message}` });
    }
  });

  app.post('/api/rig-bridge/stop', requireWriteAuth, (req, res) => {
    if (!rigBridgeProcess || rigBridgeProcess.killed) {
      return res.status(404).json({ error: 'No managed rig-bridge process running' });
    }
    try {
      rigBridgeProcess.kill('SIGTERM');
      logInfo('[Rig Bridge] Sent SIGTERM');
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/rig-bridge/status', async (req, res) => {
    const host = req.query.host || 'http://localhost';
    const port = req.query.port || '5555';
    const url = `${host}:${port}/health`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await ctx.fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        return res.json({ reachable: false, error: `HTTP ${response.status}` });
      }
      const health = await response.json();
      res.json({
        reachable: true,
        managed: !!(rigBridgeProcess && !rigBridgeProcess.killed),
        ...health,
      });
    } catch (err) {
      res.json({
        reachable: false,
        managed: !!(rigBridgeProcess && !rigBridgeProcess.killed),
        error: err.name === 'AbortError' ? 'timeout' : err.message,
      });
    }
  });
};
