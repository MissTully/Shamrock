import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const PUBLIC_PAGES = [
  "index.html",
  "event-signup.html",
  "parades.html",
  "tartan-ball.html",
  "tartan-ball-sponsors.html",
  "learn.html",
  "krewe-history.html",
  "poetry.html",
  "gallery.html",
  "videos.html",
  "volunteer.html",
  "store.html",
  "membership-application.html",
  "membership-full-application.html",
];

const URL = "https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock";

test("public footers link to Donate from one shared script", () => {
  const donateJs = read("assets/kos-donate.js");
  assert.match(donateJs, /KOS_DONATION_ZEFFY_URL = "https:\/\/www\.zeffy\.com\/en-US\/donation-form\/give-to-the-krewe-of-shamrock"/);
  assert.match(donateJs, /KOS_DONATION_AMOUNT_PARAM = "amount"/);
  assert.match(donateJs, /list_public_donation_form/);
  for (const file of PUBLIC_PAGES) {
    const html = read(file);
    assert.match(html, />Donate<\/a>/, file);
    assert.match(html, /data-kos-donate="1"/, file);
    assert.match(html, /assets\/kos-donate\.js/, file);
    assert.match(html, new RegExp(URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), file);
  }
  const share = read("share.html");
  assert.doesNotMatch(share, />Donate<\/a>/);
});

test("volunteer Give button is gold on the green band", () => {
  const html = read("volunteer.html");
  const button = html.slice(html.indexOf('id="giveToTheKrewe"') - 80, html.indexOf('id="giveToTheKrewe"') + 220);
  assert.match(button, /btn btn-primary/);
  assert.doesNotMatch(button, /btn-outline/);
  assert.match(html, /id="lendAHand"/);
  assert.match(html, /Give to the Krewe/);
  assert.equal(html.includes("\u2014"), false);
});

test("Member Desk Giving card and officer donations surfaces are present", () => {
  const members = read("members.html");
  const desk = read("assets/members-desk.js");
  const gifts = read("assets/kos-donations.js");
  const dues = read("assets/kos-dues-reporting.js");
  assert.match(members, /id="hubDonations"/);
  assert.match(members, /data-give-amount="10"/);
  assert.match(members, /data-give-amount="25"/);
  assert.match(members, /data-give-amount="50"/);
  assert.match(members, /data-give-amount="100"/);
  assert.match(members, /id="hubDonationNote"/);
  assert.match(members, /maxlength="500"/);
  assert.match(members, /id="hubDonationSubmit"/);
  assert.match(members, /id="hubDonationGifts"/);
  assert.match(desk, /id: "deskGiving"/);
  assert.match(desk, /cards: \["hubDonations"\]/);
  assert.match(desk, /hubCharityDonations/);
  assert.match(desk, /canViewCharityDonations/);
  assert.match(gifts, /kos_create_donation_intent/);
  assert.match(gifts, /kos_list_my_donation_intents/);
  assert.match(gifts, /Matched/);
  assert.match(gifts, /Pending/);
  assert.match(dues, /id="hubPayTab_donations"/);
  assert.match(dues, /id="hubDonationLedger"/);
  assert.match(dues, /data-label=\\"Note\\"/);
  const card = members.slice(members.indexOf('id="hubDonations"'), members.indexOf('id="lockerCard"'));
  assert.equal(card.includes("\u2014"), false);
  assert.equal(card.includes("\u2013"), false);
  assert.equal(gifts.includes("\u2014"), false);
  assert.equal(gifts.includes("\u2013"), false);
});
