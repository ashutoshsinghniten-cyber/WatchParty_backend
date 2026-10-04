export class Participant {
  constructor(id, username, role) {
    this.id = id; // socket id doubles as userId
    this.username = username;
    this.role = role;
  }
  toJSON() {
    return { userId: this.id, username: this.username, role: this.role };
  }
}
