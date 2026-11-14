import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/supabase-admin";
import { SocialError } from "./errors";
import type { Viewer } from "./viewer";

const RPC_ERRORS = new Set([
  "poll_not_found",
  "poll_closed",
  "poll_bad_choice",
  "poll_option_mismatch",
  "poll_already_voted",
  "poll_change_not_allowed",
  "poll_has_votes",
  "forbidden",
]);

export type PollOption = { id: string; label: string; votes: number };
export type PollView = {
  id: string;
  question: string;
  multiChoice: boolean;
  maxChoices: number | null;
  allowChange: boolean;
  resultsAfterClose: boolean;
  closesAt: string;
  closed: boolean;
  closedEarly: boolean;
  options: PollOption[];
  /** Counts are shown only when the poll rules allow it for this viewer. */
  showResults: boolean;
  totalVoters: number;
  myOptionIds: string[];
  authorName: string;
};

export type NewPoll = {
  question: string;
  options: string[];
  closesAt: string;
  multiChoice: boolean;
  maxChoices: number | null;
  allowChange: boolean;
  resultsAfterClose: boolean;
};

async function within(key: string, windowSeconds: number, limit: number) {
  const { data, error } = await db().rpc("hit_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });
  if (error) throw new Error(`hit_rate_limit: ${error.message}`);
  return data === true;
}

const isClosed = (p: { closes_at: string; closed_at: string | null }) =>
  p.closed_at !== null || Date.parse(p.closes_at) <= Date.now();

export async function createPoll(viewer: Viewer, input: NewPoll) {
  if (!viewer.userId || !viewer.canModerate)
    throw new SocialError("polls_forbidden");
  const question = input.question.trim();
  const options = input.options.map((o) => o.trim()).filter(Boolean);
  const closes = Date.parse(input.closesAt);
  if (
    question.length < 3 ||
    question.length > 300 ||
    options.length < 2 ||
    options.length > 10 ||
    new Set(options.map((o) => o.toLowerCase())).size !== options.length ||
    options.some((o) => o.length > 100)
  )
    throw new SocialError("poll_invalid");
  if (!Number.isFinite(closes) || closes <= Date.now() + 60_000)
    throw new SocialError("poll_deadline_past");
  if (closes > Date.now() + 90 * 86_400_000)
    throw new SocialError("poll_invalid");
  const max =
    input.multiChoice && input.maxChoices
      ? Math.min(Math.max(input.maxChoices, 1), options.length)
      : null;
  if (!(await within(`poll:${viewer.userId}`, 86_400, 5)))
    throw new SocialError("poll_rate_limited");

  const { data: poll, error } = await db()
    .from("polls")
    .insert({
      author_id: viewer.userId,
      question,
      multi_choice: input.multiChoice,
      max_choices: max,
      allow_change: input.allowChange,
      results_after_close: input.resultsAfterClose,
      closes_at: new Date(closes).toISOString(),
    })
    .select("id")
    .single();
  if (error || !poll) throw new Error(`poll insert: ${error?.message}`);
  const { error: optErr } = await db()
    .from("poll_options")
    .insert(
      options.map((label, position) => ({ poll_id: poll.id, label, position })),
    );
  if (optErr) {
    await db().from("polls").delete().eq("id", poll.id);
    throw new Error(`poll options: ${optErr.message}`);
  }
  return poll.id as string;
}

export async function listPolls(
  viewer: Viewer,
  limit = 30,
): Promise<PollView[]> {
  const { data: polls, error } = await db()
    .from("polls")
    .select(
      "id, author_id, question, multi_choice, max_choices, allow_change, results_after_close, closes_at, closed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`polls: ${error.message}`);
  const rows = polls ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((p) => p.id as string);
  const [{ data: opts }, { data: votes }, { data: authors }] =
    await Promise.all([
      db()
        .from("poll_options")
        .select("id, poll_id, label, position")
        .in("poll_id", ids)
        .order("position"),
      db()
        .from("votes")
        .select("poll_id, option_id, user_id")
        .in("poll_id", ids),
      db()
        .from("users")
        .select("id, display_name")
        .in("id", [...new Set(rows.map((p) => p.author_id as string))]),
    ]);
  const authorName = new Map(
    (authors ?? []).map((a) => [
      a.id as string,
      (a.display_name as string | null) ?? "Модерация",
    ]),
  );
  const result = rows.map<PollView>((p) => {
    const closed = isClosed(
      p as { closes_at: string; closed_at: string | null },
    );
    const pv = (votes ?? []).filter((v) => v.poll_id === p.id);
    const mine = pv
      .filter((v) => v.user_id === viewer.userId)
      .map((v) => v.option_id as string);
    const showResults = closed || (!p.results_after_close && mine.length > 0);
    return {
      id: p.id as string,
      question: p.question as string,
      multiChoice: p.multi_choice as boolean,
      maxChoices: (p.max_choices as number | null) ?? null,
      allowChange: p.allow_change as boolean,
      resultsAfterClose: p.results_after_close as boolean,
      closesAt: p.closes_at as string,
      closed,
      closedEarly: p.closed_at !== null,
      options: (opts ?? [])
        .filter((o) => o.poll_id === p.id)
        .map((o) => ({
          id: o.id as string,
          label: o.label as string,
          votes: showResults
            ? pv.filter((v) => v.option_id === o.id).length
            : 0,
        })),
      showResults,
      totalVoters: showResults ? new Set(pv.map((v) => v.user_id)).size : 0,
      myOptionIds: mine,
      authorName: authorName.get(p.author_id as string) ?? "Модерация",
    };
  });
  // open polls first (soonest deadline), then the closed ones (newest first)
  return [
    ...result
      .filter((p) => !p.closed)
      .sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt)),
    ...result.filter((p) => p.closed),
  ];
}

