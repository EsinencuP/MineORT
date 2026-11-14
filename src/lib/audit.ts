import "server-only";
import { db } from "@/lib/supabase-admin";

/** Appends an administrative action to audit_log (append-only table, see migration 1). */
export async function writeAudit(
  actorId: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await db().rpc("write_audit", {
    p_actor: actorId,
    p_action: action,
    p_details: details,
  });
  if (error) throw new Error(`write_audit: ${error.message}`);
}
