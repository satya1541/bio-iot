/**
 * Biolight HL7 Simulator
 * Generates realistic Biolight PDS Protocol HL7 messages for testing
 * 
 * Usage: node simulator/hl7-simulator.js [host] [port]
 * Default: connects to localhost:6201
 */

const net = require('net');
const path = require('path');

// Load env from parent dir
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MLLP_START = Buffer.from([0x0B]);
const MLLP_END = Buffer.from([0x1C, 0x0D]);

const HOST = process.argv[2] || 'localhost';
const PORT = parseInt(process.argv[3]) || parseInt(process.env.MLLP_PORT) || 6201;
const INTERVAL = parseInt(process.env.SIM_INTERVAL_MS) || 5000;

// Simulated patient data
const PATIENT = {
    mrn: '1001',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    dob: '19850315',
    sex: 'M',
    height: 172.0,
    weight: 74.5,
    bloodType: 'B+',
    ward: 'ICU',
    bed: 'ICU-B3',
};

// Vital sign ranges for simulation
const VITAL_RANGES = {
    HR: { min: 55, max: 100, normal: 72, variance: 5 },
    SpO2: { min: 93, max: 100, normal: 98, variance: 1 },
    PR: { min: 55, max: 100, normal: 72, variance: 5 },
    PI: { min: 1, max: 15, normal: 5.5, variance: 1.5 },
    RR: { min: 12, max: 25, normal: 16, variance: 3 },
    NIBP_S: { min: 90, max: 160, normal: 120, variance: 10 },
    NIBP_D: { min: 50, max: 100, normal: 78, variance: 8 },
    NIBP_M: { min: 65, max: 115, normal: 92, variance: 8 },
    T1: { min: 36.0, max: 38.5, normal: 36.7, variance: 0.3 },
    T2: { min: 36.0, max: 38.5, normal: 36.5, variance: 0.3 },
};

let messageCounter = 0;
let lastNIBPTime = null;
let nibpInterval = 0;

