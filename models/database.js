/**
 * Database models — all CRUD operations using MySQL (via mysql2).
 * Connects to XAMPP MySQL through the pool in config/db.js.
 */

const { query, execute } = require('../config/db');

// ── Helpers ───────────────────────────────────────────────

/** Convert a JS Date (or any value) to a MySQL-safe ISO datetime string. */
function toMySQL(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().slice(0, 19).replace('T', ' ');
  return val;
}

// ── Schema ────────────────────────────────────────────────

async function initializeDatabase() {
  await execute(`
        CREATE TABLE IF NOT EXISTS patients (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            mrn              VARCHAR(64) UNIQUE NOT NULL,
            first_name       VARCHAR(128) DEFAULT '',
            last_name        VARCHAR(128) DEFAULT '',
            date_of_birth    DATE NULL,
            sex              CHAR(1) DEFAULT 'U',
            height           FLOAT NULL,
            weight           FLOAT NULL,
            blood_type       VARCHAR(16) NULL,
            patient_type     CHAR(1) DEFAULT 'U',
            bed_location     VARCHAR(128) DEFAULT '',
            ward             VARCHAR(64) DEFAULT '',
            monitor_ip       VARCHAR(64) DEFAULT '',
            attending_doctor VARCHAR(128) DEFAULT '',
            created_at       DATETIME DEFAULT NOW(),
            updated_at       DATETIME DEFAULT NOW() ON UPDATE NOW()
        )
    `);

  await execute(`
        CREATE TABLE IF NOT EXISTS vital_signs (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            patient_mrn     VARCHAR(64) NOT NULL,
            parameter_id    INT NOT NULL,
            parameter_name  VARCHAR(64) NOT NULL,
            module_id       INT NULL,
            module_name     VARCHAR(64) NULL,
            value           FLOAT NULL,
            unit            VARCHAR(32) DEFAULT '',
            is_aperiodic    TINYINT(1) DEFAULT 0,
            observation_time DATETIME NULL,
            recorded_at     DATETIME DEFAULT NOW(),
            INDEX idx_vs_patient (patient_mrn, recorded_at),
            INDEX idx_vs_param   (parameter_name, recorded_at)
        )
    `);

  await execute(`
        CREATE TABLE IF NOT EXISTS alarms (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            patient_mrn      VARCHAR(64) NOT NULL,
            alarm_type       VARCHAR(64) NOT NULL,
            alarm_id         INT NULL,
            alarm_text       VARCHAR(255) NOT NULL,
            alarm_level      INT DEFAULT 0,
            observation_time DATETIME NULL,
            recorded_at      DATETIME DEFAULT NOW()
        )
    `);

  await execute(`
        CREATE TABLE IF NOT EXISTS waveforms (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            patient_mrn      VARCHAR(64) NOT NULL,
            waveform_id      INT NOT NULL,
            waveform_name    VARCHAR(64) NOT NULL,
            channel          INT DEFAULT 1,
            sample_rate      INT NULL,
            sensitivity      FLOAT NULL,
            sensitivity_unit VARCHAR(32) DEFAULT '',
            data_points      MEDIUMTEXT NOT NULL,
            observation_time DATETIME NULL,
            recorded_at      DATETIME DEFAULT NOW()
        )
    `);

  await execute(`
        CREATE TABLE IF NOT EXISTS monitor_status (
            id                      INT AUTO_INCREMENT PRIMARY KEY,
            patient_mrn             VARCHAR(64) UNIQUE NOT NULL,
            monitor_name            VARCHAR(128) DEFAULT '',
            standby_state           INT DEFAULT 0,
            phy_highest_alarm_level INT DEFAULT 0,
            tec_highest_alarm_level INT DEFAULT 0,
            alarm_setting           VARCHAR(32) DEFAULT 'Normal',
            ecg_lead_type           VARCHAR(32) DEFAULT 'Unknown',
            pr_source               VARCHAR(32) DEFAULT 'Unknown',
            rr_source               VARCHAR(32) DEFAULT 'Unknown',
            updated_at              DATETIME DEFAULT NOW() ON UPDATE NOW()
        )
    `);

  console.log('[DB] All tables initialized successfully (MySQL)');
}

// ── CRUD ─────────────────────────────────────────────────

async function upsertPatient(p) {
  await execute(`
        INSERT INTO patients
            (mrn, first_name, last_name, date_of_birth, sex, height, weight,
             blood_type, patient_type, bed_location, ward, monitor_ip, attending_doctor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            first_name       = VALUES(first_name),
            last_name        = VALUES(last_name),
            date_of_birth    = VALUES(date_of_birth),
            sex              = VALUES(sex),
            height           = COALESCE(VALUES(height), height),
            weight           = COALESCE(VALUES(weight), weight),
            blood_type       = COALESCE(VALUES(blood_type), blood_type),
            patient_type     = VALUES(patient_type),
            bed_location     = VALUES(bed_location),
            ward             = VALUES(ward),
            monitor_ip       = COALESCE(VALUES(monitor_ip), monitor_ip),
            attending_doctor = COALESCE(VALUES(attending_doctor), attending_doctor),
            updated_at       = NOW()
    `, [p.mrn, p.firstName, p.lastName, toMySQL(p.dob), p.sex,
  p.height, p.weight, p.bloodType, p.patientType,
  p.bedLocation, p.ward, p.monitorIp, p.attendingDoctor]);
}

