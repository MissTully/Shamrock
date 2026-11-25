/**
 * Donation intent matching, Zeffy note extraction, and the thank-you email.
 * The webhook imports extractDonationNote. sql/kos_donations.sql follows the
 * same match rules: newest pending intent for the member with the same amount
 * inside 24 hours, or the only pending intent when the amount differs.
 * Amounts are integer cents. The Zeffy prefill parameter is lowercase amount.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SKEW_MS = 5 * 60 * 1000;
const GIFT_NOTE = /note with your gift/i;

const asObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;

const text = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
};

const questionLabel = (node) => {
  const question = node.question;
  const nested = asObject(question);
  return text(
    typeof question === "string" ? question : "",
    nested && nested.text,
    nested && nested.label,
    nested && nested.name,
    nested && nested.title,
    node.label,
    node.name,
    node.title,
  );
};

const questionAnswer = (node) => {
  const answer = node.answer ?? node.value ?? node.response;
  const nested = asObject(answer);
  return text(
    typeof answer === "string" || typeof answer === "number" ? answer : "",
    nested && nested.text,
    nested && nested.value,
    nested && nested.answer,
  );
};

/**
 * Note typed on the Zeffy form. Prefers the Give to the Krewe question
 * "Would you like to add a note with your gift?". Any other question whose
 * label contains the word note is the fallback. Email questions are skipped.
 */
export const extractDonationNote = (root) => {
  let gift = "";
  let other = "";
  const queue = [{ node: root, depth: 0 }];
  let seen = 0;
  while (queue.length && seen < 400) {
    const item = queue.shift();
    seen += 1;
    const node = item.node;
    if (!node || typeof node !== "object") continue;
    if (!Array.isArray(node)) {
      const label = questionLabel(node);
      const answer = questionAnswer(node);
      if (answer && !/email/i.test(label)) {
        if (GIFT_NOTE.test(label)) gift = gift || answer;
        else if (/\bnote\b/i.test(label)) other = other || answer;
      }
    }
    if (item.depth >= 8) continue;
    const children = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) {
      if (child && typeof child === "object") queue.push({ node: child, depth: item.depth + 1 });
    }
  }
  return gift || other || undefined;
};

/**
 * Pick the intent a recorded gift should close.
 * intents are already limited to that member (member id or email).
 * Same amount within 24 hours wins, newest first.
 * Otherwise the only pending intent is used when its amount differs.
 * A same-amount intent older than 24 hours is left pending when it is the
 * only one, so a stale gift note is not attached to a later payment.
 */
export const pickDonationIntent = (intents, payment, now = new Date()) => {
  const pending = (Array.isArray(intents) ? intents : []).filter((row) => {
    if (!row || row.payment_id) return false;
    return String(row.status || "pending").toLowerCase() === "pending";
  });
  const payAt = Date.parse(payment && payment.created_at) || now.getTime();
  const amount = Number(payment && payment.amount_cents);
  const same = pending.filter((row) => {
    if (Number(row.amount_cents) !== amount) return false;
    const created = Date.parse(row.created_at || "");
    if (!Number.isFinite(created)) return false;
    const delta = payAt - created;
    return delta >= -SKEW_MS && delta <= DAY_MS;
  });
  same.sort((a, b) => {
    const diff = Date.parse(b.created_at) - Date.parse(a.created_at);
    if (diff) return diff;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
  if (same.length) return same[0];
  if (pending.length === 1 && Number(pending[0].amount_cents) !== amount) return pending[0];
  return null;
};

export const formatDonationAmount = (cents) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  const dollars = n / 100;
  if (Number.isInteger(dollars)) return String(dollars);
  return dollars.toFixed(2);
};

export const formatDonationDollars = (cents) => {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "";
  return "$" + (n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatDonationDate = (value) => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

/** Whole dollars or cents. Minimum $1. */
export const parseGiftAmount = (input) => {
  const raw = String(input == null ? "" : input).trim().replace(/[$,\s]/g, "");
  if (!raw) return { ok: false, message: "Enter a gift amount to continue." };
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    return { ok: false, message: "Use dollars and cents, like 25 or 25.50." };
  }
  const dollars = Number(raw);
  if (!Number.isFinite(dollars) || dollars < 1) {
    return { ok: false, message: "The smallest gift is $1." };
  }
  if (dollars > 1000000) {
    return { ok: false, message: "For a gift this large, please write the Treasurer and we will help you." };
  }
  return { ok: true, amount_cents: Math.round(dollars * 100) };
};

export const donationAmountParam = (name) => {
  const raw = String(name || "").trim();
  return raw || "amount";
};

export const withDonationAmount = (url, amountCents, paramName) => {
  const base = String(url || "").trim();
  if (!base) return "";
  const next = new URL(base);
  const dollars = formatDonationAmount(amountCents);
  if (dollars) next.searchParams.set(donationAmountParam(paramName), dollars);
  return next.toString();
};

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/**
 * Krewe thank-you. Green header matches shop receipts.
 * The note is included only when we have one. Zeffy sends the tax receipt.
 */
export const buildDonationThanksEmail = ({ payerName, amountCents, paidAt, note } = {}) => {
  const first = String(payerName || "").trim().split(/\s+/)[0] || "";
  const hello = first ? `Hi ${escapeHtml(first)},` : "Hi,";
  const amount = formatDonationDollars(amountCents);
  const date = formatDonationDate(paidAt);
  const cleanNote = String(note || "").trim();
  const noteHtml = cleanNote
    ? `<p style="background:#eef6f0;padding:12px 14px;border-radius:8px">Your note: ${escapeHtml(cleanNote)}</p>`
    : "";
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1f2d24">'
    + '<div style="background:#0b5d33;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0">'
    + '<div style="font-size:20px;font-weight:700">Krewe of Shamrock</div>'
    + '<div style="font-size:14px;opacity:.9">With thanks</div></div>'
    + '<div style="border:1px solid #d9e6dc;border-top:0;padding:22px;border-radius:0 0 10px 10px">'
    + `<p>${hello}</p>`
    + `<p>Thank you for your gift of <b>${escapeHtml(amount)}</b> on ${escapeHtml(date)}. `
    + "Your kindness helps the Krewe show up for Tampa Bay kids and families. We are glad you are with us.</p>"
    + noteHtml
    + "<p>Zeffy emails the official tax receipt separately. Please look for that message from Zeffy when you need it for your records.</p>"
    + "<p>With gratitude,<br>Krewe of Shamrock</p></div></div>";
  return {
    subject: "Thank you for your gift to the Krewe of Shamrock",
    html,
  };
};
