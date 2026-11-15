-- Gallery (SC-GAL-01/02): categories and captions per gallery entry, reports and moderator hiding for images.

alter table public.media_attachments
  add column category text not null default 'other'
    check (category in ('build', 'landscape', 'event', 'funny', 'other'));
create index media_attachments_gallery_idx
  on public.media_attachments (created_at desc) where target_type = 'gallery';

alter table public.media add column moderation_reason text;

alter table public.moderation_reports drop constraint moderation_reports_target_type_check;
alter table public.moderation_reports
  add constraint moderation_reports_target_type_check check (target_type in ('post', 'media'));
