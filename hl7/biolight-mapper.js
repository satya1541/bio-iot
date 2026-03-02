/**
 * Biolight Parameter & Module ID Mappings
 * Based on Biolight PDS Protocol Appendix A
 */

// Parameter IDs → Names (Appendix A.1)
const PARAMETER_MAP = {
    // ECG Parameters (Module 5001)
    201: { name: 'HR', fullName: 'Heart Rate', defaultUnit: 'bpm', module: 'ECG' },
    202: { name: 'QTc', fullName: 'QTc Interval', defaultUnit: 'ms', module: 'ECG' },
    203: { name: 'ΔQTc', fullName: 'Delta QTc', defaultUnit: 'ms', module: 'ECG' },
    204: { name: 'ST-I', fullName: 'ST Segment I', defaultUnit: 'mV', module: 'ECG' },
    205: { name: 'ST-II', fullName: 'ST Segment II', defaultUnit: 'mV', module: 'ECG' },
    206: { name: 'ST-III', fullName: 'ST Segment III', defaultUnit: 'mV', module: 'ECG' },
    207: { name: 'ST-aVR', fullName: 'ST aVR', defaultUnit: 'mV', module: 'ECG' },
    208: { name: 'ST-aVL', fullName: 'ST aVL', defaultUnit: 'mV', module: 'ECG' },
    209: { name: 'ST-aVF', fullName: 'ST aVF', defaultUnit: 'mV', module: 'ECG' },
    210: { name: 'ST-V1', fullName: 'ST V1', defaultUnit: 'mV', module: 'ECG' },
    211: { name: 'ST-V2', fullName: 'ST V2', defaultUnit: 'mV', module: 'ECG' },
    212: { name: 'ST-V3', fullName: 'ST V3', defaultUnit: 'mV', module: 'ECG' },
    213: { name: 'ST-V4', fullName: 'ST V4', defaultUnit: 'mV', module: 'ECG' },
    214: { name: 'ST-V5', fullName: 'ST V5', defaultUnit: 'mV', module: 'ECG' },
    215: { name: 'ST-V6', fullName: 'ST V6', defaultUnit: 'mV', module: 'ECG' },
    217: { name: 'ST-Va', fullName: 'ST Va', defaultUnit: 'mV', module: 'ECG' },
    218: { name: 'ST-Vb', fullName: 'ST Vb', defaultUnit: 'mV', module: 'ECG' },
    219: { name: 'PVCs', fullName: 'PVCs/min', defaultUnit: '/min', module: 'ECG' },
    220: { name: 'QT', fullName: 'QT Interval', defaultUnit: 'ms', module: 'ECG' },

    // SpO2 Parameters (Module 5002)
    251: { name: 'SpO2', fullName: 'Oxygen Saturation', defaultUnit: '%', module: 'SpO2' },
    252: { name: 'PI', fullName: 'Perfusion Index', defaultUnit: '%', module: 'SpO2' },
    258: { name: 'RR', fullName: 'Respiratory Rate (SpO2)', defaultUnit: 'rpm', module: 'SpO2' },
    259: { name: 'PR', fullName: 'Pulse Rate', defaultUnit: 'bpm', module: 'SpO2' },

    // NIBP Parameters (Module 5004)
    351: { name: 'NIBP-S', fullName: 'NIBP Systolic', defaultUnit: 'mmHg', module: 'NIBP' },
    352: { name: 'NIBP-D', fullName: 'NIBP Diastolic', defaultUnit: 'mmHg', module: 'NIBP' },
    353: { name: 'NIBP-M', fullName: 'NIBP Mean', defaultUnit: 'mmHg', module: 'NIBP' },
    354: { name: 'NIBP-SDP', fullName: 'NIBP SDP', defaultUnit: 'mmHg', module: 'NIBP' },
    355: { name: 'NIBP-PR', fullName: 'NIBP Pulse Rate', defaultUnit: 'bpm', module: 'NIBP' },

    // Respiration (Module 5005)
    401: { name: 'RR', fullName: 'Respiratory Rate', defaultUnit: 'rpm', module: 'RESP' },

    // C.O. (Module 5012)
    751: { name: 'C.O.', fullName: 'Cardiac Output', defaultUnit: 'L/min', module: 'CO' },
    752: { name: 'C.I.', fullName: 'Cardiac Index', defaultUnit: 'L/min/m²', module: 'CO' },
    753: { name: 'TI', fullName: 'Injection Temperature', defaultUnit: '°C', module: 'CO' },
    754: { name: 'TB', fullName: 'Blood Temperature', defaultUnit: '°C', module: 'CO' },

    // Temperature (Module 5021)
    1051: { name: 'T1', fullName: 'Temperature 1', defaultUnit: '°C', module: 'TEMP' },
    1052: { name: 'T2', fullName: 'Temperature 2', defaultUnit: '°C', module: 'TEMP' },

    // IBP P1 (Module 5031)
    1501: { name: 'IBP1-Sys', fullName: 'IBP P1 Systolic', defaultUnit: 'mmHg', module: 'IBP-P1' },
    1502: { name: 'IBP1-Dia', fullName: 'IBP P1 Diastolic', defaultUnit: 'mmHg', module: 'IBP-P1' },
    1503: { name: 'IBP1-Mean', fullName: 'IBP P1 Mean', defaultUnit: 'mmHg', module: 'IBP-P1' },
    1504: { name: 'IBP1-PR', fullName: 'IBP P1 Pulse Rate', defaultUnit: 'bpm', module: 'IBP-P1' },
    1505: { name: 'IBP1-PPV', fullName: 'IBP P1 PPV', defaultUnit: '%', module: 'IBP-P1' },

    // IBP P2 (Module 5032)
    1521: { name: 'IBP2-Sys', fullName: 'IBP P2 Systolic', defaultUnit: 'mmHg', module: 'IBP-P2' },
    1522: { name: 'IBP2-Dia', fullName: 'IBP P2 Diastolic', defaultUnit: 'mmHg', module: 'IBP-P2' },
    1523: { name: 'IBP2-Mean', fullName: 'IBP P2 Mean', defaultUnit: 'mmHg', module: 'IBP-P2' },
    1524: { name: 'IBP2-PR', fullName: 'IBP P2 Pulse Rate', defaultUnit: 'bpm', module: 'IBP-P2' },
    1525: { name: 'IBP2-PPV', fullName: 'IBP P2 PPV', defaultUnit: '%', module: 'IBP-P2' },

    // ART (Module 5039)
    1661: { name: 'ART-Sys', fullName: 'Arterial Systolic', defaultUnit: 'mmHg', module: 'ART' },
    1662: { name: 'ART-Dia', fullName: 'Arterial Diastolic', defaultUnit: 'mmHg', module: 'ART' },
    1663: { name: 'ART-Mean', fullName: 'Arterial Mean', defaultUnit: 'mmHg', module: 'ART' },
    1664: { name: 'ART-PR', fullName: 'Arterial Pulse Rate', defaultUnit: 'bpm', module: 'ART' },
    1665: { name: 'ART-PPV', fullName: 'Arterial PPV', defaultUnit: '%', module: 'ART' },

    // PAWP (Module 5041)
    1706: { name: 'PAWP', fullName: 'Pulmonary Artery Wedge Pressure', defaultUnit: 'mmHg', module: 'PAWP' },

    // EWS (Module 5058)
    2051: { name: 'EWS-Total', fullName: 'EWS Total Score', defaultUnit: '', module: 'EWS' },
    2052: { name: 'EWS-Type', fullName: 'EWS Score Type', defaultUnit: '', module: 'EWS' },

    // GCS (Module 5059)
    2101: { name: 'GCS-Total', fullName: 'GCS Total Score', defaultUnit: '', module: 'GCS' },
    2102: { name: 'GCS-Eye', fullName: 'GCS Eye Opening', defaultUnit: '', module: 'GCS' },
    2103: { name: 'GCS-Verbal', fullName: 'GCS Verbal Response', defaultUnit: '', module: 'GCS' },
    2104: { name: 'GCS-Motor', fullName: 'GCS Motor Response', defaultUnit: '', module: 'GCS' },

    // Infusion (Module 5060)
    2151: { name: 'Drop Speed', fullName: 'Drop Speed', defaultUnit: 'drops/min', module: 'Infusion' },
    2152: { name: 'Flow Rate', fullName: 'Flow Rate', defaultUnit: 'mL/h', module: 'Infusion' },

    // Patient Info (Appendix A.4)
    4201: { name: 'Height', fullName: 'Patient Height', defaultUnit: 'cm', module: 'Patient' },
    4202: { name: 'Weight', fullName: 'Patient Weight', defaultUnit: 'kg', module: 'Patient' },
    4203: { name: 'Blood', fullName: 'Blood Type', defaultUnit: '', module: 'Patient' },
    4204: { name: 'Pace', fullName: 'Pacemaker', defaultUnit: '', module: 'Patient' },
};

