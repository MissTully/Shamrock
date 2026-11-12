/* Public guest-march registration for parades.html. */
(function (global) {
  "use strict";

  var WAIVER_HREF = "assets/docs/liability-waiver.html";
  var TICKET_ADULT = "Parade guest";
  var TICKET_CHILD = "Parade guest, immediate family or under 12";
  var events = [];
  var client = null;
  var kidSeq = 0;

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
    var parts = [];
    if (std) parts.push("Adult guests pay " + std + " (1 ticket named " + TICKET_ADULT + ").");
    if (fam && !ev.guest_requires_21) {
      parts.push("Each child under 12 is " + fam + " (ticket named " + TICKET_CHILD + ").");
    }
    if (!parts.length) return "The guest fee will be confirmed after the inviting member approves.";
    return parts.join(" ");
  }

  function selectedEvent() {
    var sel = $("pgParade");
    if (!sel || !sel.value) return null;
    for (var i = 0; i < events.length; i++) {
      if (String(events[i].id) === String(sel.value)) return events[i];
    }
    return null;
  }

  function readMinors() {
    var list = $("pgKidsList");
    if (!list) return [];
    var rows = list.querySelectorAll(".pg-kid-row");
    var out = [];
    rows.forEach(function (row) {
      var first = (row.querySelector('[data-kid="first"]') || {}).value || "";
      var last = (row.querySelector('[data-kid="last"]') || {}).value || "";
      first = first.trim();
      last = last.trim();
      if (!first && !last) return;
      out.push({ first_name: first, last_name: last, row: row });
    });
    return out;
  }

  function partySize() {
    return 1 + readMinors().length;
  }

  function canAddKids(ev, full) {
    return !!(ev && !full && !ev.guest_requires_21 && ev.guest_fee_family_cents != null && ev.guest_fee_family_label);
  }

  function addKidRow(first, last) {
    var list = $("pgKidsList");
    if (!list) return;
    kidSeq += 1;
    var id = "pgKid" + kidSeq;
    var row = document.createElement("div");
    row.className = "pg-kid-row";
    row.innerHTML =
      '<div><label for="' + id + 'First">Child first name</label>' +
      '<input id="' + id + 'First" type="text" data-kid="first" autocomplete="off" /></div>' +
      '<div><label for="' + id + 'Last">Child last name</label>' +
      '<input id="' + id + 'Last" type="text" data-kid="last" autocomplete="off" /></div>' +
      '<button type="button" class="btn" data-kid-remove="1">Remove</button>';
    list.appendChild(row);
    if (first) row.querySelector('[data-kid="first"]').value = first;
    if (last) row.querySelector('[data-kid="last"]').value = last;
    row.querySelector("[data-kid-remove]").addEventListener("click", function () {
      row.remove();
      syncParadeDetails();
    });
    row.querySelectorAll("input").forEach(function (inp) {
      inp.addEventListener("input", syncParadeDetails);
    });
  }

  function clearKids() {
    var list = $("pgKidsList");
    if (list) list.innerHTML = "";
  }

  function moneyParts(cents, label) {
    if (label) return label;
    if (cents == null) return "";
    return "$" + (Number(cents) / 100).toFixed(2);
  }

  function updatePartySummary(ev, full) {
    var box = $("pgPartySummary");
    if (!box) return;
    if (!ev || full) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    var kids = readMinors();
    var size = 1 + kids.length;
    var left = ev.spots_left == null ? 0 : Number(ev.spots_left);
    var adultFee = ev.guest_fee_label || moneyParts(ev.guest_fee_cents);
    var childFee = ev.guest_fee_family_label || moneyParts(ev.guest_fee_family_cents);
    var totalCents = (Number(ev.guest_fee_cents) || 0) + (Number(ev.guest_fee_family_cents) || 0) * kids.length;
    var total = ev.guest_fee_cents != null ? moneyParts(totalCents) : adultFee;
    var lines = [];
    lines.push("Guest spots: " + String(ev.spots_taken || 0) + " of " + String(ev.guest_capacity || 0) + " filled, " + String(left) + " left.");
    if (kids.length) {
      lines.push("This registration is you plus " + kids.length + " " + (kids.length === 1 ? "child" : "children") + " (" + size + " people). Total " + total + ".");
      lines.push("On Zeffy you will choose 1 ticket named " + TICKET_ADULT + " (" + adultFee + ") and " + kids.length + " ticket" + (kids.length === 1 ? "" : "s") + " named " + TICKET_CHILD + " (" + childFee + " each).");
    } else {
      lines.push("This registration is 1 person (you). Total " + (adultFee || total) + ". On Zeffy you will choose 1 ticket named " + TICKET_ADULT + ".");
    }
    if (size > left) {
      if (left <= 0) lines.push("All guest spots for this parade are filled.");
      else lines.push("Only " + left + " guest spots are left. This registration is for " + size + " people.");
    }
    box.hidden = false;
    box.textContent = lines.join(" ");
  }

  function syncParadeDetails() {
    var ev = selectedEvent();
    var details = $("pgParadeDetails");
    var ageWrap = $("pgAge21Wrap");
    var kidsWrap = $("pgKidsWrap");
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
          "<p>" + esc(feeSummary(ev)) + "</p>";
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
    var allowKids = canAddKids(ev, full);
    if (kidsWrap) kidsWrap.hidden = !allowKids;
    if (!allowKids) clearKids();
    updatePartySummary(ev, full);
    if (submit) {
      var left = ev && ev.spots_left != null ? Number(ev.spots_left) : 0;
      submit.disabled = !ev || full || partySize() > left;
    }
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
    var minorsRaw = readMinors();
    if (parade.guest_requires_21 && minorsRaw.length) {
      if (msg) msg.textContent = "This parade requires guests to be 21 or older. Children cannot be added.";
      return;
    }
    var incomplete = minorsRaw.some(function (m) { return !m.first_name || !m.last_name; });
    if (incomplete) {
      if (msg) msg.textContent = "Please enter a first and last name for each child, or remove a blank child row.";
      return;
    }
    var size = 1 + minorsRaw.length;
    var left = parade.spots_left == null ? 0 : Number(parade.spots_left);
    if (size > left) {
      var fullMsg = left <= 0
        ? "All guest spots for this parade are filled."
        : "Only " + left + " guest spots are left. This registration is for " + size + " people.";
      if (msg) msg.textContent = fullMsg;
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
      minors: minorsRaw.map(function (m) { return { first_name: m.first_name, last_name: m.last_name }; }),
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
          if (result.spots_left != null) parade.spots_left = Number(result.spots_left);
          if (result.spots_left == null || Number(parade.spots_left) <= 0) {
            parade.is_full = true;
            parade.spots_left = 0;
          }
          renderEvents(events);
          var sel = $("pgParade");
          if (sel) sel.value = parade.id;
          syncParadeDetails();
        }
      } else {
        if (msg) msg.textContent = (result && result.message) || "Thanks. We asked the member who invited you to approve your registration. If they approve, you will receive a payment link by email.";
        var form = $("pgForm");
        if (form) form.reset();
        clearKids();
        syncParadeDetails();
      }
    } catch (err) {
      if (msg) msg.textContent = (err && err.message) || "Could not submit that registration.";
    }
    if (submit) { submit.disabled = false; submit.textContent = "Submit guest registration"; }
  }

  function bindForm() {
    var form = $("pgForm");
    if (!form || form.dataset.pgBound === "1") {
      if (form && form.dataset.pgBound === "1") loadEvents();
      return;
    }
    form.dataset.pgBound = "1";
    form.addEventListener("submit", onSubmit);
    var sel = $("pgParade");
    if (sel) sel.addEventListener("change", syncParadeDetails);
    var addBtn = $("pgAddKid");
    if (addBtn) addBtn.addEventListener("click", function () {
      addKidRow("", "");
      syncParadeDetails();
    });
    loadEvents();
  }

  async function loadEvents() {
    if (Array.isArray(global.__kosParadeGuestEvents)) {
      renderEvents(global.__kosParadeGuestEvents);
      return;
    }
    if (!client || typeof client.rpc !== "function") return;
    try {
      var res = await client.rpc("list_public_parade_guest_events");
      if (Array.isArray(global.__kosParadeGuestEvents)) {
        renderEvents(global.__kosParadeGuestEvents);
        return;
      }
      if (res.error) throw res.error;
      var list = res.data;
      if (list && list.events) list = list.events;
      renderEvents(Array.isArray(list) ? list : []);
    } catch (err) {
      if (Array.isArray(global.__kosParadeGuestEvents)) {
        renderEvents(global.__kosParadeGuestEvents);
        return;
      }
      var empty = $("pgEmpty");
      var form = $("pgForm");
      if (empty) {
        empty.hidden = false;
        empty.textContent = "Guest registration is temporarily unavailable. Please try again shortly.";
      }
      if (form) form.hidden = true;
    }
  }

  function init(opts) {
    opts = opts || {};
    if (opts.client) client = opts.client;
    bindForm();
  }

  global.__kosInitParadeGuestForm = init;
  global.__kosSetParadeGuestEvents = function (list) {
    global.__kosParadeGuestEvents = Array.isArray(list) ? list : [];
    renderEvents(global.__kosParadeGuestEvents);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { init({ client: global.supabase }); });
  } else {
    init({ client: global.supabase });
  }
})(typeof window !== "undefined" ? window : this);
