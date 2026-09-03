-- ============================================================================
-- Krewe of Shamrock — Payments ledger (applied live as migrations
-- payments_ledger_and_webhook_support + widen_membership_status_values;
-- the stripe-webhook Edge Function is deployed alongside).
-- Rows are written ONLY by the webhook (service role) via kos_record_payment;
-- officers read them in the hub. See PAYMENTS_SETUP.md for the runbook.
-- ============================================================================

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null default 'stripe',
  provider_event_id   text unique,
  provider_payment_id text,
  amount_cents        integer not null,
  currency            text not null default 'usd',
  status              text not null default 'succeeded',
  payer_email         text,
  payer_name          text,
  description         text,
  product_kind        text not null default 'other'
                        check (product_kind in ('store','event','dues','donation','raffle','other')),
  member_id           uuid references public.members(id),
  event_id            uuid references public.events(id),
  membership_year     integer,
  raw                 jsonb,
  created_at          timestamptz not null default now()
);
alter table public.payments enable row level security;

drop policy if exists payments_officer_read on public.payments;
create policy payments_officer_read on public.payments
  for select using (public.is_krewe_officer());

-- Wild Apricot statuses and merge retirement needed more status values than
-- the original check constraint allowed (merging would have failed).
alter table public.members drop constraint if exists members_membership_status_check;
alter table public.members add constraint members_membership_status_check
  check (membership_status in ('active','inactive','lapsed','prospect',
                               'pending-new','pending-renewal','merged'));

create or replace function public.kos_record_payment(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
  v_id     uuid;
  v_kind   text;
  v_year   integer;
begin
  v_kind := coalesce(p->>'product_kind', 'other');
  if v_kind not in ('store','event','dues','donation','raffle','other') then
    v_kind := 'other';
  end if;
  v_year := coalesce(nullif(p->>'membership_year','')::integer,
                     extract(year from current_date)::integer);
  select id into v_member from public.members
   where lower(email) = lower(coalesce(p->>'payer_email','')) and merged_into is null
   order by created_at limit 1;

  insert into public.payments
    (provider, provider_event_id, provider_payment_id, amount_cents, currency,
     status, payer_email, payer_name, description, product_kind, member_id,
     membership_year, raw)
  values
    (coalesce(p->>'provider','stripe'), p->>'provider_event_id',
     p->>'provider_payment_id', coalesce((p->>'amount_cents')::integer, 0),
     coalesce(p->>'currency','usd'), coalesce(p->>'status','succeeded'),
     p->>'payer_email', p->>'payer_name', p->>'description', v_kind, v_member,
     v_year, p->'raw')
  on conflict (provider_event_id) do nothing
  returning id into v_id;

  if v_id is null then return jsonb_build_object('duplicate', true); end if;

  if v_kind = 'dues' and v_member is not null then
    update public.dues_payments
       set paid = true, paid_date = current_date, payment_method = 'card'
     where member_id = v_member and membership_year = v_year and paid = false;
  end if;

  return jsonb_build_object('ok', true, 'payment_id', v_id,
                            'member_matched', v_member is not null);
end $$;
revoke all on function public.kos_record_payment(jsonb) from public, anon, authenticated;
grant execute on function public.kos_record_payment(jsonb) to service_role;

create or replace function public.list_recent_payments(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_krewe_officer() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'when', pm.created_at, 'amount_cents', pm.amount_cents,
      'kind', pm.product_kind, 'payer', coalesce(pm.payer_name, pm.payer_email),
      'email', pm.payer_email, 'description', pm.description,
      'matched', pm.member_id is not null) order by pm.created_at desc)
    from (select * from public.payments
          order by created_at desc
          limit least(greatest(coalesce(p_limit, 50), 1), 200)) pm), '[]'::jsonb)
  else null end;
$$;
revoke all on function public.list_recent_payments(integer) from anon;
