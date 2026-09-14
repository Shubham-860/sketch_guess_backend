const rooms = new Map();

function generateRoomId() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let id;
    do {
        id = Array.from({length: 6}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (rooms.has(id))
    return id;
}


function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log("socket connected", socket.id);

        socket.on('create_room', ({name, avatar}, callback) => {
            const roomId = generateRoomId();
            const player = {id: socket.id, name, avatar, score: 0, isHost: true};


            rooms.set(roomId, {
                id: roomId,
                hostId: socket.id,
                players: new Map([[socket.id, player]])
            })

            socket.join(roomId);
            socket.data.roomId = roomId

            console.log("joined room socket Id", socket.id);
            console.log("room id ", roomId);
            callback({success: true, roomId})
        })

        socket.on("join_room", ({roomId, name, avatar}, callback) => {

            const room = rooms.get(roomId);
            if (!room) {
                callback({success: false, error: "Room not found"});
                return;
            }

            socket.join(roomId);
            socket.data.roomId = roomId

            if (!room.players.has(socket.id)) {
                const isHost = room.hostId === socket.id;
                const player = {id: socket.id, name, avatar, score: 0, isHost};
                room.players.set(socket.id, player)
                io.to(roomId).emit("player_joined", Array.from(room.players.values()));
            }
            callback({success: true, roomId, players: Array.from(room.players.values())});
        })

        socket.on("draw_start", (data) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            socket.to(roomId).emit("draw_start", data);
        })

        socket.on("draw_move", (data) => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            socket.to(roomId).emit("draw_move", data);
        })

        socket.on("draw_end", () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            socket.to(roomId).emit("draw_end");
        })

        socket.on("canvas_clear", () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            socket.to(roomId).emit("canvas_clear");
        })

        socket.on("draw_undo", () => {
            const roomId = socket.data.roomId;
            if (!roomId) return;
            socket.to(roomId).emit("draw_undo");
        })

        socket.on('disconnect', () => {
            console.log("socket disconnected", socket.id);

            const roomId = socket.data.roomId;
            if (!roomId) return;

            const room = rooms.get(roomId);
            if (!room) return;

            room.players.delete(socket.id);

            if (room.players.size === 0) {
                rooms.delete(roomId);
            } else {
                io.to(roomId).emit("player_left", Array.from(room.players.values()));
            }


        })
    })
}


module.exports = registerSocketHandlers;