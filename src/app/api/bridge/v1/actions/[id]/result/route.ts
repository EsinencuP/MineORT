import type { NextRequest } from "next/server";
import { authenticateBridge, bridgeJson, isAuthError } from "@/lib/bridge/auth";
import { recordResult } from "@/lib/bridge/queue";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/bridge/v1/actions/[id]/result">,
) {
  const raw = await req.text();
  const auth = await authenticateBridge(req, raw, "general");
  if (isAuthError(auth)) return auth;

  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }
  if (
    !UUID.test(id) ||
    !Number.isInteger(body.attempt) ||
    (body.status !== "succeeded" && body.status !== "failed")
  ) {
    return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
  }

  const code = await recordResult({
    serverId: auth.serverId,
    actionId: id,
    attempt: body.attempt as number,
    status: body.status,
    retryable: body.retryable === true,
    errorCode:
      typeof body.error_code === "string" ? body.error_code.slice(0, 64) : null,
    detail: typeof body.detail === "string" ? body.detail : null,
  });
  if (code === "ok") return bridgeJson({ ok: true });
  if (code === "ERR_LEASE_EXPIRED") return bridgeJson({ error: code }, 409);
  if (code === "ERR_NOT_FOUND") return bridgeJson({ error: code }, 404);
  return bridgeJson({ error: "ERR_BAD_REQUEST" }, 400);
}
