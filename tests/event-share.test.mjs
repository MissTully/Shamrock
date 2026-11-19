import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const share = require("../lib/event-share.js");
const httpShare = require("../lib/event-share-http.js");

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, "fixtures/share-events.json"), "utf8"));

function memoryRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    end(body) { this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || ""); }
  };
}

async function getEvent(id) {
  const calls = [];
  const res = memoryRes();
  await httpShare.handleShareRequest({ query: { id: id } }, res, {
    fetch: function (url) {
      calls.push(url);
      const parsed = new URL(url);
      const key = String(parsed.searchParams.get("id") || "").replace(/^eq\./, "");
      const row = fixtures[key];
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => (row ? [row] : [])
      });
    }
  });
  res.calls = calls;
  return res;
}

test("public select does not ask for member address or notes", () => {
  assert.equal(httpShare.PUBLIC_SELECT.includes("member_address"), false);
  assert.equal(httpShare.PUBLIC_SELECT.includes("member_notes"), false);
  assert.equal(httpShare.PUBLIC_SELECT.includes("flyer_url"), true);
  assert.equal(httpShare.PUBLIC_SELECT.includes("name"), true);
});

test("SantaFest share page includes Open Graph and Twitter tags", async () => {
  const res = await getEvent("fixture-santafest");
  assert.equal(res.statusCode, 200);
  assert.match(res.calls[0], /\/v_public_events\?/);
  assert.equal(/member_address|member_notes/.test(res.calls[0]), false);
  const html = res.body;
  assert.match(html, /property="og:title" content="SantaFest"/);
  assert.match(html, /property="og:description" content="Saturday, December 5, 2026, 1:00 PM Eastern\. Starts at Morgan St\. and Madison St\., Downtown Tampa, FL\. Tampa's downtown holiday kickoff parade and the start of the krewe's marching season\. The parade steps off at 1:00 PM at Morgan Street and Madison Street\."/);
  assert.match(html, /property="og:image" content="https:\/\/oazwkwflgbthojvnclfc\.supabase\.co\/storage\/v1\/render\/image\/public\/event-flyers\/1794544500325-sand-save-1794544458706\.png\?width=1200&amp;height=2400&amp;resize=contain&amp;quality=75&amp;format=webp"/);
  assert.match(html, /property="og:url" content="https:\/\/www\.kreweofshamrock\.com\/events\/fixture-santafest"/);
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:site_name" content="Krewe of Shamrock"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:title" content="SantaFest"/);
  assert.match(html, /https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=https%3A%2F%2Fwww\.kreweofshamrock\.com%2Fevents%2Ffixture-santafest/);
  assert.equal(html.includes("1790675004521855"), false);
  assert.equal(html.includes("Share in our Krewe group"), false);
  assert.equal(html.includes("kos-share-group"), false);
  assert.equal(html.includes("kos-share-note"), false);
  assert.equal(html.includes("kos-share-fallback"), false);
  assert.match(html, /Share on my Facebook/);
  assert.equal(html.includes(">Share on Facebook<"), false);
  assert.equal(html.includes("123 Hidden Lane"), false);
  assert.equal(html.includes("Gate code 4321"), false);
  assert.match(html, /Parade details/);
  assert.equal(html.includes("/event-signup.html?event=fixture-santafest"), false);
});

test("unpublished, cancelled, private, and missing events do not leak", async () => {
  const draft = await getEvent("fixture-draft");
  assert.equal(draft.statusCode, 404);
  assert.equal(draft.body.includes("Secret Draft Gala"), false);
  assert.equal(draft.body.includes("Officers only"), false);
  assert.equal(draft.body.includes('property="og:title"'), false);

  const cancelled = await getEvent("fixture-cancelled");
  assert.equal(cancelled.statusCode, 404);
  assert.equal(cancelled.body.includes("Cancelled Ceili"), false);

  const hidden = await getEvent("fixture-private");
  assert.equal(hidden.statusCode, 404);
  assert.equal(hidden.body.includes("Private Unlisted Social"), false);

  const missing = await getEvent("does-not-exist");
  assert.equal(missing.statusCode, 404);
  assert.match(missing.body, /This event is not available/);
});

test("a started event stays on its link and signup is closed", async () => {
  const res = await getEvent("fixture-started");
  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Registration is closed/);
  assert.equal(res.body.includes("/event-signup.html?event=fixture-started"), false);
  assert.match(res.body, /property="og:title" content="Past Social"/);
});

