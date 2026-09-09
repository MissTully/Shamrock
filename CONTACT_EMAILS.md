# Contact emails — the single source of truth

This file is the authoritative reference for which email address goes where,
on the website and in every document in this repository. If a page, document,
or automation needs a contact address, pick it from this table. If the routing
ever changes, update **this file first**, then sweep the site to match.

## Official routing (confirmed by the board, September 2026)

| Address | Purpose | Use it for |
|---|---|---|
| **secretary@kreweofshamrock.com** | All general information | Public "Contact" links, page footers, the home page's structured-data `email` field, "Questions:" lines on governing documents (bylaws, parade rules, code of conduct), store and volunteer inquiries |
| **treasurer@kreweofshamrock.com** | Member financial matters | Dues, payments, reimbursements, anything money-related for members |
| **patrick@kreweofshamrock.com** | Marketing and business | Marketing-related email and Patrick Pustay's business side of the Krewe |
| **digital@kreweofshamrock.com** | Technical website issues only | "Report a website problem," Member Hub sign-in trouble, photo/image release revocations, auth-admin notifications |

## Retired addresses — do not reintroduce

- **`kreweofshamrocktampa@gmail.com`** — the old shared Gmail mailbox. It was
  removed from every public page in September 2026 (pull request #50). Do not
  add it to any page, document, template, or automation. Where an old document
  in this repository mentions it, that mention is historical only.

## Rules for future work

1. **New public pages** get the standard footer, which uses
   `secretary@kreweofshamrock.com` as the contact.
2. **Anything that says "report a website problem," "stuck signing in," or
   similar technical wording** points to `digital@kreweofshamrock.com`.
3. **Never route the public to a personal mailbox.** Personal addresses
   (including the administrator account) are for system configuration only,
   never for `mailto:` links on the site.
4. **Domain spelling:** the Krewe's domain is `kreweofshamrock.com` — note the
   two e's in "krewe" and the `.com` ending. Watch for the common typos
   `krewofshamrock` (missing "e") and `.org`.
5. **Checking your work:** before shipping a page, search the repository for
   `kreweofshamrocktampa` — the search should come back empty for all HTML
   files.
