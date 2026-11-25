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
8. **Approve membership (subject to Board ratification)**. Approval is subject to final ratification by the Board of Directors. That is the only approval that sends the welcome letter, with the Member Hub login steps and the training video.

Decline and Withdraw keep the record. Nothing is deleted.

Treasurer, Vice President, and other officers who are not the Membership Chair, President, Secretary, or Chair of Technology do not see Membership Applications. That access is unchanged.

## Returning member

Membership Applications has no Renewals tab and no Approve renewal button. A person waiting on dues does not show in that tool.

The cycle is:

1. **Active.** They are on the roster.
2. **Delinquent.** Dues are due June 1. On July 1, Renewals can mark someone delinquent when they are still active, not exempt, and have no paid or applied-waiver dues row for the season. The status value stays `lapsed`. The Hub label is Delinquent. People who joined on or after June 1 of this season are skipped. No email is sent by Mark delinquent.
3. **Pending dues.** The status value is `pending-renewal`. The Hub label is Pending dues. This is a delinquent member who was sent a reactivation link, or who picked a level on their own Renew card. An unpaid dues row is on file. Their payment has not come in yet.
4. **Active again.** A Zeffy dues payment does this. Cash or check does it when you use Renewals, **Record cash or check**. No renewal email is sent for the cash or check entry.

Do not put a returning member in `dues-pending`. That status is the new-applicant induction step.

### Who is never lapsed

`kos_is_dues_exempt` is the only exempt rule. The renewal list, the lapse list, and Mark lapsed all use it.

- Only an elected title is exempt: President, Vice President, Secretary, or Treasurer. `Treasurer · Committee Chair of Finance` counts. Board members, captains, and committee chairs owe dues.
- A dues row for the season that is paid, or a waiver with status applied, stays exempt.

An elected Treasurer is never a lapse candidate.

### Delinquent and inactive dates

Dues are due June 1. Unpaid on July 1 is delinquent. After July 16 the member can be marked inactive and must reapply.

Renewals shows **Delinquent on** and **Inactive after**. The defaults, when nobody has saved a year, are July 1 (`kos_default_delinquent_on`) and July 16 (`kos_default_inactive_on`). Officers who can open Renewals can use **Edit** to save a different date for that year.

**Mark delinquent** stays off until July 1. **Mark inactive** stays off until July 16. Each button then reads "Available on DATE". On or after the date it opens a preview with the count and the names. If elected officers are missing an applied elected-officer waiver, the delinquent preview shows that count and **Open Dues waivers**. Check "I have checked this list", then confirm. People who no longer qualify are skipped. Mark inactive does not send email. Those members must submit a new application.

### Reactivation

Select lapsed members and choose **Send reactivation link**. You get one letter per level, with that level's Zeffy link. The letter says their membership lapsed for the season, asks them to pay that level on Zeffy, and says they are active again once the payment comes in. After the email queues, those recipients move to pending dues.

On the member side, a delinquent Renew card says dues are past due and names the inactive date. They pick a level and open Zeffy until that date. A pending dues card says "Pending dues: your payment has not come in yet." and still shows the Zeffy buttons. Elected officers (President, Vice President, Secretary, Treasurer) are exempt from dues under the bylaws. Board, captains, and committee chairs are not.

### Cash or check

Renewals, **Record cash or check**, records the paid dues row. If they were delinquent or pending dues, they become active. No email is sent.

## What ships together

The Hub calls the v6 renewal functions in `sql/kos_v6_renewal_lapse.sql`. That file is already applied on main. Dues are due June 1, delinquent is July 1, and inactive is after July 16. If those functions are missing, Renewals hides the date controls, Mark delinquent, Mark inactive, and Send reactivation link, and the rest of Renewals still works.

Treasurer stays in the Renewals access check, with the Membership Chair, the President, and site admins. Treasurer does not gain Membership Applications.
