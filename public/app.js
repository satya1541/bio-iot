/**
 * Biolight Monitor Dashboard — Frontend JavaScript
 * Handles WebSocket connection, data rendering, and waveform animation
 */

// ============ State ============
const state = {
    patients: new Map(), // mrn → patient data
    ws: null,
    connected: false,
    reconnectTimer: null,
};

// ============ DOM Refs ============
const dom = {
    connectionStatus: document.getElementById('connectionStatus'),
    monitorCount: document.getElementById('monitorCount'),
    currentTime: document.getElementById('currentTime'),
    patientsGrid: document.getElementById('patientsGrid'),
    emptyState: document.getElementById('emptyState'),
    alarmBanner: document.getElementById('alarmBanner'),
    alarmText: document.getElementById('alarmText'),
    alarmDismiss: document.getElementById('alarmDismiss'),
    template: document.getElementById('patientCardTemplate'),
};

// ============ WebSocket ============
function connectWS() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        state.connected = true;
        updateConnectionStatus(true);
        console.log('[WS] Connected to server');
        clearTimeout(state.reconnectTimer);
    };

    state.ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            handleWSMessage(msg);
        } catch (err) {
            console.error('[WS] Parse error:', err);
        }
    };

    state.ws.onclose = () => {
        state.connected = false;
        updateConnectionStatus(false);
        console.log('[WS] Disconnected. Reconnecting in 3s...');
        state.reconnectTimer = setTimeout(connectWS, 3000);
    };

    state.ws.onerror = (err) => {
        console.error('[WS] Error:', err);
    };
}

function handleWSMessage(msg) {
    switch (msg.type) {
        case 'vitals':
            updateVitals(msg.data.patientMrn, msg.data.vitals);
            break;
        case 'alarm':
            addAlarm(msg.data.patientMrn, msg.data.alarm);
            break;
        case 'patient_update':
            updatePatientInfo(msg.data.patient);
            break;
        case 'waveform':
            updateWaveform(msg.data.patientMrn, msg.data.waveform);
            break;
        case 'system_status':
            updateSystemStatus(msg.data.patientMrn, msg.data.status);
            break;
        case 'connected':
            console.log('[WS] Server says:', msg.message);
            break;
    }
}

// ============ UI Updates ============

function updateConnectionStatus(connected) {
    const el = dom.connectionStatus;
    if (connected) {
        el.classList.add('connected');
        el.querySelector('span').textContent = 'Connected';
    } else {
        el.classList.remove('connected');
        el.querySelector('span').textContent = 'Disconnected';
    }
}

function getOrCreatePatientCard(mrn) {
    let card = document.querySelector(`.patient-card[data-mrn="${mrn}"]`);
    if (!card) {
        const clone = dom.template.content.cloneNode(true);
        card = clone.querySelector('.patient-card');
        card.dataset.mrn = mrn;
        dom.patientsGrid.appendChild(card);
        dom.emptyState.classList.add('hidden');

        // Init patient state if needed
        if (!state.patients.has(mrn)) {
            state.patients.set(mrn, {
                vitals: {},
                alarms: [],
                waveformBuffer: [],
            });
        }
    }
    return card;
}

