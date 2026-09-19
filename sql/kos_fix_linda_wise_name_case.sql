-- Data fix: normalize a last name typed in all caps on the Tartan Ball RSVP
-- form ("Linda WISE" -> "Linda Wise").
-- (Also applied to Supabase as migration kos_fix_linda_wise_name_case.)
update public.members
   set last_name = 'Wise', updated_at = now()
 where id = '62b1a59f-5695-4131-8386-0119dae945bc'
   and last_name = 'WISE';
