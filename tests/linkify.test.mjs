import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const linkify = require("../assets/kos-linkify.js");
const share = require("../lib/event-share.js");

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
  });
}

test("http and https urls become links and trailing punctuation stays outside", () => {
  const html = linkify(esc(
    "More info: https://www.egyptshriners.com/feztival-of-trees. (Also https://example.com/path)."
  ));
  assert.match(html, /href="https:\/\/www\.egyptshriners\.com\/feztival-of-trees"/);
  assert.match(html, />https:\/\/www\.egyptshriners\.com\/feztival-of-trees<\/a>\./);
  assert.match(html, /href="https:\/\/example\.com\/path"/);
  assert.match(html, />https:\/\/example\.com\/path<\/a>\)\./);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.equal(html.includes("trees.</a>"), false);
});

test("a closing paren that belongs to the url stays in the link", () => {
  const html = linkify(esc("See https://en.wikipedia.org/wiki/Krewe_(social)."));
  assert.match(html, /href="https:\/\/en\.wikipedia\.org\/wiki\/Krewe_\(social\)"/);
  assert.match(html, /<\/a>\./);
});

test("line breaks survive linkify", () => {
  const html = linkify(esc("Line one\nhttps://example.com/a\nLine three"));
  assert.match(html, /Line one\n<a /);
  assert.match(html, /<\/a>\nLine three/);
});

test("an xss attempt stays text and javascript is not a link", () => {
  const raw = '<script>alert(1)</script> javascript:alert(1) data:text/html,hi ' +
    'https://example.com/?q=1&b=2" onclick="alert(1)"';
  const html = linkify(esc(raw));
  assert.equal(html.includes("<script"), false);
  assert.equal(html.includes("<img"), false);
  assert.equal(/href="javascript:/i.test(html), false);
  assert.equal(/href="data:/i.test(html), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /href="https:\/\/example\.com\/\?q=1&amp;b=2"/);
  assert.match(html, /<\/a>&quot;/);
  assert.equal((html.match(/<a /g) || []).length, 1);
});

test("a wrapping quote or angle bracket stays outside the link", () => {
  const html = linkify(esc('See "https://example.com/a". and <https://example.com/b> plus \'https://example.com/c\''));
  assert.match(html, /&quot;<a class="kos-url" href="https:\/\/example\.com\/a" target="_blank" rel="noopener noreferrer">https:\/\/example\.com\/a<\/a>&quot;\./);
  assert.match(html, /&lt;<a class="kos-url" href="https:\/\/example\.com\/b" target="_blank" rel="noopener noreferrer">https:\/\/example\.com\/b<\/a>&gt;/);
  assert.match(html, /&#39;<a class="kos-url" href="https:\/\/example\.com\/c" target="_blank" rel="noopener noreferrer">https:\/\/example\.com\/c<\/a>&#39;/);
  assert.equal(html.includes('href="https://example.com/a&quot;"'), false);
  assert.equal(html.includes('href="https://example.com/b&gt;"'), false);
  assert.equal((html.match(/<a /g) || []).length, 3);
});

test("an ampersand inside a url stays escaped in the href", () => {
  const html = linkify(esc("Go to https://example.com/?a=1&b=2."));
  assert.match(html, /href="https:\/\/example\.com\/\?a=1&amp;b=2"/);
  assert.match(html, /<\/a>\./);
});

test("safeHttp accepts only http and https", () => {
  assert.equal(linkify.safeHttp("https://example.com/a"), "https://example.com/a");
  assert.equal(linkify.safeHttp(" http://example.com/a "), "http://example.com/a");
  assert.equal(linkify.safeHttp("javascript:alert(1)"), "");
  assert.equal(linkify.safeHttp("JAVASCRIPT:alert(1)"), "");
  assert.equal(linkify.safeHttp("data:text/html,hi"), "");
  assert.equal(linkify.safeHttp("https://example.com/a b"), "");
});

test("the public event page linkifies the description and adds Event link", () => {
  const html = share.renderEventSharePage({
    id: "fixture-metro",
    name: "Metropolitan Ministries",
    status: "published",
    is_public: true,
    event_type: "fundraiser",
    start_time: "2026-12-12T15:00:00.000Z",
    description: "Sign up to volunteer with the Krewe at Metropolitan Ministries: https://metromin.volunteerhub.com/vv2/lp/KreweofShamrock/",
    external_url: "https://metromin.volunteerhub.com/vv2/lp/KreweofShamrock/"
  });
  assert.match(html, /class="share-desc"[\s\S]*href="https:\/\/metromin\.volunteerhub\.com\/vv2\/lp\/KreweofShamrock\/"/);
  assert.match(html, /class="btn btn-green"[^>]*>Event link</);
  assert.equal(/href="javascript:/i.test(html), false);
});

test("a javascript external url is not a button and a script in the description stays escaped", () => {
  const html = share.renderEventSharePage({
    id: "fixture-bad",
    name: "Bad",
    status: "published",
    is_public: true,
    start_time: "2026-12-12T15:00:00.000Z",
    description: '<img src=x onerror=alert(1)> javascript:alert(1)\nhttps://example.com/ok.',
    external_url: "javascript:alert(1)"
  });
  const desc = html.split('class="share-desc"')[1].split("</p>")[0];
  assert.equal(desc.includes("<script"), false);
  assert.equal(desc.includes("<img"), false);
  assert.match(desc, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(/href="javascript:/i.test(html), false);
  assert.equal(html.includes(">Event link<"), false);
  assert.match(html, /href="https:\/\/example\.com\/ok"/);
  assert.match(html, /<\/a>\./);
});
