import { Participant } from './Participant.js';
import { ROLES, can } from '../config/roles.js';

const DEFAULT_VIDEO = 'dQw4w9WgXcQ';

export class Room {
  constructor(code) {
    this.code = code;
    this.participants = new Map();
    this.requests = new Map(); // pending change requests from participants
    this.state = { videoId: DEFAULT_VIDEO, playState: 'paused', time: 0, updatedAt: Date.now() };
    this.reqCounter = 0;
  }

  get isEmpty() { return this.participants.size === 0; }
  list() { return [...this.participants.values()].map((p) => p.toJSON()); }
  get(id) { return this.participants.get(id); }

  addParticipant(id, username, clientId) {
    const role = this.isEmpty ? ROLES.HOST : ROLES.PARTICIPANT;
    const p = new Participant(id, username, role, clientId);
    this.participants.set(id, p);
    return p;
  }

  findByClientId(clientId) {
    return [...this.participants.values()].find((p) => p.clientId && p.clientId === clientId);
  }

  /** Give an existing participant a new socket id (used when they refresh and reconnect). */
  rebind(p, newId) {
    const oldId = p.id;
    this.participants.delete(oldId);
    for (const r of this.requests.values()) if (r.userId === oldId) r.userId = newId;
    p.id = newId;
    this.participants.set(newId, p);
  }

  /** Removes a user. If the host leaves, promotes a moderator (or oldest user). Returns new host or null. */
  removeParticipant(id) {
    const leaving = this.participants.get(id);
    clearTimeout(leaving?.graceTimer);
    this.participants.delete(id);
    for (const [rid, r] of this.requests) if (r.userId === id) this.requests.delete(rid);
    if (leaving?.role === ROLES.HOST && !this.isEmpty) {
      const all = [...this.participants.values()];
      const next = all.find((p) => p.role === ROLES.MODERATOR) || all[0];
      next.role = ROLES.HOST;
      return next;
    }
    return null;
  }

  transferHost(fromId, toId) {
    this.participants.get(fromId).role = ROLES.MODERATOR;
    this.participants.get(toId).role = ROLES.HOST;
  }

  /** Current playback snapshot, with time advanced if playing. */
  snapshot() {
    const { videoId, playState, time, updatedAt } = this.state;
    const current = playState === 'playing' ? time + (Date.now() - updatedAt) / 1000 : time;
    return { videoId, playState, currentTime: current };
  }

  /** Apply a playback action. Caller must have already checked permissions. */
  applyAction(type, payload = {}) {
    const now = Date.now();
    const cur = this.snapshot().currentTime;
    switch (type) {
      case 'play': this.state = { ...this.state, playState: 'playing', time: cur, updatedAt: now }; break;
      case 'pause': this.state = { ...this.state, playState: 'paused', time: cur, updatedAt: now }; break;
      case 'seek': this.state = { ...this.state, time: Math.max(0, Number(payload.time) || 0), updatedAt: now }; break;
      case 'change_video':
        if (!payload.videoId) return false;
        this.state = { videoId: String(payload.videoId).slice(0, 20), playState: 'playing', time: 0, updatedAt: now }; break;
      default: return false;
    }
    return true;
  }

  addRequest(userId, action, payload) {
    const id = `r${++this.reqCounter}`;
    this.requests.set(id, { id, userId, username: this.get(userId).username, action, payload });
    return id;
  }
  pendingRequests() { return [...this.requests.values()]; }
  canControl(id) { return can(this.get(id)?.role, 'control'); }
}