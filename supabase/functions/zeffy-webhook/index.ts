import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { collectTicketHolders, inferKind, ledgerProductKind, membershipYearForPayment } from "./infer-kind.mjs";
import { webhookAccess } from "./webhook-auth.mjs";

type JsonObject = Record<string, unknown>;

// Shop / store before ticketing. Classification lives in infer-kind.mjs.
// Seeded 2026 catalog URLs, used only when kos_dues_catalog cannot be read.
// Live zeffy_url values win when the read succeeds.
const SEEDED_DUES_CATALOG_URLS = [
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership",
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-associate-membership",
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2",
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-auxiliary-membership",
];

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
 * (do NOT multiply by 100. That produced the $80 to $8000 bug).
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

const loadDuesCatalogUrls = async (
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<string[]> => {
  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/kos_dues_catalog?select=zeffy_url&active=eq.true`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      console.error("kos_dues_catalog read failed", response.status);
      return [];
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) return [];
    const urls: string[] = [];
    for (const row of rows) {
      const url = text(asObject(row).zeffy_url);
      if (url && !urls.includes(url)) urls.push(url);
    }
    return urls;
  } catch (err) {
    console.error("kos_dues_catalog read error", err);
    return [];
  }
};

/** individual/couple campaigns from kos_runtime_flags.background_check_payments. */
const loadBackgroundCampaigns = async (
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<JsonObject> => {
  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/kos_runtime_flags?select=value&key=eq.background_check_payments`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          accept: "application/json",
        },
      },
    );
    if (!response.ok) {
      console.error("background_check_payments read failed", response.status);
      return {};
    }
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return {};
    return asObject(asObject(rows[0]).value);
  } catch (err) {
    console.error("background_check_payments read error", err);
    return {};
  }
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


const extractGuestToken = (...values: unknown[]): string | undefined => {
  const blob = values.map((value) => {
    if (typeof value === "string") return value;
    if (value == null) return "";
    try { return JSON.stringify(value); } catch { return String(value); }
  }).join(" ");
  const tagged = blob.match(/kos_guest[=_]([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/i);
  if (tagged) return tagged[1];
  return undefined;
};

const eventNameOf = (envelope: JsonObject): string =>
  (text(envelope.type, envelope.event, envelope.name) ?? "").toLowerCase();

/** Payment fields live on data. data.object is often the string "payment". */
const resolvePayment = (envelope: JsonObject): JsonObject => {
  const data = asObject(envelope.data);
  const candidates = [data.payment, data.object, envelope.payment];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const obj = candidate as JsonObject;
      if (text(obj.id, obj.payment_id, obj.paymentId, obj.transaction_id) || obj.amount != null || obj.items) {
        return obj;
      }
    }
  }
  if (text(data.id, data.payment_id, data.paymentId) || data.amount != null || data.items) return data;
  return {};
};

const RECORDABLE_EVENTS = new Set([
  "payment.completed",
  "payment.created",
  "payment.updated",
  "payment.succeeded",
  "order.completed",
  "checkout.completed",
]);

