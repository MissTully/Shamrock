/* Member Hub home-screen install (the existing website, not a store app).
   Display name on the icon is "Shamrock". To rename that label later, change:
     1. KOS_HUB_APP_NAME below
     2. name and short_name in /manifest.webmanifest
     3. apple-mobile-web-app-title on members.html
   Registers a tiny service worker so Android Chrome can offer Install.
   Captures beforeinstallprompt for the in-hub Get the App screen.
   Does not add an install banner to the public homepage. */
(function () {
  "use strict";
  var APP_NAME = "Shamrock";
  var HUB_URL = "https://kreweofshamrock.com/members.html";
  var QR_SRC = "/assets/img/hub-install-qr.svg";
  var deferred = null;
  var installed = false;

  window.KOS_HUB_APP_NAME = APP_NAME;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function isStandalone() {
    try {
      if (window.navigator && window.navigator.standalone) return true;
      return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    } catch (e) {
      return false;
    }
  }

  function icon(inner, filled) {
    if (filled) {
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + inner + "</svg>";
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
  }

  function isInApp(ua) {
    return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Gmail|GoogleMail|Line\/|Snapchat|LinkedInApp|Pinterest|TikTok|musical_ly|BytedanceWebview|WhatsApp|MicroMessenger|Twitter|;\s*wv\)/i.test(ua);
  }

  function inAppName(ua) {
    if (/Instagram/i.test(ua)) return "Instagram";
    if (/Messenger/i.test(ua)) return "Messenger";
    if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
    if (/Gmail|GoogleMail/i.test(ua)) return "Gmail";
    if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return "TikTok";
    if (/WhatsApp/i.test(ua)) return "WhatsApp";
    if (/Snapchat/i.test(ua)) return "Snapchat";
    if (/Line\//i.test(ua)) return "Line";
    if (/LinkedInApp/i.test(ua)) return "LinkedIn";
    if (/Pinterest/i.test(ua)) return "Pinterest";
    if (/MicroMessenger/i.test(ua)) return "WeChat";
    if (/Twitter/i.test(ua)) return "Twitter";
    return "this app";
  }

  function isIOSDevice(ua, nav) {
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    return !!(/Macintosh/i.test(ua) && nav && nav.maxTouchPoints > 1);
  }

  function isIPad(ua, nav) {
    if (/iPad/i.test(ua)) return true;
    return !!(/Macintosh/i.test(ua) && nav && nav.maxTouchPoints > 1);
  }

  function isIOSSafari(ua) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|GSA\//i.test(ua)) return false;
    return /Safari/i.test(ua);
  }

  function isChromium(ua) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false;
    if (/HeadlessChrome|SamsungBrowser|Edg\/|Chromium|Chrome\//i.test(ua)) return true;
    return false;
  }

  function detect(ua) {
    var nav = window.navigator || {};
    ua = ua == null ? (nav.userAgent || "") : String(ua);
    var ios = isIOSDevice(ua, nav);
    var android = /Android/i.test(ua);
    var mobile = android || ios || /Mobile/i.test(ua);
    if (isStandalone()) {
      return { path: "installed", app: "", ios: ios, android: android, mobile: mobile, ipad: isIPad(ua, nav) };
    }
    if (isInApp(ua)) {
      return { path: "inapp", app: inAppName(ua), ios: ios, android: android, mobile: true, ipad: isIPad(ua, nav) };
    }
    if (ios) {
      return {
        path: isIOSSafari(ua) ? "ios-safari" : "ios-other",
        app: "",
        ios: true,
        android: false,
        mobile: true,
        ipad: isIPad(ua, nav)
      };
    }
    if (isChromium(ua)) {
      return { path: "chromium", app: "", ios: false, android: android, mobile: mobile, ipad: false };
    }
    return { path: "other", app: "", ios: false, android: android, mobile: mobile, ipad: false };
  }

  function step(n, svg, text) {
    return "<li><span class=\"app-step-n\">" + n + "</span>" +
      "<span class=\"app-step-ic\">" + svg + "</span>" +
      "<span class=\"app-step-tx\">" + text + "</span></li>";
  }

  var SHARE_ICON = icon('<path d="M12 4.2v9"/><path d="M8.2 7.4 12 3.6l3.8 3.8"/><path d="M6 11.2V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6.8"/>');
  var PLUS_ICON = icon('<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>');
  var ADD_ICON = icon('<rect x="4" y="7" width="16" height="10" rx="2"/><path d="M8 12h8"/>');
  var DOTS_ICON = icon('<circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none"/>', false);

  function signOnce() {
    return '<p class="app-install-once">You sign in once the first time.</p>';
  }

  function notStore() {
    return "<p>This is not an App Store or Play Store app.</p>";
  }

  function wrap(inner) {
    return '<div class="app-detail" id="appGetApp">' + inner + "</div>";
  }

  function iosSteps() {
    return '<ol class="app-steps">' +
      step("1", SHARE_ICON, "Tap the Share button.") +
      step("2", PLUS_ICON, "Scroll and tap Add to Home Screen.") +
      step("3", ADD_ICON, "Tap Add. Keep the name Shamrock.") +
      "</ol>" +
      "<p>On iPad, the Share button is at the top.</p>";
  }

  function screenHtml() {
    if (installed || isStandalone()) {
      return wrap(
        '<p class="app-detail-kicker">Shamrock</p>' +
        "<h2>You're all set</h2>" +
        "<p>Shamrock opens from the Shamrock icon on your home screen.</p>" +
        signOnce()
      );
    }
    var info = detect();
    var name = esc(APP_NAME);
    if (info.path === "ios-safari") {
      return wrap(
        '<p class="app-detail-kicker">iPhone and iPad</p>' +
        "<h2>Get the App</h2>" +
        "<p>Add " + name + " to your Home Screen.</p>" +
        iosSteps() +
        notStore() +
        signOnce()
      );
    }
    if (info.path === "ios-other") {
      return wrap(
        '<p class="app-detail-kicker">iPhone and iPad</p>' +
        "<h2>Get the App</h2>" +
        "<p>Newer iPhones and iPads can add this page here too. Tap Share, then Add to Home Screen. Safari is the most reliable.</p>" +
        iosSteps() +
        signOnce()
      );
    }
    if (info.path === "inapp") {
      var where = info.ios
        ? "Tap the menu and choose Open in Safari."
        : (info.android
          ? "Tap the menu and choose Open in Chrome."
          : "Open this page in Safari or Chrome.");
      return wrap(
        '<p class="app-detail-kicker">Open in a browser</p>' +
        "<h2>Get the App</h2>" +
        "<p>Install does not work inside " + esc(info.app) + ".</p>" +
        "<p>" + where + "</p>" +
        "<p>You can also copy the link and paste it into Safari or Chrome.</p>" +
        '<button type="button" class="app-install-btn" id="appCopyLink" data-app-go="copy-hub-link" data-hub-url="' + esc(HUB_URL) + '">Copy link</button>' +
        signOnce()
      );
    }
    if (info.path === "chromium" && deferred && typeof deferred.prompt === "function") {
      return wrap(
        '<p class="app-detail-kicker">Install</p>' +
        "<h2>Get the App</h2>" +
        "<p>Add " + name + " to your home screen. It opens full screen, like an app.</p>" +
        notStore() +
        '<button type="button" class="app-install-btn" id="appInstallBtn" data-app-go="prompt-install">Install Shamrock Hub</button>' +
        signOnce()
      );
    }
    if (info.path === "chromium") {
      return wrap(
        '<p class="app-detail-kicker">Install</p>' +
        "<h2>Get the App</h2>" +
        "<p>Add " + name + " from the browser menu.</p>" +
        '<ol class="app-steps">' +
        step("1", DOTS_ICON, "Tap the three dots in the browser menu.") +
        step("2", PLUS_ICON, "Tap Install app, or Add to Home screen.") +
        "</ol>" +
        "<p>On a computer, look for the install icon in the address bar.</p>" +
        notStore() +
        signOnce()
      );
    }
    if (info.mobile) {
      return wrap(
        '<p class="app-detail-kicker">Install</p>' +
        "<h2>Get the App</h2>" +
        "<p>Open this page in Chrome to add " + name + " to your home screen.</p>" +
        "<p>In Chrome, tap the three dots, then Install app or Add to Home screen.</p>" +
        '<button type="button" class="app-install-btn" id="appCopyLink" data-app-go="copy-hub-link" data-hub-url="' + esc(HUB_URL) + '">Copy link</button>' +
        signOnce()
      );
    }
    return wrap(
      '<p class="app-detail-kicker">On your phone</p>' +
      "<h2>Get the App</h2>" +
      "<p>Open the Member Hub on your phone to add it to your home screen.</p>" +
      '<div class="app-qr"><img src="' + QR_SRC + '" width="220" height="220" alt="QR code that opens the Member Hub" />' +
      "<p>Point your phone camera at this code. It opens the Member Hub.</p></div>" +
      signOnce()
    );
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    deferred = e;
    try { window.dispatchEvent(new CustomEvent("kos-hub-install-prompt")); } catch (err) {}
  });

  window.addEventListener("appinstalled", function () {
    installed = true;
    deferred = null;
    try { window.dispatchEvent(new CustomEvent("kos-hub-app-installed")); } catch (err) {}
  });

  window.KOS_HUB_INSTALL = {
    appName: APP_NAME,
    hubUrl: HUB_URL,
    isStandalone: isStandalone,
    detect: detect,
    hasPrompt: function () { return !!(deferred && typeof deferred.prompt === "function"); },
    wasInstalled: function () { return installed || isStandalone(); },
    screenHtml: screenHtml,
    prompt: function () {
      if (!deferred || typeof deferred.prompt !== "function") return Promise.resolve("unavailable");
      var ev = deferred;
      deferred = null;
      var done = ev.prompt();
      if (!done || typeof done.then !== "function") done = Promise.resolve();
      return done.then(function () {
        return ev.userChoice || { outcome: "dismissed" };
      }).then(function (choice) {
        var outcome = (choice && choice.outcome) || "dismissed";
        if (outcome === "accepted") installed = true;
        return outcome;
      }).catch(function () { return "dismissed"; });
    }
  };

  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/hub-sw.js").catch(function () {});
  });
})();
