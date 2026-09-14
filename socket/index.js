const rooms = new Map();
const roomCleanupTimers = new Map(); // Tracks cleanup timers for abandoned rooms

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

function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log("socket connected:", socket.id);

        // create room
        socket.on('create_room', ({name, avatar, playerId}, callback) => {
            const roomId = generateRoomId();
            const pId = playerId || generatePlayerId();

            const player = {
                id: pId,
                socketId: socket.id,
                name,
                avatar,
                score: 0,
                isHost: true,
                connected: true
            };

            rooms.set(roomId, {
                id: roomId,
                hostPlayerId: pId,
                players: new Map([[pId, player]]),
                strokes: []
            });

            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.data.playerId = pId;

            console.log(`Room created: ${roomId} by host: ${name} (${pId})`);
            callback({
                success: true,
                roomId,
                playerId: pId,
                players: [player]
            });
        });

        // join / reconnect
        socket.on("join_room", ({roomId, name, avatar, playerId}, callback) => {
            const room = rooms.get(roomId);
            if (!room) {
                callback({success: false, error: "Room not found or has expired"});
                return;
            }

            // Cancel cleanup timer if any existed (someone is back!)
            if (roomCleanupTimers.has(roomId)) {
                clearTimeout(roomCleanupTimers.get(roomId));
                roomCleanupTimers.delete(roomId);
                console.log(`Room ${roomId} cleanup canceled (player active)`);
            }

            socket.join(roomId);
            socket.data.roomId = roomId;

            // Check if this player already exists in the room
            let existingPlayer = playerId ? room.players.get(playerId) : null;
            if (!existingPlayer && name) {
                for (const p of room.players.values()) {
                    if (p.name === name) {
                        existingPlayer = p;
                        break;
                    }
                }
            }

            let activePlayerId;

            if (existingPlayer) {
                //reconnected- preserve score, update connection status
                existingPlayer.socketId = socket.id;
                existingPlayer.connected = true;
                if (avatar) existingPlayer.avatar = avatar;
                activePlayerId = existingPlayer.id;
                console.log(`Player ${existingPlayer.name} (${activePlayerId}) reconnected to room ${roomId}`);
            } else {

                // new player
                activePlayerId = playerId || generatePlayerId();
                const isHost = room.hostPlayerId === activePlayerId;
                const newPlayer = {
                    id: activePlayerId,
                    socketId: socket.id,
                    name,
                    avatar,
                    score: 0,
                    isHost,
                    connected: true
                };
                room.players.set(activePlayerId, newPlayer);
                console.log(`New player ${name} (${activePlayerId}) joined room ${roomId}`);
            }

            socket.data.playerId = activePlayerId;

            // Notify everyone in the room with updated player list
            io.to(roomId).emit("player_joined", Array.from(room.players.values()));

            callback({
                success: true,
                roomId,
                playerId: activePlayerId,
                players: Array.from(room.players.values()),
                strokes: room.strokes || []
            });
        });

        // drawing
        socket.on("draw_start", (data) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            socket.data.currentStroke = {
                points: [{x: data.x, y: data.y}],
                color: data.color,
                size: data.size,
            };
            socket.to(roomId).emit("draw_start", data);
        });

        socket.on("draw_move", (data) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            if (socket.data.currentStroke) {
                socket.data.currentStroke.points.push(data);
            }
            socket.to(roomId).emit("draw_move", data);
        });

        socket.on("draw_end", () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (room && socket.data.currentStroke) {
                if (!room.strokes) room.strokes = [];
                room.strokes.push(socket.data.currentStroke);
                socket.data.currentStroke = null;
            }
            socket.to(roomId).emit("draw_end");
        });

        socket.on("canvas_clear", () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (room) room.strokes = [];
            socket.to(roomId).emit("canvas_clear");
        });

        socket.on("draw_undo", () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (room && room.strokes) room.strokes.pop();
            socket.to(roomId).emit("draw_undo");
        });

        // disconnected
        socket.on('disconnect', () => {
            console.log("socket disconnected:", socket.id);

            const roomId = socket.data.roomId;
            const playerId = socket.data.playerId;
            if (!roomId || !playerId) return;

            const room = rooms.get(roomId);
            if (!room) return;

            const player = room.players.get(playerId);
            if (player && player.socketId === socket.id) {
                // Mark offline, but DO NOT delete player or wipe their score!
                player.connected = false;
                console.log(`Player ${player.name} (${playerId}) is offline in room ${roomId}`);
            }

            // Check if any player is still connected
            const anyConnected = Array.from(room.players.values()).some(p => p.connected);

            if (!anyConnected) {
                // all left, a 5-minute cleanup timer
                console.log(`All players offline in room ${roomId}. Starting 5-minute cleanup countdown...`);
                const timer = setTimeout(() => {
                    const currentRoom = rooms.get(roomId);
                    if (currentRoom) {
                        const stillEmpty = Array.from(currentRoom.players.values()).every(p => !p.connected);
                        if (stillEmpty) {
                            rooms.delete(roomId);
                            roomCleanupTimers.delete(roomId);
                            console.log(`Room ${roomId} permanently deleted due to inactivity.`);
                        }
                    }
                }, 5 * 60 * 1000); // 5 minutes

                roomCleanupTimers.set(roomId, timer);
            } else {
                // Someone else is still in the room: notify them about status update
                io.to(roomId).emit("player_left", Array.from(room.players.values()));
            }
        });

        // game over
        socket.on("leave_room", () => {
            const roomId = socket.data.roomId;
            const playerId = socket.data.playerId;
            const room = rooms.get(roomId);
            if (!room) return;

            socket.leave(roomId);
            delete socket.data.roomId;
            delete socket.data.playerId;

            // If host leaves/closes the room:
            if (room.hostPlayerId === playerId) {
                if (roomCleanupTimers.has(roomId)) {
                    clearTimeout(roomCleanupTimers.get(roomId));
                    roomCleanupTimers.delete(roomId);
                }
                io.to(roomId).emit("room_closed", {message: "Host closed the room"});
                rooms.delete(roomId);
                console.log(`Host closed room ${roomId}`);
            } else {
                // Non-host player leaving voluntarily:
                room.players.delete(playerId);
                if (room.players.size === 0) {
                    rooms.delete(roomId);
                } else {
                    io.to(roomId).emit("player_left", Array.from(room.players.values()));
                }
                console.log(`Player ${playerId} left room ${roomId}`);
            }
        });
    });
}

module.exports = registerSocketHandlers;