// Module IDs → Names (Appendix A.3)
const MODULE_MAP = {
    5001: 'ECG',
    5002: 'SpO2',
    5003: 'SpO2-L',
    5004: 'NIBP',
    5005: 'RESP',
    5012: 'CO',
    5021: 'TEMP-A',
    5022: 'TEMP-B',
    5031: 'IBP-P1',
    5032: 'IBP-P2',
    5033: 'IBP-P3',
    5034: 'IBP-P4',
    5039: 'ART',
    5041: 'PAWP',
    5057: 'NMT',
    5058: 'EWS',
    5059: 'GCS',
    5060: 'Infusion',
};

// Message Control IDs (Appendix A.5)
const MESSAGE_TYPE_MAP = {
    1001: 'MODULE_ONLINE',
    1002: 'MODULE_OFFLINE',
    1003: 'SUPPORTED_PARAMS',
    1004: 'PERIODIC_VALUES',
    1005: 'NIBP_APERIODIC',
    1006: 'CO_APERIODIC',
    1009: 'ALARM_LIMITS',
    1010: 'ALARM_LEVELS',
    1011: 'ALARM_SWITCHES',
    1015: 'WAVEFORM_DATA',
    1025: 'NMT_APERIODIC',
    1026: 'PAWP_APERIODIC',
    1027: 'EWS_APERIODIC',
    1028: 'GCS_APERIODIC',
    1029: 'QUERY_REQUEST',
};

