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
    ".hub-badge{display:inline-block;margin-left:6px;min-width:20px;padding:1px 6px;border-radius:999px;background:#b3261e;color:#fff;font-size:12px;text-align:center;}",
    ".hub-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);flex:none;}",
    ".hub-avatar-blank{display:flex;align-items:center;justify-content:center;background:var(--green-800);color:#f6efdc;font-family:var(--display);font-size:24px;}",
    ".hub-prof-head{display:flex;gap:14px;align-items:center;margin:6px 0 10px;}",
    ".hub-prof-line{margin:6px 0;font-size:14px;}",
    ".hub-prof-form label{display:block;font-size:13px;color:var(--muted);margin:10px 0 3px;}",
    ".hub-prof-form input,.hub-prof-form textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;font:inherit;background:#fff;}",
    ".hub-prof-form textarea{min-height:70px;resize:vertical;}",
    ".hub-prof-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}",
    "@media (max-width:520px){.hub-prof-grid{grid-template-columns:1fr;}}",
    ".hub-appr{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;border:1px solid rgba(168,128,28,.3);border-radius:12px;padding:10px 12px;margin:8px 0;background:#fffdf4;flex-wrap:wrap;}",
    ".hub-appr .muted{color:var(--muted);font-size:13px;}",
    ".hub-appr-btns{display:flex;gap:8px;flex-wrap:wrap;}",
    ".hub-appr-h{font-family:var(--display);color:var(--green-800);margin:14px 0 6px;font-size:17px;}",
    "#memberContent > .member-grid{display:none !important;}",
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

    renderProfileCard();

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
    if (state.officer) loadApprovals(client);

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

  // ---- My profile: photo, birthday, anniversary, and friendly questions ----
  // View mode shows what the directory sees; Edit mode saves through the
  // update_my_member_profile function, which can never change role or status.
  var profileEditing = false;
  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function fmtMonthDay(d) {
    var parts = String(d || "").split("-");
    if (parts.length < 3) return String(d || "");
    var m = MONTH_NAMES[Number(parts[1]) - 1];
    return m ? m + " " + Number(parts[2]) : String(d);
  }

  function profileAvatarHtml(p) {
    if (p.photo_url) return '<img class="hub-avatar" src="' + esc(p.photo_url) + '" alt="Profile photo" id="hubProfAvatar" />';
    var initials = (((p.first_name || " ")[0] || "") + ((p.last_name || " ")[0] || "")).toUpperCase();
    return '<div class="hub-avatar hub-avatar-blank" id="hubProfAvatar">' + esc(initials || "☘") + "</div>";
  }

  function renderProfileCard() {
    var pc = document.getElementById("hubProfileCard");
    if (!pc) return;
    var p = window.kosProfile || {};
    if (profileEditing) { renderProfileEdit(pc, p); return; }
    var nm = (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Member").toString();
    var facts = [];
    if (p.officer_title) facts.push("🎖 " + esc(p.officer_title));
    else if (p.member_role) facts.push("Role: " + esc(p.member_role));
    if (p.membership_status || state.membershipStatus) facts.push("Status: " + esc(p.membership_status || state.membershipStatus));
    if (p.hometown) facts.push("🏠 " + esc(p.hometown));
    if (p.parade_since) facts.push("🥁 Marching since " + esc(p.parade_since));
    if (p.birthday) facts.push("🎂 " + esc(fmtMonthDay(p.birthday)));
    if (p.anniversary) facts.push("💍 " + esc(fmtMonthDay(p.anniversary)));
    var longs = "";
    if (p.bio) longs += '<p class="hub-prof-line"><b>About me:</b> ' + esc(p.bio) + "</p>";
    if (p.hobbies) longs += '<p class="hub-prof-line"><b>Hobbies:</b> ' + esc(p.hobbies) + "</p>";
    if (p.interests) longs += '<p class="hub-prof-line"><b>Interests:</b> ' + esc(p.interests) + "</p>";
    if (p.favorite_memory) longs += '<p class="hub-prof-line"><b>Favorite krewe memory:</b> ' + esc(p.favorite_memory) + "</p>";
    if (p.fun_fact) longs += '<p class="hub-prof-line"><b>Fun fact:</b> ' + esc(p.fun_fact) + "</p>";
    pc.innerHTML =
      "<h3>Your profile</h3>" +
      '<div class="hub-prof-head">' + profileAvatarHtml(p) +
      "<div><b>" + esc(nm) + "</b>" +
      (p.email ? '<div style="color:var(--muted);font-size:14px;">' + esc(p.email) + "</div>" : "") +
      (facts.length ? '<div style="color:var(--muted);font-size:14px;">' + facts.join(" · ") + "</div>" : "") +
      "</div></div>" + longs +
      '<button class="btn btn-primary" id="hubProfEditBtn" type="button" style="margin-top:10px;">✏️ Edit my profile</button>' +
      (p.profile_visible === false ? '<p style="color:var(--muted);font-size:13px;">Your profile is hidden from the member directory.</p>' : "") +
      '<p style="color:var(--muted);font-size:12px;margin:8px 0 0;">Fellow members see your birthday and anniversary as month and day only — never the year.</p>';
    var btn = document.getElementById("hubProfEditBtn");
    if (btn) btn.addEventListener("click", function () { profileEditing = true; renderProfileCard(); });
  }

  function renderProfileEdit(pc, p) {
    function attr(v) { return esc(v == null ? "" : String(v)); }
    pc.innerHTML =
      "<h3>Edit my profile</h3>" +
      '<div class="hub-prof-form">' +
      '<div class="hub-prof-head">' + profileAvatarHtml(p) +
      '<div><label for="hubPfPhoto">Profile picture (JPG or PNG)</label>' +
      '<input type="file" id="hubPfPhoto" accept="image/*" /></div></div>' +
      '<div class="hub-prof-grid">' +
      '<div><label for="hubPfFirst">First name</label><input id="hubPfFirst" value="' + attr(p.first_name) + '" required /></div>' +
      '<div><label for="hubPfLast">Last name</label><input id="hubPfLast" value="' + attr(p.last_name) + '" required /></div>' +
      '<div><label for="hubPfPhone">Phone</label><input id="hubPfPhone" type="tel" value="' + attr(p.phone) + '" /></div>' +
      '<div><label for="hubPfHometown">Hometown</label><input id="hubPfHometown" value="' + attr(p.hometown) + '" /></div>' +
      '<div><label for="hubPfBirthday">Birthday (members see month + day only)</label><input id="hubPfBirthday" type="date" value="' + attr(p.birthday) + '" /></div>' +
      '<div><label for="hubPfAnniversary">Anniversary (month + day shown)</label><input id="hubPfAnniversary" type="date" value="' + attr(p.anniversary) + '" /></div>' +
      '<div><label for="hubPfSince">Marching with the krewe since (year)</label><input id="hubPfSince" type="number" min="1998" max="2100" value="' + attr(p.parade_since) + '" /></div>' +
      "</div>" +
      '<label for="hubPfBio">About me</label><textarea id="hubPfBio">' + esc(p.bio || "") + "</textarea>" +
      '<label for="hubPfHobbies">Hobbies (what do you love doing?)</label><input id="hubPfHobbies" value="' + attr(p.hobbies) + '" placeholder="e.g. Gardening, bagpipes, beach days" />' +
      '<label for="hubPfInterests">Interests (what would you chat about all night?)</label><input id="hubPfInterests" value="' + attr(p.interests) + '" placeholder="e.g. Irish history, cooking, live music" />' +
      '<label for="hubPfMemory">Favorite krewe or parade memory</label><textarea id="hubPfMemory">' + esc(p.favorite_memory || "") + "</textarea>" +
      '<label for="hubPfFact">A fun fact about you</label><input id="hubPfFact" value="' + attr(p.fun_fact) + '" placeholder="e.g. I once caught 47 strands of beads in one parade" />' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:12px;cursor:pointer;">' +
      '<input type="checkbox" id="hubPfVisible" style="width:auto;"' + (p.profile_visible === false ? "" : " checked") + " /> Show my profile in the member directory</label>" +
      '<div style="display:flex;gap:10px;margin-top:14px;">' +
      '<button class="btn btn-primary" id="hubPfSave" type="button">☘ Save profile</button>' +
      '<button class="btn" id="hubPfCancel" type="button">Cancel</button></div>' +
      '<div class="err" id="hubPfMsg" style="margin-top:8px;"></div>' +
      "</div>";
    document.getElementById("hubPfCancel").addEventListener("click", function () {
      profileEditing = false; renderProfileCard();
    });
    document.getElementById("hubPfPhoto").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var av = document.getElementById("hubProfAvatar");
      if (av) {
        var img = document.createElement("img");
        img.className = "hub-avatar";
        img.id = "hubProfAvatar";
        img.alt = "Profile photo preview";
        img.src = URL.createObjectURL(f);
        av.replaceWith(img);
      }
    });
    document.getElementById("hubPfSave").addEventListener("click", function () { saveMyProfile(); });
  }

  function uploadAvatar(client, file) {
    return new Promise(function (resolve, reject) {
      var objUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 512;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(objUrl);
          if (!blob) { reject(new Error("Could not read that image.")); return; }
          (async function () {
            var uid = (window.kosProfile || {}).user_id;
            if (!uid) {
              var u = await client.auth.getUser();
              uid = u.data && u.data.user && u.data.user.id;
            }
            if (!uid) throw new Error("Please sign in again.");
            var path = uid + "/avatar.jpg";
            var up = await client.storage.from("avatars").upload(path, blob, {
              upsert: true, contentType: "image/jpeg", cacheControl: "3600"
            });
            if (up.error) throw up.error;
            var pub = client.storage.from("avatars").getPublicUrl(path);
            return pub.data.publicUrl + "?v=" + Date.now();
          })().then(resolve, reject);
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(objUrl); reject(new Error("That file does not look like an image.")); };
      img.src = objUrl;
    });
  }

  async function saveMyProfile() {
    var client = window.__kosSb;
    var msg = document.getElementById("hubPfMsg");
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
    if (!client) { if (msg) msg.textContent = "Still connecting — try again in a moment."; return; }
    if (msg) { msg.style.color = ""; msg.textContent = "Saving…"; }
    try {
      var photoUrl = null;
      var fileInput = document.getElementById("hubPfPhoto");
      var f = fileInput && fileInput.files && fileInput.files[0];
      if (f) {
        if (msg) msg.textContent = "Uploading photo…";
        photoUrl = await uploadAvatar(client, f);
        if (msg) msg.textContent = "Saving…";
      }
      var since = parseInt(val("hubPfSince"), 10);
      var res = await client.rpc("update_my_member_profile", {
        p_first: val("hubPfFirst"),
        p_last: val("hubPfLast"),
        p_phone: val("hubPfPhone") || null,
        p_bio: val("hubPfBio") || null,
        p_hometown: val("hubPfHometown") || null,
        p_parade_since: isNaN(since) ? null : since,
        p_interests: val("hubPfInterests") || null,
        p_photo_url: photoUrl,
        p_birthday: val("hubPfBirthday") || null,
        p_anniversary: val("hubPfAnniversary") || null,
        p_hobbies: val("hubPfHobbies") || null,
        p_favorite_memory: val("hubPfMemory") || null,
        p_fun_fact: val("hubPfFact") || null,
        p_profile_visible: !!(document.getElementById("hubPfVisible") || {}).checked
      });
      if (res.error) throw res.error;
      if (res.data) window.kosProfile = res.data;
      profileEditing = false;
      renderProfileCard();
      renderHome();
    } catch (e) {
      if (msg) msg.textContent = "Couldn't save: " + ((e && e.message) || e);
    }
  }

  // ---- Officer Approvals queue: role requests + duplicate-record merges ----
  // Officers decide on the website; every decision is recorded with who/when.
  function setOfficerBadge(n) {
    var btn = document.querySelector('[data-hub-tab="officer"]');
    if (!btn) return;
    var b = btn.querySelector(".hub-badge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "hub-badge"; btn.appendChild(b); }
    b.textContent = String(n);
  }

  async function decideApproval(client, fn, args, btn) {
    if (btn) btn.disabled = true;
    try {
      var res = await client.rpc(fn, args);
      if (res.error) throw res.error;
    } catch (e) {
      alert("Couldn't complete that: " + ((e && e.message) || e));
    }
    loadApprovals(client);
  }

  async function loadApprovals(client) {
    if (!state.officer) return;
    var panel = document.getElementById("hubOfficer");
    if (!panel) return;
    var card = document.getElementById("hubApprovals");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubApprovals";
      panel.insertBefore(card, panel.firstChild);
    }
    card.innerHTML =
      '<div class="app-head"><span class="ic">✅</span><div><h2>Approvals</h2><small>Role requests and record merges waiting on an officer</small></div></div>' +
      '<div class="app-body" id="hubApprovalsBody"><p class="empty">Loading approvals…</p></div>';
    var body = card.querySelector("#hubApprovalsBody");
    var data = null;
    try {
      var res = await client.rpc("list_officer_approvals");
      data = res.data || null;
    } catch (e) {}
    if (!data) { body.innerHTML = '<p class="empty">Couldn&rsquo;t load the approvals queue. Try again in a moment.</p>'; return; }
    var reqs = data.role_requests || [];
    var dups = data.duplicates || [];
    setOfficerBadge(reqs.length + dups.length);
    if (!reqs.length && !dups.length) {
      body.innerHTML = '<p class="empty">Nothing waiting — all caught up. ☘</p>';
      return;
    }
    var html = "";
    if (reqs.length) {
      html += '<h3 class="hub-appr-h">Role requests</h3>';
      reqs.forEach(function (q) {
        var roles = (q.requested_roles || []).join(", ");
        var extra = [];
        if (q.answers && q.answers.committee) extra.push("Committee: " + esc(q.answers.committee));
        if (q.answers && q.answers.note) extra.push("Note: " + esc(q.answers.note));
        html += '<div class="hub-appr">' +
          '<div><b>' + esc(q.full_name || q.email) + '</b> <span class="muted">' + esc(q.email) + '</span>' +
          '<div class="muted">Requests: <b>' + esc(roles) + '</b>' + (q.linked ? " · matches the roster" : " · <b>no roster match</b>") + '</div>' +
          (extra.length ? '<div class="muted">' + extra.join(" · ") + '</div>' : "") +
          '</div><div class="hub-appr-btns">' +
          '<button class="btn btn-primary" data-appr-approve="' + esc(q.id) + '">Approve</button>' +
          '<button class="btn" data-appr-deny="' + esc(q.id) + '">Deny</button>' +
          '</div></div>';
      });
    }
    if (dups.length) {
      html += '<h3 class="hub-appr-h">Possible duplicate records</h3>';
      dups.forEach(function (d) {
        html += '<div class="hub-appr">' +
          '<div><div class="muted">' + esc(d.reason) + '</div>' +
          '<div><b>A:</b> ' + esc(d.a.name) + ' · ' + esc(d.a.email || "no email") + (d.a.joined ? " · joined " + esc(d.a.joined) : "") + '</div>' +
          '<div><b>B:</b> ' + esc(d.b.name) + ' · ' + esc(d.b.email || "no email") + (d.b.joined ? " · joined " + esc(d.b.joined) : "") + '</div>' +
          '</div><div class="hub-appr-btns">' +
          '<button class="btn btn-primary" data-appr-merge data-keep="' + esc(d.a.id) + '" data-dupe="' + esc(d.b.id) + '">Keep A, fold B in</button>' +
          '<button class="btn btn-primary" data-appr-merge data-keep="' + esc(d.b.id) + '" data-dupe="' + esc(d.a.id) + '">Keep B, fold A in</button>' +
          '<button class="btn" data-appr-dismiss="' + esc(d.id) + '">Not duplicates</button>' +
          '</div></div>';
      });
    }
    body.innerHTML = html;
    body.querySelectorAll("[data-appr-approve]").forEach(function (b) {
      b.addEventListener("click", function () {
        decideApproval(client, "approve_role_request", { p_id: b.getAttribute("data-appr-approve") }, b);
      });
    });
    body.querySelectorAll("[data-appr-deny]").forEach(function (b) {
      b.addEventListener("click", function () {
        var note = prompt("Optional note for the record (why deny?)");
        if (note === null) return;
        decideApproval(client, "deny_role_request", { p_id: b.getAttribute("data-appr-deny"), p_note: note || null }, b);
      });
    });
    body.querySelectorAll("[data-appr-merge]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Merge these two records? Dues and event history move to the kept record, and the other is retired (not deleted).")) return;
        decideApproval(client, "merge_members", { p_keep: b.getAttribute("data-keep"), p_duplicate: b.getAttribute("data-dupe") }, b);
      });
    });
    body.querySelectorAll("[data-appr-dismiss]").forEach(function (b) {
      b.addEventListener("click", function () {
        decideApproval(client, "dismiss_duplicate", { p_id: b.getAttribute("data-appr-dismiss") }, b);
      });
    });
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
