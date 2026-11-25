-- NOT APPLIED. Run in the Supabase SQL editor on oazwkwflgbthojvnclfc
-- before deploying supabase/functions/zeffy-webhook.
-- Safe to run again. This file does not insert payments and does not send email.
--
-- One row per call to zeffy-webhook. The function inserts with the service
-- role. RLS is on and there are no policies, so anon and authenticated
-- cannot read or write the table.

create table if not exists public.zeffy_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event_type text,
  provider_event_id text,
  http_status integer,
  error text,
  payload jsonb
);

comment on table public.zeffy_webhook_receipts is
  'One row per zeffy-webhook call. Service role insert only. No client policies.';

comment on column public.zeffy_webhook_receipts.payload is
  'Zeffy JSON body. The webhook token is not stored.';

alter table public.zeffy_webhook_receipts enable row level security;

revoke all on table public.zeffy_webhook_receipts from public, anon, authenticated;
grant all on table public.zeffy_webhook_receipts to service_role;

create index if not exists zeffy_webhook_receipts_received_at_idx
  on public.zeffy_webhook_receipts (received_at desc);
