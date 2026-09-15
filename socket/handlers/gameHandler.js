const {rooms, sendNotification} = require("../state");
const {DEFAULT_WORD_BANK, isCloseGuess} = require("../words");
const {startRound, chooseWord, endRound} = require("../game");

function registerGameHandlers(io, playerSocket) {
    // start game (host only)
    playerSocket.on("start_game", ({rounds = 3, drawTime = 60, wordCount = 3, customWords = []} = {}, callback) => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room || room.hostPlayerId !== playerSocket.data.playerId) {
            if (callback) callback({success: false, error: "only the host can start the game"});
            return;
        }

        const connectedCount = Array.from(room.players.values()).filter(p => p.connected).length;
        if (connectedCount < 2) {
            if (callback) callback({success: false, error: "need at least 2 players to start"});
            return;
        }

        // clean and sanitize custom words
        const cleanedCustom = Array.isArray(customWords)
            ? customWords.map(w => String(w).trim().toLowerCase()).filter(w => w.length > 0)
            : [];

        // apply custom settings from lobby
        room.totalTurns = rounds * connectedCount;
        room.drawerIndex = -1;
        room.turnNumber = 0;
        room.drawTime = Math.max(20, Math.min(drawTime, 180));
        room.wordCount = Math.max(2, Math.min(wordCount, 5));
        room.wordList = cleanedCustom.length > 0 ? [...DEFAULT_WORD_BANK, ...cleanedCustom] : DEFAULT_WORD_BANK;

        // reset scores for new match
        for (const p of room.players.values()) {
            p.score = 0;
        }
        io.to(roomId).emit("player_joined", Array.from(room.players.values()));

        if (callback) callback({success: true});
        startRound(io, room);
    });


    // drawer picked a word
    playerSocket.on("word_chosen", ({word}) => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room || room.drawerPlayerId !== playerSocket.data.playerId) return;
        if (!room.wordOptions || !room.wordOptions.includes(word)) return;

        chooseWord(io, room, word);
    });


    // chat and guessing
    playerSocket.on("guess", ({text}) => {
        const roomId = playerSocket.data.roomId;
        const room = rooms.get(roomId);
        if (!room || !text) return;

        const player = room.players.get(playerSocket.data.playerId);
        if (!player) return;

        const trimmed = text.trim();
        if (!trimmed) return;

        // if in lobby or not in drawing state, treat as normal chat
        if (room.gameState !== "drawing" || !room.currentWord) {
            sendNotification(io, roomId, "chat", trimmed, player.name);
            return;
        }

        // drawer cannot guess own word
        if (playerSocket.data.playerId === room.drawerPlayerId) return;

        const cleanGuess = trimmed.toLowerCase();
        const cleanWord = room.currentWord.toLowerCase();

        // if player already guessed correctly, let them chat without spoiling the secret word
        if (room.guessedPlayerIds.has(player.id)) {
            if (cleanGuess.includes(cleanWord)) {
                return; // block spoilers
            }
            sendNotification(io, roomId, "chat", trimmed, player.name);
            return;
        }

        // 1. correct guess
        if (cleanGuess === cleanWord) {
            room.guessedPlayerIds.add(player.id);

            // calculate score based on time remaining
            const guessScore = Math.max(10, Math.floor(room.timeLeft * 2));
            player.score += guessScore;

            // drawer gets +15 bonus points
            const drawer = room.players.get(room.drawerPlayerId);
            if (drawer) drawer.score += 15;

            sendNotification(io, roomId, "correct", `${player.name} guessed the word!`);
            io.to(roomId).emit("player_joined", Array.from(room.players.values()));

            // check if all non-drawers guessed
            const connectedNonDrawers = Array.from(room.players.values())
                .filter(p => p.connected && p.id !== room.drawerPlayerId).length;

            if (room.guessedPlayerIds.size >= connectedNonDrawers) {
                endRound(io, room, "everyone guessed the word!");
            }

            // 2. close guess (typo detected)
        } else if (isCloseGuess(cleanGuess, cleanWord)) {
            sendNotification(io, roomId, "close", `${player.name} is close!`);

            // 3. wrong guess / regular chat
        } else {
            sendNotification(io, roomId, "chat", trimmed, player.name);
        }
    });
}

module.exports = {registerGameHandlers};
