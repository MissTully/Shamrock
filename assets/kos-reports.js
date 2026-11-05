/* Reports: companion to members-desk.js and kos-event-studio.js.
   Officers, board members, and committee chairs run attendance and
   fundraising reports. Data comes from three security-definer functions
   (see sql/kos_legacy_import_and_reports.sql); each re-checks
   can_manage_events() server-side, so the UI is not the security boundary. */
(function () {
  "use strict";

  var CSS = [
    ".hub-report-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:10px 0 14px;}",
    ".hub-report-controls label{display:block;font-size:13px;color:var(--muted);margin-bottom:3px;}",
    ".hub-report-controls select,.hub-report-controls input{padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;font:inherit;background:#fff;}",
    ".hub-report-totals{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0;}",
    ".hub-report-chip{background:#fffdf4;border:1px solid rgba(168,128,28,.35);border-radius:12px;padding:10px 16px;}",
    ".hub-report-chip b{display:block;font-family:var(--display);font-size:22px;color:var(--green-800);}",
    ".hub-report-chip span{font-size:12px;color:var(--muted);}",
    ".hub-report-tablewrap{overflow-x:auto;border:1px solid rgba(168,128,28,.3);border-radius:12px;}",
    ".hub-report-table{width:100%;border-collapse:collapse;font-size:14px;min-width:560px;}",
    ".hub-report-table th{background:linear-gradient(180deg,var(--green-700),var(--green-800));color:#fff;text-align:left;padding:8px 10px;font-family:var(--display);font-weight:600;font-size:13px;}",
    ".hub-report-table td{padding:7px 10px;border-top:1px solid rgba(168,128,28,.18);vertical-align:top;}",
    ".hub-report-table tr:nth-child(even) td{background:#fffdf4;}",
    ".hub-report-msg{min-height:1.2em;color:var(--green-800);font-size:14px;margin:8px 0 0;}",
    ".hub-report-section{margin-top:20px;padding-top:16px;border-top:1px dashed rgba(168,128,28,.4);}",
    ".hub-report-section h3{font-family:var(--display);color:var(--green-800);margin:0 0 4px;font-size:18px;}",
    ".hub-report-section .sub{font-size:13px;color:var(--muted);margin:0 0 8px;}",
  ].join("");

  function injectCss() {
    if (document.getElementById("kosReportsCss")) return;
    var s = document.createElement("style");
    s.id = "kosReportsCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(v) {
    return (v == null ? "" : String(v)).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function dollars(cents) {
    return "$" + (Number(cents || 0) / 100).toLocaleString([], {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  function when(value) {
    if (!value) return "";
    var d = new Date(value);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
  }

  // Build a CSV file in the browser and hand it to the officer as a download.
  function downloadCsv(filename, headers, rows) {
    function cell(v) {
      v = v == null ? "" : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var text = [headers].concat(rows).map(function (r) { return r.map(cell).join(","); }).join("\r\n");
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function slug(s) {
    return (s || "report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  }

  var lastEventReport = null;
  var lastMoneyReport = null;

  function renderEventReport(report) {
    var target = document.getElementById("hubReportEventOut");
    if (!target) return;
    var t = report.totals || {};
    var rows = (report.attendees || []).map(function (a) {
      var guestCell = a.guests ? esc(a.guests) : "";
      if (a.guest_names) guestCell = (guestCell ? guestCell + " · " : "") + esc(String(a.guest_names).slice(0, 80));
      var raffleCell = (a.raffle_tickets != null && Number(a.raffle_tickets) > 0) ? esc(a.raffle_tickets) : "";
      return '<tr><td>' + esc(a.name) + '</td><td>' + esc(a.email || "") + '</td>' +
        '<td>' + esc(a.detail || "") + '</td><td>' + esc(a.status || "") + '</td>' +
        '<td style="text-align:center;">' + guestCell + '</td>' +
        '<td style="text-align:center;">' + raffleCell + '</td>' +
        '<td style="text-align:right;">' + (a.amount_cents != null ? dollars(a.amount_cents) : "") + '</td>' +
        '<td style="text-align:center;">' + (a.checked_in ? "✔" : "") + '</td>' +
        '<td>' + esc(a.source || "") + '</td></tr>';
    }).join("");
    target.innerHTML =
      '<div class="hub-report-totals">' +
      '<div class="hub-report-chip"><b>' + esc(t.expected_headcount || 0) + '</b><span>expected attendees (incl. guests)</span></div>' +
      '<div class="hub-report-chip"><b>' + dollars(t.raised_cents) + '</b><span>raised for this event</span></div>' +
      (Number(t.pending_cents || 0) > 0 ? '<div class="hub-report-chip"><b>' + dollars(t.pending_cents) + '</b><span>still unpaid</span></div>' : '') +
      (Number(t.pending_zeffy_signups || 0) > 0 ? '<div class="hub-report-chip"><b>' + esc(t.pending_zeffy_signups) + '</b><span>pending Zeffy checkout</span></div>' : '') +
      '<div class="hub-report-chip"><b>' + esc(t.checked_in || 0) + '</b><span>checked in</span></div>' +
      '</div>' +
      (rows
        ? '<div class="hub-report-tablewrap"><table class="hub-report-table"><thead><tr>' +
          '<th>Name</th><th>Email</th><th>Ticket / role</th><th>Status</th><th>Guests</th><th>Raffle</th><th>Paid</th><th>In</th><th>Source</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
          '<div style="margin-top:10px;"><button class="btn" type="button" id="hubReportEventCsv">⬇ Download attendee list (CSV)</button></div>'
        : '<p class="empty">No sign-ups recorded for this event yet.</p>');
    var csvBtn = document.getElementById("hubReportEventCsv");
    if (csvBtn) csvBtn.addEventListener("click", function () {
      downloadCsv(slug((report.event || {}).title) + "-attendees.csv",
        ["Name", "Email", "Ticket/role", "Status", "Guests", "Guest names", "Raffle", "Paid", "Checked in", "Source"],
        (report.attendees || []).map(function (a) {
          return [a.name, a.email || "", a.detail || "", a.status || "", a.guests || 0,
            a.guest_names || "", a.raffle_tickets || 0,
            a.amount_cents != null ? (a.amount_cents / 100).toFixed(2) : "", a.checked_in ? "yes" : "", a.source || ""];
        }));
    });
  }

  function renderMoneyReport(report) {
    var target = document.getElementById("hubReportMoneyOut");
    if (!target) return;
    var cats = (report.by_category || []).map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td style="text-align:right;">' + dollars(c.total_cents) +
        '</td><td style="text-align:right;">' + esc(c.payments) + '</td></tr>';
    }).join("");
    var evs = (report.by_event || []).map(function (e) {
      return '<tr><td>' + esc(e.title) + '</td><td>' + esc(when(e.start_time)) +
        '</td><td style="text-align:right;">' + dollars(e.raised_cents) +
        '</td><td style="text-align:right;">' + esc(e.headcount) + '</td></tr>';
    }).join("");
    target.innerHTML =
      '<div class="hub-report-totals"><div class="hub-report-chip"><b>' + dollars(report.total_cents) +
      '</b><span>total received in this period</span></div></div>' +
      '<div class="hub-report-tablewrap"><table class="hub-report-table"><thead><tr>' +
      '<th>Category</th><th style="text-align:right;">Received</th><th style="text-align:right;">Payments</th>' +
      '</tr></thead><tbody>' + (cats || '<tr><td colspan="3">No payments in this period.</td></tr>') + '</tbody></table></div>' +
      '<h3 style="font-family:var(--display);color:var(--green-800);font-size:16px;margin:16px 0 8px;">By event</h3>' +
      '<div class="hub-report-tablewrap"><table class="hub-report-table"><thead><tr>' +
      '<th>Event</th><th>Date</th><th style="text-align:right;">Raised</th><th style="text-align:right;">Attendees</th>' +
      '</tr></thead><tbody>' + (evs || '<tr><td colspan="4">No events in this period.</td></tr>') + '</tbody></table></div>' +
      '<div style="margin-top:10px;"><button class="btn" type="button" id="hubReportMoneyCsv">⬇ Download fundraising summary (CSV)</button></div>';
    var csvBtn = document.getElementById("hubReportMoneyCsv");
    if (csvBtn) csvBtn.addEventListener("click", function () {
      var rows = [["BY CATEGORY", "", "", ""]]
        .concat((report.by_category || []).map(function (c) {
          return [c.category, "", (c.total_cents / 100).toFixed(2), c.payments];
        }))
        .concat([["", "", "", ""], ["BY EVENT", "", "", ""]])
        .concat((report.by_event || []).map(function (e) {
          return [e.title, when(e.start_time), (e.raised_cents / 100).toFixed(2), e.headcount];
        }))
        .concat([["", "", "", ""], ["TOTAL", "", (Number(report.total_cents || 0) / 100).toFixed(2), ""]]);
      downloadCsv("kos-fundraising-summary.csv", ["Item", "Date", "Dollars", "Count"], rows);
    });
  }

  async function loadOptions(client) {
    var select = document.getElementById("hubReportEvent");
    var msg = document.getElementById("hubReportMsg");
    try {
      var res = await client.rpc("officer_report_options");
      if (res.error) throw res.error;
      if (!res.data || res.data.ok === false) throw new Error((res.data && res.data.message) || "Not authorized.");
      var events = res.data.events || [];
      select.innerHTML = '<option value="">Select an event…</option>';
      events.forEach(function (ev) {
        var opt = document.createElement("option");
        opt.value = ev.key;
        var count = Number(ev.site_rsvps || 0) + Number(ev.legacy_regs || 0);
        opt.textContent = (ev.title || "Untitled event") +
          (ev.start_time ? " (" + when(ev.start_time) + ")" : "") +
          (count ? " · " + count + " sign-up" + (count === 1 ? "" : "s") : "");
        select.appendChild(opt);
      });
    } catch (e) {
      if (msg) msg.textContent = "Couldn't load the event list: " + ((e && e.message) || e);
    }
  }

  async function runEventReport(client) {
    var key = (document.getElementById("hubReportEvent") || {}).value;
    var msg = document.getElementById("hubReportMsg");
    var out = document.getElementById("hubReportEventOut");
    if (!key) { if (msg) msg.textContent = "Choose an event first."; return; }
    if (msg) msg.textContent = "Running report…";
    try {
      var res = await client.rpc("officer_event_report", { p_key: key });
      if (res.error) throw res.error;
      if (!res.data || res.data.ok === false) throw new Error((res.data && res.data.message) || "Report failed.");
      lastEventReport = res.data;
      if (msg) msg.textContent = "";
      renderEventReport(res.data);
    } catch (e) {
      if (out) out.innerHTML = "";
      if (msg) msg.textContent = "Couldn't run the report: " + ((e && e.message) || e);
    }
  }

  async function runMoneyReport(client) {
    var from = (document.getElementById("hubReportFrom") || {}).value || null;
    var to = (document.getElementById("hubReportTo") || {}).value || null;
    var msg = document.getElementById("hubReportMoneyMsg");
    var out = document.getElementById("hubReportMoneyOut");
    if (msg) msg.textContent = "Running summary…";
    try {
      var res = await client.rpc("officer_fundraising_report", { p_from: from, p_to: to });
      if (res.error) throw res.error;
      if (!res.data || res.data.ok === false) throw new Error((res.data && res.data.message) || "Report failed.");
      lastMoneyReport = res.data;
      if (msg) msg.textContent = "";
      renderMoneyReport(res.data);
    } catch (e) {
      if (out) out.innerHTML = "";
      if (msg) msg.textContent = "Couldn't run the summary: " + ((e && e.message) || e);
    }
  }

  /* ---- Committee members report (board request, Nov 2026) ---- */
  var COMMITTEE_ORDER = ["Membership", "Bylaws and Rules", "Float", "Parade", "Parade: Security", "Social", "Charity/Fundraising", "Merchandise", "Finance", "Communication", "Technology"];
  var committeeRows = [];
  var committeeFixture = null;

  function cmGroups(rows) {
    var by = {};
    rows.forEach(function (r) { (by[r.committee] = by[r.committee] || []).push(r); });
    var names = COMMITTEE_ORDER.slice();
    Object.keys(by).forEach(function (k) { if (names.indexOf(k) === -1 && k !== "No committee picked") names.push(k); });
    return { names: names, by: by };
  }
  function cmName(r) { return [r.first_name, r.last_name].filter(Boolean).join(" "); }
  function cmTel(p) { return p ? '<a href="tel:' + esc(String(p).replace(/[^0-9+]/g, "")) + '">' + esc(p) + "</a>" : "-"; }

  function renderCommitteeReport() {
    var out = document.getElementById("hubReportCmOut");
    if (!out) return;
    var g = cmGroups(committeeRows);
    var none = (g.by["No committee picked"] || []).length;
    var html = '<div class="hub-report-totals">' + g.names.map(function (n) {
      var list = g.by[n] || [];
      var m = list.filter(function (r) { return r.report_role !== "Chair"; }).length;
      return '<div class="hub-report-chip"><b>' + m + "</b><span>" + esc(n) + "</span></div>";
    }).join("") + '<div class="hub-report-chip"><b>' + none + "</b><span>No committee picked</span></div></div>";
    html += g.names.map(function (n) {
      var list = g.by[n] || [];
      var chairs = list.filter(function (r) { return r.report_role === "Chair"; });
      var mem = list.filter(function (r) { return r.report_role !== "Chair"; });
      return '<h4 style="font-family:var(--display);color:var(--green-800);margin:16px 0 4px;">' + esc(n) + " (" + mem.length + (mem.length === 1 ? " member" : " members") + ")</h4>" +
        '<p class="sub">Chair: ' + (chairs.length ? chairs.map(function (c) { return esc(cmName(c)); }).join(", ") : "none listed") + "</p>" +
        (list.length ? '<div class="hub-report-tablewrap"><table class="hub-report-table"><thead><tr><th>Role</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead><tbody>' +
          chairs.concat(mem).map(function (r) {
            return "<tr><td>" + esc(r.report_role) + "</td><td>" + esc(cmName(r)) + "</td><td>" + (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + "</a>" : "-") +
              "</td><td>" + cmTel(r.phone) + "</td><td>" + esc(r.membership_status || "") + "</td></tr>";
          }).join("") + "</tbody></table></div>" : '<p class="sub">No one has picked this committee yet.</p>');
    }).join("");
    out.innerHTML = html;
  }

  async function runCommitteeReport(client) {
    var msg = document.getElementById("hubReportCmMsg");
    if (committeeFixture) { committeeRows = committeeFixture; window.__kosCommitteeRows = committeeRows; renderCommitteeReport(); return; }
    if (msg) msg.textContent = "Loading committees...";
    try {
      var res = await client.rpc("officer_committee_members_report");
      if (res.error) throw res.error;
      committeeRows = res.data || [];
      window.__kosCommitteeRows = committeeRows;
      if (msg) msg.textContent = "";
      renderCommitteeReport();
    } catch (e) {
      if (msg) msg.textContent = /function|does not exist|schema cache/i.test((e && e.message) || "") ? "The committee report needs its database update applied in Supabase first." : ("Couldn't load the committee report: " + ((e && e.message) || e));
    }
  }

  function printCommitteeReport() {
    var w = window.open("", "_blank");
    if (!w) { alert("Your browser blocked the print window. Allow pop-ups for this site, then try again."); return; }
    var g = cmGroups(committeeRows);
    var stamp = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric" });
    var body = g.names.map(function (n) {
      var list = g.by[n] || [];
      var chairs = list.filter(function (r) { return r.report_role === "Chair"; });
      var mem = list.filter(function (r) { return r.report_role !== "Chair"; });
      return '<section><h2>' + esc(n) + " <small>(" + mem.length + " members)</small></h2><p>Chair: " + (chairs.length ? chairs.map(function (c) { return esc(cmName(c)); }).join(", ") : "none listed") + "</p>" +
        "<table><thead><tr><th>Role</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead><tbody>" +
        (list.length ? chairs.concat(mem).map(function (r) { return "<tr><td>" + esc(r.report_role) + "</td><td>" + esc(cmName(r)) + "</td><td>" + esc(r.email || "") + "</td><td>" + esc(r.phone || "") + "</td><td>" + esc(r.membership_status || "") + "</td></tr>"; }).join("") : '<tr><td colspan="5">No one yet</td></tr>') +
        "</tbody></table></section>";
    }).join("");
    var none = (g.by["No committee picked"] || []).length;
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Krewe of Shamrock Committee Members</title>' +
      "<style>body{font-family:Georgia,serif;margin:28px;color:#14281d}h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:18px 0 2px}h2 small{font-weight:400;color:#555}p{margin:0 0 8px;color:#555}" +
      "table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #999;padding:5px 7px;text-align:left}th{background:#e8f0e8}section{break-inside:avoid;page-break-inside:avoid}@media print{body{margin:10mm}}</style></head><body>" +
      "<h1>Krewe of Shamrock Committee Members</h1><p>" + esc(stamp) + " · " + none + " members with no committee picked</p>" + body +
      "<script>window.onload=function(){window.print();}<\/script></body></html>");
    w.document.close();
  }

  async function downloadCommitteeCsv(client) {
    // Use the rows on screen. If this copy of the report has none (another boot pass painted the
    // tables, or Run was not clicked yet), reuse the shared copy or fetch them now.
    var rows = committeeRows.length ? committeeRows : (window.__kosCommitteeRows || []);
    if (!rows.length && client && !committeeFixture) {
      try {
        var res = await client.rpc("officer_committee_members_report");
        if (!res.error) rows = res.data || [];
      } catch (e) { rows = []; }
    }
    if (rows.length && !committeeRows.length) { committeeRows = rows; renderCommitteeReport(); }
    var msg = document.getElementById("hubReportCmMsg");
    if (!rows.length) { if (msg) msg.textContent = "No rows to download yet. Tap Run report first."; return; }
    var lines = [["Committee", "Role", "Name", "Email", "Phone"]].concat(rows.map(function (r) {
      return [r.committee, r.report_role, cmName(r), r.email, r.phone];
    })).map(function (row) {
      return row.map(function (v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(",");
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "kos-committee-members.csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  window.__kosLoadReports = function (client, committeeOnly) { return loadReports(client, committeeOnly); };
  window.__kosSetCommitteeReport = function (rows) { committeeFixture = rows || []; runCommitteeReport(null); };

  var COMMITTEE_SECTION =
      '<div class="hub-report-section" id="hubReportCm">' +
      '<h3>Committee members</h3>' +
      '<p class="sub">Each committee with its chair and the members who picked it on their profile (old-site interests plus My Krewe picks).</p>' +
      '<div class="hub-report-controls">' +
      '<button class="btn btn-primary" type="button" id="hubReportCmRun">☘ Run report</button>' +
      '<button class="btn" type="button" id="hubReportCmPrint">Print</button>' +
      '<button class="btn" type="button" id="hubReportCmCsv">Download CSV</button>' +
      '</div><p class="hub-report-msg" id="hubReportCmMsg" aria-live="polite"></p>' +
      '<div id="hubReportCmOut"></div></div>';

  function wireCommitteeSection(client) {
    document.getElementById("hubReportCmRun").addEventListener("click", function () { runCommitteeReport(client); });
    document.getElementById("hubReportCmPrint").addEventListener("click", function () {
      if (!committeeRows.length && window.__kosCommitteeRows) committeeRows = window.__kosCommitteeRows;
      printCommitteeReport();
    });
    document.getElementById("hubReportCmCsv").addEventListener("click", function () { downloadCommitteeCsv(client); });
  }

  async function loadReports(client, committeeOnly) {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return;
    var card = document.getElementById("hubReports");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubReports";
      var studio = document.getElementById("hubEventStudio");
      if (studio && studio.nextSibling) panel.insertBefore(card, studio.nextSibling);
      else panel.appendChild(card);
    }
    if (committeeOnly) {
      card.innerHTML = '<div class="app-head"><span class="ic">📊</span><div><h2>Reports</h2><small>Committee members</small></div></div>' +
        '<div class="app-body">' + COMMITTEE_SECTION.replace('class="hub-report-section"', 'class="hub-report-section" style="border-top:0;padding-top:0;margin-top:0;"') + "</div>";
      wireCommitteeSection(client);
      if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();
      return;
    }
    card.innerHTML =
      '<div class="app-head"><span class="ic">📊</span><div><h2>Reports</h2>' +
      '<small>Who is coming and how much has been raised</small></div></div>' +
      '<div class="app-body">' +
      '<div class="hub-report-section" style="border-top:0;padding-top:0;margin-top:0;">' +
      '<h3>Event report</h3>' +
      '<p class="sub">Website RSVPs and old-site (Wild Apricot) registrations together: attendees, guests, check-ins, and money raised.</p>' +
      '<div class="hub-report-controls">' +
      '<div style="flex:1;min-width:240px;"><label for="hubReportEvent">Event</label>' +
      '<select id="hubReportEvent" style="width:100%;"><option value="">Loading events…</option></select></div>' +
      '<button class="btn btn-primary" type="button" id="hubReportRun">☘ Run report</button>' +
      '</div><p class="hub-report-msg" id="hubReportMsg" aria-live="polite"></p>' +
      '<div id="hubReportEventOut"></div></div>' +
      '<div class="hub-report-section">' +
      '<h3>Fundraising summary</h3>' +
      '<p class="sub">Money received by category and by event. Leave the dates blank for all time.</p>' +
      '<div class="hub-report-controls">' +
      '<div><label for="hubReportFrom">From</label><input id="hubReportFrom" type="date" /></div>' +
      '<div><label for="hubReportTo">To</label><input id="hubReportTo" type="date" /></div>' +
      '<button class="btn btn-primary" type="button" id="hubReportMoneyRun">☘ Run summary</button>' +
      '</div><p class="hub-report-msg" id="hubReportMoneyMsg" aria-live="polite"></p>' +
      '<div id="hubReportMoneyOut"></div></div>' + COMMITTEE_SECTION + '</div>';
    document.getElementById("hubReportRun").addEventListener("click", function () { runEventReport(client); });
    document.getElementById("hubReportMoneyRun").addEventListener("click", function () { runMoneyReport(client); });
    wireCommitteeSection(client);
    await loadOptions(client);
    if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();
  }

  async function bootReports() {
    injectCss();
    var client = window.__kosSb || null;
    for (var i = 0; i < 40 && !client; i++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      client = window.__kosSb || null;
    }
    if (!client) return;
    var can = false;
    try {
      var res = await client.rpc("can_manage_events");
      can = !!res.data;
    } catch (e) { can = false; }
    var cm = false;
    if (!can) {
      try {
        var r1 = await client.rpc("is_krewe_officer");
        var r2 = await client.rpc("is_committee_chair");
        cm = !!(r1.data || r2.data);
      } catch (e3) { cm = false; }
      if (!cm) return;
    }
    await loadReports(client, !can);
    if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();
  }

  var _unlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof _unlock === "function") _unlock();
    setTimeout(bootReports, 120);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(bootReports, 500); });
  else setTimeout(bootReports, 500);
})();
