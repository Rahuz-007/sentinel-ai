const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/behavior_risk_db';

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('Connected to MongoDB');
        const users = await User.find({}, 'username role');
        console.log('User list:');
        users.forEach(u => console.log(`- ${u.username} [${u.role}]`));
        process.exit(0);
    })
    .catch(err => {
        console.error('Connection error:', err.message);
        process.exit(1);
    });