const paidStatus = (payment: JsonObject): boolean => {
  const status = (text(payment.status) ?? "").toLowerCase();
  if (!status) return true;
  return ["succeeded", "paid", "completed", "succeded", "complete"].includes(status);
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

type ReceiptLog = {
  event_type: string | null;
  provider_event_id: string | null;
  http_status: number;
  error: string | null;
  payload: JsonObject | null;
};

const insertReceipt = async (receipt: ReceiptLog) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/zeffy_webhook_receipts`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=minimal",
        },
        body: JSON.stringify({
          event_type: receipt.event_type,
          provider_event_id: receipt.provider_event_id,
          http_status: receipt.http_status,
          error: receipt.error,
          payload: receipt.payload,
        }),
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("zeffy_webhook_receipts insert failed", response.status, detail);
    }
  } catch (err) {
    console.error("zeffy_webhook_receipts insert error", err);
  }
};

Deno.serve(async (req: Request) => {
  const receipt: ReceiptLog = {
    event_type: null,
    provider_event_id: null,
    http_status: 500,
    error: null,
    payload: null,
  };
  const respond = (body: JsonObject, status = 200, error?: string) => {
    receipt.http_status = status;
    if (error !== undefined) receipt.error = error;
    else if (status >= 400) receipt.error = typeof body.error === "string" ? body.error : null;
    else receipt.error = null;
    return json(body, status);
  };
  let response: Response;
  try {
    response = await (async () => {
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const access = webhookAccess(
    Deno.env.get("ZEFFY_WEBHOOK_TOKEN"),
    req.headers.get("x-zeffy-token"),
    url.searchParams.get("token"),
  );
  if (access.status !== 200) {
    return respond({ error: access.error ?? "Unauthorized" }, access.status, access.error ?? "Unauthorized");
  }

  let envelope: JsonObject;
  try {
    envelope = asObject(await req.json());
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }
  receipt.payload = envelope;
  const eventName = eventNameOf(envelope);
  receipt.event_type = eventName || null;
  receipt.provider_event_id = text(envelope.id, envelope.eventId, envelope.event_id) ?? null;
  if (eventName.startsWith("contact.") || eventName === "payment.deleted") {
    console.log("zeffy webhook ignored", eventName);
    return respond({ received: true, ignored: eventName });
  }
  if (!RECORDABLE_EVENTS.has(eventName)) {
    console.log("zeffy webhook unexpected event", eventName || "(none)");
    return respond({ error: "Unexpected event", event: eventName || null }, 400);
  }

  let payment = resolvePayment(envelope);
  let loadedFromApi = false;
  const earlyId = text(
    payment.id,
    payment.paymentId,
    payment.payment_id,
    payment.transactionId,
    payment.transaction_id,
    asObject(envelope.data).id,
  );
  if (earlyId) receipt.provider_event_id = earlyId;
  if (earlyId && resolveAmountCents(payment) === undefined) {
    const zeffyApiKey = Deno.env.get("ZEFFY_API_KEY");
    if (!zeffyApiKey) {
      console.log("zeffy webhook id-only payload", eventName);
      return respond({ error: "Payment amount is required" }, 400);
    }
    const loadedResponse = await fetch(
      `https://api.zeffy.com/api/v1/payments/${encodeURIComponent(earlyId)}`,
      { headers: { accept: "application/json", authorization: `Bearer ${zeffyApiKey}` } },
    );
    if (!loadedResponse.ok) return respond({ error: "Unable to load payment from Zeffy" }, 502);
    const loadedBody = asObject(await loadedResponse.json());
    const loaded = resolvePayment({ data: asObject(loadedBody.data ?? loadedBody) });
    if (loaded.amount != null || text(loaded.id, loaded.payment_id)) {
      payment = loaded;
      loadedFromApi = true;
    }
  }
  if (!paidStatus(payment) && (eventName === "payment.created" || eventName === "payment.updated")) {
    console.log("zeffy webhook ignored unpaid", eventName);
    return respond({ received: true, ignored: "not_paid", event: eventName });
  }
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
    return respond({ error: "Payment id and amount are required" }, 400);
  }

  const zeffyApiKey = Deno.env.get("ZEFFY_API_KEY");
  if (zeffyApiKey && !loadedFromApi) {
    const verifyResponse = await fetch(
      `https://api.zeffy.com/api/v1/payments/${encodeURIComponent(paymentId)}`,
      { headers: { accept: "application/json", authorization: `Bearer ${zeffyApiKey}` } },
    );
    if (!verifyResponse.ok) return respond({ error: "Unable to verify payment with Zeffy" }, 502);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respond({ error: "Supabase service configuration is missing" }, 500);
  }

  const providerEventId = text(
    envelope.id,
    envelope.eventId,
    envelope.event_id,
    payment.eventId,
    payment.event_id,
    paymentId,
  ) ?? paymentId;
  receipt.provider_event_id = providerEventId;

  const description = text(
    payment.description,
    payment.campaignName,
    payment.campaign_name,
    payment.campaign_title,
    payment.campaignTitle,
    payment.productName,
  );
  const campaignSlug = slugFromText(
    text(payment.campaign_slug, metadata.campaign_slug, description),
  );
  const ticketItems = asArray(payment.items).filter((it) => {
    const t = text(asObject(it).type)?.toLowerCase();
    return !t || t === "ticket";
  });
  const ticketCount = ticketItems.length > 0
    ? ticketItems.length
    : Math.max(1, Math.round(numberValue(payment.quantity) ?? 1));

  const membershipYear = membershipYearForPayment(metadata, payment, new Date());
  const catalogUrls = await loadDuesCatalogUrls(supabaseUrl, serviceRoleKey);
  const duesUrls = catalogUrls.length ? catalogUrls : SEEDED_DUES_CATALOG_URLS;
  const backgroundCampaigns = await loadBackgroundCampaigns(supabaseUrl, serviceRoleKey);
  const ticketHolders = collectTicketHolders(payment);
  const logicalKind = inferKind(metadata, payment, duesUrls, backgroundCampaigns);
  const productKind = ledgerProductKind(logicalKind);

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
    campaign_slug: campaignSlug,
    campaign_id: text(payment.campaign_id, payment.campaignId),
    campaign_name: text(
      payment.campaignName,
      payment.campaign_name,
      payment.campaign_title,
      payment.campaignTitle,
      payment.campaign,
      payment.title,
    ),
    campaign_url: text(
      payment.url,
      payment.campaign_url,
      payment.campaignUrl,
      payment.share_url,
      payment.public_url,
      metadata.url,
      metadata.campaign_url,
    ),
    description,
    product_kind: productKind,
    ticket_holders: ticketHolders,
    membership_year: membershipYear,
    // An id-only webhook has no items or phone. Keep the API payment on data
    // so shop receipts and chair emails can read the same shape as a normal event.
    raw: loadedFromApi
      ? { ...envelope, type: text(envelope.type, envelope.event) ?? eventName, data: payment }
      : envelope,
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
    return respond({ error: "Unable to record payment" }, 502);
  }
  const recorded = await recordResponse.json().catch(() => ({}));
  const recordedObj = asObject(recorded);
  const recordedInner = asObject(recordedObj.recorded ?? recordedObj);
  const paymentRowId = text(
    recordedObj.id,
    recordedObj.payment_id,
    recordedInner.id,
    recordedInner.payment_id,
  );
  let backgroundCheck: JsonObject | null = null;
  if (payload.product_kind === "background_check") {
    try {
      const applyResponse = await fetch(
        `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/kos_apply_background_check_payment`,
        {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            p: {
              payment_id: paymentRowId,
              provider: payload.provider,
              provider_payment_id: paymentId,
              provider_event_id: providerEventId,
              amount_cents: amountCents,
              payer_email: payerEmail,
              payer_name: payerName,
              description,
              campaign_url: payload.campaign_url,
              notify: true,
            },
          }),
        },
      );
      if (applyResponse.ok) {
        backgroundCheck = asObject(await applyResponse.json().catch(() => ({})));
      } else {
        const detail = await applyResponse.text().catch(() => "");
        console.error("kos_apply_background_check_payment failed", applyResponse.status, detail);
        if (applyResponse.status !== 404) {
          return respond({ error: "Unable to link background check payment" }, 502);
        }
      }
    } catch (err) {
      console.error("kos_apply_background_check_payment error", err);
      return respond({ error: "Unable to link background check payment" }, 502);
    }
  }
  const guestToken = extractGuestToken(
    metadata.kos_guest,
    metadata.token,
    payment.kos_guest,
    payload.campaign_url,
    payload.description,
    envelope,
  );
  let guestMatch: JsonObject | null = null;
  try {
    const matchResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/kos_apply_parade_guest_payment`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p: {
            payment_id: paymentRowId,
            amount_cents: amountCents,
            payer_email: payerEmail,
            payer_emails: emails,
            kos_guest: guestToken,
            campaign_url: payload.campaign_url,
            description,
            metadata,
            raw: envelope,
          },
        }),
      },
    );
    if (matchResponse.ok) {
      guestMatch = asObject(await matchResponse.json().catch(() => ({})));
    } else {
      const detail = await matchResponse.text().catch(() => "");
      console.error("kos_apply_parade_guest_payment failed", matchResponse.status, detail);
    }
  } catch (err) {
    console.error("kos_apply_parade_guest_payment error", err);
  }
  let lockerClaim: JsonObject | null = null;
  if (logicalKind === "locker") {
    if (!paymentRowId) {
      console.error("locker claim skipped, payment id missing");
    } else {
      try {
        const claimResponse = await fetch(
          `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/kos_claim_locker_from_payment`,
          {
            method: "POST",
            headers: {
              apikey: serviceRoleKey,
              authorization: `Bearer ${serviceRoleKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ p_payment_id: paymentRowId, p: payload }),
          },
        );
        if (claimResponse.ok) {
          lockerClaim = asObject(await claimResponse.json().catch(() => ({})));
        } else {
          const detail = await claimResponse.text().catch(() => "");
          console.error("kos_claim_locker_from_payment failed", claimResponse.status, detail);
          if (claimResponse.status !== 404) {
            return respond({ error: "Unable to claim locker" }, 502);
          }
        }
      } catch (err) {
        console.error("kos_claim_locker_from_payment error", err);
        return respond({ error: "Unable to claim locker" }, 502);
      }
    }
  }
  return respond({
    received: true,
    recorded,
    guest_match: guestMatch,
    background_check: backgroundCheck,
    locker: lockerClaim,
  });
    })();
  } catch (err) {
    console.error("zeffy webhook failed", err);
    response = respond({ error: "Unable to record payment" }, 500, "Unhandled error");
  }
  await insertReceipt(receipt);
  return response;
});
