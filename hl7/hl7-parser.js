/**
 * HL7 v2.6 Message Parser for Biolight PDS Protocol
 * Parses pipe-delimited HL7 messages into structured JSON
 */

const mapper = require('./biolight-mapper');

/**
 * Parse a raw HL7 message string into structured data
 * @param {string} rawMessage - Raw HL7 message (after MLLP unwrapping)
 * @returns {object} Parsed message object
 */
function parseHL7Message(rawMessage) {
    // --- Protocol Reference: Section 6 Message Instruction ---
    // The protocol uses standard HL7 v2.6 syntax where fields are pipe '|' delimited,
    // and segments end with Carriage Return '\r' (0x0D).
    const segments = rawMessage
        .split('\r')
        .filter(s => s.trim().length > 0)
        .map(s => s.trim());

    if (segments.length === 0) return null;

    const result = {
        raw: rawMessage,
        msh: null,
        messageType: null,
        messageControlId: null,
        biologyMessageType: null,
        timestamp: null,
        patient: null,
        pv1: null,
        obr: null,
        vitals: [],
        alarms: [],
        waveforms: [],
        systemParams: {},
        moduleEvents: [],
        alarmConfig: [],
    };

    for (const segment of segments) {
        const segType = segment.substring(0, 3);

        switch (segType) {
            case 'MSH':
                result.msh = parseMSH(segment);
                result.messageType = result.msh.messageType;
                result.messageControlId = result.msh.messageControlId;
                result.biologyMessageType = mapper.getMessageType(parseInt(result.msh.messageControlId));
                result.timestamp = result.msh.dateTime;
                break;
            case 'PID':
                result.patient = parsePID(segment);
                break;
            case 'PV1':
                result.pv1 = parsePV1(segment);
                break;
            case 'OBR':
                result.obr = parseOBR(segment);
                break;
            case 'OBX':
                parseOBX(segment, result);
                break;
        }
    }

    // Merge PV1 into patient
    if (result.patient && result.pv1) {
        result.patient.patientClass = result.pv1.patientClass;
        result.patient.bedLocation = result.pv1.bedLocation;
        result.patient.ward = result.pv1.ward;
        result.patient.monitorIp = result.pv1.monitorIp;
        result.patient.attendingDoctor = result.pv1.attendingDoctor;
        result.patient.patientType = result.pv1.patientType;
    }

    return result;
}

/**
 * Parse MSH (Message Header) segment
 * --- Protocol Reference: Section 6.1 MSH - Message Header ---
 * Contains message routing info and the Message Type (ORU^R01 for vitals, QRY^R02 for query).
 */
function parseMSH(segment) {
    const fields = splitFields(segment);
    // splitFields for MSH returns slice(1) so:
    //   fields[0] = MSH-2 (encodingChars = ^~\&)
    //   fields[1] = MSH-3 (sendingApp)
    //   fields[2] = MSH-4 (sendingFacility)
    //   fields[3] = MSH-5 (receivingApp)
    //   fields[4] = MSH-6 (receivingFacility)
    //   fields[5] = MSH-7 (dateTime)
    //   fields[6] = MSH-8 (security, usually empty)
    //   fields[7] = MSH-9 (messageType)
    //   fields[8] = MSH-10 (messageControlId)
    //   fields[9] = MSH-11 (processingId)
    //   fields[10] = MSH-12 (versionId)
    //   fields[16] = MSH-18 (characterSet)
    return {
        fieldSeparator: '|',
        encodingChars: fields[0] || '^~\\&',
        sendingApp: fields[1] || '',
        receivingApp: fields[3] || '',
        dateTime: parseHL7DateTime(fields[5] || ''),
        messageType: fields[7] || '',
        messageControlId: fields[8] || '',
        processingId: fields[9] || 'P',
        versionId: fields[10] || '2.6',
        characterSet: fields[16] || 'UTF-8',
    };
}

