import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type JsonObject = Record<string, unknown>;

const json = (body: JsonObject, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (value && typeof value === "object") {
    return numberValue((value as JsonObject).value ?? (value as JsonObject).amount);
  }
  return undefined;
};

const emailish = (value: unknown): string | undefined => {
  const s = text(value);
  if (!s || !s.includes("@")) return undefined;
  return s.toLowerCase();
};

const pushEmail = (out: string[], value: unknown) => {
  const e = emailish(value);
  if (e && !out.includes(e)) out.push(e);
};

/** Collect emails from a contact-like object (buyer, donor, guest, question answers). */
const collectEmailsFromObject = (obj: JsonObject, out: string[]) => {
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

/**
 * Zeffy payment.completed payloads use `amount` in **cents** (integer), same as
 * item.amount. Prefer explicit *cents fields; otherwise treat `amount` as cents
 * (do NOT multiply by 100 — that produced the $80 → $8000 bug).
 * Only multiply when the value clearly looks like dollars (has a fractional part).
 */
const resolveAmountCents = (payment: JsonObject): number | undefined => {
  const explicit = numberValue(
    payment.amountCents ?? payment.amount_cents ?? payment.amount_in_cents,
  );
  if (explicit !== undefined) return Math.round(explicit);

  const amount = numberValue(payment.amount);
  if (amount === undefined) return undefined;
  if (!Number.isInteger(amount)) return Math.round(amount * 100);
  return Math.round(amount);
};

const itemBlob = (item: JsonObject): string =>
  [
    item.name,
    item.title,
    item.product,
    item.productName,
    item.product_name,
    item.rate_title,
    item.rateTitle,
    item.description,
    item.sku,
    item.type,
    item.kind,
    item.product_kind,
    text(asObject(item.metadata).kind, asObject(item.metadata).product_kind),
  ].filter(Boolean).join(" ").toLowerCase();

const itemQuantity = (item: JsonObject): number => {
  const qty = numberValue(item.quantity ?? item.qty ?? item.count ?? item.number);
  if (qty !== undefined && qty > 0) return Math.round(qty);
  return 1;
};

const isRaffleItem = (item: JsonObject): boolean => {
  const explicit = text(
    item.kind,
    item.product_kind,
    asObject(item.metadata).kind,
    asObject(item.metadata).product_kind,
  )?.toLowerCase();
  if (explicit === "raffle") return true;
  const blob = itemBlob(item);
  return /\braffle\b|\b50\s*\/\s*50\b|\bfifty[\s-]?fifty\b|\bdrawing\b|\blottery\b/.test(blob);
};

const isAdmissionItem = (item: JsonObject): boolean => {
  if (isRaffleItem(item)) return false;
  const blob = itemBlob(item);
  if (/\b(donation|donor|merch|merchandise|shirt|tee|hat|kilt|apparel)\b/.test(blob)) return false;
  const t = text(item.type)?.toLowerCase();
  if (!t || t === "ticket" || t === "tickets" || t === "admission" || t === "add-on" || t === "addon") {
    return /\b(ticket|admission|attendee|entry|golf|lunch|gala|ball)\b/.test(blob) || !t || t === "ticket";
  }
  return false;
};

/** Split Zeffy line items into admission vs raffle. Quantity on a raffle line is ticket count. */
const classifyItems = (payment: JsonObject): { admissionQty: number; raffleQty: number } => {
  const items = asArray(payment.items);
  let admissionQty = 0;
  let raffleQty = 0;
  for (const raw of items) {
    const item = asObject(raw);
    const qty = itemQuantity(item);
    if (isRaffleItem(item)) raffleQty += qty;
    else if (isAdmissionItem(item)) admissionQty += qty;
  }
  const meta = asObject(payment.metadata ?? payment.meta);
  const metaRaffle = numberValue(meta.raffle_qty ?? meta.raffleQty ?? payment.raffle_qty);
  if (metaRaffle !== undefined && metaRaffle > 0 && raffleQty === 0) raffleQty = Math.round(metaRaffle);
  return { admissionQty, raffleQty };
};

const inferKind = (
  metadata: JsonObject,
  payment: JsonObject,
  classified?: { admissionQty: number; raffleQty: number },
): string => {
  const explicit = text(metadata.kind, metadata.product_kind, payment.product_kind)?.toLowerCase();
  if (explicit && ["store", "event", "dues", "donation", "raffle", "other"].includes(explicit)) {
    // Mixed cart: admission + raffle add-on is still an event ticket purchase for RSVP.
    if (explicit === "raffle" && classified && classified.admissionQty > 0) return "event";
    return explicit;
  }
  const campaignType = text(
    payment.campaign_type,
    payment.campaignType,
    payment.campaign_category,
    payment.campaignCategory,
  )?.toLowerCase() ?? "";
  if (/(ticket|ticketing|event)/.test(campaignType)) return "event";
  if (/(donation|donate)/.test(campaignType)) return "donation";
  if (/(membership|dues)/.test(campaignType)) return "dues";
  if (/(shop|store|merch)/.test(campaignType)) return "store";

  const description = [
    payment.campaign,
    payment.campaignName,
    payment.campaign_name,
    payment.product,
    payment.productName,
    payment.product_name,
    payment.description,
    payment.title,
    payment.name,
    payment.rate_title,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(dues|membership)\b/.test(description)) return "dues";
  // Admission in the cart wins over raffle in the campaign name so RSVP still runs.
  if (classified && classified.admissionQty > 0) return "event";
  if (/\braffle|drawing|lottery\b/.test(description) || (classified && classified.raffleQty > 0 && classified.admissionQty === 0)) {
    return "raffle";
  }
  if (/\bdonation|donor|gift\b/.test(description)) return "donation";
  if (/\bevent|ticket|ticketing|admission|gala|ball|parade|golf|lunch|book club\b/.test(description)) {
    return "event";
  }
  if (/\b(store|merch|merchandise|shirt|tee|hat|kilt|apparel)\b/.test(description)) return "store";
  const items = asArray(payment.items);
  if (items.some((it) => text(asObject(it).type)?.toLowerCase() === "ticket")) return "event";
  return "other";
};

/** Prefer real contact objects; Zeffy often sets payment.contact to a UUID string. */
const pickContact = (payment: JsonObject): JsonObject => {
  const buyer = asObject(payment.buyer);
  if (Object.keys(buyer).length) return buyer;
  const customer = asObject(payment.customer);
  if (Object.keys(customer).length) return customer;
  const donor = asObject(payment.donor);
  if (Object.keys(donor).length) return donor;
  if (payment.contact && typeof payment.contact === "object") return asObject(payment.contact);
  return {};
};

const slugFromText = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const slug = value
    .toLowerCase()
    .replace(/^kos[\s\-_]+/i, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || undefined;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expectedToken = Deno.env.get("ZEFFY_WEBHOOK_TOKEN");
  if (!expectedToken) return json({ error: "Webhook token is not configured" }, 500);
  const url = new URL(req.url);
  const suppliedToken = url.searchParams.get("token") ?? req.headers.get("x-zeffy-token");
  if (!suppliedToken || suppliedToken !== expectedToken) return json({ error: "Unauthorized" }, 401);

  let envelope: JsonObject;
  try {
    envelope = asObject(await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (envelope.type !== "payment.completed") {
    return json({ error: "Expected payment.completed" }, 400);
  }

  const data = asObject(envelope.data);
  const payment = asObject(data.payment ?? envelope.payment ?? data ?? envelope);
  const metadata = asObject(payment.metadata ?? payment.meta);
  const contact = pickContact(payment);

  const emails: string[] = [];
  collectEmailsFromObject(contact, emails);
  pushEmail(emails, payment.email);
  pushEmail(emails, payment.payer_email);
  pushEmail(emails, payment.payerEmail);
  for (const item of asArray(payment.items)) {
    const it = asObject(item);
    collectEmailsFromObject(it, emails);
    collectEmailsFromObject(asObject(it.contact), emails);
    collectEmailsFromObject(asObject(it.buyer), emails);
    collectEmailsFromObject(asObject(it.guest), emails);
    collectEmailsFromObject(asObject(it.attendee), emails);
  }
  for (const guest of asArray(payment.guests ?? payment.attendees ?? payment.ticket_holders)) {
    collectEmailsFromObject(asObject(guest), emails);
  }

  const payerEmail = emails[0];
  const payerName = text(
    contact.name,
    contact.fullName,
    [contact.first_name ?? contact.firstName, contact.last_name ?? contact.lastName]
      .filter(Boolean)
      .join(" "),
    payment.name,
    payment.payer_name,
    payment.payerName,
  );

  const amountCents = resolveAmountCents(payment);
  const paymentId = text(
    payment.id,
    payment.paymentId,
    payment.payment_id,
    payment.transactionId,
    payment.transaction_id,
  );
  if (!paymentId || amountCents === undefined || amountCents < 0) {
    return json({ error: "Payment id and amount are required" }, 400);
  }

  const zeffyApiKey = Deno.env.get("ZEFFY_API_KEY");
  if (zeffyApiKey) {
    const verifyResponse = await fetch(
      `https://api.zeffy.com/api/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { accept: "application/json", authorization: `Bearer ${zeffyApiKey}` } },
    );
    if (!verifyResponse.ok) return json({ error: "Unable to verify payment with Zeffy" }, 502);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase service configuration is missing" }, 500);
  }

  const providerEventId = text(
    envelope.id,
    envelope.eventId,
    envelope.event_id,
    payment.eventId,
    payment.event_id,
    paymentId,
  ) ?? paymentId;

  const description = text(
    payment.description,
    payment.campaignName,
    payment.campaign_name,
    payment.productName,
  );
  const campaignSlug = slugFromText(
    text(payment.campaign_slug, metadata.campaign_slug, description),
  );
  const classified = classifyItems(payment);
  let raffleQty = classified.raffleQty;
  let admissionQty = classified.admissionQty;
  const kind = inferKind(metadata, payment, classified);
  if (kind === "raffle" && raffleQty === 0) {
    raffleQty = Math.max(1, Math.round(numberValue(payment.quantity) ?? 1));
  }

  const ticketItems = asArray(payment.items).filter((it) => {
    const item = asObject(it);
    if (isRaffleItem(item)) return false;
    const t = text(item.type)?.toLowerCase();
    return !t || t === "ticket";
  });
  const ticketCount = admissionQty > 0
    ? admissionQty
    : (ticketItems.length > 0
      ? ticketItems.reduce((sum, it) => sum + itemQuantity(asObject(it)), 0)
      : (kind === "raffle" ? 0 : Math.max(1, Math.round(numberValue(payment.quantity) ?? 1))));

  const membershipYear = numberValue(
    metadata.membership_year ?? metadata.membershipYear ?? payment.membership_year,
  );

  const payload: JsonObject = {
    provider: "zeffy",
    provider_event_id: providerEventId,
    provider_payment_id: paymentId,
    amount_cents: amountCents,
    currency: text(payment.currency, payment.currencyCode) ?? "usd",
    status: text(payment.status) ?? "succeeded",
    payer_email: payerEmail,
    payer_name: payerName,
    payer_emails: emails,
    attendee_emails: emails,
    ticket_count: ticketCount,
    admission_qty: admissionQty,
    raffle_qty: raffleQty,
    campaign_slug: campaignSlug,
    campaign_id: text(payment.campaign_id, payment.campaignId),
    description,
    product_kind: kind,
    ...(membershipYear !== undefined ? { membership_year: Math.round(membershipYear) } : {}),
    raw: envelope,
  };

  const recordResponse = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/kos_record_payment`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ p: payload }),
    },
  );
  if (!recordResponse.ok) {
    const detail = await recordResponse.text().catch(() => "");
    console.error("kos_record_payment failed", recordResponse.status, detail);
    return json({ error: "Unable to record payment" }, 502);
  }
  const recorded = await recordResponse.json().catch(() => ({}));
  return json({ received: true, recorded });
});