// Parameter attribute IDs (Appendix A.2)
const ATTRIBUTE_MAP = {
    1: 'ALARM_UPPER_LIMIT',
    2: 'ALARM_LOWER_LIMIT',
    3: 'ALARM_LEVEL',
    4: 'ALARM_SWITCH',
    5: 'MODULE_STATUS',
    7: 'SUPPORTED_PARAMETER',
};

// System parameter IDs (for OBX with 4000-series IDs)
const SYSTEM_PARAM_MAP = {
    4002: 'Monitor Name',
    4021: 'Tec Highest Level',
    4022: 'Phy Highest Level',
    4023: 'Alarm Setting',
    4024: 'ECG Lead Type',
    4025: 'PR Source',
    4026: 'RR Source',
};

// Unit IDs (Appendix A.9)
const UNIT_MAP = {
    11: 'mmHg',
    12: 'kPa',
    14: '%',
    21: '°C',
    22: '°F',
    31: 'cm',
    32: 'inch',
    41: 'kg',
    42: 'lb',
};

// Waveform IDs (Appendix A.8)
const WAVEFORM_MAP = {
    30001: 'ECG_I',
    30002: 'ECG_II',
    30003: 'ECG_III',
    30004: 'ECG_aVR',
    30005: 'ECG_aVL',
    30006: 'ECG_aVF',
    30007: 'ECG_V1',
    30008: 'ECG_V2',
    30009: 'ECG_V3',
    30010: 'ECG_V4',
    30011: 'ECG_V5',
    30012: 'ECG_V6',
    30015: 'ECG_V',       // 5-lead V channel (sent by real monitor)
    30021: 'SpO2_Pleth',  // SpO2 plethysmograph (real monitor uses 30021, not 30051)
    30031: 'RESP',        // Respiration waveform (real monitor uses 30031)
    30051: 'SpO2_Pleth2',
    30061: 'RESP2',
    30071: 'IBP_P1',
    30072: 'IBP_P2',
    30081: 'CO2',
    30082: 'IBP_P2',
};

function getParameterInfo(paramId) {
    return PARAMETER_MAP[paramId] || { name: `PARAM_${paramId}`, fullName: `Unknown Parameter ${paramId}`, defaultUnit: '', module: 'Unknown' };
}

function getModuleName(moduleId) {
    return MODULE_MAP[moduleId] || `MODULE_${moduleId}`;
}

function getMessageType(controlId) {
    return MESSAGE_TYPE_MAP[controlId] || `UNKNOWN_${controlId}`;
}

function getUnitName(unitId) {
    return UNIT_MAP[unitId] || '';
}

function getWaveformName(waveformId) {
    return WAVEFORM_MAP[waveformId] || `WAVE_${waveformId}`;
}

function getSystemParamName(paramId) {
    return SYSTEM_PARAM_MAP[paramId] || `SYS_${paramId}`;
}

module.exports = {
    PARAMETER_MAP, MODULE_MAP, MESSAGE_TYPE_MAP, ATTRIBUTE_MAP,
    SYSTEM_PARAM_MAP, UNIT_MAP, WAVEFORM_MAP,
    getParameterInfo, getModuleName, getMessageType,
    getUnitName, getWaveformName, getSystemParamName,
};
