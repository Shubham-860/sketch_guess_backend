const {rooms, roomCleanupTimers, generateRoomId, generatePlayerId, sendNotification} = require("../state");
const {DEFAULT_WORD_BANK} = require("../words");
const {endRound} = require("../game");

function registerRoomHandlers(io, playerSocket) {
    // create room
    playerSocket.on("create_room", ({name, avatar, playerId}, callback) => {
        const roomId = generateRoomId();
        const pId = playerId || generatePlayerId();

        const player = {
            id: pId,
            socketId: playerSocket.id,
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
            strokes: [],
            gameState: "lobby",
            drawerIndex: -1,
            drawerPlayerId: null,
            turnNumber: 0,
            totalTurns: 0,
            drawTime: 60,
            wordCount: 3,
            wordList: DEFAULT_WORD_BANK,
            guessedPlayerIds: new Set()
        });

        playerSocket.join(roomId);
        playerSocket.data.roomId = roomId;
        playerSocket.data.playerId = pId;

        sendNotification(io, roomId, "host", `${name} created the room`);
        console.log(`room created: ${roomId} by host: ${name} (${pId})`);

        callback({
            success: true,
            roomId,
            playerId: pId,
            players: [player]
        });
    });

    // join / reconnect
    playerSocket.on("join_room", ({roomId, name, avatar, playerId}, callback) => {
        const room = rooms.get(roomId);
        if (!room) {
            callback({success: false, error: "room not found or has expired"});
            return;
        }

        // cancel cleanup timer if someone is back
        if (roomCleanupTimers.has(roomId)) {
            clearTimeout(roomCleanupTimers.get(roomId));
            roomCleanupTimers.delete(roomId);
            console.log(`room ${roomId} cleanup canceled`);
        }

        playerSocket.join(roomId);
        playerSocket.data.roomId = roomId;

        // check if player already exists in room
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
            // reconnect: update socket id and status
            existingPlayer.socketId = playerSocket.id;
            existingPlayer.connected = true;
            if (avatar) existingPlayer.avatar = avatar;
            activePlayerId = existingPlayer.id;

            sendNotification(io, roomId, "reconnect", `${existingPlayer.name} reconnected`);
            console.log(`player ${existingPlayer.name} (${activePlayerId}) reconnected to room ${roomId}`);

            // if drawer reconnected, cancel skip timer
            if (room.drawerPlayerId === activePlayerId && room.drawerReconnectTimeout) {
                clearTimeout(room.drawerReconnectTimeout);
                room.drawerReconnectTimeout = null;
                sendNotification(io, roomId, "system", `${existingPlayer.name} is back, turn resumed`);
            }
        } else {
            // new player joining
            activePlayerId = playerId || generatePlayerId();
            const isHost = room.hostPlayerId === activePlayerId;
            const newPlayer = {
                id: activePlayerId,
                socketId: playerSocket.id,
                name,
                avatar,
                score: 0,
                isHost,
                connected: true
            };
            room.players.set(activePlayerId, newPlayer);
            sendNotification(io, roomId, "join", `${name} joined the game`);
            console.log(`new player ${name} (${activePlayerId}) joined room ${roomId}`);
        }

        playerSocket.data.playerId = activePlayerId;

        io.to(roomId).emit("player_joined", Array.from(room.players.values()));

        callback({
            success: true,
            roomId,
            playerId: activePlayerId,
            gameState: room.gameState,
            isHost: room.hostPlayerId === activePlayerId,
            players: Array.from(room.players.values()),
            strokes: room.strokes || []
        });
    });

    // disconnected
    playerSocket.on("disconnect", () => {
        console.log("socket disconnected:", playerSocket.id);

        const roomId = playerSocket.data.roomId;
        const playerId = playerSocket.data.playerId;
        if (!roomId || !playerId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        const player = room.players.get(playerId);
        if (player && player.socketId === playerSocket.id) {
            player.connected = false;
            sendNotification(io, roomId, "leave", `${player.name} disconnected`);
            console.log(`player ${player.name} (${playerId}) is offline in room ${roomId}`);
        }

        // if active drawer disconnected mid-round, give 15s to reconnect
        if (room.drawerPlayerId === playerId && (room.gameState === "drawing" || room.gameState === "choosing")) {
            sendNotification(io, roomId, "system", "drawer disconnected, 15s to reconnect before skipping round");
            room.drawerReconnectTimeout = setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom && currentRoom.drawerPlayerId === playerId) {
                    const currentDrawer = currentRoom.players.get(playerId);
                    if (currentDrawer && !currentDrawer.connected) {
                        sendNotification(io, roomId, "system", "drawer did not return in time, skipping round");
                        endRound(io, currentRoom, "drawer left.");
                    }
                }
            }, 15000);
        }

        // check if anyone is still connected
        const anyConnected = Array.from(room.players.values()).some(p => p.connected);

        if (!anyConnected) {
            console.log(`all players offline in room ${roomId}, starting cleanup timer`);
            const timer = setTimeout(() => {
                const currentRoom = rooms.get(roomId);
                if (currentRoom) {
                    const stillEmpty = Array.from(currentRoom.players.values()).every(p => !p.connected);
                    if (stillEmpty) {
                        clearInterval(currentRoom.timerInterval);
                        clearTimeout(currentRoom.pickTimeout);
                        clearTimeout(currentRoom.drawerReconnectTimeout);
                        rooms.delete(roomId);
                        roomCleanupTimers.delete(roomId);
                        console.log(`room ${roomId} deleted due to inactivity`);
                    }
                }
            }, 5 * 60 * 1000); // 5 minutes

            roomCleanupTimers.set(roomId, timer);
        } else {
            io.to(roomId).emit("player_left", Array.from(room.players.values()));
        }
    });

    // voluntary leave
    playerSocket.on("leave_room", () => {
        const roomId = playerSocket.data.roomId;
        const playerId = playerSocket.data.playerId;
        const room = rooms.get(roomId);
        if (!room) return;

        playerSocket.leave(roomId);
        delete playerSocket.data.roomId;
        delete playerSocket.data.playerId;

        if (room.hostPlayerId === playerId) {
            if (roomCleanupTimers.has(roomId)) {
                clearTimeout(roomCleanupTimers.get(roomId));
                roomCleanupTimers.delete(roomId);
            }
            clearInterval(room.timerInterval);
            clearTimeout(room.pickTimeout);
            clearTimeout(room.drawerReconnectTimeout);
            io.to(roomId).emit("room_closed", {message: "host closed the room"});
            rooms.delete(roomId);
            console.log(`host closed room ${roomId}`);
        } else {
            room.players.delete(playerId);
            if (room.players.size === 0) {
                clearInterval(room.timerInterval);
                clearTimeout(room.pickTimeout);
                clearTimeout(room.drawerReconnectTimeout);
                rooms.delete(roomId);
            } else {
                io.to(roomId).emit("player_left", Array.from(room.players.values()));
            }
            console.log(`player ${playerId} left room ${roomId}`);
        }
    });
}

module.exports = {registerRoomHandlers};
