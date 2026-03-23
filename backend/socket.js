// socket.js — Socket.IO singleton for real-time broadcasting
const { Server } = require('socket.io');

let io;

module.exports = {
    init: (httpServer) => {
        io = new Server(httpServer, {
            cors: { origin: '*', methods: ['GET', 'POST'] },
            pingTimeout: 60000,
        });

        io.on('connection', (socket) => {
            console.log(`🔌 Client connected: ${socket.id}`);
            socket.on('disconnect', () => {
                console.log(`❌ Client disconnected: ${socket.id}`);
            });
        });

        return io;
    },

    getIO: () => {
        if (!io) {
            console.warn('⚠️ Socket.IO not initialized yet');
            return null;
        }
        return io;
    },
};
