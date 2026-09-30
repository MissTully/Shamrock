/* Personal calendar saves for Hub cards and RSVP confirm: an .ics download
   (Apple Calendar, Outlook desktop, most phones) plus Google Calendar and
   Outlook web links, offered together by choose().
   The .ics file uses America/New_York wall time so phones open the right hour.
   Google and Outlook web links stay in UTC, which those sites convert.
   LOCATION is the public teaser by default. The Member Hub (signed-in
   members only) passes include_member_address so the member's own calendar
   gets the full street address. Public pages never pass it, and meeting_url
   is never written into a file or link. */
(function () {
  "use strict";

  var TZ = "America/New_York";

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function icsEscape(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function toUtcStamp(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z";
  }

  function nyStamp(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(d);
    function pick(type) {
      var part = null;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === type) part = parts[i];
      }
      return part ? part.value : "00";
    }
    var hour = pick("hour");
    if (hour === "24") hour = "00";
    return pick("year") + pick("month") + pick("day") + "T" + hour + pick("minute") + pick("second");
  }

  function foldLine(line) {
    var out = "";
    var rest = String(line || "");
    while (rest.length > 74) {
      out += rest.slice(0, 74) + "\r\n ";
      rest = rest.slice(74);
    }
    return out + rest;
  }

  function teaserLocation(ev) {
    if (!ev) return "";
    var loc = ev.location != null ? String(ev.location).trim() : "";
    if (ev.member_address && loc && loc === String(ev.member_address).trim()) return "";
    return loc;
  }

  function memberAddress(ev) {
    if (!ev || !ev.include_member_address || !ev.member_address) return "";
    return String(ev.member_address).trim();
  }

  function calendarLocation(ev) {
    return memberAddress(ev) || teaserLocation(ev);
  }

  function publicDescription(ev) {
    var bits = [];
    if (ev && ev.description) bits.push(String(ev.description).trim());
    if (memberAddress(ev)) {
      bits.push("Krewe of Shamrock. The address is for members only; please do not share it.");
    } else {
      bits.push("Krewe of Shamrock. Full staging and member details stay in the Member Hub.");
    }
    return bits.filter(Boolean).join(" ");
  }

  function eventRange(ev) {
    var start = new Date(ev && ev.start_time);
    if (!ev || !ev.start_time || isNaN(start.getTime())) return null;
    var end = ev.end_time ? new Date(ev.end_time) : null;
    if (!end || isNaN(end.getTime())) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return { start: start, end: end };
  }

  function vtimezone() {
    return [
      "BEGIN:VTIMEZONE",
      "TZID:" + TZ,
      "X-LIC-LOCATION:" + TZ,
      "BEGIN:DAYLIGHT",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0400",
      "TZNAME:EDT",
      "DTSTART:19700308T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "TZOFFSETFROM:-0400",
      "TZOFFSETTO:-0500",
      "TZNAME:EST",
      "DTSTART:19701101T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
      "END:STANDARD",
      "END:VTIMEZONE"
    ];
  }

  function buildIcs(ev) {
    ev = ev || {};
    var range = eventRange(ev);
    if (!range) return "";
    var start = nyStamp(range.start);
    var end = nyStamp(range.end);
    if (!start || !end) return "";
    var uid = String(ev.uid || ev.id || ("kos-" + start)).replace(/[^a-zA-Z0-9@._-]/g, "") + "@kreweofshamrock.com";
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Krewe of Shamrock//Member Hub//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ].concat(vtimezone()).concat([
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + toUtcStamp(new Date()),
      "DTSTART;TZID=" + TZ + ":" + start,
      "DTEND;TZID=" + TZ + ":" + end,
      "SUMMARY:" + icsEscape(ev.name || "Krewe of Shamrock event")
    ]);
    var loc = calendarLocation(ev);
    if (loc) lines.push("LOCATION:" + icsEscape(loc));
    lines.push("DESCRIPTION:" + icsEscape(publicDescription(ev)));
    lines.push("END:VEVENT");
    lines.push("END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  function filename(ev) {
    var base = String((ev && ev.name) || "krewe-event")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "krewe-event";
    return base + ".ics";
  }

  function download(ev) {
    var body = buildIcs(ev);
    if (!body) return false;
    var blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var ua = (navigator && navigator.userAgent) || "";
    var platform = (navigator && navigator.platform) || "";
    var ios = /iP(ad|hone|od)/.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      window.location.assign(url);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    }
    var a = document.createElement("a");
    a.href = url;
    a.download = filename(ev);
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    return true;
  }

  function query(params) {
    return Object.keys(params).filter(function (k) {
      return params[k];
    }).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
  }

  function googleUrl(ev) {
    var range = eventRange(ev);
    if (!range) return "";
    return "https://calendar.google.com/calendar/render?" + query({
      action: "TEMPLATE",
      text: (ev && ev.name) || "Krewe of Shamrock event",
      dates: toUtcStamp(range.start) + "/" + toUtcStamp(range.end),
      details: publicDescription(ev),
      location: calendarLocation(ev)
    });
  }

  function outlookUrl(ev, host) {
    var range = eventRange(ev);
    if (!range) return "";
    return "https://" + (host || "outlook.live.com") + "/calendar/0/action/compose?" + query({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: (ev && ev.name) || "Krewe of Shamrock event",
      startdt: range.start.toISOString(),
      enddt: range.end.toISOString(),
      body: publicDescription(ev),
      location: calendarLocation(ev)
    });
  }

  function links(ev) {
    return {
      google: googleUrl(ev),
      outlook: outlookUrl(ev, "outlook.live.com"),
      office365: outlookUrl(ev, "outlook.office.com")
    };
  }

  var CHOOSER_CSS =
    ".kos-cal-back{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;" +
    "padding:16px;background:rgba(4,16,10,.62);}" +
    ".kos-cal-back .kos-cal-card{width:min(400px,100%);max-height:88vh;overflow:auto;margin:0;background:#fbf7ec;color:#23291f;" +
    "border:1px solid rgba(168,128,28,.55);border-radius:20px;padding:16px 16px 18px;box-shadow:0 18px 50px rgba(0,0,0,.35);" +
    "font-family:inherit;text-align:left;}" +
    ".kos-cal-back .kos-cal-card h2{margin:0 0 4px;font-size:20px;line-height:1.25;color:#14532d;}" +
    ".kos-cal-back .kos-cal-card .kos-cal-sub{margin:0 0 12px;font-size:14px;color:#5f6b5a;}" +
    ".kos-cal-opt{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;min-height:52px;" +
    "margin:0 0 8px;padding:10px 14px;border-radius:14px;border:1px solid rgba(168,128,28,.45);background:#fff;" +
    "color:#14532d;font:inherit;font-weight:700;font-size:16px;text-decoration:none;text-align:left;cursor:pointer;}" +
    ".kos-cal-back a.kos-cal-opt,.kos-cal-back a.kos-cal-opt:link,.kos-cal-back a.kos-cal-opt:visited{color:#14532d;text-decoration:none;}" +
    ".kos-cal-opt:hover,.kos-cal-opt:focus-visible{background:#fff6d6;outline:2px solid #e2c15a;outline-offset:1px;}" +
    ".kos-cal-opt small{display:block;font-weight:400;font-size:13px;color:#5f6b5a;}" +
    ".kos-cal-ic{flex:none;width:28px;text-align:center;font-size:22px;}" +
    ".kos-cal-note{margin:4px 0 12px;font-size:13px;color:#5f6b5a;}" +
    ".kos-cal-close{display:block;width:100%;min-height:44px;border-radius:999px;border:0;background:#14532d;" +
    "color:#fff;font:inherit;font-weight:700;cursor:pointer;}";

  function ensureStyles() {
    if (document.getElementById("kosCalStyles")) return;
    var style = document.createElement("style");
    style.id = "kosCalStyles";
    style.textContent = CHOOSER_CSS;
    document.head.appendChild(style);
  }

  function htmlEscape(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function option(icon, label, hint, attrs) {
    return '<' + (attrs.href ? "a" : "button") +
      ' class="kos-cal-opt"' +
      (attrs.href ? ' href="' + htmlEscape(attrs.href) + '" target="_blank" rel="noopener"' : ' type="button"') +
      (attrs.data ? " " + attrs.data : "") + ">" +
      '<span class="kos-cal-ic" aria-hidden="true">' + icon + "</span>" +
      "<span>" + htmlEscape(label) + "<small>" + htmlEscape(hint) + "</small></span>" +
      "</" + (attrs.href ? "a" : "button") + ">";
  }

  function choose(ev) {
    if (!eventRange(ev)) return false;
    var old = document.getElementById("kosCalChooser");
    if (old) old.remove();
    ensureStyles();
    var urls = links(ev);
    var opener = document.activeElement;
    var back = document.createElement("div");
    back.className = "kos-cal-back";
    back.id = "kosCalChooser";
    back.innerHTML =
      '<div class="kos-cal-card" role="dialog" aria-modal="true" aria-labelledby="kosCalTitle">' +
      '<h2 id="kosCalTitle">Add to my calendar</h2>' +
      '<p class="kos-cal-sub">' + htmlEscape((ev && ev.name) || "Krewe of Shamrock event") + "</p>" +
      option("🟦", "Google Calendar", "Opens Google Calendar in a new tab", { href: urls.google }) +
      option("📧", "Outlook.com", "Personal Outlook, Hotmail, or Live accounts", { href: urls.outlook }) +
      option("💼", "Outlook for work or school", "Microsoft 365 accounts", { href: urls.office365 }) +
      option("📅", "Apple Calendar or other", "Downloads a calendar file (.ics); also works for the Outlook desktop app", { data: "data-kos-cal-ics" }) +
      '<p class="kos-cal-note">' + (memberAddress(ev)
        ? "Your calendar gets the full member address. Please keep it within the krewe."
        : "Your calendar gets the public location only. Member-only addresses stay in the Member Hub.") + "</p>" +
      '<button type="button" class="kos-cal-close" data-kos-cal-close>Close</button>' +
      "</div>";

    function close() {
      document.removeEventListener("keydown", onKey);
      back.remove();
      if (opener && typeof opener.focus === "function") opener.focus();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    back.addEventListener("click", function (e) {
      if (e.target === back || (e.target.closest && e.target.closest("[data-kos-cal-close]"))) {
        close();
        return;
      }
      if (e.target.closest && e.target.closest("[data-kos-cal-ics]")) {
        download(ev);
        close();
        return;
      }
      if (e.target.closest && e.target.closest("a.kos-cal-opt")) setTimeout(close, 0);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    var first = back.querySelector(".kos-cal-opt");
    if (first) first.focus();
    return true;
  }

  function ticketCheckoutUrl(ev) {
    if (!ev) return "";
    var n = String(ev.name || "").toLowerCase();
    var isBall = n.indexOf("tartan ball") !== -1 && n.indexOf("basket") === -1 && n.indexOf("happy hour") === -1;
    if (isBall) return ev.ticket_payment_url || ev.external_url || "http://www.tampabaytartanball.com/home.html";
    if (ev.ticket_payment_url) return ev.ticket_payment_url;
    var ext = String(ev.external_url || "").toLowerCase();
    if (ext.indexOf("zeffy.com") !== -1) return ev.external_url;
    return "";
  }

  function publicSignupAction(ev, now) {
    now = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    if (!ev) return "hide";
    var status = String(ev.status || "").toLowerCase();
    if (status !== "published" && status !== "live") return "hide";
    var start = ev.start_time ? new Date(ev.start_time) : null;
    if (!start || isNaN(start.getTime())) return "hide";
    var end = ev.end_time ? new Date(ev.end_time) : null;
    var stillOn = end && !isNaN(end.getTime()) ? end.getTime() >= now.getTime() : start.getTime() >= now.getTime();
    if (!stillOn) return "hide";
    if (String(ev.source || "").toLowerCase() === "ikc") return "ikc";
    if (String(ev.event_type || "").toLowerCase() === "parade") {
      return ev.members_only ? "parade-members" : "parade";
    }
    if (ev.members_only) return "members";
    if (ev.registration_closes_at) {
      var closes = new Date(ev.registration_closes_at);
      if (!isNaN(closes.getTime()) && now.getTime() >= closes.getTime()) return "closed";
    }
    if (ticketCheckoutUrl(ev)) return "tickets";
    if (Number(ev.ticket_price_cents || 0) > 0) return "tickets-soon";
    return "rsvp";
  }

  function signupDropdownAction(action) {
    return action === "members" || action === "closed" || action === "tickets" ||
      action === "tickets-soon" || action === "rsvp";
  }

  window.kosCalendar = {
    buildIcs: buildIcs,
    download: download,
    googleUrl: googleUrl,
    outlookUrl: outlookUrl,
    links: links,
    choose: choose,
    teaserLocation: teaserLocation,
    calendarLocation: calendarLocation,
    ticketCheckoutUrl: ticketCheckoutUrl,
    publicSignupAction: publicSignupAction,
    signupDropdownAction: signupDropdownAction
  };
})();
