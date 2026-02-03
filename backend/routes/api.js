const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const alertController = require('../controllers/alertController');

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// Routes
router.post('/analyze-video', upload.single('video'), alertController.analyzeVideo);
router.post('/analyze-youtube', alertController.analyzeYoutube);
router.get('/alerts', alertController.getAlerts);
router.put('/alerts/:id', alertController.updateAlertStatus);
router.delete('/alerts/history', alertController.deleteAllHistory);
router.delete('/alerts/false-alarms', alertController.deleteFalseAlarms);
router.delete('/alerts/:id', alertController.deleteAlert);

// Auth Routes
const authController = require('../controllers/authController');
router.post('/register', authController.register);
router.post('/login', authController.login);

// Manual Reporting
router.post('/report-case', alertController.createAlert);
router.post('/report-incident', upload.single('video'), alertController.reportIncident);

// Webcam Proxy (To avoid CORS issues)
router.post('/webcam-proxy', alertController.proxyWebcam);

module.exports = router;
