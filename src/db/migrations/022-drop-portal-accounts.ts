import type { Migration } from './index.js';

/**
 * Remove email/password login — NanoClaw is a personal agent, not multi-user.
 * Portal access is now gated only by the bearer token (NCL_PORTAL_TOKEN) and
 * Origin/Host validation. No accounts, no sessions, no passwords.
 */
export const migration022: Migration = {
  version: 22,
  name: '022-drop-portal-accounts',
  up: (db) => {
    db.exec(`
      DROP TABLE IF EXISTS portal_sessions;
      DROP TABLE IF EXISTS portal_accounts;
    `);
  },
};
