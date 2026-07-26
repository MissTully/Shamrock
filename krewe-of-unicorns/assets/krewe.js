/* Krewe of Unicorns: floating music player
   Behavior: the track is PAUSED by default. Nothing plays until the visitor
   clicks the button, which starts the krewe theme. Clicking again pauses it.
   No autoplay; the page is silent on arrival. */
(function () {
  // A small, theme-colored music-note-with-sparkle icon drawn inline so every
  // page shows the same button without editing each HTML file.
  var NOTE_SVG =
    '<svg class="note-icon" viewBox="0 0 44 62" width="34" height="48" ' +
    'aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="kuNote" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#6d28d9"/>' +
          '<stop offset="0.55" stop-color="#8b5cf6"/>' +
          '<stop offset="1" stop-color="#ec4899"/>' +
        '</linearGradient>' +
      '</defs>' +
      // eighth-note stem + flag
      '<path d="M18 12 L18 44 C18 49 8 49 8 43 C8 38 15 37 18 40 L18 16 ' +
             'L33 12 L33 38 C33 43 23 43 23 37 C23 32 30 31 33 34 L33 8 Z" ' +
             'fill="url(#kuNote)" stroke="#3a1d6e" stroke-width="1"/>' +
      // twinkling sparkle
      '<g class="note-spark">' +
        '<path d="M35 6 L37 13 L44 15 L37 17 L35 24 L33 17 L26 15 L33 13 Z" fill="#f5c542" stroke="#c9971a" stroke-width="0.6"/>' +
      '</g>' +
    '</svg>';

  function init() {
    var audio = document.getElementById("kreweAudio");
    var wrap  = document.getElementById("krewePlayer");
    var btn   = document.getElementById("kreweMusicBtn");
    var label = document.getElementById("kreweMusicLabel");
    if (!audio || !btn) return;

    audio.volume = 0.18; // soft background level
    audio.loop = true;
    audio.autoplay = false;
    audio.muted = false;

    // Swap the fallback bars for the note-and-sparkle icon.
    btn.innerHTML = NOTE_SVG;
    btn.setAttribute("aria-label", "Play background music");

    function setPlaying(on) {
      wrap.classList.toggle("playing", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", on ? "Pause background music" : "Play background music");
      btn.setAttribute("title", on ? "Pause the music" : "Play our krewe tune");
      if (label) label.textContent = on ? "♪ ✨" : "Tap for a tune 🦄";
    }

    btn.addEventListener("click", function () {
      if (audio.paused) {
        audio.muted = false;
        if (audio.preload === "none") { audio.preload = "auto"; audio.load(); }
        var pr = audio.play();
        if (pr && pr.then) {
          pr.then(function () { setPlaying(true); }).catch(function () { setPlaying(false); });
        } else {
          setPlaying(true);
        }
      } else {
        audio.pause();
        setPlaying(false);
      }
    });

    audio.addEventListener("ended", function () { setPlaying(false); });

    // Start silent and paused.
    audio.pause();
    setPlaying(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/* ============================================================
   Krewe of Unicorns: scroll reveal + floating sparkles
   Both effects are skipped when the visitor prefers reduced motion.
   ============================================================ */
(function () {
  var reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function reveal() {
    var sel = ".pillar, .feature, .tile, .article, .poem, .event-card," +
              " .illuminated, .framed, .photo-band, .form-card, figure," +
              " .section-title, .knot-divider, .banner-flourish";
    var nodes = Array.prototype.slice.call(document.querySelectorAll(sel));
    if (!nodes.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach(function (n) { n.classList.add("reveal", "in"); });
      return;
    }
    nodes.forEach(function (n) { n.classList.add("reveal"); });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var sibs = e.target.parentNode ? e.target.parentNode.children : [];
          var idx = Array.prototype.indexOf.call(sibs, e.target);
          e.target.style.transitionDelay = Math.min(idx * 70, 350) + "ms";
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    nodes.forEach(function (n) { io.observe(n); });
  }

  // Floating field of sparkles, stars, rainbows and the occasional unicorn.
  function sparkles() {
    if (reduce) return;
    var field = document.createElement("div");
    field.className = "shamrock-field";
    field.setAttribute("aria-hidden", "true");
    var glyphs = ["✨", "⭐", "🌈", "🦄", "✧", "💫"];
    var colors = ["#8b5cf6", "#ec4899", "#22d3ee", "#f5c542", "#5eead4"];
    var count = window.innerWidth < 680 ? 10 : 18;
    for (var i = 0; i < count; i++) {
      var s = document.createElement("span");
      s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
      s.style.left = Math.random() * 100 + "vw";
      s.style.color = colors[Math.floor(Math.random() * colors.length)];
      s.style.fontSize = (14 + Math.random() * 22) + "px";
      var dur = 16 + Math.random() * 20;          // 16-36s fall
      s.style.animationDuration = dur + "s";
      s.style.animationDelay = (-Math.random() * dur) + "s";
      s.style.opacity = (0.12 + Math.random() * 0.18).toFixed(2);
      field.appendChild(s);
    }
    document.body.appendChild(field);
  }

  function start() { reveal(); sparkles(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();


/* ============================================================
   Krewe of Unicorns: responsive navigation
   Hamburger drawer, accessible dropdowns, auto active-state.
   ============================================================ */
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
    function openMenu() {
      nav.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('nav-open');
    }
    function closeMenu() {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('nav-open');
      closeGroups();
    }

    toggle.addEventListener('click', function () {
      nav.classList.contains('open') ? closeMenu() : openMenu();
    });
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

    document.addEventListener('click', function (e) {
      if (!nav.contains(e.target)) closeGroups();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        closeGroups();
        if (nav.classList.contains('open')) closeMenu();
      }
    });

    var navLinks = menu.querySelectorAll('a[href]');
    for (var k = 0; k < navLinks.length; k++) {
      navLinks[k].addEventListener('click', function () { if (mq.matches) closeMenu(); });
    }

    function onMq() { if (!mq.matches) closeMenu(); }
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
