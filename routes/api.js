const express = require('express');
const router = express.Router();
const db = require('../models/database');

// GET /api/patients — List all patients
router.get('/patients', async (req, res) => {
    try {
        const patients = await db.getPatients();
        res.json({ success: true, data: patients });
    } catch (err) {
        console.error('[API] Error fetching patients:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/patients/:mrn/vitals — Latest vitals for a patient
router.get('/patients/:mrn/vitals', async (req, res) => {
    try {
        const vitals = await db.getLatestVitals(req.params.mrn);
        res.json({ success: true, data: vitals });
    } catch (err) {
        console.error('[API] Error fetching vitals:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/patients/:mrn/vitals/history — Historical vitals
router.get('/patients/:mrn/vitals/history', async (req, res) => {
    try {
        const { parameter, limit } = req.query;
        const vitals = await db.getVitalHistory(
            req.params.mrn,
            parameter || null,
            parseInt(limit) || 100
        );
        res.json({ success: true, data: vitals });
    } catch (err) {
        console.error('[API] Error fetching vital history:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/patients/:mrn/alarms — Recent alarms for a patient
router.get('/patients/:mrn/alarms', async (req, res) => {
    try {
        const { limit } = req.query;
        const alarms = await db.getRecentAlarms(req.params.mrn, parseInt(limit) || 50);
        res.json({ success: true, data: alarms });
    } catch (err) {
        console.error('[API] Error fetching alarms:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/dashboard — Full dashboard overview
router.get('/dashboard', async (req, res) => {
    try {
        const dashboard = await db.getDashboardData();
        res.json({ success: true, data: dashboard });
    } catch (err) {
        console.error('[API] Error fetching dashboard:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
