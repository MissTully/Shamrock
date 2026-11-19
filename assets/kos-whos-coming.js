/* Who's coming: officer RSVP list on the Officer Desk.
   Same people who can open Event Studio can open this.
   Data is read from officer_whos_coming (sql/kos_whos_coming.sql).
   Tests pass a fixture through __kosHubSetWhosComing. No second copy of the rows. */
(function (global) {
  "use strict";

  var escFn = function (s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  };

  function esc(s) {
    return escFn(s);
  }

  var fixture = null;
  var events = [];
  var rosters = {};
  var selectedId = "";
  var showOlder = false;
  var query = "";
  var bound = false;
  var loading = false;

  var STATUS = {
    registered: "Registered",
    confirmed: "Confirmed",
    attended: "Attended",
    waitlisted: "Waitlisted",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    pending_sponsor: "Waiting on the inviting member",
    payment_sent: "Payment sent",
    paid: "Paid",
    declined: "Declined",
    succeeded: "Paid",
    completed: "Paid",
    success: "Paid",
    approved: "Paid",
    pledged: "Pledged",
    unpaid: "Unpaid",
    pending: "Pending",
    free: "Free"
  };

  function injectCss() {
    if (document.getElementById("kosWhosComingCss")) return;
    var s = document.createElement("style");
    s.id = "kosWhosComingCss";
    s.textContent = [
      "#hubWhosComing,#kosWc,#kosWc *{box-sizing:border-box;}",
      "#hubWhosComing,#kosWc{max-width:100%;}",
      "#kosWc{font-size:16px;line-height:1.45;color:#3a3a2e;}",
      "#kosWc p,#kosWc label{font-size:16px;line-height:1.45;}",
      ".kos-wc-lead{margin:0 0 12px;font-size:16px;}",
      ".kos-wc-label{display:block;font-weight:700;margin:0 0 6px;color:var(--green-800);}",
      "#kosWcPick,#kosWcRoster,#kosWcList{max-width:100%;}",
      ".kos-wc-event{display:block;width:100%;max-width:100%;text-align:left;min-height:44px;font-size:16px;line-height:1.3;padding:10px 12px;margin:0 0 8px;border-radius:12px;border:1px solid rgba(168,128,28,.45);background:#fff;color:var(--green-800);font-family:var(--display);overflow-wrap:anywhere;}",
      ".kos-wc-event[aria-pressed='true']{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
      ".kos-wc-actions{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px;}",
      "#kosWcOlder,#kosWcCsv{min-height:44px;font-size:16px;padding:10px 14px;}",
      "#kosWcSearch{display:block;width:100%;max-width:100%;min-height:44px;font-size:16px;padding:10px 12px;border-radius:10px;border:1px solid rgba(168,128,28,.45);background:#fff;margin:0 0 8px;}",
      ".kos-wc-counts{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px;}",
      ".kos-wc-count{flex:1 1 100%;min-width:0;display:flex;align-items:baseline;gap:10px;background:#fffdf4;border:1px solid rgba(168,128,28,.35);border-radius:12px;padding:8px 12px;}",
      ".kos-wc-count b{font-family:var(--display);font-size:clamp(22px,6vw,28px);color:var(--green-800);line-height:1.1;min-width:1.5em;}",
      ".kos-wc-count span{font-size:16px;line-height:1.3;color:var(--muted);}",
      "@media (min-width:720px){.kos-wc-count{flex:1 1 30%;display:block;}.kos-wc-count b{display:block;}}",
      ".kos-wc-note{margin:0 0 12px;font-size:16px;color:var(--muted);}",
      ".kos-wc-row{border-top:1px solid rgba(168,128,28,.28);padding:12px 0;max-width:100%;}",
      ".kos-wc-name{font-family:var(--display);font-size:clamp(18px,4.8vw,22px);line-height:1.25;color:var(--green-800);overflow-wrap:anywhere;}",
      ".kos-wc-meta{margin:4px 0 0;font-size:16px;overflow-wrap:anywhere;}",
      ".kos-wc-links{display:flex;flex-direction:column;align-items:flex-start;max-width:100%;}",
      ".kos-wc-links a{min-height:44px;display:inline-flex;align-items:center;font-size:16px;font-weight:700;color:var(--green-800);overflow-wrap:anywhere;max-width:100%;}",
      ".kos-wc-msg{min-height:1.2em;margin:8px 0 0;font-size:16px;color:var(--green-800);}"
    ].join("");
    document.head.appendChild(s);
  }

  function staysListed(ev) {
    if (global.kosCalendar && typeof global.kosCalendar.eventStaysListed === "function") {
      return global.kosCalendar.eventStaysListed(ev);
    }
    return !!(ev && ev.listed !== false);
  }

  function eventTime(ev) {
    if (!ev || !ev.start_time) return NaN;
    var t = new Date(ev.start_time).getTime();
    return isNaN(t) ? NaN : t;
  }

  function sortEvents(list) {
    var now = Date.now();
    return (list || []).slice().sort(function (a, b) {
      var aListed = staysListed(a);
      var bListed = staysListed(b);
      if (aListed !== bListed) return aListed ? -1 : 1;
      var as = eventTime(a);
      var bs = eventTime(b);
      if (aListed) {
        var aUp = !isNaN(as) && as >= now;
        var bUp = !isNaN(bs) && bs >= now;
        if (aUp !== bUp) return aUp ? -1 : 1;
        if (isNaN(as)) return 1;
        if (isNaN(bs)) return -1;
        return as - bs;
      }
      if (isNaN(as)) return 1;
      if (isNaN(bs)) return -1;
      return bs - as;
    });
  }

  function when(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var date = d.toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York"
    });
    var time = d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York"
    });
    return date + ", " + time + " ET";
  }

  function eventWhen(ev) {
    if (!ev || !ev.start_time) return "";
    var d = new Date(ev.start_time);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZone: "America/New_York"
    }) + " ET";
  }

  function eventLabel(ev) {
    var bits = [ev && ev.name ? ev.name : "Untitled event"];
    var at = eventWhen(ev);
    if (at) bits.push(at);
    var status = String((ev && ev.status) || "").toLowerCase();
    if (status === "cancelled" || status === "canceled") bits.push("cancelled");
    else if (status === "draft") bits.push("draft");
    return bits.join(", ");
  }

  function statusLabel(value) {
    var raw = value == null ? "" : String(value).trim();
    if (!raw) return "";
    var key = raw.toLowerCase().replace(/\s+/g, "_");
    return STATUS[key] || raw;
  }

  function guestNumber(row) {
    if (!row || row.guests == null || row.guests === "") return null;
    var n = Number(row.guests);
    if (isNaN(n)) return null;
    return n;
  }

  function tally(rows) {
    var members = 0;
    var pub = 0;
    (rows || []).forEach(function (row) {
      if (!row || !row.counts) return;
      var extra = guestNumber(row);
      var add = 1 + (extra != null && extra > 0 ? extra : 0);
      if (row.audience === "Member") members += add;
      else pub += add;
    });
    return { members: members, public: pub, headcount: members + pub };
  }

  function visibleEvents() {
    var sorted = sortEvents(events);
    if (showOlder) return sorted;
    return sorted.filter(staysListed);
  }

  function currentRows() {
    var pack = rosters[selectedId];
    return (pack && pack.rows) || [];
  }

  function filteredRows() {
    var q = query.trim().toLowerCase();
    return currentRows().filter(function (row) {
      if (!q) return true;
      return String(row.name || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  function telHref(phone) {
    var keep = String(phone || "").replace(/[^\d+]/g, "");
    if (keep.indexOf("+") > 0) keep = keep.replace(/\+/g, "");
    if (!/\d/.test(keep)) return "";
    return "tel:" + keep;
  }

  function csvCell(value) {
    var t = value == null ? "" : String(value);
    if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function slug(name) {
    var s = String(name || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "event";
  }

  function selectedEvent() {
    for (var i = 0; i < events.length; i++) {
      if (String(events[i].id) === String(selectedId)) return events[i];
    }
    return null;
  }

  function downloadCsv() {
    var rows = currentRows();
    var headers = ["Name", "Kind", "Source", "Status", "Guests", "Signed up", "Phone", "Email"];
    var lines = [headers.map(csvCell).join(",")];
    rows.forEach(function (row) {
      var guests = guestNumber(row);
      lines.push([
        row.name || "",
        row.audience || "",
        row.source || "",
        statusLabel(row.status),
        guests == null ? "" : String(guests),
        when(row.signed_up_at),
        row.phone || "",
        row.email || ""
      ].map(csvCell).join(","));
    });
    var ev = selectedEvent();
    var blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "whos-coming-" + slug(ev && ev.name) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function root() {
    return document.getElementById("kosWc");
  }

  function fillPicker() {
    var box = document.getElementById("kosWcPicker");
    var older = document.getElementById("kosWcOlder");
    if (!box) return;
    var shown = visibleEvents();
    if (!shown.length) {
      box.innerHTML = '<p class="empty">No events in this window.</p>';
    } else {
      box.innerHTML = shown.map(function (ev) {
        var on = String(ev.id) === String(selectedId);
        return '<button type="button" class="kos-wc-event" data-wc-event="' + esc(ev.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
          esc(eventLabel(ev)) + "</button>";
      }).join("");
    }
    if (older) {
      var hidden = sortEvents(events).filter(function (ev) { return !staysListed(ev); });
      older.hidden = !hidden.length;
      older.textContent = showOlder ? "Hide older events" : "Show older events";
    }
  }

  function fillCounts() {
    var box = document.getElementById("kosWcCounts");
    var note = document.getElementById("kosWcNote");
    if (!box) return;
    if (!selectedId) {
      box.innerHTML = "";
      if (note) note.textContent = "";
      return;
    }
    var totals = tally(currentRows());
    box.innerHTML =
      '<div class="kos-wc-count"><b id="kosWcMembers">' + esc(String(totals.members)) + '</b><span>Members</span></div>' +
      '<div class="kos-wc-count"><b id="kosWcPublic">' + esc(String(totals.public)) + '</b><span>Guest/Public</span></div>' +
      '<div class="kos-wc-count"><b id="kosWcCombined">' + esc(String(totals.headcount)) + '</b><span>Combined</span></div>';
    if (note) {
      note.textContent = "Combined is everyone who is coming, including extra guests on a signup. Security shift signups stay on the Parade security tool.";
    }
  }

  function rowHtml(row) {
    var bits = [];
    var kind = row.audience || "";
    var source = row.source || "";
    if (kind || source) bits.push('<p class="kos-wc-meta">' + esc([kind, source].filter(Boolean).join(", ")) + "</p>");
    var status = statusLabel(row.status);
    if (status) bits.push('<p class="kos-wc-meta">' + esc(status) + "</p>");
    var guests = guestNumber(row);
    if (guests != null) bits.push('<p class="kos-wc-meta">Guests: ' + esc(String(guests)) + "</p>");
    var at = when(row.signed_up_at);
    if (at) bits.push('<p class="kos-wc-meta">Signed up ' + esc(at) + "</p>");
    if (row.counts === false) bits.push('<p class="kos-wc-meta">Not in the headcount</p>');
    var links = "";
    if (row.phone) {
      var href = telHref(row.phone);
      links += href
        ? '<a href="' + esc(href) + '">' + esc(row.phone) + "</a>"
        : "<span>" + esc(row.phone) + "</span>";
    }
    if (row.email) {
      links += '<a href="mailto:' + esc(row.email) + '">' + esc(row.email) + "</a>";
    }
    if (links) bits.push('<div class="kos-wc-links">' + links + "</div>");
    return '<article class="kos-wc-row"><h3 class="kos-wc-name">' + esc(row.name || "Guest") + "</h3>" + bits.join("") + "</article>";
  }

  function fillList() {
    var box = document.getElementById("kosWcList");
    if (!box) return;
    if (!selectedId) {
      box.innerHTML = '<p class="empty">Choose an event.</p>';
      return;
    }
    var rows = filteredRows();
    if (!currentRows().length) {
      box.innerHTML = '<p class="empty">Nobody is signed up for this event yet.</p>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<p class="empty">No names match that search.</p>';
      return;
    }
    var anyStatus = currentRows().some(function (row) { return !!statusLabel(row.status); });
    box.innerHTML = (anyStatus ? "" : "") + rows.map(rowHtml).join("");
  }

  function bind() {
    var el = root();
    if (!el || bound) return;
    bound = true;
    el.addEventListener("click", function (ev) {
      var older = ev.target.closest ? ev.target.closest("#kosWcOlder") : null;
      if (older) {
        showOlder = !showOlder;
        var shown = visibleEvents();
        if (shown.length && !shown.some(function (row) { return String(row.id) === String(selectedId); })) {
          choose(shown[0].id);
          return;
        }
        fillPicker();
        return;
      }
      var btn = ev.target.closest ? ev.target.closest("[data-wc-event]") : null;
      if (btn) {
        choose(btn.getAttribute("data-wc-event"));
        return;
      }
      if (ev.target.closest && ev.target.closest("#kosWcCsv")) downloadCsv();
    });
    var search = document.getElementById("kosWcSearch");
    if (search) {
      search.addEventListener("input", function () {
        query = search.value || "";
        fillList();
      });
    }
  }

  function paintShell() {
    injectCss();
    var card = document.getElementById("hubWhosComing");
    if (!card) return;
    var head = card.querySelector(".app-head");
    if (head) {
      head.innerHTML = '<span class="ic">👥</span><div><h2>Who\'s coming</h2><small>RSVP list for one event, including public signups, with headcount and CSV.</small></div>';
    }
    var body = card.querySelector(".app-body");
    if (!body) return;
    if (!document.getElementById("kosWc")) {
      body.innerHTML =
        '<div id="kosWc">' +
        '<p class="kos-wc-lead">Pick an event to see who signed up. This list includes members and anyone else registered, such as public signups, parade guests, and ticket buyers. Phone and email stay on this officer desk.</p>' +
        '<div id="kosWcPick"><p class="kos-wc-label" id="kosWcEventLabel">Event</p><div id="kosWcPicker" role="listbox" aria-labelledby="kosWcEventLabel"></div>' +
        '<div class="kos-wc-actions"><button type="button" class="btn" id="kosWcOlder">Show older events</button></div></div>' +
        '<div id="kosWcRoster"><div class="kos-wc-counts" id="kosWcCounts"></div><p class="kos-wc-note" id="kosWcNote"></p>' +
        '<label class="kos-wc-label" for="kosWcSearch">Search by name</label>' +
        '<input id="kosWcSearch" type="search" autocomplete="off" placeholder="Search by name">' +
        '<div class="kos-wc-actions"><button type="button" class="btn" id="kosWcCsv">Download CSV</button></div>' +
        '<div id="kosWcList"></div></div>' +
        '<p class="kos-wc-msg" id="kosWcMsg"></p></div>';
      bound = false;
    }
    bind();
  }

  function showMessage(text) {
    var msg = document.getElementById("kosWcMsg");
    if (msg) msg.textContent = text || "";
  }

  function render() {
    paintShell();
    var shown = visibleEvents();
    if (!selectedId || !shown.some(function (ev) { return String(ev.id) === String(selectedId); })) {
      if (!showOlder) {
        var listed = sortEvents(events).filter(staysListed);
        selectedId = listed.length ? String(listed[0].id) : (shown[0] ? String(shown[0].id) : "");
      } else if (shown[0]) {
        selectedId = String(shown[0].id);
      }
    }
    fillPicker();
    fillCounts();
    fillList();
    var search = document.getElementById("kosWcSearch");
    if (search && search.value !== query) search.value = query;
  }

  function applyPayload(data, eventId) {
    data = data || {};
    if (Array.isArray(data.events)) events = data.events.slice();
    if (eventId && Array.isArray(data.rows)) {
      rosters[String(eventId)] = { rows: data.rows };
    }
    if (data.rosters && typeof data.rosters === "object") {
      Object.keys(data.rosters).forEach(function (id) {
        var pack = data.rosters[id] || {};
        rosters[String(id)] = { rows: pack.rows || [] };
      });
    }
  }

  function choose(id) {
    selectedId = id == null ? "" : String(id);
    query = "";
    var search = document.getElementById("kosWcSearch");
    if (search) search.value = "";
    if (fixture) {
      render();
      return;
    }
    if (rosters[selectedId]) {
      render();
      return;
    }
    load(selectedId);
  }

  async function load(eventId) {
    if (fixture) {
      applyPayload(fixture, null);
      if (eventId) selectedId = String(eventId);
      render();
      return;
    }
    var client = global.__kosSb;
    if (!client || typeof client.rpc !== "function") {
      paintShell();
      showMessage("Sign in to load who's coming.");
      return;
    }
    if (loading) return;
    loading = true;
    showMessage(eventId ? "Loading the list..." : "Loading events...");
    try {
      var res = await client.rpc("officer_whos_coming", { p_event_id: eventId || null });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Not authorized.");
      applyPayload(data, eventId || (data.event && data.event.id));
      if (eventId) selectedId = String(eventId);
      else if (data.event && data.event.id) selectedId = String(data.event.id);
      showMessage("");
      render();
      if (!eventId && selectedId && !rosters[selectedId]) {
        loading = false;
        await load(selectedId);
        return;
      }
    } catch (e) {
      paintShell();
      var message = (e && e.message) || "Try again in a moment.";
      if (/officer_whos_coming|schema cache|does not exist|PGRST202/i.test(message)) {
        message = "This list is not on the database yet. Apply sql/kos_whos_coming.sql, then refresh.";
      }
      showMessage(message);
    }
    loading = false;
  }

  function open() {
    injectCss();
    paintShell();
    if (fixture || global.__kosWhosComingFixture) {
      fixture = fixture || global.__kosWhosComingFixture;
      applyPayload(fixture, null);
      render();
      return;
    }
    if (events.length) {
      render();
      if (selectedId && !rosters[selectedId]) load(selectedId);
      return;
    }
    load(null);
  }

  global.kosWhosComing = {
    useEsc: function (fn) {
      if (typeof fn === "function") escFn = fn;
    },
    paintShell: paintShell,
    open: open,
    tally: tally
  };

  global.__kosHubSetWhosComing = function (data) {
    fixture = data || { events: [], rosters: {} };
    global.__kosWhosComingFixture = fixture;
    events = [];
    rosters = {};
    selectedId = "";
    query = "";
    applyPayload(fixture, null);
    if (document.getElementById("hubWhosComing")) open();
  };
})(typeof window !== "undefined" ? window : globalThis);
