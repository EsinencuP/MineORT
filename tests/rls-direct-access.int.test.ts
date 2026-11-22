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
  posts: { body: "x" },
  projects: { title: "xxx" },
  project_needs: { title: "x" },
  project_supporters: { user_id: "00000000-0000-0000-0000-000000000000" },
  media: { storage_key: "x" },
  media_attachments: { target_type: "post" },
  reactions: { kind: "like" },
  moderation_reports: { reason: "xxx" },
  polls: { question: "xxx" },
  poll_options: { label: "x" },
  votes: { multi_choice: false },
  events: { title: "xxx" },
  event_attendees: { user_id: "00000000-0000-0000-0000-000000000000" },
  guilds: { name: "xxx" },
  guild_ranks: { level: 1 },
  guild_members: { status: "active" },
  guild_invitations: { status: "pending" },
  guild_join_requests: { status: "pending" },
  privacy_settings: { user_id: "00000000-0000-0000-0000-000000000000" },
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
  bridge_servers: { name: "x" },
  map_chunks: { dim: "overworld", cx: 0, cz: 0 },
  map_regions: { dim: "overworld", rx: 0, rz: 0 },
  map_viewers: { user_id: "00000000-0000-0000-0000-000000000000" },
  bridge_keys: {
    key_id: "x",
    server_id: "00000000-0000-0000-0000-000000000000",
    slot: "A",
    secret_enc: "x",
  },
  bridge_nonces: { key_id: "x", nonce: "x" },
  whitelist_entries: { nickname: "abc" },
  server_actions: {
    id: "00000000-0000-0000-0000-000000000000",
    type: "whitelist.add",
  },
  server_action_attempts: {
    action_id: "00000000-0000-0000-0000-000000000000",
    attempt: 1,
    status: "x",
  },
  server_events: { type: "x" },
  whitelist_drift: { nickname: "abc" },
  guide_articles: { slug: "x", category: "install", title: "x" },
  site_settings: { key: "server_address", value: "x" },
  admin_totp: {
    user_id: "00000000-0000-0000-0000-000000000000",
    secret_enc: "x",
  },
  deletion_tombstones: { telegram_id_hash: "x" },
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
  claim_nonce: { p_key_id: "x", p_nonce: "x" },
  lease_actions: { p_server: "00000000-0000-0000-0000-000000000000", p_max: 5 },
  record_action_result: {
    p_server: "00000000-0000-0000-0000-000000000000",
    p_action: "00000000-0000-0000-0000-000000000000",
    p_attempt: 1,
    p_status: "succeeded",
    p_retryable: false,
    p_error: null,
    p_detail: null,
  },
  release_nickname: {
    p_user: "00000000-0000-0000-0000-000000000000",
    p_min_until: null,
  },
  admin_set_account_status: {
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_user: "00000000-0000-0000-0000-000000000001",
    p_action: "ban",
    p_reason: "x",
    p_until: null,
    p_tg_hash: null,
  },
  delete_account: {
    p_user: "00000000-0000-0000-0000-000000000000",
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_tg_hash: null,
  },
  tombstone_blocks: { p_tg_hash: "x" },
  write_audit: {
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_action: "x",
    p_details: {},
  },
  cast_vote: {
    p_user: "00000000-0000-0000-0000-000000000000",
    p_poll: "00000000-0000-0000-0000-000000000000",
    p_options: [],
    p_change: false,
  },
  join_event: {
    p_user: "00000000-0000-0000-0000-000000000000",
    p_event: "00000000-0000-0000-0000-000000000000",
  },
  create_guild: {
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_name: "xxx",
    p_slug: "x",
    p_tag: "XX",
    p_color: "#000000",
    p_description: "",
    p_owner: "00000000-0000-0000-0000-000000000000",
  },
  guild_assign_rank: {
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_guild: "00000000-0000-0000-0000-000000000000",
    p_target: "00000000-0000-0000-0000-000000000000",
    p_level: 6,
  },
  guild_leave: { p_user: "00000000-0000-0000-0000-000000000000" },
  guild_transfer_owner: {
    p_actor: "00000000-0000-0000-0000-000000000000",
    p_guild: "00000000-0000-0000-0000-000000000000",
    p_new_owner: "00000000-0000-0000-0000-000000000000",
    p_keep_vice: false,
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
