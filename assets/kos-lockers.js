/* Member Hub lockers.
   Members see their own assignment and lockers still open.
   Officers (is_krewe_officer) manage the board: owner, roster link, cost, paid.
   Writes go through officer_save_locker. Reads of other people's names stay
   on the officer query, which RLS limits to officers. */
(function () {
  "use strict";

  var CSS =
    ".kos-lk-lead{margin:0 0 12px;color:var(--muted);font-size:15px;line-height:1.45;}" +
    ".kos-lk-h{margin:16px 0 8px;font-family:var(--display);color:var(--green-800);font-size:18px;}" +
    ".kos-lk-h:first-child{margin-top:0;}" +
    ".kos-lk-mine{background:#fffdf4;border:1px solid rgba(168,128,28,.45);border-left:5px solid #1d6b3e;border-radius:12px;padding:12px 14px;margin:0 0 8px;}" +
    ".kos-lk-mine b{font-family:var(--display);color:var(--green-800);font-size:18px;}" +
    ".kos-lk-meta{color:#3a3a2e;font-size:15px;margin-top:4px;}" +
    ".kos-lk-chips{display:flex;flex-wrap:wrap;gap:8px;}" +
    ".kos-lk-chip{background:#fffdf4;border:1px solid rgba(29,107,62,.35);border-radius:999px;padding:6px 10px;font-size:14px;color:var(--green-800);}" +
    ".kos-lk-chip strong{font-family:var(--display);}" +
    ".kos-lk-badge{display:inline-block;border-radius:999px;padding:1px 8px;font-size:12px;font-family:var(--display);letter-spacing:.03em;text-transform:uppercase;}" +
    ".kos-lk-badge.paid{background:#1d6b3e;color:#fffdf4;}" +
    ".kos-lk-badge.due{background:#f6efdd;color:#6b5a1e;border:1px solid rgba(168,128,28,.55);}" +
    ".kos-lk-badge.open{background:#f6efdd;color:#1d6b3e;border:1px solid rgba(29,107,62,.35);}" +
    ".kos-lk-filters{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 12px;}" +
    ".kos-lk-filters button{appearance:none;border:1px solid rgba(168,128,28,.45);background:#fff;border-radius:999px;padding:8px 12px;font:inherit;font-size:14px;min-height:40px;cursor:pointer;color:var(--green-800);}" +
    ".kos-lk-filters button.on{background:#14532d;color:#fff;border-color:#14532d;}" +
    ".kos-lk-stats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}" +
    ".kos-lk-stat{background:#f6efdd;border-radius:12px;padding:8px 12px;font-size:14px;color:#3a3a2e;}" +
    ".kos-lk-stat b{font-family:var(--display);color:var(--green-800);}" +
    ".kos-lk-row{border:1px solid rgba(168,128,28,.35);border-radius:12px;padding:10px 12px;margin:8px 0;background:#fff;}" +
    ".kos-lk-row.head{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;}" +
    ".kos-lk-code{font-family:var(--display);color:var(--green-800);font-size:18px;}" +
    ".kos-lk-edit{margin-top:10px;padding-top:10px;border-top:1px dashed rgba(168,128,28,.45);}" +
    ".kos-lk-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;}" +
    ".kos-lk-grid .wide{grid-column:1/-1;}" +
    ".kos-lk-edit label{display:block;font-size:13px;color:var(--muted);margin:0 0 3px;}" +
    ".kos-lk-edit input,.kos-lk-edit select,.kos-lk-edit textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;font:inherit;background:#fff;}" +
    ".kos-lk-edit textarea{min-height:64px;resize:vertical;}" +
    ".kos-lk-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}" +
    ".kos-lk-note{font-size:13px;color:var(--muted);margin:4px 0 0;line-height:1.4;}" +
    ".kos-lk-req{background:#fffdf4;border:1px solid rgba(168,128,28,.4);border-radius:12px;padding:10px 12px;margin:6px 0;font-size:14px;}" +
    ".kos-lk-msg{min-height:1.2em;margin:8px 0 0;font-size:14px;color:var(--green-800);}" +
    ".kos-lk-msg.err{color:#8b2e1c;}" +
    ".kos-lk-group{margin:14px 0 4px;font-family:var(--display);color:var(--green-800);font-size:16px;}" +
    "@media(max-width:640px){.kos-lk-grid{grid-template-columns:1fr}.kos-lk-grid .wide{grid-column:auto}}";

  var filter = "all";
  var openCode = "";
  var roster = [];
  var rows = [];
  var requests = [];

  function css() {
    if (document.getElementById("kosLockersCss")) return;
    var s = document.createElement("style");
    s.id = "kosLockersCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    var n = Number(cents || 0) / 100;
    if (!isFinite(n)) n = 0;
    if (Math.round(n) === n) return "$" + n.toFixed(0);
    return "$" + n.toFixed(2);
  }

  function sizeLabel(size) {
    return size === "large" ? "Large" : "Small";
  }

  function paidBadge(paid) {
    return paid
      ? '<span class="kos-lk-badge paid">Paid</span>'
      : '<span class="kos-lk-badge due">Not paid</span>';
  }

  function asList(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return []; }
    }
    return Array.isArray(data) ? data : [];
  }

  function paintMember(board) {
    var body = document.getElementById("lockerBody");
    if (!body) return;
    var mine = asList(board && board.mine);
    var open = asList(board && board.open);
    var html = "";
    html += '<h3 class="kos-lk-h">Your locker</h3>';
    if (!mine.length) {
      html += '<p class="kos-lk-lead">No locker is assigned to your member profile yet.</p>';
    } else {
      html += mine.map(function (l) {
        return '<div class="kos-lk-mine"><b>' + esc(l.code) + "</b> · " + esc(sizeLabel(l.size)) +
          '<div class="kos-lk-meta">' + esc(l.owner_name || "Assigned") + " · " + esc(money(l.cost_cents)) +
          " · " + paidBadge(!!l.paid) + "</div></div>";
      }).join("");
    }
    html += '<h3 class="kos-lk-h">Open lockers</h3>';
    if (!open.length) {
      html += '<p class="kos-lk-lead">Every locker is assigned right now.</p>';
    } else {
      html += '<div class="kos-lk-chips">' + open.map(function (l) {
        return '<span class="kos-lk-chip"><strong>' + esc(l.code) + "</strong> " +
          esc(sizeLabel(l.size)) + " · " + esc(money(l.cost_cents)) + "</span>";
      }).join("") + "</div>";
    }
    html += '<p class="kos-lk-note">To take an open locker, ask the Secretary or the President. ' +
      'Large lockers are $200 and small lockers are $75 unless a locker is marked $0. ' +
      'Write <a href="mailto:secretary@kreweofshamrock.com">secretary@kreweofshamrock.com</a>.</p>';
    body.innerHTML = html;
  }

  function paintMemberError(msg) {
    var body = document.getElementById("lockerBody");
    if (!body) return;
    body.innerHTML = '<p class="empty">' + esc(msg || "Could not load lockers.") + "</p>";
  }

  async function loadMember(sb) {
    css();
    var body = document.getElementById("lockerBody");
    if (!body || !sb) return;
    body.innerHTML = '<p class="empty">Loading lockers…</p>';
    try {
      var res = await sb.rpc("my_locker_board");
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) {
        paintMemberError(data.message || "Could not load lockers.");
        return;
      }
      paintMember(data);
    } catch (e) {
      paintMemberError("Could not load lockers. If this stays blank, the locker roster still needs to be applied in Supabase.");
    }
  }

  window.kosPaintMemberLockers = loadMember;

  function memberOption(m, selected) {
    var name = [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || "Member";
    var extra = m.membership_status && m.membership_status !== "active" ? " (" + m.membership_status + ")" : "";
    return '<option value="' + esc(m.id) + '"' + (String(selected || "") === String(m.id) ? " selected" : "") + ">" +
      esc(name + extra) + "</option>";
  }

  function memberSelect(id, selected) {
    var opts = '<option value="">Not linked</option>' + roster.map(function (m) {
      return memberOption(m, selected);
    }).join("");
    return '<select id="' + id + '">' + opts + "</select>";
  }

  function visibleRows() {
    return rows.filter(function (l) {
      if (filter === "large") return l.size === "large";
      if (filter === "small") return l.size === "small";
      if (filter === "open") return l.status === "open";
      if (filter === "unpaid") return l.status === "assigned" && !l.paid;
      return true;
    });
  }

  function groupTitle(code) {
    if (/^LL/i.test(code)) return "Large · left bank";
    if (/^RL/i.test(code)) return "Large · right bank";
    if (/^RS/i.test(code)) return "Small";
    return "Other";
  }

  function statsHtml() {
    var openLarge = rows.filter(function (l) { return l.status === "open" && l.size === "large"; }).length;
    var openSmall = rows.filter(function (l) { return l.status === "open" && l.size === "small"; }).length;
    var unpaid = rows.filter(function (l) { return l.status === "assigned" && !l.paid; }).length;
    var paid = rows.filter(function (l) { return l.status === "assigned" && l.paid; }).length;
    return '<div class="kos-lk-stats">' +
      '<span class="kos-lk-stat"><b>' + openLarge + "</b> large open</span>" +
      '<span class="kos-lk-stat"><b>' + openSmall + "</b> small open</span>" +
      '<span class="kos-lk-stat"><b>' + unpaid + "</b> assigned, not paid</span>" +
      '<span class="kos-lk-stat"><b>' + paid + "</b> paid</span></div>";
  }

  function editHtml(l) {
    var cid = esc(l.code);
    return '<div class="kos-lk-edit" data-edit-for="' + cid + '">' +
      '<div class="kos-lk-grid">' +
      '<div><label for="lkOwner-' + cid + '">Owner label</label>' +
      '<input id="lkOwner-' + cid + '" value="' + esc(l.owner_name || "") + '" maxlength="80" /></div>' +
      '<div><label for="lkCost-' + cid + '">Cost (dollars)</label>' +
      '<input id="lkCost-' + cid + '" type="number" min="0" step="1" value="' + esc(String(Math.round(Number(l.cost_cents || 0) / 100))) + '" /></div>' +
      '<div><label for="lkMem-' + cid + '">Member profile</label>' + memberSelect("lkMem-" + l.code, l.member_id) + "</div>" +
      '<div><label for="lkCo-' + cid + '">Second member</label>' + memberSelect("lkCo-" + l.code, l.co_member_id) + "</div>" +
      '<div><label for="lkStatus-' + cid + '">Status</label><select id="lkStatus-' + cid + '">' +
      '<option value="assigned"' + (l.status !== "open" ? " selected" : "") + ">Assigned</option>" +
      '<option value="open"' + (l.status === "open" ? " selected" : "") + ">Open</option></select></div>" +
      '<div><label for="lkPaid-' + cid + '">Paid</label><select id="lkPaid-' + cid + '">' +
      '<option value="no"' + (!l.paid ? " selected" : "") + ">Not paid</option>" +
      '<option value="yes"' + (l.paid ? " selected" : "") + ">Paid</option></select></div>" +
      '<div class="wide"><label for="lkNotes-' + cid + '">Notes</label>' +
      '<textarea id="lkNotes-' + cid + '">' + esc(l.notes || "") + "</textarea></div>" +
      "</div>" +
      '<div class="kos-lk-actions"><button class="btn btn-primary" type="button" data-save="' + cid + '">☘ Save ' + cid + "</button></div>" +
      '<p class="kos-lk-note">Marking a locker open clears the owner, both member links, and the paid flag.</p>' +
      "</div>";
  }

  function requestsHtml() {
    if (!requests.length) return "";
    return '<h3 class="kos-lk-h">Requests still waiting</h3>' +
      '<p class="kos-lk-note">These came in on the old request form. They are not assignments. Match them to a code above if the person should have that locker.</p>' +
      requests.map(function (r) {
        var who = r.holder_name || r.holder_email || "Member";
        return '<div class="kos-lk-req"><b>' + esc(who) + "</b> · " + esc(sizeLabel(r.size)) +
          (r.holder_email ? " · " + esc(r.holder_email) : "") +
          (r.notes ? '<div class="kos-lk-note">' + esc(r.notes) + "</div>" : "") +
          "</div>";
      }).join("");
  }

  function renderOfficer() {
    var host = document.getElementById("hubLockerList");
    if (!host) return;
    var list = visibleRows();
    var html = statsHtml() + requestsHtml();
    html += '<div class="kos-lk-filters" role="tablist">';
    [["all", "All"], ["large", "Large"], ["small", "Small"], ["open", "Open"], ["unpaid", "Not paid"]].forEach(function (pair) {
      html += '<button type="button" data-filter="' + pair[0] + '"' + (filter === pair[0] ? ' class="on"' : "") + ">" + pair[1] + "</button>";
    });
    html += "</div>";
    if (!list.length) {
      html += '<p class="empty">No lockers in this view.</p>';
    } else {
      var lastGroup = "";
      list.forEach(function (l) {
        var g = groupTitle(l.code);
        if (g !== lastGroup) {
          html += '<div class="kos-lk-group">' + esc(g) + "</div>";
          lastGroup = g;
        }
        var holder = l.status === "open" ? "Open" : (l.owner_name || "Assigned, no label");
        html += '<article class="kos-lk-row"><div class="head"><div><span class="kos-lk-code">' + esc(l.code) + "</span> · " +
          esc(sizeLabel(l.size)) + " · " + esc(money(l.cost_cents)) +
          '<div class="kos-lk-meta">' + esc(holder) + " · " +
          (l.status === "open" ? '<span class="kos-lk-badge open">Open</span>' : paidBadge(!!l.paid)) +
          "</div>" +
          (l.notes && openCode !== l.code ? '<p class="kos-lk-note">' + esc(l.notes) + "</p>" : "") +
          '</div><button class="btn" type="button" data-toggle="' + esc(l.code) + '">' +
          (openCode === l.code ? "Close" : "Edit") + "</button></div>";
        if (openCode === l.code) html += editHtml(l);
        html += "</article>";
      });
    }
    host.innerHTML = html;
    host.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.onclick = function () {
        filter = btn.getAttribute("data-filter");
        renderOfficer();
      };
    });
    host.querySelectorAll("[data-toggle]").forEach(function (btn) {
      btn.onclick = function () {
        var code = btn.getAttribute("data-toggle");
        openCode = openCode === code ? "" : code;
        renderOfficer();
      };
    });
    host.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.onclick = function () { saveLocker(btn.getAttribute("data-save")); };
    });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setMsg(text, bad) {
    var el = document.getElementById("hubLockerMsg");
    if (!el) return;
    el.textContent = text || "";
    el.className = "kos-lk-msg" + (bad ? " err" : "");
  }

  async function saveLocker(code) {
    var sb = window.__kosSb;
    if (!sb) return;
    var status = val("lkStatus-" + code) || "assigned";
    var cost = val("lkCost-" + code);
    var payload = {
      code: code,
      owner_name: val("lkOwner-" + code),
      member_id: val("lkMem-" + code) || null,
      co_member_id: val("lkCo-" + code) || null,
      cost_dollars: cost === "" ? null : Number(cost),
      paid: val("lkPaid-" + code) === "yes",
      status: status,
      notes: val("lkNotes-" + code),
      size: (rows.find(function (l) { return l.code === code; }) || {}).size || null
    };
    if (payload.cost_dollars != null && (!isFinite(payload.cost_dollars) || payload.cost_dollars < 0)) {
      setMsg("Cost must be zero or more.", true);
      return;
    }
    setMsg("Saving " + code + "…");
    try {
      var res = await sb.rpc("officer_save_locker", { p: payload });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not save.");
      setMsg(code + " saved.");
      openCode = "";
      await refreshOfficer(sb);
    } catch (e) {
      setMsg(e.message || "Could not save that locker.", true);
    }
  }

  async function addLocker(sb) {
    var code = val("lkNewCode").toUpperCase();
    var size = val("lkNewSize");
    var cost = val("lkNewCost");
    if (!code) { setMsg("Enter a locker code.", true); return; }
    setMsg("Adding " + code + "…");
    try {
      var res = await sb.rpc("officer_save_locker", {
        p: {
          code: code,
          size: size,
          cost_dollars: cost === "" ? null : Number(cost),
          status: "open",
          paid: false,
          owner_name: "",
          notes: ""
        }
      });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not add that locker.");
      setMsg(code + " added as open.");
      var codeEl = document.getElementById("lkNewCode");
      if (codeEl) codeEl.value = "";
      await refreshOfficer(sb);
    } catch (e) {
      setMsg(e.message || "Could not add that locker.", true);
    }
  }

  async function refreshOfficer(sb) {
    var host = document.getElementById("hubLockerList");
    if (host) host.innerHTML = '<p class="empty">Loading the locker board…</p>';
    try {
      var board = await sb.from("locker_units").select("code,size,owner_name,member_id,co_member_id,cost_cents,paid,status,notes,sort_key").order("sort_key", { ascending: true });
      if (board.error) throw board.error;
      rows = board.data || [];
      var req = await sb.rpc("officer_locker_requests");
      requests = req.error ? [] : asList(req.data);
      var people = await sb.rpc("officer_locker_roster");
      roster = people.error ? roster : asList(people.data);
      renderOfficer();
    } catch (e) {
      if (host) host.innerHTML = '<p class="empty">Could not load the locker board. Apply sql/kos_lockers.sql in Supabase, then refresh.</p>';
    }
  }

  function ensureCard() {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;
    var card = document.getElementById("hubLockers");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubLockers";
      panel.appendChild(card);
    }
    card.innerHTML =
      '<div class="app-head"><span class="ic">🔑</span><div><h2>Locker board</h2>' +
      "<small>Assign lockers, mark paid, and see what is still open</small></div></div>" +
      '<div class="app-body">' +
      '<p class="kos-lk-lead">Tim’s inventory is the starting roster. Large is $200, small is $75, except the $0 lockers. ' +
      "A name stays as written when it does not match one member profile.</p>" +
      '<div id="hubLockerList"><p class="empty">Loading the locker board…</p></div>' +
      '<div class="kos-lk-edit" style="margin-top:16px;">' +
      '<h3 class="kos-lk-h">Add a locker</h3>' +
      '<div class="kos-lk-grid">' +
      '<div><label for="lkNewCode">Code</label><input id="lkNewCode" maxlength="8" placeholder="RS16" /></div>' +
      '<div><label for="lkNewSize">Size</label><select id="lkNewSize"><option value="large">Large</option><option value="small" selected>Small</option></select></div>' +
      '<div><label for="lkNewCost">Cost (dollars)</label><input id="lkNewCost" type="number" min="0" step="1" value="75" /></div>' +
      "</div>" +
      '<div class="kos-lk-actions"><button class="btn" type="button" id="lkNewSave">Add as open</button></div>' +
      '<p class="kos-lk-msg" id="hubLockerMsg" aria-live="polite"></p>' +
      "</div></div>";
    var add = document.getElementById("lkNewSave");
    if (add) add.onclick = function () { addLocker(window.__kosSb); };
    return card;
  }

  async function bootOfficer() {
    css();
    var sb = window.__kosSb || null;
    for (var i = 0; i < 40 && !sb; i++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      sb = window.__kosSb || null;
    }
    if (!sb) return;
    var isOfficer = false;
    try {
      var res = await sb.rpc("is_krewe_officer");
      isOfficer = !!res.data;
    } catch (e) {
      isOfficer = false;
    }
    if (!isOfficer) return;
    ensureCard();
    await refreshOfficer(sb);
    if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();
  }

  var prevUnlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof prevUnlock === "function") prevUnlock();
    setTimeout(bootOfficer, 180);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(bootOfficer, 700); });
  } else {
    setTimeout(bootOfficer, 700);
  }
})();
