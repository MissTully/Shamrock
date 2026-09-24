-- Happy Birthday card on the Member Hub.
-- Reads the existing members.birthday date. Month and day are matched with
-- EXTRACT against today's calendar date in America/New_York. Callers receive
-- first and last name only — never the year, email, or phone.
-- Current krewe: not merged away, membership active / pending-renewal / pending-new.
--
-- security definer so every signed-in member sees the same celebrants.
-- Row security on members otherwise hides pending rows (and would return the
-- full birthday date, year included, to anyone allowed to select the column).

create or replace function public.list_todays_birthdays()
returns table (first_name text, last_name text)
language sql
stable
security definer
set search_path = public
as $$
  select m.first_name, m.last_name
  from public.members m
  where auth.uid() is not null
    and m.merged_into is null
    and m.membership_status in ('active', 'pending-renewal', 'pending-new')
    and m.birthday is not null
    and extract(month from m.birthday)
        = extract(month from (timezone('America/New_York', now())))
    and extract(day from m.birthday)
        = extract(day from (timezone('America/New_York', now())))
  order by m.first_name, m.last_name;
$$;

revoke all on function public.list_todays_birthdays() from public, anon;
grant execute on function public.list_todays_birthdays() to authenticated;
