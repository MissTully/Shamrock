# Membership process

Plain guide for officers. The Member Hub is the place you do this work. The website deploy does not run SQL. Melissa applies SQL in the Supabase editor after she reviews it.

Sample names in tests and screenshots are not real members.

## New member

1. They submit interest on the Join form, as a single applicant or a couple. That creates a new interest (`pending-new`).
2. You call them. Membership Applications shows the phone number and a call notes field.
3. **Called, send background check email** sends the joining packet. It has a private link to the full application and, for a standard applicant, the background check fee ($50 individual or $75 couple). It does not include a dues link. An Auxiliary applicant is told their $200 dues include the background check, and that letter does not also show the fee buttons.
4. You can edit the letter with **Edit joining packet email**. **Preview as** Standard shows the fee intro and the fee buttons. **Preview as** Auxiliary shows the Auxiliary sentence, with no fee intro and no fee buttons. Preview uses the sample name Nia and does not send email.
5. When the fee is paid, or you use **Auxiliary: fee included**, the card moves to Background check fee paid.
6. **Start background check** stays off until the full application is in. The helper text is "Waiting for the full application". A single applicant needs a Social Security number and a driver's license on file. A couple also needs both for the partner. Then the button turns on. Copy uses the last 4 on the card. The full number goes to the clipboard only when you copy it. No email is sent.
7. When the check is clean, **Proceed with induction, send dues link**. That is `dues-pending`. This status is only for new applicants.
8. After the Krewe votes them in at a general meeting, **Approve membership**. That is the only approval that sends the welcome letter, with the Member Hub login steps and the training video.

Decline and Withdraw keep the record. Nothing is deleted.

Treasurer, Vice President, and other officers who are not the Membership Chair, President, Secretary, or Chair of Technology do not see Membership Applications. That access is unchanged.

## Returning member

Membership Applications has no Renewals tab and no Approve renewal button. A person waiting on dues does not show in that tool.

The cycle is:

1. **Active.** They are on the roster.
2. **Lapsed.** After the lapse date, Renewals can mark someone lapsed when they are still active, not exempt, and have no paid or applied-waiver dues row for the season. People who joined on or after June 1 of this season are skipped. No email is sent by Mark lapsed.
3. **Pending dues.** The status value is `pending-renewal`. The Hub label is Pending dues. This is a lapsed member who was sent a reactivation link, or who picked a level on their own Renew card. An unpaid dues row is on file. Their payment has not come in yet.
4. **Active again.** A Zeffy dues payment does this. Cash or check does it when you use Renewals, **Mark renewed**. No renewal email is sent for the cash or check mark.

Do not put a returning member in `dues-pending`. That status is the new-applicant induction step.

### Who is never lapsed

`kos_is_dues_exempt` is the only exempt rule. The renewal list, the lapse list, and Mark lapsed all use it.

- Today, role officer, board, or captain is exempt. That role line is marked in the function. Deleting it is the bylaws change. Board, captain, and committee-chair roles would then not be exempt.
- An elected title stays exempt either way: President, Vice President, Secretary, or Treasurer. `Treasurer · Committee Chair of Finance` counts. A committee chair title alone does not.
- A dues row for the season that is paid, or a waiver with status applied, stays exempt.

An elected Treasurer is never a lapse candidate.

### Lapse date

Renewals shows a **Lapse date** line. The confirmed default, when nobody has saved one, is August 1 of the season year (the year that starts in June). That date lives in `kos_default_lapse_date`. Officers who can open Renewals can use **Edit** to save a different date for the year.

**Mark lapsed** stays off until that date. The button then reads "Available on DATE". On or after the date it opens a preview with the count and the names. If elected officers are missing an applied elected-officer waiver, the preview shows that count and **Open Dues waivers**. Check "I have checked this list", then confirm. People who no longer qualify are skipped.

### Reactivation

Select lapsed members and choose **Send reactivation link**. You get one letter per level, with that level's Zeffy link. The letter says their membership lapsed for the season, asks them to pay that level on Zeffy, and says they are active again once the payment comes in. After the email queues, those recipients move to pending dues.

On the member side, a lapsed Renew card says "Your membership lapsed. Renew to reactivate." They pick a level and open Zeffy. A pending dues card says "Pending dues: your payment has not come in yet." and still shows the Zeffy buttons. Officers and board keep the note that they are not invoiced.

### Cash or check

Renewals, **Mark renewed**, records the paid dues row. If they were lapsed or pending dues, they become active. No email is sent.

## What ships together

The Hub calls `kos_lapse_candidates`, `kos_mark_lapsed`, `kos_start_reactivation`, `kos_get_lapse_date`, and `kos_set_lapse_date`. Those live in `sql/kos_v6_renewal_lapse.sql`. That file is not applied until Melissa approves it, and it should go out in the same release as this Hub. If the functions are missing, Renewals hides the lapse date, Mark lapsed, and Send reactivation link, and the rest of Renewals still works.

Treasurer stays in the Renewals access check, with the Membership Chair, the President, and site admins. Treasurer does not gain Membership Applications.
