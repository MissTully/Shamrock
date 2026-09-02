/* Members desk: one tool at a time instead of a page of stacked forms. */
(function () {
  "use strict";

  var HOME = "home";

  function panels() {
    return Array.prototype.slice.call(document.querySelectorAll("[data-desk]"));
  }

  function show(name) {
    var desk = name || HOME;
    var home = document.getElementById("deskHome");
    if (home) home.style.display = desk === HOME ? "block" : "none";
    panels().forEach(function (el) {
      var on = el.getAttribute("data-desk") === desk;
      el.classList.toggle("desk-on", on);
      if (on) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
    document.querySelectorAll("[data-desk-nav]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-desk-nav") === desk);
    });
    try { sessionStorage.setItem("kosDesk", desk); } catch (e) {}
    var heading = document.getElementById("deskTitle");
    if (heading) {
      var labels = { home: "Your desk", ready: "Parade Ready", lockers: "Lockers", rides: "Carpools", vans: "Van pools", directory: "Directory", officer: "Officer desk" };
      heading.textContent = labels[desk] || "Your desk";
    }
    try {
      var wrap = document.getElementById("memberContent");
      if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {}
  }

  window.kosShowDesk = show;

  window.kosOpenTile = function (kind) {
    if (kind === "game" && window.openGame) { window.openGame(); return; }
    if (kind === "raffles" && window.openRaffles) { window.openRaffles(); return; }
    if (kind === "reports" && window.openReports) { window.openReports(); return; }
    if (kind === "share") { location.href = "share.html"; return; }
    show(kind);
  };

  function revealOfficer() {
    var off = window.__kosIsOfficer === true;
    document.querySelectorAll("[data-officer-only]").forEach(function (el) {
      el.style.display = off ? "" : "none";
    });
  }

  function boot() {
    document.querySelectorAll("[data-desk-nav]").forEach(function (btn) {
      btn.addEventListener("click", function () { show(btn.getAttribute("data-desk-nav")); });
    });
    document.querySelectorAll("[data-desk-tile]").forEach(function (btn) {
      btn.addEventListener("click", function () { window.kosOpenTile(btn.getAttribute("data-desk-tile")); });
    });
    var saved = HOME;
    try { saved = sessionStorage.getItem("kosDesk") || HOME; } catch (e) { saved = HOME; }
    show(saved);
    revealOfficer();
    var n = 0;
    var t = setInterval(function () {
      n += 1;
      revealOfficer();
      if (window.__kosIsOfficer === true || window.__kosIsOfficer === false || n > 24) clearInterval(t);
    }, 400);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
