"use strict";

// Vercel serves /events/:id through this handler so the first HTML byte
// already contains Open Graph tags. Unpublished and missing events return
// a generic page with none of the event's text.

const share = require("./event-share");

const SB_URL = process.env.SUPABASE_URL || "https://oazwkwflgbthojvnclfc.supabase.co";
const SB_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_aMCyVxkiolMuBt9_R990CA_xQmXLaaS";
const PUBLIC_SELECT = share.PUBLIC_FIELDS.join(",");

function eventIdFrom(req) {
  const query = req && req.query ? req.query : {};
  let id = query.id;
  if (Array.isArray(id)) id = id[0];
  if (id) return String(id).trim();
  const url = String((req && req.url) || "");
  const match = url.match(/\/events\/([^/?#]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]).trim();
  } catch (err) {
    return "";
  }
}

function isSafeId(id) {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/.test(id);
}

function sendHtml(res, status, html) {
  const body = Buffer.from(html, "utf8");
  res.statusCode = status;
  if (typeof res.setHeader === "function") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Length", String(body.length));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", status === 200 ? "public, max-age=300" : "no-store");
    if (status !== 200) res.setHeader("X-Robots-Tag", "noindex");
  }
  res.end(body);
  return { status: status, html: html };
}

async function readRows(response) {
  if (!response || !response.ok) return { error: true };
  const data = await response.json();
  if (!Array.isArray(data)) return { error: true };
  return { rows: data };
}

async function loadPublicEvent(id, fetchImpl) {
  const headers = {
    apikey: SB_KEY,
    Authorization: "Bearer " + SB_KEY,
    Accept: "application/json"
  };
  const viewUrl = SB_URL + "/rest/v1/v_public_events?id=eq." + encodeURIComponent(id) + "&select=" + PUBLIC_SELECT;
  let first;
  try {
    first = await fetchImpl(viewUrl, { headers: headers });
  } catch (err) {
    return { error: true };
  }
  const viewed = await readRows(first);
  if (!viewed.error) return { event: viewed.rows[0] || null };
  const tableUrl = SB_URL + "/rest/v1/events?id=eq." + encodeURIComponent(id) + "&is_public=eq.true&select=" + PUBLIC_SELECT;
  let second;
  try {
    second = await fetchImpl(tableUrl, { headers: headers });
  } catch (err) {
    return { error: true };
  }
  const table = await readRows(second);
  if (table.error) return { error: true };
  return { event: table.rows[0] || null };
}

async function handleShareRequest(req, res, options) {
  const opts = options || {};
  const fetchImpl = opts.fetch || global.fetch;
  const id = eventIdFrom(req);
  if (!isSafeId(id)) {
    return sendHtml(res, 404, share.renderUnavailablePage());
  }
  const loaded = await loadPublicEvent(id, fetchImpl);
  if (loaded.error) {
    return sendHtml(res, 503, share.renderUnavailablePage("try-again"));
  }
  if (!share.isShareableEvent(loaded.event)) {
    return sendHtml(res, 404, share.renderUnavailablePage());
  }
  return sendHtml(res, 200, share.renderEventSharePage(loaded.event, { now: opts.now }));
}

module.exports = {
  PUBLIC_SELECT: PUBLIC_SELECT,
  eventIdFrom: eventIdFrom,
  isSafeId: isSafeId,
  loadPublicEvent: loadPublicEvent,
  handleShareRequest: handleShareRequest
};
