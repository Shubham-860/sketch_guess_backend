const {rooms} = require("../state");

function registerDrawHandlers(io, playerSocket) {

    playerSocket.on("draw_start", (data) => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room) return;

        const canDraw = room.gameState === "lobby" || room.drawerPlayerId === playerSocket.data.playerId;
        if (!canDraw) return;

        playerSocket.data.currentStroke = {
            points: [{x: data.x, y: data.y}],
            color: data.color,
            size: data.size,
        };
        playerSocket.to(roomId).emit("draw_start", data);
    });


    playerSocket.on("draw_move", (data) => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room) return;

        const canDraw = room.gameState === "lobby" || room.drawerPlayerId === playerSocket.data.playerId;
        if (!canDraw) return;

        if (playerSocket.data.currentStroke) {
            playerSocket.data.currentStroke.points.push(data);
        }
        playerSocket.to(roomId).emit("draw_move", data);
    });


    playerSocket.on("draw_end", () => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room) return;

        const canDraw = room.gameState === "lobby" || room.drawerPlayerId === playerSocket.data.playerId;
        if (!canDraw) return;

        if (playerSocket.data.currentStroke) {
            if (!room.strokes) room.strokes = [];
            room.strokes.push(playerSocket.data.currentStroke);
            playerSocket.data.currentStroke = null;
        }
        playerSocket.to(roomId).emit("draw_end");
    });


    playerSocket.on("canvas_clear", () => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room) return;

        const canDraw = room.gameState === "lobby" || room.drawerPlayerId === playerSocket.data.playerId;
        if (!canDraw) return;

        room.strokes = [];
        playerSocket.to(roomId).emit("canvas_clear");
    });


    playerSocket.on("draw_undo", () => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room) return;

        const canDraw = room.gameState === "lobby" || room.drawerPlayerId === playerSocket.data.playerId;
        if (!canDraw) return;

        if (room.strokes) room.strokes.pop();
        playerSocket.to(roomId).emit("draw_undo");
    });
}

module.exports = {registerDrawHandlers};
