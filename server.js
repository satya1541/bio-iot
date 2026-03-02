/**
 * Biolight Patient Monitor HL7 Receiver Server
 * 
 * Main entry point — wires together:
 *   - MySQL database (auto-creates schema)
 *   - MLLP TCP server (receives HL7 messages from monitors)
 *   - HL7 parser (decodes vitals, alarms, waveforms)
 *   - Express HTTP server (REST API + static dashboard)
 *   - WebSocket (real-time push to dashboard clients)
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');

const { initializeDatabase, upsertPatient, insertVitalSigns, insertAlarm, insertWaveform, upsertMonitorStatus } = require('./models/database');
const MLLPServer = require('./hl7/mllp-server');
const MLLPClient = require('./hl7/mllp-client');
const { parseHL7Message } = require('./hl7/hl7-parser');
const apiRoutes = require('./routes/api');
const wsHandler = require('./websocket/ws-handler');

const HTTP_PORT = parseInt(process.env.HTTP_PORT) || 3000;
const MLLP_PORT = parseInt(process.env.MLLP_PORT) || 6201;

// Biolight monitor network address (for CLIENT mode — monitor acts as TCP server)
const MONITOR_IP = process.env.MONITOR_IP || '';
const MONITOR_PORT = parseInt(process.env.MONITOR_PORT) || 6201;

async function main() {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║   Biolight Patient Monitor — HL7 Receiver Server     ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');

    // 1. Initialize database
    console.log('[STARTUP] Initializing MySQL database...');
    try {
        await initializeDatabase();
    } catch (err) {
        console.error('[STARTUP] Failed to initialize SQLite database:', err.message);
        process.exit(1);
    }

    // 2. Start Express HTTP server
    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/api', apiRoutes);

    const httpServer = http.createServer(app);

    // 3. Initialize WebSocket on the HTTP server
    wsHandler.initWebSocket(httpServer);

    httpServer.listen(HTTP_PORT, () => {
        console.log(`[HTTP] Dashboard & API running at http://localhost:${HTTP_PORT}`);
    });

    // -----------------------------------------------------------------------
    // Helper: process a received HL7 message regardless of where it came from
    // (passive MLLP server OR active MLLP client connection to the monitor)
    // -----------------------------------------------------------------------
    async function processHL7Message({ clientId, clientAddress, rawMessage, receivedAt }) {
        try {
            const parsed = parseHL7Message(rawMessage);
            if (!parsed || !parsed.patient) {
                console.warn('[HL7] Received message without patient data, skipping');
                return;
            }

            // Stabilise MRN: the Biolight monitor sends PID with an empty MRN field.
            // We fall back to the monitor IP (extracted from PV1) or the TCP client address.
            let mrn = parsed.patient.mrn;
            if (!mrn || mrn.startsWith('MRN_')) {
                // Use monitor IP from PV1, or fall back to client address
                const monitorIp = parsed.patient.monitorIp || clientAddress.split(':')[0] || 'MONITOR';
                mrn = `MON_${monitorIp.replace(/\./g, '_')}`;
                parsed.patient.mrn = mrn;
            }

            const msgType = parsed.biologyMessageType || 'UNKNOWN';
            const vitalCount = parsed.vitals.length;
            const alarmCount = parsed.alarms.length;
            const waveCount = parsed.waveforms.filter(w => w.type === 'data').length;
            console.log(`[HL7] ← ${msgType} | MRN: ${mrn} | Vitals: ${vitalCount} | Alarms: ${alarmCount} | Waveforms: ${waveCount}`);

            // Save patient info
            await upsertPatient({
                mrn,
                firstName: parsed.patient.firstName || '',
                lastName: parsed.patient.lastName || '',
                dob: parsed.patient.dob || null,
                sex: parsed.patient.sex || 'U',
                height: parsed.patient.height || null,
                weight: parsed.patient.weight || null,
                bloodType: parsed.patient.bloodType || null,
                patientType: parsed.patient.patientType || 'U',
                bedLocation: parsed.patient.bedLocation || '',
                ward: parsed.patient.ward || '',
                monitorIp: parsed.patient.monitorIp || clientAddress,
                attendingDoctor: parsed.patient.attendingDoctor || '',
            });

            // Save vital signs
            if (parsed.vitals.length > 0) {
                const vitalsToInsert = parsed.vitals.map(v => ({
                    patientMrn: mrn,
                    parameterId: v.parameterId,
                    parameterName: v.parameterName,
                    moduleId: v.moduleId,
                    moduleName: v.moduleName,
                    value: v.value,
                    unit: v.unit,
                    isAperiodic: v.isAperiodic,
                    observationTime: v.observationTime || parsed.obr?.observationDateTime || receivedAt,
                }));

                await insertVitalSigns(vitalsToInsert);
                wsHandler.broadcastVitals(mrn, parsed.vitals);
            }

            // Save alarms
            for (const alarm of parsed.alarms) {
                await insertAlarm({
                    patientMrn: mrn,
                    alarmType: alarm.alarmType,
                    alarmId: alarm.alarmId,
                    alarmText: alarm.alarmText,
                    alarmLevel: alarm.alarmLevel,
                    observationTime: alarm.observationTime || receivedAt,
                });
                wsHandler.broadcastAlarm(mrn, alarm);
                console.log(`[ALARM] ⚠️  ${alarm.alarmType.toUpperCase()}: ${alarm.alarmText} (Patient: ${mrn})`);
            }

            // Save waveform data
            const waveformData = parsed.waveforms.filter(w => w.type === 'data');
            const waveformDefs = parsed.waveforms.filter(w => w.type === 'definition');

            for (const waveData of waveformData) {
                const def = waveformDefs.find(d => d.waveformId === waveData.waveformId && d.channel === waveData.channel);

                await insertWaveform({
                    patientMrn: mrn,
                    waveformId: waveData.waveformId,
                    waveformName: waveData.waveformName,
                    channel: waveData.channel,
                    sampleRate: def?.sampleRate || null,
                    sensitivity: def?.sensitivity || null,
                    sensitivityUnit: def?.sensitivityUnit || '',
                    dataPoints: JSON.stringify(waveData.dataPoints),
                    observationTime: parsed.obr?.observationDateTime || receivedAt,
                });

                wsHandler.broadcastWaveform(mrn, {
                    waveformName: waveData.waveformName,
                    channel: waveData.channel,
                    sampleRate: def?.sampleRate || 256,
                    dataPoints: waveData.dataPoints,
                });
            }

            // Save monitor status (system parameters)
            if (Object.keys(parsed.systemParams).length > 0) {
                const sp = parsed.systemParams;
                await upsertMonitorStatus({
                    patientMrn: mrn,
                    monitorName: sp['Monitor Name'] || '',
                    standbyState: 0,
                    phyHighest: 0,
                    tecHighest: 0,
                    alarmSetting: sp['Alarm Setting'] || 'Normal',
                    ecgLeadType: sp['ECG Lead Type'] || 'Unknown',
                    prSource: sp['PR Source'] || 'Unknown',
                    rrSource: sp['RR Source'] || 'Unknown',
                });
                wsHandler.broadcastSystemStatus(mrn, parsed.systemParams);
            }

            // Broadcast patient update
            wsHandler.broadcastPatientUpdate(parsed.patient);

        } catch (err) {
            console.error('[HL7] Error processing message:', err?.message || String(err));
            if (err?.stack) console.error(err.stack);
        }
    }

    // 4a. Start passive MLLP TCP server (for simulator / CLIENT-mode monitor)
    const mllpServer = new MLLPServer(MLLP_PORT);

    mllpServer.on('message', async (payload) => {
        await processHL7Message(payload);
    });

    mllpServer.on('connection', ({ clientId, address }) => {
        console.log(`[MLLP] Monitor connected: Client #${clientId} from ${address}`);
    });

    mllpServer.on('disconnect', ({ clientId, address }) => {
        console.log(`[MLLP] Monitor disconnected: Client #${clientId} (${address})`);
    });

    mllpServer.start();

    // 4b. ALSO try to connect TO the monitor as a client (SERVER mode monitor)
    // If MONITOR_IP is set, actively connect to the monitor's TCP port.
    let mllpClient = null;
    if (MONITOR_IP) {
        console.log(`[STARTUP] Monitor IP configured: ${MONITOR_IP}:${MONITOR_PORT} — starting MLLP client...`);
        mllpClient = new MLLPClient(MONITOR_IP, MONITOR_PORT, { reconnectDelay: 5000 });

        mllpClient.on('message', async (payload) => {
            await processHL7Message(payload);
        });

        mllpClient.on('connection', () => {
            console.log(`[MLLP-Client] ✅ Monitor at ${MONITOR_IP}:${MONITOR_PORT} connected — dashboard will now receive live data!`);
        });

        mllpClient.on('disconnect', () => {
            console.log(`[MLLP-Client] Monitor at ${MONITOR_IP}:${MONITOR_PORT} disconnected.`);
        });

        mllpClient.start();
    } else {
        console.log('[STARTUP] ⚠  MONITOR_IP not set in .env — only simulator/client-mode connections will work.');
        console.log('[STARTUP]    To connect to a real monitor, add MONITOR_IP=192.168.0.194 to server/.env');
    }

    // Status log every 30 seconds
    setInterval(() => {
        const passiveClients = mllpServer.getClientCount();
        const activeClient = (mllpClient && mllpClient.socket && !mllpClient.socket.destroyed) ? 1 : 0;
        const dashboardClients = wsHandler.getConnectedClients();
        console.log(`[STATUS] Monitor connections: ${passiveClients + activeClient} (passive: ${passiveClients}, active-client: ${activeClient}) | Dashboard clients: ${dashboardClients}`);
    }, 30000);

    console.log('');
    console.log('[STARTUP] ✅ Server ready!');
    console.log(`[STARTUP]    Dashboard: http://localhost:${HTTP_PORT}`);
    console.log(`[STARTUP]    MLLP port: ${MLLP_PORT}`);
    console.log(`[STARTUP]    API:       http://localhost:${HTTP_PORT}/api/dashboard`);
    console.log('');
    console.log('[STARTUP] To test, run in a separate terminal:');
    console.log(`[STARTUP]    node simulator/hl7-simulator.js`);
    console.log('');
}

main().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
