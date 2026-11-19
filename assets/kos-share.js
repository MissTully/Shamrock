/* Share a published event: Facebook, copy link, and the phone share sheet.
   Keep the button markup in step with lib/event-share.js shareButtonsHtml. */
(function () {
  var ORIGIN = "https://www.kreweofshamrock.com";

  function escAttr(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function eventUrl(id) {
    return ORIGIN + "/events/" + encodeURIComponent(String(id || "").trim());
  }

  function facebookHref(id) {
    return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(eventUrl(id));
  }

  function html(id, title) {
    var safeId = String(id || "").trim();
    if (!safeId) return "";
    var url = eventUrl(safeId);
    var label = String(title || "Krewe of Shamrock event");
    return '<div class="kos-share" data-share-id="' + escAttr(safeId) + '" data-share-url="' + escAttr(url) + '" data-share-title="' + escAttr(label) + '">' +
      '<a class="kos-share-fb" href="' + escAttr(facebookHref(safeId)) + '" target="_blank" rel="noopener noreferrer">Share on Facebook</a>' +
      '<button type="button" class="kos-share-copy">Copy link</button>' +
      '<button type="button" class="kos-share-native" hidden>Share</button>' +
      "</div>";
  }

  function canNativeShare() {
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  }

  function prepare(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    var show = canNativeShare();
    var nodes = root.querySelectorAll(".kos-share-native");
    for (var i = 0; i < nodes.length; i++) nodes[i].hidden = !show;
  }

  function copyText(url, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      ta.remove();
      done();
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(url).then(done).catch(fallback);
      return;
    }
    fallback();
  }

  document.addEventListener("click", function (ev) {
    var target = ev.target;
    if (!target || !target.closest) return;
    var root = target.closest(".kos-share");
    if (!root) return;
    var copyBtn = target.closest(".kos-share-copy");
    var nativeBtn = target.closest(".kos-share-native");
    var fb = target.closest(".kos-share-fb");
    if (!copyBtn && !nativeBtn && !fb) return;
    ev.stopPropagation();
    if (fb) return;
    ev.preventDefault();
    var url = root.getAttribute("data-share-url") || "";
    var title = root.getAttribute("data-share-title") || "Krewe of Shamrock event";
    if (copyBtn) {
      copyText(url, function () {
        copyBtn.textContent = "Link copied";
        setTimeout(function () {
          if (copyBtn.textContent === "Link copied") copyBtn.textContent = "Copy link";
        }, 2000);
      });
    }
    if (nativeBtn && canNativeShare()) {
      var pending = navigator.share({ title: title, text: title, url: url });
      if (pending && typeof pending.catch === "function") pending.catch(function () {});
    }
  }, true);

  function boot() {
    prepare(document);
    if (!window.MutationObserver || !document.body) return;
    var waiting = false;
    var observer = new MutationObserver(function () {
      if (waiting) return;
      waiting = true;
      setTimeout(function () {
        waiting = false;
        prepare(document);
      }, 0);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.kosShare = {
    origin: ORIGIN,
    eventUrl: eventUrl,
    facebookHref: facebookHref,
    html: html,
    prepare: prepare
  };
})();
