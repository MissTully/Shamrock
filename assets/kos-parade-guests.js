/* Public guest-march registration for parades.html. */
(function (global) {
  "use strict";

  var WAIVER_HREF = "assets/docs/liability-waiver.html";
  var events = [];
  var client = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function $(id) { return document.getElementById(id); }

  function formatWhen(ev) {
    if (!ev || !ev.start_time) return "Date to be announced";
    var d = new Date(ev.start_time);
    if (isNaN(d.getTime())) return "Date to be announced";
    var opts = { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" };
    var start = d.toLocaleString("en-US", opts);
    if (ev.end_time) {
      var e = new Date(ev.end_time);
      if (!isNaN(e.getTime())) {
        return start + " to " + e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
      }
    }
    return start;
  }

  function feeSummary(ev) {
    if (!ev) return "";
    var fam = ev.guest_fee_family_label;
    var std = ev.guest_fee_label;
    if (fam && std && fam !== std) {
      return "Immediate family or under 12: " + fam + ". Others: " + std + ".";
    }
    if (std) return "Guest fee: " + std + ".";
    if (fam) return "Guest fee: " + fam + ".";
    return "The guest fee will be confirmed after the inviting member approves.";
  }

  function selectedEvent() {
    var sel = $("pgParade");
    if (!sel || !sel.value) return null;
    for (var i = 0; i < events.length; i++) {
      if (String(events[i].id) === String(sel.value)) return events[i];
    }
    return null;
  }

  function syncParadeDetails() {
    var ev = selectedEvent();
    var details = $("pgParadeDetails");
    var ageWrap = $("pgAge21Wrap");
    var tierWrap = $("pgTierWrap");
    var fullNote = $("pgFullNote");
    var submit = $("pgSubmit");
    var fields = $("pgFields");
    if (details) {
      if (!ev) {
        details.hidden = true;
        details.innerHTML = "";
      } else {
        details.hidden = false;
        details.innerHTML =
          "<p><b>" + esc(ev.name) + "</b> · " + esc(formatWhen(ev)) +
          (ev.location ? " · " + esc(ev.location) : "") + "</p>" +
          "<p>" + esc(feeSummary(ev)) + "</p>" +
          (ev.is_full
            ? ""
            : "<p>Guest spots: " + esc(String(ev.spots_taken || 0)) + " of " + esc(String(ev.guest_capacity || 0)) + " filled.</p>");
      }
    }
    var full = !!(ev && ev.is_full);
    if (fullNote) {
      fullNote.hidden = !full;
      fullNote.textContent = full ? "All guest spots for this parade are filled." : "";
    }
    if (fields) fields.hidden = !ev || full;
    if (ageWrap) {
      var need21 = !!(ev && ev.guest_requires_21 && !full);
      ageWrap.hidden = !need21;
      if (!need21) {
        var age = $("pgAge21");
        if (age) age.checked = false;
      }
    }
    if (tierWrap) {
      var showTier = !!(ev && ev.guest_fee_family_cents != null && ev.guest_fee_family_label && ev.guest_fee_label && ev.guest_fee_family_label !== ev.guest_fee_label && !full);
      tierWrap.hidden = !showTier;
    }
    if (submit) submit.disabled = !ev || full;
  }

  function renderEvents(list) {
    events = Array.isArray(list) ? list : [];
    var sel = $("pgParade");
    var empty = $("pgEmpty");
    var form = $("pgForm");
    if (!sel) return;
    var prev = sel.value;
    var html = '<option value="">Choose a parade</option>';
    events.forEach(function (ev) {
      var label = ev.name || "Parade";
      if (ev.is_full) label += " (filled)";
      html += '<option value="' + esc(ev.id) + '"' + (ev.is_full ? ' data-full="1"' : "") + ">" + esc(label) + "</option>";
    });
    sel.innerHTML = html;
    if (prev) sel.value = prev;
    if (empty) {
      if (!events.length) {
        empty.hidden = false;
        empty.textContent = "Guest registration will open once officers set guest march spots for a parade in Event Studio.";
        if (form) form.hidden = true;
      } else {
        empty.hidden = true;
        if (form) form.hidden = false;
      }
    }
    syncParadeDetails();
  }

  function val(id) {
    var el = $(id);
    return el ? el.value.trim() : "";
  }

  function checked(id) {
    var el = $(id);
    return !!(el && el.checked);
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    var msg = $("pgMsg");
    var parade = selectedEvent();
    if (!parade) {
      if (msg) msg.textContent = "Please choose a parade.";
      return;
    }
    if (parade.is_full) {
      if (msg) msg.textContent = "All guest spots for this parade are filled.";
      return;
    }
    if (!val("pgFirst") || !val("pgLast")) {
      if (msg) msg.textContent = "Please enter your first and last name.";
      return;
    }
    if (!val("pgEmail") || val("pgEmail").indexOf("@") === -1) {
      if (msg) msg.textContent = "Please enter a valid email address.";
      return;
    }
    if (!val("pgSponsorEmail") || val("pgSponsorEmail").indexOf("@") === -1) {
      if (msg) msg.textContent = "Please enter the inviting member's email.";
      return;
    }
    if (val("pgEmail").toLowerCase() === val("pgSponsorEmail").toLowerCase()) {
      if (msg) msg.textContent = "A member cannot register as their own guest. Use the inviting member's email, not yours.";
      return;
    }
    if (parade.guest_requires_21 && !checked("pgAge21")) {
      if (msg) msg.textContent = "Guests for this parade must confirm they are 21 or older.";
      return;
    }
    if (!checked("pgWaiver")) {
      if (msg) msg.textContent = "Please accept the liability waiver to continue.";
      return;
    }
    if (!val("pgWaiverName")) {
      if (msg) msg.textContent = "Please type your name to sign the liability waiver.";
      return;
    }
    var payload = {
      event_id: parade.id,
      first_name: val("pgFirst"),
      last_name: val("pgLast"),
      email: val("pgEmail"),
      phone: val("pgPhone") || null,
      sponsor_first_name: val("pgSponsorFirst") || null,
      sponsor_last_name: val("pgSponsorLast") || null,
      sponsor_email: val("pgSponsorEmail"),
      relationship: (function () {
        var r = document.querySelector('input[name="pgTier"]:checked');
        return r ? r.value : null;
      })(),
      is_under_12: checked("pgUnder12"),
      age_attested_21: checked("pgAge21"),
      waiver_accepted: true,
      waiver_name: val("pgWaiverName")
    };
    var submit = $("pgSubmit");
    if (submit) { submit.disabled = true; submit.textContent = "Sending…"; }
    if (msg) msg.textContent = "";
    try {
      var result;
      if (typeof global.__kosParadeGuestSubmit === "function") {
        result = await global.__kosParadeGuestSubmit(payload);
      } else if (client && typeof client.rpc === "function") {
        var res = await client.rpc("register_parade_guest", { p: payload });
        if (res.error) throw res.error;
        result = res.data || {};
      } else {
        throw new Error("Registration is not available right now.");
      }
      if (result && result.ok === false) {
        if (msg) msg.textContent = result.message || "Could not submit that registration.";
        if (result.code === "full") {
          parade.is_full = true;
          parade.spots_left = 0;
          renderEvents(events);
          var sel = $("pgParade");
          if (sel) sel.value = parade.id;
          syncParadeDetails();
        }
      } else {
        if (msg) msg.textContent = (result && result.message) || "Thanks. We asked the member who invited you to approve your registration. If they approve, you will receive a payment link by email.";
        var form = $("pgForm");
        if (form) form.reset();
        var sel2 = $("pgParade");
        if (sel2) sel2.value = "";
        syncParadeDetails();
      }
    } catch (e) {
      if (msg) msg.textContent = "Couldn't send that registration: " + ((e && e.message) || e);
    }
    if (submit) { submit.disabled = false; submit.textContent = "Submit guest registration"; }
  }

  async function loadEvents() {
    if (Array.isArray(global.__kosParadeGuestEvents)) {
      renderEvents(global.__kosParadeGuestEvents);
      return;
    }
    if (!client || typeof client.rpc !== "function") {
      renderEvents([]);
      return;
    }
    try {
      var res = await client.rpc("list_public_parade_guest_events");
      if (Array.isArray(global.__kosParadeGuestEvents)) {
        renderEvents(global.__kosParadeGuestEvents);
        return;
      }
      if (res.error) throw res.error;
      var data = res.data || {};
      renderEvents(data.events || data || []);
    } catch (e) {
      if (Array.isArray(global.__kosParadeGuestEvents)) {
        renderEvents(global.__kosParadeGuestEvents);
        return;
      }
      renderEvents([]);
      var empty = $("pgEmpty");
      if (empty && !empty.textContent) {
        empty.hidden = false;
        empty.textContent = "Guest registration will open once officers set guest march spots for a parade in Event Studio.";
      }
    }
  }

  function bindClient(c) {
    client = c || null;
  }

  function init(opts) {
    opts = opts || {};
    if (opts.client) bindClient(opts.client);
    var form = $("pgForm");
    if (!form || form.dataset.pgBound === "1") {
      loadEvents();
      return;
    }
    form.dataset.pgBound = "1";
    form.addEventListener("submit", onSubmit);
    var sel = $("pgParade");
    if (sel) sel.addEventListener("change", syncParadeDetails);
    loadEvents();
  }

  global.__kosInitParadeGuestForm = init;
  global.__kosSetParadeGuestEvents = function (list) {
    global.__kosParadeGuestEvents = list;
    renderEvents(list);
  };
  global.__kosParadeGuestFeeSummary = feeSummary;
})(typeof window !== "undefined" ? window : this);
