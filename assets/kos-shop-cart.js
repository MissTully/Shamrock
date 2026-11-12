/* Krewe Gear cart and KOS Shop checkout.
   Paste the live Zeffy Online Store URL into KOS_SHOP_ZEFFY_URL below
   (or into shop settings after sql/kos_shop_unified_checkout.sql is applied). */
(function () {
  // DROP THE KOS SHOP URL HERE (single place to swap in the Zeffy link).
  var KOS_SHOP_ZEFFY_URL = "https://www.zeffy.com/en-US/online-store/KOS-SHOP-URL-PLACEHOLDER";
  var STORAGE_KEY = "kosShopCartV1";
  var MAX_QTY = 20;

  var PRODUCTS = [];
  var cart = {};

  function esc(s) {
    return (s ?? "").toString().replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeUrl(x) {
    try {
      var u = new URL(x || "", location.href);
      return ["http:", "https:"].includes(u.protocol) ? u.href : "";
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
    return "";
  }

  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) return "$0.00";
    return "$" + v.toFixed(2);
  }

  function keyOf(id, size) {
    return String(id) + "|" + String(size || "One size");
  }

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      cart = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (e) {
      cart = {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {}
  }

  function lines() {
    return Object.keys(cart).map(function (k) { return cart[k]; }).filter(function (row) {
      return row && row.qty > 0;
    });
  }

  function count() {
    return lines().reduce(function (n, row) { return n + Number(row.qty || 0); }, 0);
  }

  function total() {
    return lines().reduce(function (n, row) {
      return n + Number(row.price || 0) * Number(row.qty || 0);
    }, 0);
  }

  function listText() {
    var rows = lines();
    var out = ["KOS Shop order"];
    rows.forEach(function (row) {
      out.push("- " + row.name + " (" + row.size + ") x" + row.qty + "  " + money(row.price * row.qty));
    });
    out.push("Total: " + money(total()));
    return out.join("\n");
  }

  function productById(id) {
    return PRODUCTS.find(function (p) { return String(p.id || p.slug) === String(id); });
  }

  function setQty(id, size, qty) {
    var k = keyOf(id, size);
    var n = Math.floor(Number(qty) || 0);
    if (n <= 0) {
      delete cart[k];
      saveCart();
      render();
      return;
    }
    if (n > MAX_QTY) n = MAX_QTY;
    if (!cart[k]) {
      var p = productById(id);
      if (!p) return;
      cart[k] = {
        id: String(p.id || p.slug),
        name: p.name,
        price: Number(p.price_cents || 0) / 100,
        size: size || "One size",
        qty: n
      };
    } else {
      cart[k].qty = n;
    }
    saveCart();
    render();
  }

  function addToCart(id) {
    var p = productById(id);
    if (!p) return;
    var szEl = document.getElementById("sz-" + id);
    var size = (szEl && szEl.value) || (Array.isArray(p.sizes) && p.sizes[0]) || "One size";
    var k = keyOf(id, size);
    var cur = cart[k] && cart[k].qty ? cart[k].qty : 0;
    setQty(id, size, cur + 1);
    openCart("cart");
  }

  function paintCounts() {
    var n = count();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(n);
    });
    document.querySelectorAll("[data-cart-badge]").forEach(function (el) {
      el.hidden = n <= 0;
      el.textContent = String(n);
    });
    var nav = document.getElementById("navCartBtn");
    if (nav) nav.setAttribute("aria-label", n === 1 ? "Open cart, 1 item" : "Open cart, " + n + " items");
  }

  function renderGrid() {
    var g = document.getElementById("shopGrid");
    if (!g) return;
    if (!PRODUCTS.length) {
      g.innerHTML = '<p class="empty" style="grid-column:1/-1;text-align:center">No merchandise is available right now. Check back soon!</p>';
      return;
    }
    g.innerHTML = PRODUCTS.map(function (p) {
      var id = p.id || p.slug;
      var price = p.price_cents == null ? null : Number(p.price_cents) / 100;
      var sizes = Array.isArray(p.sizes) && p.sizes.length ? p.sizes : ["One size"];
      var im = safeUrl(p.image_url);
      var st = p.status || "draft";
      var opts = sizes.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join("");
      var h = '<div class="product">';
      h += im
        ? '<div class="pimg" style="background-image:url(\'' + esc(im) + "')\"></div>"
        : '<div class="pimg pimg-ph"><span class="ph-label">Photo coming soon</span></div>';
      h += '<div class="pbody"><h3>' + esc(p.name || "Krewe product") + "</h3>";
      h += '<div class="desc">' + esc(p.description || "") + "</div>";
      h += '<div class="price">' + (price == null ? "Price TBA" : money(price)) + "</div>";
      if (st === "coming_soon" || st === "awaiting_zeffy" || price == null) {
        h += '<div class="soon">' + (st === "awaiting_zeffy" ? "Checkout linking…" : "Coming soon") + "</div>";
      } else {
        h += '<select id="sz-' + esc(id) + '" aria-label="Size for ' + esc(p.name || "item") + '">' + opts + "</select>";
        h += '<button class="btn btn-primary add" type="button" data-add="' + esc(id) + '">Add to Cart</button>';
      }
      h += "</div></div>";
      return h;
    }).join("");
    g.querySelectorAll("[data-add]").forEach(function (b) {
      b.onclick = function () { addToCart(b.dataset.add); };
    });
  }

  function renderCartList() {
    var u = document.getElementById("cartItems");
    var tot = document.getElementById("cartTotal");
    var empty = document.getElementById("cartEmpty");
    var actions = document.getElementById("cartActions");
    if (!u) return;
    var rows = lines();
    if (!rows.length) {
      u.innerHTML = "";
      if (tot) tot.textContent = "";
      if (empty) empty.hidden = false;
      if (actions) actions.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (actions) actions.hidden = false;
    u.innerHTML = rows.map(function (row) {
      var line = money(row.price * row.qty);
      return '<li class="cart-line">' +
        '<div class="cart-line-info"><span class="cart-line-name">' + esc(row.name) + "</span>" +
        '<span class="cart-line-meta">' + esc(row.size) + " · " + money(row.price) + " each</span></div>" +
        '<div class="cart-line-qty">' +
        '<button type="button" class="cart-qty" data-dec="' + esc(row.id) + '" data-size="' + esc(row.size) + '" aria-label="Fewer ' + esc(row.name) + '">-</button>' +
        '<span class="cart-qty-n">' + row.qty + "</span>" +
        '<button type="button" class="cart-qty" data-inc="' + esc(row.id) + '" data-size="' + esc(row.size) + '" aria-label="More ' + esc(row.name) + '">+</button>' +
        "</div>" +
        '<div class="cart-line-sum">' + line + "</div>" +
        '<button type="button" class="cart-remove" data-remove="' + esc(row.id) + '" data-size="' + esc(row.size) + '">Remove</button>' +
        "</li>";
    }).join("");
    if (tot) tot.textContent = "Total: " + money(total());
    u.querySelectorAll("[data-inc]").forEach(function (b) {
      b.onclick = function () {
        var row = cart[keyOf(b.dataset.inc, b.dataset.size)];
        setQty(b.dataset.inc, b.dataset.size, (row ? row.qty : 0) + 1);
      };
    });
    u.querySelectorAll("[data-dec]").forEach(function (b) {
      b.onclick = function () {
        var row = cart[keyOf(b.dataset.dec, b.dataset.size)];
        setQty(b.dataset.dec, b.dataset.size, (row ? row.qty : 0) - 1);
      };
    });
    u.querySelectorAll("[data-remove]").forEach(function (b) {
      b.onclick = function () { setQty(b.dataset.remove, b.dataset.size, 0); };
    });
  }

  function renderSummary() {
    var box = document.getElementById("checkoutLines");
    var tot = document.getElementById("checkoutTotal");
    var openBtn = document.getElementById("checkoutOpen");
    var note = document.getElementById("checkoutLinkNote");
    if (!box) return;
    var rows = lines();
    box.innerHTML = rows.map(function (row) {
      return "<li><span>" + esc(row.name) + " (" + esc(row.size) + ") x" + row.qty + "</span><span>" + money(row.price * row.qty) + "</span></li>";
    }).join("");
    if (tot) tot.textContent = "Total: " + money(total());
    var url = shopUrl();
    if (openBtn) {
      if (url) {
        openBtn.hidden = false;
        openBtn.href = url;
      } else {
        openBtn.hidden = true;
        openBtn.removeAttribute("href");
      }
    }
    if (note) {
      note.hidden = !!url;
    }
  }

  function showStep(step) {
    var cartView = document.getElementById("cartView");
    var checkView = document.getElementById("checkoutView");
    if (cartView) cartView.hidden = step !== "cart";
    if (checkView) checkView.hidden = step !== "checkout";
    if (step === "checkout") renderSummary();
  }

  function openCart(step) {
    renderCartList();
    showStep(step === "checkout" && count() ? "checkout" : "cart");
    var panel = document.getElementById("cartPanel");
    if (panel) {
      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
    }
  }

  function closeCart() {
    var panel = document.getElementById("cartPanel");
    if (panel) {
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
    }
    showStep("cart");
  }

  function clearCart() {
    cart = {};
    saveCart();
    render();
    showStep("cart");
  }

  function copyList() {
    var text = listText();
    var msg = document.getElementById("checkoutCopyMsg");
    function ok() { if (msg) msg.textContent = "List copied."; }
    function fail() { if (msg) msg.textContent = "Could not copy. Select and copy the list yourself."; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(fail);
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) { fail(); }
      document.body.removeChild(ta);
    }
  }

  function render() {
    paintCounts();
    var panel = document.getElementById("cartPanel");
    if (panel && panel.classList.contains("open")) {
      renderCartList();
      if (document.getElementById("checkoutView") && !document.getElementById("checkoutView").hidden) {
        renderSummary();
      }
    }
  }

  function bind() {
    var panel = document.getElementById("cartPanel");
    if (panel) {
      panel.addEventListener("click", function (e) {
        if (e.target === e.currentTarget) closeCart();
      });
    }
    document.querySelectorAll("[data-open-cart]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.preventDefault();
        openCart("cart");
      });
    });
    var closeBtn = document.getElementById("cartClose");
    if (closeBtn) closeBtn.addEventListener("click", function (e) { e.preventDefault(); closeCart(); });
    var toCheckout = document.getElementById("cartCheckout");
    if (toCheckout) toCheckout.addEventListener("click", function () {
      if (!count()) return;
      showStep("checkout");
    });
    var back = document.getElementById("checkoutBack");
    if (back) back.addEventListener("click", function (e) { e.preventDefault(); showStep("cart"); });
    var copyBtn = document.getElementById("checkoutCopy");
    if (copyBtn) copyBtn.addEventListener("click", copyList);
    var clearBtn = document.getElementById("checkoutClear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      clearCart();
      closeCart();
    });
  }

  async function maybeLoadShopUrl(client) {
    if (!client || typeof client.rpc !== "function") return;
    try {
      var res = await client.rpc("list_public_shop_checkout");
      if (res && !res.error && res.data) {
        var u = safeUrl(res.data.zeffy_url || res.data.url || "");
        if (u && !isPlaceholderUrl(u)) window.KOS_SHOP_ZEFFY_URL = u;
      }
    } catch (e) {}
  }

  window.KosShopCart = {
    KOS_SHOP_ZEFFY_URL: KOS_SHOP_ZEFFY_URL,
    init: function (products) {
      PRODUCTS = Array.isArray(products) ? products : [];
      loadCart();
      renderGrid();
      paintCounts();
    },
    loadShopUrl: maybeLoadShopUrl,
    addToCart: addToCart,
    openCart: openCart,
    closeCart: closeCart,
    clearCart: clearCart
  };
  window.openCart = function () { openCart("cart"); };
  window.closeCart = closeCart;
  window.addToCart = addToCart;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
