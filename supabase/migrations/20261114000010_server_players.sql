-- Dashboard server card: player counts reported by the Bridge heartbeat.
alter table public.bridge_servers
  add column online_count integer check (online_count is null or online_count >= 0),
  add column max_players  integer check (max_players is null or max_players >= 0);
