/* Give to the Krewe.
   The live switch is kos_runtime_flags.kos_donation_zeffy_url
   (url + amount_param), read by list_public_donation_form().
   This constant is the fallback until that flag answers.
   Zeffy prefills with lowercase amount, as in ?amount=25. */
(function () {
  var KOS_DONATION_ZEFFY_URL = "https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock";
  var KOS_DONATION_AMOUNT_PARAM = "amount";

  function safeUrl(value) {
    try {
      var s = String(value || "").trim();
      if (!/^https?:\/\//i.test(s)) return "";
      var u = new URL(s);
      return (u.protocol === "http:" || u.protocol === "https:") ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  function placeholder(url) {
    return !url || /placeholder/i.test(url);
  }

  function config() {
    var live = window.KOS_DONATION_FORM || {};
    var url = safeUrl(live.url) || safeUrl(KOS_DONATION_ZEFFY_URL);
    var param = String(live.amountParam || KOS_DONATION_AMOUNT_PARAM || "amount").trim() || "amount";
    return { url: url, amountParam: param };
  }

  function formatAmount(cents) {
    var n = Number(cents);
    if (!isFinite(n)) return "";
    var dollars = n / 100;
    if (Math.round(dollars) === dollars) return String(dollars);
    return dollars.toFixed(2);
  }

  function withAmount(cents, paramName) {
    var cfg = config();
    if (!cfg.url) return "";
    var next = new URL(cfg.url);
    var dollars = formatAmount(cents);
    var param = String(paramName || cfg.amountParam || "amount").trim() || "amount";
    if (dollars) next.searchParams.set(param, dollars);
    return next.toString();
  }

  function parseGiftAmount(input) {
    var raw = String(input == null ? "" : input).trim().replace(/[$,\s]/g, "");
    if (!raw) return { ok: false, message: "Enter a gift amount to continue." };
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
      return { ok: false, message: "Use dollars and cents, like 25 or 25.50." };
    }
    var dollars = Number(raw);
    if (!isFinite(dollars) || dollars < 1) {
      return { ok: false, message: "The smallest gift is $1." };
    }
    if (dollars > 1000000) {
      return { ok: false, message: "For a gift this large, please write the Treasurer and we will help you." };
    }
    return { ok: true, amount_cents: Math.round(dollars * 100) };
  }

  function applyLinks() {
    var cfg = config();
    if (!cfg.url || placeholder(cfg.url)) return;
    document.querySelectorAll("[data-kos-donate]").forEach(function (el) {
      if (el.tagName === "A") {
        el.href = cfg.url;
        if (!el.getAttribute("target")) el.setAttribute("target", "_blank");
        if (!el.getAttribute("rel")) el.setAttribute("rel", "noopener noreferrer");
      }
      el.setAttribute("data-kos-donation-ready", "1");
    });
  }

  async function loadFlag() {
    if (window.__kosDonationPreview) {
      applyLinks();
      return config();
    }
    var url = window.KOS_SB_URL;
    var key = window.KOS_SB_KEY;
    if (!url || !key) {
      var client = window.__kosSb;
      if (client && typeof client.rpc === "function") {
        try {
          var res = await client.rpc("list_public_donation_form");
          var data = res && !res.error ? res.data : null;
          remember(data);
        } catch (e) {}
      }
      applyLinks();
      return config();
    }
    try {
      var response = await fetch(String(url).replace(/\/$/, "") + "/rest/v1/rpc/list_public_donation_form", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: key,
          authorization: "Bearer " + key
        },
        body: "{}"
      });
      if (response.ok) remember(await response.json());
    } catch (e2) {}
    applyLinks();
    return config();
  }

  function remember(data) {
    if (!data || typeof data !== "object") return;
    var next = safeUrl(data.zeffy_url || data.url || "");
    if (!next || placeholder(next)) return;
    var param = String(data.amount_param || data.amountParam || "").trim();
    window.KOS_DONATION_FORM = {
      url: next,
      amountParam: param || KOS_DONATION_AMOUNT_PARAM
    };
  }

  function boot() {
    applyLinks();
    var start = function () { loadFlag(); };
    if (window.KOS_SB_URL && window.KOS_SB_KEY) {
      start();
      return;
    }
    var s = document.createElement("script");
    s.src = "assets/kos-supabase.js";
    s.onload = start;
    s.onerror = start;
    document.head.appendChild(s);
  }

  window.KosDonate = {
    KOS_DONATION_ZEFFY_URL: KOS_DONATION_ZEFFY_URL,
    KOS_DONATION_AMOUNT_PARAM: KOS_DONATION_AMOUNT_PARAM,
    config: config,
    withAmount: withAmount,
    parseGiftAmount: parseGiftAmount,
    applyLinks: applyLinks,
    loadFlag: loadFlag
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
