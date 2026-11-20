/* Krewe Gear catalog. Each live item links to the shared KOS Shop.
   Zeffy cannot prefill a cart from a URL, so this page does not keep one.
   KOS_SHOP_ZEFFY_URL is the fallback. list_public_shop_checkout() overrides
   it when kos_runtime_flags.kos_shop_zeffy_url is set. */
(function () {
  var KOS_SHOP_ZEFFY_URL = "https://www.zeffy.com/en-US/ticketing/kos-shop";
  var LEGACY_CART_KEY = "kosShopCartV1";

  try { localStorage.removeItem(LEGACY_CART_KEY); } catch (e) {}

  var PRODUCTS = [];

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(x) {
    try {
      var s = String(x || "").trim();
      if (!/^https?:\/\//i.test(s)) return "";
      var u = new URL(s);
      return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  function isPlaceholderUrl(u) {
    var s = String(u || "");
    return !s || /PLACEHOLDER/i.test(s) || !safeUrl(s);
  }

  function shopUrl() {
    var live = safeUrl(window.KOS_SHOP_ZEFFY_URL);
    if (live && !isPlaceholderUrl(live)) return live;
    var built = safeUrl(KOS_SHOP_ZEFFY_URL);
    if (built && !isPlaceholderUrl(built)) return built;
    return KOS_SHOP_ZEFFY_URL;
  }

  function money(cents) {
    var v = Number(cents);
    if (!isFinite(v)) return "";
    return "$" + (v / 100).toFixed(2);
  }

  function visible(p) {
    var st = (p && p.status) || "draft";
    return st === "live" || st === "coming_soon";
  }

  function renderGrid() {
    var g = document.getElementById("shopGrid");
    if (!g) return;
    var rows = PRODUCTS.filter(visible);
    if (!rows.length) {
      g.innerHTML = '<p class="empty" style="grid-column:1/-1;text-align:center">No merchandise is available right now. Check back soon!</p>';
      return;
    }
    var href = shopUrl();
    g.innerHTML = rows.map(function (p) {
      var price = p.price_cents == null ? "Price TBA" : money(p.price_cents);
      var im = safeUrl(p.image_url);
      var name = p.name || "Krewe product";
      var live = (p.status || "") === "live";
      var open = live ? '<a class="product" href="' + esc(href) + '">' : '<article class="product product-soon">';
      var close = live ? "</a>" : "</article>";
      var img = im
        ? '<div class="pimg" style="background-image:url(\'' + esc(im) + "')\"></div>"
        : '<div class="pimg pimg-ph"><span class="ph-label">Photo coming soon</span></div>';
      var soon = live ? "" : '<div class="soon">Coming soon</div>';
      return open + img +
        '<div class="pbody"><h3>' + esc(name) + "</h3>" +
        '<div class="desc">' + esc(p.description || "") + "</div>" +
        '<div class="price">' + esc(price) + "</div>" +
        soon +
        "</div>" + close;
    }).join("");
  }

  async function loadShopUrl(client) {
    if (!client || typeof client.rpc !== "function") return shopUrl();
    try {
      var res = await client.rpc("list_public_shop_checkout");
      var data = res && !res.error ? res.data : null;
      var raw = data && (data.zeffy_url || data.url || "");
      var u = safeUrl(raw);
      if (u && !isPlaceholderUrl(u)) window.KOS_SHOP_ZEFFY_URL = u;
    } catch (e) {}
    return shopUrl();
  }

  window.KosShopCatalog = {
    KOS_SHOP_ZEFFY_URL: KOS_SHOP_ZEFFY_URL,
    init: function (products) {
      PRODUCTS = Array.isArray(products) ? products : [];
      renderGrid();
    },
    loadShopUrl: loadShopUrl,
    shopUrl: shopUrl
  };
})();
