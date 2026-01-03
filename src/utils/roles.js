// src/utils/roles.js
export const ROLES = {
  VIEWER: "Viewer",
  ACCOUNTANT: "Accountant",
  ADMIN: "Admin",
};

export const canEditAccounting = (role) =>
  role === ROLES.ACCOUNTANT || role === ROLES.ADMIN;

export const canManageUsers = (role) =>
  role === ROLES.ADMIN;

export const canViewOnly = (role) =>
  role === ROLES.VIEWER;