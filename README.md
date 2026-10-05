# Watch Party – Backend

Node.js + Express + Socket.IO. Handles rooms, roles and real-time sync.

## Structure

src/
├── index.js                     # Express + Socket.IO server, CORS
├── config/roles.js              # roles + permissions
├── models/Participant.js
├── models/Room.js               # room state, roles, approval requests
├── services/RoomManager.js
└── sockets/registerHandlers.js  # all WebSocket events + permission checks


## Run locally
bash
npm install
cp .env.example .env     # optional locally; defaults allow http://localhost:5173
npm run dev              # http://localhost:4000

Check http://localhost:4000/health -> `{"ok":true}`.

## Deploy (Render)
Vercel cannot host this: it runs serverless functions, which cannot keep WebSocket connections open.
1. Push this folder to its own GitHub repo.
2. Render -> New -> Web Service -> select repo.
3. Build command: `npm install`   Start command: `npm start`
4. Environment variable: `CLIENT_ORIGIN` = your render frontend URL (no trailing slash).
5. Copy the URL, e.g. `https://watchparty-backend-yw57.onrender.com`.
