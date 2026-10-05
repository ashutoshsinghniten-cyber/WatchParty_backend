export class Participant {
  constructor(id, username, role, clientId) {
    this.id = id; // current socket id (changes on refresh)
    this.clientId = clientId; // stable id for this browser tab
    this.username = username;
    this.role = role;
    this.graceTimer = null;
  }
  toJSON() {
    return { userId: this.id, username: this.username, role: this.role };
  }
}