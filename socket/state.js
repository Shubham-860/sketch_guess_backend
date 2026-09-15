// in-memory rooms and cleanup timers
const rooms = new Map();
const roomCleanupTimers = new Map();

function generateRoomId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let id;
    do {
        id = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (rooms.has(id));
    return id;
}

function generatePlayerId() {
    return "player_" + Math.random().toString(36).substring(2, 9);
}

// notification sender for chat
function sendNotification(io, roomId, type, text, sender = null) {
    io.to(roomId).emit("chat_message", {
        id: "msg_" + Math.random().toString(36).substring(2, 9),
        type,
        sender,
        text,
        timestamp: Date.now()
    });
}

module.exports = {
    rooms,
    roomCleanupTimers,
    generateRoomId,
    generatePlayerId,
    sendNotification
};