/**
 * Parse PID (Patient Identification) segment
 * --- Protocol Reference: Section 6.2 PID - Patient Identification ---
 * Extracts MRN, Name, DOB, and Sex.
 */
function parsePID(segment) {
    const fields = splitFields(segment);

    // PID-5: Patient Name (FirstName^LastName)
    const nameComponents = (fields[4] || '').split('^');
    const firstName = nameComponents[0] || '';
    const lastName = nameComponents[1] || '';

    // PID-7: DOB
    const dob = parseHL7Date(fields[6] || '');

    // PID-8: Sex
    const sex = fields[7] || 'U';

    return {
        mrn: fields[2] || `MRN_${Date.now()}`,
        firstName,
        lastName,
        dob,
        sex: ['M', 'F', 'U'].includes(sex) ? sex : 'U',
        height: null,
        weight: null,
        bloodType: null,
    };
}

/**
 * Parse PV1 (Patient Visit) segment
 * --- Protocol Reference: Section 6.3 PV1 - Patient Visit ---
 * Extracts location data (Ward, Room, Bed location, and Monitor IP).
 */
function parsePV1(segment) {
    const fields = splitFields(segment);

    // PV1-2: Patient Class (I=Inpatient, O=Outpatient)
    const patientClass = fields[1] || 'I';

    // PV1-3: Location <point of care>^<room>^<bed>
    // <bed> = <OfficeName>&<bedId>&<IP>&<IPSeq>&0
    const locationParts = (fields[2] || '').split('^');
    const ward = locationParts[0] || '';
    const room = locationParts[1] || '';
    const bedRaw = locationParts[2] || '';

    // Parse bed info
    const bedParts = bedRaw.split('&');
    const bedLocation = bedRaw;
    const monitorIp = bedParts[2] || '';

    // PV1-7: Attending Doctor
    const attendingDoctor = fields[6] || '';

    // PV1-18: Patient Type (N=Neonate, A=Adult, P=Pediatric, U=Unknown)
    const patientType = fields[17] || 'U';

    return { patientClass, ward, room, bedLocation, monitorIp, attendingDoctor, patientType };
}

/**
 * Parse OBR (Observation Request) segment
 */
function parseOBR(segment) {
    const fields = splitFields(segment);
    return {
        universalServiceId: fields[3] || 'Monitor',
        observationDateTime: parseHL7DateTime(fields[6] || ''),
    };
}

/**
 * Parse OBX (Observation Result) segment and categorize into vitals, alarms, waveforms etc.
 * --- Protocol Reference: Section 6.5 OBX - Observation/Result ---
 * This is the core data segment. OBX-3 contains the Observation ID which tells us
 * if this segment holds a Vital Sign, an Alarm, a Waveform, or Device Status.
 * 
 * E.g., OBX-3 = 201^HR^BHC means Heart Rate.
 *       OBX-3 = 251^SPO2^BHC means SpO2.
 *       OBX-3 = 30002^ECG_II^BHC means ECG Waveform Channel II.
 */
