-- Allow Atlas area labels to store their ordered vertices.
alter table public.map_markers
  add column if not exists boundary jsonb
  check (boundary is null or (kind = 'label' and jsonb_typeof(boundary) = 'array'
    and jsonb_array_length(boundary) between 3 and 64));
