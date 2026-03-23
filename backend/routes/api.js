const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const alertController = require('../controllers/alertController');
const authController  = require('../controllers/authController');

// ─── Uploads directory ─────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
    fileFilter: (req, file, cb) => {
        const allowed = /mp4|avi|mov|mkv|webm/;
        cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
    },
});

// ─── Public Routes ─────────────────────────────────────────────────────────
router.post('/register', authController.register);
router.post('/login',    authController.login);

// ─── Protected Routes (require valid JWT) ──────────────────────────────────
router.get('/alerts',              authController.verifyToken, alertController.getAlerts);
router.put('/alerts/:id',          authController.verifyToken, alertController.updateAlertStatus);
router.delete('/alerts/history',   authController.verifyToken, alertController.deleteAllHistory);
router.delete('/alerts/false-alarms', authController.verifyToken, alertController.deleteFalseAlarms);
router.delete('/alerts/:id',       authController.verifyToken, alertController.deleteAlert);

router.post('/analyze-video',      authController.verifyToken, upload.single('video'), alertController.analyzeVideo);
router.post('/analyze-youtube',    authController.verifyToken, alertController.analyzeYoutube);
router.post('/report-case',        authController.verifyToken, alertController.createAlert);
router.post('/report-incident',    authController.verifyToken, upload.single('video'), alertController.reportIncident);

// Webcam proxy — high-frequency, still requires auth
router.post('/webcam-proxy',       authController.verifyToken, alertController.proxyWebcam);

// Stats endpoint
router.get('/stats',               authController.verifyToken, alertController.getStats);

// Feedback loop — saves frames to dataset for retraining
router.post('/feedback',           authController.verifyToken, alertController.submitFeedback);

module.exports = router;
