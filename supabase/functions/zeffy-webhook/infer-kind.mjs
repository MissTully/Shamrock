/**
 * Pure Zeffy classification and ticket-holder parsing.
 * Imported by the webhook and by tests/zeffy-infer-kind.test.mjs.
 * Amounts follow the webhook rule: integer `amount` is cents.
 */

const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const asArray = (value) => (Array.isArray(value) ? value : []);

const text = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const numberValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === "object") {
    return numberValue(value.value ?? value.amount);
  }
  return undefined;
};

export const resolveAmountCents = (payment) => {
  const explicit = numberValue(
    payment.amountCents ?? payment.amount_cents ?? payment.amount_in_cents,
  );
  if (explicit !== undefined) return Math.round(explicit);

  const amount = numberValue(payment.amount);
  if (amount === undefined) return undefined;
  if (!Number.isInteger(amount)) return Math.round(amount * 100);
  return Math.round(amount);
};

const joinedLower = (values) =>
  values
    .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");

const emailish = (value) => {
  const s = text(value);
  if (!s || !s.includes("@")) return undefined;
  return s.toLowerCase();
};

const pushEmail = (out, value) => {
  const email = emailish(value);
  if (email && !out.includes(email)) out.push(email);
};

const collectEmails = (obj, out) => {
  if (!obj || typeof obj !== "object") return;
  pushEmail(out, obj.email);
  pushEmail(out, obj.emailAddress);
  pushEmail(out, obj.email_address);
  pushEmail(out, obj.payer_email);
  pushEmail(out, obj.payerEmail);
  for (const q of asArray(obj.questions ?? obj.buyer_questions ?? obj.answers)) {
    const qo = asObject(q);
    const label = text(qo.question, qo.label, qo.name, qo.title)?.toLowerCase() ?? "";
    const answer = text(qo.answer, qo.value, qo.response);
    if (answer && (label.includes("email") || answer.includes("@"))) pushEmail(out, answer);
  }
};

const personName = (obj) => {
  const source = asObject(obj);
  const direct = text(
    source.name,
    source.fullName,
    source.full_name,
    [source.first_name ?? source.firstName, source.last_name ?? source.lastName]
      .filter(Boolean)
      .join(" "),
  );
  if (direct) return direct;
  for (const q of asArray(source.questions ?? source.buyer_questions ?? source.answers)) {
    const qo = asObject(q);
    const label = text(qo.question, qo.label, qo.name, qo.title)?.toLowerCase() ?? "";
    const answer = text(qo.answer, qo.value, qo.response);
    if (answer && label.includes("name") && !/user.?name|email/.test(label)) return answer;
  }
  return undefined;
};