function updatePatientInfo(patient) {
    if (!patient || !patient.mrn) return;
    const card = getOrCreatePatientCard(patient.mrn);

    const nameEl = card.querySelector('.patient-name');
    const fullName = [patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Unknown';
    nameEl.textContent = fullName;

    card.querySelector('.mrn').textContent = `MRN: ${patient.mrn}`;

    const bed = patient.bedLocation || patient.ward || '--';
    card.querySelector('.bed').textContent = `Bed: ${bed}`;

    const sexMap = { M: 'Male', F: 'Female', U: '--' };
    card.querySelector('.sex-age').textContent = sexMap[patient.sex] || '--';

    dom.monitorCount.textContent = state.patients.size;
}

function updateVitals(mrn, vitals) {
    if (!mrn || !vitals || vitals.length === 0) return;
    const card = getOrCreatePatientCard(mrn);
    const patientState = state.patients.get(mrn);

    for (const vital of vitals) {
        const name = vital.parameterName;
        // -1 means the parameter is not available / module is offline — skip it
        if (vital.value === -1) continue;
        patientState.vitals[name] = vital;

        // Map parameter names to tile selectors
        switch (name) {
            case 'HR': updateVitalTile(card, 'HR', vital.value, 'bpm', 40, 200); break;
            case 'SpO2': updateVitalTile(card, 'SpO2', vital.value, '%', 80, 100); break;
            case 'PR': updateVitalTile(card, 'PR', vital.value, 'bpm', 40, 200); break;
            case 'RR': updateVitalTile(card, 'RR', vital.value, 'rpm', 0, 40); break;
            case 'T1': updateVitalTile(card, 'T1', vital.value, '°C', 35, 42); break;
            case 'NIBP-S':
                updateNIBP(card, mrn);
                break;
            case 'NIBP-D':
            case 'NIBP-M':
                updateNIBP(card, mrn);
                break;
        }
    }

    // Update timestamp
    const now = new Date();
    card.querySelector('.last-updated').textContent = `Last update: ${now.toLocaleTimeString()}`;
}

function updateVitalTile(card, param, value, unit, min, max) {
    const tile = card.querySelector(`.vital-tile[data-param="${param}"]`);
    if (!tile) return;

    const valueEl = tile.querySelector('.vital-value');
    const displayValue = typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : '--';

    if (valueEl.textContent !== String(displayValue)) {
        valueEl.textContent = displayValue;
        valueEl.classList.add('updated');
        setTimeout(() => valueEl.classList.remove('updated'), 600);
    }

    // Update bar
    const barFill = tile.querySelector('.vital-bar-fill');
    if (barFill && typeof value === 'number') {
        const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
        barFill.style.width = `${pct}%`;
    }
}

function updateNIBP(card, mrn) {
    const patientState = state.patients.get(mrn);
    if (!patientState) return;

    const sysVital = patientState.vitals['NIBP-S'];
    const diaVital = patientState.vitals['NIBP-D'];
    const mapVital = patientState.vitals['NIBP-M'];

    const tile = card.querySelector('.vital-nibp');
    if (!tile) return;

    if (sysVital) {
        const sysEl = tile.querySelector('.nibp-sys');
        sysEl.textContent = Math.round(sysVital.value);
        sysEl.classList.add('updated');
        setTimeout(() => sysEl.classList.remove('updated'), 600);
    }

    if (diaVital) {
        const diaEl = tile.querySelector('.nibp-dia');
        diaEl.textContent = Math.round(diaVital.value);
        diaEl.classList.add('updated');
        setTimeout(() => diaEl.classList.remove('updated'), 600);
    }

    if (mapVital) {
        tile.querySelector('.nibp-map').textContent = Math.round(mapVital.value);
    }
}

function addAlarm(mrn, alarm) {
    const card = getOrCreatePatientCard(mrn);
    const patientState = state.patients.get(mrn);

    // Add to state
    patientState.alarms.unshift(alarm);
    if (patientState.alarms.length > 20) patientState.alarms.pop();

    // Update alarm list in card
    const alarmsList = card.querySelector('.alarms-list');
    alarmsList.innerHTML = '';

    if (patientState.alarms.length === 0) {
        alarmsList.innerHTML = '<div class="no-alarms">No recent alarms</div>';
    } else {
        for (const a of patientState.alarms.slice(0, 5)) {
            const item = document.createElement('div');
            item.className = `alarm-item ${a.alarmLevel <= 1 ? 'warning' : ''}`;
            const time = a.observationTime ? new Date(a.observationTime).toLocaleTimeString() : '--:--';
            item.innerHTML = `
        <span class="alarm-time">${time}</span>
        <span class="alarm-msg">${a.alarmText || 'Unknown alarm'}</span>
      `;
            alarmsList.appendChild(item);
        }
    }

    // Flash card border
    card.classList.add('alarm-active');
    setTimeout(() => card.classList.remove('alarm-active'), 5000);

    // Show banner
    showAlarmBanner(`${alarm.alarmText} — Patient MRN: ${mrn}`);
}

function showAlarmBanner(text) {
    dom.alarmText.textContent = text;
    dom.alarmBanner.classList.add('visible');
    setTimeout(() => dom.alarmBanner.classList.remove('visible'), 8000);
}

function updateSystemStatus(mrn, status) {
    const card = getOrCreatePatientCard(mrn);
    if (status['Monitor Name']) {
        card.querySelector('.monitor-name').textContent = status['Monitor Name'];
    }
}

// ============ Waveform Rendering ============
function updateWaveform(mrn, waveformData) {
    if (!waveformData || !waveformData.dataPoints) return;
    const card = getOrCreatePatientCard(mrn);
    const canvas = card.querySelector('.waveform-canvas');
    if (!canvas) return;

    const patientState = state.patients.get(mrn);
    // Keep a rolling buffer of waveform data
    patientState.waveformBuffer = patientState.waveformBuffer.concat(waveformData.dataPoints);
    // Keep at most 3 seconds of data
    const maxPoints = (waveformData.sampleRate || 256) * 3;
    if (patientState.waveformBuffer.length > maxPoints) {
        patientState.waveformBuffer = patientState.waveformBuffer.slice(-maxPoints);
    }

    drawWaveform(canvas, patientState.waveformBuffer);
}

function drawWaveform(canvas, data) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!data || data.length < 2) return;

    // Find min/max for scaling
    let min = Infinity, max = -Infinity;
    for (const v of data) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    const range = max - min || 1;

    // Draw grid
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.06)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    const step = w / data.length;
    for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = h - ((data[i] - min) / range) * (h - 10) - 5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Glow effect
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();
}