test("quotes in a title are escaped in the meta tag", () => {
  const html = share.renderEventSharePage({
    id: "fixture-quotes",
    name: 'Shamrock & "Friends"',
    description: "<script>alert(1)</script> Hello there.",
    status: "published",
    is_public: true,
    start_time: "2026-12-05T18:00:00.000Z",
    location: "Tampa",
    member_notes: "still private"
  });
  assert.match(html, /property="og:title" content="Shamrock &amp; &quot;Friends&quot;"/);
  assert.equal(html.includes("<script>alert"), false);
  assert.equal(html.includes("still private"), false);
});

test("a non-uuid id is not available, not a server error", async () => {
  let calls = 0;
  const res = memoryRes();
  await httpShare.handleShareRequest({ query: { id: "not-a-real-event" } }, res, {
    fetch: async function () {
      calls += 1;
      return {
        ok: false,
        status: 400,
        json: async () => ({ code: "22P02", message: "invalid input syntax for type uuid" })
      };
    }
  });
  assert.equal(res.statusCode, 404);
  assert.match(res.body, /This event is not available/);
  assert.equal(res.body.includes("not-a-real-event"), false);
  assert.equal(res.body.includes("invalid input"), false);
  assert.equal(calls, 1);
});

test("a database failure asks the visitor to try again", async () => {
  const res = memoryRes();
  await httpShare.handleShareRequest({ query: { id: "11111111-1111-4111-8111-111111111111" } }, res, {
    fetch: async function () {
      return { ok: false, status: 500, json: async () => ({ message: "db down" }) };
    }
  });
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /try again/i);
  assert.equal(res.body.includes("db down"), false);
});

test("an Inter-Krewe event links to the host site", () => {
  const html = share.renderEventSharePage({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ye Mystic Krewe Social",
    source: "ikc",
    status: "published",
    is_public: true,
    event_type: "parade",
    start_time: "2026-12-20T23:00:00.000Z",
    location: "Tampa",
    external_url: "https://example-krewe.example/rsvp",
    description: "Friends of the krewe."
  });
  assert.match(html, /href="https:\/\/example-krewe\.example\/rsvp"/);
  assert.match(html, /Details on the host krewe/);
  assert.equal(html.includes("/event-signup.html?event="), false);
  assert.equal(html.includes('href="/parades.html"'), false);
  assert.equal(html.includes('href="/members.html"'), false);
});

test("the members group URL is one shared constant and stays off the public page", () => {
  assert.equal(share.MEMBERS_FACEBOOK_GROUP_URL, "https://www.facebook.com/groups/1790675004521855");
  const buttons = share.shareButtonsHtml("fixture-santafest", "SantaFest");
  assert.equal(buttons.includes("1790675004521855"), false);
  assert.equal(buttons.includes("kos-share-group"), false);
  assert.equal(buttons.includes("kos-share-note"), false);
  assert.equal(buttons.includes("kos-share-fallback"), false);
  assert.match(buttons, /Share on my Facebook/);
  assert.match(buttons, /Copy link/);
  assert.match(buttons, />Share</);
  const client = readFileSync(join(here, "../assets/kos-share.js"), "utf8");
  const server = readFileSync(join(here, "../lib/event-share.js"), "utf8");
  const kosShare = require("../assets/kos-share.js");
  const hub = kosShare.html("fixture-santafest", "SantaFest", { members: true });
  const hrefs = hub.match(/https:\/\/www\.facebook\.com\/groups\/1790675004521855/g) || [];
  assert.equal(hrefs.length, 1);
  assert.match(hub, /class="kos-share kos-share-members"/);
  assert.match(hub, /class="kos-share-group"/);
  assert.match(hub, /kos-share-note/);
  assert.match(hub, /kos-share-fallback/);
  assert.equal((client.match(/1790675004521855/g) || []).length, 1);
  assert.equal(server.includes("1790675004521855"), false);
  assert.equal(client.includes("—"), false);
  assert.equal(buttons.includes("—"), false);
  assert.equal(hub.includes("—"), false);
});

test("a pdf flyer falls back to the Krewe image", () => {
  const image = share.ogImage({
    name: "Notes",
    flyer_url: "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/notes.pdf"
  });
  assert.equal(image.url, "https://www.kreweofshamrock.com/assets/img/float-parade.jpg");
});
