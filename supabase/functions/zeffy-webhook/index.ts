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

const inferKind = (metadata: JsonObject, payment: JsonObject): string => {
  const explicit = text(metadata.kind, metadata.product_kind, payment.product_kind)?.toLowerCase();
  if (explicit && ["store", "event", "dues", "donation", "raffle", "other"].includes(explicit)) {
    return explicit;
  }
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
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(dues|membership|member)\b/.test(description)) return "dues";
  if (/\braffle|drawing|lottery\b/.test(description)) return "raffle";
  if (/\bdonation|donor|gift\b/.test(description)) return "donation";
  if (/\bevent|ticket|admission|gala|ball|parade\b/.test(description)) return "event";
  if (/\b(store|merch|merchandise|shirt|tee|hat|kilt|apparel)\b/.test(description)) return "store";
  return "other";
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
  const contact = asObject(payment.contact ?? payment.buyer ?? payment.customer ?? payment.donor);
  const payerEmail = text(
    contact.email,
    contact.emailAddress,
    payment.email,
    payment.payer_email,
    payment.payerEmail,
  );
  const payerName = text(
    contact.name,
    contact.fullName,
    payment.name,
    payment.payer_name,
    payment.payerName,
    [contact.firstName, contact.lastName].filter(Boolean).join(" "),
  );
  const amountCentsValue = numberValue(
    payment.amountCents ?? payment.amount_cents ?? payment.amount_in_cents,
  );
  const amountValue = numberValue(payment.amount);
  const amountCents = amountCentsValue !== undefined
    ? Math.round(amountCentsValue)
    : amountValue !== undefined ? Math.round(amountValue * 100) : undefined;
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
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase service configuration is missing" }, 500);

  const providerEventId = text(
    envelope.id,
    envelope.eventId,
    envelope.event_id,
    payment.eventId,
    payment.event_id,
    paymentId,
  ) ?? paymentId;
  const membershipYear = numberValue(metadata.membership_year ?? metadata.membershipYear ?? payment.membership_year);
  const payload: JsonObject = {
    provider: "zeffy",
    provider_event_id: providerEventId,
    provider_payment_id: paymentId,
    amount_cents: amountCents,
    currency: text(payment.currency, payment.currencyCode) ?? "usd",
    status: text(payment.status) ?? "succeeded",
    payer_email: payerEmail,
    payer_name: payerName,
    description: text(payment.description, payment.campaignName, payment.campaign_name, payment.productName),
    product_kind: inferKind(metadata, payment),
    ...(membershipYear !== undefined ? { membership_year: Math.round(membershipYear) } : {}),
    raw: envelope,
  };

  const recordResponse = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/kos_record_payment`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ p: payload }),
  });
  if (!recordResponse.ok) return json({ error: "Unable to record payment" }, 502);
  return json({ received: true });
});
