import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDonationThanksEmail,
  extractDonationNote,
  formatDonationAmount,
  parseGiftAmount,
  pickDonationIntent,
  withDonationAmount,
} from "../supabase/functions/zeffy-webhook/donation-match.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "sql/kos_donations.sql"), "utf8");
const webhook = readFileSync(join(root, "supabase/functions/zeffy-webhook/index.ts"), "utf8");

const PAY_AT = "2026-11-24T18:00:00.000Z";

function intent(id, cents, createdAt, extra = {}) {
  return {
    id,
    amount_cents: cents,
    created_at: createdAt,
    status: "pending",
    note: extra.note || "",
    payment_id: extra.payment_id || null,
  };
}

test("pickDonationIntent uses the newest same-amount intent inside 24 hours", () => {
  const older = intent("a", 2500, "2026-11-24T10:00:00.000Z", { note: "older" });
  const newer = intent("b", 2500, "2026-11-24T16:00:00.000Z", { note: "newer" });
  const other = intent("c", 1000, "2026-11-24T17:00:00.000Z");
  const picked = pickDonationIntent([older, other, newer], {
    amount_cents: 2500,
    created_at: PAY_AT,
  });
  assert.equal(picked.id, "b");
  assert.equal(picked.note, "newer");
});

test("a same-amount intent older than 24 hours stays pending", () => {
  const stale = intent("old", 2500, "2026-11-23T17:00:00.000Z");
  assert.equal(pickDonationIntent([stale], {
    amount_cents: 2500,
    created_at: PAY_AT,
  }), null);
});

test("the only pending intent is used when the amount differs", () => {
  const only = intent("one", 2500, "2026-11-20T12:00:00.000Z", { note: "For the kids" });
  const picked = pickDonationIntent([only], {
    amount_cents: 3000,
    created_at: PAY_AT,
  });
  assert.equal(picked.id, "one");

  const another = intent("two", 5000, "2026-11-24T12:00:00.000Z");
  assert.equal(pickDonationIntent([only, another], {
    amount_cents: 3000,
    created_at: PAY_AT,
  }), null);
});

test("paid or already matched intents are not chosen again", () => {
  const closed = intent("done", 2500, "2026-11-24T17:00:00.000Z", { payment_id: "pay-1" });
  closed.status = "paid";
  assert.equal(pickDonationIntent([closed], {
    amount_cents: 2500,
    created_at: PAY_AT,
  }), null);
});

test("extractDonationNote reads the Give to the Krewe question", () => {
  const payload = {
    data: {
      questions: [
        { label: "Email", answer: "alex@example.com" },
        { question: "Would you like to add a note with your gift?", answer: "For the toy drive" },
        { name: "note", value: "A different note" },
      ],
    },
  };
  assert.equal(extractDonationNote(payload), "For the toy drive");
  assert.equal(extractDonationNote({
    buyer_questions: [{ label: "A note for the Krewe", value: "In honor of Pat Example" }],
  }), "In honor of Pat Example");
  assert.equal(extractDonationNote({ questions: [{ label: "Email", answer: "pat@example.com" }] }), undefined);
});

test("gift amounts and the Zeffy amount parameter", () => {
  assert.deepEqual(parseGiftAmount("25"), { ok: true, amount_cents: 2500 });
  assert.deepEqual(parseGiftAmount("$10.50"), { ok: true, amount_cents: 1050 });
  assert.equal(parseGiftAmount("0.50").ok, false);
  assert.equal(parseGiftAmount("10.555").ok, false);
  assert.equal(formatDonationAmount(2500), "25");
  assert.equal(formatDonationAmount(2550), "25.50");
  assert.equal(
    withDonationAmount(
      "https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock",
      2500,
      "amount",
    ),
    "https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock?amount=25",
  );
  const custom = new URL(withDonationAmount(
    "https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock?ref=hub",
    1050,
    "",
  ));
  assert.equal(custom.searchParams.get("amount"), "10.50");
  assert.equal(custom.searchParams.get("ref"), "hub");
});

test("thank-you email is warm, idempotent in copy, and has no em dash", () => {
  const mail = buildDonationThanksEmail({
    payerName: "Alex Example",
    amountCents: 2500,
    paidAt: "2026-11-24T18:00:00.000Z",
    note: "For the kids",
  });
  assert.equal(mail.subject, "Thank you for your gift to the Krewe of Shamrock");
  assert.match(mail.html, /background:#0b5d33/);
  assert.match(mail.html, /Krewe of Shamrock/);
  assert.match(mail.html, /\$25\.00/);
  assert.match(mail.html, /November 24, 2026/);
  assert.match(mail.html, /Your note: For the kids/);
  assert.match(mail.html, /Zeffy emails the official tax receipt separately/);
  assert.equal(mail.html.includes("\u2014"), false);
  assert.equal(mail.html.includes("\u2013"), false);

  const plain = buildDonationThanksEmail({
    payerName: "Guest",
    amountCents: 1000,
    paidAt: "2026-11-24T18:00:00.000Z",
  });
  assert.doesNotMatch(plain.html, /Your note:/);
  assert.match(plain.html, /Hi Guest,/);
});

test("donation SQL matches the Hub intent and queues one thank-you", () => {
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /donation_intents/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /kos_create_donation_intent/);
  assert.match(sql, /kos_list_my_donation_intents/);
  assert.match(sql, /kos_list_donations/);
  assert.match(sql, /kos_can_view_donations/);
  assert.match(sql, /kos_is_charity_chair/);
  assert.match(sql, /can_view_payments/);
  assert.match(sql, /interval '24 hours'/);
  assert.match(sql, /status = 'paid'/);
  assert.match(sql, /coalesce\(p\.amount_cents, i\.amount_cents\)/);
  assert.match(sql, /when pay\.amount_cents between 100 and 100000000 then pay\.amount_cents/);
  assert.match(sql, /donation_thanks:/);
  assert.match(sql, /note with your gift/);
  assert.match(sql, /amount_param', 'amount'/);
  assert.match(sql, /give-to-the-krewe-of-shamrock/);
  assert.match(sql, /Zeffy emails the official tax receipt separately/);
  assert.match(sql, /background:#0b5d33/);
  assert.match(sql, /security_invoker = true/);
  assert.doesNotMatch(sql, /vice president stays included/i);
  assert.match(webhook, /extractDonationNote/);
  assert.match(webhook, /kos_apply_donation_payment/);
  assert.equal(sql.includes("\u2014"), false);
});