function parseOBX(segment, result) {
    const fields = splitFields(segment);

    const valueType = fields[1] || '';       // OBX-2
    const obsIdentRaw = fields[2] || '';     // OBX-3: ID^Name^BHC
    const subId = fields[3] || '';           // OBX-4: Module ID or channel
    const obsResult = fields[4] || '';       // OBX-5: Value
    const unitRaw = fields[5] || '';         // OBX-6: Unit
    const refRange = fields[6] || '';        // OBX-7
    const resultStatus = fields[10] || 'F';  // OBX-11
    const userDefined = fields[12] || '';    // OBX-13: "APERIODIC" marker
    const obsDateTime = fields[13] || '';    // OBX-14: Observation datetime

    // Parse observation identifier: ID^Name^BHC
    const obsIdParts = obsIdentRaw.split('^');
    const obsId = parseInt(obsIdParts[0]) || 0;
    const obsName = obsIdParts[1] || '';

    // Parse unit: UnitID^UnitName^BHC
    const unitParts = unitRaw.split('^');
    const unitId = parseInt(unitParts[0]) || 0;
    const unitName = unitParts[1] || '';

    const moduleId = parseInt(subId) || null;

    // --- Classify OBX based on observation ID and value type ---

    // --- Protocol Reference: Appendix A.5 Observation Object Identifier ---

    // Patient demographic OBX (IDs 4201-4204)
    // 4201 = Height, 4202 = Weight, 4203 = Blood Type
    if (obsId >= 4201 && obsId <= 4204) {
        if (result.patient) {
            switch (obsId) {
                case 4201:
                    result.patient.height = parseFloat(obsResult) || null;
                    break;
                case 4202:
                    result.patient.weight = parseFloat(obsResult) || null;
                    break;
                case 4203:
                    result.patient.bloodType = obsResult;
                    break;
            }
        }
        return;
    }

    // System parameters (4002, 4021-4026)
    if (obsId >= 4002 && obsId <= 4026) {
        const sysName = mapper.getSystemParamName(obsId);
        let sysValue = obsResult;
        // For CE types, extract readable value
        if (valueType === 'CE') {
            const valParts = obsResult.split('^');
            sysValue = valParts[1] || valParts[0] || '';
        }
        result.systemParams[sysName] = sysValue;
        return;
    }

    // Module online/offline (OBX-3 = 5^^BHC or 6^^BHC)
    if (obsId === 5 || obsId === 6) {
        const moduleParts = obsResult.split('^');
        const modId = parseInt(moduleParts[0]) || 0;
        const modName = moduleParts[1] || mapper.getModuleName(modId);
        result.moduleEvents.push({
            type: obsId === 5 ? 'online' : 'offline',
            moduleId: modId,
            moduleName: modName,
        });
        return;
    }

    // Supported/Unsupported parameters (OBX-3 = 7^^BHC or 8^^BHC)
    if (obsId === 7 || obsId === 8) {
        return; // Just parameter capabilities, skip
    }

    // Alarm config: upper/lower limit (1^^BHC / 2^^BHC)
    if (obsId === 1 || obsId === 2) {
        const paramId = parseInt(subId) || 0;
        const paramInfo = mapper.getParameterInfo(paramId);
        result.alarmConfig.push({
            type: obsId === 1 ? 'upper_limit' : 'lower_limit',
            parameterId: paramId,
            parameterName: paramInfo.name,
            value: parseFloat(obsResult) || 0,
            unit: unitName || paramInfo.defaultUnit,
        });
        return;
    }

    // Alarm level (3^^BHC)
    if (obsId === 3 && valueType === 'NM') {
        const paramId = parseInt(subId) || 0;
        const paramInfo = mapper.getParameterInfo(paramId);
        result.alarmConfig.push({
            type: 'alarm_level',
            parameterId: paramId,
            parameterName: paramInfo.name,
            value: parseInt(obsResult) || 0,
        });
        return;
    }

    // Alarm switch (4^^BHC)
    if (obsId === 4 && valueType === 'NM') {
        const paramId = parseInt(subId) || 0;
        const paramInfo = mapper.getParameterInfo(paramId);
        result.alarmConfig.push({
            type: 'alarm_switch',
            parameterId: paramId,
            parameterName: paramInfo.name,
            value: parseInt(obsResult) || 0,
        });
        return;
    }

    // Physiological alarm (OBX-3 = 3, valueType=CE with alarm info in OBX-5)
    if (obsId === 3 && valueType === 'CE') {
        const alarmParts = obsResult.split('^');
        const alarmId = parseInt(alarmParts[0]) || 0;
        const alarmText = alarmParts[1] || 'Unknown Alarm';
        result.alarms.push({
            alarmType: 'physiological',
            alarmId,
            alarmText,
            alarmLevel: 0, // Would parse from OBX-3 identifier
            observationTime: parseHL7DateTime(obsDateTime),
        });
        return;
    }

    // Waveform data (IDs >= 30000, like 30002 for ECG_II)
    // --- Protocol Reference: Section 6.5.9 Waveform Configuration Parameter ---
    // CD = Channel Def (sample rate), TS = Timing, NA = Raw data array
    if (obsId >= 30000) {
        const waveformName = mapper.getWaveformName(obsId);
        const channel = parseInt(subId) || 1;

        if (valueType === 'CD') {
            // Channel definition — parse sensitivity / sample rate
            const cdParts = obsResult.split('^');
            // Store channel definition as waveform metadata
            const sensComponents = (cdParts[2] || '').split('&');
            const sampleRate = parseInt(cdParts[4]) || 0;
            const sensitivity = parseFloat(sensComponents[0]) || 0;
            const sensUnit = sensComponents[1] || '';

            result.waveforms.push({
                waveformId: obsId,
                waveformName,
                channel,
                type: 'definition',
                sampleRate,
                sensitivity,
                sensitivityUnit: sensUnit,
            });
        } else if (valueType === 'TS') {
            // Timing information
            result.waveforms.push({
                waveformId: obsId,
                waveformName,
                channel,
                type: 'timing',
                observationTime: parseHL7DateTime(obsResult),
            });
        } else if (valueType === 'NA' || valueType === 'NM') {
            // Actual waveform data points
            const dataPoints = obsResult.split('^').map(v => parseInt(v) || 0);
            result.waveforms.push({
                waveformId: obsId,
                waveformName,
                channel,
                type: 'data',
                dataPoints,
                pointCount: dataPoints.length,
            });
        } else if (valueType === 'CE') {
            // Annotation
            result.waveforms.push({
                waveformId: obsId,
                waveformName,
                channel,
                type: 'annotation',
                annotation: obsResult,
            });
        }
        return;
    }

    // Normal vital sign parameter (NM type with known parameter ID)
    // E.g. HR (201), SpO2 (251), NIBP-S (351)
    // --- Protocol Reference: Appendix A.2 Parameter ID ---
    if (valueType === 'NM' && obsId > 100) {
        const paramInfo = mapper.getParameterInfo(obsId);
        const isAperiodic = userDefined === 'APERIODIC';
        const effectiveUnit = unitName || paramInfo.defaultUnit;

        result.vitals.push({
            parameterId: obsId,
            parameterName: paramInfo.name,
            fullName: paramInfo.fullName,
            moduleId,
            moduleName: moduleId ? mapper.getModuleName(moduleId) : paramInfo.module,
            value: parseFloat(obsResult),
            unit: effectiveUnit,
            isAperiodic,
            observationTime: parseHL7DateTime(obsDateTime) || null,
        });
        return;
    }
}

// --- Helper functions ---

function splitFields(segment) {
    // For MSH, the first character after "MSH" is the field separator itself
    if (segment.startsWith('MSH')) {
        // MSH|^~\&|...  — field separator is at position 3
        const sep = segment[3];
        const parts = segment.split(sep);
        // parts[0] = "MSH", parts[1] = "^~\&", parts[2...] = fields
        return parts.slice(1); // Skip "MSH" prefix
    }
    return segment.split('|').slice(1); // Skip segment type
}

function parseHL7DateTime(dtString) {
    if (!dtString || dtString.length < 8) return null;
    const year = dtString.substring(0, 4);
    const month = dtString.substring(4, 6);
    const day = dtString.substring(6, 8);
    const hour = dtString.substring(8, 10) || '00';
    const min = dtString.substring(10, 12) || '00';
    const sec = dtString.substring(12, 14) || '00';
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
}

function parseHL7Date(dtString) {
    if (!dtString || dtString.length < 8) return null;
    const year = dtString.substring(0, 4);
    const month = dtString.substring(4, 6);
    const day = dtString.substring(6, 8);
    return `${year}-${month}-${day}`;
}

module.exports = { parseHL7Message };