/** Last path slug of a Zeffy campaign URL, or a bare slug. */
export const campaignKey = (value) => {
  const raw = String(value || "").trim().toLowerCase().split(/[?#]/)[0];
  if (!raw) return "";
  const match = raw.match(/\/(?:ticketing|donation|membership|online-store|embed|form)\/([a-z0-9-]+)/);
  if (match) return match[1].replace(/\/+$/, "");
  if (/^[a-z0-9-]+$/.test(raw)) return raw;
  return "";
};

export const urlMatchesCatalog = (linkBlob, duesCatalogUrls) => {
  const keys = new Set();
  for (const part of String(linkBlob || "").split(/\s+/)) {
    const key = campaignKey(part);
    if (key) keys.add(key);
  }
  return (duesCatalogUrls || []).some((url) => {
    const key = campaignKey(url);
    return !!key && keys.has(key);
  });
};

/** Fold em dashes so a Zeffy title can match the stored campaign text. */
const foldDashes = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * background_check_payments is a map of individual/couple, or a list of
 * {url, description}. Matching uses the campaign URL slug and the description.
 */
export const backgroundCampaignEntries = (backgroundCampaigns) => {
  const root = Array.isArray(backgroundCampaigns)
    ? backgroundCampaigns
    : (backgroundCampaigns && typeof backgroundCampaigns === "object"
      ? Object.values(backgroundCampaigns)
      : []);
  const out = [];
  for (const item of root) {
    if (typeof item === "string") {
      out.push({ url: item, description: "" });
      continue;
    }
    const obj = asObject(item);
    out.push({
      url: text(obj.url, obj.zeffy_url, obj.link) || "",
      description: text(obj.description, obj.campaign, obj.title) || "",
    });
  }
  return out;
};

export const matchesBackgroundCampaign = (description, linkBlob, backgroundCampaigns) => {
  const desc = foldDashes(description);
  const links = foldDashes(linkBlob);
  const blob = `${desc} ${links}`.trim();
  if (!blob) return false;
  for (const entry of backgroundCampaignEntries(backgroundCampaigns)) {
    const key = campaignKey(entry.url);
    if (key && blob.includes(key)) return true;
    const stored = foldDashes(entry.description);
    if (stored.length >= 12 && desc.includes(stored)) return true;
  }
  return false;
};

const ticketNameOf = (item) =>
  text(
    item.name,
    item.title,
    item.ticket_name,
    item.ticketName,
    item.product_name,
    item.productName,
    item.rate_title,
    item.label,
  );

/**
 * Classify a Zeffy payment.
 * Order: explicit kind, locker, shop, background check, dues, then ticketing
 * as an event. Background check is before the membership category because
 * that $75 payment is also category membership. Dues is before ticketing
 * because every membership form is a Zeffy ticketing form.
 * Locker is returned as locker. Call ledgerProductKind before insert.
 *
 * duesCatalogUrls are the live kos_dues_catalog.zeffy_url values.
 * backgroundCampaigns is the background_check_payments flag (individual and
 * couple url + description). A match is product_kind background_check.
 * Any other "background check" title is also background_check, so the
 * membership category cannot file that fee as dues.
 */
export const inferKind = (metadata = {}, payment = {}, duesCatalogUrls = [], backgroundCampaigns = null) => {
  const meta = asObject(metadata);
  const pay = asObject(payment);
  const explicit = text(meta.kind, meta.product_kind, pay.product_kind)?.toLowerCase();
  if (explicit && ["store", "event", "dues", "donation", "raffle", "background_check", "locker", "other"].includes(explicit)) {
    return explicit;
  }

  const description = [
    pay.campaign,
    pay.campaignName,
    pay.campaign_name,
    pay.campaign_title,
    pay.campaignTitle,
    pay.form_name,
    pay.formName,
    pay.product,
    pay.productName,
    pay.product_name,
    pay.description,
    pay.title,
    pay.name,
    pay.rate_title,
    meta.campaign_title,
    meta.campaign_name,
    meta.title,
  ].filter(Boolean).join(" ").toLowerCase();

  const linkBlob = [
    pay.url,
    pay.campaign_url,
    pay.campaignUrl,
    pay.share_url,
    pay.public_url,
    pay.publicUrl,
    meta.url,
    meta.campaign_url,
  ].filter(Boolean).join(" ").toLowerCase();

  const items = asArray(pay.items).map(asObject);
  const ticketNames = items.map(ticketNameOf).filter(Boolean).join(" ").toLowerCase();
  const classifyBlob = `${description} ${ticketNames}`.trim();

  // A campaign name or URL that contains "locker" is a locker rental.
  // payments_product_kind_check does not list locker, so ledgerProductKind
  // stores other. The webhook still runs kos_claim_locker_from_payment.
  if (classifyBlob.includes("locker") || linkBlob.includes("locker")) {
    return "locker";
  }

  // Shared KOS Shop Online Store, plus legacy Shop Studio ticketing campaigns
  // whose slug ends in "-shop". Classify as store before the ticketing check
  // below files them as events. SQL in kos_shop_unified_checkout.sql is a backstop.
  const shopBlob = `${description} ${linkBlob} ${String(pay.campaign_slug ?? meta.campaign_slug ?? "")}`.toLowerCase();
  // Shared KOS Shop: match slug kos-shop or campaign name "KOS Shop" so a
  // /ticketing/ vs /online-store/ path cannot mis-file the payment as an event.
  if (/\bkos-shop\b/.test(shopBlob) || /\bkos shop\b/.test(shopBlob)) {
    return "store";
  }
  // Legacy per-item ticketing campaigns, e.g. /ticketing/krewe-of-shamrock-mug-shop.
  if (
    /\/ticketing\/[a-z0-9-]+-shop\b/.test(linkBlob) ||
    /-shop\b/.test(String(pay.campaign_slug ?? meta.campaign_slug ?? "").toLowerCase())
  ) {
    return "store";
  }

  const formType = joinedLower([
    pay.form_type,
    pay.formType,
    pay.campaign_type,
    pay.campaignType,
    meta.form_type,
    meta.campaign_type,
  ]);
  const category = joinedLower([
    pay.category,
    pay.campaign_category,
    pay.campaignCategory,
    meta.category,
    meta.campaign_category,
  ]);
  const kindBlob = `${formType} ${category}`;

  // Shop / store before ticketing. The KOS Shop URL lives under /ticketing/.
  if (/(shop|store|merch)/.test(kindBlob)) return "store";

  // The background check fee is a ticketing form with category membership.
  // Name and the two stored campaigns win over that category, or the fee
  // would be filed as dues. Dues text that does not mention a background
  // check still classifies as dues below.
  if (
    matchesBackgroundCampaign(classifyBlob, linkBlob, backgroundCampaigns) ||
    classifyBlob.includes("background check")
  ) {
    return "background_check";
  }

  // Membership dues. Category, ticket or description text, then the catalog URL.
  // Full, Associate, Auxiliary, LOA, and Leave of absence are the dues products.
  // "dues" on its own still counts, so "2026 dues" is dues without a category or URL.
  const duesText = /\bmembership\b/.test(classifyBlob)
    || /\bdues\b/.test(classifyBlob)
    || /\bleave of absence\b/.test(classifyBlob)
    || /\bloa\b/.test(classifyBlob);
  if (/(membership|dues)/.test(category) || /(membership|dues)/.test(formType) || duesText) {
    return "dues";
  }
  if (urlMatchesCatalog(`${linkBlob} ${description}`, duesCatalogUrls)) return "dues";

  if (/(ticket|ticketing|event)/.test(kindBlob)) return "event";
  if (/(donation|donate)/.test(kindBlob)) return "donation";
  if (/\braffle|drawing|lottery\b/.test(description)) return "raffle";
  if (/\bdonation|donor|gift\b/.test(description)) return "donation";
  if (/\bevent|ticket|ticketing|admission|gala|ball|parade|golf|lunch|book club\b/.test(description)) {
    return "event";
  }
  if (/\b(store|merch|merchandise|shirt|tee|hat|kilt|apparel)\b/.test(description)) return "store";
  if (items.some((it) => text(it.type)?.toLowerCase() === "ticket")) return "event";
  return "other";
};

/**
 * Kinds payments_product_kind_check allows today.
 * locker is classified above and stored as other until that check allows it.
 */
export const LEDGER_PRODUCT_KINDS = [
  "store",
  "event",
  "dues",
  "donation",
  "raffle",
  "background_check",
  "other",
];

export const ledgerProductKind = (kind) =>
  LEDGER_PRODUCT_KINDS.includes(kind) ? kind : "other";

const peopleOnItem = (item) => {
  const holders = [];
  const push = (person) => {
    const obj = asObject(person);
    if (Object.keys(obj).length) holders.push(obj);
  };
  // The person the ticket is for. Buyer and contact are the purchaser, and
  // they are a separate holder only when the ticket names nobody else.
  for (const key of ["attendee", "guest", "holder"]) push(item[key]);
  for (const guest of asArray(item.attendees ?? item.guests ?? item.ticket_holders ?? item.ticketHolders)) {
    push(guest);
  }
  if (holders.length) return holders;
  // No attendee. One purchaser stands for the ticket. Buyer wins over contact
  // so a ticket that lists both does not mark two members.
  const buyer = asObject(item.buyer);
  const contact = asObject(item.contact);
  if (Object.keys(buyer).length) holders.push(buyer);
  else if (Object.keys(contact).length) holders.push(contact);
  return holders;
};

const perTicketCents = (item, payment, qty) => {
  const line = resolveAmountCents(item);
  if (line === undefined) return undefined;
  if (qty <= 1) return line;
  const order = resolveAmountCents(payment);
  if (order !== undefined && Math.abs(order - line) <= 1) return Math.round(line / qty);
  if (order !== undefined && Math.abs(order - line * qty) <= qty) return line;
  return Math.round(line / qty);
};

/**
 * One entry per dues or event ticket: email, name, ticket name, and cents.
 * A couple order is two Full tickets, not one $750 payer.
 */
export const collectTicketHolders = (payment) => {
  const pay = asObject(payment);
  const items = asArray(pay.items).map(asObject).filter((item) => {
    const kind = text(item.type)?.toLowerCase();
    return !kind || kind === "ticket";
  });
  const loose = [];
  for (const guest of asArray(pay.guests ?? pay.attendees ?? pay.ticket_holders ?? pay.ticketHolders)) {
    const person = asObject(guest);
    if (Object.keys(person).length) loose.push(person);
  }

  const holders = [];
  const pushHolder = (person, item, cents, ticketName) => {
    const emails = [];
    collectEmails(person, emails);
    const name = personName(person);
    // A named attendee with no email must stay email-free. Copying the
    // purchaser email from the item makes SQL match the buyer and skip the name.
    if (!emails.length && !name) collectEmails(item, emails);
    holders.push({
      email: emails[0],
      name: name || personName(item),
      ticket_name: ticketName,
      amount_cents: cents,
    });
  };

  items.forEach((item, index) => {
    const nested = peopleOnItem(item);
    let people = nested;
    if (!people.length && items.length === 1 && loose.length) people = loose.slice();
    else if (!people.length && loose[index]) people = [loose[index]];
    const qty = Math.max(1, Math.round(numberValue(item.quantity) ?? 1));
    const slots = Math.max(qty, people.length, 1);
    const cents = perTicketCents(item, pay, qty);
    const ticketName = ticketNameOf(item);
    for (let i = 0; i < slots; i++) pushHolder(people[i] || {}, item, cents, ticketName);
  });

  if (!holders.length) {
    for (const person of loose) {
      const emails = [];
      collectEmails(person, emails);
      holders.push({
        email: emails[0],
        name: personName(person),
        ticket_name: text(person.ticket_name, person.ticketName, person.ticket),
        amount_cents: resolveAmountCents(person),
      });
    }
  }
  return holders;
};

/**
 * June-May dues season, labeled by the start year.
 * krewe_volunteer_season_year returns the ending year (June 2026 -> 2027).
 * Dues year is one less, so November 2026 and January 2027 both stay 2026.
 * Matches assets/kos-dues-season.js and public.kos_dues_season_year.
 */
export const duesSeasonYear = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const map = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return map.month >= 6 ? map.year : map.year - 1;
};

/** Explicit payload year wins. Otherwise the current dues season. */
export const membershipYearForPayment = (metadata = {}, payment = {}, now = new Date()) => {
  const meta = asObject(metadata);
  const pay = asObject(payment);
  const explicit = numberValue(
    meta.membership_year ?? meta.membershipYear ?? pay.membership_year,
  );
  if (explicit !== undefined) return Math.round(explicit);
  return duesSeasonYear(now);
};
