/* Members desk: one tool at a time. Safe if the HTML was not pre-patched. */
(function () {
  "use strict";

  var HOME = "home";
  var CSS = [
    ".desk-nav{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 14px;background:linear-gradient(180deg,#fbf7ec 70%,rgba(251,247,236,0));}",
    ".desk-nav button{border:1px solid rgba(168,128,28,.4);background:#fff;color:var(--green-800);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:14px;cursor:pointer;}",
    ".desk-nav button.on{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".desk-home h2{font-family:var(--display);color:var(--green-800);margin:0 0 6px;}",
    ".desk-lead{margin:0 0 16px;color:#3a3a2e;}",
    ".desk-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;}",
    ".desk-tile{text-align:left;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:16px;padding:16px;cursor:pointer;box-shadow:var(--shadow-sm);min-height:128px;}",
    ".desk-tile:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.12);}",
    ".desk-tile .ic{font-size:26px;display:block;margin-bottom:6px;}",
    ".desk-tile b{display:block;font-family:var(--display);color:var(--green-800);font-size:18px;}",
    ".desk-tile small{display:block;margin-top:6px;color:var(--muted);line-height:1.35;}",
    ".desk-notes{background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:16px;padding:16px 18px;margin:0 0 18px;}",
    ".desk-notes h3{margin:0 0 8px;font-family:var(--display);color:var(--green-800);font-size:18px;}",
    ".desk-back{margin:0 0 12px;background:none;border:0;color:var(--green-700);font-family:var(--display);cursor:pointer;padding:0;}",
    ".desk-back:hover{text-decoration:underline;}",
    "[data-desk]{display:none !important;}",
    "[data-desk].desk-on{display:block !important;}"
  ].join("");

  function injectCss() {
    if (document.getElementById("kosDeskCss")) return;
    var s = document.createElement("style");
    s.id = "kosDeskCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function headingOf(sec) {
    var h = sec.querySelector("h2");
    return h ? (h.textContent || "").toLowerCase() : "";
  }

  function tagSections() {
    var sections = document.querySelectorAll("#memberContent .member-grid > section");
    sections.forEach(function (sec) {
      if (sec.getAttribute("data-desk")) return;
      if (sec.id === "prCard") sec.setAttribute("data-desk", "ready");
      else if (sec.id === "dashCard") sec.setAttribute("data-desk", "reports");
      else {
        var h = headingOf(sec);
        if (h.indexOf("parade") !== -1) sec.setAttribute("data-desk", "ready");
        else if (h.indexOf("craic") !== -1) sec.setAttribute("data-desk", "game");
        else if (h.indexOf("raffle") !== -1) sec.setAttribute("data-desk", "raffles");
        else if (h.indexOf("report") !== -1) sec.setAttribute("data-desk", "reports");
        else if (h.indexOf("share") !== -1) sec.setAttribute("data-desk", "share");
        else if (h.indexOf("locker") !== -1) sec.setAttribute("data-desk", "lockers");
        else if (h.indexOf("carpool") !== -1) sec.setAttribute("data-desk", "rides");
        else if (h.indexOf("van") !== -1) sec.setAttribute("data-desk", "vans");
        else if (h.indexOf("directory") !== -1) sec.setAttribute("data-desk", "directory");
      }
    });
    document.querySelectorAll("[data-desk='ready'],[data-desk='lockers'],[data-desk='rides'],[data-desk='vans'],[data-desk='directory']").forEach(function (sec) {
      var body = sec.querySelector(".app-body");
      if (body && !body.querySelector(".desk-back")) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "desk-back";
        b.textContent = "\u2190 Back to desk";
        b.addEventListener("click", function () { show(HOME); });
        body.insertBefore(b, body.firstChild);
      }
    });
  }

  function tile(kind, ic, title, hint) {
    return '<button type="button" class="desk-tile" data-desk-tile="' + kind + '"><span class="ic">' + ic + "</span><b>" + title + "</b><small>" + hint + "</small></button>";
  }

  function ensureHome() {
    if (document.getElementById("deskHome")) return;
    var main = document.getElementById("memberContent");
    if (!main) return;
    var box = document.createElement("div");
    box.id = "kosDeskMount";
    box.innerHTML =
      '<div id="deskHome" class="desk-home">' +
        '<div class="desk-notes">' +
          "<h3>From the last meeting</h3>" +
          "<p style=\"margin:0 0 8px;\">26 August 2026 \u00b7 Debbie Fitzpatrick, Secretary. Welcome Denise and Gerry Logan. Social and Charity is one committee this season. Pins and badges are on order. Clean out lockers.</p>" +
          "<p style=\"margin:0;font-size:14px;color:var(--muted);\">19 Sep Mini golf \u00b7 17 Oct Tartan Ball baskets \u00b7 24 Oct Tartan Ball \u00b7 King &amp; Queen breakfast TBA</p>" +
        "</div>" +
        '<h2 id="deskTitle">Your desk</h2>' +
        '<p class="desk-lead">Open one thing, finish it, come back.</p>' +
        '<div class="desk-tiles">' +
          tile("ready", "\ud83c\udf97\ufe0f", "Parade Ready", "Dues, waiver, meeting, volunteer hours") +
          tile("game", "\ud83c\udf40", "The Craic Cup", "Clovers, ranks, standings") +
          tile("raffles", "\ud83c\udfab", "Raffles", "Baskets and the 50/50") +
          tile("reports", "\ud83d\udcca", "Reports", "Headcounts, dues, logistics") +
          tile("share", "\ud83d\udcf7", "Share", "Photos, videos, poems, recipes") +
          tile("lockers", "\ud83d\udd11", "Lockers", "Request and track a locker") +
          tile("rides", "\ud83d\ude97", "Carpools", "Offer a ride or ask for one") +
          tile("vans", "\ud83d\ude90", "Van pools", "Reserve a seat on a krewe van") +
          tile("directory", "\ud83d\udc65", "Directory", "Find fellow members") +
        "</div>" +
      "</div>" +
      '<nav class="desk-nav" aria-label="Members desk">' +
        '<button type="button" class="on" data-desk-nav="home">Desk</button>' +
        '<button type="button" data-desk-nav="ready">Parade Ready</button>' +
        '<button type="button" data-desk-nav="lockers">Lockers</button>' +
        '<button type="button" data-desk-nav="rides">Rides</button>' +
        '<button type="button" data-desk-nav="vans">Vans</button>' +
        '<button type="button" data-desk-nav="directory">Directory</button>' +
      "</nav>";
    var bar = document.getElementById("memberBar");
    var grid = main.querySelector(".member-grid");
    if (bar) bar.insertAdjacentElement("afterend", box);
    else if (grid) main.insertBefore(box, grid);
    else main.appendChild(box);
  }

  function panels() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-desk]"));
  }

  function show(name) {
    var desk = name || HOME;
    var home = document.getElementById("deskHome");
    if (home) home.style.display = desk === HOME ? "block" : "none";
    panels().forEach(function (el) {
      el.classList.toggle("desk-on", el.getAttribute("data-desk") === desk);
    });
    document.querySelectorAll("[data-desk-nav]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-desk-nav") === desk);
    });
    try { sessionStorage.setItem("kosDesk", desk); } catch (e) {}
    var heading = document.getElementById("deskTitle");
    var labels = { home: "Your desk", ready: "Parade Ready", lockers: "Lockers", rides: "Carpools", vans: "Van pools", directory: "Directory" };
    if (heading) heading.textContent = labels[desk] || "Your desk";
  }

  window.kosShowDesk = show;
  window.kosOpenTile = function (kind) {
    if (kind === "game" && window.openGame) { window.openGame(); return; }
    if (kind === "raffles" && window.openRaffles) { window.openRaffles(); return; }
    if (kind === "reports" && window.openReports) { window.openReports(); return; }
    if (kind === "share") { location.href = "share.html"; return; }
    show(kind);
  };

  function bind() {
    document.querySelectorAll("[data-desk-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () { show(btn.getAttribute("data-desk-nav")); });
    });
    document.querySelectorAll("[data-desk-tile]").forEach(function (btn) {
      btn.addEventListener("click", function () { window.kosOpenTile(btn.getAttribute("data-desk-tile")); });
    });
  }

  function boot() {
    if (!document.getElementById("memberContent")) return;
    injectCss();
    tagSections();
    ensureHome();
    bind();
    var saved = HOME;
    try { saved = sessionStorage.getItem("kosDesk") || HOME; } catch (e) { saved = HOME; }
    show(saved);
  }

  function waitForMembers() {
    if (document.getElementById("memberContent")) { boot(); return; }
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      if (document.getElementById("memberContent") || n > 40) { clearInterval(t); boot(); }
    }, 200);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", waitForMembers);
  else waitForMembers();
})();
