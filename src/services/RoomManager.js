import { Room } from '../models/Room.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  constructor() { this.rooms = new Map(); }

  generateCode() {
    let code;
    do { code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(''); }
    while (this.rooms.has(code));
    return code;
  }
  create() { const room = new Room(this.generateCode()); this.rooms.set(room.code, room); return room; }
  get(code) { return this.rooms.get(String(code || '').toUpperCase()); }
  deleteIfEmpty(room) { if (room.isEmpty) this.rooms.delete(room.code); }
}
