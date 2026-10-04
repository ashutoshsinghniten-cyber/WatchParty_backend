import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './services/RoomManager.js';
import { registerHandlers } from './sockets/registerHandlers.js';

const PORT = process.env.PORT || 4000;
// Comma-separated list of allowed frontend origins, e.g. "https://my-app.vercel.app,http://localhost:5173"
const ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());

const app = express();
app.use(cors({ origin: ORIGINS }));
app.get('/', (_req, res) => res.send('Watch Party backend is running'));
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGINS, methods: ['GET', 'POST'] } });
registerHandlers(io, new RoomManager());

server.listen(PORT, () => console.log(`Watch Party backend on :${PORT}, allowed origins: ${ORIGINS.join(', ')}`));
