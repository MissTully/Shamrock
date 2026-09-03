/* Member Hub: personal home + tabbed sections. Preserves existing feature cards. */
(function () {
  "use strict";

  var TAB_HOME = "hub";
  var CSS = [
    ".hub-wrap{margin:0 0 18px;}",
    ".hub-welcome{background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:18px;padding:20px 22px;box-shadow:var(--shadow-sm);}",
    ".hub-welcome h2{font-family:var(--display);color:var(--green-800);margin:0 0 12px;font-size:26px;}",
    ".hub-chips{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 4px;}",
    ".hub-chip{display:inline-flex;align-items:center;gap:8px;background:#fbf7ec;border:1px solid rgba(168,128,28,.35);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:14px;color:var(--green-800);}",
    ".hub-chip.ok{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-chip.warn{background:#f0e2bd;color:#7a5b00;border-color:#d4b45a;}",
    ".hub-actions{margin-top:16px;}",
    ".hub-actions h3{font-family:var(--display);color:var(--green-800);margin:0 0 10px;font-size:18px;}",
    ".hub-action-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;}",
    ".hub-action{text-align:left;background:#fffdf4;border:1px dashed rgba(168,128,28,.55);border-radius:14px;padding:12px 14px;cursor:pointer;font:inherit;}",
    ".hub-action:hover{background:#f7efd8;}",
    ".hub-action b{display:block;color:var(--green-800);font-family:var(--display);margin-bottom:4px;}",
    ".hub-action span{font-size:13px;color:var(--muted);line-height:1.35;}",
    ".hub-officer-card{margin-top:14px;background:linear-gradient(180deg,#1d6b3e,var(--green-900));color:#fff;border-radius:16px;padding:16px 18px;display:flex;gap:14px;align-items:center;cursor:pointer;border:1px solid var(--gold);}",
    ".hub-officer-card:hover{filter:brightness(1.05);}",
    ".hub-officer-card .go{margin-left:auto;color:var(--gold-light);font-family:var(--display);}",
    ".hub-tabs{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 14px;background:linear-gradient(180deg,#fbf7ec 70%,rgba(251,247,236,0));}",
    ".hub-tabs button{border:1px solid rgba(168,128,28,.4);background:#fff;color:var(--green-800);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:14px;cursor:pointer;}",
    ".hub-tabs button.on{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-panel{display:none !important;}",
    ".hub-panel.hub-on{display:block !important;}",
    ".hub-panel > .member-grid{display:grid;gap:26px;}",
    ".hub-docs{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;}",
    ".hub-docs a{display:inline-block;background:#f0e8d2;border:1px solid rgba(168,128,28,.3);color:var(--green-800);border-radius:999px;padding:6px 13px;font-size:14px;font-family:var(--display);text-decoration:none;}",
    ".hub-docs a:hover{background:#e8ddc0;}",
    ".hub-profile{background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:16px;padding:16px 18px;margin-bottom:14px;}",
    ".hub-profile h3{margin:0 0 6px;font-family:var(--display);color:var(--green-800);}",
    "#memberContent .member-grid{display:none !important;}",
  ].join("");

  var state = { officer: false, parade: null, hoursApproved: 0, membershipStatus: null };

  function injectCss() {
    if (document.getElementById("kosHubCss")) return;
    var s = document.createElement("style");
    s.id = "kosHubCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function firstName() {
    var p = window.kosProfile || {};
    if (p.first_name) return String(p.first_name);
    var dn = (p.display_name || "").toString().trim();
    if (dn) return dn.split(/\s+/)[0];
    return "Member";
  }

  function headingOf(sec) {
    var h = sec.querySelector("h2");
    return h ? (h.textContent || "").toLowerCase() : "";
  }

  function tagSections() {
    var sections = document.querySelectorAll("#memberContent .member-grid > section");
    sections.forEach(function (sec) {
      if (sec.getAttribute("data-hub")) return;
      if (sec.id === "prCard") sec.setAttribute("data-hub", "parade");
      else if (sec.id === "dashCard") sec.setAttribute("data-hub", "officer");
      else {
        var h = headingOf(sec);
        if (h.indexOf("parade") !== -1) sec.setAttribute("data-hub", "parade");
        else if (h.indexOf("craic") !== -1) sec.setAttribute("data-hub", "fun");
        else if (h.indexOf("raffle") !== -1) sec.setAttribute("data-hub", "fun");
        else if (h.indexOf("report") !== -1) sec.setAttribute("data-hub", "officer");
        else if (h.indexOf("share") !== -1) sec.setAttribute("data-hub", "fun");
        else if (h.indexOf("locker") !== -1) sec.setAttribute("data-hub", "fun");
        else if (h.indexOf("carpool") !== -1) sec.setAttribute("data-hub", "fun");
        else if (h.indexOf("van") !== -1) sec.setAttribute("data-hub", "fun");
        else if (h.indexOf("directory") !== -1) sec.setAttribute("data-hub", "krewe");
      }
    });
  }

  function relocateHours() {
    var pr = document.getElementById("prCard");
    var body = document.getElementById("hubHoursBody");
    if (!pr || !body) return;
    var nodes = Array.prototype.slice.call(pr.querySelectorAll(".app-body > *"));
    var frag = document.createDocumentFragment();
    nodes.forEach(function (n) {
      if (n.id === "prHours" || n.id === "vhForm" || (n.tagName === "H4" && /volunteer hours/i.test(n.textContent || ""))) {
        frag.appendChild(n);
      }
    });
    if (frag.childNodes.length) {
      body.innerHTML = "";
      body.appendChild(frag);
    } else {
      body.innerHTML = '<p style="font-size:14px;color:var(--muted);">Volunteer hours appear after your Parade Ready data loads. You can also log hours from the Parade Day tab.</p>';
    }
  }

  function moveIntoPanels() {
    if (document.getElementById("hubRoot")) return;
    var main = document.getElementById("memberContent");
    if (!main) return;
    var oldGrid = main.querySelector(".member-grid");
    if (!oldGrid) return;

    var root = document.createElement("div");
    root.id = "hubRoot";
    root.className = "hub-wrap";

    var tabs = [
      ["hub", "Home"],
      ["krewe", "My Krewe"],
      ["events", "Events"],
      ["parade", "Parade Day"],
      ["give", "Give Back"],
      ["fun", "Fun"],
      ["officer", "Officer desk"]
    ];
    var tabHtml = '<nav class="hub-tabs" id="hubTabs" aria-label="Member hub sections">';
    tabs.forEach(function (t) {
      tabHtml += '<button type="button" data-hub-tab="' + t[0] + '">' + t[1] + "</button>";
    });
    tabHtml += "</nav>";

    root.innerHTML =
      '<div id="hubHome" class="hub-panel hub-on" data-hub-panel="hub"></div>' +
      '<div class="hub-panel" data-hub-panel="krewe"><div class="member-grid" id="hubKrewe"></div></div>' +
      '<div class="hub-panel" data-hub-panel="events"><div class="member-grid" id="hubEvents"></div></div>' +
      '<div class="hub-panel" data-hub-panel="parade"><div class="member-grid" id="hubParade"></div></div>' +
      '<div class="hub-panel" data-hub-panel="give"><div class="member-grid" id="hubGive"></div></div>' +
      '<div class="hub-panel" data-hub-panel="fun"><div class="member-grid" id="hubFun"></div></div>' +
      '<div class="hub-panel" data-hub-panel="officer"><div class="member-grid" id="hubOfficer"></div></div>' +
      tabHtml;

    var bar = document.getElementById("memberBar");
    if (bar) bar.insertAdjacentElement("afterend", root);
    else main.insertBefore(root, oldGrid);

    var krewe = document.getElementById("hubKrewe");
    krewe.innerHTML =
      '<section class="app-card"><div class="app-head"><span class="ic">☘</span><div><h2>My Krewe</h2><small>Profile, directory and governing docs</small></div></div>' +
      '<div class="app-body">' +
      '<div class="hub-profile" id="hubProfileCard"><h3>Your profile</h3><p class="empty">Loading…</p></div>' +
      '<h3 style="font-family:var(--display);color:var(--green-800);margin:8px 0;">Governing documents</h3>' +
      '<div class="hub-docs">' +
      '<a href="assets/docs/code-of-conduct.html">Code of Conduct</a>' +
      '<a href="assets/docs/bylaws.html">Bylaws</a>' +
      '<a href="assets/docs/parade-rules.html">Parade Rules</a>' +
      "</div></div></section>";

    var events = document.getElementById("hubEvents");
    events.innerHTML =
      '<section class="app-card"><div class="app-head"><span class="ic">📅</span><div><h2>Events and RSVPs</h2><small>See the calendar and RSVP</small></div></div>' +
      '<div class="app-body"><p>RSVP to krewe events, track attendance, and keep your calendar current.</p>' +
      '<p><a class="btn btn-primary" href="event-signup.html">Open event signup</a></p>' +
      '<p style="font-size:14px;color:var(--muted);margin-top:12px;">Attendance feeds Parade Ready and the Craic Cup.</p></div></section>';

    var give = document.getElementById("hubGive");
    give.innerHTML =
      '<section class="app-card" id="hubHoursCard"><div class="app-head"><span class="ic">🤝</span><div><h2>Volunteer hours</h2><small>Log hours toward your season goal</small></div></div>' +
      '<div class="app-body" id="hubHoursBody"><p class="empty">Loading hours…</p></div></section>';

    var parade = document.getElementById("hubParade");
    var fun = document.getElementById("hubFun");
    var officer = document.getElementById("hubOfficer");
    Array.prototype.slice.call(oldGrid.children).forEach(function (sec) {
      var hub = sec.getAttribute("data-hub");
      if (hub === "parade") parade.appendChild(sec);
      else if (hub === "fun") fun.appendChild(sec);
      else if (hub === "officer") officer.appendChild(sec);
      else if (hub === "krewe") krewe.appendChild(sec);
      else fun.appendChild(sec);
    });
    oldGrid.remove();
    relocateHours();
  }

  function standingChip() {
    var st = (state.membershipStatus || "").toString().toLowerCase();
    var unpaid = /unpaid|delinquent|lapsed|owing|past.?due/.test(st);
    var good = /good|active|current|paid/.test(st) && !unpaid;
    if (state.parade && state.parade.dues_paid === true) good = true;
    if (state.parade && state.parade.dues_paid === false) { good = false; unpaid = true; }
    var label = good ? "Good Standing" : (state.membershipStatus ? String(state.membershipStatus) : (unpaid ? "Dues attention" : "Standing TBD"));
    var cls = good ? "ok" : (unpaid ? "warn" : "");
    return '<span class="hub-chip ' + cls + '">🏷 ' + esc(label) + "</span>";
  }

  function paradeChip() {
    var me = state.parade;
    if (!me) return '<span class="hub-chip">🎗️ Parade Ready · —</span>';
    var ready = !!(me.dues_paid && me.waiver_signed && me.meeting_attended);
    return '<span class="hub-chip ' + (ready ? "ok" : "warn") + '">🎗️ ' + (ready ? "Parade Ready" : "Not parade ready") + "</span>";
  }

  function hoursChip() {
    var n = state.hoursApproved || 0;
    var cls = n >= 12 ? "ok" : "";
    return '<span class="hub-chip ' + cls + '">🤝 ' + n + "/12 volunteer hours</span>";
  }

  function nextActionsHtml() {
    var acts = [];
    var me = state.parade;
    if (me) {
      if (!me.dues_paid) acts.push({ tab: "parade", title: "View / pay dues", hint: "Settle season dues with the treasurer." });
      if (!me.waiver_signed) acts.push({ tab: "parade", title: "Sign the liability waiver", hint: "Required for your parade wristband." });
      if (!me.meeting_attended) acts.push({ tab: "events", title: "Attend the mandatory meeting", hint: "Scan the check-in QR at the next required meeting." });
    }
    if ((state.hoursApproved || 0) < 12) acts.push({ tab: "give", title: "Log volunteer hours", hint: "Work toward 12 approved hours this season." });
    acts.push({ tab: "events", title: "RSVP to the next event", hint: "Open the events calendar and RSVP." });
    acts.push({ tab: "krewe", title: "Read governing docs", hint: "Code of Conduct, bylaws, and parade rules." });
    var html = '<div class="hub-actions"><h3>My next actions</h3><div class="hub-action-grid">';
    acts.slice(0, 5).forEach(function (a) {
      html += '<button type="button" class="hub-action" data-hub-action="' + a.tab + '"><b>' + esc(a.title) + "</b><span>" + esc(a.hint) + "</span></button>";
    });
    html += "</div></div>";
    return html;
  }

  function renderHome() {
    var home = document.getElementById("hubHome");
    if (!home) return;
    var officerCard = state.officer
      ? '<div class="hub-officer-card" data-hub-action="officer"><div><b style="font-family:var(--display);font-size:18px;">Officer desk</b><div style="opacity:.9;font-size:14px;margin-top:4px;">Reports dashboard and officer tools</div></div><div class="go">Open →</div></div>'
      : "";
    home.innerHTML =
      '<div class="hub-welcome">' +
      "<h2>Welcome, " + esc(firstName()) + "</h2>" +
      '<div class="hub-chips">' + standingChip() + paradeChip() + hoursChip() + "</div>" +
      nextActionsHtml() +
      officerCard +
      "</div>";

    var p = window.kosProfile || {};
    var pc = document.getElementById("hubProfileCard");
    if (pc) {
      var nm = (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Member").toString();
      pc.innerHTML =
        "<h3>Your profile</h3>" +
        '<p style="margin:0;"><b>' + esc(nm) + "</b>" +
        (p.email ? "<br>" + esc(p.email) : "") +
        (p.member_role ? "<br>Role: " + esc(p.member_role) : "") +
        (state.membershipStatus ? "<br>Status: " + esc(state.membershipStatus) : "") +
        "</p>";
    }

    home.querySelectorAll("[data-hub-action]").forEach(function (btn) {
      btn.addEventListener("click", function () { showTab(btn.getAttribute("data-hub-action")); });
    });
  }

  function showTab(name) {
    var tab = name || TAB_HOME;
    if (tab === "officer" && !state.officer) tab = TAB_HOME;
    document.querySelectorAll("[data-hub-panel]").forEach(function (el) {
      el.classList.toggle("hub-on", el.getAttribute("data-hub-panel") === tab);
    });
    document.querySelectorAll("[data-hub-tab]").forEach(function (btn) {
      var id = btn.getAttribute("data-hub-tab");
      btn.classList.toggle("on", id === tab);
      if (id === "officer") btn.style.display = state.officer ? "" : "none";
    });
    try { sessionStorage.setItem("kosHubTab", tab); } catch (e) {}
    if (tab === "hub") renderHome();
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {}
  }

  window.kosShowHub = showTab;

  async function loadHubData() {
    var client = window.__kosSb || null;
    if (!client) {
      for (var i = 0; i < 20 && !client; i++) {
        client = window.__kosSb || null;
        if (!client) await new Promise(function (r) { setTimeout(r, 100); });
      }
    }
    if (!client) { renderHome(); return; }

    try {
      var off = await client.rpc("is_krewe_officer");
      state.officer = !!off.data;
    } catch (e) { state.officer = false; }

    try {
      var meId = (window.kosProfile || {}).member_id || null;
      var pr = await client.from("v_parade_ready").select("*");
      var rows = pr.data || [];
      state.parade = (meId && rows.find(function (r) { return r.member_id === meId; })) || (rows.length === 1 ? rows[0] : null);
      if (state.parade) {
        state.membershipStatus = state.parade.membership_status || state.membershipStatus;
        if (state.parade.volunteer_hours_approved != null) {
          state.hoursApproved = Number(state.parade.volunteer_hours_approved) || 0;
        }
      }
    } catch (e) {}

    if (!state.membershipStatus) {
      try { state.membershipStatus = (window.kosProfile || {}).membership_status || null; } catch (e) {}
    }

    if (!state.hoursApproved) {
      try {
        var mid = (window.kosProfile || {}).member_id || null;
        if (mid) {
          var vh = await client.from("volunteer_hours").select("hours,status").eq("member_id", mid);
          var approved = (vh.data || []).filter(function (r) {
            return String(r.status || "").toLowerCase() === "approved";
          });
          state.hoursApproved = approved.reduce(function (n, r) { return n + (Number(r.hours) || 0); }, 0);
        }
      } catch (e) {}
    }

    var saved = TAB_HOME;
    try { saved = sessionStorage.getItem("kosHubTab") || TAB_HOME; } catch (e) {}
    if (saved === "officer" && !state.officer) saved = TAB_HOME;
    showTab(saved);
    renderHome();
  }

  function bindTabs() {
    document.querySelectorAll("[data-hub-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () { showTab(btn.getAttribute("data-hub-tab")); });
    });
  }

  function boot() {
    if (!document.getElementById("memberContent")) return;
    if (document.getElementById("hubRoot")) { loadHubData(); return; }
    injectCss();
    tagSections();
    moveIntoPanels();
    bindTabs();
    var tries = 0;
    var t = setInterval(function () {
      tries += 1;
      var content = document.getElementById("memberContent");
      var visible = content && content.style.display !== "none";
      if (visible || tries > 50) { clearInterval(t); loadHubData(); }
    }, 200);
  }

  var _unlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof _unlock === "function") _unlock();
    setTimeout(boot, 50);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