// ============ Clock ============
function updateClock() {
    const now = new Date();
    dom.currentTime.textContent = now.toLocaleTimeString();
}

// ============ Initial Data Load ============
async function loadDashboard() {
    try {
        const res = await fetch('/api/dashboard');
        const json = await res.json();
        if (json.success && json.data) {
            for (const entry of json.data) {
                const p = entry.patient;
                updatePatientInfo({
                    mrn: p.mrn,
                    firstName: p.first_name,
                    lastName: p.last_name,
                    dob: p.date_of_birth,
                    sex: p.sex,
                    bedLocation: p.bed_location,
                    ward: p.ward,
                });

                // Load latest vitals
                if (entry.vitals && entry.vitals.length > 0) {
                    const mappedVitals = entry.vitals.map(v => ({
                        parameterId: v.parameter_id,
                        parameterName: v.parameter_name,
                        value: parseFloat(v.value),
                        unit: v.unit,
                    }));
                    updateVitals(p.mrn, mappedVitals);
                }

                // Load recent alarms
                if (entry.recentAlarms) {
                    for (const a of entry.recentAlarms.reverse()) {
                        const patientState = state.patients.get(p.mrn);
                        if (patientState) {
                            patientState.alarms.push({
                                alarmType: a.alarm_type,
                                alarmText: a.alarm_text,
                                alarmLevel: a.alarm_level,
                                observationTime: a.observation_time,
                            });
                        }
                    }
                    // Refresh alarm display
                    const card = document.querySelector(`.patient-card[data-mrn="${p.mrn}"]`);
                    if (card) {
                        const patientState = state.patients.get(p.mrn);
                        const alarmsList = card.querySelector('.alarms-list');
                        alarmsList.innerHTML = '';
                        if (patientState.alarms.length === 0) {
                            alarmsList.innerHTML = '<div class="no-alarms">No recent alarms</div>';
                        } else {
                            for (const a of patientState.alarms.slice(0, 5)) {
                                const item = document.createElement('div');
                                item.className = `alarm-item ${a.alarmLevel <= 1 ? 'warning' : ''}`;
                                const time = a.observationTime ? new Date(a.observationTime).toLocaleTimeString() : '--:--';
                                item.innerHTML = `<span class="alarm-time">${time}</span><span class="alarm-msg">${a.alarmText}</span>`;
                                alarmsList.appendChild(item);
                            }
                        }
                    }
                }

                // Monitor status
                if (entry.monitorStatus) {
                    updateSystemStatus(p.mrn, {
                        'Monitor Name': entry.monitorStatus.monitor_name,
                    });
                }
            }
        }
    } catch (err) {
        console.error('[API] Failed to load dashboard:', err);
    }
}

// ============ Event Listeners ============
dom.alarmDismiss.addEventListener('click', () => {
    dom.alarmBanner.classList.remove('visible');
});

// ============ Init ============
function init() {
    updateClock();
    setInterval(updateClock, 1000);
    loadDashboard();
    connectWS();
}

init();
