/**
 * Biolight HL7 Server Listener (Monitor as Client Mode)
 * This script acts as a TCP SERVER. 
 * Configure your Biolight Monitor to "Client" mode and point it to:
 * IP: <Your Server IP>
 * Port: 6201
 * 
 * Run: node test_server_listener.js
 */

const net = require('net');

const LISTEN_PORT = 6201;

// MLLP bytes
const VT = 0x0B;
const FS = 0x1C;
const CR = 0x0D;

// Known vital parameter IDs
const PARAM_NAMES = {
    '201': 'Heart Rate (HR)',
    '251': 'SpO2',
    '259': 'Pulse Rate (PR)',
    '351': 'NIBP Systolic',
    '352': 'NIBP Diastolic',
    '353': 'NIBP Mean',
    '401': 'Resp Rate (RR)',
    '1051': 'Temperature T1',
    '1052': 'Temperature T2',
    '1501': 'IBP Systolic',
    '751': 'Cardiac Output',
};

// Message type descriptions
const MSG_TYPES = {
    '1001': 'Module Online/Offline',
    '1004': 'Periodic Vitals',
    '1005': 'NIBP Measurement',
    '1006': 'C.O. Measurement',
    '1009': 'Alarm Limits',
    '1015': 'Waveform Data',
};

function buildACK(msgId) {
    const now = new Date();
    const ts = now.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const ack = `MSH|^~\\&|SERVER|HOST|BIOLIGHT|MONITOR|${ts}||ACK|${msgId}|P|2.6\rMSA|AA|${msgId}\r`;
    const buf = Buffer.alloc(ack.length + 3);
    buf[0] = VT;
    buf.write(ack, 1, 'utf8');
    buf[buf.length - 2] = FS;
    buf[buf.length - 1] = CR;
    return buf;
}

function parseHL7(raw) {
    const segments = raw.split('\r').filter(s => s.trim());
    const result = { type: 'UNKNOWN', msgId: '', vitals: [], raw: segments };

    for (const seg of segments) {
        const fields = seg.split('|');
        const tag = fields[0];

        if (tag === 'MSH') {
            result.msgId = fields[9] || '';
            result.type = MSG_TYPES[result.msgId] || `Type ${result.msgId}`;
        }

        if (tag === 'PID') {
            result.patient = {
                mrn: fields[3] || '',
                name: (fields[5] || '').replace(/\^/g, ' ').trim(),
                dob: fields[7] || '',
                sex: fields[8] || '',
            };
        }

        if (tag === 'OBX') {
            const valueType = fields[2];
            if (valueType === 'NM') {
                const code = (fields[3] || '').split('^')[0];
                const name = PARAM_NAMES[code] || `Code ${code}`;
                const value = fields[5] || '';
                const unit = (fields[6] || '').split('^')[1] || '';
                if (value) result.vitals.push({ name, value, unit });
            }
        }
    }
    return result;
}

function printVitals(parsed, remoteAddress) {
    if (parsed.type.includes('Waveform')) return; // Skip waveform noise

    console.log(`\n📨 [${parsed.type}] from ${remoteAddress} | MsgID: ${parsed.msgId}`);

    if (parsed.patient) {
        const p = parsed.patient;
        console.log(`   👤 Patient: ${p.name || 'Unknown'} | MRN: ${p.mrn} | DOB: ${p.dob} | Sex: ${p.sex}`);
    }

    if (parsed.vitals.length > 0) {
        console.log('   📊 Vitals:');
        parsed.vitals.forEach(v => {
            console.log(`      ✅ ${v.name.padEnd(20)} = ${v.value} ${v.unit}`);
        });
    } else {
        console.log('   ℹ️  No numeric vitals in this message');
    }

    console.log('   ' + '─'.repeat(55));
}

const server = net.createServer((socket) => {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`\n🆕 New connection from ${remoteAddress}`);

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
        console.log(`\n======================================================`);
        console.log(`📡 [DEBUG] Received ${chunk.length} bytes from ${remoteAddress}`);
        console.log(`📡 [RAW DATA HEX] ${chunk.toString('hex')}`);
        console.log(`📡 [RAW DATA TXT] ${chunk.toString('utf8').replace(/\r/g, '<CR>').replace(/\x0B/g, '<VT>').replace(/\x1C/g, '<FS>')}`);

        buffer = Buffer.concat([buffer, chunk]);
        console.log(`📡 [BUFFER] Total buffer size is now ${buffer.length} bytes`);

        while (true) {
            const start = buffer.indexOf(VT);
            if (start === -1) {
                if (buffer.length > 0) {
                    console.log(`⚠️  [WARNING] No MLLP Start Byte (0x0B) found in buffer. Waiting for more data...`);
                }
                break;
            }
            const end = buffer.indexOf(FS, start);
            if (end === -1) {
                console.log(`⚠️  [WARNING] MLLP Start Byte found at index ${start}, but no End Byte (0x1C) found yet. Waiting for rest of message...`);
                break;
            }

            console.log(`✅ [SUCCESS] Complete MLLP message found from index ${start} to ${end}. Extracting and parsing...`);
            const rawMsg = buffer.slice(start + 1, end).toString('utf8');
            buffer = buffer.slice(end + 2);

            try {
                const parsed = parseHL7(rawMsg);
                if (parsed.msgId) {
                    console.log(`📨 [TX] Sending ACK for MsgID: ${parsed.msgId}`);
                    socket.write(buildACK(parsed.msgId));
                } else {
                    console.log(`⚠️  [WARNING] Parsed message did not contain a MessageControlID (MSH-10). Details:`, parsed);
                }
                printVitals(parsed, remoteAddress);
            } catch (err) {
                console.error(`❌ [ERROR] Failed to parse HL7 message:`, err);
                console.error(`❌ [ERROR RAW MSG]`, rawMsg);
            }
        }
        console.log(`======================================================\n`);
    });

    socket.on('error', (err) => {
        console.error(`❌ Socket Error (${remoteAddress}): ${err.message}`);
    });

    socket.on('close', () => {
        console.log(`🔴 Connection closed by ${remoteAddress}`);
    });
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
    console.log(`\n🚀 HL7 Server listening for Biolight Monitor on port ${LISTEN_PORT}`);
    console.log(`📡 Make sure the monitor is set to CLIENT mode and points to this IP.`);
    console.log(`🛑 Press Ctrl+C to stop.\n`);
});
