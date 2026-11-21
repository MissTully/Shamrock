-- Krewe of Shamrock: fill missing member email and phone from the old website
-- (Wild Apricot legacy data already imported into legacy_event_registrations
-- and legacy_payments).
--
-- Safety rules:
--   * Only fills members.email / members.phone when the Hub value is empty.
--   * Never overwrites a value a member or officer already entered.
--   * Matches on normalized first + last name only when the legacy data has
--     exactly ONE distinct value for that person (no guessing).
--   * Skips merged rows.
-- Run the SELECT preview first. The UPDATE block is wrapped in a transaction.

-- 1) Preview (read only)
with m as (
  select id, first_name, last_name, email, phone,
    lower(regexp_replace(trim(first_name),'[^a-zA-Z]','','g')) fn,
    lower(regexp_replace(trim(last_name),'[^a-zA-Z]','','g')) ln
  from public.members where merged_into is null),
src as (
  select lower(regexp_replace(trim(first_name),'[^a-zA-Z]','','g')) fn,
         lower(regexp_replace(trim(last_name),'[^a-zA-Z]','','g')) ln,
         lower(trim(email)) email, regexp_replace(coalesce(phone,''),'\D','','g') phone
  from public.legacy_event_registrations where is_member is not false
  union all
  select lower(regexp_replace(trim(first_name),'[^a-zA-Z]','','g')),
         lower(regexp_replace(trim(last_name),'[^a-zA-Z]','','g')),
         lower(trim(email)), ''
  from public.legacy_payments),
agg as (
  select fn, ln,
    min(email) filter (where email <> '') one_email,
    count(distinct email) filter (where email <> '') n_emails,
    min(right(phone,10)) filter (where length(phone) >= 10) one_phone,
    count(distinct right(phone,10)) filter (where length(phone) >= 10) n_phones
  from src where fn <> '' and ln <> '' group by fn, ln)
select m.first_name, m.last_name, m.email, m.phone, a.one_email, a.n_emails, a.one_phone, a.n_phones,
  (coalesce(trim(m.email),'') = '' and a.n_emails = 1) as will_fill_email,
  (coalesce(trim(m.phone),'') = '' and a.n_phones = 1) as will_fill_phone
from m join agg a on a.fn = m.fn and a.ln = m.ln
where (coalesce(trim(m.email),'') = '' and a.n_emails = 1)
   or (coalesce(trim(m.phone),'') = '' and a.n_phones = 1);

-- 2) Apply (only after Melissa approves)
begin;
with m as (
  select id,
    lower(regexp_replace(trim(first_name),'[^a-zA-Z]','','g')) fn,
    lower(regexp_replace(trim(last_name),'[^a-zA-Z]','','g')) ln
  from public.members where merged_into is null),
src as (
  select lower(regexp_replace(trim(first_name),'[^a-zA-Z]','','g')) fn,
         lower(regexp_replace(trim(last_name),'[^a-zA-Z]','','g')) ln,
         lower(trim(email)) email, regexp_replace(coalesce(phone,''),'\D','','g') phone
  from public.legacy_event_registrations where is_member is not false
  union all
  select lower(regexp_replace(trim(first_name),'[^a-zA-Z]','','g')),
         lower(regexp_replace(trim(last_name),'[^a-zA-Z]','','g')),
         lower(trim(email)), ''
  from public.legacy_payments),
agg as (
  select fn, ln,
    case when count(distinct email) filter (where email <> '') = 1
         then min(email) filter (where email <> '') end one_email,
    case when count(distinct right(phone,10)) filter (where length(phone) >= 10) = 1
         then min(right(phone,10)) filter (where length(phone) >= 10) end one_phone
  from src where fn <> '' and ln <> '' group by fn, ln)
update public.members t
   set email = case when coalesce(trim(t.email),'') = '' and a.one_email is not null then a.one_email else t.email end,
       phone = case when coalesce(trim(t.phone),'') = '' and a.one_phone is not null then a.one_phone else t.phone end,
       updated_at = now()
  from m join agg a on a.fn = m.fn and a.ln = m.ln
 where t.id = m.id
   and ((coalesce(trim(t.email),'') = '' and a.one_email is not null)
     or (coalesce(trim(t.phone),'') = '' and a.one_phone is not null));
commit;