export async function castVote(
  viewer: Viewer,
  pollId: string,
  optionIds: string[],
  change: boolean,
) {
  if (!viewer.userId || !viewer.canPublish)
    throw new SocialError("vote_forbidden");
  const { error } = await db().rpc("cast_vote", {
    p_user: viewer.userId,
    p_poll: pollId,
    p_options: optionIds,
    p_change: change,
  });
  if (error) {
    if (RPC_ERRORS.has(error.message))
      throw new SocialError(
        error.message === "forbidden" ? "vote_forbidden" : error.message,
      );
    // malformed ids and similar input problems are not a server fault
    if (error.code === "22P02") throw new SocialError("poll_bad_choice");
    throw new Error(`cast_vote: ${error.message}`);
  }
}

/** Early close by staff; the result becomes public (SC-POLL-03 A1). */
export async function closePoll(viewer: Viewer, pollId: string) {
  if (!viewer.userId || !viewer.canModerate)
    throw new SocialError("polls_forbidden");
  const { data: poll } = await db()
    .from("polls")
    .select("id, closes_at, closed_at")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll) throw new SocialError("poll_not_found");
  if (isClosed(poll as { closes_at: string; closed_at: string | null }))
    throw new SocialError("poll_closed");
  await db()
    .from("polls")
    .update({ closed_at: new Date().toISOString(), closed_by: viewer.userId })
    .eq("id", pollId);
  await writeAudit(viewer.userId, "poll.closed_by_moderator", {
    poll_id: pollId,
  });
}

/** The open poll that ends first, for the dashboard card. */
export async function nextOpenPoll(userId: string) {
  const { data } = await db()
    .from("polls")
    .select("id, question, closes_at")
    .is("closed_at", null)
    .gt("closes_at", new Date().toISOString())
    .order("closes_at")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const { data: votes } = await db()
    .from("votes")
    .select("user_id")
    .eq("poll_id", data.id);
  const voters = new Set((votes ?? []).map((v) => v.user_id as string));
  return {
    question: data.question as string,
    endsAt: data.closes_at as string,
    voted: voters.has(userId),
    participants: voters.size,
  };
}
