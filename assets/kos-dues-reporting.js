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
    ".hub-dues-rep{color:#1c3324;}" +
    ".hub-dues-rep .hub-pay-note{margin:0 0 10px;font-size:15px;color:#1c3324;line-height:1.45;}" +
    ".hub-dues-rep .hub-pay-msg{margin:8px 0 0;font-size:14px;min-height:1.2em;color:#8a1c12;}" +
    ".hub-dues-rep .hub-pay-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin:12px 0;}" +
    ".hub-dues-rep .hub-pay-card{background:#fffdf4;border:1px solid rgba(168,128,28,.35);border-radius:12px;padding:10px 12px;}" +
    ".hub-dues-rep .hub-pay-card b{display:block;font-family:var(--display);font-size:22px;color:#14532d;line-height:1.2;}" +
    ".hub-dues-rep .hub-pay-card span{display:block;font-size:13px;color:#1c3324;line-height:1.35;margin-top:4px;}" +
    ".hub-dues-rep h3{margin:16px 0 8px;font-family:var(--display);font-size:17px;color:#14532d;}" +
    ".hub-dues-rep .hub-pay-wrap{overflow-x:auto;border:1px solid rgba(168,128,28,.3);border-radius:12px;background:#fff;}" +
    ".hub-dues-rep table{width:100%;border-collapse:collapse;font-size:15px;min-width:640px;color:#1c3324;}" +
    ".hub-dues-rep th{background:linear-gradient(180deg,#166534,#14532d);color:#fff;text-align:left;padding:8px 10px;font-family:var(--display);font-weight:600;font-size:13px;}" +
    ".hub-dues-rep td{padding:7px 10px;border-top:1px solid rgba(168,128,28,.18);vertical-align:top;color:#1c3324;}" +
    ".hub-dues-rep tr:nth-child(even) td{background:#fffdf4;}" +
    ".hub-dues-rep tfoot td{font-weight:700;color:#102816;background:#e7f3ea;border-top:2px solid #14532d;}" +
    ".hub-dues-rep td.num,.hub-dues-rep th.num{text-align:right;white-space:nowrap;}" +
    ".hub-dues-rep .hub-pay-src{display:inline-block;padding:2px 8px;border-radius:999px;background:#14532d;color:#f6efdc;border:1px solid #ecd07e;font-weight:700;line-height:1.3;}" +
    "@media (max-width:720px){" +
    ".hub-dues-rep .hub-pay-wrap{overflow:visible;}" +
    ".hub-dues-rep table.hub-pay-stack{min-width:0;}" +
    ".hub-dues-rep table.hub-pay-stack thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}" +
    ".hub-dues-rep table.hub-pay-stack tr{display:block;padding:10px 12px;border-top:1px solid rgba(168,128,28,.35);}" +
    ".hub-dues-rep table.hub-pay-stack td{display:flex;justify-content:space-between;gap:12px;align-items:baseline;border:0;padding:3px 0;text-align:left;}" +
    ".hub-dues-rep table.hub-pay-stack td::before{content:attr(data-label);font-weight:700;color:#14532d;flex:none;}" +
    ".hub-dues-rep table.hub-pay-stack td.num{text-align:right;}" +
    "}" +
    ".hub-dues-rep .hub-pay-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:8px 0 10px;}" +
    ".hub-dues-rep .hub-pay-kind{margin-top:14px;padding:12px;border-radius:12px;background:#f6efdd;border-left:4px solid #d4af37;}" +
    ".hub-dues-rep .hub-pay-kind h3{margin:0 0 6px;}" +
    ".hub-dues-rep .hub-pay-kind ul{margin:6px 0 0;padding-left:18px;}" +
    ".hub-dues-rep .hub-pay-kind li{margin:2px 0;font-size:14px;}" +
    ".hub-dues-rep .meta{color:var(--muted);font-size:12px;}" +
    ".hub-dues-rep .hub-age{margin-top:10px;padding-top:8px;border-top:1px solid rgba(168,128,28,.25);}" +
    ".hub-dues-rep .hub-pay-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;}" +
    ".hub-dues-rep .hub-pay-row .btn{min-height:48px;padding:12px 18px;font-size:16px;}" +
    ".hub-dues-rep .hub-pay-dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,220px));gap:10px;margin-top:8px;}" +
    ".hub-dues-rep .hub-pay-name{background:none;border:0;padding:0;font:inherit;color:#14532d;text-decoration:underline;cursor:pointer;text-align:left;}" +
    ".hub-dues-rep .hub-pay-drawer{margin-top:12px;padding:12px;border-radius:12px;background:#fff;border:1px solid rgba(168,128,28,.35);}" +
    ".hub-dues-rep .hub-pay-modal{position:fixed;inset:0;background:rgba(20,40,20,.45);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px;}" +
    ".hub-dues-rep .hub-pay-modal form{background:#fffdf6;border-radius:16px;padding:18px;width:min(440px,100%);border:1px solid rgba(168,128,28,.45);}" +
    ".hub-dues-rep .hub-pay-void{color:#8a1c12;}";

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
  var LEDGER_V7_HEADERS = [
    "when", "payer_name", "source", "method", "check_number", "amount", "voided"
  ];

  var state = {
    catalog: {},
    rows: [],
    recent: [],
    payments: [],
    paymentsError: "",
    duesError: "",
    tab: "ledger",
    ledger: null,
    canRecord: false,
    methodFilter: "all",
    seasonReport: null,
    roster: [],
    reconcile: null
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

  function isWildApricotMethod(method, notes) {
    return String(method || "").toLowerCase() === "other" && /wild apricot/i.test(String(notes || ""));
  }

  function paymentMethodLabel(method, notes) {
    var raw = String(method || "").trim();
    if (!raw) return "";
    if (raw.toLowerCase() === "other") return isWildApricotMethod(raw, notes) ? "Wild Apricot" : "Other";
    return raw;
  }

  function ledgerSourceLabel(row) {
    var source = String((row && row.source) || "");
    if (/wild apricot/i.test(source)) return "Wild Apricot";
    var method = String((row && row.method) || "");
    var note = (row && (row.note || row.notes)) || "";
    if (method.toLowerCase() === "other") return isWildApricotMethod(method, note) ? "Wild Apricot" : "Other";
    return method || source || "";
  }

  function sourceHtml(label) {
    if (label === "Wild Apricot") return '<span class="hub-pay-src">Wild Apricot</span>';
    return esc(label || "");
  }

  function rowDollars(row) {
    if (!row) return 0;
    if (row.amount_cents != null && row.amount_cents !== "") return num(row.amount_cents) / 100;
    return num(row.amount);
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
        memberId: d.member_id,
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
    var apricot = 0;
    (rows || []).forEach(function (r) {
      cash += r.cashAmt;
      outstanding += r.dueAmt;
      waived += r.waivedAmt;
      if (r.status === "paid" && isWildApricotMethod(r.method, r.notes)) apricot += r.cashAmt;
    });
    return {
      invoiced: (rows || []).length,
      cash: cash,
      apricot: apricot,
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
        paymentMethodLabel(r.method, r.notes),
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
    ["ledger", "season", "waivers", "zeffy", "export"].forEach(function (t) {
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
      "<small>Season dues, waivers, exports, and the cash ledger</small></div></div>" +
      '<div class="app-body hub-dues-rep">' +
      '<div class="hub-pay-top"><div><label for="hubPayYear">Membership year</label>' +
      '<input id="hubPayYear" type="number" min="2000" max="2100" value="2026" /></div></div>' +
      '<div class="hub-pay-tabs" id="hubPayTabs" role="tablist" aria-label="Dues and payments">' +
      '<button type="button" class="hub-pay-tab on" id="hubPayTab_ledger" role="tab" aria-selected="true">Cash ledger</button>' +
      '<button type="button" class="hub-pay-tab" id="hubPayTab_season" role="tab" aria-selected="false">Dues season</button>' +
      '<button type="button" class="hub-pay-tab" id="hubPayTab_waivers" role="tab" aria-selected="false">Waivers</button>' +
      '<button type="button" class="hub-pay-tab" id="hubPayTab_zeffy" role="tab" aria-selected="false">Check Zeffy</button>' +
      '<button type="button" class="hub-pay-tab" id="hubPayTab_export" role="tab" aria-selected="false">Export</button>' +
      "</div>" +
      '<div id="hubPayPanel_ledger" role="tabpanel"><p class="empty">Loading payments…</p></div>' +
      '<div id="hubPayPanel_season" role="tabpanel" hidden><p class="empty">Loading season…</p></div>' +
      '<div id="hubPayPanel_waivers" role="tabpanel" hidden><p class="empty">Loading waivers…</p></div>' +
      '<div id="hubPayPanel_zeffy" role="tabpanel" hidden><p class="empty">Loading the Zeffy check…</p></div>' +
      '<div id="hubPayPanel_export" role="tabpanel" hidden></div>' +
      '<p class="hub-pay-msg" id="hubPayMsg" aria-live="polite"></p>' +
      "</div>";
  }

  function seasonStart(y) {
    return y + "-06-01";
  }

  function seasonEnd(y) {
    return (y + 1) + "-05-31";
  }

  function rosterStatus(status) {
    if (status === "lapsed") return "Delinquent";
    if (status === "pending-renewal") return "Pending dues";
    if (status === "dues-pending") return "Induction pending";
    if (status === "active") return "Active";
    return status || "";
  }

  function canRecordStatus(status) {
    return status === "active" || status === "lapsed" || status === "pending-renewal" || status === "dues-pending";
  }

  function catalogAmount(level) {
    var row = state.catalog[level || "full"];
    return row ? num(row.amount) : null;
  }

  function wildApricotDuesRows() {
    return (state.rows || []).filter(function (r) {
      return r.status === "paid" && isWildApricotMethod(r.method, r.notes);
    });
  }

  function ledgerRowMatches(row, filter) {
    if (!filter || filter === "all") return true;
    if (filter === "Wild Apricot") return ledgerSourceLabel(row) === "Wild Apricot";
    return row.source === filter || row.method === filter;
  }

  function renderLedger() {
    var panel = document.getElementById("hubPayPanel_ledger");
    if (!panel) return;
    if (!state.ledger) {
      var apricotRows = wildApricotDuesRows();
      var listed = [];
      (state.recent || []).forEach(function (r) {
        listed.push({
          when: String(r.when || "").slice(0, 10),
          name: r.payer || "?",
          source: "Zeffy",
          detail: r.description || r.kind || "",
          amount: num(r.amount_cents) / 100,
          unmatched: !r.matched
        });
      });
      apricotRows.forEach(function (r) {
        var email = String(r.email || "").toLowerCase();
        var name = String(r.name || "").toLowerCase();
        var already = (state.recent || []).some(function (pay) {
          var kind = String(pay.kind || pay.product_kind || "").toLowerCase();
          if (kind && kind !== "dues") return false;
          var payEmail = String(pay.email || pay.payer_email || "").toLowerCase();
          var payName = String(pay.payer || pay.payer_name || "").toLowerCase();
          if (email && payEmail && email === payEmail) return true;
          return !!(name && payName && name === payName);
        });
        if (already) return;
        listed.push({
          when: r.paidDate,
          name: r.name,
          source: "Wild Apricot",
          detail: "Dues",
          amount: r.cashAmt,
          unmatched: false
        });
      });
      var apricotTotal = 0;
      listed.forEach(function (r) {
        if (r.source === "Wild Apricot") apricotTotal += r.amount;
      });
      var note = '<p class="hub-pay-note">Zeffy payments, plus Wild Apricot dues from this season. Wild Apricot is already inside Cash collected on Dues season. This list does not add that money again, and it does not repeat cash, check, or waivers.</p>';
      if (listed.some(function (r) { return r.source === "Wild Apricot"; })) {
        note += '<div class="hub-pay-cards"><div class="hub-pay-card"><b id="hubPayApricotLedger">' + esc(money(apricotTotal)) +
          '</b><span>Wild Apricot dues, not added again to cash collected</span></div></div>';
      }
      listed.sort(function (a, b) {
        if (a.when === b.when) return 0;
        return a.when < b.when ? 1 : -1;
      });
      if (!listed.length) {
        panel.innerHTML = note + '<p class="empty">No payments in this list yet.</p>';
        return;
      }
      var old = note + '<div class="hub-pay-wrap"><table class="hub-pay-stack"><thead><tr>' +
        "<th>When</th><th>Who</th><th>Source</th><th>What</th><th class=\"num\">Amount</th></tr></thead><tbody>";
      listed.forEach(function (r) {
        old += "<tr><td data-label=\"When\">" + esc(r.when) + "</td><td data-label=\"Who\">" + esc(r.name) +
          (r.unmatched ? ' <span style="color:#8a1c12;">(no roster match)</span>' : "") +
          "</td><td data-label=\"Source\">" + sourceHtml(r.source) +
          "</td><td data-label=\"What\">" + esc(r.detail) +
          '</td><td class="num" data-label="Amount">' + esc(money(r.amount)) + "</td></tr>";
      });
      old += "</tbody></table></div>";
      panel.innerHTML = old;
      return;
    }
    var allRows = state.ledger.rows || [];
    var apricot = 0;
    allRows.forEach(function (r) {
      if (r.voided) return;
      if (ledgerSourceLabel(r) === "Wild Apricot") apricot += rowDollars(r);
    });
    var deposit = money(num(state.ledger.deposit_total_cents) / 100);
    var days = state.ledger.deposits_by_day || [];
    var dayHtml = days.map(function (d) {
      return "<li>" + esc(d.day) + " · " + esc(money(num(d.total_cents) / 100)) + "</li>";
    }).join("");
    var filter = state.methodFilter || "all";
    var rows = allRows.filter(function (r) { return ledgerRowMatches(r, filter); });
    var html =
      '<p class="hub-pay-note">June 1 through May 31. Deposit total is cash and check that has not been voided. The Wild Apricot card is every Wild Apricot row in this season. That money is already inside Cash collected on Dues season, so it is not added to the deposit total. Zeffy card payments and waivers are listed and are not in the deposit total. Filtering the list does not change the cards.</p>' +
      '<div class="hub-pay-cards"><div class="hub-pay-card"><b id="hubPayDeposit">' + esc(deposit) +
      '</b><span>Deposit total (cash and check)</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayApricotLedger">' + esc(money(apricot)) +
      '</b><span>Wild Apricot dues, not in the deposit total</span></div></div>' +
      (dayHtml ? "<ul>" + dayHtml + "</ul>" : "") +
      '<div class="hub-pay-filters">' +
      '<div><label for="hubPayMethod">Source</label><select id="hubPayMethod">' +
      optionFilter("all", "All sources", filter) +
      optionFilter("Wild Apricot", "Wild Apricot", filter) +
      optionFilter("zeffy", "Zeffy", filter) +
      optionFilter("cash", "Cash", filter) +
      optionFilter("check", "Check", filter) +
      optionFilter("waiver", "Waiver", filter) +
      "</select></div></div>" +
      '<div class="hub-pay-row"><button class="btn btn-primary" type="button" id="hubPayRecord">Record cash or check</button></div>' +
      '<div id="hubPayRecordSearchWrap" hidden>' +
      '<label for="hubPayRecordSearch">Member</label>' +
      '<input id="hubPayRecordSearch" type="search" placeholder="Name or email" autocomplete="off" />' +
      '<div id="hubPayRecordHits"></div></div>' +
      '<div class="hub-pay-wrap"><table class="hub-pay-stack"><thead><tr>' +
      "<th>When</th><th>Who</th><th>Source</th><th>Check</th><th class=\"num\">Amount</th><th></th></tr></thead><tbody>";
    if (!rows.length) html += '<tr><td colspan="6">No rows in this filter.</td></tr>';
    rows.forEach(function (r) {
      var label = ledgerSourceLabel(r);
      var tools = "";
      if (state.canRecord && r.receipt_id && !r.voided && label !== "Wild Apricot" && r.source !== "zeffy" && r.source !== "waiver") {
        tools = '<button type="button" class="btn" data-void="' + esc(r.receipt_id) + '">Void</button> ' +
          '<button type="button" class="btn" data-adjust="' + esc(r.receipt_id) + '">Adjust</button>';
      }
      html += "<tr" + (r.voided ? ' class="hub-pay-void"' : "") + "><td data-label=\"When\">" + esc(String(r.when || "").slice(0, 10)) +
        "</td><td data-label=\"Who\">" + esc(r.name || "") + (r.voided ? " (voided)" : "") +
        "</td><td data-label=\"Source\">" + sourceHtml(label) +
        "</td><td data-label=\"Check\">" + esc(r.check_number || "") +
        '</td><td class="num" data-label="Amount">' + esc(money(rowDollars(r))) +
        "</td><td data-label=\"\">" + tools + "</td></tr>";
    });
    html += "</tbody></table></div>";
    panel.innerHTML = html;
    var method = document.getElementById("hubPayMethod");
    if (method) method.addEventListener("change", function () {
      state.methodFilter = method.value;
      renderLedger();
    });
    var record = document.getElementById("hubPayRecord");
    if (record) record.addEventListener("click", function () {
      var wrap = document.getElementById("hubPayRecordSearchWrap");
      if (wrap) wrap.hidden = false;
      var box = document.getElementById("hubPayRecordSearch");
      if (box) box.focus();
      renderRecordHits();
    });
    var search = document.getElementById("hubPayRecordSearch");
    if (search) search.addEventListener("input", renderRecordHits);
  }

  function optionFilter(value, label, current) {
    return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + ">" + esc(label) + "</option>";
  }

  function renderRecordHits() {
    var host = document.getElementById("hubPayRecordHits");
    var box = document.getElementById("hubPayRecordSearch");
    if (!host || !box) return;
    var q = String(box.value || "").trim().toLowerCase();
    var hits = state.roster.filter(function (m) {
      if (!canRecordStatus(m.membership_status)) return false;
      if (!q) return true;
      return (fullName(m) + " " + (m.email || "")).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);
    if (!hits.length) {
      host.innerHTML = '<p class="empty">No matching member.</p>';
      return;
    }
    host.innerHTML = hits.map(function (m) {
      return '<button type="button" class="btn" data-record-member="' + esc(m.id) + '">' +
        esc(fullName(m)) + " · " + esc(rosterStatus(m.membership_status)) + "</button>";
    }).join(" ");
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
    var owing = "";
    if (state.seasonReport && state.seasonReport.ok !== false) {
      var ren = (state.seasonReport.invoiced_unpaid && state.seasonReport.invoiced_unpaid.renewal) || {};
      var notYet = state.seasonReport.not_invoiced || {};
      owing = '<p id="hubPayOwing"><b>' + esc(String(ren.count || 0)) + "</b> invoiced and unpaid + <b>" +
        esc(String(notYet.count || 0)) + "</b> not invoiced yet = <b>" +
        esc(String(state.seasonReport.owing_total || 0)) + "</b> owing (matches Renewals)</p>";
    }
    var html = owing +
      '<p class="hub-pay-note">Cash collected counts every paid row except waivers, so it includes the Wild Apricot card. Waived dues stay out of Cash collected and out of the collection rate. Collection rate is cash divided by cash plus outstanding. All levels matches these cards.</p>' +
      '<div class="hub-pay-cards">' +
      '<div class="hub-pay-card"><b id="hubPayInvoiced">' + esc(String(sum.invoiced)) + '</b><span>Members invoiced</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayCash">' + esc(money(sum.cash)) + '</b><span>Cash collected</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayApricot">' + esc(money(sum.apricot)) + '</b><span>Wild Apricot, included in cash collected</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayOutstanding">' + esc(money(sum.outstanding)) + '</b><span>Outstanding</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayWaived">' + esc(money(sum.waived)) + '</b><span>Waived value</span></div>' +
      '<div class="hub-pay-card"><b id="hubPayRate">' + esc(sum.rate) + '</b><span>Collection rate</span></div>' +
      "</div>" +
      "<h3>By membership level</h3>" +
      '<div class="hub-pay-wrap"><table id="hubPayLevels" class="hub-pay-stack"><thead><tr>' +
      '<th>Level</th><th class="num">Invoiced</th><th class="num">Collected</th><th class="num">Waived</th>' +
      '<th class="num">Outstanding</th><th class="num">Catalog rate</th></tr></thead><tbody>';
    if (!levels.length) {
      html += '<tr><td colspan="6">No dues rows for this year.</td></tr>';
    }
    levels.forEach(function (b) {
      var rate = catalogRate(b.level);
      html += '<tr data-level="' + esc(b.level) + '"><td data-label="Level">' + esc(levelLabel(b.level)) +
        '</td><td class="num" data-label="Invoiced">' + esc(String(b.invoiced)) +
        '</td><td class="num" data-label="Collected">' + esc(money(b.cash)) +
        '</td><td class="num" data-label="Waived">' + esc(money(b.waived)) +
        '</td><td class="num" data-label="Outstanding">' + esc(money(b.outstanding)) +
        '</td><td class="num" data-label="Catalog rate">' + (rate == null ? "—" : esc(money(rate))) + "</td></tr>";
    });
    html += '</tbody><tfoot><tr><td data-label="Level">All levels</td><td class="num" id="hubPayLevelInvoiced" data-label="Invoiced">' + esc(String(sum.invoiced)) +
      '</td><td class="num" id="hubPayLevelCash" data-label="Collected">' + esc(money(sum.cash)) +
      '</td><td class="num" id="hubPayLevelWaived" data-label="Waived">' + esc(money(sum.waived)) +
      '</td><td class="num" id="hubPayLevelDue" data-label="Outstanding">' + esc(money(sum.outstanding)) +
      '</td><td class="num" data-label="Catalog rate"></td></tr></tfoot></table></div>' +
      "<h3>Member detail</h3>" +
      '<div class="hub-pay-filters">' +
      '<div><label for="hubPaySearch">Search</label><input id="hubPaySearch" type="search" placeholder="Name or email" autocomplete="off" /></div>' +
      '<div><label for="hubPayStatus">Status</label><select id="hubPayStatus">' +
      '<option value="all">All</option><option value="unpaid">Unpaid</option>' +
      '<option value="paid">Paid</option><option value="waived">Waived</option></select></div></div>' +
      '<div id="hubPayMembers"></div>' +
      '<h3>Aging</h3>' +
      '<p class="hub-pay-note">Unpaid dues by due date. This screen does not send email. Reminders go out from Send invoices.</p>' +
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
    var html = '<div class="hub-pay-wrap"><table class="hub-pay-stack"><thead><tr>' +
      "<th>Name</th><th>Level</th><th class=\"num\">Amount owed</th><th>Status</th><th>Method</th><th>Paid date</th><th>Notes</th>" +
      "</tr></thead><tbody>";
    rows.forEach(function (r) {
      var notes = r.notes || "";
      if (notes.length > 80) notes = notes.slice(0, 77) + "...";
      var methodText = paymentMethodLabel(r.method, r.notes);
      html += '<tr><td data-label="Name"><button type="button" class="hub-pay-name" data-history="' + esc(r.memberId || "") + '">' +
        esc(r.name) + "</button></td><td data-label=\"Level\">" + esc(levelLabel(r.level)) +
        '</td><td class="num" data-label="Amount owed">' + esc(money(r.dueAmt)) + "</td><td data-label=\"Status\">" + esc(statusLabel(r.status)) +
        "</td><td data-label=\"Method\">" + (methodText ? sourceHtml(methodText) : "None") +
        "</td><td data-label=\"Paid date\">" + esc(r.paidDate || "None") +
        "</td><td data-label=\"Notes\">" + esc(notes || "None") + "</td></tr>";
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
    var from = val("hubPayFrom") || seasonStart(y);
    var to = val("hubPayTo") || seasonEnd(y);
    var counted = exportRows(from, to);
    var count = counted.length;
    panel.innerHTML =
      '<p class="hub-pay-note">Downloads are built in the browser from rows you can already read. No new edge function. Waived dues stay marked waiver. They are not exported as cash.</p>' +
      "<h3>Dues season</h3>" +
      '<p class="hub-pay-note">One row per dues invoice for ' + y + ': name, email, level, amounts, status, and waiver fields.</p>' +
      '<div class="hub-pay-row"><button class="btn btn-primary" type="button" id="hubPayDuesCsv">Download dues CSV</button></div>' +
      "<h3>Payments ledger</h3>" +
      '<p class="hub-pay-note">Payments whose recorded date falls in this range. Defaults to June 1 through May 31. Built from the ledger when that report is available, with method and check number.</p>' +
      '<div class="hub-pay-dates">' +
      '<div><label for="hubPayFrom">From</label><input id="hubPayFrom" type="date" value="' + esc(from) + '" /></div>' +
      '<div><label for="hubPayTo">To</label><input id="hubPayTo" type="date" value="' + esc(to) + '" /></div></div>' +
      '<p class="hub-pay-note" id="hubPayLedgerCount">' + count + " payment" + (count === 1 ? "" : "s") + " in this range.</p>" +
      (state.paymentsError ? '<p class="hub-pay-msg">' + esc(state.paymentsError) + "</p>" : "") +
      '<div class="hub-pay-row"><button class="btn btn-primary" type="button" id="hubPayLedgerCsv">Download payments CSV</button></div>' +
      "<h3>Season report</h3>" +
      '<p class="hub-pay-note">Collected, waived, voided, unpaid, and not invoiced yet for this June through May season.</p>' +
      '<div id="hubPaySeasonView"></div>' +
      '<div class="hub-pay-row"><button class="btn" type="button" id="hubPaySeasonCsv">Download season report CSV</button></div>';
    document.getElementById("hubPayDuesCsv").addEventListener("click", function () {
      var yNow = year();
      downloadCsv("kos-dues-" + yNow + ".csv", DUES_CSV_HEADERS, duesCsvRows(state.rows));
    });
    function refreshCount() {
      var n = exportRows(val("hubPayFrom"), val("hubPayTo")).length;
      var el = document.getElementById("hubPayLedgerCount");
      if (el) el.textContent = n + " payment" + (n === 1 ? "" : "s") + " in this range.";
    }
    document.getElementById("hubPayFrom").addEventListener("change", refreshCount);
    document.getElementById("hubPayTo").addEventListener("change", refreshCount);
    document.getElementById("hubPayLedgerCsv").addEventListener("click", function () {
      var fromDay = val("hubPayFrom");
      var toDay = val("hubPayTo");
      var slice = exportRows(fromDay, toDay);
      if (state.ledger && state.ledger.rows) {
        downloadCsv(
          "kos-payments-" + (fromDay || "from") + "-to-" + (toDay || "end") + ".csv",
          LEDGER_V7_HEADERS,
          slice.map(function (r) {
            return [
              String(r.when || "").slice(0, 10),
              r.name || "",
              r.source || "",
              r.method || "",
              r.check_number || "",
              num(r.amount).toFixed(2),
              r.voided ? "yes" : "no"
            ];
          })
        );
        return;
      }
      downloadCsv("kos-payments-" + (fromDay || "from") + "-to-" + (toDay || "end") + ".csv", LEDGER_CSV_HEADERS, ledgerCsvRows(slice));
    });
    var seasonBtn = document.getElementById("hubPaySeasonCsv");
    if (seasonBtn) seasonBtn.addEventListener("click", downloadSeasonCsv);
    renderSeasonReport();
  }

  function dayInRange(day, from, to) {
    var d = String(day || "").slice(0, 10);
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function exportRows(from, to) {
    if (state.ledger && Array.isArray(state.ledger.rows)) {
      return state.ledger.rows.filter(function (r) { return dayInRange(r.when, from, to); });
    }
    return ledgerInRange(state.payments, from, to);
  }

  function renderSeasonReport() {
    var host = document.getElementById("hubPaySeasonView");
    if (!host) return;
    var report = state.seasonReport;
    if (!report) {
      host.innerHTML = '<p class="empty">Season report appears after the treasurer SQL is applied.</p>';
      return;
    }
    var ren = (report.invoiced_unpaid && report.invoiced_unpaid.renewal) || {};
    var ind = (report.invoiced_unpaid && report.invoiced_unpaid.induction) || {};
    var notYet = report.not_invoiced || {};
    var waived = report.waived || {};
    var voided = report.voided || {};
    var bg = report.background_check_fees || {};
    var collected = report.collected || [];
    host.innerHTML =
      '<div class="hub-pay-cards" id="hubPaySeasonCards">' +
      '<div class="hub-pay-card"><b>' + esc(money(report.owing_amount)) + '</b><span>Owing</span></div>' +
      '<div class="hub-pay-card"><b>' + esc(String(report.owing_total || 0)) + '</b><span>People owing (matches Renewals)</span></div>' +
      '<div class="hub-pay-card"><b>' + esc(String(notYet.count || 0)) + '</b><span>Not invoiced yet</span></div>' +
      '<div class="hub-pay-card"><b>' + esc(String(ren.count || 0)) + '</b><span>Renewal invoiced unpaid</span></div>' +
      '<div class="hub-pay-card"><b>' + esc(String(ind.count || 0)) + '</b><span>Induction invoiced unpaid</span></div>' +
      '<div class="hub-pay-card"><b>' + esc(money(waived.amount)) + '</b><span>Waived</span></div>' +
      '<div class="hub-pay-card"><b>' + esc(money(voided.amount)) + '</b><span>Voided receipts</span></div>' +
      '<div class="hub-pay-card"><b>' + esc(money(num(bg.amount_cents) / 100)) + '</b><span>Background check fees</span></div>' +
      "</div>" +
      '<div class="hub-pay-wrap"><table id="hubPayCollected"><thead><tr><th>Method</th><th>Level</th><th class="num">Count</th><th class="num">Amount</th></tr></thead><tbody>' +
      (collected.length ? collected.map(function (c) {
        return "<tr><td>" + esc(c.method) + "</td><td>" + esc(levelLabel(c.level)) +
          '</td><td class="num">' + esc(String(c.count)) + '</td><td class="num">' + esc(money(c.amount)) + "</td></tr>";
      }).join("") : '<tr><td colspan="4">No cash collected in this season report.</td></tr>') +
      "</tbody></table></div>";
  }

  function downloadSeasonCsv() {
    var report = state.seasonReport || {};
    var rows = [];
    (report.collected || []).forEach(function (c) {
      rows.push(["collected", c.method, c.level, c.count, num(c.amount).toFixed(2)]);
    });
    var waived = report.waived || {};
    var voided = report.voided || {};
    var ren = (report.invoiced_unpaid && report.invoiced_unpaid.renewal) || {};
    var ind = (report.invoiced_unpaid && report.invoiced_unpaid.induction) || {};
    var notYet = report.not_invoiced || {};
    var bg = report.background_check_fees || {};
    rows.push(["waived", "", "", waived.count || 0, num(waived.amount).toFixed(2)]);
    rows.push(["voided", "", "", voided.count || 0, num(voided.amount).toFixed(2)]);
    rows.push(["invoiced_unpaid_renewal", "", "", ren.count || 0, num(ren.amount).toFixed(2)]);
    rows.push(["invoiced_unpaid_induction", "", "", ind.count || 0, num(ind.amount).toFixed(2)]);
    rows.push(["not_invoiced", "", "", notYet.count || 0, num(notYet.amount).toFixed(2)]);
    rows.push(["owing_total", "", "", report.owing_total || 0, num(report.owing_amount).toFixed(2)]);
    rows.push(["background_check_fees", "", "", bg.count || 0, (num(bg.amount_cents) / 100).toFixed(2)]);
    downloadCsv("kos-season-report-" + (report.year || year()) + ".csv", ["section", "method", "level", "count", "amount"], rows);
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
        "id, first_name, last_name, email, membership_level, membership_status, partner_member_id",
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
      state.roster = roster || [];
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
    state.ledger = null;
    state.seasonReport = null;
    state.canRecord = false;
    try {
      var gate = await client.rpc("kos_can_record_dues_cash");
      if (seq !== loadSeq) return;
      state.canRecord = !!(gate && gate.data === true);
    } catch (e4) {
      state.canRecord = false;
    }
    try {
      var led = await client.rpc("kos_treasurer_ledger", { p_from: seasonStart(y), p_to: seasonEnd(y) });
      if (seq !== loadSeq) return;
      if (led && led.data && led.data.ok) state.ledger = led.data;
    } catch (e5) {
      state.ledger = null;
    }
    try {
      var rep = await client.rpc("kos_dues_season_report", { p_year: y });
      if (seq !== loadSeq) return;
      if (rep && rep.data && rep.data.ok) state.seasonReport = rep.data;
    } catch (e6) {
      state.seasonReport = null;
    }
    renderAll();
  }

  function closeModal() {
    var node = document.getElementById("hubPayModal");
    if (node) node.remove();
  }

  function receiptRow(id) {
    var rows = (state.ledger && state.ledger.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].receipt_id === id) return rows[i];
    }
    return null;
  }

  function modalHost() {
    return document.querySelector("#hubPayments .hub-dues-rep") || document.body;
  }

  function openVoid(client, receiptId) {
    closeModal();
    var node = document.createElement("div");
    node.className = "hub-pay-modal";
    node.id = "hubPayModal";
    node.innerHTML =
      '<form role="dialog" aria-modal="true" aria-labelledby="hubPayModalTitle">' +
      '<h3 id="hubPayModalTitle">Void receipt</h3>' +
      '<p class="hub-pay-note">The dues rows go back to unpaid. Member status is not changed. No email is sent.</p>' +
      '<label for="hubPayReason">Reason</label><textarea id="hubPayReason" required></textarea>' +
      '<p class="hub-pay-msg" id="hubPayModalMsg"></p>' +
      '<div class="hub-pay-row"><button class="btn btn-primary" type="submit" id="hubPayVoidConfirm">Void receipt</button>' +
      '<button class="btn" type="button" id="hubPayModalCancel">Cancel</button></div></form>';
    modalHost().appendChild(node);
    node.querySelector("#hubPayModalCancel").addEventListener("click", closeModal);
    node.querySelector("form").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var reason = node.querySelector("#hubPayReason").value.trim();
      if (!reason) {
        node.querySelector("#hubPayModalMsg").textContent = "A reason is required.";
        return;
      }
      try {
        var res = await client.rpc("kos_void_dues_receipt", { p_receipt_id: receiptId, p_reason: reason });
        if (res.error) throw res.error;
        if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not void that receipt.");
        closeModal();
        var msg = document.getElementById("hubPayMsg");
        if (msg) msg.textContent = (res.data && res.data.message) || "Receipt voided. No email was sent.";
        await load(client);
      } catch (e) {
        node.querySelector("#hubPayModalMsg").textContent = (e && e.message) || "Could not void that receipt.";
      }
    });
  }

  function openAdjust(client, receiptId) {
    var row = receiptRow(receiptId) || {};
    closeModal();
    var node = document.createElement("div");
    node.className = "hub-pay-modal";
    node.id = "hubPayModal";
    node.innerHTML =
      '<form role="dialog" aria-modal="true" aria-labelledby="hubPayModalTitle">' +
      '<h3 id="hubPayModalTitle">Adjust receipt</h3>' +
      '<label for="hubPayAdjustAmount">Amount</label>' +
      '<input id="hubPayAdjustAmount" type="number" min="0.01" step="0.01" value="' + esc(num(row.amount).toFixed(2)) + '" />' +
      '<label for="hubPayAdjustDate">Date received</label>' +
      '<input id="hubPayAdjustDate" type="date" max="' + esc(todayISO()) + '" value="' + esc(String(row.when || todayISO()).slice(0, 10)) + '" />' +
      '<label for="hubPayAdjustCheck">Check number</label>' +
      '<input id="hubPayAdjustCheck" type="text" value="' + esc(row.check_number || "") + '" />' +
      '<label for="hubPayReason">Reason</label><textarea id="hubPayReason" required></textarea>' +
      '<p class="hub-pay-msg" id="hubPayModalMsg"></p>' +
      '<div class="hub-pay-row"><button class="btn btn-primary" type="submit">Adjust receipt</button>' +
      '<button class="btn" type="button" id="hubPayModalCancel">Cancel</button></div></form>';
    modalHost().appendChild(node);
    node.querySelector("#hubPayModalCancel").addEventListener("click", closeModal);
    node.querySelector("form").addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var reason = node.querySelector("#hubPayReason").value.trim();
      if (!reason) {
        node.querySelector("#hubPayModalMsg").textContent = "A reason is required.";
        return;
      }
      try {
        var res = await client.rpc("kos_adjust_dues_receipt", {
          p_receipt_id: receiptId,
          p_amount: Number(node.querySelector("#hubPayAdjustAmount").value),
          p_received_on: node.querySelector("#hubPayAdjustDate").value,
          p_check_number: node.querySelector("#hubPayAdjustCheck").value || null,
          p_reason: reason
        });
        if (res.error) throw res.error;
        if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not adjust that receipt.");
        closeModal();
        var msg = document.getElementById("hubPayMsg");
        if (msg) msg.textContent = (res.data && res.data.message) || "Receipt adjusted. No email was sent.";
        await load(client);
      } catch (e) {
        node.querySelector("#hubPayModalMsg").textContent = (e && e.message) || "Could not adjust that receipt.";
      }
    });
  }

  function openRecord(client, memberId) {
    var member = null;
    state.roster.forEach(function (m) { if (m.id === memberId) member = m; });
    if (!member || !window.KosDuesReceipts) return;
    var partner = null;
    if (member.partner_member_id) {
      state.roster.forEach(function (m) { if (m.id === member.partner_member_id) partner = m; });
    }
    var expected = catalogAmount(member.membership_level);
    var partnerExpected = partner ? catalogAmount(partner.membership_level) : null;
    window.KosDuesReceipts.open({
      member: {
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        membership_status: rosterStatus(member.membership_status),
        amount: expected
      },
      partner: partner ? { id: partner.id, name: fullName(partner), amount: partnerExpected } : null,
      expected: expected,
      partnerExpected: partnerExpected,
      onDone: function (data) {
        var msg = document.getElementById("hubPayMsg");
        if (msg) msg.textContent = (data && data.message) || "Recorded. No email was sent.";
        load(client);
      }
    });
  }

  async function openHistory(client, memberId, name) {
    var host = document.getElementById("hubPayHistory");
    if (!host) {
      host = document.createElement("div");
      host.id = "hubPayHistory";
      host.className = "hub-pay-drawer";
      modalHost().appendChild(host);
    }
    host.innerHTML = "<h3>History</h3><p>Loading " + esc(name || "member") + "...</p>";
    try {
      var res = await client.rpc("kos_member_dues_history", { p_member_id: memberId });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not load history.");
      var items = data.items || [];
      host.innerHTML = "<h3>History</h3><p><b>" + esc(data.name || name || "") + "</b></p>" +
        (items.length ? "<ul>" + items.map(function (item) {
          var when = String(item.at || "").slice(0, 10);
          var line = item.kind || "";
          if (item.kind === "event") line = item.event_type || "event";
          if (item.kind === "receipt") line = (item.method || "receipt") + " " + money(item.amount) + (item.check_number ? " #" + item.check_number : "") + (item.voided ? " voided" : "");
          if (item.kind === "payment") line = (item.product_kind || "payment") + " " + money(num(item.amount_cents) / 100) + (item.description ? " " + item.description : "");
          return "<li>" + esc(when) + " · " + esc(line) + "</li>";
        }).join("") + "</ul>" : '<p class="empty">No dues history yet.</p>') +
        '<button type="button" class="btn" id="hubPayHistoryClose">Close</button>';
      var close = document.getElementById("hubPayHistoryClose");
      if (close) close.addEventListener("click", function () { host.remove(); });
    } catch (e) {
      host.innerHTML = "<h3>History</h3><p class=\"hub-pay-msg\">" + esc((e && e.message) || "Could not load history.") + "</p>";
    }
  }

  async function loadReconcile(client) {
    var panel = document.getElementById("hubPayPanel_zeffy");
    if (panel) panel.innerHTML = '<p class="empty">Loading the Zeffy check...</p>';
    try {
      var res = await client.rpc("kos_dues_reconcile", { p_year: year() });
      if (res.error) throw res.error;
      state.reconcile = res.data || { ok: false, message: "Check Zeffy appears after the treasurer SQL is applied." };
    } catch (e) {
      state.reconcile = { ok: false, message: (e && e.message) || "Could not load the Zeffy check." };
    }
    renderZeffy();
  }

  function renderZeffy() {
    var panel = document.getElementById("hubPayPanel_zeffy");
    if (!panel) return;
    var data = state.reconcile || {};
    if (data.ok === false) {
      panel.innerHTML = '<p class="hub-pay-note">Read only. Nothing here changes a payment or sends email.</p><p class="hub-pay-msg">' + esc(data.message || "") + "</p>";
      return;
    }
    var flags = [
      ["amount_mismatch", "Amount does not match the dues rows"],
      ["level_mismatch", "Amount matches a different level"],
      ["unmatched_dues_payer", "Dues payment with no member"],
      ["possible_misfiled", "Event or other payment that looks like dues"],
      ["card_paid_no_payment", "Card dues row with no Zeffy payment"],
      ["dues_payment_no_row", "Zeffy dues payment with no dues row"]
    ];
    panel.innerHTML = '<p class="hub-pay-note" id="hubPayZeffyNote">Read only. June 1 through May 31. Nothing here changes a payment or sends email.</p>' +
      flags.map(function (flag) {
        var list = data[flag[0]] || [];
        var items = list.map(function (row) {
          var who = row.name || row.payer_name || row.member_id || "Payment";
          var desc = row.description ? " · " + row.description : "";
          var amount = row.amount_cents != null ? " · " + money(num(row.amount_cents) / 100) : (row.amount != null ? " · " + money(row.amount) : "");
          return "<li>" + esc(who) + esc(desc) + esc(amount) + "</li>";
        }).join("");
        return '<section data-flag="' + flag[0] + '"><h3>' + esc(flag[1]) + "</h3>" +
          '<p class="hub-pay-note">' + list.length + "</p>" +
          (items ? "<ul>" + items + "</ul>" : '<p class="empty">None</p>') + "</section>";
      }).join("");
  }

  function wire(card, client) {
    if (wired) return;
    wired = true;
    card.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var tab = t.closest("[id^='hubPayTab_']");
      if (tab) {
        var which = tab.id.slice("hubPayTab_".length);
        showTab(which);
        if (which === "zeffy") loadReconcile(client);
        return;
      }
      var history = t.closest("[data-history]");
      if (history) {
        openHistory(client, history.getAttribute("data-history"), history.textContent);
        return;
      }
      var record = t.closest("[data-record-member]");
      if (record) {
        openRecord(client, record.getAttribute("data-record-member"));
        return;
      }
      var voidBtn = t.closest("[data-void]");
      if (voidBtn && state.canRecord) {
        openVoid(client, voidBtn.getAttribute("data-void"));
        return;
      }
      var adjustBtn = t.closest("[data-adjust]");
      if (adjustBtn && state.canRecord) {
        openAdjust(client, adjustBtn.getAttribute("data-adjust"));
      }
    });
    var yearEl = document.getElementById("hubPayYear");
    if (yearEl) {
      yearEl.addEventListener("change", function () {
        var y = year();
        var from = document.getElementById("hubPayFrom");
        var to = document.getElementById("hubPayTo");
        if (from) from.value = seasonStart(y);
        if (to) to.value = seasonEnd(y);
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
