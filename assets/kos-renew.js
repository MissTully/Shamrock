/* Renew my membership. One card for the phone sheet, Parade Ready, and desktop Home.
   Levels come from kos_my_renewal (kos_dues_catalog). Seeded 2026 rates show
   if that SQL is not applied yet. Officers and board stay exempt. */
(function () {
  var TREASURER = "treasurer@kreweofshamrock.com";
  var SEEDED = [
    {
      level: "full",
      label: "Full",
      amount: 375,
      zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership",
      explainer: "You're a voting member, and you march in the parades. You also share the 12 hour volunteer commitment for the Krewe year (June through May), or $12 for each hour you don't work."
    },
    {
      level: "associate",
      label: "Associate",
      amount: 450,
      zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-associate-membership",
      explainer: "This is for one year. You can join two parades of your choice. There's no vote, and you don't take on the 12 hour volunteer commitment."
    },
    {
      level: "auxiliary",
      label: "Auxiliary",
      amount: 200,
      zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-auxiliary-membership",
      explainer: "This is a non-voting membership for one major parade. The fee already includes the background check and the membership portion."
    },
    {
      level: "loa",
      label: "Leave of absence",
      amount: 100,
      zeffy_url: "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2",
      explainer: "This is our social membership for a year when you'd like to step back and still stay connected."
    }
  ];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function seasonOf(year) {
    var y = Number(year);
    if (!y && window.kosDuesSeason) y = window.kosDuesSeason.duesSeasonYear(new Date());
    if (!y) {
      var d = new Date();
      y = (d.getMonth() + 1) >= 6 ? d.getFullYear() : d.getFullYear() - 1;
    }
    var label = window.kosDuesSeason
      ? window.kosDuesSeason.seasonLabel(y)
      : (y + "-" + String(y + 1).slice(-2));
    return {
      year: y,
      label: label,
      line: "This covers the " + label + " season, June " + y + " through May " + (y + 1) + "."
    };
  }

  function money(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return "";
    if (Math.round(n) === n) return "$" + n;
    return "$" + n.toFixed(2);
  }

  function levelLabel(level) {
    var row = SEEDED.filter(function (item) { return item.level === level; })[0];
    return row ? row.label : "Full";
  }

  function normalize(data) {
    var src = data || {};
    var season = seasonOf(src.year);
    var levels = Array.isArray(src.levels) && src.levels.length ? src.levels : SEEDED;
    var partner = src.partner && (src.partner.first_name || src.partner.member_id) ? src.partner : null;
    return {
      paid: !!src.paid,
      exempt: !!src.exempt,
      year: season.year,
      label: src.season_label || season.label,
      line: season.line,
      level: src.membership_level || src.level || "full",
      paidDate: src.paid_date || src.paidDate || "",
      partner: partner,
      levels: levels.map(function (row) {
        return {
          level: row.level,
          label: row.label || levelLabel(row.level),
          amount: row.amount,
          zeffy_url: row.zeffy_url || row.url || "",
          explainer: row.explainer || ""
        };
      }),
      treasurer: src.treasurer_email || TREASURER,
      holdNavigation: !!src.holdNavigation,
      preview: !!src.preview
    };
  }

  function fallbackModel(hint) {
    var parade = (hint && hint.parade) || (hint && hint.dues_paid != null ? hint : null);
    var year = window.kosDuesSeason ? window.kosDuesSeason.duesSeasonYear(new Date()) : null;
    return normalize({
      paid: !!(parade && parade.dues_paid),
      exempt: typeof window.kosDuesExempt === "function" && window.kosDuesExempt(),
      year: year,
      membership_level: (parade && parade.membership_level) || (window.kosProfile && window.kosProfile.membership_level) || "full",
      partner: hint && hint.partner ? hint.partner : null,
      levels: SEEDED,
      holdNavigation: !!(hint && hint.holdNavigation),
      preview: !!(hint && hint.preview)
    });
  }

  function partnerName(partner) {
    if (!partner) return "";
    return [partner.first_name, partner.last_name].filter(Boolean).join(" ").trim();
  }

  function cardHtml(raw, opts) {
    var model = normalize(raw);
    var titleAttr = opts && opts.titleId ? ' id="' + esc(opts.titleId) + '"' : "";
    var season = seasonOf(model.year);
    if (model.exempt) {
      return '<div class="kos-renew" data-renew-root>' +
        '<h2' + titleAttr + '>Renew my membership</h2>' +
        '<p>Officers and board are not invoiced for dues. That part of Parade Ready stays complete for you.</p>' +
        '<p>Questions: <a href="mailto:' + esc(TREASURER) + '">' + esc(TREASURER) + '</a></p></div>';
    }
    if (model.paid) {
      var who = levelLabel(model.level);
      var when = model.paidDate ? ' Paid date on file: ' + esc(String(model.paidDate).slice(0, 10)) + '.' : '';
      return '<div class="kos-renew kos-renew-is-paid" data-renew-root>' +
        '<p class="kos-renew-kicker">Krewe of Shamrock</p>' +
        '<h2' + titleAttr + '>You\'re paid for the ' + esc(season.label) + ' season</h2>' +
        '<p>' + esc(who) + ' membership is on file for June ' + season.year + ' through May ' + (season.year + 1) + '.' + when + ' Thank you.</p>' +
        '<p>Parade Ready shows dues as complete for this season.</p>' +
        '<p>Questions: <a href="mailto:' + esc(model.treasurer) + '">' + esc(model.treasurer) + '</a></p></div>';
    }
    var name = partnerName(model.partner);
    var both = "";
    if (name && model.partner && model.partner.paid) {
      both = '<p class="kos-renew-note">' + esc(name) + ' is already paid for this season. This renewal is just for you.</p>';
    } else if (name) {
      both = '<label class="kos-renew-both"><input type="checkbox" data-renew-both />' +
        '<span><b>Renew for both of us</b> ' + esc(name) +
        ' is linked on your membership. Check this, then pick one level. Zeffy opens one checkout. On that page, add two tickets: one for you and one for ' +
        esc(name) + '. Put each person\'s name and email on their own ticket so both roster rows are marked paid. You pay the two tickets together. It is not a two-for-one price. We save this level for both of you before the page opens.</span></label>';
    }
    var buttons = model.levels.map(function (row) {
      return '<button type="button" class="kos-renew-level" data-renew-level="' + esc(row.level) + '" data-zeffy-url="' + esc(row.zeffy_url || "") + '">' +
        '<span class="kos-renew-level-top"><b>' + esc(row.label) + '</b><b class="price">' + esc(money(row.amount)) + '</b></span>' +
        (row.explainer ? '<span class="kos-renew-explainer">' + esc(row.explainer) + '</span>' : '') +
        '</button>';
    }).join("");
    return '<div class="kos-renew" data-renew-root>' +
      '<p class="kos-renew-kicker">Krewe of Shamrock</p>' +
      '<h2' + titleAttr + '>Renew my membership</h2>' +
      '<p class="kos-renew-season">' + esc(season.line) + '</p>' +
      '<p>Pick the level you want this season. We save that choice, then open Zeffy so you can pay. These are membership dues, not the join application fee.</p>' +
      both +
      '<div class="kos-renew-levels">' + buttons + '</div>' +
      '<p class="kos-renew-msg" data-renew-msg role="status"></p>' +
      '<p class="kos-renew-foot">Questions: <a href="mailto:' + esc(model.treasurer) + '">' + esc(model.treasurer) + '</a></p></div>';
  }

  function paint(el, model, opts) {
    if (!el) return;
    el.innerHTML = cardHtml(model, opts);
    bind(el, normalize(model));
  }

  function bind(root, model) {
    if (!root) return;
    root.querySelectorAll("[data-renew-level]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        choose(root, model, btn.getAttribute("data-renew-level"), btn);
      });
    });
  }

  function setMsg(root, text, kind) {
    var el = root && root.querySelector("[data-renew-msg]");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-err", kind === "err");
  }

  async function choose(root, model, level, btn) {
    var bothBox = root.querySelector("[data-renew-both]");
    var both = !!(bothBox && bothBox.checked);
    var row = (model.levels || []).filter(function (item) { return item.level === level; })[0];
    if (!row) return;
    if (btn) btn.disabled = true;
    setMsg(root, "Saving your level...");
    var url = row.zeffy_url || "";
    try {
      if (!model.preview && window.__kosSb && typeof window.__kosSb.rpc === "function") {
        var res = await window.__kosSb.rpc("kos_choose_renewal_level", {
          p_level: level,
          p_include_partner: both
        });
        if (res.error) throw res.error;
        var data = res.data || {};
        if (data.ok === false) throw new Error(data.message || "Could not save that level.");
        if (data.already_paid) {
          paint(root, Object.assign({}, model, { paid: true, level: data.membership_level || level }));
          return;
        }
        if (data.zeffy_url) url = data.zeffy_url;
      }
    } catch (e) {
      if (btn) btn.disabled = false;
      setMsg(root, (e && e.message) || "Could not save that level. Try again, or email the treasurer.", "err");
      return;
    }
    if (model.holdNavigation || model.preview) {
      if (btn) btn.disabled = false;
      setMsg(root, "Preview only. This would open Zeffy for " + row.label + (both ? ", two tickets." : "."));
      return;
    }
    if (!url) {
      if (btn) btn.disabled = false;
      setMsg(root, "That level does not have a Zeffy link yet. Email " + model.treasurer + " and we'll help you pay.", "err");
      return;
    }
    setMsg(root, both
      ? "Opening Zeffy. Add two tickets, one for each of you."
      : "Opening Zeffy for " + row.label + ".");
    var opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      setMsg(root, "");
      var msg = root.querySelector("[data-renew-msg]");
      if (msg) {
        msg.innerHTML = 'Your browser kept the new tab closed. <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">Open the Zeffy page</a>.';
      }
    }
    if (btn) btn.disabled = false;
  }

  function mount(el, hint) {
    if (!el) return;
    var first = fallbackModel(hint || {});
    if (hint && hint.levels) first = normalize(hint);
    paint(el, first);
    if (first.preview || first.holdNavigation) return;
    if (window.__kosParadePreviewLock) return;
    loadModel().then(function (live) {
      if (!el.isConnected || !live) return;
      paint(el, live);
    }).catch(function () {});
  }

  function loadModel() {
    var client = window.__kosSb;
    if (!client || typeof client.rpc !== "function") return Promise.resolve(null);
    var pending = Promise.resolve()
      .then(function () { return client.rpc("kos_my_renewal"); })
      .then(function (res) {
        if (res && !res.error && res.data && res.data.ok) return normalize(res.data);
        return null;
      })
      .catch(function () { return null; });
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, 4000);
    });
    return Promise.race([pending, timeout]);
  }

  function openSheetHtml(html) {
    if (typeof window.kosOpenHubSheet === "function") {
      window.kosOpenHubSheet(html);
      return document.getElementById("appSheetBody");
    }
    var body = document.getElementById("appSheetBody");
    var sheet = document.getElementById("appSheet");
    if (body) body.innerHTML = html;
    if (sheet) sheet.hidden = false;
    return body;
  }

  function open(hint) {
    if (typeof window.kosDuesExempt === "function" && window.kosDuesExempt()) {
      openSheetHtml(cardHtml({ exempt: true }, { titleId: "appSheetTitle" }));
      return;
    }
    var first = fallbackModel(hint || {});
    openSheetHtml(cardHtml(first, { titleId: "appSheetTitle" }));
    var body = document.getElementById("appSheetBody");
    if (body) bind(body, first);
    if (first.preview || first.holdNavigation) return;
    loadModel().then(function (live) {
      var again = document.getElementById("appSheetBody");
      if (!again || !live) return;
      paint(again, live, { titleId: "appSheetTitle" });
    });
  }

  var css = document.createElement("style");
  css.textContent =
    ".kos-renew{background:#fffdf6;border:1px solid rgba(168,128,28,.38);border-radius:16px;padding:16px 16px 14px;color:#1c2b22;}" +
    ".kos-renew h2{font-family:var(--display,Georgia,serif);color:#14532d;margin:0 0 8px;font-size:1.45rem;line-height:1.2;}" +
    ".kos-renew p{margin:0 0 10px;line-height:1.45;font-size:16px;}" +
    ".kos-renew-kicker{margin:0 0 4px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a12;}" +
    ".kos-renew-season{background:#f3faf5;border-radius:12px;padding:10px 12px;}" +
    ".kos-renew-levels{display:grid;gap:8px;margin:4px 0 8px;}" +
    ".kos-renew-level{display:block;width:100%;text-align:left;background:#fff;border:1px solid rgba(20,83,45,.22);border-radius:14px;padding:12px 14px;font:inherit;cursor:pointer;color:#1c2b22;}" +
    ".kos-renew-level:hover{border-color:#14532d;background:#f3faf5;}" +
    ".kos-renew-level-top{display:flex;justify-content:space-between;gap:12px;align-items:baseline;}" +
    ".kos-renew-level b{font-family:var(--display,Georgia,serif);color:#14532d;font-size:1.05rem;}" +
    ".kos-renew-level .price{white-space:nowrap;}" +
    ".kos-renew-explainer{display:block;color:#5c5648;font-size:15px;line-height:1.4;margin-top:4px;}" +
    ".kos-renew-both{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px dashed rgba(168,128,28,.55);border-radius:12px;padding:10px 12px;margin:0 0 12px;font-size:15px;line-height:1.45;}" +
    ".kos-renew-both input{margin-top:4px;width:20px;height:20px;flex:none;}" +
    ".kos-renew-note,.kos-renew-foot{font-size:15px;color:#5c5648;}" +
    ".kos-renew a{color:#14532d;font-weight:700;}" +
    ".kos-renew-msg{min-height:1.2em;font-size:15px;}" +
    ".kos-renew-msg.is-err{color:#8a2b22;}" +
    ".kos-renew-is-paid{background:#14532d;color:#f6efdc;border-color:#14532d;}" +
    ".kos-renew-is-paid h2,.kos-renew-is-paid .kos-renew-kicker{color:#f6efdc;}" +
    ".kos-renew-is-paid a{color:#f0d78c;}" +
    "#prRenewMount{margin-top:8px;}";
  document.head.appendChild(css);

  window.kosRenew = {
    cardHtml: function (model, opts) { return cardHtml(normalize(model), opts); },
    mount: mount,
    open: open,
    normalize: normalize,
    seeded: SEEDED
  };
})();
