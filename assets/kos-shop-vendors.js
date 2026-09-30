/* Vendor apparel on the public Shop: photos and outbound links only.
   No prices, cart, or sizes. Krewe Gear stays in store.html. */
(function () {
  var COLLAGE_FULL = 4;
  var CATEGORY_LABELS = {
    womens: "Women's",
    mens: "Men's",
    unisex: "Unisex",
    outerwear: "Outerwear"
  };

  function safeUrl(value) {
    var raw = String(value == null ? "" : value).trim();
    if (!/^https?:\/\//i.test(raw) || /\s/.test(raw)) return "";
    try {
      var u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function stripPrices(value) {
    return String(value == null ? "" : value)
      .replace(/\$\s*\d[\d,]*(?:\.\d{1,2})?/g, "")
      .replace(/\b(?:usd|dollars?)\s*\d[\d,]*(?:\.\d{1,2})?/gi, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .trim();
  }

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function vendorLabel(vendor) {
    return stripPrices(vendor.short_name) || stripPrices(vendor.name) || "our vendor";
  }

  function photosFor(vendor, looks) {
    var shots = [];
    asList(vendor.showcase_images).forEach(function (raw) {
      var href = safeUrl(raw);
      if (href) shots.push({ src: href, alt: stripPrices(vendor.name) || "Vendor apparel" });
    });
    if (shots.length) return shots;
    looks.forEach(function (look) {
      var href = safeUrl(look.image_url);
      if (!href) return;
      shots.push({ src: href, alt: stripPrices(look.name) || stripPrices(vendor.name) || "Vendor apparel" });
    });
    return shots;
  }

  function collageHtml(photos) {
    if (!photos.length) {
      return '<div class="vendor-collage vendor-collage-empty">' +
        '<img src="assets/img/kos-emblem.png" alt="" />' +
        '<span>Shop the collection</span></div>';
    }
    var shown = photos;
    var more = 0;
    var kind = "vendor-collage-grid";
    if (photos.length === 1) kind = "vendor-collage-one";
    else if (photos.length === 2) kind = "vendor-collage-two";
    else if (photos.length > COLLAGE_FULL) {
      shown = photos.slice(0, COLLAGE_FULL - 1);
      more = photos.length - shown.length;
    }
    var cells = shown.map(function (photo) {
      return '<img src="' + esc(photo.src) + '" alt="' + esc(photo.alt) + '" />';
    }).join("");
    if (more > 0) {
      cells += '<span class="vendor-more">+' + more + ' more</span>';
    }
    return '<div class="vendor-collage ' + kind + '">' + cells + '</div>';
  }

  function contactHtml(vendor) {
    var bits = [];
    var phone = stripPrices(vendor.contact_phone);
    var email = stripPrices(vendor.contact_email);
    if (phone) {
      var tel = phone.replace(/[^\d+]/g, "");
      bits.push('<a href="tel:' + esc(tel || phone) + '">' + esc(phone) + '</a>');
    }
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      bits.push('<a href="mailto:' + esc(email) + '">' + esc(email) + '</a>');
    }
    if (!bits.length) return "";
    return '<p class="vendor-contact">Vendor contact: ' + bits.join(" · ") + '</p>';
  }

  function lookCard(look, vendor) {
    var image = safeUrl(look.image_url);
    if (!image) return "";
    var store = safeUrl(vendor.store_url);
    var outbound = safeUrl(look.outbound_url) || safeUrl(look.product_url) || store;
    if (!outbound) return "";
    var name = stripPrices(look.name) || "Krewe apparel";
    var label = vendorLabel(vendor);
    var category = CATEGORY_LABELS[String(look.category || "").toLowerCase()] || "";
    return '<li class="vendor-look"><a href="' + esc(outbound) + '" target="_blank" rel="noopener noreferrer">' +
      '<img src="' + esc(image) + '" alt="' + esc(name) + '" />' +
      '<span class="vendor-look-copy"><span class="vendor-look-name">' + esc(name) + '</span>' +
      (category ? '<span class="vendor-look-cat">' + esc(category) + '</span>' : '') +
      '<span class="vendor-look-order">Order from ' + esc(label) + ' ↗</span></span></a></li>';
  }

  function tileHtml(vendor, photos) {
    var store = safeUrl(vendor.store_url);
    var name = stripPrices(vendor.name) || "Vendor partner";
    var label = vendorLabel(vendor);
    var season = stripPrices(vendor.season_label);
    var blurb = stripPrices(vendor.blurb);
    var note = stripPrices(vendor.fulfillment_note);
    var logo = safeUrl(vendor.logo_url);
    var action = store
      ? '<span class="vendor-order">Order from ' + esc(label) + ' ↗</span>'
      : '<p class="vendor-pending">Store link needs an http:// or https:// address.</p>';
    var body = collageHtml(photos) + '<div class="vendor-copy">' +
      (season ? '<p class="vendor-season">' + esc(season) + '</p>' : '') +
      (logo ? '<img class="vendor-logo" src="' + esc(logo) + '" alt="" />' : '') +
      '<h3>' + esc(name) + '</h3>' +
      (blurb ? '<p class="vendor-blurb">' + esc(blurb) + '</p>' : '') +
      (note ? '<p class="vendor-fulfill">' + esc(note) + '</p>' : '') +
      action + '</div>';
    if (!store) {
      return '<div class="vendor-tile vendor-tile-plain">' + body + '</div>';
    }
    return '<a class="vendor-tile" href="' + esc(store) + '" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="Order from ' + esc(name) + '. Opens their store in a new tab.">' + body + '</a>';
  }

  function render(root, vendors, looks) {
    var list = asList(vendors).slice().sort(function (a, b) {
      return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
        String(a.name || "").localeCompare(String(b.name || ""));
    });
    var byVendor = {};
    asList(looks).forEach(function (look) {
      var id = String(look.vendor_id || "");
      if (!byVendor[id]) byVendor[id] = [];
      byVendor[id].push(look);
    });
    if (!list.length) {
      root.innerHTML = '<p class="empty vendor-empty">Apparel links will show up here when they are published.</p>';
      return { hasPhotos: false, vendorCount: 0 };
    }
    var hasPhotos = false;
    root.innerHTML = list.map(function (vendor) {
      var id = String(vendor.id || "");
      var group = (byVendor[id] || []).slice().sort(function (a, b) {
        return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      });
      var photos = photosFor(vendor, group);
      if (photos.length) hasPhotos = true;
      var cards = group.map(function (look) { return lookCard(look, vendor); }).join("");
      return '<article class="vendor-block">' + tileHtml(vendor, photos) + contactHtml(vendor) +
        (cards ? '<ul class="vendor-looks">' + cards + '</ul>' : '') + '</article>';
    }).join("");
    return { hasPhotos: hasPhotos, vendorCount: list.length };
  }

  window.KosShopVendors = { safeUrl: safeUrl, render: render, stripPrices: stripPrices };
})();
