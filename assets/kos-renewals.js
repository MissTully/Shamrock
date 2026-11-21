/* Officer Desk: Renewals. Membership Chair, Treasurer, President, and site admins.
   Lists members with no paid dues row for the current June-May season.
   Cash and check are marked here. Reminders use the existing officer email queue.
   No reminder cron. */
(function () {
  var LEVELS = {
    full: "Full",
    associate: "Associate",
    loa: "Leave of absence",
    auxiliary: "Auxiliary"
  };
  var STATUS = {
    active: "Active",
    lapsed: "Lapsed",
    "pending-renewal": "Pending renewal"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function titleParts(title) {
    return String(title || "").split(/\s*[·|,;]\s*/).map(function (part) {
      return part.trim().toLowerCase();
    }).filter(Boolean);
  }

  function kosCanManageRenewals() {
    var profile = window.kosProfile || {};
    return titleParts(profile.officer_title).some(function (part) {
      if (part === "president" || part === "treasurer" || part === "webmaster") return true;
      return part.indexOf("membership") !== -1 && part.indexOf("chair") !== -1;
    });
  }
  window.kosCanManageRenewals = kosCanManageRenewals;

  function levelName(level) {
    return LEVELS[level] || "Full";
  }

  function statusName(status) {
    return STATUS[status] || status || "";
  }

  function money(amount) {
    if (amount == null || amount === "") return "";
    var n = Number(amount);
    if (!isFinite(n)) return "";
    if (Math.round(n) === n) return "$" + n;
    return "$" + n.toFixed(2);
  }

  function seasonLabel(year) {
    if (window.kosDuesSeason) return window.kosDuesSeason.seasonLabel(year);
    return year + "-" + String(Number(year) + 1).slice(-2);
  }

  function fullName(row) {
    return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Member";
  }

  var state = {
    year: null,
    label: "",
    members: [],
    q: "",
    status: "all",
    level: "all",
    selected: {},
    msg: "",
    msgKind: "",
    showPreview: false,
    confirmed: false,
    previewOnly: false
  };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return state.members.filter(function (row) {
      if (state.status !== "all" && row.membership_status !== state.status) return false;
      if (state.level !== "all" && (row.membership_level || "full") !== state.level) return false;
      if (!q) return true;
      var blob = (fullName(row) + " " + (row.email || "") + " " + (row.partner_name || "")).toLowerCase();
      return blob.indexOf(q) !== -1;
    });
  }

  function selectedRows() {
    return state.members.filter(function (row) { return state.selected[row.id]; });
  }

  function reminderBody(row, label, greet) {
    var who = greet ? esc(greet) : "friend";
    var level = levelName(row && row.membership_level);
    var amount = money(row && row.amount);
    var url = row && row.zeffy_url ? String(row.zeffy_url) : "";
    var html = "<p>Hi " + who + ",</p>" +
      "<p>The " + esc(label) + " season runs June through May. We do not have a paid dues row for you yet.</p>" +
      "<p><b>Level on file:</b> " + esc(level) + (amount ? " · " + esc(amount) : "") + "</p>";
    if (url) {
      html += "<p>Pay on Zeffy when you're ready. Use the name and email on your roster row so we can mark you paid.</p>" +
        '<p><a href="' + esc(url) + '">Pay ' + esc(level) + " dues on Zeffy</a></p>";
    } else {
      html += "<p>A Zeffy link for this level is not set up yet. Email treasurer@kreweofshamrock.com and we'll help you pay. Please don't send card numbers by email.</p>";
    }
    html += "<p>Want a different level this season? Open the Member Hub and choose Renew my membership. You can pick Full, Associate, Auxiliary, or Leave of absence before you pay.</p>" +
      "<p>Questions: treasurer@kreweofshamrock.com</p>" +
      "<p>Slainte,<br>Krewe of Shamrock</p>";
    return html;
  }

  function groupsOf(rows, label) {
    var groups = {};
    var order = [];
    rows.forEach(function (row) {
      var key = row.membership_level || "full";
      if (!groups[key]) {
        groups[key] = { level: key, rows: [] };
        order.push(key);
      }
      groups[key].rows.push(row);
    });
    return order.map(function (key) {
      var group = groups[key];
      var sample = group.rows[0] || null;
      var greet = group.rows.length === 1 && sample ? (sample.first_name || "friend") : "";
      return {
        level: key,
        rows: group.rows,
        html: reminderBody(sample, label, greet)
      };
    });
  }

  function previewHtml(rows) {
    if (!rows.length) {
      return '<p class="kos-ren-note">Select at least one member to preview a reminder.</p>';
    }
    var groups = groupsOf(rows, state.label);
    var blocks = groups.map(function (group) {
      var names = group.rows.map(fullName).join(", ");
      return '<article class="kos-ren-mail">' +
        '<p class="kos-ren-mail-to"><b>' + group.rows.length + '</b> ' +
        (group.rows.length === 1 ? "member" : "members") + ' · ' + esc(levelName(group.level)) +
        '</p><p class="kos-ren-mail-to">' + esc(names) + '</p>' +
        '<div class="kos-ren-mail-body">' + group.html + '</div></article>';
    }).join("");
    return '<p class="kos-ren-count">This reminder would go to <b>' + rows.length + '</b> ' +
      (rows.length === 1 ? "member" : "members") + '. Each level gets the Zeffy link for that level. Nothing sends until you confirm.</p>' +
      blocks;
  }

  function rowHtml(row) {
    var last = row.last_paid_year ? ("Last paid " + row.last_paid_year) : "No paid year on file";
    var partner = row.partner_name ? ('<span class="meta">Partner: ' + esc(row.partner_name) + '</span>') : "";
    return '<div class="kos-ren-row">' +
      '<label><input type="checkbox" data-ren-id="' + esc(row.id) + '"' +
      (state.selected[row.id] ? " checked" : "") + ' />' +
      '<span><b>' + esc(fullName(row)) + '</b>' +
      '<span class="meta">' + esc(statusName(row.membership_status)) + " · " +
      esc(levelName(row.membership_level)) +
      (row.amount != null ? " · " + esc(money(row.amount)) : "") + " · " + esc(last) +
      (row.email ? " · " + esc(row.email) : "") + '</span>' + partner + '</span></label>' +
      '<span class="kos-ren-mark"><select data-ren-method="' + esc(row.id) + '" aria-label="Payment method for ' + esc(fullName(row)) + '">' +
      '<option value="check">Check</option><option value="cash">Cash</option></select>' +
      '<button type="button" class="btn" data-ren-mark="' + esc(row.id) + '">Mark renewed</button></span></div>';
  }

  function shell(body) {
    return '<div class="app-head"><span class="ic">☘</span><div><h2>Renewals</h2>' +
      '<small>Who still needs dues for this June through May season</small></div></div>' +
      '<div class="app-body kos-ren">' + body + '</div>';
  }

  function paint(root) {
    if (!root) return;
    var rows = filtered();
    var list = rows.length
      ? rows.map(rowHtml).join("")
      : '<p class="empty">No one in this filter is waiting on dues.</p>';
    var preview = state.showPreview ? '<div class="kos-ren-preview" id="kosRenPreview">' +
      previewHtml(selectedRows()) +
      '<label class="kos-ren-confirm"><input type="checkbox" id="kosRenConfirm"' +
      (state.confirmed ? " checked" : "") + ' />' +
      '<span>I have read this preview and the recipient count.</span></label>' +
      '<div class="kos-ren-actions"><button type="button" class="btn btn-primary" id="kosRenSend">Send reminder</button></div></div>' : "";
    root.innerHTML = shell(
      '<p class="kos-ren-note">The ' + esc(state.label || "current") +
      ' season is June through May. This list is active, lapsed, and pending-renewal members with no paid dues row for that season. Elected officers and board are left off, same as the member hub. Marking cash or check records the dues row and sets lapsed or pending-renewal members to active. No email goes out for that. Reminders use the officer email queue, and only after you confirm.</p>' +
      '<div class="kos-ren-filters">' +
      '<label>Search<input id="kosRenSearch" type="search" value="' + esc(state.q) + '" placeholder="Name or email" /></label>' +
      '<label>Status<select id="kosRenStatus">' +
      option("all", "All statuses", state.status) +
      option("active", "Active", state.status) +
      option("lapsed", "Lapsed", state.status) +
      option("pending-renewal", "Pending renewal", state.status) +
      '</select></label>' +
      '<label>Level<select id="kosRenLevel">' +
      option("all", "All levels", state.level) +
      option("full", "Full", state.level) +
      option("associate", "Associate", state.level) +
      option("loa", "Leave of absence", state.level) +
      option("auxiliary", "Auxiliary", state.level) +
      '</select></label></div>' +
      '<p class="kos-ren-count" id="kosRenCount">' + rows.length + ' shown · ' +
      selectedRows().length + ' selected</p>' +
      '<div class="kos-ren-actions">' +
      '<button type="button" class="btn" id="kosRenShown">Select shown</button>' +
      '<button type="button" class="btn" id="kosRenClear">Clear</button>' +
      '<button type="button" class="btn" id="kosRenCsv">Download CSV</button>' +
      '<button type="button" class="btn btn-primary" id="kosRenPreviewBtn">Preview reminder</button></div>' +
      '<div class="kos-ren-list">' + list + '</div>' +
      preview +
      '<p class="kos-ren-msg' + (state.msgKind === "err" ? " is-err" : "") + '" id="kosRenMsg" role="status">' +
      esc(state.msg) + '</p>'
    );
    bind(root);
  }

  function option(value, label, current) {
    return '<option value="' + esc(value) + '"' + (value === current ? " selected" : "") + '>' + esc(label) + '</option>';
  }

  function bind(root) {
    var search = root.querySelector("#kosRenSearch");
    if (search) search.addEventListener("input", function () {
      state.q = search.value;
      paint(root);
      var again = root.querySelector("#kosRenSearch");
      if (again) {
        again.focus();
        var end = again.value.length;
        try { again.setSelectionRange(end, end); } catch (e) {}
      }
    });
    var status = root.querySelector("#kosRenStatus");
    if (status) status.addEventListener("change", function () { state.status = status.value; paint(root); });
    var level = root.querySelector("#kosRenLevel");
    if (level) level.addEventListener("change", function () { state.level = level.value; paint(root); });
    root.querySelectorAll("[data-ren-id]").forEach(function (box) {
      box.addEventListener("change", function () {
        var id = box.getAttribute("data-ren-id");
        if (box.checked) state.selected[id] = true;
        else delete state.selected[id];
        var count = root.querySelector("#kosRenCount");
        if (count) count.textContent = filtered().length + " shown · " + selectedRows().length + " selected";
        if (state.showPreview) paint(root);
      });
    });
    var shown = root.querySelector("#kosRenShown");
    if (shown) shown.addEventListener("click", function () {
      filtered().forEach(function (row) { state.selected[row.id] = true; });
      paint(root);
    });
    var clear = root.querySelector("#kosRenClear");
    if (clear) clear.addEventListener("click", function () {
      state.selected = {};
      state.showPreview = false;
      state.confirmed = false;
      paint(root);
    });
    var csv = root.querySelector("#kosRenCsv");
    if (csv) csv.addEventListener("click", downloadCsv);
    var previewBtn = root.querySelector("#kosRenPreviewBtn");
    if (previewBtn) previewBtn.addEventListener("click", function () {
      state.showPreview = true;
      state.msg = "";
      paint(root);
      var panel = root.querySelector("#kosRenPreview");
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
    });
    var confirm = root.querySelector("#kosRenConfirm");
    if (confirm) confirm.addEventListener("change", function () { state.confirmed = !!confirm.checked; });
    var send = root.querySelector("#kosRenSend");
    if (send) send.addEventListener("click", function () { sendReminders(root, send); });
    root.querySelectorAll("[data-ren-mark]").forEach(function (btn) {
      btn.addEventListener("click", function () { markPaid(root, btn); });
    });
  }

  function csvCell(value) {
    var text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function downloadCsv() {
    var lines = ["Name,Email,Status,Level,Partner,Last paid"];
    filtered().forEach(function (row) {
      lines.push([
        fullName(row),
        row.email || "",
        statusName(row.membership_status),
        levelName(row.membership_level),
        row.partner_name || "",
        row.last_paid_year || ""
      ].map(csvCell).join(","));
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "renewals-" + (state.year || "season") + ".csv";
    a.click();
  }

  async function markPaid(root, btn) {
    var id = btn.getAttribute("data-ren-mark");
    var row = state.members.filter(function (item) { return item.id === id; })[0];
    if (!row) return;
    var methodEl = root.querySelector('[data-ren-method="' + id + '"]');
    var method = methodEl ? methodEl.value : "check";
    var methodLabel = method === "cash" ? "cash" : "check";
    var ask = "Mark " + fullName(row) + " paid by " + methodLabel + " for the " + state.label +
      " season? This records a paid dues row. If they are lapsed or waiting on renewal, their status becomes active. No email is sent.";
    if (!state.previewOnly && !window.confirm(ask)) return;
    if (state.previewOnly) {
      row.membership_status = "active";
      state.members = state.members.filter(function (item) { return item.id !== id; });
      delete state.selected[id];
      state.msg = fullName(row) + " is marked paid by " + methodLabel + " in this preview. No email was sent.";
      state.msgKind = "";
      paint(root);
      return;
    }
    btn.disabled = true;
    try {
      var client = window.__kosSb;
      if (!client) throw new Error("Still connecting.");
      var res = await client.rpc("kos_mark_renewal_paid", {
        p_member_id: id,
        p_method: method,
        p_note: null
      });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not mark that member paid.");
      state.msg = data.message || (fullName(row) + " is marked paid.");
      state.msgKind = "";
      delete state.selected[id];
      await load(root);
    } catch (e) {
      state.msg = (e && e.message) || "Could not mark that member paid.";
      state.msgKind = "err";
      btn.disabled = false;
      paint(root);
    }
  }

  async function sendReminders(root, btn) {
    var rows = selectedRows();
    if (!rows.length) {
      state.msg = "Select at least one member.";
      state.msgKind = "err";
      paint(root);
      return;
    }
    if (!state.confirmed) {
      state.msg = "Read the preview, then check the confirm box.";
      state.msgKind = "err";
      paint(root);
      return;
    }
    var ask = "Send this renewal reminder to " + rows.length + " " +
      (rows.length === 1 ? "member" : "members") + "?";
    if (!state.previewOnly && !window.confirm(ask)) return;
    if (state.previewOnly) {
      state.msg = "Preview only. This would queue email for " + rows.length + " members.";
      state.msgKind = "";
      paint(root);
      return;
    }
    btn.disabled = true;
    state.msg = "Queuing the reminder...";
    state.msgKind = "";
    paint(root);
    try {
      var client = window.__kosSb;
      if (!client) throw new Error("Still connecting.");
      var groups = groupsOf(rows, state.label);
      var sent = 0;
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var res = await client.rpc("officer_send_member_email", {
          p_subject: "Krewe of Shamrock membership renewal (" + state.label + ")",
          p_body_html: group.html,
          p_audience: "selected",
          p_member_ids: group.rows.map(function (row) { return row.id; })
        });
        if (res.error) throw res.error;
        if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not queue the reminder.");
        sent += (res.data && res.data.recipient_count != null) ? Number(res.data.recipient_count) : group.rows.length;
      }
      state.msg = "Queued the reminder for " + sent + " member" + (sent === 1 ? "" : "s") + ".";
      state.msgKind = "";
      state.confirmed = false;
      state.showPreview = false;
      state.selected = {};
    } catch (e) {
      state.msg = (e && e.message) || "Could not queue the reminder.";
      state.msgKind = "err";
    }
    paint(root);
  }

  async function load(root) {
    if (state.previewOnly) {
      paint(root);
      return;
    }
    var client = window.__kosSb;
    if (!client || typeof client.rpc !== "function") {
      root.innerHTML = shell('<p class="empty">Still connecting. Open Renewals again in a moment.</p>');
      return;
    }
    root.innerHTML = shell('<p class="empty">Loading renewals...</p>');
    try {
      var res = await client.rpc("kos_list_renewals", { p_year: null });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not load renewals.");
      state.year = data.year;
      state.label = data.season_label || seasonLabel(data.year);
      state.members = data.members || [];
      paint(root);
    } catch (e) {
      var missing = /function|does not exist|schema cache/i.test((e && e.message) || "");
      root.innerHTML = shell('<p class="empty">' + esc(missing
        ? "Renewals needs sql/kos_dues_renewal.sql applied in the Supabase SQL editor. The website does not run that file."
        : ((e && e.message) || "Could not load renewals.")) + '</p>');
    }
  }

  function card() {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;
    var existing = document.getElementById("hubRenewals");
    if (existing) return existing;
    if (typeof window.kosEnsureOfficerToolCard === "function") {
      return window.kosEnsureOfficerToolCard("hubRenewals");
    }
    return null;
  }

  function renderPreview(el, payload) {
    state.previewOnly = true;
    state.year = payload.year;
    state.label = payload.season_label || seasonLabel(payload.year);
    state.members = payload.members || [];
    state.q = payload.q || "";
    state.status = payload.status || "all";
    state.level = payload.level || "all";
    state.selected = payload.selected || {};
    state.showPreview = !!payload.showPreview;
    state.confirmed = !!payload.confirmed;
    state.msg = payload.msg || "";
    paint(el);
  }

  window.kosRenewalsPreview = renderPreview;
  window.kosRenewalReminderHtml = function (rows, label) {
    state.label = label;
    return previewHtml(rows);
  };

  var css = document.createElement("style");
  css.textContent =
    ".kos-ren-note{font-size:15px;line-height:1.45;color:#5c5648;margin:0 0 12px;}" +
    ".kos-ren-filters{display:grid;grid-template-columns:1.4fr .8fr .8fr;gap:10px;}" +
    ".kos-ren-filters label{font-size:13px;color:#5c5648;display:grid;gap:4px;}" +
    ".kos-ren-filters input,.kos-ren-filters select,.kos-ren-mark select{width:100%;box-sizing:border-box;min-height:44px;border-radius:12px;border:1px solid rgba(168,128,28,.4);padding:8px 10px;font:inherit;background:#fff;}" +
    ".kos-ren-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;}" +
    ".kos-ren-count{margin:8px 0;font-size:14px;}" +
    ".kos-ren-list{display:grid;gap:8px;}" +
    ".kos-ren-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:12px;padding:10px 12px;}" +
    ".kos-ren-row label{display:flex;gap:10px;align-items:flex-start;}" +
    ".kos-ren-row input{margin-top:3px;width:18px;height:18px;}" +
    ".kos-ren-row b{color:#14532d;}" +
    ".kos-ren-row .meta{display:block;color:#5c5648;font-size:13px;line-height:1.35;}" +
    ".kos-ren-mark{display:flex;gap:6px;align-items:center;}" +
    ".kos-ren-mark .btn{white-space:nowrap;}" +
    ".kos-ren-mark select{min-width:7rem;}" +
    ".kos-ren-preview{margin-top:8px;padding:12px;background:#f6efdd;border-radius:14px;}" +
    ".kos-ren-mail{background:#fff;border:1px solid rgba(20,83,45,.2);border-radius:12px;padding:12px;margin:0 0 10px;}" +
    ".kos-ren-mail-to{margin:0 0 6px;font-size:14px;color:#5c5648;}" +
    ".kos-ren-mail-body{font-size:15px;line-height:1.45;}" +
    ".kos-ren-mail-body p{margin:0 0 8px;}" +
    ".kos-ren-confirm{display:flex;gap:8px;align-items:flex-start;margin:8px 0;}" +
    ".kos-ren-msg{min-height:1.2em;font-size:15px;}" +
    ".kos-ren-msg.is-err{color:#8a2b22;}" +
    "@media (max-width:720px){.kos-ren-filters,.kos-ren-row{grid-template-columns:1fr;}}";
  document.head.appendChild(css);

  window.kosLoadRenewals = function () {
    var el = card();
    if (!el) return;
    load(el);
  };
})();
