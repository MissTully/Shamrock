/* Member gallery photos keep their own shape.
   The frame width follows naturalWidth / naturalHeight (already oriented
   by the browser) and a max height, so a tall phone shot is not cropped
   into a landscape tile. New JPEG uploads bake EXIF orientation into the
   pixels so the stored file stands upright even if a viewer ignores EXIF. */
(function () {
  "use strict";

  var CSS = [
    ".kos-photo-frame{box-sizing:border-box;display:flex;flex-direction:column;min-width:0;max-width:100%;width:min(100%, var(--kos-photo-max-w, 460px));margin-inline:auto;}",
    ".kos-photo-frame.is-fit{width:min(100%, calc(var(--kos-photo-max-h, 520px) * var(--kos-photo-w, 4) / var(--kos-photo-h, 3)), var(--kos-photo-max-w, 460px));}",
    ".member-gallery{--kos-photo-max-h:520px;--kos-photo-max-w:460px;}",
    ".hub-media-preview{--kos-photo-max-h:280px;--kos-photo-max-w:220px;}",
    ".photo-preview{--kos-photo-max-h:420px;--kos-photo-max-w:440px;}",
    "@media (max-width:420px){.member-gallery{--kos-photo-max-h:480px;}.photo-preview{--kos-photo-max-h:360px;}}",
    ".kos-photo-frame > a{display:block;line-height:0;min-width:0;}",
    ".kos-photo-frame img{display:block;width:100%;height:auto;max-width:100%;object-fit:contain;image-orientation:from-image;background:#f4efe3;}"
  ].join("");

  function injectCss() {
    if (document.getElementById("kosPhotoFrameCss")) return;
    var s = document.createElement("style");
    s.id = "kosPhotoFrameCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function readExifOrientation(view, start, length) {
    if (length < 14) return 0;
    if (view.getUint32(start) !== 0x45786966) return 0;
    if (view.getUint16(start + 4) !== 0) return 0;
    var tiff = start + 6;
    var end = start + length;
    if (tiff + 8 > end) return 0;
    var order = view.getUint16(tiff);
    var le = order === 0x4949;
    if (!le && order !== 0x4d4d) return 0;
    if (view.getUint16(tiff + 2, le) !== 42) return 0;
    var ifd = tiff + view.getUint32(tiff + 4, le);
    if (ifd + 2 > end) return 0;
    var count = view.getUint16(ifd, le);
    var i;
    for (i = 0; i < count; i++) {
      var entry = ifd + 2 + i * 12;
      if (entry + 12 > end) break;
      if (view.getUint16(entry, le) !== 0x0112) continue;
      var type = view.getUint16(entry + 2, le);
      if (type === 3) return view.getUint16(entry + 8, le) || 1;
      if (type === 4) return view.getUint32(entry + 8, le) || 1;
    }
    return 0;
  }

  function jpegInfo(buffer) {
    if (!buffer) return null;
    var view = new DataView(buffer);
    var len = view.byteLength;
    if (len < 4 || view.getUint16(0) !== 0xffd8) return null;
    var orientation = 1;
    var width = 0;
    var height = 0;
    var offset = 2;
    while (offset + 3 < len) {
      if (view.getUint8(offset) !== 0xff) {
        offset += 1;
        continue;
      }
      var marker = view.getUint8(offset + 1);
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      if (offset + 4 > len) break;
      var size = view.getUint16(offset + 2);
      if (size < 2 || offset + 2 + size > len) break;
      if (marker === 0xe1) {
        var found = readExifOrientation(view, offset + 4, size - 2);
        if (found) orientation = found;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && size >= 7) {
        height = view.getUint16(offset + 5);
        width = view.getUint16(offset + 7);
      }
      if (marker === 0xda) break;
      offset += 2 + size;
    }
    if (!width || !height) return null;
    return { orientation: orientation || 1, width: width, height: height };
  }

  function jpegName(file) {
    var name = (file && file.name) || "photo.jpg";
    if (/\.jpe?g$/i.test(name)) return name;
    return name.replace(/\.\w+$/, "") + ".jpg";
  }

  async function kosNormalizePhotoFile(file) {
    if (!file || typeof createImageBitmap !== "function") return file;
    var buffer;
    try { buffer = await file.arrayBuffer(); }
    catch (e) { return file; }
    var info = jpegInfo(buffer);
    if (!info || info.orientation <= 1) return file;
    if (info.width * info.height > 24000000) return file;
    var blob = new Blob([buffer], { type: "image/jpeg" });
    var bitmap = null;
    try {
      // createImageBitmap applies EXIF even when imageOrientation is "none"
      // in current Chrome. A second manual turn flips orientation 3 upside
      // down and strips the tag. Draw the oriented bitmap once.
      try {
        bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      } catch (e1) {
        bitmap = await createImageBitmap(blob);
      }
      var canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      var ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0);
      var out = await new Promise(function (resolve) {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });
      if (!out) return file;
      return new File([out], jpegName(file), {
        type: "image/jpeg",
        lastModified: file.lastModified || Date.now()
      });
    } catch (err) {
      return file;
    } finally {
      if (bitmap && bitmap.close) bitmap.close();
    }
  }

  function applyFit(frame, img) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    if (!w || !h) return;
    frame.style.setProperty("--kos-photo-w", String(w));
    frame.style.setProperty("--kos-photo-h", String(h));
    frame.classList.add("is-fit");
  }

  function fitFrame(frame) {
    if (!frame || !frame.querySelector) return;
    var img = frame.querySelector("img");
    if (!img) return;
    if (img.dataset.kosFitBound === "1") {
      if (img.complete && img.naturalWidth) applyFit(frame, img);
      return;
    }
    img.dataset.kosFitBound = "1";
    img.addEventListener("load", function () { applyFit(frame, img); });
    if (img.complete && img.naturalWidth) applyFit(frame, img);
  }

  function kosFitPhotoFrames(root) {
    var list = [];
    if (root && root.classList && root.classList.contains("kos-photo-frame")) list.push(root);
    var scope = root && root.querySelectorAll ? root : document;
    var found = scope.querySelectorAll(".kos-photo-frame");
    var i;
    for (i = 0; i < found.length; i++) {
      if (list.indexOf(found[i]) === -1) list.push(found[i]);
    }
    for (i = 0; i < list.length; i++) fitFrame(list[i]);
  }

  function watch() {
    kosFitPhotoFrames(document);
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (records) {
      var r, n, node;
      for (r = 0; r < records.length; r++) {
        var nodes = records[r].addedNodes;
        for (n = 0; n < nodes.length; n++) {
          node = nodes[n];
          if (!node || node.nodeType !== 1) continue;
          if (node.classList && node.classList.contains("kos-photo-frame")) fitFrame(node);
          if (node.querySelectorAll) kosFitPhotoFrames(node);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  injectCss();
  window.kosFitPhotoFrames = kosFitPhotoFrames;
  window.kosNormalizePhotoFile = kosNormalizePhotoFile;
  window.kosReadJpegOrientation = function (buffer) {
    var info = jpegInfo(buffer);
    return info ? info.orientation : 1;
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch);
  } else {
    watch();
  }
})();
