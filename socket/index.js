const {registerRoomHandlers} = require("./handlers/roomHandler");
const {registerGameHandlers} = require("./handlers/gameHandler");
const {registerDrawHandlers} = require("./handlers/drawHandler");

function registerSocketHandlers(io) {
    io.on("connection", (playerSocket) => {
        console.log("socket connected:", playerSocket.id);

        // register event categories
        registerRoomHandlers(io, playerSocket);
        registerGameHandlers(io, playerSocket);
        registerDrawHandlers(io, playerSocket);
    });
}

module.exports = registerSocketHandlers;
