const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'sentinel_ai_secret_key_2025';

// ─── In-Memory User Store (fallback when MongoDB is offline) ───────────────
// Pre-seeded users so the system works out-of-the-box without a DB
let inMemoryUsers = [];
let inMemorySeeded = false;

async function seedDefaultUsers() {
    if (inMemorySeeded) return;
    inMemorySeeded = true;

    const defaults = [
        { username: 'admin',    password: 'admin123',   role: 'admin' },
        { username: 'NYPD',     password: 'nypd@123',   role: 'police' },
        { username: 'operator', password: 'operator123', role: 'cctv_user' },
    ];

    for (const u of defaults) {
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(u.password, salt);
        inMemoryUsers.push({
            _id: 'mem_' + u.username,
            username: u.username,
            password: hashed,
            role: u.role,
            createdAt: new Date()
        });
    }
    console.log('✅ In-memory users seeded (admin / NYPD / operator)');
}

// Seed on module load
seedDefaultUsers();

// ─── Helpers ──────────────────────────────────────────────────────────────
function findInMemoryUser(username) {
    return inMemoryUsers.find(u => u.username === username);
}

function isMongoConnected() {
    try {
        const mongoose = require('mongoose');
        return mongoose.connection.readyState === 1; // 1 = connected
    } catch {
        return false;
    }
}

// ─── Register ─────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        console.log(`📝 Registration attempt: ${username} as ${role}`);

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const assignedRole = role || 'cctv_user';

        // ── Try MongoDB first ──
        if (isMongoConnected()) {
            try {
                const existingUser = await User.findOne({ username });
                if (existingUser) {
                    return res.status(400).json({ message: 'User already exists' });
                }

                if (assignedRole === 'admin') {
                    const adminExists = await User.findOne({ role: 'admin' });
                    if (adminExists) {
                        return res.status(400).json({ message: 'Admin already exists.' });
                    }
                }

                const newUser = new User({ username, password: hashedPassword, role: assignedRole });
                await newUser.save();
                console.log('✅ User saved to MongoDB');
                return res.status(201).json({ message: 'User created successfully' });
            } catch (dbErr) {
                console.warn('⚠️ MongoDB register failed, falling back to in-memory:', dbErr.message);
            }
        }

        // ── In-memory fallback ──
        if (findInMemoryUser(username)) {
            return res.status(400).json({ message: 'User already exists' });
        }

        if (assignedRole === 'admin' && inMemoryUsers.some(u => u.role === 'admin')) {
            return res.status(400).json({ message: 'Admin already exists.' });
        }

        inMemoryUsers.push({
            _id: 'mem_' + Date.now(),
            username,
            password: hashedPassword,
            role: assignedRole,
            createdAt: new Date()
        });

        console.log(`✅ User registered in-memory: ${username}`);
        return res.status(201).json({ message: 'User created successfully' });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ─── Login ────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        let foundUser = null;

        // ── Try MongoDB first ──
        if (isMongoConnected()) {
            try {
                foundUser = await User.findOne({ username });
            } catch (dbErr) {
                console.warn('⚠️ MongoDB login query failed, falling back to in-memory:', dbErr.message);
            }
        }

        // ── In-memory fallback ──
        if (!foundUser) {
            foundUser = findInMemoryUser(username);
        }

        if (!foundUser) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, foundUser.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: foundUser._id, role: foundUser.role, username: foundUser.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        console.log(`✅ Login successful: ${username} (${foundUser.role})`);

        return res.json({
            token,
            user: {
                id: foundUser._id,
                username: foundUser.username,
                role: foundUser.role
            }
        });

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ─── Verify Token Middleware ───────────────────────────────────────────────
exports.verifyToken = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        res.status(400).json({ message: 'Token is not valid' });
    }
};
