import { ROLES, can, isValidAssignableRole } from '../config/roles.js';

/**
 * All WebSocket (Socket.IO) events live here. Each handler:
 *   1. finds the room + caller  2. validates permission  3. mutates Room  4. broadcasts.
 */
export function registerHandlers(io, manager) {
  io.on('connection', (socket) => {
    const ctx = () => {
      const room = manager.get(socket.data.roomId);
      const me = room?.get(socket.id);
      return room && me ? { room, me } : null;
    };
    const deny = (message) => socket.emit('error_message', { message });
    const broadcastSync = (room) => io.to(room.code).emit('sync_state', room.snapshot());
    const pushRequests = (room) => {
      for (const p of room.participants.values())
        if (can(p.role, 'approve')) io.to(p.id).emit('requests_updated', { requests: room.pendingRequests() });
    };

    const enter = (room, username, clientId, ack) => {
      const me = room.addParticipant(socket.id, username.trim().slice(0, 24) || 'Guest', clientId);
      socket.join(room.code);
      socket.data.roomId = room.code;
      ack?.({ ok: true, roomId: room.code, me: me.toJSON(), participants: room.list() });
      socket.emit('sync_state', room.snapshot());
      io.to(room.code).emit('user_joined', { ...me.toJSON(), participants: room.list() });
      pushRequests(room);
    };

    socket.on('create_room', ({ username, clientId } = {}, ack) => enter(manager.create(), username || '', clientId, ack));

    socket.on('join_room', ({ roomId, username, clientId } = {}, ack) => {
      const room = manager.get(roomId);
      if (!room) return ack?.({ ok: false, error: 'Room not found. Check the code.' });
      enter(room, username || '', clientId, ack);
    });

    const leave = () => {
      const c = ctx(); if (!c) return;
      const { room, me } = c;
      const newHost = room.removeParticipant(socket.id);
      socket.leave(room.code);
      socket.data.roomId = null;
      io.to(room.code).emit('user_left', { userId: me.id, username: me.username, participants: room.list() });
      if (newHost) io.to(room.code).emit('role_assigned', { userId: newHost.id, username: newHost.username, role: newHost.role, participants: room.list() });
      pushRequests(room);
      manager.deleteIfEmpty(room);
    };
    socket.on('leave_room', leave);

    // On a dropped connection (refresh, network blip) keep the user for 20s so they can rejoin.
    socket.on('disconnect', () => {
      const c = ctx(); if (!c) return;
      c.me.graceTimer = setTimeout(leave, 20000);
    });

    socket.on('rejoin_room', ({ roomId, clientId } = {}, ack) => {
      const room = manager.get(roomId);
      const p = room?.findByClientId(clientId);
      if (!p) return ack?.({ ok: false });
      clearTimeout(p.graceTimer);
      p.graceTimer = null;
      room.rebind(p, socket.id);
      socket.join(room.code);
      socket.data.roomId = room.code;
      ack?.({ ok: true, roomId: room.code, me: p.toJSON(), participants: room.list() });
      socket.emit('sync_state', room.snapshot());
      io.to(room.code).emit('participants_updated', { participants: room.list() });
      pushRequests(room);
    });

    // ---- playback (Host / Moderator only) ----
    for (const type of ['play', 'pause', 'seek', 'change_video']) {
      socket.on(type, (payload = {}) => {
        const c = ctx(); if (!c) return;
        if (!can(c.me.role, 'control')) return deny('Only the host or a moderator can control playback.');
        if (c.room.applyAction(type, payload)) broadcastSync(c.room);
      });
    }

    // ---- participant asks for a change; host/mod approves ----
    socket.on('request_action', ({ action, payload } = {}) => {
      const c = ctx(); if (!c) return;
      if (!['play', 'pause', 'seek', 'change_video'].includes(action)) return;
      if (can(c.me.role, 'control')) return deny('You can control playback directly.');
      c.room.addRequest(socket.id, action, payload);
      pushRequests(c.room);
      socket.emit('info_message', { message: 'Request sent. Waiting for host/moderator approval.' });
    });

    socket.on('resolve_request', ({ requestId, approve } = {}) => {
      const c = ctx(); if (!c) return;
      if (!can(c.me.role, 'approve')) return deny('Only the host or a moderator can approve requests.');
      const req = c.room.requests.get(requestId); if (!req) return;
      c.room.requests.delete(requestId);
      if (approve && c.room.applyAction(req.action, req.payload)) broadcastSync(c.room);
      io.to(req.userId).emit('info_message', { message: `Your request (${req.action}) was ${approve ? 'approved' : 'rejected'}.` });
      pushRequests(c.room);
    });

    // ---- host-only role management ----
    socket.on('assign_role', ({ userId, role } = {}) => {
      const c = ctx(); if (!c) return;
      if (!can(c.me.role, 'assign_role')) return deny('Only the host can assign roles.');
      const target = c.room.get(userId);
      if (!target || target.id === c.me.id) return deny('Invalid user.');
      if (!isValidAssignableRole(role)) return deny('Invalid role.');
      target.role = role;
      io.to(c.room.code).emit('role_assigned', { userId, username: target.username, role, participants: c.room.list() });
      pushRequests(c.room);
    });

    socket.on('remove_participant', ({ userId } = {}) => {
      const c = ctx(); if (!c) return;
      if (!can(c.me.role, 'remove')) return deny('Only the host can remove participants.');
      const target = c.room.get(userId);
      if (!target || target.id === c.me.id) return deny('Invalid user.');
      c.room.removeParticipant(userId);
      io.to(userId).emit('removed', { message: 'You were removed from the room by the host.' });
      const s = io.sockets.sockets.get(userId);
      if (s) { s.leave(c.room.code); s.data.roomId = null; }
      io.to(c.room.code).emit('participant_removed', { userId, participants: c.room.list() });
      pushRequests(c.room);
    });

    socket.on('transfer_host', ({ userId } = {}) => {
      const c = ctx(); if (!c) return;
      if (!can(c.me.role, 'transfer')) return deny('Only the host can transfer host.');
      if (!c.room.get(userId) || userId === c.me.id) return deny('Invalid user.');
      c.room.transferHost(c.me.id, userId);
      io.to(c.room.code).emit('role_assigned', { userId, username: c.room.get(userId).username, role: ROLES.HOST, participants: c.room.list() });
      pushRequests(c.room);
    });

    // ---- chat + reactions (bonus) ----
    socket.on('chat_message', ({ text } = {}) => {
      const c = ctx(); if (!c || !text?.trim()) return;
      io.to(c.room.code).emit('chat_message', { userId: c.me.id, username: c.me.username, text: text.trim().slice(0, 300), at: Date.now() });
    });
    socket.on('reaction', ({ emoji } = {}) => {
      const c = ctx(); if (!c) return;
      io.to(c.room.code).emit('reaction', { username: c.me.username, emoji: String(emoji).slice(0, 4) });
    });
  });
}