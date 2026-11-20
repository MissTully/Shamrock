"use strict";

// Public event pages and Open Graph tags. Facebook's crawler does not run
// JavaScript, so this HTML is built on the server. Only public fields are
// read. member_address and member_notes are ignored even if a row includes them.

const kosShare = require("../assets/kos-share.js");
const linkify = require("../assets/kos-linkify.js");
const paradeRsvp = require("../assets/kos-parade-rsvp.js");

const SITE_ORIGIN = "https://www.kreweofshamrock.com";
const SITE_NAME = "Krewe of Shamrock";
const DEFAULT_IMAGE = SITE_ORIGIN + "/assets/img/float-parade.jpg";
const MEMBERS_FACEBOOK_GROUP_URL = kosShare.groupUrl;

const PUBLIC_FIELDS = [
  "id",
  "name",
  "description",
  "event_type",
  "start_time",
  "end_time",
  "location",
  "source",
  "external_url",
  "ticket_payment_url",
  "flyer_url",
  "status",
  "is_public",
  "is_online",
  "members_only",
  "registration_closes_at",
  "ticket_price_cents",
  "ticket_label"
];

function escText(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escHtml(value) {
  return escText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escAttr(value) {
  return escText(value).replace(/"/g, "&quot;").replace(/\s+/g, " ").trim();
}

function plain(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text, max) {
  const clean = plain(text);
  if (!clean) return "";
  if (clean.length <= max) return clean;
  const sentence = clean.split(/(?<=[.!?])\s+/)[0];
  if (sentence && sentence.length >= 40 && sentence.length <= max) return sentence;
  let cut = clean.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  if (space > 40) cut = cut.slice(0, space);
  return cut.replace(/[.,;:\s]+$/, "") + "...";
}

function publicEvent(row) {
  if (!row || typeof row !== "object") return null;
  const out = {};
  PUBLIC_FIELDS.forEach(function (key) {
    if (row[key] !== undefined) out[key] = row[key];
  });
  if (!out.id) return null;
  return out;
}

function isShareableEvent(row) {
  const ev = publicEvent(row);
  if (!ev || !ev.id) return false;
  if (ev.is_public === false) return false;
  const status = String(ev.status || "published").toLowerCase();
  return status === "published" || status === "live";
}

function eventPath(id) {
  return "/events/" + encodeURIComponent(String(id || "").trim());
}

function eventUrl(id) {
  return SITE_ORIGIN + eventPath(id);
}

function facebookShareUrl(id) {
  return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(eventUrl(id));
}

function safeHttp(url) {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return "";
  return value;
}

function nyFormat(date, options) {
  return new Intl.DateTimeFormat("en-US", Object.assign({ timeZone: "America/New_York" }, options)).format(date);
}

function parseInstant(value) {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date;
}

function formatWhen(ev) {
  const start = parseInstant(ev && ev.start_time);
  if (!start) {
    return {
      date: "Date to be announced",
      time: "",
      line: "Date to be announced",
      page: "Date to be announced"
    };
  }
  const date = nyFormat(start, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const time = nyFormat(start, { hour: "numeric", minute: "2-digit" });
  const line = date + ", " + time + " Eastern";
  let page = line;
  const end = parseInstant(ev.end_time);
  if (end) {
    const startDay = nyFormat(start, { year: "numeric", month: "2-digit", day: "2-digit" });
    const endDay = nyFormat(end, { year: "numeric", month: "2-digit", day: "2-digit" });
    const endClock = nyFormat(end, { hour: "numeric", minute: "2-digit" });
    if (startDay === endDay) page = date + ", " + time + " to " + endClock + " Eastern";
    else page = line + " to " + nyFormat(end, { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Eastern";
  }
  return { date: date, time: time + " Eastern", line: line, page: page };
}

function publicLocation(ev) {
  const loc = plain(ev && ev.location);
  if (loc) return loc;
  if (ev && ev.is_online) return "Online";
  if (ev && ev.members_only) return "Address shared with members";
  return "";
}

function ogDescription(ev) {
  const when = formatWhen(ev).line;
  const where = publicLocation(ev);
  const blurb = clip(ev && ev.description, 180);
  let text = when;
  if (where) text += ". " + where;
  if (blurb) text += ". " + blurb;
  return text;
}

function ogImage(ev) {
  const raw = String((ev && ev.flyer_url) || "").trim();
  if (!raw || /\.pdf(?:$|[?#])/i.test(raw)) {
    return { url: DEFAULT_IMAGE, alt: "Krewe of Shamrock" };
  }
  const marker = "/storage/v1/object/public/";
  const at = raw.indexOf(marker);
  if (at === -1) {
    if (/^https?:\/\//i.test(raw)) return { url: raw, alt: "Flyer for " + plain(ev.name || "the event") };
    return { url: DEFAULT_IMAGE, alt: "Krewe of Shamrock" };
  }
  const filePath = raw.slice(at + marker.length).split("#")[0].split("?")[0];
  if (!filePath) return { url: DEFAULT_IMAGE, alt: "Krewe of Shamrock" };
  // This project's image service accepts format=webp and rejects jpeg.
  // A tall contain box keeps a portrait flyer at least 1200px wide.
  const url = raw.slice(0, at) + "/storage/v1/render/image/public/" + filePath +
    "?width=1200&height=2400&resize=contain&quality=75&format=webp";
  return { url: url, alt: "Flyer for " + plain(ev.name || "the event") };
}

function signupClosed(ev, now) {
  const clock = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  const start = parseInstant(ev && ev.start_time);
  if (start && start.getTime() <= clock.getTime()) return true;
  const end = parseInstant(ev && ev.end_time);
  if (end && end.getTime() <= clock.getTime()) return true;
  const closes = parseInstant(ev && ev.registration_closes_at);
  if (closes && clock.getTime() >= closes.getTime()) return true;
  return false;
}

function shareButtonsHtml(id, title) {
  return kosShare.html(id, plain(title) || "");
}

function isKreweParade(ev) {
  return String((ev && ev.event_type) || "").toLowerCase() === "parade" &&
    String((ev && ev.source) || "").toLowerCase() !== "ikc";
}

function typeKicker(ev) {
  if (String((ev && ev.source) || "").toLowerCase() === "ikc") return "Inter-Krewe Council";
  const raw = plain(ev && ev.event_type);
  if (!raw) return "Event";
  if (raw.toLowerCase() === "parade") return "Parade";
  return raw;
}

function moreLinksHtml(ev) {
  const events = '<a href="/event-signup.html">All upcoming events</a>';
  if (isKreweParade(ev)) {
    return '<p class="share-more"><a href="/parades.html">Back to Parades</a> ' + events + "</p>\n";
  }
  return '<p class="share-more">' + events + "</p>\n";
}

function eventLinkHtml(ev) {
  const href = safeHttp(ev && ev.external_url);
  if (!href) return "";
  const pay = safeHttp(ev.ticket_payment_url) || (/zeffy\.com/i.test(ev.external_url || "") ? safeHttp(ev.external_url) : "");
  if (pay && pay === href) return "";
  const ikc = String(ev.source || "").toLowerCase() === "ikc";
  const label = ikc ? "Details on the host krewe's page" : "Event link";
  const cls = ikc ? "btn" : "btn btn-green";
  return '<a class="' + cls + '" href="' + escAttr(href) + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
}

function ctaHtml(ev) {
  const type = String((ev && ev.event_type) || "").toLowerCase();
  const payload = Object.assign({}, ev, {
    event_type: ev.event_type || "social",
    collect_guests: type === "parade" && String(ev.source || "").toLowerCase() !== "ikc" && ev.collect_guests !== false
  });
  return paradeRsvp.fallbackHtml(payload);
}

function flyerHtml(ev, image) {
  const raw = String(ev.flyer_url || "").trim();
  if (!raw) return "";
  if (/\.pdf(?:$|[?#])/i.test(raw)) {
    const href = safeHttp(raw);
    if (!href) return "";
    return '<p><a class="btn" href="' + escAttr(href) + '" target="_blank" rel="noopener noreferrer">Open the event flyer (PDF)</a></p>';
  }
  const full = safeHttp(raw) || raw;
  return '<a href="' + escAttr(full) + '" target="_blank" rel="noopener noreferrer">' +
    '<img class="share-flyer" src="' + escAttr(image.url) + '" alt="' + escAttr(image.alt) + '" />' +
    "</a>";
}

function pageDocument(parts) {
  return "<!DOCTYPE html>\n" +
    '<html lang="en">\n<head>\n' +
    '<meta charset="utf-8" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    "<title>" + escText(parts.title) + "</title>\n" +
    (parts.description ? '<meta name="description" content="' + escAttr(parts.description) + '" />\n' : "") +
    (parts.robots ? '<meta name="robots" content="' + escAttr(parts.robots) + '" />\n' : "") +
    (parts.canonical ? '<link rel="canonical" href="' + escAttr(parts.canonical) + '" />\n' : "") +
    (parts.head || "") +
    '<link rel="icon" href="/favicon.ico" sizes="any" />\n' +
    '<link rel="preconnect" href="https://fonts.googleapis.com" />\n' +
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet" />\n' +
    '<link rel="stylesheet" href="/assets/krewe.css?v=20261119links2" />\n' +
    "<style>\n" +
    "body.share-page{margin:0;background:#f6efdd;color:#23291f;}\n" +
    ".share-top{background:#14532d;color:#fffaf0;padding:14px 16px;}\n" +
    ".share-top a{color:#fffaf0;text-decoration:none;display:flex;align-items:center;gap:10px;font-family:Cinzel,serif;font-weight:700;font-size:18px;min-height:44px;}\n" +
    ".share-top img{width:42px;height:42px;}\n" +
    ".share-main{box-sizing:border-box;max-width:760px;margin:0 auto;padding:22px 16px 56px;}\n" +
    ".share-kicker{margin:0 0 6px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a12;font-family:Cinzel,serif;font-size:13px;}\n" +
    ".share-main h1{margin:0 0 12px;font-family:Cinzel,serif;color:#14532d;font-size:clamp(28px,8vw,40px);line-height:1.15;overflow-wrap:anywhere;}\n" +
    ".share-flyer{display:block;width:100%;height:auto;border-radius:12px;border:1px solid rgba(168,128,28,.45);margin:0 0 16px;background:#fffdf8;}\n" +
    ".share-when,.share-where,.share-desc,.share-closed{font-size:18px;line-height:1.5;margin:0 0 10px;overflow-wrap:anywhere;}\n" +
    ".share-desc{white-space:pre-wrap;}\n" +
    ".share-desc a.kos-url{color:#14532d;font-weight:700;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere;word-break:break-word;}\n" +
    ".share-desc a.kos-url:hover{color:#0c3b21;}\n" +
    ".share-actions{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0;align-items:center;}\n" +
    ".kos-parade-rsvp a.kos-pr-tickets{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;border-radius:999px;border:2px solid #8a6a12;background:#fffdf8;color:#14532d;font-weight:700;text-decoration:none;}\n" +
    ".share-actions .btn,.share-main .btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;box-sizing:border-box;}\n" +
    ".share-more{margin-top:18px;font-size:16px;}\n" +
    ".share-more a{display:inline-flex;align-items:center;min-height:44px;margin:0 14px 0 0;}\n" +
    "</style>\n" +
    "</head>\n<body class=\"share-page\">\n" +
    '<header class="share-top"><a href="/index.html"><img src="/assets/img/emblem-shamrock.png" alt="" /> Krewe of Shamrock</a></header>\n' +
    '<main class="share-main">\n' +
    parts.body +
    "\n</main>\n" +
    '<script src="/assets/kos-share.js?v=20261119links2"></script>\n' +
    (parts.scripts || "") +
    "</body>\n</html>\n";
}

function renderEventSharePage(row, options) {
  const ev = publicEvent(row);
  if (!ev || !isShareableEvent(ev)) return renderUnavailablePage();
  const now = options && options.now ? new Date(options.now) : new Date();
  const when = formatWhen(ev);
  const where = publicLocation(ev);
  const description = ogDescription(ev);
  const image = ogImage(ev);
  const canonical = eventUrl(ev.id);
  const title = plain(ev.name) || (isKreweParade(ev) ? "Krewe parade" : "Krewe event");
  const head =
    '<meta property="og:title" content="' + escAttr(title) + '" />\n' +
    '<meta property="og:description" content="' + escAttr(description) + '" />\n' +
    '<meta property="og:image" content="' + escAttr(image.url) + '" />\n' +
    '<meta property="og:image:alt" content="' + escAttr(image.alt) + '" />\n' +
    '<meta property="og:url" content="' + escAttr(canonical) + '" />\n' +
    '<meta property="og:type" content="website" />\n' +
    '<meta property="og:site_name" content="' + escAttr(SITE_NAME) + '" />\n' +
    '<meta name="twitter:card" content="summary_large_image" />\n' +
    '<meta name="twitter:title" content="' + escAttr(title) + '" />\n' +
    '<meta name="twitter:description" content="' + escAttr(description) + '" />\n' +
    '<meta name="twitter:image" content="' + escAttr(image.url) + '" />\n';
  const body =
    '<p class="share-kicker">' + escText(typeKicker(ev)) + "</p>\n" +
    "<h1>" + escText(title) + "</h1>\n" +
    flyerHtml(ev, image) +
    '<p class="share-when"><b>When:</b> ' + escText(when.page) + "</p>\n" +
    (where ? '<p class="share-where"><b>Where:</b> ' + escText(where) + "</p>\n" : "") +
    (ev.members_only ? '<p class="share-where">Members only. The street address stays in the Member Hub. Sign in to RSVP.</p>\n' : "") +
    (plain(ev.description) ? '<p class="share-desc">' + linkify(escHtml(String(ev.description).replace(/\r\n/g, "\n"))) + "</p>\n" : "") +
    '<div class="share-actions">' + ctaHtml(ev, now) + eventLinkHtml(ev) + "</div>\n" +
    shareButtonsHtml(ev.id, title) +
    moreLinksHtml(ev);
  const scripts = '<script src="/assets/kos-parade-rsvp.js?v=20261120rsvp2"></script>\n' +
    '<script type="module" src="/assets/kos-parade-rsvp-boot.js?v=20261120rsvp2"></script>\n';
  return pageDocument({
    title: title + " · " + SITE_NAME,
    description: description,
    canonical: canonical,
    head: head,
    body: body,
    scripts: scripts
  });
}

function renderUnavailablePage(kind) {
  const retry = kind === "try-again";
  const message = retry
    ? "We could not load that event just now. Please try again in a moment."
    : "This event is not available.";
  const body =
    "<h1>" + (retry ? "Please try again" : "Event not available") + "</h1>\n" +
    "<p>" + message + "</p>\n" +
    '<p class="share-more"><a class="btn btn-primary" href="/event-signup.html">See upcoming events</a></p>\n';
  return pageDocument({
    title: (retry ? "Try again" : "Event not available") + " · " + SITE_NAME,
    description: message,
    robots: "noindex",
    body: body
  });
}

module.exports = {
  SITE_ORIGIN: SITE_ORIGIN,
  SITE_NAME: SITE_NAME,
  DEFAULT_IMAGE: DEFAULT_IMAGE,
  PUBLIC_FIELDS: PUBLIC_FIELDS,
  publicEvent: publicEvent,
  isShareableEvent: isShareableEvent,
  eventUrl: eventUrl,
  facebookShareUrl: facebookShareUrl,
  MEMBERS_FACEBOOK_GROUP_URL: MEMBERS_FACEBOOK_GROUP_URL,
  ogDescription: ogDescription,
  ogImage: ogImage,
  signupClosed: signupClosed,
  shareButtonsHtml: shareButtonsHtml,
  renderEventSharePage: renderEventSharePage,
  renderUnavailablePage: renderUnavailablePage
};
