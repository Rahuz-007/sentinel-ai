const Alert = require('../models/Alert');
const axios  = require('axios');
const path   = require('path');
const fs     = require('fs');
const socketManager = require('../socket');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5000';

// ─── In-Memory Fallback ────────────────────────────────────────────────────
// ── Helper: subtract minutes from now ─────────────────────────
const minsAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

// ── Pre-seeded demo incidents (realistic NYPD-style data) ──────
let inMemoryAlerts = [
    {
        _id: 'demo_001',
        videoName: 'CCTV-CAM-14 · 42nd St & 8th Ave',
        behavior: 'Fighting',
        riskLevel: 'High',
        status: 'Investigating',
        timestamp: minsAgo(4),
        location: { lat: 40.7570, lon: -73.9892 },
        reportedBy: 'Ofc. James Rivera',
        precinct: '14th Precinct – Midtown South',
        notes: 'Two males engaged in physical altercation near Times Square subway entrance. EMS notified.',
    },
    {
        _id: 'demo_002',
        videoName: 'CCTV-CAM-07 · Flatbush Ave & Atlantic Ave',
        behavior: 'Assault',
        riskLevel: 'High',
        status: 'Resolved',
        timestamp: minsAgo(18),
        location: { lat: 40.6840, lon: -73.9775 },
        reportedBy: 'Det. Maria Santos',
        precinct: '78th Precinct – Park Slope',
        notes: 'Suspect apprehended on scene. Victim transported to Kings County Hospital.',
    },
    {
        _id: 'demo_003',
        videoName: 'CCTV-CAM-31 · 125th St & Lenox Ave',
        behavior: 'Fighting',
        riskLevel: 'High',
        status: 'Pending',
        timestamp: minsAgo(2),
        location: { lat: 40.8081, lon: -73.9468 },
        reportedBy: 'Auto-Detection',
        precinct: '28th Precinct – Harlem',
        notes: 'Group altercation outside bus stop. 3 individuals involved. Unit dispatched.',
    },
    {
        _id: 'demo_004',
        videoName: 'CCTV-CAM-22 · Fordham Rd & Grand Concourse',
        behavior: 'Suspicious Activity',
        riskLevel: 'Medium',
        status: 'Verified',
        timestamp: minsAgo(35),
        location: { lat: 40.8614, lon: -73.8907 },
        reportedBy: 'Ofc. Tyrone Williams',
        precinct: '52nd Precinct – Fordham',
        notes: 'Individual observed loitering and following pedestrians. Verbal warning issued.',
    },
    {
        _id: 'demo_005',
        videoName: 'CCTV-CAM-03 · Fulton St & Jay St',
        behavior: 'Fighting',
        riskLevel: 'High',
        status: 'Investigating',
        timestamp: minsAgo(8),
        location: { lat: 40.6924, lon: -73.9875 },
        reportedBy: 'Auto-Detection',
        precinct: '84th Precinct – Brooklyn Heights',
        notes: 'Two males involved in a brawl near MetroTech. CCTV footage flagged by AI system.',
    },
    {
        _id: 'demo_006',
        videoName: 'CCTV-CAM-55 · Junction Blvd & Roosevelt Ave',
        behavior: 'Assault',
        riskLevel: 'High',
        status: 'Reported',
        timestamp: minsAgo(52),
        location: { lat: 40.7477, lon: -73.8620 },
        reportedBy: 'Ofc. Angela Chen',
        precinct: '115th Precinct – Jackson Heights',
        notes: 'Victim struck from behind near subway entrance. Suspect fled on foot heading eastbound.',
    },
    {
        _id: 'demo_007',
        videoName: 'CCTV-CAM-18 · Canal St & Broadway',
        behavior: 'Suspicious Activity',
        riskLevel: 'Medium',
        status: 'False Alarm',
        timestamp: minsAgo(90),
        location: { lat: 40.7194, lon: -74.0020 },
        reportedBy: 'Auto-Detection',
        precinct: '5th Precinct – Chinatown',
        notes: 'Initially flagged as altercation. On review, individuals were street performers. Cleared.',
    },
    {
        _id: 'demo_008',
        videoName: 'CCTV-CAM-09 · Myrtle Ave & Wyckoff Ave',
        behavior: 'Fighting',
        riskLevel: 'High',
        status: 'Resolved',
        timestamp: minsAgo(120),
        location: { lat: 40.7009, lon: -73.9228 },
        reportedBy: 'Det. Samuel Okafor',
        precinct: '83rd Precinct – Bushwick',
        notes: 'Gang-related incident. Two suspects arrested. Case referred to Gang Division.',
    },
    {
        _id: 'demo_009',
        videoName: 'CCTV-CAM-41 · Forest Ave & Castleton Ave',
        behavior: 'Aggressive Behavior',
        riskLevel: 'Medium',
        status: 'Pending',
        timestamp: minsAgo(12),
        location: { lat: 40.6274, lon: -74.1138 },
        reportedBy: 'Auto-Detection',
        precinct: '120th Precinct – Staten Island North',
        notes: 'Individual displaying erratic and aggressive behavior near community center.',
    },
    {
        _id: 'demo_010',
        videoName: 'CCTV-CAM-66 · Main St & Kissena Blvd',
        behavior: 'Assault',
        riskLevel: 'High',
        status: 'Investigating',
        timestamp: minsAgo(6),
        location: { lat: 40.7282, lon: -73.8199 },
        reportedBy: 'Ofc. Priya Nair',
        precinct: '109th Precinct – Flushing',
        notes: 'Robbery escalated to assault. Victim conscious and cooperating. Canvassing in progress.',
    },
    {
        _id: 'demo_011',
        videoName: 'CCTV-CAM-12 · 86th St & 4th Ave',
        behavior: 'Fighting',
        riskLevel: 'Medium',
        status: 'Resolved',
        timestamp: minsAgo(200),
        location: { lat: 40.6386, lon: -74.0290 },
        reportedBy: 'Sgt. Kevin O\'Brien',
        precinct: '68th Precinct – Bay Ridge',
        notes: 'Domestic dispute turned physical. Unit responded. Parties separated. No arrests.',
    },
    {
        _id: 'demo_012',
        videoName: 'CCTV-CAM-29 · E 161st St & Jerome Ave',
        behavior: 'Assault',
        riskLevel: 'High',
        status: 'Pending',
        timestamp: minsAgo(1),
        location: { lat: 40.8278, lon: -73.9268 },
        reportedBy: 'Auto-Detection',
        precinct: '44th Precinct – Morrisania',
        notes: '🔴 LIVE — AI system flagged active altercation. Unit en route. ETA 3 min.',
    },
];

