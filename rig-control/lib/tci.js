/**
 * TCI (Transceiver Control Interface) Client
 * Handles WebSocket connection and command protocol for Expert Electronics SDR
 * 
 * Protocol Documentation: https://github.com/ExpertSDR3/TCI
 * 
 * Connection Flow:
 * 1. Connect to WebSocket ws://host:port
 * 2. Receive PROTOCOL, DEVICE, TRX_COUNT, VFO_LIMITS
 * 3. Send START command
 * 4. Receive status updates (VFO, MODULATION, TRX)
 * 5. Send commands and receive notifications
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class TCIClient extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.ws = null;
        this.connected = false;
        this.trx = config.tci?.trx || 0;
        this.vfo = config.tci?.vfo || 0;
        this.clientName = config.tci?.clientName || 'OpenHamClock';
        this.reconnectTimer = null;
        this.autoReconnect = config.autoReconnect !== false;
        this.protocolVersion = null;
        this.deviceName = null;
    }

    /**
     * Connect to TCI server
     */
    connect() {
        if (this.ws) {
            console.log('[TCI] Already connected or connecting');
            return;
        }

        const url = `ws://${this.config.radio.host}:${this.config.radio.port}`;
        console.log(`[TCI] Connecting to ${url}...`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log('[TCI] WebSocket connection established');
            this.connected = true;
            this.emit('connected');

            // Send START command to begin receiving updates
            this.sendCommand('START');
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data.toString());
        });

        this.ws.on('close', () => {
            console.log('[TCI] Connection closed');
            this.handleDisconnect();
        });

        this.ws.on('error', (err) => {
            console.error('[TCI] WebSocket error:', err.message);
            this.emit('error', err);
        });
    }

    /**
     * Disconnect from TCI server
     */
    disconnect() {
        this.autoReconnect = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Handle disconnection and reconnection
     */
    handleDisconnect() {
        this.connected = false;
        this.ws = null;
        this.emit('disconnected');

        if (this.autoReconnect) {
            console.log('[TCI] Reconnecting in 5 seconds...');
            this.reconnectTimer = setTimeout(() => {
                this.reconnect();
            }, 5000);
        }
    }

    /**
     * Reconnect to TCI server
     */
    reconnect() {
        console.log('[TCI] Attempting to reconnect...');
        this.connect();
    }

    /**
     * Send command to TCI server
     * Format: COMMAND:arg1,arg2;
     */
    sendCommand(cmd) {
        if (!this.ws || !this.connected) {
            console.warn('[TCI] Not connected, cannot send command:', cmd);
            return;
        }

        // Ensure command ends with semicolon
        const fullCmd = cmd.endsWith(';') ? cmd : `${cmd};`;
        this.ws.send(fullCmd);
    }

    /**
     * Handle incoming message from TCI server
     */
    handleMessage(message) {
        // Messages can be multiple commands separated by newlines
        const commands = message.trim().split('\n');

        commands.forEach(cmd => {
            if (cmd) {
                this.parseMessage(cmd);
            }
        });
    }

    /**
     * Parse a single TCI message
     * Format: COMMAND:arg1,arg2;
     */
    parseMessage(message) {
        // Remove trailing semicolon
        const msg = message.trim().replace(/;$/, '');

        // Split into command and arguments
        const colonIndex = msg.indexOf(':');
        if (colonIndex === -1) {
            // Command without arguments
            const command = msg;
            this.handleCommand(command, []);
            return;
        }

        const command = msg.substring(0, colonIndex);
        const argsString = msg.substring(colonIndex + 1);
        const args = argsString.split(',');

        this.handleCommand(command, args);
    }

    /**
     * Handle parsed command
     */
    handleCommand(command, args) {
        switch (command) {
            case 'PROTOCOL':
                this.protocolVersion = args[0];
                console.log(`[TCI] Protocol version: ${this.protocolVersion}`);
                this.emit('protocol', this.protocolVersion);
                break;

            case 'DEVICE':
                this.deviceName = args[0];
                console.log(`[TCI] Device: ${this.deviceName}`);
                this.emit('device', this.deviceName);
                break;

            case 'VFO':
                // VFO:trx,vfo,frequency
                const vfoTrx = parseInt(args[0]);
                const vfoNum = parseInt(args[1]);
                const frequency = parseInt(args[2]);

                // Only emit if it's our TRX and VFO
                if (vfoTrx === this.trx && vfoNum === this.vfo) {
                    this.emit('frequency', frequency);
                }
                break;

            case 'MODULATION':
                // MODULATION:trx,modulation
                const modTrx = parseInt(args[0]);
                const modulation = args[1];

                // Only emit if it's our TRX
                if (modTrx === this.trx) {
                    this.emit('mode', modulation);
                }
                break;

            case 'TRX':
                // TRX:trx,state
                const trxNum = parseInt(args[0]);
                const trxState = args[1] === 'true';

                // Only emit if it's our TRX
                if (trxNum === this.trx) {
                    this.emit('ptt', trxState);
                }
                break;

            case 'TRX_COUNT':
                console.log(`[TCI] TRX count: ${args[0]}`);
                break;

            case 'VFO_LIMITS':
                console.log(`[TCI] VFO limits: ${args[0]} - ${args[1]} Hz`);
                break;

            case 'MODULATIONS_LIST':
                console.log(`[TCI] Supported modulations: ${args.join(', ')}`);
                break;

            default:
                // Ignore unknown commands
                break;
        }
    }

    /**
     * Get current frequency (via events, not direct query)
     */
    getFrequency() {
        // TCI uses push notifications, no direct query
        // Frequency is received via 'frequency' event
        return new Promise((resolve) => {
            const handler = (freq) => {
                this.removeListener('frequency', handler);
                resolve(freq);
            };
            this.once('frequency', handler);
        });
    }

    /**
     * Set frequency
     * Command: VFO:trx,vfo,frequency;
     */
    setFrequency(hz) {
        const cmd = `VFO:${this.trx},${this.vfo},${hz}`;
        this.sendCommand(cmd);
    }

    /**
     * Get current mode (via events, not direct query)
     */
    getMode() {
        // TCI uses push notifications, no direct query
        // Mode is received via 'mode' event
        return new Promise((resolve) => {
            const handler = (mode) => {
                this.removeListener('mode', handler);
                resolve(mode);
            };
            this.once('mode', handler);
        });
    }

    /**
     * Set mode
     * Command: MODULATION:trx,modulation;
     */
    setMode(mode) {
        const cmd = `MODULATION:${this.trx},${mode}`;
        this.sendCommand(cmd);
    }

    /**
     * Get PTT status (via events, not direct query)
     */
    getPTT() {
        // TCI uses push notifications, no direct query
        // PTT is received via 'ptt' event
        return new Promise((resolve) => {
            const handler = (ptt) => {
                this.removeListener('ptt', handler);
                resolve(ptt);
            };
            this.once('ptt', handler);
        });
    }

    /**
     * Set PTT
     * Command: TRX:trx,state;
     */
    setPTT(state) {
        const cmd = `TRX:${this.trx},${state}`;
        this.sendCommand(cmd);
    }
}

module.exports = TCIClient;