async function insertVitalSigns(vitals) {
  if (!vitals || vitals.length === 0) return;
  for (const v of vitals) {
    await execute(`
            INSERT INTO vital_signs
                (patient_mrn, parameter_id, parameter_name, module_id, module_name,
                 value, unit, is_aperiodic, observation_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [v.patientMrn, v.parameterId, v.parameterName, v.moduleId, v.moduleName,
    v.value, v.unit, v.isAperiodic ? 1 : 0, toMySQL(v.observationTime)]);
  }
}

async function insertAlarm(alarm) {
  await execute(`
        INSERT INTO alarms
            (patient_mrn, alarm_type, alarm_id, alarm_text, alarm_level, observation_time)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [alarm.patientMrn, alarm.alarmType, alarm.alarmId,
  alarm.alarmText, alarm.alarmLevel, toMySQL(alarm.observationTime)]);
}

async function insertWaveform(waveform) {
  await execute(`
        INSERT INTO waveforms
            (patient_mrn, waveform_id, waveform_name, channel, sample_rate,
             sensitivity, sensitivity_unit, data_points, observation_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [waveform.patientMrn, waveform.waveformId, waveform.waveformName,
  waveform.channel, waveform.sampleRate, waveform.sensitivity,
  waveform.sensitivityUnit, waveform.dataPoints, toMySQL(waveform.observationTime)]);
}

async function upsertMonitorStatus(status) {
  await execute(`
        INSERT INTO monitor_status
            (patient_mrn, monitor_name, standby_state, phy_highest_alarm_level,
             tec_highest_alarm_level, alarm_setting, ecg_lead_type, pr_source, rr_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            monitor_name            = VALUES(monitor_name),
            standby_state           = VALUES(standby_state),
            phy_highest_alarm_level = VALUES(phy_highest_alarm_level),
            tec_highest_alarm_level = VALUES(tec_highest_alarm_level),
            alarm_setting           = VALUES(alarm_setting),
            ecg_lead_type           = VALUES(ecg_lead_type),
            pr_source               = VALUES(pr_source),
            rr_source               = VALUES(rr_source),
            updated_at              = NOW()
    `, [status.patientMrn, status.monitorName, status.standbyState,
  status.phyHighest, status.tecHighest, status.alarmSetting,
  status.ecgLeadType, status.prSource, status.rrSource]);
}

async function getPatients() {
  return query('SELECT * FROM patients ORDER BY updated_at DESC');
}

async function getLatestVitals(mrn) {
  return query(`
        SELECT vs.* FROM vital_signs vs
        INNER JOIN (
            SELECT parameter_name, MAX(id) AS max_id
            FROM vital_signs
            WHERE patient_mrn = ?
            GROUP BY parameter_name
        ) latest ON vs.id = latest.max_id
        ORDER BY vs.parameter_name
    `, [mrn]);
}

async function getVitalHistory(mrn, parameterName, limit = 100) {
  if (parameterName) {
    return query(
      'SELECT * FROM vital_signs WHERE patient_mrn = ? AND parameter_name = ? ORDER BY recorded_at DESC LIMIT ?',
      [mrn, parameterName, limit]
    );
  }
  return query(
    'SELECT * FROM vital_signs WHERE patient_mrn = ? ORDER BY recorded_at DESC LIMIT ?',
    [mrn, limit]
  );
}

async function getRecentAlarms(mrn, limit = 50) {
  return query(
    'SELECT * FROM alarms WHERE patient_mrn = ? ORDER BY recorded_at DESC LIMIT ?',
    [mrn, limit]
  );
}

async function getDashboardData() {
  const patients = await getPatients();
  const dashboard = [];

  for (const patient of patients) {
    const vitals = await getLatestVitals(patient.mrn);
    const alarms = await query(
      'SELECT * FROM alarms WHERE patient_mrn = ? ORDER BY recorded_at DESC LIMIT 5',
      [patient.mrn]
    );
    const monArr = await query(
      'SELECT * FROM monitor_status WHERE patient_mrn = ?',
      [patient.mrn]
    );
    dashboard.push({
      patient,
      vitals,
      recentAlarms: alarms,
      monitorStatus: monArr[0] || null,
    });
  }
  return dashboard;
}

module.exports = {
  initializeDatabase,
  upsertPatient,
  insertVitalSigns,
  insertAlarm,
  insertWaveform,
  upsertMonitorStatus,
  getPatients,
  getLatestVitals,
  getVitalHistory,
  getRecentAlarms,
  getDashboardData,
};
