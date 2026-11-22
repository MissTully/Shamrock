/* Officer Desk: Renewals. Membership Chair, Treasurer, President, and site admins.
   Lists members with no paid dues row for the current June-May season.
   Cash and check are marked here. Reminders use the existing officer email queue.
   Lapse and reactivation stay hidden until sql/kos_v6_renewal_lapse.sql is applied.
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
    lapsed: "Delinquent",
    "pending-renewal": "Pending dues"
  };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

  function dateOnly(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    return match ? match[1] + "-" + match[2] + "-" + match[3] : "";
  }

  function formatLongDate(value) {
    var iso = dateOnly(value);
    if (!iso) return "";
    var parts = iso.split("-");
    return MONTHS[Number(parts[1]) - 1] + " " + Number(parts[2]) + ", " + parts[0];
  }

  function rpcMissing(err) {
    var msg = String((err && (err.message || err.details || err)) || "");
    var code = err && err.code ? String(err.code) : "";
    return code === "PGRST202" || /PGRST202|schema cache|does not exist|Could not find the function/i.test(msg);
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
    previewOnly: false,
    mailMode: "reminder",
    lapseTools: false,
    lapseOn: "",
    inactiveOn: "",
    canLapseToday: false,
    canMarkInactive: false,
    editingLapse: false,
    showLapse: false,
    lapseChecked: false,
    lapseCandidates: [],
    showInactive: false,
    inactiveChecked: false,
    exemptionsMissing: 0
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

  function selectedLapsed() {
    return selectedRows().filter(function (row) { return row.membership_status === "lapsed"; });
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

  function reactivationBody(row, label, greet) {
    var who = greet ? esc(greet) : "friend";
    var level = levelName(row && row.membership_level);
    var url = row && row.zeffy_url ? String(row.zeffy_url) : "";
    var html = "<p>Hi " + who + ",</p>" +
      "<p>Your Krewe of Shamrock membership lapsed for the " + esc(label) + " season. Pay your " + esc(level) + " dues on Zeffy to reactivate. Once your payment comes in you are active again.</p>";
    if (url) {
      html += '<p><a href="' + esc(url) + '">Pay ' + esc(level) + " dues on Zeffy</a></p>";
    } else {
      html += "<p>A Zeffy link for this level is not set up yet. Email treasurer@kreweofshamrock.com and we'll help you pay. Please don't send card numbers by email.</p>";
    }
    html += "<p>Questions: treasurer@kreweofshamrock.com</p>" +
      "<p>Slainte,<br>Krewe of Shamrock</p>";
    return html;
  }

  function groupsOf(rows, label, bodyFn) {
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
        html: bodyFn(sample, label, greet)
      };
    });
  }

  function previewHtml(rows) {
    var bodyFn = state.mailMode === "reactivation" ? reactivationBody : reminderBody;
    var noun = state.mailMode === "reactivation" ? "reactivation link" : "reminder";
    if (!rows.length) {
      return '<p class="kos-ren-note">Select at least one member to preview a ' + noun + ".</p>";
    }
    var groups = groupsOf(rows, state.label, bodyFn);
    var blocks = groups.map(function (group) {
      var names = group.rows.map(fullName).join(", ");
      return '<article class="kos-ren-mail">' +
        '<p class="kos-ren-mail-to"><b>' + group.rows.length + '</b> ' +
        (group.rows.length === 1 ? "member" : "members") + ' · ' + esc(levelName(group.level)) +
        '</p><p class="kos-ren-mail-to">' + esc(names) + '</p>' +
        '<div class="kos-ren-mail-body">' + group.html + '</div></article>';
    }).join("");
    return '<p class="kos-ren-count">This ' + noun + ' would go to <b>' + rows.length + '</b> ' +
      (rows.length === 1 ? "member" : "members") + '. Each level gets the Zeffy link for that level. Nothing sends until you confirm.</p>' +
      blocks;
  }

  function lapsePreviewHtml() {
    var rows = state.lapseCandidates || [];
    var list = rows.length
      ? "<ul class=\"kos-ren-lapse-list\">" + rows.map(function (row) {
        return "<li><b>" + esc(fullName(row)) + "</b> · " + esc(levelName(row.membership_level)) +
          (row.email ? " · " + esc(row.email) : "") + "</li>";
      }).join("") + "</ul>"
      : '<p class="kos-ren-note">No one would be marked delinquent.</p>';
    var missing = Number(state.exemptionsMissing) || 0;
    var warn = missing
      ? '<p class="kos-ren-warn" data-ren-exempt-warn>' + missing + " elected officer" + (missing === 1 ? "" : "s") +
        " have no applied elected officer waiver for this season. " +
        '<button type="button" class="btn" id="kosRenWaivers">Open Dues waivers</button></p>'
      : "";
    return '<p class="kos-ren-count"><b>' + rows.length + '</b> ' +
      (rows.length === 1 ? "member would be marked delinquent." : "members would be marked delinquent.") + "</p>" +
      list + warn +
      '<label class="kos-ren-confirm"><input type="checkbox" id="kosRenLapseCheck"' +
      (state.lapseChecked ? " checked" : "") + " />" +
      "<span>I have checked this list</span></label>" +
      '<div class="kos-ren-actions"><button type="button" class="btn btn-primary" id="kosRenLapseConfirm">Mark delinquent</button></div>';
  }

  function inactiveCandidates() {
    return (state.members || []).filter(function (row) {
      return row.membership_status === "lapsed" || row.membership_status === "pending-renewal";
    });
  }

  function inactivePreviewHtml() {
    var rows = inactiveCandidates();
    var list = rows.length
      ? "<ul class=\"kos-ren-lapse-list\">" + rows.map(function (row) {
        return "<li><b>" + esc(fullName(row)) + "</b> · " + esc(levelName(row.membership_level)) +
          (row.email ? " · " + esc(row.email) : "") + "</li>";
      }).join("") + "</ul>"
      : '<p class="kos-ren-note">No delinquent or pending dues members to mark inactive.</p>';
    var noun = rows.length === 1 ? "member would be marked inactive." : "members would be marked inactive.";
    return '<p class="kos-ren-count"><b>' + rows.length + '</b> ' + noun +
      " They must submit a new application. No email is sent.</p>" +
      list +
      '<label class="kos-ren-confirm"><input type="checkbox" id="kosRenInactiveCheck"' +
      (state.inactiveChecked ? " checked" : "") + " />" +
      "<span>I have checked this list</span></label>" +
      '<div class="kos-ren-actions"><button type="button" class="btn btn-primary" id="kosRenInactiveConfirm">Mark inactive</button></div>';
  }

  function lapseControls() {
    if (!state.lapseTools) return "";
    var when = formatLongDate(state.lapseOn);
    var later = formatLongDate(state.inactiveOn);
    var edit = state.editingLapse
      ? '<label class="kos-ren-lapse-edit">Delinquent on<input id="kosRenLapseInput" type="date" value="' + esc(dateOnly(state.lapseOn)) + '" /></label>' +
        '<button type="button" class="btn" id="kosRenLapseSave">Save</button>'
      : "Delinquent on: <b data-ren-lapse-date>" + esc(when || "Not set") + "</b> " +
        '<button type="button" class="btn" id="kosRenLapseEdit">Edit</button>';
    var editLater = state.editingInactive
      ? '<label class="kos-ren-lapse-edit">Inactive after<input id="kosRenInactiveInput" type="date" value="' + esc(dateOnly(state.inactiveOn)) + '" /></label>' +
        '<button type="button" class="btn" id="kosRenInactiveSave">Save</button>'
      : "Inactive after: <b data-ren-inactive-date>" + esc(later || "Not set") + "</b> " +
        '<button type="button" class="btn" id="kosRenInactiveEdit">Edit</button>';
    var mark = state.canLapseToday
      ? '<button type="button" class="btn" id="kosRenLapse">Mark delinquent</button>'
      : '<button type="button" class="btn" id="kosRenLapse" disabled>Available on ' + esc(when || "the delinquent date") + "</button>";
    var markInactive = state.canMarkInactive
      ? '<button type="button" class="btn" id="kosRenInactive">Mark inactive</button>'
      : '<button type="button" class="btn" id="kosRenInactive" disabled>Available on ' + esc(later || "the inactive date") + "</button>";
    return '<p class="kos-ren-lapse" id="kosRenLapseLine">' + edit + "</p>" +
      '<p class="kos-ren-lapse" id="kosRenInactiveLine">' + editLater + "</p>" +
      '<div class="kos-ren-actions">' + mark + markInactive +
      '<button type="button" class="btn" id="kosRenReactivate">Send reactivation link</button></div>';
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
    var previewRows = state.mailMode === "reactivation" ? selectedLapsed() : selectedRows();
    var sendLabel = state.mailMode === "reactivation" ? "Send reactivation link" : "Send reminder";
    var preview = state.showPreview ? '<div class="kos-ren-preview" id="kosRenPreview">' +
      previewHtml(previewRows) +
      '<label class="kos-ren-confirm"><input type="checkbox" id="kosRenConfirm"' +
      (state.confirmed ? " checked" : "") + ' />' +
      '<span>I have read this preview and the recipient count.</span></label>' +
      '<div class="kos-ren-actions"><button type="button" class="btn btn-primary" id="kosRenSend">' + sendLabel + "</button></div></div>" : "";
    var lapsePreview = state.showLapse ? '<div class="kos-ren-preview" id="kosRenLapsePreview">' + lapsePreviewHtml() + "</div>" : "";
    var inactivePreview = state.showInactive ? '<div class="kos-ren-preview" id="kosRenInactivePreview">' + inactivePreviewHtml() + "</div>" : "";
    root.innerHTML = shell(
      '<p class="kos-ren-note">The ' + esc(state.label || "current") +
      ' season is June through May. This list is active, delinquent, and pending dues members with no paid dues row for that season. Elected officers are left off. Marking cash or check records the dues row and sets delinquent or pending dues members to active. No email goes out for that. Reminders use the officer email queue, and only after you confirm.</p>' +
      lapseControls() +
      '<div class="kos-ren-filters">' +
      '<label>Search<input id="kosRenSearch" type="search" value="' + esc(state.q) + '" placeholder="Name or email" /></label>' +
      '<label>Status<select id="kosRenStatus">' +
      option("all", "All statuses", state.status) +
      option("active", "Active", state.status) +
      option("lapsed", "Delinquent", state.status) +
      option("pending-renewal", "Pending dues", state.status) +
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
      lapsePreview +
      inactivePreview +
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
      state.showLapse = false;
      state.showInactive = false;
      state.inactiveChecked = false;
      paint(root);
    });
    var csv = root.querySelector("#kosRenCsv");
    if (csv) csv.addEventListener("click", downloadCsv);
    var previewBtn = root.querySelector("#kosRenPreviewBtn");
    if (previewBtn) previewBtn.addEventListener("click", function () {
      state.mailMode = "reminder";
      state.showPreview = true;
      state.showLapse = false;
      state.showInactive = false;
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
    var edit = root.querySelector("#kosRenLapseEdit");
    if (edit) edit.addEventListener("click", function () { state.editingLapse = true; paint(root); });
    var saveDate = root.querySelector("#kosRenLapseSave");
    if (saveDate) saveDate.addEventListener("click", function () { saveLapseDate(root, saveDate); });
    var lapse = root.querySelector("#kosRenLapse");
    if (lapse) lapse.addEventListener("click", function () { openLapsePreview(root); });
    var inactiveBtn = root.querySelector("#kosRenInactive");
    if (inactiveBtn) inactiveBtn.addEventListener("click", function () { openInactivePreview(root); });
    var inactiveCheck = root.querySelector("#kosRenInactiveCheck");
    if (inactiveCheck) inactiveCheck.addEventListener("change", function () { state.inactiveChecked = !!inactiveCheck.checked; });
    var inactiveGo = root.querySelector("#kosRenInactiveConfirm");
    if (inactiveGo) inactiveGo.addEventListener("click", function () { confirmInactive(root, inactiveGo); });
    var lapseCheck = root.querySelector("#kosRenLapseCheck");
    if (lapseCheck) lapseCheck.addEventListener("change", function () { state.lapseChecked = !!lapseCheck.checked; });
    var lapseGo = root.querySelector("#kosRenLapseConfirm");
    if (lapseGo) lapseGo.addEventListener("click", function () { confirmLapse(root, lapseGo); });
    var reactivate = root.querySelector("#kosRenReactivate");
    if (reactivate) reactivate.addEventListener("click", function () { openReactivation(root); });
    var waivers = root.querySelector("#kosRenWaivers");
    if (waivers) waivers.addEventListener("click", openWaivers);
  }

  function openWaivers() {
    var tile = document.querySelector('[data-tool="tool:hubDuesWaivers"]');
    if (tile) tile.click();
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

  function applyLapsePayload(data) {
    if (!data) return;
    state.lapseOn = data.delinquent_on || data.lapse_on || state.lapseOn;
    state.inactiveOn = data.inactive_on || state.inactiveOn;
    if (data.can_mark_delinquent != null) state.canLapseToday = !!data.can_mark_delinquent;
    else if (data.can_lapse_today != null) state.canLapseToday = !!data.can_lapse_today;
    if (data.can_mark_inactive != null) state.canMarkInactive = !!data.can_mark_inactive;
    if (data.exemptions_missing != null) state.exemptionsMissing = Number(data.exemptions_missing) || 0;
    if (Array.isArray(data.members)) state.lapseCandidates = data.members;
  }

  async function saveLapseDate(root, btn) {
    var input = root.querySelector("#kosRenLapseInput");
    var next = input ? dateOnly(input.value) : "";
    if (!next) {
      state.msg = "Choose a lapse date.";
      state.msgKind = "err";
      paint(root);
      return;
    }
    if (state.previewOnly) {
      state.lapseOn = next;
      state.editingLapse = false;
      state.canLapseToday = next <= new Date().toISOString().slice(0, 10);
      state.msg = "Lapse date saved.";
      state.msgKind = "";
      paint(root);
      return;
    }
    btn.disabled = true;
    try {
      var client = window.__kosSb;
      if (!client) throw new Error("Still connecting.");
      var res = await client.rpc("kos_set_dues_date", { p_year: state.year, p_kind: "delinquent", p_date: next });
      if (res.error) {
        if (rpcMissing(res.error)) {
          state.lapseTools = false;
          state.msg = "";
          paint(root);
          return;
        }
        throw res.error;
      }
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not save the lapse date.");
      applyLapsePayload(data);
      state.lapseOn = data.delinquent_on || data.lapse_on || next;
      state.editingLapse = false;
      state.msg = data.message || "Lapse date saved.";
      state.msgKind = "";
    } catch (e) {
      state.msg = (e && e.message) || "Could not save the lapse date.";
      state.msgKind = "err";
    }
    paint(root);
  }

  async function openLapsePreview(root) {
    if (!state.canLapseToday) return;
    state.showLapse = true;
    state.showPreview = false;
    state.showInactive = false;
    state.lapseChecked = false;
    state.msg = "";
    if (!state.previewOnly) {
      try {
        var client = window.__kosSb;
        if (!client) throw new Error("Still connecting.");
        var res = await client.rpc("kos_lapse_candidates", { p_year: state.year });
        if (res.error) {
          if (rpcMissing(res.error)) {
            state.lapseTools = false;
            state.showLapse = false;
            paint(root);
            return;
          }
          throw res.error;
        }
        var data = res.data || {};
        if (data.ok === false) throw new Error(data.message || "Could not load the lapse list.");
        applyLapsePayload(data);
      } catch (e) {
        state.msg = (e && e.message) || "Could not load the lapse list.";
        state.msgKind = "err";
        state.showLapse = false;
      }
    }
    paint(root);
    var panel = root.querySelector("#kosRenLapsePreview");
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
  }

  async function confirmLapse(root, btn) {
    var rows = state.lapseCandidates || [];
    if (!state.lapseChecked) {
      state.msg = "Check the box after you review the list.";
      state.msgKind = "err";
      paint(root);
      return;
    }
    var ask = "Mark " + rows.length + " " + (rows.length === 1 ? "member" : "members") + " lapsed? No email is sent.";
    if (!state.previewOnly && !window.confirm(ask)) return;
    if (state.previewOnly) {
      var ids = {};
      rows.forEach(function (row) { ids[row.id] = true; });
      state.members.forEach(function (row) {
        if (ids[row.id]) row.membership_status = "lapsed";
      });
      state.showLapse = false;
      state.lapseChecked = false;
      state.msg = rows.length + " marked lapsed. No email was sent.";
      state.msgKind = "";
      paint(root);
      return;
    }
    btn.disabled = true;
    try {
      var client = window.__kosSb;
      if (!client) throw new Error("Still connecting.");
      var res = await client.rpc("kos_mark_lapsed", {
        p_member_ids: rows.map(function (row) { return row.id; }),
        p_note: null
      });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not mark those members lapsed.");
      state.msg = data.message || "Marked lapsed. No email was sent.";
      state.msgKind = "";
      state.showLapse = false;
      state.lapseChecked = false;
      await load(root);
    } catch (e) {
      state.msg = (e && e.message) || "Could not mark those members lapsed.";
      state.msgKind = "err";
      paint(root);
    }
  }

  function openInactivePreview(root) {
    if (!state.canMarkInactive) return;
    state.showInactive = true;
    state.showLapse = false;
    state.showPreview = false;
    state.inactiveChecked = false;
    state.msg = "";
    paint(root);
    var panel = root.querySelector("#kosRenInactivePreview");
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
  }

  async function confirmInactive(root, btn) {
    var rows = inactiveCandidates();
    if (!rows.length) {
      state.msg = "No delinquent or pending dues members to mark inactive.";
      state.msgKind = "err";
      paint(root);
      return;
    }
    if (!state.inactiveChecked) {
      state.msg = "Check the box after you review the list.";
      state.msgKind = "err";
      paint(root);
      return;
    }
    if (state.previewOnly) {
      rows.forEach(function (row) { row.membership_status = "inactive"; });
      state.showInactive = false;
      state.inactiveChecked = false;
      state.msg = rows.length + " marked inactive. No email was sent.";
      state.msgKind = "";
      paint(root);
      return;
    }
    btn.disabled = true;
    try {
      var client = window.__kosSb;
      if (!client) throw new Error("Still connecting.");
      var res = await client.rpc("kos_mark_inactive", {
        p_member_ids: rows.map(function (row) { return row.id; }),
        p_note: null
      });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not mark those members inactive.");
      state.msg = data.message || "Marked inactive. No email was sent.";
      state.msgKind = "";
      state.showInactive = false;
      state.inactiveChecked = false;
      await load(root);
    } catch (e) {
      state.msg = (e && e.message) || "Could not mark those members inactive.";
      state.msgKind = "err";
      paint(root);
    }
  }

  function openReactivation(root) {
    var rows = selectedLapsed();
    if (!rows.length) {
      state.msg = "Select at least one lapsed member.";
      state.msgKind = "err";
      paint(root);
      return;
    }
    state.mailMode = "reactivation";
    state.showPreview = true;
    state.showLapse = false;
    state.showInactive = false;
    state.confirmed = false;
    state.msg = "";
    paint(root);
    var panel = root.querySelector("#kosRenPreview");
    if (panel && panel.scrollIntoView) panel.scrollIntoView({ block: "nearest" });
  }

  async function markPaid(root, btn) {
    var id = btn.getAttribute("data-ren-mark");
    var row = state.members.filter(function (item) { return item.id === id; })[0];
    if (!row) return;
    var methodEl = root.querySelector('[data-ren-method="' + id + '"]');
    var method = methodEl ? methodEl.value : "check";
    var methodLabel = method === "cash" ? "cash" : "check";
    var ask = "Mark " + fullName(row) + " paid by " + methodLabel + " for the " + state.label +
      " season? This records a paid dues row. If they are lapsed or pending dues, their status becomes active. No email is sent.";
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
    var rows = state.mailMode === "reactivation" ? selectedLapsed() : selectedRows();
    if (!rows.length) {
      state.msg = state.mailMode === "reactivation" ? "Select at least one lapsed member." : "Select at least one member.";
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
    var noun = state.mailMode === "reactivation" ? "reactivation link" : "renewal reminder";
    var ask = "Send this " + noun + " to " + rows.length + " " +
      (rows.length === 1 ? "member" : "members") + "?";
    if (!state.previewOnly && !window.confirm(ask)) return;
    if (state.previewOnly) {
      state.msg = "Preview only. This would queue email for " + rows.length + " members.";
      state.msgKind = "";
      paint(root);
      return;
    }
    btn.disabled = true;
    state.msg = "Queuing the " + noun + "...";
    state.msgKind = "";
    paint(root);
    try {
      var client = window.__kosSb;
      if (!client) throw new Error("Still connecting.");
      var bodyFn = state.mailMode === "reactivation" ? reactivationBody : reminderBody;
      var groups = groupsOf(rows, state.label, bodyFn);
      var sent = 0;
      var queued = [];
      var held = false;
      var subject = state.mailMode === "reactivation"
        ? "Krewe of Shamrock membership reactivation (" + state.label + ")"
        : "Krewe of Shamrock membership renewal (" + state.label + ")";
      for (var i = 0; i < groups.length; i++) {
        var group = groups[i];
        var withEmail = group.rows.filter(function (row) {
          return row.email && String(row.email).indexOf("@") > 0;
        });
        if (!withEmail.length) continue;
        var res = await client.rpc("officer_send_member_email", {
          p_subject: subject,
          p_body_html: group.html,
          p_audience: "selected",
          p_member_ids: withEmail.map(function (row) { return row.id; })
        });
        if (res.error) throw res.error;
        if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not queue the email.");
        sent += (res.data && res.data.recipient_count != null) ? Number(res.data.recipient_count) : withEmail.length;
        if (res.data && Number(res.data.skipped_opt_out || 0) > 0) held = true;
        else queued = queued.concat(withEmail.map(function (row) { return row.id; }));
      }
      state.msg = "Queued the " + noun + " for " + sent + " member" + (sent === 1 ? "" : "s") + ".";
      if (state.mailMode === "reactivation" && queued.length) {
        var started = await client.rpc("kos_start_reactivation", { p_member_ids: queued });
        if (started.error) {
          if (!rpcMissing(started.error)) throw started.error;
        } else if (started.data && started.data.ok === false) {
          throw new Error(started.data.message || "Could not set pending dues.");
        } else if (started.data && started.data.message) {
          state.msg += " " + started.data.message;
        }
      }
      if (held) {
        state.msg += " Some addresses were skipped, so those people were not moved to pending dues.";
      }
      state.msgKind = "";
      state.confirmed = false;
      state.showPreview = false;
      state.selected = {};
      state.mailMode = "reminder";
      await load(root);
      return;
    } catch (e) {
      state.msg = (e && e.message) || "Could not queue the email.";
      state.msgKind = "err";
    }
    paint(root);
  }

  function applyFixture(payload) {
    payload = payload || {};
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
    state.mailMode = payload.mailMode || "reminder";
    state.lapseTools = payload.lapseTools !== false;
    state.lapseOn = payload.lapseOn || payload.lapse_on || payload.delinquentOn || "";
    state.inactiveOn = payload.inactiveOn || payload.inactive_on || "";
    state.canLapseToday = payload.canLapseToday != null ? !!payload.canLapseToday : !!payload.can_lapse_today;
    state.canMarkInactive = payload.canMarkInactive != null ? !!payload.canMarkInactive : !!payload.can_mark_inactive;
    state.editingLapse = !!payload.editingLapse;
    state.showLapse = !!payload.showLapse;
    state.lapseChecked = !!payload.lapseChecked;
    state.showInactive = !!payload.showInactive;
    state.inactiveChecked = !!payload.inactiveChecked;
    state.lapseCandidates = payload.lapseCandidates || payload.candidates || [];
    state.exemptionsMissing = Number(payload.exemptionsMissing != null ? payload.exemptionsMissing : payload.exemptions_missing) || 0;
  }

  async function load(root) {
    if (window.__kosRenewalsFixture) {
      applyFixture(window.__kosRenewalsFixture);
      paint(root);
      return;
    }
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
      state.lapseTools = false;
      try {
        var lapse = await client.rpc("kos_get_dues_dates", { p_year: state.year });
        if (lapse.error) {
          if (!rpcMissing(lapse.error)) throw lapse.error;
        } else if (lapse.data && lapse.data.ok !== false) {
          state.lapseTools = true;
          applyLapsePayload(lapse.data);
        }
      } catch (lapseErr) {
        if (!rpcMissing(lapseErr)) {
          state.msg = (lapseErr && lapseErr.message) || "Could not load the lapse date.";
          state.msgKind = "err";
        }
        state.lapseTools = false;
      }
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
    window.__kosRenewalsFixture = null;
    applyFixture(payload || {});
    paint(el);
  }

  window.kosRenewalsPreview = renderPreview;
  window.kosRenewalReminderHtml = function (rows, label) {
    state.label = label;
    state.mailMode = "reminder";
    return previewHtml(rows);
  };

  var css = document.createElement("style");
  css.textContent =
    ".kos-ren-note{font-size:15px;line-height:1.45;color:#5c5648;margin:0 0 12px;}" +
    ".kos-ren-lapse{font-size:15px;line-height:1.45;margin:0 0 8px;}" +
    ".kos-ren-lapse-edit{display:inline-grid;gap:4px;margin-right:8px;font-size:13px;color:#5c5648;}" +
    ".kos-ren-lapse-edit input{min-height:44px;border-radius:12px;border:1px solid rgba(168,128,28,.4);padding:8px 10px;font:inherit;}" +
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
    ".kos-ren-lapse-list{margin:0 0 10px;padding-left:18px;}" +
    ".kos-ren-warn{background:#fff6e8;border:1px solid rgba(168,128,28,.45);border-radius:12px;padding:10px 12px;}" +
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
