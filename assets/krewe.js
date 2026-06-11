/* Krewe of Shamrock — floating music player
   Behaviour: loads muted + autoplay (browser-safe). The visitor taps the
   button to unmute & play "Where the Kettle Sings". Tapping again pauses. */
(function () {
     function init() {
            var audio = document.getElementById("kreweAudio");
            var wrap  = document.getElementById("krewePlayer");
            var btn   = document.getElementById("kreweMusicBtn");
            var label = document.getElementById("kreweMusicLabel");
            if (!audio || !btn) return;

       audio.volume = 0.18; // soft background level
       audio.loop   = true;

       function setPlaying(on) {
                wrap.classList.toggle("playing", on);
                btn.setAttribute("aria-pressed", on ? "true" : "false");
                btn.setAttribute("title", on ? "Pause the music" : "Play our Irish tune");
                if (label) label.textContent = on ? "\u266a Kettle Singing" : "Tap for a tune \u2618";
       }

       // Soft autoplay on arrival. Browsers block audible autoplay until the
       // visitor interacts, so if it's blocked we prime the track and start it
       // the instant they move, tap, scroll, or press a key.
       audio.muted = false;
            audio.play().then(function () { setPlaying(true); }).catch(function () {
                     audio.muted = true;
                     audio.play().catch(function () {});
                     var events = ["pointerdown", "touchstart", "keydown", "scroll", "mousemove"];
                     var go = function () {
                                audio.muted = false;
                                audio.play().then(function () { setPlaying(true); }).catch(function () {});
                                events.forEach(function (ev) { document.removeEventListener(ev, go); });
                     };
                     events.forEach(function (ev) { document.addEventListener(ev, go, { once: true }); });
            });

       btn.addEventListener("click", function () {
                if (audio.paused) {
                           audio.muted = false;
                           audio.play().then(function () { setPlaying(true); }).catch(function () {});
                } else {
                           audio.pause();
                           setPlaying(false);
                }
       });
     }

   if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", init);
   } else {
          init();
   }
}());


/* ============================================================
  Navigation — hamburger toggle + dropdown groups
  ============================================================ */
(function () {
  function initNav() {
    /* --- Hamburger toggle --- */
    var toggle = document.querySelector('.nav-toggle');
    var links  = document.getElementById('kreweLinks');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var open = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    /* --- Dropdown groups --- */
    var groups = document.querySelectorAll('.nav-group');
    groups.forEach(function (group) {
      var btn = group.querySelector('.nav-group-btn');
      if (!btn) return;

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = group.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        // Close other open groups
        groups.forEach(function (other) {
          if (other !== group) {
            other.classList.remove('open');
            var ob = other.querySelector('.nav-group-btn');
            if (ob) ob.setAttribute('aria-expanded', 'false');
          }
        });
      });
    });

    /* --- Close dropdowns when clicking outside --- */
    document.addEventListener('click', function () {
      groups.forEach(function (group) {
        group.classList.remove('open');
        var btn = group.querySelector('.nav-group-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      });
    });

    /* --- Close dropdowns on Escape key --- */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        groups.forEach(function (group) {
          group.classList.remove('open');
          var btn = group.querySelector('.nav-group-btn');
          if (btn) btn.setAttribute('aria-expanded', 'false');
        });
        if (links) links.classList.remove('open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
}());
