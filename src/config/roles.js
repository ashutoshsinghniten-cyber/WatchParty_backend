// Role names + permission table. Backend ALWAYS checks these before acting.
export const ROLES = { HOST: 'host', MODERATOR: 'moderator', PARTICIPANT: 'participant', VIEWER: 'viewer' };

const PERMISSIONS = {
  host: ['control', 'assign_role', 'remove', 'transfer', 'approve'],
  moderator: ['control', 'approve'],
  participant: [],
  viewer: [],
};

export const can = (role, permission) => (PERMISSIONS[role] || []).includes(permission);
export const isValidAssignableRole = (r) => [ROLES.MODERATOR, ROLES.PARTICIPANT, ROLES.VIEWER].includes(r);