function isMongoConnected() {
    try {
        const mongoose = require('mongoose');
        return mongoose.connection.readyState === 1;
    } catch { return false; }
}

function broadcastAlert(alert) {
    try {
        const io = socketManager.getIO();
        if (io) io.emit('new_alert', alert);
    } catch (e) {
        console.warn('Socket broadcast failed:', e.message);
    }
}

// ─── Analyze Video Upload ──────────────────────────────────────────────────
exports.analyzeVideo = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video uploaded' });

        const absolutePath = path.resolve(req.file.path);

        try {
            const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict/video`, {
                video_path: absolutePath,
            }, { timeout: 120000 });

            const result = mlResponse.data;

            if (result?.summary?.risk_level === 'High') {
                const alertData = {
                    videoName: req.file.originalname,
                    behavior:  result.events?.[0]?.type || 'Violence',
                    riskLevel: 'High',
                    timestamp: new Date(),
                    status:    'Pending',
                };
                await saveAlert(alertData);
            }
            return res.json(result);

        } catch (mlError) {
            console.error('ML Service Error:', mlError.message);
            return res.status(503).json({ error: 'ML Service unavailable or timed out' });
        }
    } catch (error) {
        console.error('analyzeVideo Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── Analyze YouTube URL ───────────────────────────────────────────────────
exports.analyzeYoutube = async (req, res) => {
    try {
        const { youtube_url } = req.body;
        if (!youtube_url) return res.status(400).json({ error: 'No URL provided' });

        try {
            const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict/youtube`, {
                youtube_url,
            }, { timeout: 300000 });

            const result = mlResponse.data;

            if (result.summary?.risk_level === 'High') {
                const alertData = {
                    videoName: 'YouTube Stream',
                    behavior:  'Incident Detected',
                    riskLevel: 'High',
                    timestamp: new Date(),
                    status:    'Pending',
                };
                await saveAlert(alertData);
            }
            return res.json(result);

        } catch (mlError) {
            console.error('YouTube ML Error:', mlError.message);
            return res.status(503).json({ error: 'Failed to analyze YouTube video' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── Get Alerts ───────────────────────────────────────────────────────────
exports.getAlerts = async (req, res) => {
    try {
        const role = req.user?.role; // From JWT — not from query param (security fix)
        const query = (role === 'police' || role === 'admin') ? {} : { hiddenFromUser: { $ne: true } };

        let dbAlerts = [];
        if (isMongoConnected()) {
            try {
                dbAlerts = await Alert.find(query).sort({ timestamp: -1 }).limit(200);
            } catch (dbErr) {
                console.warn('MongoDB fetch failed:', dbErr.message);
            }
        }

        const visibleInMemory = (role === 'police' || role === 'admin')
            ? inMemoryAlerts
            : inMemoryAlerts.filter(a => !a.hiddenFromUser);

        const allAlerts = [...visibleInMemory, ...dbAlerts]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(allAlerts);
    } catch (error) {
        res.json(inMemoryAlerts);
    }
};

// ─── Stats Endpoint ───────────────────────────────────────────────────────
exports.getStats = async (req, res) => {
    try {
        let allAlerts = [];

        if (isMongoConnected()) {
            try {
                allAlerts = await Alert.find({}).lean();
            } catch {}
        }
        allAlerts = [...inMemoryAlerts, ...allAlerts];

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const stats = {
            total:       allAlerts.length,
            highRisk:    allAlerts.filter(a => a.riskLevel === 'High').length,
            investigating: allAlerts.filter(a => a.status === 'Investigating').length,
            resolvedToday: allAlerts.filter(a => a.status === 'Resolved' && new Date(a.timestamp) >= today).length,
            falseAlarms:   allAlerts.filter(a => a.status === 'False Alarm').length,
            pending:       allAlerts.filter(a => a.status === 'Pending').length,
        };
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get stats' });
    }
};

// ─── Update Alert Status ──────────────────────────────────────────────────
exports.updateAlertStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['Pending', 'Investigating', 'Verified', 'Reported', 'Resolved', 'False Alarm'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const isMemId = /^(v_|yt_|man_|live_|mem_)/.test(id);
        if (isMemId) {
            const alert = inMemoryAlerts.find(a => a._id === id);
            if (alert) { alert.status = status; return res.json(alert); }
            return res.status(404).json({ error: 'Alert not found' });
        }

        if (isMongoConnected()) {
            const alert = await Alert.findByIdAndUpdate(id, { status }, { new: true });
            if (!alert) return res.status(404).json({ error: 'Alert not found' });
            broadcastAlert({ type: 'status_update', alert });
            return res.json(alert);
        }

        res.status(404).json({ error: 'Alert not found' });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

// ─── Create Manual Alert ──────────────────────────────────────────────────
exports.createAlert = async (req, res) => {
    try {
        const { videoName, behavior, riskLevel, timestamp, location } = req.body;

        const newAlert = {
            _id:       'man_' + Date.now(),
            videoName: videoName  || 'Reported Video',
            behavior:  behavior   || 'Suspicious Activity',
            riskLevel: riskLevel  || 'Medium',
            timestamp: timestamp  ? new Date(timestamp) : new Date(),
            status:    'Reported',
            location,
        };

        inMemoryAlerts.unshift(newAlert);
        broadcastAlert({ type: 'new_alert', alert: newAlert });

        if (isMongoConnected()) {
            try {
                const dbAlert = new Alert({ ...newAlert, _id: undefined });
                await dbAlert.save();
            } catch {}
        }
        res.json({ success: true, alert: newAlert });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create report' });
    }
};

// ─── Report Incident with Video Evidence ──────────────────────────────────
exports.reportIncident = async (req, res) => {
    try {
        const { videoName, behavior, riskLevel, timestamp } = req.body;
        const videoPath = req.file ? `/uploads/${req.file.filename}` : null;

        const alertData = {
            videoName: videoName || 'Live Incident',
            behavior:  behavior  || 'Aggression Detected',
            riskLevel: riskLevel || 'High',
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            status:    'Pending',
            videoPath,
            location:  req.body.location,
        };

        const memAlert = { ...alertData, _id: 'live_' + Date.now() };
        inMemoryAlerts.unshift(memAlert);
        broadcastAlert({ type: 'new_alert', alert: memAlert });

        if (isMongoConnected()) {
            try {
                const newAlert = new Alert(alertData);
                await newAlert.save();
                console.log('✅ Live Incident saved:', newAlert._id);

                if (req.file) {
                    const FormData = require('form-data');
                    const form = new FormData();
                    form.append('video', fs.createReadStream(req.file.path));
                    form.append('behavior', behavior || 'Aggressive Behavior');
                    form.append('timestamp', timestamp || new Date().toISOString());
                    form.append('source', videoName || 'Live Camera Feed');

                    axios.post(`${ML_SERVICE_URL}/send-video-alert`, form, {
                        headers: form.getHeaders(),
                    }).catch(err => console.error('Alert forward failed:', err.message));
                }
            } catch (dbErr) {
                console.error('DB save failed:', dbErr.message);
            }
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to report incident' });
    }
};

// ─── Delete / Hide History ────────────────────────────────────────────────
exports.deleteAllHistory = async (req, res) => {
    try {
        inMemoryAlerts.forEach(a => a.hiddenFromUser = true);
        if (isMongoConnected()) {
            try { await Alert.updateMany({}, { hiddenFromUser: true }); } catch {}
        }
        res.json({ success: true, message: 'History hidden from user. Data preserved for police.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear history' });
    }
};

exports.deleteFalseAlarms = async (req, res) => {
    try {
        inMemoryAlerts.forEach(a => { if (a.status === 'False Alarm') a.hiddenFromUser = true; });
        if (isMongoConnected()) {
            try { await Alert.updateMany({ status: 'False Alarm' }, { hiddenFromUser: true }); } catch {}
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear false alarms' });
    }
};

exports.deleteAlert = async (req, res) => {
    try {
        const { id } = req.params;
        inMemoryAlerts = inMemoryAlerts.filter(a => a._id !== id);

        const isMemId = /^(v_|yt_|man_|live_|mem_)/.test(id);
        if (!isMemId && isMongoConnected()) {
            try { await Alert.findByIdAndDelete(id); } catch {}
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete alert' });
    }
};

// ─── Webcam Proxy ─────────────────────────────────────────────────────────
let proxyHitCount = 0;
exports.proxyWebcam = async (req, res) => {
    try {
        proxyHitCount++;
        const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict/webcam`, req.body, { timeout: 5000 });
        res.json(mlResponse.data);
    } catch (error) {
        res.status(503).json({ error: 'ML Service unreachable', details: error.message });
    }
};

// ─── Helper: Save Alert ───────────────────────────────────────────────────
async function saveAlert(alertData) {
    const memAlert = { ...alertData, _id: 'v_' + Date.now() };
    inMemoryAlerts.unshift(memAlert);
    broadcastAlert({ type: 'new_alert', alert: memAlert });

    if (isMongoConnected()) {
        try {
            const dbAlert = new Alert(alertData);
            await dbAlert.save();
        } catch (dbErr) {
            console.warn('DB save fallback:', dbErr.message);
        }
    }
}

// ─── Feedback Loop (saves frame for future retraining) ───────────────────
exports.submitFeedback = async (req, res) => {
    try {
        const { frame, label, alertId } = req.body;
        // label: 'fight' | 'normal'
        if (!frame || !label) {
            return res.status(400).json({ error: 'frame and label required' });
        }

        // Map label to dataset folder
        const folderMap = { fight: 'Fight', fighting: 'Fight', normal: 'Normal', false_alarm: 'Normal' };
        const folder = folderMap[label?.toLowerCase()];
        if (!folder) return res.status(400).json({ error: 'Invalid label' });

        // Save frame to ml_service/dataset/<folder>/
        const datasetBase = path.join(__dirname, '../../ml_service/dataset', folder);
        if (!fs.existsSync(datasetBase)) fs.mkdirSync(datasetBase, { recursive: true });

        const imgData = frame.includes(',') ? frame.split(',')[1] : frame;
        const filename = `feedback_${Date.now()}.jpg`;
        fs.writeFileSync(path.join(datasetBase, filename), Buffer.from(imgData, 'base64'));

        // Update alert status if id provided
        if (alertId) {
            const newStatus = folder === 'Normal' ? 'False Alarm' : 'Verified';
            const found = inMemoryAlerts.find(a => a._id === alertId);
            if (found) found.status = newStatus;
            if (isMongoConnected()) {
                try { await Alert.findByIdAndUpdate(alertId, { status: newStatus }); } catch {}
            }
        }

        logging.info(`✅ Feedback saved: ${filename} → dataset/${folder}/`);
        res.json({ success: true, saved: `dataset/${folder}/${filename}` });
    } catch (error) {
        console.error('Feedback error:', error);
        res.status(500).json({ error: 'Failed to save feedback' });
    }
};

const logging = { info: (m) => console.log(m) };
