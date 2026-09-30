/* Personal calendar (.ics) downloads for Hub cards and RSVP confirm.
   LOCATION is always the public teaser. Never write member_address or
   meeting_url into a file someone might forward.
   Times are America/New_York wall clocks so phones open the right hour. */
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

  function publicDescription(ev) {
    var bits = [];
    if (ev && ev.description) bits.push(String(ev.description).trim());
    bits.push("Krewe of Shamrock. Full staging and member details stay in the Member Hub.");
    return bits.filter(Boolean).join(" ");
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
    var start = nyStamp(ev.start_time);
    if (!start) return "";
    var end = nyStamp(ev.end_time);
    if (!end) {
      var plus = new Date(ev.start_time);
      if (!isNaN(plus.getTime())) {
        plus.setTime(plus.getTime() + 2 * 60 * 60 * 1000);
        end = nyStamp(plus);
      } else {
        end = start;
      }
    }
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
    var loc = teaserLocation(ev);
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

  /* What the public RSVP button and the signup dropdown should do.
     hide: draft, cancelled, past, or not a real listing.
     ikc: host-krewe link, not our signup form.
     parade / parade-members: no public march RSVP.
     members, closed, tickets, tickets-soon, rsvp: same choice on the
     homepage button and the event signup dropdown. */
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
    teaserLocation: teaserLocation,
    ticketCheckoutUrl: ticketCheckoutUrl,
    publicSignupAction: publicSignupAction,
    signupDropdownAction: signupDropdownAction
  };
})();
