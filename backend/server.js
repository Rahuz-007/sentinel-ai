const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const mongoose = require('mongoose');
require('dotenv').config();

const socketManager = require('./socket');

// ─── Logger ────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message }) =>
            `[${timestamp}] ${level.toUpperCase()}: ${message}`
        )
    ),
    transports: [
        new winston.transports.Console({ colorize: true }),
        new winston.transports.File({ filename: 'sentinel.log', maxsize: 5 * 1024 * 1024, maxFiles: 3 }),
    ],
});

// ─── App Bootstrap ─────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = socketManager.init(server);
const PORT = process.env.PORT || 4005;

// ─── Security Middleware ───────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors());

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
const authLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts. Please wait.' } });
const webcamLimiter = rateLimit({ windowMs: 1000, max: 25, skip: (req) => req.path !== '/api/webcam-proxy' });

app.use(globalLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use(webcamLimiter);

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Request Logging ───────────────────────────────────────────────────────
const SKIP_LOG = ['/api/webcam-proxy', '/api/alerts'];
app.use((req, res, next) => {
    if (!SKIP_LOG.some(p => req.url.startsWith(p))) {
        logger.info(`${req.method} ${req.url}`);
    }
    next();
});

// ─── Routes ────────────────────────────────────────────────────────────────
const apiRoutes = require('./routes/api');

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Sentinel AI Backend', version: '2.1.0' }));
app.get('/health', (req, res) => {
    const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.json({
        status: 'ok',
        uptime: Math.round(process.uptime()),
        mongodb: dbState[mongoose.connection.readyState] || 'unknown',
        timestamp: new Date().toISOString(),
    });
});
app.use('/api', apiRoutes);

// ─── 404 & Error Handlers ─────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
    logger.error(`Unhandled error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
});

// ─── Database ──────────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/behavior_risk_db';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
}).then(() => {
    logger.info(`✅ MongoDB connected — DB: ${mongoose.connection.name}`);
}).catch(err => {
    logger.warn(`⚠️ MongoDB offline (${err.message.split('\n')[0]}) — using in-memory storage`);
});

mongoose.connection.on('disconnected', () => logger.warn('⚠️ MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => logger.info('✅ MongoDB reconnected'));

// ─── Start Server ─────────────────────────────────────────────────────────
server.listen(PORT, () => {
    logger.info(`🚀 Sentinel AI Backend v2.1.0 running on port ${PORT}`);
    logger.info(`🔌 Socket.IO real-time engine active`);
});
