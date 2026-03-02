/**
 * MLLP Client — connects TO the Biolight monitor (which acts as a TCP server)
 * and receives HL7 messages, emitting them exactly like MLLPServer does.
 *
 * The Biolight monitor can operate in two modes:
 *   SERVER mode: monitor listens on a port, our app connects to it  ← this file handles this
 *   CLIENT mode: monitor connects to our server's port               ← MLLPServer handles this
 *
 * MLLP Framing:
 *   Start: 0x0B (VT)
 *   End:   0x1C 0x0D (FS + CR)
 */

const net = require('net');
const EventEmitter = require('events');

const MLLP_START = 0x0B;
const MLLP_END_1 = 0x1C;
const MLLP_END_2 = 0x0D;

class MLLPClient extends EventEmitter {
    constructor(host, port, options = {}) {
        super();
        this.host = host;
        this.port = port;
        this.reconnectDelay = options.reconnectDelay || 5000;
        this.socket = null;
        this.buffer = Buffer.alloc(0);
        this._stopped = false;
        this._reconnectTimer = null;
        this._messageCount = 0;
    }

    /**
     * Start connecting to the monitor. Auto-reconnects on disconnect.
     */
    start() {
        this._stopped = false;
        this._connect();
    }

    stop() {
        this._stopped = true;
        clearTimeout(this._reconnectTimer);
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        console.log('[MLLP-Client] Stopped.');
    }

    _connect() {
        if (this._stopped) return;

        console.log(`[MLLP-Client] Connecting to monitor at ${this.host}:${this.port}...`);
        this.buffer = Buffer.alloc(0);

        const socket = net.createConnection({ host: this.host, port: this.port });
        this.socket = socket;

        socket.on('connect', () => {
            console.log(`[MLLP-Client] ✅ Connected to monitor at ${this.host}:${this.port}`);
            this.emit('connection', { address: `${this.host}:${this.port}` });
        });

        socket.on('data', (data) => {
            this._handleData(data);
        });

        socket.on('end', () => {
            console.log('[MLLP-Client] Monitor closed connection.');
            this.emit('disconnect', { address: `${this.host}:${this.port}` });
            this._scheduleReconnect();
        });

        socket.on('error', (err) => {
            if (err.code === 'ECONNREFUSED') {
                console.warn(`[MLLP-Client] ⚠  Monitor not reachable at ${this.host}:${this.port} (ECONNREFUSED). Retrying in ${this.reconnectDelay / 1000}s...`);
            } else {
                console.error(`[MLLP-Client] Socket error: ${err.message}`);
            }
            this._scheduleReconnect();
        });

        socket.on('close', () => {
            this._scheduleReconnect();
        });

        // Keep-alive so the monitor doesn't drop us
        socket.setKeepAlive(true, 5000);
    }

    _scheduleReconnect() {
        if (this._stopped) return;
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => this._connect(), this.reconnectDelay);
    }

    _handleData(data) {
        this.buffer = Buffer.concat([this.buffer, data]);

        let startIdx = -1;
        let i = 0;

        while (i < this.buffer.length) {
            if (this.buffer[i] === MLLP_START) {
                startIdx = i;
            }

            if (startIdx >= 0 &&
                i > startIdx &&
                this.buffer[i] === MLLP_END_2 &&
                i > 0 && this.buffer[i - 1] === MLLP_END_1) {

                const messageBytes = this.buffer.slice(startIdx + 1, i - 1);
                const messageStr = messageBytes.toString('utf-8');

                this._messageCount++;
                this.emit('message', {
                    clientId: 1,
                    clientAddress: `${this.host}:${this.port}`,
                    rawMessage: messageStr,
                    receivedAt: new Date(),
                });

                // Send ACK back to monitor
                this._sendAck(messageStr);

                this.buffer = this.buffer.slice(i + 1);
                i = 0;
                startIdx = -1;
                continue;
            }

            i++;
        }

        // Prevent buffer overflow
        if (this.buffer.length > 1024 * 1024) {
            console.warn('[MLLP-Client] Buffer overflow, clearing.');
            this.buffer = Buffer.alloc(0);
        }
    }

    /**
     * Send MLLP-framed ACK back to the monitor after receiving a message.
     * The monitor expects an ACK (AA) response, otherwise it may stop sending.
     */
    _sendAck(rawMessage) {
        if (!this.socket || !this.socket.writable) return;

        // Extract message control ID from MSH segment
        let messageControlId = String(this._messageCount);
        try {
            const mshLine = rawMessage.split('\r').find(s => s.startsWith('MSH'));
            if (mshLine) {
                const fields = mshLine.split('|');
                messageControlId = fields[9] || messageControlId;
            }
        } catch (_) { }

        const now = new Date();
        const ts = formatHL7DateTime(now);
        const ack = `MSH|^~\\&|||||${ts}||ACK|${messageControlId}|P|2.6||||||UTF-8\rMSA|AA|${messageControlId}\r`;

        const buffer = Buffer.alloc(ack.length + 3);
        buffer[0] = MLLP_START;
        buffer.write(ack, 1, 'utf-8');
        buffer[ack.length + 1] = MLLP_END_1;
        buffer[ack.length + 2] = MLLP_END_2;

        try {
            this.socket.write(buffer);
        } catch (err) {
            console.warn('[MLLP-Client] Failed to send ACK:', err.message);
        }
    }
}

function formatHL7DateTime(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}${h}${min}${sec}`;
}

module.exports = MLLPClient;
