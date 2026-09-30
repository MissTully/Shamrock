/* Officer desk: Dues & Payments (Phase 4 treasurer reporting).
   Same gate as the Payments card: can_view_payments().
   Reads dues_payments, members, kos_dues_catalog, payments, and
   list_recent_payments. Does not write, send mail, or call waiver /
   invoice / Zeffy functions. Waiver requests stay on Dues waivers. */
(function () {
  "use strict";

  var CSS =
    ".hub-dues-rep label{display:block;font-size:13px;color:var(--muted);margin:0 0 4px;}" +
    ".hub-dues-rep input[type=text],.hub-dues-rep input[type=number],.hub-dues-rep input[type=search],.hub-dues-rep input[type=date],.hub-dues-rep select{" +
    "width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(168,128,28,.35);" +
    "background:#fff;font:inherit;font-size:16px;min-height:48px;}" +
    ".hub-dues-rep .hub-pay-top{display:grid;grid-template-columns:minmax(140px,220px);gap:12px;margin-bottom:12px;}" +
    ".hub-dues-rep .hub-pay-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 14px;}" +
    ".hub-dues-rep .hub-pay-tab{appearance:none;border:1px solid rgba(168,128,28,.4);background:#fff;border-radius:999px;" +
    "padding:10px 14px;font:inherit;font-size:14px;min-height:44px;cursor:pointer;color:#14532d;}" +
    ".hub-dues-rep .hub-pay-tab.on{background:#14532d;color:#fff;border-color:#14532d;}" +
    ".hub-dues-rep .hub-pay-note{margin:0 0 10px;font-size:13px;color:var(--muted);line-height:1.45;}" +
    ".hub-dues-rep .hub-pay-msg{margin:8px 0 0;font-size:14px;min-height:1.2em;color:#b3261e;}" +
    ".hub-dues-rep .hub-pay-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin:12px 0;}" +
    ".hub-dues-rep .hub-pay-card{background:#fffdf4;border:1px solid rgba(168,128,28,.35);border-radius:12px;padding:10px 12px;}" +
    ".hub-dues-rep .hub-pay-card b{display:block;font-family:var(--display);font-size:22px;color:#14532d;line-height:1.2;}" +
    ".hub-dues-rep .hub-pay-card span{display:block;font-size:12px;color:var(--muted);line-height:1.35;margin-top:4px;}" +
    ".hub-dues-rep h3{margin:16px 0 8px;font-family:var(--display);font-size:17px;color:#14532d;}" +
    ".hub-dues-rep .hub-pay-wrap{overflow-x:auto;border:1px solid rgba(168,128,28,.3);border-radius:12px;}" +
    ".hub-dues-rep table{width:100%;border-collapse:collapse;font-size:14px;min-width:640px;}" +
    ".hub-dues-rep th{background:linear-gradient(180deg,#166534,#14532d);color:#fff;text-align:left;padding:8px 10px;font-family:var(--display);font-weight:600;font-size:13px;}" +
    ".hub-dues-rep td{padding:7px 10px;border-top:1px solid rgba(168,128,28,.18);vertical-align:top;}" +
    ".hub-dues-rep tr:nth-child(even) td{background:#fffdf4;}" +
    ".hub-dues-rep td.num,.hub-dues-rep th.num{text-align:right;white-space:nowrap;}" +
    ".hub-dues-rep .hub-pay-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:8px 0 10px;}" +
    ".hub-dues-rep .hub-pay-kind{margin-top:14px;padding:12px;border-radius:12px;background:#f6efdd;border-left:4px solid #d4af37;}" +
    ".hub-dues-rep .hub-pay-kind h3{margin:0 0 6px;}" +
    ".hub-dues-rep .hub-pay-kind ul{margin:6px 0 0;padding-left:18px;}" +
    ".hub-dues-rep .hub-pay-kind li{margin:2px 0;font-size:14px;}" +
    ".hub-dues-rep .meta{color:var(--muted);font-size:12px;}" +
    ".hub-dues-rep .hub-age{margin-top:10px;padding-top:8px;border-top:1px solid rgba(168,128,28,.25);}" +
    ".hub-dues-rep .hub-pay-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;}" +
    ".hub-dues-rep .hub-pay-row .btn{min-height:48px;padding:12px 18px;font-size:16px;}" +
    ".hub-dues-rep .hub-pay-dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,220px));gap:10px;margin-top:8px;}";

  var LEVEL_ORDER = ["full", "associate", "loa", "auxiliary"];
  var LEVEL_LABEL = {
    full: "Full",
    associate: "Associate",
    loa: "Leave of absence",
    auxiliary: "Auxiliary"
  };
  var KIND_ORDER = ["elected_officer", "service_in_lieu", "board_approved_other", "unspecified"];
  var KIND_LABEL = {
    elected_officer: "Elected officer exemption",
    service_in_lieu: "Service in lieu",
    board_approved_other: "Other board-approved",
    unspecified: "Recorded waiver (kind not set)"
  };
  var BUCKETS = [
    { id: "future", title: "Not yet due" },
    { id: "d30", title: "1–30 days past due" },
    { id: "d60", title: "31–60 days past due" },
    { id: "d90", title: "61–90 days past due" },
    { id: "over", title: "Over 90 days past due" },
    { id: "none", title: "No due date" }
  ];
  var DUES_CSV_HEADERS = [
    "member_name", "email", "membership_level", "amount", "standard_amount",
    "status", "payment_method", "paid", "paid_date", "due_date",
    "waiver_kind", "waiver_status", "waiver_approved_by", "notes"
  ];
  var LEDGER_CSV_HEADERS = [
    "when", "payer_name", "email", "kind", "description", "amount",
    "membership_year", "matched"
  ];

  var state = {
    catalog: {},
    rows: [],
    recent: [],
    payments: [],
    paymentsError: "",
    duesError: "",
    tab: "ledger"
  };
  var loadSeq = 0;
  var wired = false;
  var tail = Promise.resolve();

  function injectCss() {
    if (document.getElementById("kosDuesReportingCss")) return;
    var s = document.createElement("style");
    s.id = "kosDuesReportingCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(v) {
    return (v == null ? "" : String(v)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function money(amount) {
    return "$" + num(amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function levelLabel(level) {
    return LEVEL_LABEL[level] || level || "Full";
  }

  function kindLabel(kind) {
    return KIND_LABEL[kind] || kind || "Waiver";
  }

  function fullName(m) {
    return (((m && m.first_name) || "") + " " + ((m && m.last_name) || "")).trim();
  }

  function year() {
    var n = parseInt(val("hubPayYear") || "2026", 10);
    if (!n || n < 2000 || n > 2100) return 2026;
    return n;
  }

  function todayISO() {
    var d = new Date();
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function parseDay(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function dayDiff(due, today) {
    var a = parseDay(due);
    var b = parseDay(today);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function formatRate(cash, outstanding) {
    var denom = cash + outstanding;
    if (!(denom > 0)) return "—";
    var pct = (cash / denom) * 100;
    return (Math.round(pct * 10) / 10).toFixed(1) + "%";
  }

  function rowStatus(d) {
    if (!d) return "unpaid";
    var method = String(d.payment_method || "");
    if (method === "waiver" || d.waiver_status === "applied") return "waived";
    if (d.paid === true || d.paid === "true") return "paid";
    return "unpaid";
  }

  function levelOf(d, member) {
    var level = (d && d.membership_level) || (member && member.membership_level) || "";
    if (LEVEL_LABEL[level]) return level;
    return level || "full";
  }

  function catalogRate(level) {
    var row = state.catalog[level];
    if (!row || row.amount == null || row.amount === "") return null;
    return num(row.amount);
  }

  function statusLabel(status) {
    if (status === "paid") return "Paid";
    if (status === "waived") return "Waived";
    return "Unpaid";
  }

  function buildRows(duesRows, memberMap) {
    var rows = (duesRows || []).map(function (d) {
      var member = memberMap[d.member_id] || null;
      var level = levelOf(d, member);
      var status = rowStatus(d);
      var amount = num(d.amount);
      var standard = (d.standard_amount == null || d.standard_amount === "") ? null : num(d.standard_amount);
      var rate = catalogRate(level);
      var waivedAmt = 0;
      if (status === "waived") waivedAmt = standard != null ? standard : (rate == null ? 0 : rate);
      return {
        name: member ? (fullName(member) || "Unknown member") : "Unknown member",
        email: (member && member.email) || "",
        level: level,
        status: status,
        amount: amount,
        standard: standard,
        waivedAmt: waivedAmt,
        cashAmt: status === "paid" ? amount : 0,
        dueAmt: status === "unpaid" ? amount : 0,
        method: d.payment_method || "",
        paid: status === "paid" || status === "waived",
        paidDate: d.paid_date ? String(d.paid_date).slice(0, 10) : "",
        dueDate: d.due_date ? String(d.due_date).slice(0, 10) : "",
        notes: d.notes || "",
        waiverKind: d.waiver_kind || "",
        waiverStatus: d.waiver_status || "",
        approver: d.waiver_approved_by || ""
      };
    });
    rows.sort(function (a, b) {
      var an = a.name.toLowerCase();
      var bn = b.name.toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });
    return rows;
  }

  function summarize(rows) {
    var cash = 0;
    var outstanding = 0;
    var waived = 0;
    (rows || []).forEach(function (r) {
      cash += r.cashAmt;
      outstanding += r.dueAmt;
      waived += r.waivedAmt;
    });
    return {
      invoiced: (rows || []).length,
      cash: cash,
      outstanding: outstanding,
      waived: waived,
      rate: formatRate(cash, outstanding)
    };
  }

  function byLevel(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      if (!map[r.level]) {
        map[r.level] = { level: r.level, invoiced: 0, cash: 0, waived: 0, outstanding: 0 };
      }
      var b = map[r.level];
      b.invoiced += 1;
      b.cash += r.cashAmt;
      b.waived += r.waivedAmt;
      b.outstanding += r.dueAmt;
    });
    return Object.keys(map).sort(function (a, b) {
      var ia = LEVEL_ORDER.indexOf(a);
      var ib = LEVEL_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a < b ? -1 : a > b ? 1 : 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }).map(function (k) { return map[k]; });
  }

  function waiverGroups(rows) {
    var groups = {
      elected_officer: [],
      service_in_lieu: [],
      board_approved_other: [],
      unspecified: []
    };
    (rows || []).forEach(function (r) {
      if (r.status !== "waived") return;
      if (groups[r.waiverKind]) groups[r.waiverKind].push(r);
      else groups.unspecified.push(r);
    });
    return groups;
  }

  function bucketOf(row, today) {
    if (!row || row.status !== "unpaid") return null;
    if (!row.dueDate) return "none";
    var days = dayDiff(row.dueDate, today);
    if (days == null) return "none";
    if (days <= 0) return "future";
    if (days <= 30) return "d30";
    if (days <= 60) return "d60";
    if (days <= 90) return "d90";
    return "over";
  }

  function csvCell(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildCsv(headers, rows) {
    return [headers].concat(rows).map(function (r) {
      return r.map(csvCell).join(",");
    }).join("\r\n");
  }

  function duesCsvRows(rows) {
    return (rows || []).map(function (r) {
      return [
        r.name,
        r.email,
        r.level,
        r.amount.toFixed(2),
        r.standard == null ? "" : r.standard.toFixed(2),
        r.status,
        r.method,
        r.paid ? "true" : "false",
        r.paidDate,
        r.dueDate,
        r.waiverKind,
        r.waiverStatus,
        r.approver,
        r.notes
      ];
    });
  }

  function ledgerInRange(payments, from, to) {
    return (payments || []).filter(function (p) {
      var day = String(p.created_at || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  }

  function ledgerCsvRows(payments) {
    return (payments || []).map(function (p) {
      var payer = p.payer_name || p.payer || "";
      return [
        String(p.created_at || p.when || "").slice(0, 10),
        payer,
        p.payer_email || p.email || "",
        p.product_kind || p.kind || "",
        p.description || "",
        (num(p.amount_cents) / 100).toFixed(2),
        p.membership_year == null ? "" : String(p.membership_year),
        (p.member_id || p.matched) ? "yes" : "no"
      ];
    });
  }

  function downloadCsv(filename, headers, rows) {
    var text = buildCsv(headers, rows);
    window.__kosLastCsv = { filename: filename, headers: headers.slice(), text: text };
    var blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function filteredRows() {
    var q = val("hubPaySearch").toLowerCase();
    var st = val("hubPayStatus") || "all";
    return state.rows.filter(function (r) {
      if (st !== "all" && r.status !== st) return false;
      if (!q) return true;
      return (r.name + " " + r.email + " " + levelLabel(r.level)).toLowerCase().indexOf(q) !== -1;
    });
  }

  function ensureCard() {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;
    var card = document.getElementById("hubPayments");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubPayments";
      var approvals = document.getElementById("hubApprovals");
      if (approvals && approvals.nextSibling) panel.insertBefore(card, approvals.nextSibling);
      else panel.appendChild(card);
    }
    return card;
  }

  function showTab(id) {
    state.tab = id;
    ["ledger", "season", "waivers", "export"].forEach(function (t) {
      var btn = document.getElementById("hubPayTab_" + t);
      var panel = document.getElementById("hubPayPanel_" + t);
      var on = t === id;
      if (btn) {
        btn.classList.toggle("on", on);
        btn.setAttribute("aria-selected", on ? "true" : "false");
      }
      if (panel) {
        if (on) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
      }
    });
  }

  function paintShell(card) {
    card.innerHTML =
      '<div class="app-head"><span class="ic">💵</span><div><h2>Dues &amp; Payments</h2>' +
      "<small>Season dues, waivers, exports, and the online payments ledger</small></div></div>" +
      '<div class="app-body hub-dues-rep">' +
      '<div class="hub-pay-top"><div><label for="hubPayYear">Membership year</label>' +
      '<input id="hubPayYear" type="number" min="2000" max="2100" value="2026" /></div></div>' +
      '<div class="hub-pay-tabs" id="hubPayTabs" role="tablist" aria-label="Dues and payments">' +
      '<button type="button" class="hub-pay-tab on" id="hubPayTab_ledger" role="tab" aria-selected="true">Cash ledger</button>' +
      '<button type="button" class="hub-pay-tab" id="hubPayTab_season" role="tab" aria-selected="false">Dues season</button>' +
      '<button type="button" class="hub-pay-tab" id="hubPayTab_waivers" role="tab" aria-selected="false">Waivers</button>' +
      '<button type="button" class="hub-pay-tab" id="hubPayTab_export" role="tab" aria-selected="false">Export</button>' +
      "</div>" +
      '<div id="hubPayPanel_ledger" role="tabpanel"><p class="empty">Loading payments…</p></div>' +
      '<div id="hubPayPanel_season" role="tabpanel" hidden><p class="empty">Loading season…</p></div>' +
      '<div id="hubPayPanel_waivers" role="tabpanel" hidden><p class="empty">Loading waivers…</p></div>' +
      '<div id="hubPayPanel_export" role="tabpanel" hidden></div>' +
      '<p class="hub-pay-msg" id="hubPayMsg" aria-live="polite"></p>' +
      "</div>";
  }

  function renderLedger() {
    var panel = document.getElementById("hubPayPanel_ledger");
    if (!panel) return;
    var note = '<p class="hub-pay-note">Latest online payments recorded automatically. This list is not added into season cash — a dues payment already on the season row would be counted twice.</p>';
    if (!state.recent.length) {
      panel.innerHTML = note + '<p class="empty">No online payments yet. They appear here automatically once the payment system is connected (see PAYMENTS_SETUP.md).</p>';
      return;
    }
    var html = note + '<div class="hub-pay-wrap"><table><thead><tr>' +
      "<th>When</th><th>Who</th><th>What</th><th class=\"num\">Amount</th></tr></thead><tbody>";
    state.recent.forEach(function (r) {
      var when = String(r.when || "").slice(0, 10);
      html += "<tr><td>" + esc(when) + "</td><td>" + esc(r.payer || "?") +
        (r.matched ? "" : ' <span style="color:#b3261e;">(no roster match)</span>') +
        "</td><td>" + esc(r.description || r.kind || "") +
        '</td><td class="num">' + esc(money(num(r.amount_cents) / 100)) + "</td></tr>";
    });
    html += "</tbody></table></div>";
    panel.innerHTML = html;
  }

  function renderSeason() {
    var panel = document.getElementById("hubPayPanel_season");
    if (!panel) return;
    if (state.duesError) {
      panel.innerHTML = '<p class="hub-pay-msg">' + esc(state.duesError) + "</p>";
      return;
    }
    var sum = summarize(state.rows);
    var levels = byLevel(state.rows);
    var html =
      '<p class="hub-pay-note">Cash collected is the sum of paid dues rows whose method is not waiver. Waived dues stay out of cash and out of the collection-rate denominator. Collection rate is cash ÷ (cash + outstanding).</p>' +
      '<div class="hub-pay-cards">' +
      '<div class="hub-pay-card"><b id="hubPayInvoiced">' + esc(String(sum.invoiced)) + '</b><span>Members invoiced</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayCash">' + esc(money(sum.cash)) + '</b><span>Cash collected</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayOutstanding">' + esc(money(sum.outstanding)) + '</b><span>Outstanding</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayWaived">' + esc(money(sum.waived)) + '</b><span>Waived value</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayRate">' + esc(sum.rate) + '</b><span>Collection rate</span></div>' +
      "</div>" +
      "<h3>By membership level</h3>" +
      '<div class="hub-pay-wrap"><table id="hubPayLevels"><thead><tr>' +
      '<th>Level</th><th class="num">Invoiced</th><th class="num">Paid cash</th><th class="num">Waived</th>' +
      '<th class="num">Outstanding</th><th class="num">Catalog rate</th></tr></thead><tbody>';
    if (!levels.length) {
      html += '<tr><td colspan="6">No dues rows for this year.</td></tr>';
    }
    levels.forEach(function (b) {
      var rate = catalogRate(b.level);
      html += '<tr data-level="' + esc(b.level) + '"><td>' + esc(levelLabel(b.level)) +
        '</td><td class="num">' + esc(String(b.invoiced)) +
        '</td><td class="num">' + esc(money(b.cash)) +
        '</td><td class="num">' + esc(money(b.waived)) +
        '</td><td class="num">' + esc(money(b.outstanding)) +
        '</td><td class="num">' + (rate == null ? "—" : esc(money(rate))) + "</td></tr>";
    });
    html += "</tbody></table></div>" +
      "<h3>Member detail</h3>" +
      '<div class="hub-pay-filters">' +
      '<div><label for="hubPaySearch">Search</label><input id="hubPaySearch" type="search" placeholder="Name or email" autocomplete="off" /></div>' +
      '<div><label for="hubPayStatus">Status</label><select id="hubPayStatus">' +
      '<option value="all">All</option><option value="unpaid">Unpaid</option>' +
      '<option value="paid">Paid</option><option value="waived">Waived</option></select></div></div>' +
      '<div id="hubPayMembers"></div>' +
      '<h3>Aging</h3>' +
      '<p class="hub-pay-note">Unpaid dues by due date. This screen does not send email. Reminders stay on the existing path: Send invoices, and the steps in DUES_REMINDER_AUTOMATION.md.</p>' +
      '<div id="hubPayAging"></div>';
    panel.innerHTML = html;
    var search = document.getElementById("hubPaySearch");
    var status = document.getElementById("hubPayStatus");
    if (search) search.addEventListener("input", renderMembers);
    if (status) status.addEventListener("change", renderMembers);
    renderMembers();
    renderAging();
  }

  function renderMembers() {
    var host = document.getElementById("hubPayMembers");
    if (!host) return;
    var rows = filteredRows();
    if (!rows.length) {
      host.innerHTML = '<p class="empty">No members match this filter.</p>';
      return;
    }
    var html = '<div class="hub-pay-wrap"><table><thead><tr>' +
      "<th>Name</th><th>Level</th><th class=\"num\">Amount owed</th><th>Status</th><th>Method</th><th>Paid date</th><th>Notes</th>" +
      "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var notes = r.notes || "";
      if (notes.length > 80) notes = notes.slice(0, 77) + "...";
      html += "<tr><td>" + esc(r.name) + "</td><td>" + esc(levelLabel(r.level)) +
        '</td><td class="num">' + esc(money(r.dueAmt)) + "</td><td>" + esc(statusLabel(r.status)) +
        "</td><td>" + esc(r.method || "—") + "</td><td>" + esc(r.paidDate || "—") +
        "</td><td>" + esc(notes || "—") + "</td></tr>";
    });
    html += "</tbody></table></div>";
    host.innerHTML = html;
  }

  function renderAging() {
    var host = document.getElementById("hubPayAging");
    if (!host) return;
    var today = todayISO();
    var groups = {};
    BUCKETS.forEach(function (b) { groups[b.id] = []; });
    state.rows.forEach(function (r) {
      var id = bucketOf(r, today);
      if (id && groups[id]) groups[id].push(r);
    });
    host.innerHTML = BUCKETS.map(function (b) {
      var list = groups[b.id];
      var total = 0;
      list.forEach(function (r) { total += r.dueAmt; });
      var names = list.map(function (r) {
        return "<li>" + esc(r.name) + " · " + esc(money(r.dueAmt)) + "</li>";
      }).join("");
      return '<div class="hub-age" data-bucket="' + b.id + '"><h3>' + esc(b.title) + "</h3>" +
        '<p class="hub-pay-note">' + list.length + " · " + esc(money(total)) + "</p>" +
        (names ? "<ul>" + names + "</ul>" : '<p class="empty">None</p>') + "</div>";
    }).join("");
  }

  function renderWaivers() {
    var panel = document.getElementById("hubPayPanel_waivers");
    if (!panel) return;
    var groups = waiverGroups(state.rows);
    var html =
      '<p class="hub-pay-note">Applied waivers for this season, split by kind. Waived value is <code>standard_amount</code> (the catalog rate), not cash. To request, approve, or deny a waiver, use Officer desk → Email &amp; invoices → Dues waivers. This tab does not change those rows.</p>' +
      '<div id="hubPayWaiverReport">';
    KIND_ORDER.forEach(function (kind) {
      var list = groups[kind] || [];
      if (kind === "unspecified" && !list.length) return;
      var total = 0;
      list.forEach(function (r) { total += r.waivedAmt; });
      var names = list.map(function (r) {
        var who = r.approver ? r.approver : "not recorded";
        return "<li>" + esc(r.name) + ' <span class="meta">approved by ' + esc(who) + "</span></li>";
      }).join("");
      html += '<section class="hub-pay-kind" data-kind="' + esc(kind) + '"><h3>' + esc(kindLabel(kind)) + "</h3>" +
        "<p>" + list.length + " · waived value " + esc(money(total)) + "</p>" +
        (names ? "<ul>" + names + "</ul>" : '<p class="empty">None</p>') + "</section>";
    });
    html += "</div>";
    panel.innerHTML = html;
  }

  function renderExport() {
    var panel = document.getElementById("hubPayPanel_export");
    if (!panel) return;
    var y = year();
    var from = val("hubPayFrom") || (y + "-01-01");
    var to = val("hubPayTo") || (y + "-12-31");
    var count = ledgerInRange(state.payments, from, to).length;
    panel.innerHTML =
      '<p class="hub-pay-note">Downloads are built in the browser from rows you can already read. No new edge function. Waived dues stay marked waiver — they are not exported as cash.</p>' +
      "<h3>Dues season</h3>" +
      '<p class="hub-pay-note">One row per dues invoice for ' + y + ': name, email, level, amounts, status, and waiver fields.</p>' +
      '<div class="hub-pay-row"><button class="btn btn-primary" type="button" id="hubPayDuesCsv">Download dues CSV</button></div>' +
      "<h3>Payments ledger</h3>" +
      '<p class="hub-pay-note">Online payments whose recorded date falls in this range. Defaults to the membership year. This is the ledger, separate from the season cash total.</p>' +
      '<div class="hub-pay-dates">' +
      '<div><label for="hubPayFrom">From</label><input id="hubPayFrom" type="date" value="' + esc(from) + '" /></div>' +
      '<div><label for="hubPayTo">To</label><input id="hubPayTo" type="date" value="' + esc(to) + '" /></div></div>' +
      '<p class="hub-pay-note" id="hubPayLedgerCount">' + count + " payment" + (count === 1 ? "" : "s") + " in this range.</p>" +
      (state.paymentsError ? '<p class="hub-pay-msg">' + esc(state.paymentsError) + "</p>" : "") +
      '<div class="hub-pay-row"><button class="btn btn-primary" type="button" id="hubPayLedgerCsv">Download payments CSV</button></div>';
    document.getElementById("hubPayDuesCsv").addEventListener("click", function () {
      var yNow = year();
      downloadCsv("kos-dues-" + yNow + ".csv", DUES_CSV_HEADERS, duesCsvRows(state.rows));
    });
    function refreshCount() {
      var n = ledgerInRange(state.payments, val("hubPayFrom"), val("hubPayTo")).length;
      var el = document.getElementById("hubPayLedgerCount");
      if (el) el.textContent = n + " payment" + (n === 1 ? "" : "s") + " in this range.";
    }
    document.getElementById("hubPayFrom").addEventListener("change", refreshCount);
    document.getElementById("hubPayTo").addEventListener("change", refreshCount);
    document.getElementById("hubPayLedgerCsv").addEventListener("click", function () {
      var fromDay = val("hubPayFrom");
      var toDay = val("hubPayTo");
      var slice = ledgerInRange(state.payments, fromDay, toDay);
      downloadCsv("kos-payments-" + (fromDay || "from") + "-to-" + (toDay || "end") + ".csv", LEDGER_CSV_HEADERS, ledgerCsvRows(slice));
    });
  }

  function renderAll() {
    renderLedger();
    renderSeason();
    renderWaivers();
    renderExport();
    showTab(state.tab);
  }

  async function rowsOf(builder) {
    var res = await builder;
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function paged(client, table, columns, apply) {
    var size = 1000;
    var start = 0;
    var all = [];
    while (true) {
      var q = client.from(table).select(columns);
      if (apply) q = apply(q);
      var res = await q.range(start, start + size - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < size) break;
      start += size;
    }
    return all;
  }

  function asList(data) {
    if (!data) return [];
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return []; }
    }
    return Array.isArray(data) ? data : [];
  }

  async function load(client) {
    var seq = ++loadSeq;
    var y = year();
    var msg = document.getElementById("hubPayMsg");
    if (msg) msg.textContent = "";
    state.duesError = "";
    state.paymentsError = "";
    try {
      var catalogRows = await rowsOf(
        client.from("kos_dues_catalog")
          .select("membership_year, level, amount, active")
          .eq("membership_year", y)
          .eq("active", true)
      );
      var roster = await paged(
        client,
        "members",
        "id, first_name, last_name, email, membership_level, membership_status",
        function (q) { return q.is("merged_into", null); }
      );
      var duesRows = await paged(
        client,
        "dues_payments",
        "id, member_id, membership_year, amount, due_date, paid, paid_date, payment_method, notes, membership_level, standard_amount, waiver_kind, waiver_status, waiver_approved_by",
        function (q) { return q.eq("membership_year", y); }
      );
      if (seq !== loadSeq) return;
      state.catalog = {};
      catalogRows.forEach(function (row) {
        if (row && row.level) state.catalog[row.level] = row;
      });
      var memberMap = {};
      roster.forEach(function (m) {
        if (m && m.id) memberMap[m.id] = m;
      });
      state.rows = buildRows(duesRows, memberMap);
    } catch (e) {
      if (seq !== loadSeq) return;
      state.rows = [];
      state.catalog = {};
      state.duesError = (e && e.message) || "Could not load dues for this year.";
    }
    try {
      var recent = await client.rpc("list_recent_payments", { p_limit: 50 });
      if (seq !== loadSeq) return;
      state.recent = asList(recent && recent.data);
    } catch (e2) {
      if (seq !== loadSeq) return;
      state.recent = [];
    }
    try {
      state.payments = await paged(
        client,
        "payments",
        "id, created_at, amount_cents, product_kind, payer_email, payer_name, description, member_id, membership_year",
        function (q) { return q.order("created_at", { ascending: false }); }
      );
    } catch (e3) {
      if (seq !== loadSeq) return;
      state.payments = [];
      state.paymentsError = (e3 && e3.message) || "Could not read the payments ledger for export.";
    }
    if (seq !== loadSeq) return;
    renderAll();
  }

  function wire(card, client) {
    if (wired) return;
    wired = true;
    card.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.id || t.id.indexOf("hubPayTab_") !== 0) return;
      showTab(t.id.slice("hubPayTab_".length));
    });
    var yearEl = document.getElementById("hubPayYear");
    if (yearEl) {
      yearEl.addEventListener("change", function () {
        var y = year();
        var from = document.getElementById("hubPayFrom");
        var to = document.getElementById("hubPayTo");
        if (from) from.value = y + "-01-01";
        if (to) to.value = y + "-12-31";
        load(client);
      });
    }
  }

  async function allowed(client) {
    try {
      var res = await client.rpc("can_view_payments");
      return !!(res && res.data);
    } catch (e) {
      return false;
    }
  }

  async function run(client) {
    injectCss();
    var ok = await allowed(client);
    if (!ok) {
      window.__kosDuesReportingReady = "denied";
      return false;
    }
    var card = ensureCard();
    if (!card) {
      window.__kosDuesReportingReady = "nopanel";
      return false;
    }
    if (!card.querySelector("#hubPayTabs")) paintShell(card);
    wire(card, client);
    await load(client);
    window.__kosDuesReportingReady = "shown";
    if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();
    return true;
  }

  window.kosRenderDuesPayments = function (client) {
    if (!client) return Promise.resolve(false);
    var job = tail.then(function () { return run(client); });
    tail = job.then(function () { return null; }, function () { return null; });
    return job;
  };

  async function boot() {
    injectCss();
    var client = window.__kosSb || null;
    for (var i = 0; i < 40 && !client; i++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      client = window.__kosSb || null;
    }
    if (!client) return;
    try {
      await window.kosRenderDuesPayments(client);
    } catch (e) {
      window.__kosDuesReportingReady = "error";
    }
  }

  var _unlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof _unlock === "function") _unlock();
    setTimeout(boot, 160);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 600); });
  } else {
    setTimeout(boot, 600);
  }
})();
