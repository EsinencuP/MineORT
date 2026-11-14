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
      const res = await fetch(`${url}/rest/v1/${table}?id=not.is.null`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(row),
      });
      expect([401, 403]).toContain(res.status);
    });
  }
});
