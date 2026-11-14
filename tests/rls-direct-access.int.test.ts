import { describe, expect, it } from "vitest";

// Integration check against a real Supabase project (TC-OPS-06f/06g style).
// Runs only when NEXT_PUBLIC_SUPABASE_URL and the publishable key are set (e.g. via .env.local).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const headers = {
  apikey: key ?? "",
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

// Every base table in public; extend as migrations add tables.
const tables: Record<string, Record<string, unknown>> = {
  users: { site_role: "admin", account_status: "active" },
  audit_log: { action: "x" },
  security_events: { type: "x" },
  telegram_identities: { telegram_id: 1 },
  user_sessions: { token_hash: "x", expires_at: "2030-01-01T00:00:00Z" },
  login_states: {
    state_hash: "x",
    nonce: "x",
    code_verifier: "x",
    expires_at: "2030-01-01T00:00:00Z",
  },
  rate_limit_counters: { key: "x", window_start: "2030-01-01T00:00:00Z" },
  test_login_tokens: { jti: "x" },
  rules_versions: { version_major: 1, version_minor: 0, body: "x" },
  rules_acceptances: { user_id: "00000000-0000-0000-0000-000000000000" },
  minecraft_identities: { nickname: "abc" },
  applications: { text: "x" },
  invitations: { token_hash: "x", expires_at: "2030-01-01T00:00:00Z" },
  invitation_redemptions: { user_id: "00000000-0000-0000-0000-000000000000" },
  access_memberships: { status: "approved" },
};

// SECURITY DEFINER helpers must not be callable by client roles.
const rpcs: Record<string, Record<string, unknown>> = {
  hit_rate_limit: { p_key: "x", p_window_seconds: 60, p_limit: 1 },
  consume_login_state: { p_state_hash: "x" },
  accept_rules: {
    p_user: "00000000-0000-0000-0000-000000000000",
    p_version: "00000000-0000-0000-0000-000000000000",
  },
  reserve_nickname: {
    p_user: "00000000-0000-0000-0000-000000000000",
    p_nick: "abc",
  },
  redeem_invitation: {
    p_user: "00000000-0000-0000-0000-000000000000",
    p_token_hash: "x",
  },
  decide_application: {
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_application: "00000000-0000-0000-0000-000000000000",
    p_decision: "approve",
    p_reason: "x",
  },
  write_audit: {
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_action: "x",
    p_details: {},
  },
  upsert_telegram_user: {
    p_telegram_id: 1,
    p_username: "x",
    p_display_name: "x",
  },
};

describe.skipIf(!url || !key)("client roles cannot touch base tables", () => {
  for (const [table, row] of Object.entries(tables)) {
    it(`${table}: SELECT denied`, async () => {
      const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers });
      expect([401, 403]).toContain(res.status);
    });
    it(`${table}: INSERT denied`, async () => {
      const res = await fetch(`${url}/rest/v1/${table}`, {
        method: "POST",
        headers,
        body: JSON.stringify(row),
      });
      expect([401, 403]).toContain(res.status);
    });
    it(`${table}: UPDATE denied`, async () => {
      const res = await fetch(
        `${url}/rest/v1/${table}?${Object.keys(row)[0]}=not.is.null`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(row),
        },
      );
      expect([401, 403]).toContain(res.status);
    });
  }

  for (const [fn, args] of Object.entries(rpcs)) {
    it(`rpc ${fn}: denied`, async () => {
      const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
      });
      expect([401, 403, 404]).toContain(res.status);
    });
  }
});
