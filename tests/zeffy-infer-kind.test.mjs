import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectTicketHolders, inferKind } from "../supabase/functions/zeffy-webhook/infer-kind.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = readFileSync(join(root, "sql/kos_zeffy_dues_ticket_payments.sql"), "utf8");
const webhook = readFileSync(join(root, "supabase/functions/zeffy-webhook/index.ts"), "utf8");
const parade = readFileSync(join(root, "members.html"), "utf8");

const CATALOG = [
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership",
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-associate-membership",
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2",
  "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-auxiliary-membership",
];

test("inferKind classifies dues, the background check, events, and shop", () => {
  const dues = inferKind({}, {
    campaign_type: "ticketing",
    description: "Krewe of Shamrock Membership",
    url: CATALOG[0],
    amount: 37500,
    items: [{ type: "ticket", name: "Full Membership", amount: 37500 }],
  }, CATALOG);
  assert.equal(dues, "dues");

  const duesByCategory = inferKind({}, {
    campaign_type: "ticketing",
    campaign_category: "membership",
    description: "2026 season",
    items: [{ type: "ticket", name: "Full", amount: 37500 }],
  }, CATALOG);
  assert.equal(duesByCategory, "dues");

  const leave = inferKind({}, {
    campaign_type: "ticketing",
    description: "Leave of absence",
    url: CATALOG[2],
    items: [{ type: "ticket", name: "LOA", amount: 10000 }],
  }, CATALOG);
  assert.equal(leave, "dues");

  const urlOnly = inferKind({}, {
    campaign_type: "ticketing",
    description: "2026 season",
    url: CATALOG[1],
    items: [{ type: "ticket", name: "Admission", amount: 45000 }],
  }, CATALOG);
  assert.equal(urlOnly, "dues");
  assert.equal(inferKind({}, {
    campaign_type: "ticketing",
    description: "2026 season",
    url: CATALOG[1],
    items: [{ type: "ticket", name: "Admission", amount: 45000 }],
  }, []), "event");

  const background = inferKind({}, {
    campaign_type: "ticketing",
    campaign_category: "membership",
    description: "Background check",
    amount: 7500,
    items: [{ type: "ticket", name: "Background check", amount: 7500 }],
  }, CATALOG);
  assert.equal(background, "other");

  const eventTicket = inferKind({}, {
    campaign_type: "ticketing",
    description: "Gasparilla parade",
    url: "https://www.zeffy.com/en-US/ticketing/gasparilla-parade-ticket",
    items: [{ type: "ticket", name: "Parade admission", amount: 0 }],
  }, CATALOG);
  assert.equal(eventTicket, "event");

  const shop = inferKind({}, {
    campaign_type: "ticketing",
    campaign_slug: "kos-shop",
    campaign_name: "KOS Shop",
    url: "https://www.zeffy.com/en-US/ticketing/kos-shop",
    items: [{ type: "ticket", name: "Baseball cap", amount: 2500 }],
  }, CATALOG);
  assert.equal(shop, "store");

  assert.equal(inferKind({}, {
    campaign_type: "ticketing",
    description: "Krewe locker rental small",
    url: "https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small",
  }, CATALOG), "other");

  assert.equal(inferKind({}, { description: "2026 dues" }, []), "dues");
});

test("a couple order is two Full ticket holders, each for $375", () => {
  const holders = collectTicketHolders({
    amount: 75000,
    items: [
      {
        type: "ticket",
        name: "Full Membership",
        amount: 37500,
        attendee: { email: "Alex@Example.com", first_name: "Alex", last_name: "Kelly" },
      },
      {
        type: "ticket",
        name: "Full Membership",
        amount: 37500,
        attendee: { email: "blair@example.com", name: "Blair Kelly" },
      },
    ],
  });
  assert.equal(holders.length, 2);
  assert.equal(holders[0].email, "alex@example.com");
  assert.equal(holders[0].name, "Alex Kelly");
  assert.equal(holders[0].ticket_name, "Full Membership");
  assert.equal(holders[0].amount_cents, 37500);
  assert.equal(holders[1].email, "blair@example.com");
  assert.equal(holders[1].name, "Blair Kelly");
  assert.equal(holders[1].amount_cents, 37500);
});

test("a named attendee does not inherit the purchaser email, and one ticket is one holder", () => {
  const named = collectTicketHolders({
    items: [{
      type: "ticket",
      name: "Full Membership",
      amount: 37500,
      email: "alex@example.com",
      attendee: { name: "Blair Kelly" },
      buyer: { email: "alex@example.com", name: "Alex Kelly" },
    }],
  });
  assert.equal(named.length, 1);
  assert.equal(named[0].email, undefined);
  assert.equal(named[0].name, "Blair Kelly");
  assert.equal(named[0].amount_cents, 37500);

  const buyerOnly = collectTicketHolders({
    items: [{
      type: "ticket",
      name: "Full Membership",
      amount: 37500,
      buyer: { email: "alex@example.com", name: "Alex Kelly" },
    }],
  });
  assert.equal(buyerOnly.length, 1);
  assert.equal(buyerOnly[0].email, "alex@example.com");
  assert.equal(buyerOnly[0].name, "Alex Kelly");
});

test("dues migration marks each holder once and is not a live update", () => {
  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /ticket_holders/);
  assert.match(sql, /kos_match_member_by_email/);
  assert.match(sql, /kos_match_member_by_name/);
  assert.match(sql, /v_target := v_member/);
  assert.match(sql, /payment_recorded/);
  assert.match(sql, /provider_payment_id = v_pay_id/);
  assert.match(sql, /v_existing/);
  assert.match(sql, /lower\(coalesce\(v_status, ''\)\) = 'active'/);
  assert.match(sql, /created_paid/);
  assert.match(sql, /marked_paid/);
  assert.match(sql, /m\.membership_level/);
  assert.doesNotMatch(sql, /join application fee/);
  assert.match(webhook, /ticket_holders: ticketHolders/);
  assert.match(webhook, /inferKind\(metadata, payment, duesUrls\)/);
  assert.match(webhook, /kos_dues_catalog/);
  assert.match(parade, /Membership dues \(\$\$\{duesLevel\.amount\} \$\{duesLevel\.label\}\)/);
  assert.doesNotMatch(parade, /not the join application fee/);
});
