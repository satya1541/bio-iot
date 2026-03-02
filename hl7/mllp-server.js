/**
 * MLLP (Minimal Lower Layer Protocol) TCP Server
 * Handles TCP connections and MLLP message framing for HL7 messages
 * 
 * MLLP Framing:
 *   Start: 0x0B (VT)
 *   End:   0x1C 0x0D (FS + CR)
 */

const net = require('net');
const EventEmitter = require('events');

const MLLP_START = 0x0B;  // VT - Vertical Tab
const MLLP_END_1 = 0x1C;  // FS - File Separator
const MLLP_END_2 = 0x0D;  // CR - Carriage Return

class MLLPServer extends EventEmitter {
    constructor(port = 6201) {
        super();
        this.port = port;
        this.server = null;
        this.clients = new Map(); // Track connected clients
        this.clientIdCounter = 0;
    }

    start() {
        this.server = net.createServer((socket) => {
            this._handleConnection(socket);
        });

        this.server.on('error', (err) => {
            console.error('[MLLP] Server error:', err.message);
            this.emit('error', err);
        });

        this.server.listen(this.port, () => {
            console.log(`[MLLP] TCP server listening on port ${this.port}`);
            this.emit('listening', this.port);
        });
    }

    _handleConnection(socket) {
        const clientId = ++this.clientIdCounter;
        const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[MLLP] Client #${clientId} connected from ${clientAddr}`);

        const clientState = {
            id: clientId,
            address: clientAddr,
            buffer: Buffer.alloc(0),
            socket,
        };

        this.clients.set(clientId, clientState);
        this.emit('connection', { clientId, address: clientAddr });

        socket.on('data', (data) => {
            this._handleData(clientState, data);
        });

        socket.on('end', () => {
            console.log(`[MLLP] Client #${clientId} disconnected (${clientAddr})`);
            this.clients.delete(clientId);
            this.emit('disconnect', { clientId, address: clientAddr });
        });

        socket.on('error', (err) => {
            console.error(`[MLLP] Client #${clientId} error:`, err.message);
            this.clients.delete(clientId);
        });

        socket.on('close', () => {
            this.clients.delete(clientId);
        });
    }

    _handleData(clientState, data) {
        // Append incoming data to buffer
        clientState.buffer = Buffer.concat([clientState.buffer, data]);

        // --- Protocol Reference: Section 5.1.2 Lower Layer Protocol (MLLP) ---
        // The Biolight monitor wraps every HL7 message in an MLLP envelope over TCP:
        // START Byte: 0x0B (Vertical Tab)
        // END Bytes:  0x1C (File Separator) followed by 0x0D (Carriage Return)
        //
        // Example over TCP: <0x0B> MSH|^~\&|... <0x1C><0x0D>

        let startIdx = -1;
        let i = 0;

        while (i < clientState.buffer.length) {
            // Look for message start (0x0B)
            if (clientState.buffer[i] === MLLP_START) {
                startIdx = i;
            }

            // Look for message end (0x1C 0x0D)
            if (startIdx >= 0 &&
                i > startIdx &&
                clientState.buffer[i] === MLLP_END_2 &&
                i > 0 && clientState.buffer[i - 1] === MLLP_END_1) {

                // Extract message between start+1 and end-1
                const messageBytes = clientState.buffer.slice(startIdx + 1, i - 1);
                const messageStr = messageBytes.toString('utf-8');

                // Emit the complete HL7 message
                this.emit('message', {
                    clientId: clientState.id,
                    clientAddress: clientState.address,
                    rawMessage: messageStr,
                    receivedAt: new Date(),
                });

                // Remove processed data from buffer
                clientState.buffer = clientState.buffer.slice(i + 1);
                i = 0;
                startIdx = -1;
                continue;
            }

            i++;
        }

        // If buffer is getting too large without finding a complete message, reset
        if (clientState.buffer.length > 1024 * 1024) { // 1MB limit
            console.warn(`[MLLP] Client #${clientState.id} buffer overflow, clearing`);
            clientState.buffer = Buffer.alloc(0);
        }
    }

    /**
     * Send an ACK response to a client
     * --- Protocol Reference: Section 5.1.4 Responded Application Message ---
     * The monitor (Client mode) expects an ACK (Acknowledge) message back after sending
     * an Unsolicited observation message (ORU_R01). If we don't ACK, it might resend or disconnect.
     * The ACK is also wrapped in MLLP Framing.
     */
    sendAck(clientId, messageControlId) {
        const client = this.clients.get(clientId);
        if (!client || !client.socket.writable) return;

        const now = new Date();
        const ts = formatHL7DateTime(now);
        const ack = `MSH|^~\\&|||||${ts}||ACK|${messageControlId}|P|2.6||||||UTF-8\rMSA|AA|${messageControlId}\r`;

        const buffer = Buffer.alloc(ack.length + 3);
        buffer[0] = MLLP_START;
        buffer.write(ack, 1, 'utf-8');
        buffer[ack.length + 1] = MLLP_END_1;
        buffer[ack.length + 2] = MLLP_END_2;

        client.socket.write(buffer);
    }

    getClientCount() {
        return this.clients.size;
    }

    stop() {
        if (this.server) {
            for (const [id, client] of this.clients) {
                client.socket.destroy();
            }
            this.clients.clear();
            this.server.close();
            console.log('[MLLP] Server stopped');
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

module.exports = MLLPServer;
