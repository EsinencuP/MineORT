-- Cancel reasons are short free text (review finding on E09).
alter table public.events
  add constraint events_cancel_reason_len check (cancel_reason is null or length(cancel_reason) <= 500);
