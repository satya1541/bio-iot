/**
 * Biolight HL7 Receiver with ACK + Vital Parameter Parsing
 * Connects to monitor, sends ACK, prints vital numbers clearly.
 * Run: node test_hl7_receiver.js
 */

const net = require('net');

const MONITOR_IP = '192.168.0.194';
const MONITOR_PORT = 6201;

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
            // Only parse NM (numeric) — skip waveform arrays (NA, CD, CE)
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

function printVitals(parsed) {
    if (parsed.type.includes('Waveform')) return; // Skip waveform noise

    console.log(`\n📨 [${parsed.type}] MsgID: ${parsed.msgId}`);

    if (parsed.patient) {
        const p = parsed.patient;
        console.log(`   👤 Patient: ${p.name || 'Unknown'} | MRN: ${p.mrn} | DOB: ${p.dob} | Sex: ${p.sex}`);
    }

    if (parsed.vitals.length > 0) {
        console.log('   📊 Vitals:');
        parsed.vitals.forEach(v => {
            console.log(`      ✅ ${v.name.padEnd(20)} = ${v.value} ${v.unit}`);
        });
    } else if (!parsed.type.includes('Waveform')) {
        console.log('   ℹ️  No numeric vitals in this message (config/alarm/status packet)');
    }

    console.log('   ' + '─'.repeat(55));
}

// ── Main ──────────────────────────────────────────────────
console.log(`\n🔌 Connecting to Biolight Monitor ${MONITOR_IP}:${MONITOR_PORT} ...\n`);

const client = net.createConnection({ host: MONITOR_IP, port: MONITOR_PORT }, () => {
    console.log('✅ Connected! Listening for HL7 messages...');
    console.log('   (Waveform packets are silently filtered — only vitals shown)\n');
    console.log('─'.repeat(60));
});

let buffer = Buffer.alloc(0);

client.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
        const start = buffer.indexOf(VT);
        if (start === -1) break;
        const end = buffer.indexOf(FS, start);
        if (end === -1) break;

        const rawMsg = buffer.slice(start + 1, end).toString('utf8');
        buffer = buffer.slice(end + 2);

        // Send ACK immediately
        const parsed = parseHL7(rawMsg);
        if (parsed.msgId) {
            client.write(buildACK(parsed.msgId));
        }

        printVitals(parsed);
    }
});

client.on('error', (err) => {
    console.error(`\n❌ Error: ${err.message}`);
});

client.on('close', () => {
    console.log('\n🔴 Monitor closed the connection.');
});

client.setKeepAlive(true, 5000);
console.log('Press Ctrl+C to stop.\n');
