/**
 * Biolight HL7 Raw Data Test
 * Connects to monitor at 192.168.0.194:6201 and prints whatever comes in.
 * Run: node test_listener.js
 */

const net = require('net');

const MONITOR_IP = '192.168.0.194';
const MONITOR_PORT = 6201;

// MLLP framing bytes
const VT = 0x0B;   // Start of message
const FS = 0x1C;   // End of message
const CR = 0x0D;   // Carriage return

console.log(`\n🔌 Connecting to Biolight Monitor at ${MONITOR_IP}:${MONITOR_PORT} ...\n`);

const client = net.createConnection({ host: MONITOR_IP, port: MONITOR_PORT }, () => {
    console.log('✅ Connected! Waiting for HL7 data...\n');
    console.log('─'.repeat(60));
});

let buffer = Buffer.alloc(0);

client.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);

    // Extract MLLP-framed messages
    while (true) {
        const startIdx = buffer.indexOf(VT);
        if (startIdx === -1) break;

        const endIdx = buffer.indexOf(FS, startIdx);
        if (endIdx === -1) break;

        // Extract message between VT and FS
        const rawMsg = buffer.slice(startIdx + 1, endIdx).toString('utf8');
        buffer = buffer.slice(endIdx + 2); // Skip FS + CR

        console.log('\n📨 HL7 Message Received:');
        console.log('─'.repeat(60));

        // Print each segment on its own line
        rawMsg.split('\r').forEach(segment => {
            if (segment.trim()) {
                const segType = segment.substring(0, 3);
                const emoji = { MSH: '📋', PID: '👤', PV1: '🛏️ ', OBR: '🔬', OBX: '💊' };
                console.log(`${emoji[segType] || '  '} ${segment}`);
            }
        });
        console.log('─'.repeat(60));
    }
});

client.on('error', (err) => {
    console.error(`\n❌ Connection error: ${err.message}`);
    if (err.code === 'ECONNREFUSED') {
        console.log('   → Monitor may be configured as CLIENT (it pushes to you).');
        console.log('   → Try switching to SERVER mode: node test_server.js');
    }
});

client.on('close', () => {
    console.log('\n🔴 Connection closed by monitor.');
});

// Keep alive
client.setKeepAlive(true, 5000);

console.log('Press Ctrl+C to stop.\n');
