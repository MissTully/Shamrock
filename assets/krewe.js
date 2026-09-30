/* Krewe of Shamrock: floating music player, nav, and members-desk loader. */
(function () {
  var BODY_PATH = "M22 17.5C17 17.5 13.5 19.5 12.8 24C12.3 27 12.8 29 13.6 31" +
    "C15.2 33 16.6 33.6 16.6 35C16.6 36.4 15 37 13.4 39C11.6 41.4 10.6 45 10.8 48.5" +
    "C11 53 14 58.5 22 59.2C30 58.5 33 53 33.2 48.5C33.4 45 32.4 41.4 30.6 39" +
    "C29 37 27.4 36.4 27.4 35C27.4 33.6 28.8 33 30.6 31.2C31.4 29 31.7 27 31.2 24" +
    "C30.5 19.5 27 17.5 22 17.5Z";
  var VIOLIN_SVG =
    '<svg class="violin-icon" viewBox="0 0 44 62" width="36" height="51" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="kvWood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d98b3e"/><stop offset="0.45" stop-color="#a85a22"/><stop offset="1" stop-color="#5e2c0e"/></linearGradient>' +
        '<radialGradient id="kvSheen" cx="0.38" cy="0.3" r="0.72"><stop offset="0" stop-color="#ffe6b0" stop-opacity="0.6"/><stop offset="0.55" stop-color="#ffd98f" stop-opacity="0.1"/><stop offset="1" stop-color="#ffd98f" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="kvEbony" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a2c20"/><stop offset="0.5" stop-color="#0b0805"/><stop offset="1" stop-color="#2a1d12"/></linearGradient>' +
        '<linearGradient id="kvBow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#caa35a"/><stop offset="1" stop-color="#6e3f17"/></linearGradient>' +
      '</defs>' +
      '<g class="violin-bow"><line x1="4" y1="16" x2="40" y2="52" stroke="url(#kvBow)" stroke-width="2" stroke-linecap="round"/><line x1="5.4" y1="14.2" x2="41.4" y2="50.2" stroke="#f1e6c4" stroke-width="0.8" stroke-linecap="round"/><circle cx="4" cy="16" r="1.8" fill="#2a1a0e"/></g>' +
      '<path d="M19.8 7L24.2 7L25 18L19 18Z" fill="url(#kvWood)"/>' +
      '<path d="' + BODY_PATH + '" fill="url(#kvWood)" stroke="#3a1c08" stroke-width="1"/>' +
      '<path d="' + BODY_PATH + '" fill="url(#kvSheen)"/>' +
      '<path d="M20.6 6L23.4 6L25.2 40L18.8 40Z" fill="url(#kvEbony)"/>' +
      '<path d="M20.2 7L23.8 7L23.4 2.6C23.4 1.4 20.6 1.4 20.6 2.6Z" fill="url(#kvWood)" stroke="#3a1c08" stroke-width="0.6"/>' +
      '<circle cx="21.6" cy="2.4" r="2.4" fill="url(#kvWood)" stroke="#3a1c08" stroke-width="0.6"/>' +
      '<path d="M22.9 2.2C22.9 1.1 20.5 1.1 20.6 2.7C20.7 3.8 22.5 3.6 22 2.2" fill="none" stroke="#3a1c08" stroke-width="0.7"/>' +
      '<line x1="20.6" y1="4.2" x2="18" y2="3.4" stroke="#23150b" stroke-width="1.5" stroke-linecap="round"/>' +
      '<line x1="23.4" y1="5.2" x2="26" y2="4.4" stroke="#23150b" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M16.8 38C15.4 40 15.6 43 16.6 44.4C17.6 45.8 17.2 48.6 15.8 50" fill="none" stroke="#190d05" stroke-width="1.5" stroke-linecap="round"/>' +
      '<path d="M27.2 38C28.6 40 28.4 43 27.4 44.4C26.4 45.8 26.8 48.6 28.2 50" fill="none" stroke="#190d05" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="17" cy="37.8" r="1.1" fill="#190d05"/><circle cx="15.6" cy="50.2" r="1.1" fill="#190d05"/><circle cx="27" cy="37.8" r="1.1" fill="#190d05"/><circle cx="28.4" cy="50.2" r="1.1" fill="#190d05"/>' +
      '<path d="M19.6 47L24.4 47L23.4 43.6L20.6 43.6Z" fill="#e0c486" stroke="#9c7b3e" stroke-width="0.4"/>' +
      '<path d="M20.4 57.5C20.4 55.6 23.6 55.6 23.6 57.5L23 48C23 46.6 21 46.6 21 48Z" fill="url(#kvEbony)"/>' +
      '<g stroke="#efe2bf" stroke-width="0.5" opacity="0.85"><line x1="20.6" y1="48" x2="20.7" y2="4.4"/><line x1="21.5" y1="48" x2="21.5" y2="4"/><line x1="22.5" y1="48" x2="22.5" y2="4"/><line x1="23.4" y1="48" x2="23.3" y2="4.4"/></g>' +
    '</svg>';
  function init() {
    var audio = document.getElementById("kreweAudio");
    var wrap  = document.getElementById("krewePlayer");
    var btn   = document.getElementById("kreweMusicBtn");
    var label = document.getElementById("kreweMusicLabel");
    if (!audio || !btn) return;
    audio.volume = 0.18; audio.loop = true; audio.autoplay = false; audio.muted = false;
    btn.innerHTML = VIOLIN_SVG;
    btn.setAttribute("aria-label", "Play background music");
    function setPlaying(on) {
      wrap.classList.toggle("playing", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Pause background music" : "Play background music");
      btn.setAttribute("title", on ? "Pause the music" : "Play our Irish tune");
      if (label) label.textContent = on ? "\u266a" : "Tap for a tune \u2618";
    }
    btn.addEventListener("click", function () {
      if (audio.paused) {
        audio.muted = false;
        if (audio.preload === "none") { audio.preload = "auto"; audio.load(); }
        var pr = audio.play();
        if (pr && pr.then) pr.then(function () { setPlaying(true); }).catch(function () { setPlaying(false); });
        else setPlaying(true);
      } else { audio.pause(); setPlaying(false); }
    });
    audio.addEventListener("ended", function () { setPlaying(false); });
    audio.pause(); setPlaying(false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function reveal() {
    var sel = ".pillar, .feature, .tile, .article, .poem, .event-card, .illuminated, .framed, .photo-band, .form-card, figure, .section-title, .knot-divider, .banner-flourish";
    var nodes = Array.prototype.slice.call(document.querySelectorAll(sel));
    if (!nodes.length) return;
    if (reduce || !("IntersectionObserver" in window)) { nodes.forEach(function (n) { n.classList.add("reveal", "in"); }); return; }
    nodes.forEach(function (n) { n.classList.add("reveal"); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var sibs = e.target.parentNode ? e.target.parentNode.children : [];
          var idx = Array.prototype.indexOf.call(sibs, e.target);
          e.target.style.transitionDelay = Math.min(idx * 70, 350) + "ms";
          e.target.classList.add("in"); io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    nodes.forEach(function (n) { io.observe(n); });
  }
  function shamrocks() {
    if (reduce) return;
    var field = document.createElement("div");
    field.className = "shamrock-field"; field.setAttribute("aria-hidden", "true");
    var glyphs = ["\u2618", "\ud83c\udf40"];
    var count = window.innerWidth < 680 ? 9 : 16;
    for (var i = 0; i < count; i++) {
      var s = document.createElement("span");
      s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      s.style.left = Math.random() * 100 + "vw";
      s.style.fontSize = (14 + Math.random() * 22) + "px";
      var dur = 16 + Math.random() * 20;
      s.style.animationDuration = dur + "s";
      s.style.animationDelay = (-Math.random() * dur) + "s";
      s.style.opacity = (0.08 + Math.random() * 0.14).toFixed(2);
      field.appendChild(s);
    }
    document.body.appendChild(field);
  }
  function start() { reveal(); shamrocks(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

(function () {
  function init() {
    var nav = document.querySelector('.krewe-nav');
    if (!nav) return;
    var toggle = nav.querySelector('.nav-toggle');
    var menu = nav.querySelector('.krewe-menu');
    if (!toggle || !menu) return;
    var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (path === '') path = 'index.html';
    var marked = nav.querySelectorAll('[data-nav]');
    for (var i = 0; i < marked.length; i++) {
      if ((marked[i].getAttribute('data-nav') || '').toLowerCase() === path) {
        marked[i].classList.add('active');
        marked[i].setAttribute('aria-current', 'page');
        var grp = marked[i].closest ? marked[i].closest('.nav-group') : null;
        if (grp) grp.classList.add('is-active');
      }
    }
    var backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    nav.appendChild(backdrop);
    var mq = window.matchMedia('(max-width:980px)');
    function closeGroups() {
      var open = nav.querySelectorAll('.nav-group.open');
      for (var i = 0; i < open.length; i++) {
        open[i].classList.remove('open');
        var b = open[i].querySelector('.nav-group-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    }
    function openMenu() { nav.classList.add('open'); toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', 'Close menu'); document.body.classList.add('nav-open'); }
    function closeMenu() { nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); document.body.classList.remove('nav-open'); closeGroups(); }
    toggle.addEventListener('click', function () { nav.classList.contains('open') ? closeMenu() : openMenu(); });
    backdrop.addEventListener('click', closeMenu);
    var groups = nav.querySelectorAll('.nav-group');
    for (var g = 0; g < groups.length; g++) {
      (function (group) {
        var btn = group.querySelector('.nav-group-btn');
        if (!btn) return;
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var wasOpen = group.classList.contains('open');
          closeGroups();
          if (!wasOpen) { group.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
        });
      })(groups[g]);
    }
    document.addEventListener('click', function (e) { if (!nav.contains(e.target)) closeGroups(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) { closeGroups(); if (nav.classList.contains('open')) closeMenu(); }
    });
    var navLinks = menu.querySelectorAll('a[href]');
    for (var k = 0; k < navLinks.length; k++) navLinks[k].addEventListener('click', function () { if (mq.matches) closeMenu(); });
    var hubLink = nav.querySelector('.nav-hub');
    if (hubLink) hubLink.addEventListener('click', function () { if (mq.matches) closeMenu(); });
    function onMq() { if (!mq.matches) closeMenu(); }
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();


(function () {
  var PUBLIC_GROUP_URL = "https://www.facebook.com/groups/kreweofshamrock";
  var SECRETARY = "secretary@kreweofshamrock.com";
  function fixFooters() {
    var foots = document.querySelectorAll("footer.krewe-foot, footer.site-footer");
    for (var i = 0; i < foots.length; i++) {
      var foot = foots[i];
      // Contact row: replace Report/Contact Gmail/digital lines with secretary only
      var links = foot.querySelectorAll(".flinks");
      var contactRow = null;
      for (var j = 0; j < links.length; j++) {
        var t = (links[j].textContent || "").toLowerCase();
        var html = (links[j].innerHTML || "").toLowerCase();
        if (t.indexOf("report") !== -1 || t.indexOf("contact") !== -1 || html.indexOf("mailto:") !== -1) {
          // skip nav flinks (Home/Events…) — those have many nav anchors and no mailto usually
          if (html.indexOf("mailto:") !== -1 || t.indexOf("report") !== -1 || t.indexOf("contact:") !== -1) {
            contactRow = links[j];
            break;
          }
        }
      }
      if (contactRow) {
        contactRow.setAttribute("data-kos-contact", "1");
        contactRow.innerHTML = '<a href="mailto:' + SECRETARY + '">Contact: ' + SECRETARY + "</a>";
      } else if (!foot.querySelector("[data-kos-contact]")) {
        var row = document.createElement("div");
        row.className = "flinks";
        row.setAttribute("data-kos-contact", "1");
        row.style.marginBottom = "8px";
        row.innerHTML = '<a href="mailto:' + SECRETARY + '">Contact: ' + SECRETARY + "</a>";
        var slainte = foot.querySelector(".slainte");
        if (slainte) foot.insertBefore(row, slainte);
        else foot.appendChild(row);
      }
      // Public Facebook Group only
      if (!foot.querySelector("[data-kos-social]")) {
        var srow = document.createElement("div");
        srow.className = "flinks";
        srow.setAttribute("data-kos-social", "1");
        srow.style.marginBottom = "8px";
        srow.innerHTML = '<a href="' + PUBLIC_GROUP_URL + '" target="_blank" rel="noopener noreferrer">Facebook Group</a>';
        var contact = foot.querySelector("[data-kos-contact]");
        var before = contact || foot.querySelector(".slainte");
        if (before) foot.insertBefore(srow, before);
        else foot.appendChild(srow);
      }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fixFooters);
  else fixFooters();
})();


/* Header Member Hub control: Login while signed out, Log out while a Hub session exists.
   Uses the same Supabase client as the Hub (window.__kosSb / window.kosSignOut). */
(function kosNavHubAuth() {
  var LOGIN_LABEL = "Member Hub Login";
  var LOGOUT_LABEL = "Log out";
  var signedIn = false;
  var signingOut = false;
  var clientBound = false;

  function currentFile() {
    return (location.pathname.split("/").pop() || "index.html").toLowerCase();
  }
  function hubLink() {
    var nav = document.querySelector("nav.krewe-nav");
    return nav ? nav.querySelector("a.nav-hub") : null;
  }
  function readStoredSession() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.indexOf("sb-") !== 0 || key.indexOf("auth-token") === -1) continue;
        if (key.indexOf("code-verifier") !== -1) continue;
        var raw = localStorage.getItem(key);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") continue;
        if (parsed.access_token || parsed.refresh_token) return parsed;
        if (parsed.currentSession && (parsed.currentSession.access_token || parsed.currentSession.refresh_token)) {
          return parsed.currentSession;
        }
      }
    } catch (e) {}
    return null;
  }
  function clearStoredSession() {
    try {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.indexOf("sb-") === 0 && key.indexOf("auth-token") !== -1) localStorage.removeItem(key);
      }
    } catch (e) {}
  }
  /* Signed in, off the Hub: a Member Hub button sits directly under Log out.
     Not added on members.html, where the member is already in the Hub. */
  function returnLink(create) {
    var hub = hubLink();
    if (!hub || currentFile() === "members.html") return null;
    var existing = hub.parentNode.querySelector("a.nav-hub-return");
    if (existing || !create) return existing;
    var stack = document.createElement("div");
    stack.className = "nav-hub-stack";
    hub.parentNode.insertBefore(stack, hub);
    stack.appendChild(hub);
    var back = document.createElement("a");
    back.className = "nav-hub-return";
    back.href = "members.html";
    back.textContent = "Member Hub";
    back.setAttribute("aria-label", "Return to the Member Hub");
    back.setAttribute("title", "Return to the Member Hub");
    back.hidden = true;
    stack.appendChild(back);
    return back;
  }
  function paint(on) {
    signedIn = !!on;
    var hub = hubLink();
    if (!hub) return;
    var back = returnLink(signedIn);
    if (back) back.hidden = !signedIn;
    if (signedIn) {
      hub.classList.add("is-logout");
      hub.textContent = LOGOUT_LABEL;
      hub.setAttribute("aria-label", "Log out");
      hub.setAttribute("title", "Log out of the Member Hub");
      hub.setAttribute("data-kos-auth", "out");
    } else {
      hub.classList.remove("is-logout");
      hub.textContent = LOGIN_LABEL;
      hub.setAttribute("aria-label", "Member Hub Login");
      hub.setAttribute("title", "Member Hub Login");
      hub.setAttribute("href", "members.html");
      hub.setAttribute("data-kos-auth", "in");
    }
  }
  function bindClient(client) {
    if (!client || !client.auth || clientBound) return;
    clientBound = true;
    client.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (session) paint(true);
      else if (!readStoredSession()) paint(false);
    }).catch(function () {});
    client.auth.onAuthStateChange(function (event, session) {
      if (session) paint(true);
      else if (event === "SIGNED_OUT") paint(false);
      else if (event === "INITIAL_SESSION" && !readStoredSession()) paint(false);
    });
  }
  function watchClient() {
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (window.__kosSb && window.__kosSb.auth) {
        bindClient(window.__kosSb);
        clearInterval(timer);
        return;
      }
      if (signedIn && !signingOut && !readStoredSession()) paint(false);
      if (tries >= 240) clearInterval(timer);
    }, 50);
  }
  function waitFor(pred, ms) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function tick() {
        if (pred()) return resolve(true);
        if (Date.now() - start >= ms) return resolve(false);
        setTimeout(tick, 40);
      })();
    });
  }
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("timeout")); }, ms);
      })
    ]);
  }
  function loadConfig() {
    if (window.KOS_SB_URL && window.KOS_SB_KEY) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "assets/kos-supabase.js";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("config")); };
      document.head.appendChild(s);
    });
  }
  function createSharedClient() {
    return loadConfig().then(function () {
      return import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    }).then(function (mod) {
      if (window.__kosSb && window.__kosSb.auth) return window.__kosSb;
      return mod.createClient(window.KOS_SB_URL, window.KOS_SB_KEY);
    });
  }
  function leaveAfterLogout() {
    clearStoredSession();
    if (currentFile() === "members.html") location.href = "index.html";
    else location.reload();
  }
  function runClientSignOut(client) {
    var done = Promise.resolve();
    if (client && client.auth && client.auth.signOut) {
      done = Promise.resolve(client.auth.signOut()).catch(function () {});
    }
    return done.then(leaveAfterLogout, leaveAfterLogout);
  }
  function logOut(e) {
    if (!signedIn) return;
    e.preventDefault();
    if (signingOut) return;
    signingOut = true;
    var hub = hubLink();
    if (hub) hub.setAttribute("aria-busy", "true");
    if (currentFile() === "members.html") {
      waitFor(function () { return typeof window.kosSignOut === "function"; }, 8000).then(function (ready) {
        if (ready) {
          withTimeout(Promise.resolve(window.kosSignOut()), 8000).then(function () {}, leaveAfterLogout);
          return;
        }
        var client = window.__kosSb;
        if (client && client.auth) runClientSignOut(client);
        else withTimeout(createSharedClient(), 5000).then(runClientSignOut, leaveAfterLogout);
      });
      return;
    }
    var client = window.__kosSb;
    if (client && client.auth) runClientSignOut(client);
    else withTimeout(createSharedClient(), 5000).then(runClientSignOut, leaveAfterLogout);
  }
  function init() {
    if (!hubLink()) return;
    paint(!!readStoredSession());
    hubLink().addEventListener("click", logOut);
    watchClient();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
