const WebSocket = require('ws');

let wss = null;

function initWebSocket(server) {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        console.log(`[WS] Dashboard client connected from ${clientIp}`);

        ws.on('close', () => {
            console.log(`[WS] Dashboard client disconnected (${clientIp})`);
        });

        ws.on('error', (err) => {
            console.error(`[WS] Client error:`, err.message);
        });

        // Send a welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to Biolight Monitor Server',
            timestamp: new Date().toISOString(),
        }));
    });

    console.log('[WS] WebSocket server ready');
}

/**
 * Broadcast a message to all connected dashboard clients
 */
function broadcast(type, data) {
    if (!wss) return;

    const message = JSON.stringify({
        type,
        data,
        timestamp: new Date().toISOString(),
    });

    let sent = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            sent++;
        }
    });

    return sent;
}

/**
 * Broadcast new vital signs to all connected clients
 */
function broadcastVitals(patientMrn, vitals) {
    return broadcast('vitals', { patientMrn, vitals });
}

/**
 * Broadcast alarm to all connected clients
 */
function broadcastAlarm(patientMrn, alarm) {
    return broadcast('alarm', { patientMrn, alarm });
}

/**
 * Broadcast patient info update
 */
function broadcastPatientUpdate(patient) {
    return broadcast('patient_update', { patient });
}

/**
 * Broadcast waveform data
 */
function broadcastWaveform(patientMrn, waveformData) {
    return broadcast('waveform', { patientMrn, waveform: waveformData });
}

/**
 * Broadcast system status update
 */
function broadcastSystemStatus(patientMrn, status) {
    return broadcast('system_status', { patientMrn, status });
}

function getConnectedClients() {
    if (!wss) return 0;
    let count = 0;
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) count++; });
    return count;
}

module.exports = {
    initWebSocket,
    broadcast,
    broadcastVitals,
    broadcastAlarm,
    broadcastPatientUpdate,
    broadcastWaveform,
    broadcastSystemStatus,
    getConnectedClients,
};