function getTimestamp() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}${h}${min}${sec}`;
}

function randomVital(config) {
    const delta = (Math.random() - 0.5) * 2 * config.variance;
    let value = config.normal + delta;
    value = Math.max(config.min, Math.min(config.max, value));
    return Math.round(value * 100) / 100;
}

function generateECGWaveform(sampleRate = 256) {
    // Generate 1 second of realistic ECG-like waveform data
    const samples = [];
    for (let i = 0; i < sampleRate; i++) {
        const t = i / sampleRate;
        // Simulate ECG-like signal with R-peak
        let value = 0;
        // Baseline wander
        value += 50 * Math.sin(2 * Math.PI * 0.3 * t);
        // P wave
        value += 200 * Math.exp(-Math.pow((t - 0.15) * 20, 2));
        // QRS complex
        value += -300 * Math.exp(-Math.pow((t - 0.35) * 40, 2));
        value += 8000 * Math.exp(-Math.pow((t - 0.38) * 50, 2));
        value += -400 * Math.exp(-Math.pow((t - 0.41) * 40, 2));
        // T wave
        value += 500 * Math.exp(-Math.pow((t - 0.55) * 15, 2));
        // Add noise
        value += (Math.random() - 0.5) * 100;
        samples.push(Math.round(value));
    }
    return samples;
}

/**
 * Build Module Online + Supported Parameters message (sent first on connection)
 */
function buildModuleOnlineMessage() {
    const ts = getTimestamp();
    const lines = [
        `MSH|^~\\&|||||${ts}||ORU^R01^ORU_R01|1001|P|2.6||||||UTF-8`,
        `PID|||${PATIENT.mrn}||${PATIENT.firstName}^${PATIENT.lastName}||${PATIENT.dob}|${PATIENT.sex}`,
        `OBX||NM|4201^Height^BHC||${PATIENT.height}|31^cm^BHC|||||F`,
        `OBX||NM|4202^Weight^BHC||${PATIENT.weight}|41^kg^BHC|||||F`,
        `OBX||NM|4203^Blood^BHC||3||||||F`,
        `OBX||NM|4204^Pace^BHC||2||||||F`,
        `PV1||I|${PATIENT.ward}^^${PATIENT.bed}&0&127.0.0.1&0&0|||||||||||||||A`,
        `OBR||||Monitor|||${ts}`,
        // ECG module online
        `OBX||CE|5^^BHC||5001^ECG^BHC||||||F`,
        `OBX||CE|7^^BHC|5001|201^HR^BHC||||||F`,
        `OBX||CE|7^^BHC|5001|219^PVCs^BHC||||||F`,
        // SpO2 module online
        `OBX||CE|5^^BHC||5002^SPO2^BHC||||||F`,
        `OBX||CE|7^^BHC|5002|251^SPO2^BHC||||||F`,
        `OBX||CE|7^^BHC|5002|259^PR^BHC||||||F`,
        `OBX||CE|7^^BHC|5002|252^PI^BHC||||||F`,
        // NIBP module online
        `OBX||CE|5^^BHC||5004^NIBP^BHC||||||F`,
        `OBX||CE|7^^BHC|5004|351^NIBP S^BHC||||||F`,
        `OBX||CE|7^^BHC|5004|352^NIBP D^BHC||||||F`,
        `OBX||CE|7^^BHC|5004|353^NIBP M^BHC||||||F`,
        `OBX||CE|7^^BHC|5004|355^NIBP PR^BHC||||||F`,
        // RESP module online
        `OBX||CE|5^^BHC||5005^RESP^BHC||||||F`,
        `OBX||CE|7^^BHC|5005|401^RR^BHC||||||F`,
        // TEMP module online
        `OBX||CE|5^^BHC||5021^TEMPA^BHC||||||F`,
        `OBX||CE|7^^BHC|5021|1051^T01^BHC||||||F`,
        `OBX||CE|7^^BHC|5021|1052^T02^BHC||||||F`,
    ];
    return lines.join('\r');
}

/**
 * Build Periodic Parameter Values message (sent every interval)
 */
function buildPeriodicMessage() {
    const ts = getTimestamp();
    const hr = randomVital(VITAL_RANGES.HR);
    const spo2 = randomVital(VITAL_RANGES.SpO2);
    const pr = randomVital(VITAL_RANGES.PR);
    const pi = randomVital(VITAL_RANGES.PI);
    const rr = randomVital(VITAL_RANGES.RR);
    const t1 = randomVital(VITAL_RANGES.T1);
    const t2 = randomVital(VITAL_RANGES.T2);

    const lines = [
        `MSH|^~\\&|||||${ts}||ORU^R01^ORU_R01|1004|P|2.6||||||UTF-8`,
        `PID|||${PATIENT.mrn}||${PATIENT.firstName}^${PATIENT.lastName}||${PATIENT.dob}|${PATIENT.sex}`,
        `OBX||NM|4201^Height^BHC||${PATIENT.height}|31^cm^BHC|||||F`,
        `OBX||NM|4202^Weight^BHC||${PATIENT.weight}|41^kg^BHC|||||F`,
        `PV1||I|${PATIENT.ward}^^${PATIENT.bed}&0&127.0.0.1&0&0|||||||||||||||A`,
        `OBR||||Monitor|||${ts}`,
        // ECG
        `OBX||NM|201^HR^BHC|5001|${Math.round(hr)}||||||F`,
        `OBX||NM|219^PVCs^BHC|5001|0||||||F`,
        // SpO2
        `OBX||NM|251^SPO2^BHC|5002|${Math.round(spo2)}||||||F`,
        `OBX||NM|252^PI^BHC|5002|${pi}||||||F`,
        `OBX||NM|259^PR^BHC|5002|${Math.round(pr)}||||||F`,
        // RR
        `OBX||NM|401^RR^BHC|5005|${Math.round(rr)}||||||F`,
        // Temperature
        `OBX||NM|1051^T01^BHC|5021|${t1}|21^C^BHC|||||F`,
        `OBX||NM|1052^T02^BHC|5021|${t2}|21^C^BHC|||||F`,
        // System params
        `OBX||ST|4002^Monitor Name^BHC||ICU_Monitor_01||||||F`,
        `OBX||CE|4021^Tec Highest Level^BHC||0^Unknown^BHC||||||F`,
        `OBX||CE|4022^Phy Highest Level^BHC||0^Unknown^BHC||||||F`,
        `OBX||CE|4023^Alarm Setting^BHC||0^Normal^BHC||||||F`,
        `OBX||CE|4024^ECG Lead Type^BHC||2^5 Lead^BHC||||||F`,
        `OBX||CE|4025^PR_Source^BHC||1^SpO2^BHC||||||F`,
        `OBX||CE|4026^RR_Source^BHC||1^ECG^BHC||||||F`,
    ];

    return lines.join('\r');
}

/**
 * Build NIBP aperiodic measurement message (every ~30s)
 */
function buildNIBPMessage() {
    const ts = getTimestamp();
    const nibpS = randomVital(VITAL_RANGES.NIBP_S);
    const nibpD = randomVital(VITAL_RANGES.NIBP_D);
    const nibpM = Math.round((nibpS + 2 * nibpD) / 3);
    const nibpPR = randomVital(VITAL_RANGES.HR);

    const lines = [
        `MSH|^~\\&|||||${ts}||ORU^R01^ORU_R01|1005|P|2.6||||||UTF-8`,
        `PID|||${PATIENT.mrn}||${PATIENT.firstName}^${PATIENT.lastName}||${PATIENT.dob}|${PATIENT.sex}`,
        `OBX||NM|4201^Height^BHC||${PATIENT.height}|31^cm^BHC|||||F`,
        `OBX||NM|4202^Weight^BHC||${PATIENT.weight}|41^kg^BHC|||||F`,
        `PV1||I|${PATIENT.ward}^^${PATIENT.bed}&0&127.0.0.1&0&0|||||||||||||||A`,
        `OBR||||Monitor|||${ts}`,
        `OBX||NM|351^NIBP S^BHC|5004|${Math.round(nibpS)}|11^mmHg^BHC|||||F||APERIODIC|${ts}`,
        `OBX||NM|352^NIBP D^BHC|5004|${Math.round(nibpD)}|11^mmHg^BHC|||||F||APERIODIC|${ts}`,
        `OBX||NM|353^NIBP M^BHC|5004|${Math.round(nibpM)}|11^mmHg^BHC|||||F||APERIODIC|${ts}`,
        `OBX||NM|355^NIBP PR^BHC|5004|${Math.round(nibpPR)}||||||F||APERIODIC|${ts}`,
        `OBX||ST|4002^Monitor Name^BHC||ICU_Monitor_01||||||F`,
        `OBX||CE|4023^Alarm Setting^BHC||0^Normal^BHC||||||F`,
    ];

    return lines.join('\r');
}

/**
 * Build Waveform Data message
 */
function buildWaveformMessage() {
    const ts = getTimestamp();
    const ecgData = generateECGWaveform(256);

    const lines = [
        `MSH|^~\\&|||||${ts}||ORU^R01^ORU_R01|1015|P|2.6||||||UTF-8`,
        `PID|||${PATIENT.mrn}||${PATIENT.firstName}^${PATIENT.lastName}||${PATIENT.dob}|${PATIENT.sex}`,
        `OBX||NM|4201^Height^BHC||${PATIENT.height}|31^cm^BHC|||||F`,
        `OBX||NM|4202^Weight^BHC||${PATIENT.weight}|41^kg^BHC|||||F`,
        `PV1||I|${PATIENT.ward}^^${PATIENT.bed}&0&127.0.0.1&0&0|||||||||||||||A`,
        `OBR||||Monitor|||${ts}`,
        // ECG II channel definition
        `OBX||CD|30002^ECG_II^BHC|1|1^^0.001&mV^^256^-300000&300000||||||F`,
        // ECG II timing
        `OBX||TS|30002^ECG_II^BHC|1|${ts}||||||F`,
        // ECG II waveform data
        `OBX||NA|30002^ECG_II^BHC|1|${ecgData.join('^')}||||||F`,
        // ECG II annotation (empty)
        `OBX||CE|30002^ECG_II^BHC|1|||||||F`,
    ];

    return lines.join('\r');
}

/**
 * Build Physiological Alarm message
 */
function buildAlarmMessage() {
    const ts = getTimestamp();
    const alarms = [
        { id: 10051, text: 'HR High' },
        { id: 10052, text: 'HR Low' },
        { id: 10151, text: 'SpO2 High' },
        { id: 10152, text: 'SpO2 Low' },
    ];
    const alarm = alarms[Math.floor(Math.random() * alarms.length)];

    const lines = [
        `MSH|^~\\&|||||${ts}||ORU^R01^ORU_R01|1004|P|2.6||||||UTF-8`,
        `PID|||${PATIENT.mrn}||${PATIENT.firstName}^${PATIENT.lastName}||${PATIENT.dob}|${PATIENT.sex}`,
        `PV1||I|${PATIENT.ward}^^${PATIENT.bed}&0&127.0.0.1&0&0|||||||||||||||A`,
        `OBR||||Monitor|||${ts}`,
        `OBX||CE|3||${alarm.id}^${alarm.text}^BHC||||||F|||${ts}`,
    ];

    return lines.join('\r');
}

/**
 * Wrap HL7 message in MLLP framing
 */
function wrapMLLP(hl7Message) {
    const msgBuffer = Buffer.from(hl7Message, 'utf-8');
    return Buffer.concat([MLLP_START, msgBuffer, MLLP_END]);
}

// --- Main simulator logic ---

function startSimulator() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║     Biolight HL7 Simulator                       ║');
    console.log('╠═══════════════════════════════════════════════════╣');
    console.log(`║  Connecting to: ${HOST}:${PORT}`);
    console.log(`║  Interval: ${INTERVAL}ms`);
    console.log(`║  Patient: ${PATIENT.firstName} ${PATIENT.lastName} (MRN: ${PATIENT.mrn})`);
    console.log('╚═══════════════════════════════════════════════════╝');
    console.log('');

    const socket = new net.Socket();
    let connected = false;
    let reconnectTimer = null;

    function connect() {
        socket.connect(PORT, HOST);
    }

    socket.on('connect', () => {
        connected = true;
        console.log(`[SIM] Connected to ${HOST}:${PORT}`);

        // Send module online message first
        console.log('[SIM] Sending module online message...');
        const onlineMsg = wrapMLLP(buildModuleOnlineMessage());
        socket.write(onlineMsg);
        messageCounter++;

        // Start periodic sending
        let periodicCounter = 0;

        const sendInterval = setInterval(() => {
            if (!connected) {
                clearInterval(sendInterval);
                return;
            }

            periodicCounter++;

            // Always send periodic vitals
            const periodicMsg = wrapMLLP(buildPeriodicMessage());
            socket.write(periodicMsg);
            messageCounter++;
            console.log(`[SIM] #${messageCounter} Sent periodic vitals`);

            // Send NIBP every 6th interval (~30s)
            if (periodicCounter % 6 === 0) {
                const nibpMsg = wrapMLLP(buildNIBPMessage());
                socket.write(nibpMsg);
                messageCounter++;
                console.log(`[SIM] #${messageCounter} Sent NIBP measurement`);
            }

            // Send waveform every 2nd interval
            if (periodicCounter % 2 === 0) {
                const waveMsg = wrapMLLP(buildWaveformMessage());
                socket.write(waveMsg);
                messageCounter++;
                console.log(`[SIM] #${messageCounter} Sent waveform data`);
            }

            // Send alarm occasionally (every 10th interval)
            if (periodicCounter % 10 === 0) {
                const alarmMsg = wrapMLLP(buildAlarmMessage());
                socket.write(alarmMsg);
                messageCounter++;
                console.log(`[SIM] #${messageCounter} Sent physiological alarm`);
            }

        }, INTERVAL);
    });

    socket.on('data', (data) => {
        // Server may send ACK — just log it
        const str = data.toString('utf-8').replace(/[\x0B\x1C\x0D]/g, '');
        if (str.includes('ACK')) {
            // ACK received, don't need to do anything
        }
    });

    socket.on('error', (err) => {
        console.error(`[SIM] Connection error: ${err.message}`);
        connected = false;
    });

    socket.on('close', () => {
        connected = false;
        console.log('[SIM] Connection closed. Reconnecting in 3s...');
        reconnectTimer = setTimeout(() => {
            connect();
        }, 3000);
    });

    connect();

    // Handle exit
    process.on('SIGINT', () => {
        console.log('\n[SIM] Shutting down simulator...');
        connected = false;
        clearTimeout(reconnectTimer);
        socket.destroy();
        process.exit(0);
    });
}

startSimulator();
