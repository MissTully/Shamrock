/* Member videos keep their own shape.
   File clips use videoWidth / videoHeight after loadedmetadata (browsers
   report those after a phone rotation tag). The card holds a 9:16 box
   until then so a captionless clip does not collapse. Landscape embeds
   stay 16:9. YouTube Shorts and Facebook Reels stay 9:16. */
(function () {
  "use strict";

  var CSS = [
    ".kos-video-frame{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;max-width:100%;width:min(100%, var(--kos-video-max-w, 680px));margin-inline:auto;--kos-video-max-h:520px;--kos-video-max-w:680px;background:#0a120c;border-radius:16px;overflow:hidden;position:relative;}",
    ".kos-video-frame.is-fit,.kos-video-frame.is-embed{width:min(100%, calc(var(--kos-video-max-h, 520px) * var(--kos-video-w, 9) / var(--kos-video-h, 16)), var(--kos-video-max-w, 680px));}",
    ".kos-video-frame:not(.is-fit):not(.is-embed){width:min(100%, calc(var(--kos-video-max-h, 520px) * 9 / 16), var(--kos-video-max-w, 680px));}",
    ".kos-video-frame video{display:block;width:100%;height:auto;max-width:100%;object-fit:contain;background:#0a120c;}",
    ".kos-video-frame:not(.is-fit):not(.is-embed) video{aspect-ratio:9/16;height:auto;}",
    ".kos-video-frame.is-embed iframe{position:static;display:block;width:100%;height:auto;aspect-ratio:var(--kos-video-w, 16) / var(--kos-video-h, 9);border:0;}",
    ".hub-media-preview.kos-video-frame{--kos-video-max-h:280px;--kos-video-max-w:220px;margin-inline:0;border-radius:8px;}",
    "@media (max-width:420px){.kos-video-frame{--kos-video-max-h:480px;}.hub-media-preview.kos-video-frame{--kos-video-max-h:280px;}}"
  ].join("");

  function injectCss() {
    if (document.getElementById("kosVideoFrameCss")) return;
    var s = document.createElement("style");
    s.id = "kosVideoFrameCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function youtubeId(url) {
    var m = String(url || "").match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : "";
  }

  function vimeoId(url) {
    var m = String(url || "").match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : "";
  }

  function isDirectVideo(url) {
    var u = String(url || "").trim();
    if (!u) return false;
    if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(u)) return true;
    if (/\/storage\/v1\/object\/public\/krewe-videos\//i.test(u)) return true;
    return false;
  }

  function isPortraitEmbed(url) {
    var u = String(url || "");
    if (/\/shorts\//i.test(u)) return true;
    if (/facebook\.com\/(?:reel|reels)\b/i.test(u)) return true;
    if (/fb\.watch\/reel/i.test(u)) return true;
    return false;
  }

  function isFacebookVideo(url) {
    return /(?:facebook\.com\/(?:.+\/videos\/|watch|reel|reels)|fb\.watch\/)/i.test(String(url || ""));
  }

  function embedRatio(url) {
    return isPortraitEmbed(url) ? { w: 9, h: 16 } : { w: 16, h: 9 };
  }

  function applyVideo(frame, video) {
    var w = video.videoWidth;
    var h = video.videoHeight;
    if (!w || !h) return;
    frame.style.setProperty("--kos-video-w", String(w));
    frame.style.setProperty("--kos-video-h", String(h));
    frame.classList.add("is-fit");
  }

  function fitFrame(frame) {
    if (!frame || !frame.querySelector) return;
    if (frame.classList.contains("is-embed")) return;
    var video = frame.querySelector("video");
    if (!video) return;
    if (video.dataset.kosVidBound === "1") {
      if (video.videoWidth) applyVideo(frame, video);
      return;
    }
    video.dataset.kosVidBound = "1";
    video.addEventListener("loadedmetadata", function () { applyVideo(frame, video); });
    if (video.readyState >= 1 && video.videoWidth) applyVideo(frame, video);
  }

  function kosFitVideoFrames(root) {
    var list = [];
    if (root && root.classList && root.classList.contains("kos-video-frame")) list.push(root);
    var scope = root && root.querySelectorAll ? root : document;
    var found = scope.querySelectorAll(".kos-video-frame");
    var i;
    for (i = 0; i < found.length; i++) {
      if (list.indexOf(found[i]) === -1) list.push(found[i]);
    }
    for (i = 0; i < list.length; i++) fitFrame(list[i]);
  }

  function kosVideoFrameHtml(url, extraClass) {
    var u = String(url || "").trim();
    if (!u) return "";
    var extra = extraClass ? " " + extraClass : "";
    var safe = esc(u);
    if (isDirectVideo(u)) {
      return '<div class="kos-video-frame' + extra + '"><video controls playsinline preload="metadata" src="' + safe + '"></video></div>';
    }
    var ratio = embedRatio(u);
    var frame = '<div class="kos-video-frame is-embed' + extra + '" style="--kos-video-w:' + ratio.w + ';--kos-video-h:' + ratio.h + '">';
    var yt = youtubeId(u);
    if (yt) {
      return frame + '<iframe src="https://www.youtube.com/embed/' + yt + '?rel=0" allow="fullscreen; picture-in-picture" allowfullscreen title="Video"></iframe></div>';
    }
    var vim = vimeoId(u);
    if (vim) {
      return frame + '<iframe src="https://player.vimeo.com/video/' + vim + '" allow="fullscreen; picture-in-picture" allowfullscreen title="Video"></iframe></div>';
    }
    if (isFacebookVideo(u)) {
      var src = "https://www.facebook.com/plugins/video.php?href=" + encodeURIComponent(u) + "&show_text=false";
      return frame + '<iframe src="' + esc(src) + '" allow="fullscreen; picture-in-picture" allowfullscreen title="Video"></iframe></div>';
    }
    return '<div class="muted" style="margin-top:4px;"><a href="' + safe + '" target="_blank" rel="noopener">Open video</a></div>';
  }

  function watch() {
    kosFitVideoFrames(document);
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (records) {
      var r, n, node;
      for (r = 0; r < records.length; r++) {
        var nodes = records[r].addedNodes;
        for (n = 0; n < nodes.length; n++) {
          node = nodes[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains("kos-video-frame")) fitFrame(node);
          if (node.querySelectorAll) kosFitVideoFrames(node);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  injectCss();
  window.kosFitVideoFrames = kosFitVideoFrames;
  window.kosVideoFrameHtml = kosVideoFrameHtml;
  window.kosVideoEmbedRatio = embedRatio;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();
