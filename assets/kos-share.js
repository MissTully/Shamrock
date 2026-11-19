/* Share a published event.
   Public pages offer Share on my Facebook, Copy link, and the phone Share button.
   Member Hub cards also offer Share in our Krewe group. That button copies the
   public event link and opens the members-only Facebook group.
   The group URL below is the only copy. lib/event-share.js reads it from here. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.kosShare = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var ORIGIN = "https://www.kreweofshamrock.com";
  var MEMBERS_FACEBOOK_GROUP_URL = "https://www.facebook.com/groups/1790675004521855";
  var GROUP_LABEL = "Share in our Krewe group";
  var MINE_LABEL = "Share on my Facebook";
  var COPIED_NOTE = "Link copied. Paste it into a new post in the group.";
  var MANUAL_NOTE = "Select this link, then paste it into a new post in the group.";

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

  // Pass { members: true } on signed-in Hub cards. Public pages omit it so the
  // members-only group button, its note, and the hand-copy field stay off those pages.
  function html(id, title, options) {
    var safeId = String(id || "").trim();
    if (!safeId) return "";
    var members = !!(options && options.members);
    var url = eventUrl(safeId);
    var label = String(title || "Krewe of Shamrock event");
    var group = members
      ? '<a class="kos-share-group" href="' + escAttr(MEMBERS_FACEBOOK_GROUP_URL) + '" target="_blank" rel="noopener noreferrer">' + GROUP_LABEL + "</a>"
      : "";
    var afterCopy = members
      ? '<p class="kos-share-note" role="status" hidden></p>' +
        '<div class="kos-share-fallback" hidden><input type="text" readonly class="kos-share-fallback-url" aria-label="Event link" spellcheck="false" /></div>'
      : "";
    return '<div class="kos-share' + (members ? " kos-share-members" : "") + '" data-share-id="' + escAttr(safeId) + '" data-share-url="' + escAttr(url) + '" data-share-title="' + escAttr(label) + '">' +
      group +
      '<a class="kos-share-fb" href="' + escAttr(facebookHref(safeId)) + '" target="_blank" rel="noopener noreferrer">' + MINE_LABEL + "</a>" +
      '<button type="button" class="kos-share-copy">Copy link</button>' +
      '<button type="button" class="kos-share-native" hidden>Share</button>' +
      afterCopy +
      "</div>";
  }

  function canNativeShare() {
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  }

  function prepare(scope) {
    if (typeof document === "undefined") return;
    var root = scope && scope.querySelectorAll ? scope : document;
    var show = canNativeShare();
    var nodes = root.querySelectorAll(".kos-share-native");
    for (var i = 0; i < nodes.length; i++) nodes[i].hidden = !show;
  }

  function legacyCopy(url) {
    if (typeof document === "undefined" || !document.body || typeof document.execCommand !== "function") return false;
    var ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "0";
    ta.style.top = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
    ta.remove();
    return !!ok;
  }

  function copyText(url) {
    // Ask for the clipboard while this click still owns the page. Opening the
    // group tab can leave writeText pending, so give up after a short wait
    // and use the older copy command.
    return new Promise(function (resolve) {
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        resolve(!!ok);
      }
      var timer = setTimeout(function () { finish(legacyCopy(url)); }, 700);
      function done(ok) {
        clearTimeout(timer);
        finish(ok);
      }
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        var pending;
        try {
          pending = navigator.clipboard.writeText(url);
        } catch (err) {
          done(legacyCopy(url));
          return;
        }
        if (pending && typeof pending.then === "function") {
          pending.then(function () { done(true); }).catch(function () { done(legacyCopy(url)); });
          return;
        }
      }
      done(legacyCopy(url));
    });
  }

  function showNote(root, text) {
    var note = root.querySelector(".kos-share-note");
    if (!note) return;
    var fallback = root.querySelector(".kos-share-fallback");
    if (fallback) fallback.hidden = true;
    note.hidden = false;
    note.textContent = text;
  }

  function showFallback(root, url) {
    var note = root.querySelector(".kos-share-note");
    if (note) {
      note.hidden = false;
      note.textContent = MANUAL_NOTE;
    }
    var box = root.querySelector(".kos-share-fallback");
    if (!box) return;
    var input = box.querySelector("input");
    if (input) {
      input.value = url;
      box.hidden = false;
      try {
        input.focus();
        input.select();
      } catch (err) {}
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", function (ev) {
      var target = ev.target;
      if (target && target.nodeType === 3) target = target.parentElement;
      if (!target || !target.closest) return;
      var root = target.closest(".kos-share");
      if (!root) return;
      ev.stopPropagation();
      try { window.focus(); } catch (err) {}
      var group = target.closest(".kos-share-group");
      var copyBtn = target.closest(".kos-share-copy");
      var nativeBtn = target.closest(".kos-share-native");
      var fb = target.closest(".kos-share-fb");
      if (!group && !copyBtn && !nativeBtn && !fb) return;
      if (fb) return;
      if (group) {
        var groupUrl = root.getAttribute("data-share-url") || "";
        copyText(groupUrl).then(function (ok) {
          if (ok) showNote(root, COPIED_NOTE);
          else showFallback(root, groupUrl);
        });
        return;
      }
      ev.preventDefault();
      var url = root.getAttribute("data-share-url") || "";
      var title = root.getAttribute("data-share-title") || "Krewe of Shamrock event";
      if (copyBtn) {
        copyText(url).then(function (ok) {
          if (!ok) {
            showFallback(root, url);
            return;
          }
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
  }

  return {
    origin: ORIGIN,
    groupUrl: MEMBERS_FACEBOOK_GROUP_URL,
    eventUrl: eventUrl,
    facebookHref: facebookHref,
    html: html,
    prepare: prepare
  };
});
