/* Officer desk: Dues waivers.
   Any krewe officer (is_krewe_officer), same as Email members and Send invoices.
   Reads dues_payments, members, and kos_dues_events (officer RLS already live).
   Writes only through kos_request_dues_waiver, kos_decide_dues_waiver,
   and kos_apply_elected_officer_exemptions. The batch RPC runs only from
   the confirm button. */
(function () {
  var CSS =
    ".hub-ei label{display:block;font-size:13px;color:var(--muted);margin:0 0 4px;}" +
    ".hub-ei input[type=text],.hub-ei input[type=number],.hub-ei input[type=search],.hub-ei textarea,.hub-ei select{" +
    "width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(168,128,28,.35);" +
    "background:#fff;font:inherit;font-size:16px;min-height:48px;}" +
    ".hub-ei textarea{min-height:90px;resize:vertical;}" +
    ".hub-ei .hub-ei-grid{display:grid;gap:14px;margin-top:8px;}" +
    ".hub-ei .hub-ei-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;}" +
    ".hub-ei .hub-ei-row .btn{min-height:48px;padding:12px 18px;font-size:16px;}" +
    ".hub-ei .hub-ei-msg{margin:10px 0 0;font-size:14px;min-height:1.2em;}" +
    ".hub-ei .hub-ei-msg.ok{color:#1d6b3e;}" +
    ".hub-ei .hub-ei-msg.err{color:#b3261e;}" +
    ".hub-ei .hub-ei-note{margin:8px 0 0;font-size:13px;color:var(--muted);line-height:1.45;}" +
    ".hub-ei .hub-ei-pills{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px;}" +
    ".hub-ei .hub-ei-pill{appearance:none;border:1px solid rgba(168,128,28,.4);background:#fff;border-radius:999px;" +
    "padding:10px 14px;font:inherit;font-size:14px;min-height:44px;cursor:pointer;}" +
    ".hub-ei .hub-ei-pill.on{background:#14532d;color:#fff;border-color:#14532d;}" +
    ".hub-ei .hub-ei-list{max-height:240px;overflow:auto;border:1px solid rgba(168,128,28,.25);border-radius:12px;" +
    "background:#fff;margin-top:8px;}" +
    ".hub-ei .hub-ei-item{padding:12px 14px;border-top:1px solid rgba(168,128,28,.18);font-size:15px;}" +
    ".hub-ei .hub-ei-item:first-child{border-top:0;}" +
    ".hub-ei .hub-ei-item .meta{font-size:12px;color:var(--muted);margin-top:2px;}" +
    ".hub-ei .hub-ei-history{margin-top:22px;border-top:1px solid rgba(168,128,28,.25);padding-top:14px;}" +
    ".hub-ei .hub-ei-history h3,.hub-ei .hub-wav-block h3{margin:0 0 8px;font-family:var(--display);font-size:17px;color:#14532d;}" +
    ".hub-ei .hub-wav-block{margin-top:22px;border-top:1px solid rgba(168,128,28,.25);padding-top:14px;}" +
    ".hub-ei .hub-wav-selected{margin-top:8px;padding:10px 12px;border-radius:12px;background:#f6efdd;border-left:4px solid #d4af37;font-size:14px;line-height:1.45;}" +
    ".hub-ei button.hub-wav-pick{display:block;width:100%;text-align:left;background:#fff;border:0;" +
    "border-top:1px solid rgba(168,128,28,.18);padding:12px 14px;font:inherit;font-size:15px;cursor:pointer;}" +
    ".hub-ei button.hub-wav-pick:first-child{border-top:0;}" +
    ".hub-ei button.hub-wav-pick.on{background:#f6efdd;}" +
    ".hub-ei .hub-wav-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}" +
    ".hub-ei .hub-wav-actions .btn{min-height:44px;}" +
    ".hub-ei .hub-ei-counts{margin-top:8px;padding:10px 12px;border-radius:12px;background:#f6efdd;font-size:14px;line-height:1.45;}";

  var KIND_LABEL = {
    elected_officer: "Elected officer exemption",
    service_in_lieu: "Service in lieu",
    board_approved_other: "Other board-approved"
  };
  var LEVEL_LABEL = {
    full: "Full",
    associate: "Associate",
    loa: "Leave of absence",
    auxiliary: "Auxiliary"
  };

  var wavState = {
    roster: [],
    duesByMember: {},
    events: [],
    catalog: {},
    selectedId: "",
    histFilter: "all",
    busy: false
  };
  var loadSeq = 0;

  function injectCss() {
    if (document.getElementById("kosDuesWaiversCss")) return;
    var s = document.createElement("style");
    s.id = "kosDuesWaiversCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(v) {
    return (v == null ? "" : String(v)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function when(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setMsg(id, text, kind) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
    el.className = "hub-ei-msg" + (kind ? " " + kind : "");
  }

  function money(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return "";
    return "$" + n.toFixed(2);
  }

  function waiverYear() {
    var n = parseInt(val("hubWavYear") || "2026", 10);
    if (!n || n < 2000 || n > 2100) return 2026;
    return n;
  }

  function kindLabel(kind) {
    return KIND_LABEL[kind] || kind || "Waiver";
  }

  function levelLabel(level) {
    return LEVEL_LABEL[level] || level || "Full";
  }

  function isDiscretionary(kind) {
    return kind === "service_in_lieu" || kind === "board_approved_other";
  }

  function electedSegments(title) {
    return String(title || "").split(/\s*·\s*/).map(function (part) {
      return part.trim();
    }).filter(function (part) {
      return /^(president|vice president|secretary|treasurer)$/i.test(part);
    });
  }

  function fullName(m) {
    return ((m && m.first_name) || "") + " " + ((m && m.last_name) || "");
  }

  function memberById(id) {
    var found = null;
    wavState.roster.forEach(function (m) {
      if (m.id === id) found = m;
    });
    return found;
  }

  function quoteFor(level) {
    var key = LEVEL_LABEL[level] ? level : "full";
    var row = wavState.catalog[key];
    if (!row) return { level: key, amount: null, from_catalog: false };
    return { level: key, amount: Number(row.amount), from_catalog: true };
  }

  function cashPaid(dues) {
    if (!dues || !dues.paid) return false;
    return String(dues.payment_method || "") !== "waiver";
  }

  function waiverApplied(dues) {
    if (!dues) return false;
    if (dues.waiver_status === "applied") return true;
    return !!(dues.paid && String(dues.payment_method || "") === "waiver");
  }

  function payloadOf(ev) {
    var p = ev && ev.payload;
    if (!p) return {};
    if (typeof p === "string") {
      try { return JSON.parse(p) || {}; } catch (e) { return {}; }
    }
    return p;
  }

  function latestEvent(memberId, type) {
    var best = null;
    wavState.events.forEach(function (ev) {
      if (!ev || ev.member_id !== memberId) return;
      if (type && ev.event_type !== type) return;
      if (!best || String(ev.created_at || "") > String(best.created_at || "")) best = ev;
    });
    return best;
  }

  function reasonFromNotes(notes) {
    var found = "";
    String(notes || "").split(/\n/).forEach(function (line) {
      var m = /^Waiver requested \([^)]+\)(?::\s*(.*))?$/.exec(String(line || "").trim());
      if (m) found = m[1] || "";
    });
    return found;
  }

  function reasonFor(memberId, dues) {
    var ev = latestEvent(memberId, "waiver_requested");
    var reason = payloadOf(ev).reason;
    if (reason) return String(reason);
    return reasonFromNotes(dues && dues.notes);
  }

  function actorLabel(actor) {
    var raw = actor == null ? "" : String(actor).trim();
    if (!raw) return "not recorded";
    var email = raw.toLowerCase();
    var match = null;
    wavState.roster.forEach(function (m) {
      if (m.email && String(m.email).toLowerCase() === email) match = m;
    });
    if (match) return fullName(match).trim() + " (" + raw + ")";
    return raw;
  }

  function rpcData(res) {
    var data = res && res.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { data = { ok: false, message: data }; }
    }
    return data || {};
  }

  async function callRpc(client, name, args) {
    var res = await client.rpc(name, args);
    if (res.error) throw res.error;
    var data = rpcData(res);
    if (data.ok === false) throw new Error(data.message || "The dues function said no.");
    return data;
  }

  function ensureCard() {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;
    var card = document.getElementById("hubDuesWaivers");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubDuesWaivers";
      panel.appendChild(card);
    }
    return card;
  }

  function paintReasonLabel() {
    var lab = document.getElementById("hubWavReasonLabel");
    if (!lab) return;
    lab.textContent = isDiscretionary(val("hubWavKind")) ? "Reason (required)" : "Reason (optional)";
  }

  function applySuggestion(member) {
    var kindEl = document.getElementById("hubWavKind");
    var note = document.getElementById("hubWavSuggest");
    var segs = electedSegments(member && member.officer_title);
    if (segs.length) {
      if (kindEl) kindEl.value = "elected_officer";
      if (note) {
        note.textContent = "Suggested elected officer exemption because the title includes " + segs.join(", ") + ".";
      }
    } else {
      if (kindEl) kindEl.value = "";
      if (note) note.textContent = "";
    }
    paintReasonLabel();
  }

  function matchingMembers() {
    var q = val("hubWavSearch").toLowerCase();
    if (!q) return [];
    var rows = wavState.roster.filter(function (m) {
      var blob = ((m.first_name || "") + " " + (m.last_name || "") + " " + (m.email || "") + " " + (m.officer_title || "")).toLowerCase();
      return blob.indexOf(q) !== -1;
    });
    rows.sort(function (a, b) {
      var ln = String(a.last_name || "").localeCompare(String(b.last_name || ""));
      if (ln) return ln;
      return String(a.first_name || "").localeCompare(String(b.first_name || ""));
    });
    return rows.slice(0, 20);
  }

  function renderPick() {
    var target = document.getElementById("hubWavPick");
    if (!target) return;
    var rows = matchingMembers();
    if (!val("hubWavSearch")) {
      target.innerHTML = '<p class="empty" style="padding:12px;">Type a name or email to pick a member.</p>';
      return;
    }
    if (!rows.length) {
      target.innerHTML = '<p class="empty" style="padding:12px;">No members match.</p>';
      return;
    }
    target.innerHTML = rows.map(function (m) {
      var on = m.id === wavState.selectedId ? " on" : "";
      var dues = wavState.duesByMember[m.id];
      var flag = "";
      if (cashPaid(dues)) flag = " · Paid in money";
      else if (waiverApplied(dues)) flag = " · Waiver applied";
      else if (dues && dues.waiver_status === "requested") flag = " · Request waiting";
      return '<button type="button" class="hub-wav-pick' + on + '" data-id="' + esc(m.id) + '" aria-label="' + esc(fullName(m).trim()) + '">' +
        "<b>" + esc(fullName(m).trim()) + "</b>" +
        '<div class="meta">' + esc(m.email || "No email") +
        (m.officer_title ? " · " + esc(m.officer_title) : "") +
        esc(flag) + "</div></button>";
    }).join("");
    target.querySelectorAll("button[data-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        wavState.selectedId = btn.getAttribute("data-id");
        applySuggestion(memberById(wavState.selectedId));
        renderPick();
        renderSelected();
      });
    });
  }

  function renderSelected() {
    var box = document.getElementById("hubWavSelected");
    var btn = document.getElementById("hubWavRequest");
    if (!box) return;
    var member = memberById(wavState.selectedId);
    if (!member) {
      box.textContent = "No member selected.";
      if (btn) btn.disabled = true;
      return;
    }
    var dues = wavState.duesByMember[member.id];
    var quote = quoteFor(member.membership_level || "full");
    var rate = quote.from_catalog ? (levelLabel(quote.level) + " · " + money(quote.amount)) : "No catalog rate for this year";
    var status = "No dues row for this year yet. A request adds an unpaid row. It does not mark the member paid.";
    var blocked = false;
    if (cashPaid(dues)) {
      status = "Paid in money · " + money(dues.amount) + " · " + (dues.payment_method || "payment") +
        ". The waiver tools will not change this row.";
      blocked = true;
    } else if (waiverApplied(dues)) {
      status = "A waiver is already applied for this year (" + kindLabel(dues.waiver_kind) +
        "). Amount due " + money(dues.amount) + ". It was not opened for a new request.";
      blocked = true;
    } else if (dues && dues.waiver_status === "requested") {
      status = "A request is already waiting (" + kindLabel(dues.waiver_kind) +
        "). Submitting updates the kind and note. The member stays unpaid.";
    } else if (dues) {
      status = (dues.paid ? "Paid" : "Unpaid") + " " + money(dues.amount) + ". A request does not mark this paid.";
    }
    box.innerHTML = "<b>" + esc(fullName(member).trim()) + "</b>" +
      (member.officer_title ? " · " + esc(member.officer_title) : "") +
      '<div class="meta">Catalog rate: ' + esc(rate) + "</div>" +
      "<div>" + esc(status) + "</div>";
    if (btn) btn.disabled = blocked || wavState.busy;
  }

  function renderQueue() {
    var target = document.getElementById("hubWavQueue");
    if (!target) return;
    var year = waiverYear();
    var rows = [];
    wavState.roster.forEach(function (m) {
      var dues = wavState.duesByMember[m.id];
      if (dues && dues.waiver_status === "requested") rows.push({ member: m, dues: dues });
    });
    Object.keys(wavState.duesByMember).forEach(function (id) {
      if (memberById(id)) return;
      var dues = wavState.duesByMember[id];
      if (dues && dues.waiver_status === "requested") {
        rows.push({ member: { id: id, first_name: "Member", last_name: id.slice(0, 8) }, dues: dues });
      }
    });
    rows.sort(function (a, b) {
      return fullName(a.member).localeCompare(fullName(b.member));
    });
    if (!rows.length) {
      target.innerHTML = '<p class="empty">No waiver requests waiting for ' + year + ".</p>";
      return;
    }
    target.innerHTML = rows.map(function (row) {
      var m = row.member;
      var dues = row.dues;
      var name = fullName(m).trim();
      var reason = reasonFor(m.id, dues);
      var asked = latestEvent(m.id, "waiver_requested");
      var who = actorLabel(dues.waiver_requested_by || (asked && asked.actor));
      var whenAsked = when(asked && asked.created_at);
      var blocked = cashPaid(dues);
      return '<div class="hub-ei-item">' +
        "<b>" + esc(name) + "</b>" +
        '<div class="meta">' + esc(kindLabel(dues.waiver_kind)) +
        (m.officer_title ? " · " + esc(m.officer_title) : "") +
        " · Unpaid " + esc(money(dues.amount)) + "</div>" +
        '<div class="meta">Requested by ' + esc(who) +
        (whenAsked ? " · " + esc(whenAsked) : "") + "</div>" +
        '<div class="meta">Reason: ' + esc(reason || "none recorded") + "</div>" +
        (blocked
          ? '<div class="meta">Already paid in money. Approve and deny are turned off so this row stays as it is.</div>'
          : '<div class="hub-wav-actions">' +
            '<button type="button" class="btn btn-primary" data-approve="' + esc(m.id) + '" aria-label="Approve ' + esc(name) + '">Approve</button>' +
            '<button type="button" class="btn" data-deny="' + esc(m.id) + '" aria-label="Deny ' + esc(name) + '">Deny</button>' +
            "</div>") +
        "</div>";
    }).join("");
  }

  function historyRows() {
    var rows = [];
    function push(member, dues) {
      var status = dues.waiver_status;
      if (status !== "applied" && status !== "denied" && status !== "approved") return;
      if (wavState.histFilter === "applied" && status !== "applied") return;
      if (wavState.histFilter === "denied" && status !== "denied") return;
      rows.push({ member: member, dues: dues });
    }
    wavState.roster.forEach(function (m) {
      var dues = wavState.duesByMember[m.id];
      if (dues) push(m, dues);
    });
    rows.sort(function (a, b) {
      var da = String(a.dues.waiver_approved_at || "");
      var db = String(b.dues.waiver_approved_at || "");
      if (da !== db) return db.localeCompare(da);
      return fullName(a.member).localeCompare(fullName(b.member));
    });
    return rows;
  }

  function renderHistory() {
    var target = document.getElementById("hubWavHistory");
    if (!target) return;
    ["all", "applied", "denied"].forEach(function (f) {
      var pill = document.getElementById("hubWavHist_" + f);
      if (pill) pill.classList.toggle("on", wavState.histFilter === f);
    });
    var rows = historyRows();
    if (!rows.length) {
      target.innerHTML = '<p class="empty">No ' +
        (wavState.histFilter === "all" ? "applied or denied waivers" : wavState.histFilter + " waivers") +
        " for " + waiverYear() + ".</p>";
      return;
    }
    target.innerHTML = rows.map(function (row) {
      var m = row.member;
      var dues = row.dues;
      var name = fullName(m).trim();
      var reason = reasonFor(m.id, dues);
      var asked = latestEvent(m.id, "waiver_requested");
      var whoAsked = actorLabel(dues.waiver_requested_by || (asked && asked.actor));
      var html = '<div class="hub-ei-item"><b>' + esc(name) + "</b>" +
        '<div class="meta">' + esc(kindLabel(dues.waiver_kind)) + " · " + esc(dues.waiver_status) + "</div>" +
        '<div class="meta">Requested by ' + esc(whoAsked) + "</div>" +
        '<div class="meta">Reason: ' + esc(reason || "none recorded") + "</div>";
      if (dues.waiver_status === "applied" || dues.waiver_status === "approved") {
        var waived = dues.standard_amount == null || dues.standard_amount === ""
          ? "not recorded"
          : money(dues.standard_amount);
        var decided = latestEvent(m.id, dues.waiver_status === "applied" ? "waiver_applied" : "waiver_approved");
        var approver = actorLabel(dues.waiver_approved_by || (decided && decided.actor));
        var at = when(dues.waiver_approved_at || (decided && decided.created_at));
        html += '<div class="meta">Waived value: ' + esc(waived) + "</div>" +
          '<div class="meta">Approved by ' + esc(approver) + (at ? " · " + esc(at) : "") + "</div>";
        if (dues.waiver_status === "applied") {
          html += '<div class="meta">Amount due ' + esc(money(dues.amount)) +
            " · method " + esc(dues.payment_method || "waiver") + "</div>";
        }
      } else if (dues.waiver_status === "denied") {
        var deniedEv = latestEvent(m.id, "waiver_denied");
        var denier = actorLabel((deniedEv && deniedEv.actor) || "");
        var deniedAt = when(deniedEv && deniedEv.created_at);
        html += '<div class="meta">Denied by ' + esc(denier) + (deniedAt ? " · " + esc(deniedAt) : "") + "</div>" +
          '<div class="meta">Still unpaid ' + esc(money(dues.amount)) + "</div>";
      }
      return html + "</div>";
    }).join("");
  }

  function renderLists() {
    renderPick();
    renderSelected();
    renderQueue();
    renderHistory();
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

  async function loadWaiverData(client) {
    var seq = ++loadSeq;
    var year = waiverYear();
    try {
      var catalogRows = await rowsOf(
        client.from("kos_dues_catalog")
          .select("membership_year, level, amount, active")
          .eq("membership_year", year)
          .eq("active", true)
      );
      var roster = await paged(
        client,
        "members",
        "id, first_name, last_name, email, membership_level, officer_title, membership_status",
        function (q) {
          return q.is("merged_into", null)
            .in("membership_status", ["active", "lapsed", "pending-renewal"])
            .order("last_name", { ascending: true });
        }
      );
      var duesRows = await paged(
        client,
        "dues_payments",
        "id, member_id, membership_year, amount, paid, paid_date, payment_method, notes, membership_level, standard_amount, waiver_kind, waiver_status, waiver_requested_by, waiver_approved_by, waiver_approved_at",
        function (q) { return q.eq("membership_year", year); }
      );
      var events = [];
      try {
        events = await paged(
          client,
          "kos_dues_events",
          "id, event_type, actor, member_id, membership_year, payload, created_at",
          function (q) { return q.eq("membership_year", year).order("created_at", { ascending: false }); }
        );
      } catch (eventErr) {
        events = [];
      }
      if (seq !== loadSeq) return;
      wavState.catalog = {};
      catalogRows.forEach(function (row) {
        if (row && row.level) wavState.catalog[row.level] = row;
      });
      wavState.roster = roster.filter(function (m) {
        if (!m || m.merged_into) return false;
        var st = m.membership_status || "active";
        return st === "active" || st === "lapsed" || st === "pending-renewal";
      });
      wavState.duesByMember = {};
      duesRows.forEach(function (d) {
        if (d && d.member_id) wavState.duesByMember[d.member_id] = d;
      });
      wavState.events = events;
      renderLists();
    } catch (e) {
      if (seq !== loadSeq) return;
      throw e;
    }
  }

  async function requestWaiver(client) {
    if (wavState.busy) return;
    var member = memberById(wavState.selectedId);
    var kind = val("hubWavKind");
    var reason = val("hubWavReason");
    var year = waiverYear();
    if (!member) { setMsg("hubWavMsg", "Pick a member from the roster.", "err"); return; }
    var dues = wavState.duesByMember[member.id];
    if (cashPaid(dues)) {
      setMsg("hubWavMsg", "This year is already paid in money. It was not changed.", "err");
      return;
    }
    if (waiverApplied(dues)) {
      setMsg("hubWavMsg", "A waiver is already applied for this year. It was not changed.", "err");
      return;
    }
    if (!kind) { setMsg("hubWavMsg", "Choose a waiver kind.", "err"); return; }
    if (isDiscretionary(kind) && !reason) {
      setMsg("hubWavMsg", "Reason is required for service in lieu and other board-approved waivers.", "err");
      return;
    }
    wavState.busy = true;
    renderSelected();
    setMsg("hubWavMsg", "");
    try {
      var data = await callRpc(client, "kos_request_dues_waiver", {
        p_member_id: member.id,
        p_year: year,
        p_kind: kind,
        p_reason: reason
      });
      setMsg("hubWavMsg", data.message || "Waiver requested. The member is not marked paid.", "ok");
      var reasonEl = document.getElementById("hubWavReason");
      if (reasonEl) reasonEl.value = "";
      await loadWaiverData(client);
    } catch (e) {
      setMsg("hubWavMsg", "Could not request: " + ((e && e.message) || e), "err");
    }
    wavState.busy = false;
    renderSelected();
  }

  async function decideWaiver(client, memberId, approve) {
    if (wavState.busy) return;
    var dues = wavState.duesByMember[memberId];
    if (cashPaid(dues)) {
      setMsg("hubWavQueueMsg", "This year is already paid in money. It was not changed.", "err");
      return;
    }
    wavState.busy = true;
    setMsg("hubWavQueueMsg", "");
    try {
      var data = await callRpc(client, "kos_decide_dues_waiver", {
        p_member_id: memberId,
        p_year: waiverYear(),
        p_approve: approve,
        p_apply: approve ? true : false
      });
      setMsg("hubWavQueueMsg", data.message || (approve ? "Waiver applied." : "Waiver denied. The member was not marked paid."), "ok");
      await loadWaiverData(client);
    } catch (e) {
      setMsg("hubWavQueueMsg", "Could not decide: " + ((e && e.message) || e), "err");
    }
    wavState.busy = false;
    renderSelected();
  }

  function batchConfirmText(year) {
    return "Apply bylaws exemptions for the " + year + " season?\n\n" +
      "This waives dues for President, Vice President, Secretary, and Treasurer only. " +
      "Committee chairs and board members are not included. " +
      "Members already paid in money are skipped. A different applied waiver is skipped. " +
      "Nothing is waived until you confirm.";
  }

  async function applyElectedBatch(client) {
    if (wavState.busy) return;
    var year = waiverYear();
    if (!window.confirm(batchConfirmText(year))) return;
    var btn = document.getElementById("hubWavBatch");
    wavState.busy = true;
    if (btn) btn.disabled = true;
    setMsg("hubWavBatchMsg", "");
    try {
      var data = await callRpc(client, "kos_apply_elected_officer_exemptions", { p_year: year });
      var msg = data.message;
      if (!msg) {
        msg = "Applied " + (data.applied || 0) +
          ". Skipped " + (data.skipped_paid_cash || 0) + " already paid in money and " +
          (data.skipped_other_waiver || 0) + " covered by another waiver.";
      }
      setMsg("hubWavBatchMsg", msg, "ok");
      await loadWaiverData(client);
    } catch (e) {
      setMsg("hubWavBatchMsg", "Could not apply exemptions: " + ((e && e.message) || e), "err");
    }
    wavState.busy = false;
    if (btn) btn.disabled = false;
    renderSelected();
  }

  function onQueueClick(client, ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var approve = t.getAttribute("data-approve");
    var deny = t.getAttribute("data-deny");
    if (approve) decideWaiver(client, approve, true);
    else if (deny) decideWaiver(client, deny, false);
  }

  async function loadWaiverCard(client) {
    var card = ensureCard();
    if (!card) return;
    card.innerHTML =
      '<div class="app-head"><span class="ic">🎖</span><div><h2>Dues waivers</h2>' +
      "<small>Request, approve, or apply elected-officer dues exemptions</small></div></div>" +
      '<div class="app-body hub-ei">' +
      '<p class="hub-ei-note">Any officer who can open this desk can use this card. The database check is the same officer gate as Email members and Send invoices. Service in lieu and other board-approved waivers are meant for the President or Treasurer to approve. There is no separate President-only switch on the Hub, so this history list is the record of who requested and who approved. A request does not mark anyone paid. Opening this card does not apply elected-officer exemptions.</p>' +
      '<div class="hub-ei-grid">' +
      '<div><label for="hubWavYear">Membership year</label>' +
      '<input id="hubWavYear" type="number" min="2000" max="2100" value="2026" /></div>' +
      "</div>" +
      '<div class="hub-wav-block"><h3>Request a waiver</h3>' +
      '<label for="hubWavSearch">Roster search</label>' +
      '<input id="hubWavSearch" type="search" placeholder="Name or email" autocomplete="off" />' +
      '<div class="hub-ei-list" id="hubWavPick"><p class="empty" style="padding:12px;">Type a name or email to pick a member.</p></div>' +
      '<div class="hub-wav-selected" id="hubWavSelected">No member selected.</div>' +
      '<div class="hub-ei-grid">' +
      '<div><label for="hubWavKind">Waiver kind</label>' +
      '<select id="hubWavKind">' +
      '<option value="">Choose a kind</option>' +
      '<option value="elected_officer">Elected officer exemption</option>' +
      '<option value="service_in_lieu">Service in lieu</option>' +
      '<option value="board_approved_other">Other board-approved</option>' +
      "</select>" +
      '<p class="hub-ei-note" id="hubWavSuggest"></p></div>' +
      '<div><label for="hubWavReason" id="hubWavReasonLabel">Reason (optional)</label>' +
      '<textarea id="hubWavReason" placeholder="Required for service in lieu and other board-approved waivers."></textarea></div>' +
      "</div>" +
      '<div class="hub-ei-row"><button class="btn btn-primary" type="button" id="hubWavRequest" disabled>Request waiver</button></div>' +
      '<p class="hub-ei-msg" id="hubWavMsg" aria-live="polite"></p></div>' +
      '<div class="hub-wav-block"><h3>Pending requests</h3>' +
      '<p class="hub-ei-note">Approve applies the waiver: amount due becomes $0, paid, method waiver. Deny leaves the member unpaid.</p>' +
      '<div id="hubWavQueue"><p class="empty">Loading…</p></div>' +
      '<p class="hub-ei-msg" id="hubWavQueueMsg" aria-live="polite"></p></div>' +
      '<div class="hub-wav-block"><h3>Elected-officer batch</h3>' +
      '<p class="hub-ei-note">Apply bylaws exemptions for the membership year above. This waives President, Vice President, Secretary, and Treasurer only. Committee chairs and board members are not included. Members already paid in money are skipped. A different applied waiver is skipped. This does not run when the card opens.</p>' +
      '<div class="hub-ei-row"><button class="btn btn-primary" type="button" id="hubWavBatch">Apply bylaws exemptions for season</button></div>' +
      '<p class="hub-ei-msg" id="hubWavBatchMsg" aria-live="polite"></p></div>' +
      '<div class="hub-ei-history"><h3>Waiver history</h3>' +
      '<div class="hub-ei-pills" role="group" aria-label="Waiver history filter">' +
      '<button type="button" class="hub-ei-pill on" id="hubWavHist_all">All</button>' +
      '<button type="button" class="hub-ei-pill" id="hubWavHist_applied">Applied</button>' +
      '<button type="button" class="hub-ei-pill" id="hubWavHist_denied">Denied</button>' +
      "</div>" +
      '<div id="hubWavHistory"><p class="empty">Loading…</p></div></div>' +
      "</div>";

    document.getElementById("hubWavSearch").addEventListener("input", renderPick);
    document.getElementById("hubWavKind").addEventListener("change", paintReasonLabel);
    document.getElementById("hubWavRequest").addEventListener("click", function () { requestWaiver(client); });
    document.getElementById("hubWavQueue").addEventListener("click", function (ev) { onQueueClick(client, ev); });
    document.getElementById("hubWavBatch").addEventListener("click", function () { applyElectedBatch(client); });
    ["all", "applied", "denied"].forEach(function (f) {
      document.getElementById("hubWavHist_" + f).addEventListener("click", function () {
        wavState.histFilter = f;
        renderHistory();
      });
    });
    document.getElementById("hubWavYear").addEventListener("change", function () {
      wavState.selectedId = "";
      var kindEl = document.getElementById("hubWavKind");
      if (kindEl) kindEl.value = "";
      var note = document.getElementById("hubWavSuggest");
      if (note) note.textContent = "";
      paintReasonLabel();
      loadWaiverData(client).catch(function (e) {
        setMsg("hubWavMsg", (e && e.message) || "Could not load waivers for that year.", "err");
      });
    });
    try {
      await loadWaiverData(client);
    } catch (e) {
      setMsg("hubWavMsg", (e && e.message) || "Could not load members or dues.", "err");
    }
  }

  async function boot() {
    injectCss();
    var client = window.__kosSb || null;
    for (var i = 0; i < 40 && !client; i++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      client = window.__kosSb || null;
    }
    if (!client) return;
    var isOfficer = false;
    try {
      var res = await client.rpc("is_krewe_officer");
      isOfficer = !!res.data;
    } catch (e) {
      isOfficer = false;
    }
    if (!isOfficer) return;
    await loadWaiverCard(client);
    if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();
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
