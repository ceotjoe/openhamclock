/**
 * FlexRadio SmartSDR API Client
 * Handles TCP connection and command protocol for Flex-6000/8000 series
 * 
 * Protocol Documentation: https://github.com/flexradio/smartsdr-api-docs/wiki
 * 
 * Connection Flow:
 * 1. Connect to TCP port 4992
 * 2. Send client identification
 * 3. Receive radio handle
 * 4. Subscribe to slice status updates
 * 5. Send commands and receive responses
 */

const net = require('net');
const EventEmitter = require('events');

class FlexRadioClient extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.socket = null;
        this.connected = false;
        this.handle = null; // Radio handle from connection
        this.sliceId = config.flexradio?.slice || 0;
        this.buffer = ''; // Buffer for incomplete lines
        this.commandQueue = [];
        this.sequenceNumber = 0;
        this.pendingCommands = new Map(); // Track commands waiting for responses
        this.reconnectTimer = null;
        this.autoReconnect = config.autoReconnect !== false;
    }

    /**
     * Connect to FlexRadio
     */
    connect() {
        if (this.socket) {
            console.log('[FlexRadio] Already connected or connecting');
            return;
        }

        console.log(`[FlexRadio] Connecting to ${this.config.radio.host}:${this.config.radio.port}`);

        this.socket = new net.Socket();
        this.socket.setEncoding('utf8');

        this.socket.on('connect', () => {
            console.log('[FlexRadio] TCP connection established');
            this.sendClientIdentification();
        });

        this.socket.on('data', (data) => {
            this.handleData(data);
        });

        this.socket.on('close', () => {
            console.log('[FlexRadio] Connection closed');
            this.handleDisconnect();
        });

        this.socket.on('error', (err) => {
            console.error('[FlexRadio] Socket error:', err.message);
            this.emit('error', err);
        });

        this.socket.connect(this.config.radio.port, this.config.radio.host);
    }

    /**
     * Disconnect from FlexRadio
     */
    disconnect() {
        this.autoReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
    }

    /**
     * Handle disconnection and reconnection
     */
    handleDisconnect() {
        this.connected = false;
        this.handle = null;
        this.socket = null;
        this.pendingCommands.clear();
        this.emit('disconnected');

        if (this.autoReconnect) {
            console.log('[FlexRadio] Reconnecting in 5 seconds...');
            this.reconnectTimer = setTimeout(() => {
                this.reconnect();
            }, 5000);
        }
    }

    /**
     * Reconnect to FlexRadio
     */
    reconnect() {
        console.log('[FlexRadio] Attempting to reconnect...');
        this.connect();
    }

    /**
     * Send client identification
     */
    sendClientIdentification() {
        const clientName = this.config.flexradio?.clientName || 'OpenHamClock';
        this.sendCommand(`client program ${clientName}`, (response) => {
            if (response.code === 0) {
                console.log('[FlexRadio] Client identified successfully');
            }
        });
    }

    /**
     * Handle incoming data from socket
     */
    handleData(data) {
        this.buffer += data;

        // Process complete lines
        let lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

        lines.forEach(line => {
            line = line.trim();
            if (line) {
                this.parseLine(line);
            }
        });
    }

    /**
     * Parse a line from the radio
     */
    parseLine(line) {
        // Handle different message types
        if (line.startsWith('H')) {
            // Handle assignment: H<handle>
            this.handle = line.substring(1);
            console.log(`[FlexRadio] Received handle: ${this.handle}`);
            this.connected = true;
            this.emit('connected');

            // Subscribe to slice updates
            this.subscribeToSlice(this.sliceId);
        } else if (line.startsWith('R')) {
            // Response: R<seq>|<code>|<message>
            this.parseResponse(line);
        } else if (line.startsWith('S')) {
            // Status update: S<handle>|<status>
            this.parseStatusUpdate(line);
        } else if (line.startsWith('M')) {
            // Message: M<handle>|<message>
            this.parseMessage(line);
        } else if (line.startsWith('V')) {
            // Version: V<version>
            const version = line.substring(1);
            console.log(`[FlexRadio] Radio version: ${version}`);
            this.emit('version', version);
        }
    }

    /**
     * Parse command response
     */
    parseResponse(line) {
        // Format: R<seq>|<code>|<message>
        const parts = line.substring(1).split('|');
        const seq = parseInt(parts[0]);
        const code = parseInt(parts[1]);
        const message = parts.slice(2).join('|');

        const response = { seq, code, message };

        // Find and call pending command callback
        if (this.pendingCommands.has(seq)) {
            const callback = this.pendingCommands.get(seq);
            this.pendingCommands.delete(seq);
            if (callback) {
                callback(response);
            }
        }

        if (code !== 0) {
            console.warn(`[FlexRadio] Command ${seq} failed: ${code} - ${message}`);
        }
    }

    /**
     * Parse status update
     */
    parseStatusUpdate(line) {
        // Format: S<handle>|<key>=<value> <key>=<value> ...
        const pipeIndex = line.indexOf('|');
        if (pipeIndex === -1) return;

        const statusLine = line.substring(pipeIndex + 1);
        const status = this.parseKeyValuePairs(statusLine);

        // Check if this is a slice status update
        if (statusLine.startsWith('slice ')) {
            const sliceMatch = statusLine.match(/^slice (\d+)/);
            if (sliceMatch) {
                const sliceId = parseInt(sliceMatch[1]);
                if (sliceId === this.sliceId) {
                    this.emit('status', {
                        frequency: parseFloat(status.RF_frequency) * 1e6, // Convert MHz to Hz
                        mode: status.mode,
                        tx: status.tx === '1',
                        active: status.active === '1',
                        rxant: status.rxant,
                        txant: status.txant
                    });
                }
            }
        }
    }

    /**
     * Parse message
     */
    parseMessage(line) {
        // Format: M<handle>|<message>
        const pipeIndex = line.indexOf('|');
        if (pipeIndex === -1) return;

        const message = line.substring(pipeIndex + 1);
        console.log(`[FlexRadio] Message: ${message}`);
        this.emit('message', message);
    }

    /**
     * Parse key=value pairs from status string
     */
    parseKeyValuePairs(str) {
        const result = {};
        // Match key=value pairs, handling quoted values
        const regex = /(\w+)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;
        let match;

        while ((match = regex.exec(str)) !== null) {
            const key = match[1];
            let value = match[2];

            // Remove quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }

            result[key] = value;
        }

        return result;
    }

    /**
     * Subscribe to slice status updates
     */
    subscribeToSlice(sliceId) {
        this.sendCommand(`sub slice ${sliceId}`, (response) => {
            if (response.code === 0) {
                console.log(`[FlexRadio] Subscribed to slice ${sliceId}`);
            } else {
                console.error(`[FlexRadio] Failed to subscribe to slice ${sliceId}: ${response.message}`);
            }
        });
    }

    /**
     * Send command to radio
     */
    sendCommand(cmd, callback) {
        if (!this.socket || !this.connected) {
            console.warn('[FlexRadio] Not connected, queueing command:', cmd);
            this.commandQueue.push({ cmd, callback });
            return;
        }

        this.sequenceNumber++;
        const seq = this.sequenceNumber;
        const fullCmd = `C${seq}|${cmd}\n`;

        if (callback) {
            this.pendingCommands.set(seq, callback);
        }

        this.socket.write(fullCmd);
    }

    /**
     * Get current frequency
     */
    getFrequency(callback) {
        // Frequency is received via status updates, not a direct query
        // Return a promise that resolves with next status update
        return new Promise((resolve) => {
            const handler = (status) => {
                this.removeListener('status', handler);
                resolve(status.frequency);
            };
            this.once('status', handler);
        });
    }

    /**
     * Set frequency
     */
    setFrequency(hz, callback) {
        const mhz = (hz / 1e6).toFixed(6);
        this.sendCommand(`slice tune ${this.sliceId} ${mhz}`, callback);
    }

    /**
     * Get current mode
     */
    getMode(callback) {
        // Mode is received via status updates
        return new Promise((resolve) => {
            const handler = (status) => {
                this.removeListener('status', handler);
                resolve(status.mode);
            };
            this.once('status', handler);
        });
    }

    /**
     * Set mode
     */
    setMode(mode, callback) {
        this.sendCommand(`slice set ${this.sliceId} mode=${mode}`, callback);
    }

    /**
     * Get PTT status
     */
    getPTT(callback) {
        // PTT is received via status updates
        return new Promise((resolve) => {
            const handler = (status) => {
                this.removeListener('status', handler);
                resolve(status.tx);
            };
            this.once('status', handler);
        });
    }

    /**
     * Set PTT
     */
    setPTT(state, callback) {
        const cmd = state ? 'xmit 1' : 'xmit 0';
        this.sendCommand(cmd, callback);
    }
}

module.exports = FlexRadioClient;
