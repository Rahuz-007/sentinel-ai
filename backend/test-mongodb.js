const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('🔗 Testing MongoDB Connection...');
console.log('📍 URI:', MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@'));

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
})
    .then(() => {
        console.log('✅ MongoDB Connected Successfully!');
        console.log('📊 Database:', mongoose.connection.name);
        console.log('🌐 Host:', mongoose.connection.host);
        console.log('✨ Connection is working perfectly!');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Failed!');
        console.error('📋 Error:', err.message);
        console.error('💡 Please check:');
        console.error('   1. Your internet connection');
        console.error('   2. MongoDB Atlas credentials in .env file');
        console.error('   3. IP whitelist in MongoDB Atlas (allow 0.0.0.0/0 for testing)');
        process.exit(1);
    });
