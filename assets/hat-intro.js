(function () {
  var STORAGE = "kos-hat-intro-v1";
  var overlay = document.getElementById("hatIntro");
  var figure = document.getElementById("hatIntroFigure");
  var target = document.getElementById("tartanBallCta");
  var skip = document.getElementById("hatIntroSkip");
  if (!overlay || !figure || !target) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var timers = [];

  function later(fn, ms) {
    timers.push(window.setTimeout(fn, ms));
  }
  function clearTimers() {
    timers.forEach(function (id) { clearTimeout(id); });
    timers = [];
  }

  function landMath() {
    var fr = figure.getBoundingClientRect();
    var tr = target.getBoundingClientRect();
    var dx = tr.left + tr.width / 2 - (fr.left + fr.width / 2);
    var dy = tr.top + tr.height / 2 - (fr.top + fr.height / 2);
    var scale = Math.min(tr.width / Math.max(fr.width, 1), tr.height / Math.max(fr.height, 1)) * 1.35;
    scale = Math.max(0.16, Math.min(scale, 0.38));
    figure.style.setProperty("--land-x", dx + "px");
    figure.style.setProperty("--land-y", dy + "px");
    figure.style.setProperty("--land-s", String(scale));
  }

  function finish() {
    clearTimers();
    overlay.classList.add("is-done");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("hat-intro-lock");
    target.classList.add("is-hat-landed");
    try { sessionStorage.setItem(STORAGE, "1"); } catch (e) {}
  }

  function skipNow() {
    clearTimers();
    overlay.classList.add("is-skipping");
    finish();
  }

  if (reduced) {
    skipNow();
    return;
  }

  var seen = false;
  try { seen = sessionStorage.getItem(STORAGE) === "1"; } catch (e) {}
  if (seen && !/replayIntro=1/.test(location.search)) {
    skipNow();
    return;
  }

  document.body.classList.add("hat-intro-lock");
  overlay.classList.add("is-playing");
  if (skip) skip.addEventListener("click", skipNow);

  later(function () { overlay.classList.add("is-wiggle"); }, 1250);
  later(function () {
    landMath();
    overlay.classList.add("is-landing");
    target.classList.add("is-awaiting");
  }, 3400);
  later(function () {
    overlay.classList.add("is-fading");
    target.classList.remove("is-awaiting");
    target.classList.add("is-hat-landed");
  }, 5600);
  later(finish, 7000);
})();
