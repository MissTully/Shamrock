/* Member RSVP for the Hub.
   Public pages use the quiet guest link on event-signup.html instead of
   Going / Can't go. In the Hub, Going reuses rsvp_to_event (event_signups,
   guest headcount, Clovers). Can't go writes the same row with status
   cancelled, which Officer Desk already lists outside the headcount.
   Public pages never print a member phone, email, or street address. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.kosParadeRsvp = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ZEFFY_GUEST_URL = "https://www.zeffy.com/en-US/ticketing/kos-parade-guest-fee-2026--2027";
  var FEE_COPY = "Guests are $25 per guest. Immediate family or under 12 are $10. Guest fees are paid on Zeffy.";
  var ACTIVE = { registered: 1, confirmed: 1, attended: 1, waitlisted: 1 };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function safeHttp(url) {
    var value = String(url || "").trim();
    if (!/^https?:\/\//i.test(value)) return "";
    return value;
  }

  function signInHref(eventId) {
    var id = String(eventId || "").trim();
    var next = id ? "/events/" + id : "/parades.html";
    return "/members.html?next=" + encodeURIComponent(next);
  }

  function eventFrom(el, extra) {
    var ev = extra || {};
    if (!el) return ev;
    ev.id = ev.id || el.getAttribute("data-parade-id") || "";
    ev.name = ev.name || el.getAttribute("data-parade-name") || "";
    ev.start_time = ev.start_time || el.getAttribute("data-parade-start") || "";
    ev.end_time = ev.end_time || el.getAttribute("data-parade-end") || "";
    ev.registration_closes_at = ev.registration_closes_at || el.getAttribute("data-parade-closes") || "";
    if (ev.collect_guests == null) ev.collect_guests = el.getAttribute("data-collect-guests") !== "0";
    if (!ev.parade_rsvp_status) ev.parade_rsvp_status = el.getAttribute("data-parade-status") || "";
    if (ev.guests_count == null && el.getAttribute("data-parade-count")) {
      ev.guests_count = Number(el.getAttribute("data-parade-count"));
    }
    if (ev.guest_payment_url == null) ev.guest_payment_url = el.getAttribute("data-parade-pay") || "";
    if (!ev.event_type) ev.event_type = el.getAttribute("data-event-type") || "";
    if (ev.source == null) ev.source = el.getAttribute("data-event-source") || "";
    if (ev.ticket_payment_url == null) ev.ticket_payment_url = el.getAttribute("data-ticket-url") || "";
    if (ev.ticket_price_cents == null && el.getAttribute("data-ticket-cents")) {
      ev.ticket_price_cents = Number(el.getAttribute("data-ticket-cents"));
    }
    return ev;
  }

  // Guest count and the Zeffy guest fee stay on Krewe parades. Other events,
  // including IKC rows, use Going / Can't go without that fee block.
  // A slot with no type and no source is an older parade card.
  function paradeGuestUi(ev) {
    if (!ev || ev.collect_guests === false) return false;
    if (String(ev.source || "").toLowerCase() === "ikc") return false;
    var type = String(ev.event_type || "").toLowerCase();
    if (type && type !== "parade") return false;
    return true;
  }

  function priceText(cents) {
    var n = Number(cents);
    if (!isFinite(n) || n <= 0) return "";
    var dollars = n / 100;
    if (Math.abs(dollars - Math.round(dollars)) < 0.001) return "$" + String(Math.round(dollars));
    return "$" + dollars.toFixed(2);
  }

  function resolveTicketUrl(ev) {
    var direct = safeHttp(ev && ev.ticket_payment_url);
    if (direct) return direct;
    var ext = String((ev && ev.external_url) || "");
    if (/zeffy\.com/i.test(ext)) return safeHttp(ext);
    var n = String((ev && ev.name) || "").toLowerCase();
    var ball = n.indexOf("tartan ball") !== -1 && n.indexOf("basket") === -1 && n.indexOf("happy hour") === -1;
    if (ball) return safeHttp(ev.external_url) || "http://www.tampabaytartanball.com/home.html";
    return "";
  }

  function ticketInner(ev) {
    var url = resolveTicketUrl(ev);
    if (!url) return "";
    var price = priceText(ev && ev.ticket_price_cents);
    var label = "Buy tickets" + (price ? " (" + price + ")" : "");
    return '<a class="btn kos-pr-tickets" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>";
  }

  function hasStarted(ev) {
    if (!ev || !ev.start_time) return false;
    var start = new Date(ev.start_time);
    return !isNaN(start.getTime()) && start.getTime() <= Date.now();
  }

  function isClosed(ev) {
    if (typeof window !== "undefined" && window.kosCalendar && typeof window.kosCalendar.eventSignupClosed === "function") {
      return window.kosCalendar.eventSignupClosed(ev);
    }
    if (!ev) return true;
    if (hasStarted(ev)) return true;
    if (ev.end_time) {
      var end = new Date(ev.end_time);
      if (!isNaN(end.getTime()) && end.getTime() <= Date.now()) return true;
    }
    if (ev.registration_closes_at) {
      var closes = new Date(ev.registration_closes_at);
      if (!isNaN(closes.getTime()) && Date.now() >= closes.getTime()) return true;
    }
    return false;
  }

  function statusOf(ev) {
    var st = String((ev && (ev.parade_rsvp_status || ev.rsvp_status)) || "").toLowerCase();
    if (!st && ev && (ev.parade_rsvpd || ev.rsvpd)) st = "registered";
    return st;
  }

  function going(ev) {
    return !!ACTIVE[statusOf(ev)];
  }

  function cantGo(ev) {
    var st = statusOf(ev);
    return st === "cancelled" || st === "canceled";
  }

  function guestCount(ev) {
    var n = Number(ev && ev.guests_count);
    if (!isFinite(n) || n < 0) n = 0;
    if (n > 20) n = 20;
    return Math.floor(n);
  }

  function payUrl(ev) {
    return safeHttp(ev && ev.guest_payment_url) || ZEFFY_GUEST_URL;
  }

  function signInInner(eventId, ev) {
    return '<div class="kos-pr-actions">' +
      '<a class="btn btn-primary" href="' + esc(signInHref(eventId)) + '">Sign in to RSVP</a>' +
      ticketInner(ev) +
      "</div>";
  }

  function closedInner(ev) {
    var parade = paradeGuestUi(ev);
    var line = hasStarted(ev)
      ? (parade
        ? "Registration is closed. This parade has already started."
        : "Registration is closed. This event has already started.")
      : "Registration is closed.";
    var yours = "";
    if (going(ev)) yours = " Your RSVP: You're going.";
    else if (cantGo(ev)) yours = " Your RSVP: Can't go.";
    return '<p class="kos-pr-closed">' + esc(line + yours) + "</p>" + ticketInner(ev);
  }

  function controlsInner(ev) {
    var onGoing = going(ev);
    var onCant = cantGo(ev);
    var parade = paradeGuestUi(ev);
    var fresh = parade ? "Tell the krewe if you can march." : "Tell the krewe if you can come.";
    var state = onGoing ? "You're going." : (onCant ? "Can't go." : fresh);
    var guests = "";
    if (parade && !onCant) {
      guests =
        '<div class="kos-pr-guests">' +
        '<label>Guests you\'re bringing' +
        '<input class="kos-pr-count" type="number" min="0" max="20" inputmode="numeric" value="' + guestCount(ev) + '" aria-label="Guests you are bringing">' +
        "</label>" +
        '<p class="kos-pr-fee">' + esc(FEE_COPY) + "</p>" +
        '<a class="kos-pr-pay" href="' + esc(payUrl(ev)) + '" target="_blank" rel="noopener noreferrer">Pay guest fees on Zeffy</a>' +
        "</div>";
    }
    return '<div class="kos-pr-actions">' +
      '<button type="button" class="btn btn-primary kos-pr-going" aria-pressed="' + (onGoing ? "true" : "false") + '">Going</button>' +
      '<button type="button" class="btn kos-pr-cant" aria-pressed="' + (onCant ? "true" : "false") + '">Can\'t go</button>' +
      ticketInner(ev) +
      "</div>" +
      '<p class="kos-pr-state">' + esc(state) + "</p>" +
      guests +
      '<p class="kos-pr-msg" role="status"></p>';
  }

  function slotHtml(ev, options) {
    ev = ev || {};
    var id = String(ev.id || "").trim();
    if (!id) return "";
    var signedIn = !!(options && options.signedIn);
    var closed = isClosed(ev);
    var ticket = resolveTicketUrl(ev);
    var inner = closed ? closedInner(ev) : (signedIn ? controlsInner(ev) : signInInner(id, ev));
    var count = ev.guests_count == null ? "" : String(guestCount(ev));
    var cents = ev.ticket_price_cents == null || ev.ticket_price_cents === "" ? "" : String(ev.ticket_price_cents);
    var hubClass = signedIn ? " kos-pr-hub" : "";
    return '<div class="kos-parade-rsvp' + hubClass + '" data-parade-id="' + esc(id) + '"' +
      ' data-parade-name="' + esc(ev.name || "") + '"' +
      ' data-parade-start="' + esc(ev.start_time || "") + '"' +
      ' data-parade-end="' + esc(ev.end_time || "") + '"' +
      ' data-parade-closes="' + esc(ev.registration_closes_at || "") + '"' +
      ' data-parade-status="' + esc(statusOf(ev)) + '"' +
      ' data-parade-count="' + esc(count) + '"' +
      ' data-event-type="' + esc(ev.event_type || "") + '"' +
      ' data-event-source="' + esc(ev.source || "") + '"' +
      ' data-collect-guests="' + (paradeGuestUi(ev) ? "1" : "0") + '"' +
      ' data-parade-pay="' + esc(safeHttp(ev.guest_payment_url) || "") + '"' +
      ' data-ticket-url="' + esc(ticket) + '"' +
      ' data-ticket-cents="' + esc(cents) + '">' +
      inner + "</div>";
  }

  function fallbackHtml(ev) {
    return slotHtml(ev, { signedIn: false });
  }

  var cssReady = false;
  function ensureCss() {
    if (cssReady || typeof document === "undefined") return;
    if (document.getElementById("kosParadeRsvpCss")) { cssReady = true; return; }
    var style = document.createElement("style");
    style.id = "kosParadeRsvpCss";
    style.textContent = [
      ".kos-parade-rsvp{box-sizing:border-box;max-width:100%;margin:12px 0 4px;color:#23291f;}",
      ".kos-parade-rsvp *{box-sizing:border-box;}",
      ".kos-parade-rsvp .kos-pr-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}",
      "#kcal-list .kos-parade-rsvp,#ikcRsvpList .kos-parade-rsvp{background:#fffdf8;color:#23291f;border-radius:12px;padding:10px 12px;}",
      ".kos-parade-rsvp .btn,.kos-parade-rsvp button,.kos-parade-rsvp a.btn{min-height:44px;}",
      ".kos-parade-rsvp button[aria-pressed='true']{outline:2px solid #14532d;outline-offset:1px;}",
      ".kos-parade-rsvp .kos-pr-state,.kos-parade-rsvp .kos-pr-fee,.kos-parade-rsvp .kos-pr-msg,.kos-parade-rsvp .kos-pr-closed{margin:8px 0 0;font-size:16px;line-height:1.45;overflow-wrap:anywhere;}",
      ".kos-parade-rsvp .kos-pr-guests label{display:flex;flex-direction:column;gap:6px;font-weight:700;margin:10px 0 0;max-width:100%;}",
      ".kos-parade-rsvp input{width:6.5rem;max-width:100%;min-height:44px;font-size:16px;padding:8px 10px;border:1px solid rgba(168,128,28,.55);border-radius:10px;background:#fff;}",
      ".kos-parade-rsvp a.kos-pr-pay,.kos-parade-rsvp a.kos-pr-pay:visited,.kos-parade-rsvp a.kos-pr-pay:hover{display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:8px;padding:8px 16px;border-radius:999px;background:#14532d;color:#fffaf0;font-weight:700;text-decoration:none;}",
      ".kos-parade-rsvp a.kos-pr-tickets{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;border-radius:999px;border:2px solid #8a6a12;background:#fffdf8;color:#14532d;font-weight:700;text-decoration:none;}",
      "body.hub-app .kos-parade-rsvp,#appNextUp .kos-parade-rsvp{background:#fffdf8;color:#23291f;border-radius:12px;padding:10px 12px;}",
      ".hub-event-row .kos-parade-rsvp,.hub-ev-detail .kos-parade-rsvp,.app-detail .kos-parade-rsvp,.cup-event .kos-parade-rsvp,.hub-home-parade .kos-parade-rsvp,.hub-krewe-parade .kos-parade-rsvp,#appNextUp .kos-parade-rsvp{flex:1 1 100%;width:100%;}",
      ".kos-pr-hub .kos-pr-actions .btn,.kos-pr-hub .kos-pr-actions button,.kos-pr-hub .kos-pr-actions a.btn,.kos-pr-hub a.kos-pr-tickets{width:auto;flex:0 0 auto;min-height:44px;padding:8px 14px;font-size:15px;}"
    ].join("");
    document.head.appendChild(style);
    cssReady = true;
  }

  function setMsg(el, text) {
    var msg = el.querySelector(".kos-pr-msg");
    if (msg) msg.textContent = text || "";
  }

  function readCount(el) {
    var input = el.querySelector(".kos-pr-count");
    var n = input ? Number(input.value) : 0;
    if (!isFinite(n) || n < 0) n = 0;
    if (n > 20) n = 20;
    return Math.floor(n);
  }

  function remember(el, status, guests) {
    el.setAttribute("data-parade-status", status || "");
    el.setAttribute("data-parade-count", String(guests == null ? 0 : guests));
  }

  function paint(el) {
    var ev = eventFrom(el);
    el.innerHTML = isClosed(ev) ? closedInner(ev) : controlsInner(ev);
  }

  function profileReady(profile) {
    return !!(profile && profile.email && profile.last_name && profile.first_name);
  }

  function clientOf(options) {
    if (options && options.client) return options.client;
    if (typeof window !== "undefined") return window.__kosSb || null;
    return null;
  }

  function knownProfile(options) {
    if (options && options.profile && options.profile.email) return options.profile;
    if (typeof window !== "undefined" && window.kosProfile && window.kosProfile.email) return window.kosProfile;
    return null;
  }

  function loadProfile(client, options) {
    var known = knownProfile(options);
    if (known && known.member_id && known.first_name && known.last_name) return Promise.resolve(known);
    if (!client || !client.auth || typeof client.auth.getSession !== "function") {
      return Promise.resolve(known);
    }
    return client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session) return null;
      if (!client.rpc) return known;
      return client.rpc("get_my_krewe_profile").then(function (out) {
        var data = out && out.data;
        if (data && data.email) {
          if (typeof window !== "undefined") window.kosProfile = Object.assign({}, window.kosProfile || {}, data);
          return data;
        }
        return known;
      }).catch(function () { return known; });
    }).catch(function () { return known; });
  }

  function isUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
  }

  function refreshSignup(el, client, profile) {
    if (!client || !profile || !profile.member_id || typeof client.from !== "function") return Promise.resolve();
    var id = el.getAttribute("data-parade-id");
    if (!isUuid(id) || !isUuid(profile.member_id)) return Promise.resolve();
    return client.from("event_signups").select("status,guests_count").eq("event_id", id).eq("member_id", profile.member_id).maybeSingle().then(function (res) {
      if (!res || res.error || !res.data) return;
      remember(el, res.data.status || "", res.data.guests_count || 0);
      paint(el);
      return true;
    }).catch(function () {});
  }

  function refreshPay(el, client) {
    if (!client || typeof client.from !== "function") return Promise.resolve();
    var id = el.getAttribute("data-parade-id");
    if (!isUuid(id)) return Promise.resolve();
    return client.from("events").select("guest_payment_url").eq("id", id).maybeSingle().then(function (res) {
      var url = res && res.data && safeHttp(res.data.guest_payment_url);
      if (!url) return;
      el.setAttribute("data-parade-pay", url);
      var link = el.querySelector(".kos-pr-pay");
      if (link) link.setAttribute("href", url);
    }).catch(function () {});
  }

  function notify(options, info) {
    if (options && typeof options.onSaved === "function") {
      try { options.onSaved(info); } catch (err) {}
    }
  }

  function saveGoing(el, options, profile) {
    var client = clientOf(options);
    var ev = eventFrom(el);
    if (isClosed(ev)) {
      setMsg(el, paradeGuestUi(ev)
        ? "Registration is closed. This parade has already started."
        : "Registration is closed. This event has already started.");
      return;
    }
    if (!client || typeof client.rpc !== "function") {
      setMsg(el, "RSVP needs a connection. Sign in and try again.");
      return;
    }
    if (!profileReady(profile)) {
      setMsg(el, "Your profile needs a first name, last name, and email before you can RSVP.");
      return;
    }
    var guests = paradeGuestUi(ev) ? readCount(el) : 0;
    var goingBtn = el.querySelector(".kos-pr-going");
    if (goingBtn) { goingBtn.disabled = true; goingBtn.textContent = "Saving..."; }
    client.rpc("rsvp_to_event", {
      p_event_id: ev.id,
      p_first_name: profile.first_name,
      p_last_name: profile.last_name,
      p_email: profile.email,
      p_guests_count: guests,
      p_signup_role: "attendee"
    }).then(function (res) {
      if (res && res.error) throw res.error;
      if (res && res.data && res.data.ok === false) throw new Error(res.data.message || "Could not RSVP.");
      var status = (res && res.data && res.data.status) || "registered";
      remember(el, status, guests);
      paint(el);
      wire(el, options, profile);
      var message = (res && res.data && res.data.message) || "You're signed up.";
      var clovers = Number(res && res.data && res.data.clovers_awarded) || 0;
      if (clovers > 0) message += " +" + clovers + " Clovers.";
      setMsg(el, message);
      notify(options, { eventId: ev.id, status: status, guests: guests, message: message });
    }).catch(function (err) {
      paint(el);
      wire(el, options, profile);
      setMsg(el, (err && err.message) || "Could not RSVP. Try again.");
    });
  }

  function saveCant(el, options, profile) {
    var client = clientOf(options);
    var ev = eventFrom(el);
    if (isClosed(ev)) {
      setMsg(el, paradeGuestUi(ev)
        ? "Registration is closed. This parade has already started."
        : "Registration is closed. This event has already started.");
      return;
    }
    if (!client || typeof client.from !== "function") {
      setMsg(el, "RSVP needs a connection. Sign in and try again.");
      return;
    }
    if (!profile || !profile.member_id) {
      setMsg(el, "Can't go needs the member record on your profile.");
      return;
    }
    var cantBtn = el.querySelector(".kos-pr-cant");
    if (cantBtn) { cantBtn.disabled = true; cantBtn.textContent = "Saving..."; }
    var row = {
      event_id: ev.id,
      member_id: profile.member_id,
      signup_role: "attendee",
      status: "cancelled",
      guests_count: 0,
      notes: "Can't go"
    };
    client.from("event_signups").upsert(row, { onConflict: "event_id,member_id" }).then(function (res) {
      if (res && res.error) throw res.error;
      remember(el, "cancelled", 0);
      paint(el);
      wire(el, options, profile);
      setMsg(el, "You're marked as can't go.");
      notify(options, { eventId: ev.id, status: "cancelled", guests: 0, message: "You're marked as can't go." });
    }).catch(function (err) {
      paint(el);
      wire(el, options, profile);
      setMsg(el, (err && err.message) || "Could not save that RSVP.");
    });
  }

  function wire(el, options, profile) {
    var goingBtn = el.querySelector(".kos-pr-going");
    var cantBtn = el.querySelector(".kos-pr-cant");
    if (goingBtn) goingBtn.addEventListener("click", function () { saveGoing(el, options, profile); });
    if (cantBtn) cantBtn.addEventListener("click", function () { saveCant(el, options, profile); });
  }

  function mount(el, options) {
    if (!el) return;
    if (el.getAttribute("data-wired") === "1" && !(options && options.force)) return;
    el.setAttribute("data-wired", "1");
    ensureCss();
    options = options || {};
    var publicPage = !!options.publicPage || el.getAttribute("data-public-rsvp") === "1";
    if (publicPage && !options.profile) {
      loadProfile(clientOf(options), options).then(function (profile) {
        if (!profile || !profile.email) return;
        paint(el);
        wire(el, options, profile);
        refreshSignup(el, clientOf(options), profile).then(function (changed) {
          if (changed) wire(el, options, profile);
        });
        refreshPay(el, clientOf(options));
      });
      return;
    }
    if (publicPage && options.profile) {
      paint(el);
      wire(el, options, options.profile);
      refreshPay(el, clientOf(options));
      return;
    }
    paint(el);
    var profile = knownProfile(options);
    wire(el, options, profile);
    loadProfile(clientOf(options), options).then(function (loaded) {
      if (!loaded) return;
      refreshSignup(el, clientOf(options), loaded).then(function (changed) {
        if (changed) wire(el, options, loaded);
      });
      refreshPay(el, clientOf(options));
    });
  }

  function mountAll(root, options) {
    if (typeof document === "undefined") return;
    var scope = root && root.querySelectorAll ? root : document;
    var nodes = scope.querySelectorAll ? scope.querySelectorAll(".kos-parade-rsvp") : [];
    for (var i = 0; i < nodes.length; i++) mount(nodes[i], options);
  }

  return {
    ZEFFY_GUEST_URL: ZEFFY_GUEST_URL,
    FEE_COPY: FEE_COPY,
    signInHref: signInHref,
    slotHtml: slotHtml,
    fallbackHtml: fallbackHtml,
    mount: mount,
    mountAll: mountAll
  };
});
