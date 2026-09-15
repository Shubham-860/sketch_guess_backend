# Sketch Guess Backend

The backend server for Sketch Guess, a real-time multiplayer drawing and guessing game. Built with Express and Socket.IO to handle rooms, players, drawing events, and chat/guessing in real time.

Frontend repo: https://github.com/Shubham-860/sketch_guess
Live app: https://sketch-guess-shubham.vercel.app/

## Features

- Room creation and joining with unique room codes
- Real-time relay of drawing events (draw, move, undo, clear) between players
- Turn-based drawer rotation
- Chat and guess handling
- Player connect/disconnect handling
- No database, all game state kept in memory

## Tech Stack

- Node.js
- Express
- Socket.IO
- Nodemon (development)

## Installation

1. Clone the repository
```
git clone https://github.com/Shubham-860/sketch_guess_backend.git
cd sketch_guess_backend
```

2. Install dependencies
```
npm install
```

3. Start the development server (auto-restarts on file changes)
```
npm run dev
```

4. Or start it normally
```
npm start
```

The server listens on the port set in `bin/www` (defaults to 3000 if no PORT environment variable is set).

Note: This is the backend only. The frontend needs to be running and pointed at this server's URL for the game to work.
