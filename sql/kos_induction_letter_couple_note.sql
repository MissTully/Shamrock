-- Couple induction letters say how to buy one Zeffy ticket per person.
--
-- APPLY THIS IN THE SUPABASE SQL EDITOR. The website deploy does not run it.
--   Project: oazwkwflgbthojvnclfc
--   Run after sql/kos_membership_pipeline_dashboard.sql.
--   Safe to run again. Applying this file does not send email.
--
-- Replaces public.kos_induction_letter_html(text, jsonb, text, text).
-- When two or more unpaid offers share a Zeffy URL, one line is added
-- after the pay buttons.
--
-- Rollback: run the kos_induction_letter_html block from
-- sql/kos_membership_pipeline_dashboard.sql again.

create or replace function public.kos_induction_letter_html(
  p_first text,
  p_offers jsonb,
  p_when text,
  p_place text
)
returns text
language plpgsql
stable
set search_path = public
as $letter$
declare
  v_html text;
  v_offer jsonb;
  v_any_link boolean := false;
  v_shared boolean := false;
  v_urls text[] := '{}';
begin
  v_html :=
    '<p>Dear ' || public.kos_html_text(coalesce(nullif(btrim(p_first), ''), 'friend')) || ',</p>'
    || '<p>Your background check is complete. We would like to welcome you in person.</p>'
    || '<p>You are invited to your in-person induction at our next membership meeting.</p>'
    || '<p><strong>Date and time:</strong> ' || public.kos_html_text(p_when) || '</p>'
    || '<p><strong>Place:</strong> ' || public.kos_html_text(p_place) || '</p>'
    || '<p>At that meeting we will ask you to share a little about why you want to join the Krewe. A sentence or two is plenty.</p>';
  if jsonb_typeof(p_offers) = 'array' then
    for v_offer in select value from jsonb_array_elements(p_offers)
    loop
      if coalesce(v_offer->>'paid', '') = 'true' then
        v_html := v_html || '<p>' || public.kos_html_text(coalesce(v_offer->>'name', 'Dues'))
          || ': membership dues are already paid.</p>';
      elsif nullif(v_offer->>'url', '') is not null then
        v_any_link := true;
        if coalesce(v_offer->>'paid', '') is distinct from 'true' then
          if (v_offer->>'url') = any (v_urls) then
            v_shared := true;
          else
            v_urls := v_urls || (v_offer->>'url');
          end if;
        end if;
        v_html := v_html
          || '<p><strong>' || public.kos_html_text(coalesce(v_offer->>'label', 'Full Krewe'))
          || '</strong>'
          || case when nullif(v_offer->>'name', '') is not null
               then ' for ' || public.kos_html_text(v_offer->>'name')
               else ''
             end
          || ': $' || public.kos_html_text(coalesce(v_offer->>'amount', ''))
          || '. This is membership dues, not the background check fee.</p>'
          || '<p style="margin:18px 0;"><a href="' || public.kos_html_text(v_offer->>'url') || '" '
          || 'style="display:inline-block;background:#14532d;color:#fff;padding:12px 18px;border-radius:999px;'
          || 'text-decoration:none;font-weight:700;">Pay dues on Zeffy</a></p>';
      else
        v_html := v_html || '<p>A dues pay link is not ready yet. The treasurer will send it. This is membership dues, not the background check fee.</p>';
      end if;
    end loop;
  end if;
  if not v_any_link and (p_offers is null or jsonb_array_length(coalesce(p_offers, '[]'::jsonb)) = 0) then
    v_html := v_html || '<p>A dues pay link is not ready yet. The treasurer will send it.</p>';
  end if;
  if v_shared then
    v_html := v_html || '<p>On Zeffy, add one ticket for each person and put each person''s name and email on their own ticket.</p>';
  end if;
  v_html := v_html || '<p>We are glad you are joining us.</p><p>Sláinte!</p>';
  return v_html;
end;
$letter$;

revoke all on function public.kos_induction_letter_html(text, jsonb, text, text) from public, anon, authenticated;

