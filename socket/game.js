const {pickWords} = require("./words");
const {rooms, sendNotification} = require("./state");

function startRound(io, room) {
    // clear old timers
    clearTimeout(room.pickTimeout);
    clearTimeout(room.drawerReconnectTimeout);
    clearInterval(room.timerInterval);

    // filter connected players
    const connectedPlayerIds = Array.from(room.players.values())
        .filter(player => player.connected)
        .map(p => p.id);

    // if less than 2 players, return to lobby
    if (connectedPlayerIds.length < 2) {
        room.gameState = "lobby";
        sendNotification(io, room.id, "system", "not enough players online, returning to lobby.");
        io.to(room.id).emit("game_state_changed", {state: "lobby"});
        return;
    }

    // next player in line
    room.drawerIndex = (room.drawerIndex + 1) % connectedPlayerIds.length;
    room.drawerPlayerId = connectedPlayerIds[room.drawerIndex];
    const drawer = room.players.get(room.drawerPlayerId);

    // set up round state
    room.currentWord = null;
    room.guessedPlayerIds = new Set();
    room.wordOptions = pickWords(room.wordList, room.wordCount);
    room.turnNumber = (room.turnNumber || 0) + 1;
    room.gameState = "choosing";
    room.strokes = [];

    // check if all rounds completed
    if (room.turnNumber > room.totalTurns) {
        endGame(io, room);
        return;
    }

    // clear canvas on all clients
    io.to(room.id).emit("canvas_clear");

    // send choices only to drawer
    if (drawer && drawer.socketId) {
        io.to(drawer.socketId).emit("word_options", {words: room.wordOptions});
    }

    // round start announcement
    io.to(room.id).emit("round_start", {
        drawerId: room.drawerPlayerId,
        drawerName: drawer ? drawer.name : "unknown",
        turn: room.turnNumber,
        totalTurns: room.totalTurns
    });
    sendNotification(io, room.id, "system", `round ${room.turnNumber}/${room.totalTurns}: ${drawer ? drawer.name : "someone"} is choosing a word...`);

    // if drawer doesnt pick in 10s skip turn
    room.pickTimeout = setTimeout(() => {
        if (!room.currentWord && room.gameState === "choosing") {
            const drawerName = drawer ? drawer.name : "drawer";
            sendNotification(io, room.id, "system", `${drawerName} took too long to choose a word, turn skipped.`);
            endRound(io, room, "turn skipped.");
        }
    }, 10000);
}

function chooseWord(io, room, word) {
    // cancel the pick timer
    clearTimeout(room.pickTimeout);

    room.currentWord = word;
    room.gameState = "drawing";

    const drawer = room.players.get(room.drawerPlayerId);

    // make blanks for guessers like "_ _ _"
    const blanks = word.split("").map(c => (c === " " ? " " : "_")).join(" ");

    io.to(room.id).emit("word_picked", {blanks, length: word.length});
    if (drawer && drawer.socketId) {
        io.to(drawer.socketId).emit("your_word", {word});
    }

    sendNotification(io, room.id, "system", `${drawer ? drawer.name : "drawer"} picked a word, start guessing!`);

    // start timer
    room.timeLeft = room.drawTime;
    io.to(room.id).emit("timer", {timeLeft: room.timeLeft});

    clearInterval(room.timerInterval);
    room.timerInterval = setInterval(() => {
        room.timeLeft -= 1;
        io.to(room.id).emit("timer", {timeLeft: room.timeLeft});

        if (room.timeLeft <= 0) {
            endRound(io, room, "time is up!");
        }
    }, 1000);
}

function endRound(io, room, reason = "") {
    clearInterval(room.timerInterval);
    clearTimeout(room.pickTimeout);
    clearTimeout(room.drawerReconnectTimeout);
    room.gameState = "round_end";

    const answer = room.currentWord || "no word chosen";
    sendNotification(io, room.id, "system", `${reason} the word was: "${answer}"`);

    io.to(room.id).emit("round_end", {
        word: answer,
        players: Array.from(room.players.values())
    });

    // wait 4 sec then start next round
    setTimeout(() => {
        const stillActive = rooms.get(room.id);
        if (stillActive && stillActive.gameState === "round_end") {
            startRound(io, stillActive);
        }
    }, 4000);
}

function endGame(io, room) {
    room.gameState = "game_over";
    clearInterval(room.timerInterval);
    clearTimeout(room.pickTimeout);
    clearTimeout(room.drawerReconnectTimeout);

    // sort players by score
    const sortedPlayers = Array.from(room.players.values())
        .sort((a, b) => b.score - a.score);

    const winner = sortedPlayers[0];

    sendNotification(
        io,
        room.id,
        "system",
        `game over! winner is ${winner ? winner.name : "nobody"} with ${winner ? winner.score : 0} points!`
    );

    io.to(room.id).emit("game_over", {players: sortedPlayers});
}

module.exports = {
    startRound,
    chooseWord,
    endRound,
};
