/* Locker rentals: FCFS list, open counts, and Zeffy pay links.
   Real campaigns (2026-09-30). To change a pay link, update this object and
   the locker_settings rows in sql/kos_locker_rentals.sql. A signed-in read of
   locker_settings wins over these defaults.
   Small: https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small
   Large: https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-large */
(function () {
  var ZEFFY = {
    small: {
      url: "https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-small",
      campaign: "Krewe locker rental – Small",
      dollars: 75,
      setting: "ZEFFY_LOCKER_SMALL_URL",
      campaignKey: "ZEFFY_LOCKER_SMALL_CAMPAIGN"
    },
    large: {
      url: "https://www.zeffy.com/en-US/ticketing/krewe-locker-rental-large",
      campaign: "Krewe locker rental – Large",
      dollars: 200,
      setting: "ZEFFY_LOCKER_LARGE_URL",
      campaignKey: "ZEFFY_LOCKER_LARGE_CAMPAIGN"
    }
  };

  var bound = false;
  var deskHooked = false;
  var memberSeq = 0;
  var officerSeq = 0;
  var currentUrls = defaultUrls();
  var heldRows = [];

  function sb() {
    return window.__kosSb || null;
  }

  function esc(v) {
    return (v == null ? "" : String(v)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function show(id, text, kind) {
    var m = document.getElementById(id);
    if (!m) return;
    m.textContent = text || "";
    m.className = "msg " + (kind || "");
  }

  function identity() {
    var p = window.kosProfile || {};
    function notEmail(v) {
      v = (v == null ? "" : String(v)).trim();
      return v && v.indexOf("@") === -1 ? v : "";
    }
    var name = notEmail([p.first_name, p.last_name].filter(Boolean).join(" ")) || notEmail(p.display_name);
    return {
      name: name,
      email: (p.email || "").toString().trim(),
      memberId: p.member_id || null
    };
  }

  function applySettings(rows, urls) {
    (rows || []).forEach(function (row) {
      if (!row || !row.key) return;
      if (row.key === ZEFFY.small.setting && row.value) urls.small = row.value;
      if (row.key === ZEFFY.large.setting && row.value) urls.large = row.value;
      if (row.key === ZEFFY.small.campaignKey && row.value) urls.smallCampaign = row.value;
      if (row.key === ZEFFY.large.campaignKey && row.value) urls.largeCampaign = row.value;
    });
    return urls;
  }

  function defaultUrls() {
    return {
      small: ZEFFY.small.url,
      large: ZEFFY.large.url,
      smallCampaign: ZEFFY.small.campaign,
      largeCampaign: ZEFFY.large.campaign
    };
  }

  function paintPay(urls, counts) {
    [
      ["lockerPaySmall", "small", counts && counts.small],
      ["lockerPayLarge", "large", counts && counts.large]
    ].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      if (!el) return;
      var href = urls[pair[1]] || ZEFFY[pair[1]].url;
      var campaign = urls[pair[1] + "Campaign"] || ZEFFY[pair[1]].campaign;
      el.href = href;
      el.title = campaign;
      var open = typeof pair[2] === "number" && pair[2] > 0;
      if (open) el.removeAttribute("aria-disabled");
      else el.setAttribute("aria-disabled", "true");
    });
    var note = document.getElementById("lockerPayNote");
    if (!note) return;
    var bits = [];
    if (typeof counts.small === "number" && counts.small < 1) bits.push("The small pay link opens when a small locker is available.");
    if (typeof counts.large === "number" && counts.large < 1) bits.push("The large pay link opens when a large locker is available.");
    note.textContent = bits.join(" ");
  }

  function paintCounts(counts) {
    var large = document.getElementById("lockerLargeCount");
    var small = document.getElementById("lockerSmallCount");
    if (large) large.textContent = counts.large == null ? "..." : String(counts.large);
    if (small) small.textContent = counts.small == null ? "..." : String(counts.small);
  }

  function sizeLabel(size) {
    return size === "large" ? "Large" : "Small";
  }

  function joinList(items) {
    if (!items || !items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + " and " + items[1];
    return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
  }

  function needsRenewal(row) {
    return !(row && row.renewal_paid && !row.renewal_open);
  }

  function paintHeld(rows) {
    var box = document.getElementById("lockerHeld");
    var list = document.getElementById("lockerHeldList");
    var qty = document.getElementById("lockerHeldQty");
    if (!box || !list) return;
    heldRows = (rows || []).filter(function (row) {
      return row && (row.status === "paid" || row.status === "assigned") && row.locker_number;
    });
    if (!heldRows.length) {
      box.hidden = true;
      list.innerHTML = "";
      if (qty) qty.textContent = "";
      return;
    }
    box.hidden = false;
    var counts = { small: 0, large: 0 };
    heldRows.forEach(function (row) {
      if (!needsRenewal(row)) return;
      if (row.size === "large") counts.large += 1;
      else counts.small += 1;
    });
    list.innerHTML = heldRows.map(function (row) {
      var size = sizeLabel(row.size);
      var who = row.holder_name ? " · " + esc(row.holder_name) : "";
      var badge = row.status === "paid" ? "paid" : "assigned";
      var state = "";
      var button;
      if (row.renewal_open) {
        state = '<span class="locker-renew-state">Renewal saved. Payment is still open.</span>';
      } else if (row.renewal_paid) {
        state = '<span class="locker-renew-state">Paid for next season.</span>';
      }
      if (needsRenewal(row)) {
        button = '<button type="button" class="btn btn-green locker-renew" data-renew-locker="' + esc(row.id) +
          '" data-renew-size="' + esc(row.size === "large" ? "large" : "small") +
          '" aria-label="Renew locker ' + esc(row.locker_number) + ' for next season">Renew for next season</button>';
      } else {
        button = '<button type="button" class="btn btn-green locker-renew" disabled>Paid for next season</button>';
      }
      return '<div class="data-row locker-held-row"><div><b>Locker ' + esc(row.locker_number) + '</b> · ' +
        esc(size) + who + ' <span class="badge ' + badge + '">' + badge + '</span>' + state +
        '</div>' + button + '</div>';
    }).join("");
    if (!qty) return;
    var bits = [];
    if (counts.small >= 2) {
      bits.push("You have " + counts.small + " small lockers. You can pay for all of them in one checkout. On the Zeffy page, set the quantity to " + counts.small + ".");
    }
    if (counts.large >= 2) {
      bits.push("You have " + counts.large + " large lockers. You can pay for all of them in one checkout. On the Zeffy page, set the quantity to " + counts.large + ".");
    }
    qty.textContent = bits.join(" ");
  }

  function paintMine(rows) {
    var box = document.getElementById("lockerMine");
    if (!box) return;
    if (!rows || !rows.length) {
      box.innerHTML = heldRows.length
        ? '<p class="empty">You are not waiting for a new locker. Use My lockers above to renew one you already have.</p>'
        : '<p class="empty">You\'re not on the list yet. Join above to save your spot.</p>';
      return;
    }
    box.innerHTML = '<ul class="data-list">' + rows.map(function (r) {
      var size = r.size === "large" ? "Large" : "Small";
      var paid = !!r.paid_at;
      var line;
      if (r.locker_number) {
        line = "Locker " + r.locker_number + " is yours." + (paid ? " Paid." : " Payment is still open.");
      } else if (paid) {
        line = "Paid. You are number " + (r.queue_position || "?") + " for a " + size.toLowerCase() + " locker. An officer will assign the number.";
      } else if (r.queue_position) {
        line = "You are number " + r.queue_position + " in line for a " + size.toLowerCase() + " locker.";
      } else {
        line = size + " locker.";
      }
      var badge = paid ? "paid" : (r.status || "queued");
      var label = paid && r.status === "queued" ? "paid" : (r.status || "queued");
      return '<li class="data-row"><b>' + esc(size) + '</b> · ' + esc(line) +
        ' <span class="badge ' + esc(badge) + '">' + esc(label) + '</span></li>';
    }).join("") + "</ul>";
  }

  async function loadMember() {
    var seq = ++memberSeq;
    var urls = defaultUrls();
    var counts = { small: null, large: null };
    var mine = [];
    var held = [];
    var availError = false;
    var loadError = false;
    var client = sb();
    if (!client) {
      if (seq !== memberSeq) return;
      currentUrls = urls;
      paintCounts(counts);
      paintPay(urls, counts);
      paintHeld([]);
      paintMine([]);
      return;
    }
    try {
      var settings = await client.from("locker_settings").select("key,value");
      if (settings && !settings.error && settings.data) applySettings(settings.data, urls);
      var avail = await client.rpc("locker_availability");
      if (avail && avail.error) {
        availError = true;
      } else if (avail && avail.data) {
        counts.small = Number(avail.data.small);
        counts.large = Number(avail.data.large);
        if (!isFinite(counts.small)) counts.small = null;
        if (!isFinite(counts.large)) counts.large = null;
      }
      var mineRes = await client.rpc("my_locker_reservations");
      if (mineRes && !mineRes.error && Array.isArray(mineRes.data)) mine = mineRes.data;
      var heldRes = await client.rpc("my_held_lockers");
      if (heldRes && !heldRes.error && Array.isArray(heldRes.data)) held = heldRes.data;
    } catch (e) {
      loadError = true;
    }
    if (seq !== memberSeq) return;
    if (loadError) show("lkMsg", "Could not load locker availability.", "error");
    else if (availError) show("lkMsg", "Locker counts are not available yet. An officer still needs to apply the locker update in Supabase.", "error");
    currentUrls = urls;
    paintCounts(counts);
    paintPay(urls, counts);
    paintHeld(held);
    paintMine(mine);
  }

  window.kosLoadLockers = loadMember;

  function payUrl(size) {
    var key = size === "large" ? "large" : "small";
    return (currentUrls && currentUrls[key]) || ZEFFY[key].url;
  }

  function renewalMessage(numbers, size, clicked) {
    var label = size === "large" ? "large" : "small";
    var list = joinList(numbers);
    if (numbers.length >= 2) {
      return "Renewal saved for " + list + ". Finish payment on Zeffy. Set the quantity to " +
        numbers.length + " to cover all " + numbers.length + " " + label +
        " lockers. If you set a smaller quantity, " + clicked + " is marked paid first.";
    }
    return "Renewal saved for " + list + ". Finish payment on Zeffy.";
  }

  async function renewLockers(button, popup) {
    var client = sb();
    var clickedId = button.getAttribute("data-renew-locker");
    var size = button.getAttribute("data-renew-size") === "large" ? "large" : "small";
    var group = heldRows.filter(function (row) {
      var rowSize = row.size === "large" ? "large" : "small";
      return needsRenewal(row) && rowSize === size;
    });
    var primary = null;
    group.forEach(function (row) {
      if (!primary && String(row.id) === String(clickedId)) primary = row;
    });
    if (!primary) primary = group[0] || null;
    var ordered = [];
    if (primary) ordered.push(primary);
    group.forEach(function (row) {
      if (!primary || String(row.id) !== String(primary.id)) ordered.push(row);
    });
    var ids = ordered.map(function (row) { return row.id; });
    if (!ids.length) {
      if (popup) { try { popup.close(); } catch (e0) {} }
      show("lockerRenewMsg", "Choose a locker to renew.", "error");
      return;
    }
    if (!client || !client.rpc) {
      if (popup) { try { popup.close(); } catch (e1) {} }
      show("lockerRenewMsg", "Sign in to renew a locker.", "error");
      return;
    }
    var buttons = document.querySelectorAll("#lockerHeld [data-renew-locker]");
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = true; });
    var result;
    try {
      result = await client.rpc("member_request_locker_renewal", { p_locker_ids: ids });
    } catch (e2) {
      result = { error: e2 };
    }
    Array.prototype.forEach.call(buttons, function (b) { b.disabled = false; });
    if (!result || result.error || !result.data || result.data.ok === false) {
      if (popup) { try { popup.close(); } catch (e3) {} }
      show("lockerRenewMsg",
        (result && result.data && result.data.message) ||
        (result && result.error && result.error.message) ||
        "Could not save your renewal. Please try again.",
        "error");
      return;
    }
    var numbers = Array.isArray(result.data.locker_numbers) ? result.data.locker_numbers.slice() : [];
    if (!numbers.length && primary) numbers = [primary.locker_number];
    var url = payUrl(size);
    show("lockerRenewMsg", renewalMessage(numbers, size, primary ? primary.locker_number : numbers[0]), "success");
    if (popup) {
      try {
        popup.opener = null;
        popup.location.href = url;
      } catch (e4) {
        try { popup.close(); } catch (e6) {}
        window.location.href = url;
      }
    } else {
      window.location.href = url;
    }
    try { await loadMember(); } catch (e5) {}
  }

  function bindMember() {
    if (bound) return;
    var form = document.getElementById("lockerForm");
    var pay = document.getElementById("lockerPay");
    if (!form || !pay) return;
    bound = true;
    pay.addEventListener("click", function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
      if (a && a.getAttribute("aria-disabled") === "true") ev.preventDefault();
    });
    var heldBox = document.getElementById("lockerHeld");
    if (heldBox) {
      heldBox.addEventListener("click", function (ev) {
        var button = ev.target && ev.target.closest ? ev.target.closest("[data-renew-locker]") : null;
        if (!button || button.disabled) return;
        ev.preventDefault();
        var popup = null;
        try { popup = window.open("about:blank", "_blank"); } catch (e) { popup = null; }
        renewLockers(button, popup);
      });
    }
    form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var client = sb();
      var idn = identity();
      var name = idn.name || (document.getElementById("lkName").value || "").trim();
      var email = idn.email || (document.getElementById("lkEmail").value || "").trim();
      var size = document.getElementById("lkSize").value;
      var notes = (document.getElementById("lkNotes").value || "").trim();
      if (!name) {
        show("lkMsg", "Please enter your name.", "error");
        return;
      }
      if (size !== "small" && size !== "large") {
        show("lkMsg", "Choose a small or large locker.", "error");
        return;
      }
      if (!client || !client.auth || !client.from) {
        show("lkMsg", "Sign in to join the locker list.", "error");
        return;
      }
      var session = null;
      try {
        var sess = await client.auth.getSession();
        session = sess && sess.data && sess.data.session;
      } catch (e) {
        session = null;
      }
      if (!session) {
        show("lkMsg", "Sign in to join the locker list.", "error");
        return;
      }
      var payload = {
        requester_name: name,
        requester_email: email || null,
        size: size,
        notes: notes || null,
        status: "queued"
      };
      if (idn.memberId) payload.member_id = idn.memberId;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      var result;
      try {
        result = await client.from("locker_reservations").insert(payload);
      } catch (e2) {
        result = { error: e2 };
      }
      if (btn) btn.disabled = false;
      if (result && result.error) {
        var code = result.error.code || "";
        var msg = (result.error.message || "").toLowerCase();
        if (code === "23505" || msg.indexOf("duplicate") !== -1 || msg.indexOf("unique") !== -1) {
          show("lkMsg", "You are already on the list for that size.", "error");
        } else {
          show("lkMsg", "Could not join the list. Please try again.", "error");
        }
        return;
      }
      show("lkMsg", "You are on the list. Pay with the matching Zeffy link when that size is available.", "success");
      form.reset();
      if (typeof window.prefillIdentity === "function") window.prefillIdentity();
      var nameEl = document.getElementById("lkName");
      var emailEl = document.getElementById("lkEmail");
      if (nameEl && idn.name) {
        nameEl.value = idn.name;
        nameEl.readOnly = true;
      }
      if (emailEl && idn.email) {
        emailEl.value = idn.email;
        emailEl.readOnly = true;
      }
      document.getElementById("lkSize").value = size;
      await loadMember();
    });
  }

  function lockerRank(n) {
    var m = /^([A-Za-z]+)(\d+)$/.exec(n || "");
    if (!m) return [9, "", 0];
    var p = m[1].toUpperCase();
    return [p === "LL" ? 0 : p === "RL" ? 1 : p === "RS" ? 2 : 3, p, parseInt(m[2], 10)];
  }

  function compareLockers(a, b) {
    var A = lockerRank(a.locker_number);
    var B = lockerRank(b.locker_number);
    return A[0] - B[0] || A[2] - B[2] || String(a.locker_number || "").localeCompare(String(b.locker_number || ""));
  }

  function setOfficerMsg(text, kind) {
    var m = document.getElementById("hubLockerMsg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "hub-ei-msg" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
  }

  function officerHtml() {
    return '' +
      '<div class="app-head"><span class="ic">🔑</span><div><h2>Lockers</h2>' +
      '<small>One list of assignments, payments, and the waiting list</small></div></div>' +
      '<div class="app-body hub-ei" id="hubLockerBody">' +
      '<p class="hub-ei-note">Each locker is listed once. Paid date and amount come from the linked payment. Comp is its own status. The waiting list is people who do not have a locker yet.</p>' +
      '<div class="locker-desk-summary" id="hubLockerSummary"></div>' +
      '<div class="locker-desk-actions">' +
      '<button class="btn btn-primary" type="button" id="hubLockerAssign">Assign a locker</button> ' +
      '<button class="btn btn-primary" type="button" id="hubLockerCsv">Download CSV</button> ' +
      '<button class="btn" type="button" id="hubLockerPrint">Print</button></div>' +
      '<div class="locker-desk-panel" id="hubLockerPanel" hidden>' +
      '<h3 id="hubLockerPanelTitle">Assign a locker</h3>' +
      '<div id="hubLockerPanelBody"></div>' +
      '<p class="locker-warn" id="hubLockerPanelWarn" hidden></p>' +
      '<label class="locker-confirm" id="hubLockerPanelConfirmWrap" hidden>' +
      '<input type="checkbox" id="hubLockerPanelConfirm"> Assign this size anyway</label>' +
      '<div class="locker-desk-actions"><button class="btn btn-primary" type="button" id="hubLockerPanelSave">Save</button> ' +
      '<button class="btn" type="button" id="hubLockerPanelCancel">Cancel</button></div></div>' +
      '<div class="rpt-tablewrap"><table class="rpt-table" id="hubLockerTable"><thead><tr>' +
      '<th>Locker</th><th>Size</th><th>Holder</th><th>Status</th><th>Paid date</th><th>Amount</th><th>Payment source</th><th></th>' +
      '</tr></thead><tbody id="hubLockerRows"></tbody></table></div>' +
      '<h3 class="locker-subhead">Waiting list</h3>' +
      '<p class="hub-ei-note">Paid is yes only when a payment is linked.</p>' +
      '<div class="rpt-tablewrap"><table class="rpt-table" id="hubLockerWaitingTable"><thead><tr>' +
      '<th>Name</th><th>Size</th><th>Paid</th><th>Paid date</th><th>Amount</th><th>Payment source</th><th></th>' +
      '</tr></thead><tbody id="hubLockerWaiting"></tbody></table></div>' +
      '<details class="locker-settings" id="hubLockerSettings">' +
      '<summary>Zeffy pay links</summary>' +
      '<div class="hub-ei-grid">' +
      '<div><label for="hubLockerSmallUrl">Small $75</label><input id="hubLockerSmallUrl" type="url"></div>' +
      '<div><label for="hubLockerLargeUrl">Large $200</label><input id="hubLockerLargeUrl" type="url"></div></div>' +
      '<p class="hub-ei-note" id="hubLockerCampaigns"></p>' +
      '<button class="btn btn-primary" type="button" id="hubLockerSaveUrls">Save pay links</button></details>' +
      '<p class="hub-ei-msg" id="hubLockerMsg" aria-live="polite"></p>' +
      '</div>';
  }

  var lockerFixture = null;
  var board = null;
  var panelMode = null;

  function ensureOfficerCard() {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;
    var card = document.getElementById("hubLockers");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubLockers";
      panel.appendChild(card);
    }
    if (card.getAttribute("data-locker-ready") === "1" && document.getElementById("hubLockerRows")) return card;
    card.setAttribute("data-locker-ready", "1");
    card.innerHTML = officerHtml();
    document.getElementById("hubLockerAssign").addEventListener("click", function () { openPanel("assign"); });
    document.getElementById("hubLockerCsv").addEventListener("click", downloadLockerCsv);
    document.getElementById("hubLockerPrint").addEventListener("click", printLockerReport);
    document.getElementById("hubLockerPanelSave").addEventListener("click", savePanel);
    document.getElementById("hubLockerPanelCancel").addEventListener("click", closePanel);
    document.getElementById("hubLockerSaveUrls").addEventListener("click", saveUrls);
    card.addEventListener("click", onOfficerClick);
    card.addEventListener("change", onOfficerChange);
    return card;
  }

  function statusLabel(row) {
    var map = {
      available: "Available",
      assigned: "Assigned",
      pending_payment: "Pending payment",
      comp: "Comp",
      waiting: "Waiting"
    };
    var label = map[row.status] || row.status || "";
    if (row.unverified) label += ", unverified";
    if (row.renewal_open) label += ", renewal open";
    return label;
  }

  function money(cents) {
    if (cents == null || cents === "") return "";
    var n = Number(cents);
    if (!isFinite(n)) return "";
    return (n / 100).toFixed(2);
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function summarize(lockers, waiting) {
    function blank(size) {
      return { size: size, total: 0, assigned: 0, available: 0, paid: 0, unpaid: 0, comp: 0, waiting: 0 };
    }
    var box = { large: blank("large"), small: blank("small") };
    (lockers || []).forEach(function (row) {
      var b = box[row.size];
      if (!b) return;
      b.total += 1;
      if (row.status === "comp") b.comp += 1;
      else if (row.status === "available") b.available += 1;
      else if (row.status === "assigned" || row.status === "pending_payment") {
        b.assigned += 1;
        if (row.status === "assigned" || row.paid) b.paid += 1;
        else b.unpaid += 1;
      }
    });
    (waiting || []).forEach(function (row) {
      if (box[row.size]) box[row.size].waiting += 1;
    });
    return [box.large, box.small];
  }

  function paintSummary(summary) {
    var host = document.getElementById("hubLockerSummary");
    if (!host) return;
    var rows = summary && summary.length ? summary : [];
    host.innerHTML = rows.map(function (row) {
      var bits = [
        ["Total", row.total],
        ["Assigned", row.assigned],
        ["Available", row.available],
        ["Paid", row.paid],
        ["Unpaid", row.unpaid],
        ["Comp", row.comp],
        ["Waiting", row.waiting]
      ];
      return '<section class="locker-desk-card"><h3>' + esc(row.size === "large" ? "Large" : "Small") + '</h3><div class="locker-desk-stats">' +
        bits.map(function (bit) {
          return '<div class="locker-desk-stat"><b>' + esc(bit[1] == null ? "0" : bit[1]) + '</b><span>' + esc(bit[0]) + '</span></div>';
        }).join("") + '</div></section>';
    }).join("");
  }

  function rowActions(row) {
    if (row.status === "available") return "";
    var html = '<div class="locker-row-actions">';
    html += '<button type="button" class="btn" data-act="move" data-locker="' + esc(row.locker_number) + '">Change</button>';
    if (row.status !== "comp") {
      html += '<button type="button" class="btn" data-act="pay" data-locker="' + esc(row.locker_number) + '">Payment</button>';
      html += '<button type="button" class="btn" data-act="comp" data-locker="' + esc(row.locker_number) + '" data-holder="' + esc(row.holder_name || "") + '">Comp</button>';
    }
    html += '<button type="button" class="btn" data-act="free" data-id="' + esc(row.id) + '">Free</button>';
    return html + "</div>";
  }

  function paintBoard(model) {
    ensureOfficerCard();
    board = model || { lockers: [], waiting: [], urls: defaultUrls() };
    var urls = board.urls || defaultUrls();
    var smallUrl = document.getElementById("hubLockerSmallUrl");
    var largeUrl = document.getElementById("hubLockerLargeUrl");
    if (smallUrl) smallUrl.value = urls.small || "";
    if (largeUrl) largeUrl.value = urls.large || "";
    var camps = document.getElementById("hubLockerCampaigns");
    if (camps) camps.textContent = (urls.smallCampaign || "") + " · " + (urls.largeCampaign || "");
    paintSummary(board.summary && board.summary.length ? board.summary : summarize(board.lockers, board.waiting));
    var lockers = (board.lockers || []).slice().sort(compareLockers);
    var body = document.getElementById("hubLockerRows");
    if (body) {
      body.innerHTML = lockers.length ? lockers.map(function (row) {
        var flags = "";
        if (row.size_mismatch) flags += ' <span class="badge">Asked for ' + esc(row.reserved_size || "other") + '</span>';
        return "<tr><td>" + esc(row.locker_number) + "</td><td>" + esc(row.size) + "</td><td>" +
          esc(row.status === "available" ? "Open" : (row.holder_name || "")) + flags + "</td><td>" +
          esc(statusLabel(row)) + "</td><td>" + esc(row.status === "comp" ? "" : formatWhen(row.paid_at)) + "</td><td>" +
          esc(row.status === "comp" ? "" : money(row.amount_cents)) + "</td><td>" +
          esc(row.status === "comp" ? "" : (row.source || "")) + "</td><td>" + rowActions(row) + "</td></tr>";
      }).join("") : '<tr><td colspan="8">No lockers yet. Apply sql/kos_locker_desk.sql in Supabase.</td></tr>';
    }
    var wait = document.getElementById("hubLockerWaiting");
    var waiting = board.waiting || [];
    if (wait) {
      wait.innerHTML = waiting.length ? waiting.map(function (row) {
        return "<tr><td>" + esc(row.holder_name || "Name missing") + "</td><td>" + esc(row.size) + "</td><td>" +
          (row.paid ? "Yes" : "No") + "</td><td>" + esc(formatWhen(row.paid_at)) + "</td><td>" +
          esc(money(row.amount_cents)) + "</td><td>" + esc(row.source || "") + "</td><td>" +
          '<button type="button" class="btn btn-primary" data-act="assign-wait" data-reservation="' + esc(row.id) + '">Assign</button></td></tr>';
      }).join("") : '<tr><td colspan="7">Nobody is waiting.</td></tr>';
    }
  }

  function csvValue(v) {
    v = v == null ? "" : String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function reportRows() {
    var rows = [];
    (board && board.lockers || []).slice().sort(compareLockers).forEach(function (row) {
      rows.push([
        row.locker_number || "",
        row.status === "available" ? "" : (row.holder_name || ""),
        row.size || "",
        statusLabel(row),
        row.status === "available" ? "" : formatWhen(row.assigned_at),
        row.status === "comp" || row.status === "available" ? "" : formatWhen(row.paid_at),
        row.status === "comp" || row.status === "available" ? "" : money(row.amount_cents),
        row.status === "comp" || row.status === "available" ? "" : (row.payment_id || ""),
        row.status === "comp" || row.status === "available" ? "" : (row.source || "")
      ]);
    });
    (board && board.waiting || []).forEach(function (row) {
      rows.push([
        "",
        row.holder_name || "",
        row.size || "",
        "Waiting",
        "",
        formatWhen(row.paid_at),
        money(row.amount_cents),
        row.payment_id || "",
        row.source || ""
      ]);
    });
    return rows;
  }

  function downloadLockerCsv() {
    var header = ["Locker", "Member", "Size", "Status", "Assigned date", "Paid date", "Amount", "Payment id", "Source"];
    var csvText = [header].concat(reportRows()).map(function (row) {
      return row.map(csvValue).join(",");
    }).join("\n");
    window.__kosLastLockerCsv = csvText;
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csvText], { type: "text/csv" }));
    a.download = "kos-locker-report.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function printLockerReport() {
    var w = window.open("", "_blank");
    if (!w) {
      setOfficerMsg("Your browser blocked the print window. Allow pop-ups for this site, then try again.", "err");
      return;
    }
    var body = reportRows().map(function (row) {
      return "<tr>" + row.map(function (cell) { return "<td>" + esc(cell) + "</td>"; }).join("") + "</tr>";
    }).join("");
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Krewe of Shamrock lockers</title>' +
      "<style>body{font-family:Georgia,serif;margin:28px;color:#14281d}h1{font-size:22px;margin:0 0 12px}" +
      "table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #999;padding:5px 6px;text-align:left}th{background:#e8f0e8}</style></head><body>" +
      "<h1>Krewe of Shamrock lockers</h1><table><thead><tr><th>Locker</th><th>Member</th><th>Size</th><th>Status</th><th>Assigned date</th><th>Paid date</th><th>Amount</th><th>Payment id</th><th>Source</th></tr></thead><tbody>" +
      body + "</tbody></table><script>window.onload=function(){window.print();}</" + "script></body></html>");
    w.document.close();
  }

  function openLockers(exceptNumber) {
    return (board && board.lockers || []).filter(function (row) {
      return row.status === "available" && row.locker_number !== exceptNumber;
    }).slice().sort(compareLockers);
  }

  function waitingById(id) {
    return (board && board.waiting || []).filter(function (row) { return String(row.id) === String(id); })[0] || null;
  }

  function lockerByNumber(num) {
    return (board && board.lockers || []).filter(function (row) { return row.locker_number === num; })[0] || null;
  }

  function closePanel() {
    panelMode = null;
    var panel = document.getElementById("hubLockerPanel");
    if (panel) panel.hidden = true;
  }

  function selectedSize() {
    var wait = document.getElementById("hubLockerWaitPick");
    var waiting = wait && wait.value ? waitingById(wait.value) : null;
    if (waiting) return waiting.size;
    var member = document.getElementById("hubLockerMemberId");
    if (member && member.value && board) {
      var mine = (board.waiting || []).filter(function (row) { return String(row.member_id) === String(member.value); });
      if (mine.length === 1) return mine[0].size;
    }
    var from = lockerByNumber(panelMode && panelMode.from);
    if (from) return from.size;
    return "";
  }

  function refreshSizeWarning() {
    var warn = document.getElementById("hubLockerPanelWarn");
    var wrap = document.getElementById("hubLockerPanelConfirmWrap");
    var box = document.getElementById("hubLockerPanelConfirm");
    if (!warn || !wrap) return;
    var pick = document.getElementById("hubLockerNumber");
    var locker = pick && pick.value ? lockerByNumber(pick.value) : null;
    var asked = selectedSize();
    var mismatch = locker && asked && locker.size !== asked;
    warn.hidden = !mismatch;
    wrap.hidden = !mismatch;
    if (!mismatch && box) box.checked = false;
    if (mismatch) {
      warn.textContent = "This person asked for a " + asked + " locker. " + locker.locker_number + " is " + locker.size + ".";
    }
  }

  function lockerOptions(asked) {
    var open = openLockers();
    function opts(list) {
      return list.map(function (row) {
        return '<option value="' + esc(row.locker_number) + '">' + esc(row.locker_number) + " · " + esc(row.size) + "</option>";
      }).join("");
    }
    var match = open.filter(function (row) { return !asked || row.size === asked; });
    var other = open.filter(function (row) { return asked && row.size !== asked; });
    return '<option value="">Choose an open locker</option>' +
      (match.length ? '<optgroup label="Matching size">' + opts(match) + "</optgroup>" : "") +
      (other.length ? '<optgroup label="Other size">' + opts(other) + "</optgroup>" : "") +
      (!asked ? opts(open) : "");
  }

  function openPanel(mode, extra) {
    extra = extra || {};
    panelMode = { mode: mode, from: extra.locker || "", reservationId: extra.reservation || "", holder: extra.holder || "" };
    var preset = waitingById(extra.reservation);
    var presetSize = preset ? preset.size : "";
    if (!presetSize && extra.locker) {
      var presetLocker = lockerByNumber(extra.locker);
      if (presetLocker) presetSize = presetLocker.size;
    }
    var panel = document.getElementById("hubLockerPanel");
    var title = document.getElementById("hubLockerPanelTitle");
    var body = document.getElementById("hubLockerPanelBody");
    if (!panel || !body) return;
    panel.hidden = false;
    var html = "";
    if (mode === "assign") {
      title.textContent = "Assign a locker";
      var waits = board && board.waiting || [];
      html += '<label for="hubLockerWaitPick">Waiting list</label><select id="hubLockerWaitPick"><option value="">Choose a waiting list entry</option>' +
        waits.map(function (row) {
          var selected = String(row.id) === String(extra.reservation) ? " selected" : "";
          return '<option value="' + esc(row.id) + '"' + selected + ">" + esc(row.holder_name) + " · " + esc(row.size) + (row.paid ? " · paid" : "") + "</option>";
        }).join("") + "</select>";
      html += '<label for="hubLockerRosterSearch">Or find a roster member</label><input id="hubLockerRosterSearch" type="search" placeholder="Name" autocomplete="off">';
      html += '<div id="hubLockerRosterPick"></div><input type="hidden" id="hubLockerMemberId" value="">';
      html += '<p id="hubLockerPicked">No roster member selected.</p>';
      html += '<label for="hubLockerNumber">Open locker</label><select id="hubLockerNumber">' + lockerOptions(presetSize) + "</select>";
    } else if (mode === "move") {
      title.textContent = "Change locker";
      html += "<p>Moving the holder of " + esc(extra.locker) + ".</p>";
      html += '<label for="hubLockerNumber">New open locker</label><select id="hubLockerNumber">' + lockerOptions(presetSize) + "</select>";
    } else if (mode === "comp") {
      title.textContent = "Mark as comp";
      html += '<label for="hubLockerCompName">Holder name</label><input id="hubLockerCompName" type="text" maxlength="120" value="' + esc(extra.holder || "") + '">';
    } else if (mode === "pay") {
      title.textContent = "Payment for " + (extra.locker || "the waiting list");
      html += '<label for="hubLockerPaySearch">Find a Zeffy payment</label><input id="hubLockerPaySearch" type="search" placeholder="Name">';
      html += '<div id="hubLockerPayPick"></div><input type="hidden" id="hubLockerPaymentId" value="">';
      html += "<h4>Or record an off-Zeffy payment</h4>";
      html += '<label for="hubLockerPaidOn">Date received</label><input id="hubLockerPaidOn" type="date">';
      html += '<label for="hubLockerAmount">Amount (USD)</label><input id="hubLockerAmount" type="number" min="0.01" step="0.01">';
      html += '<label for="hubLockerPayNote">Note (required)</label><input id="hubLockerPayNote" type="text" maxlength="500">';
    }
    body.innerHTML = html;
    refreshSizeWarning();
    var search = document.getElementById("hubLockerRosterSearch");
    if (search) search.addEventListener("input", searchRoster);
    var paySearch = document.getElementById("hubLockerPaySearch");
    if (paySearch) paySearch.addEventListener("input", searchPayments);
  }

  function paintRoster(members) {
    var box = document.getElementById("hubLockerRosterPick");
    if (!box) return;
    if (!members || !members.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = members.map(function (m) {
      var name = ((m.first_name || "") + " " + (m.last_name || "")).trim() || "Member";
      return '<button type="button" class="btn" data-roster-id="' + esc(m.id) + '" data-roster-name="' + esc(name) + '">' + esc(name) + "</button>";
    }).join(" ");
  }

  async function searchRoster() {
    var input = document.getElementById("hubLockerRosterSearch");
    var q = (input && input.value || "").trim().toLowerCase();
    if (lockerFixture) {
      paintRoster((lockerFixture.roster || []).filter(function (m) {
        var hay = ((m.first_name || "") + " " + (m.last_name || "")).toLowerCase();
        return !q || hay.indexOf(q) >= 0;
      }).slice(0, 20));
      return;
    }
    var client = sb();
    if (!client || q.length < 1) { paintRoster([]); return; }
    try {
      var res = await client.rpc("officer_search_roster", { p_q: q, p_limit: 20 });
      paintRoster((res && res.data && res.data.members) || []);
    } catch (e) {
      paintRoster([]);
    }
  }

  function paintPayments(rows) {
    var box = document.getElementById("hubLockerPayPick");
    if (!box) return;
    box.innerHTML = (rows || []).map(function (row) {
      var label = (row.payer_name || "Name missing") + " · " + formatWhen(row.created_at) + " · " + money(row.amount_cents) + " · " + (row.source || "");
      if (row.linked_locker_number) label += " · linked to " + row.linked_locker_number;
      return '<button type="button" class="btn" data-payment-id="' + esc(row.id) + '">' + esc(label) + "</button>";
    }).join(" ");
  }

  async function searchPayments() {
    var q = (document.getElementById("hubLockerPaySearch").value || "").trim().toLowerCase();
    if (lockerFixture) {
      paintPayments((lockerFixture.payments || []).filter(function (row) {
        return !q || String(row.payer_name || "").toLowerCase().indexOf(q) >= 0;
      }));
      return;
    }
    var client = sb();
    if (!client) return;
    try {
      var res = await client.rpc("officer_locker_find_payments", { p_query: q });
      paintPayments((res && res.data && res.data.payments) || []);
    } catch (e2) {
      paintPayments([]);
    }
  }

  function onOfficerChange(ev) {
    var t = ev.target;
    if (!t) return;
    if (t.id === "hubLockerWaitPick" || t.id === "hubLockerNumber") {
      if (t.id === "hubLockerWaitPick") {
        var number = document.getElementById("hubLockerNumber");
        if (number) number.innerHTML = lockerOptions(selectedSize());
      }
      refreshSizeWarning();
    }
  }

  function onOfficerClick(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute("data-roster-id")) {
      document.getElementById("hubLockerMemberId").value = t.getAttribute("data-roster-id");
      document.getElementById("hubLockerPicked").textContent = "Selected: " + (t.getAttribute("data-roster-name") || "member");
      var number = document.getElementById("hubLockerNumber");
      if (number) number.innerHTML = lockerOptions(selectedSize());
      refreshSizeWarning();
      return;
    }
    if (t.getAttribute("data-payment-id")) {
      document.getElementById("hubLockerPaymentId").value = t.getAttribute("data-payment-id");
      setOfficerMsg("Payment selected.", "ok");
      return;
    }
    var act = t.getAttribute("data-act");
    if (!act) return;
    ev.preventDefault();
    if (act === "assign-wait") openPanel("assign", { reservation: t.getAttribute("data-reservation") });
    else if (act === "move") openPanel("move", { locker: t.getAttribute("data-locker") });
    else if (act === "comp") openPanel("comp", { locker: t.getAttribute("data-locker"), holder: t.getAttribute("data-holder") });
    else if (act === "pay") openPanel("pay", { locker: t.getAttribute("data-locker") });
    else if (act === "free") freeLocker(t.getAttribute("data-id"));
  }

  function rpcFailed(res) {
    return !res || res.error || !res.data || res.data.ok === false;
  }

  function rpcMessage(res, fallback) {
    return (res && res.data && res.data.message) || (res && res.error && res.error.message) || fallback;
  }

  async function callOfficer(name, args) {
    if (lockerFixture) return fixtureCall(name, args);
    var client = sb();
    if (!client) return { data: { ok: false, message: "Not signed in." } };
    try {
      return await client.rpc(name, args);
    } catch (e) {
      return { error: e };
    }
  }

  function fixtureCall(name, args) {
    args = args || {};
    if (name === "officer_locker_assign") return { data: fixtureAssign(args) };
    if (name === "officer_locker_move") return { data: fixtureMove(args) };
    if (name === "officer_locker_free") return { data: fixtureFree(args) };
    if (name === "officer_locker_mark_comp") return { data: fixtureComp(args) };
    if (name === "officer_locker_link_payment") return { data: fixtureLink(args) };
    if (name === "officer_locker_record_payment") return { data: fixtureRecord(args) };
    return { data: { ok: false, message: "Not available in the preview." } };
  }

  function fixtureRefresh() {
    lockerFixture.summary = summarize(lockerFixture.lockers, lockerFixture.waiting);
    board = lockerFixture;
    paintBoard(lockerFixture);
  }

  function fixtureAssign(args) {
    var waiting = args.p_reservation_id ? waitingById(args.p_reservation_id) : null;
    var memberId = args.p_member_id || (waiting && waiting.member_id);
    var name = waiting && waiting.holder_name;
    if (!name && memberId) {
      var person = (lockerFixture.roster || []).filter(function (m) { return String(m.id) === String(memberId); })[0];
      name = person ? ((person.first_name || "") + " " + (person.last_name || "")).trim() : "";
    }
    if (!name) return { ok: false, message: "Choose a roster member or someone on the waiting list." };
    var locker = lockerByNumber(args.p_locker_number);
    if (!locker || locker.status !== "available") return { ok: false, message: "That locker is not open." };
    var asked = waiting && waiting.size;
    if (asked && asked !== locker.size && !args.p_confirm_size) {
      return { ok: false, code: "size_mismatch", message: "This person asked for a " + asked + " locker. " + locker.locker_number + " is " + locker.size + ". Confirm to assign it anyway." };
    }
    var held = (lockerFixture.lockers || []).filter(function (row) {
      return row.member_id && String(row.member_id) === String(memberId) && row.status !== "available";
    })[0];
    if (held) return { ok: false, message: "This member already has locker " + held.locker_number + ". Change their locker instead." };
    var sameSize = !asked || asked === locker.size;
    locker.member_id = memberId || null;
    locker.holder_name = name;
    locker.assigned_at = locker.assigned_at || "2026-11-01T16:00:00Z";
    locker.payment_id = sameSize && waiting ? waiting.payment_id : null;
    locker.paid_at = sameSize && waiting ? waiting.paid_at : null;
    locker.amount_cents = sameSize && waiting ? waiting.amount_cents : null;
    locker.source = sameSize && waiting ? waiting.source : "";
    locker.paid = !!(locker.payment_id);
    locker.status = locker.paid ? "assigned" : "pending_payment";
    locker.size_mismatch = !!(asked && asked !== locker.size);
    locker.reserved_size = locker.size_mismatch ? asked : null;
    locker.unverified = false;
    if (waiting) lockerFixture.waiting = lockerFixture.waiting.filter(function (row) { return row.id !== waiting.id; });
    fixtureRefresh();
    return { ok: true, message: "Assigned " + locker.locker_number + " to " + name + "." };
  }

  function fixtureMove(args) {
    var from = lockerByNumber(args.p_from_locker_number);
    var to = lockerByNumber(args.p_to_locker_number);
    if (!from || !to) return { ok: false, message: "No locker with that number." };
    if (to.status !== "available") return { ok: false, message: "The new locker is not open." };
    if (from.size !== to.size && !args.p_confirm_size) {
      return { ok: false, code: "size_mismatch", message: from.locker_number + " is " + from.size + ". " + to.locker_number + " is " + to.size + ". Confirm to move anyway." };
    }
    var same = from.size === to.size;
    to.holder_name = from.holder_name;
    to.member_id = from.member_id;
    to.assigned_at = from.assigned_at;
    to.status = from.status === "comp" ? "comp" : (same && from.payment_id ? "assigned" : "pending_payment");
    to.payment_id = from.status === "comp" || !same ? null : from.payment_id;
    to.paid_at = to.payment_id ? from.paid_at : null;
    to.amount_cents = to.payment_id ? from.amount_cents : null;
    to.source = to.payment_id ? from.source : "";
    to.paid = to.status === "assigned";
    to.unverified = same ? from.unverified : false;
    to.size_mismatch = from.size_mismatch;
    to.reserved_size = from.reserved_size;
    from.holder_name = null;
    from.member_id = null;
    from.status = "available";
    from.payment_id = null;
    from.paid_at = null;
    from.amount_cents = null;
    from.source = "";
    from.paid = false;
    from.unverified = false;
    from.size_mismatch = false;
    from.assigned_at = null;
    fixtureRefresh();
    return { ok: true, message: "Moved " + to.holder_name + " from " + from.locker_number + " to " + to.locker_number + "." };
  }

  function fixtureFree(args) {
    var locker = (lockerFixture.lockers || []).filter(function (row) { return String(row.id) === String(args.p_locker_id); })[0];
    if (!locker) return { ok: false, message: "Locker not found." };
    if (locker.holder_name && locker.status !== "comp") {
      lockerFixture.waiting.push({
        id: "wait-" + locker.id,
        member_id: locker.member_id,
        holder_name: locker.holder_name,
        size: locker.size,
        status: "waiting",
        paid: !!locker.payment_id,
        paid_at: locker.paid_at,
        amount_cents: locker.amount_cents,
        payment_id: locker.payment_id,
        source: locker.source
      });
    }
    var number = locker.locker_number;
    locker.holder_name = null;
    locker.member_id = null;
    locker.status = "available";
    locker.payment_id = null;
    locker.paid_at = null;
    locker.amount_cents = null;
    locker.source = "";
    locker.paid = false;
    locker.unverified = false;
    locker.size_mismatch = false;
    fixtureRefresh();
    return { ok: true, message: number + " is open." };
  }

  function fixtureComp(args) {
    var locker = lockerByNumber(args.p_locker_number);
    var name = (args.p_holder_name || "").trim();
    if (!locker) return { ok: false, message: "No locker with that number." };
    if (!name || name.indexOf("@") >= 0) return { ok: false, message: "Enter the comp holder name." };
    locker.holder_name = name;
    locker.status = "comp";
    locker.payment_id = null;
    locker.paid_at = null;
    locker.amount_cents = null;
    locker.source = "";
    locker.paid = false;
    locker.unverified = false;
    fixtureRefresh();
    return { ok: true, message: locker.locker_number + " is a comp locker for " + name + "." };
  }

  function fixtureLink(args) {
    var pay = (lockerFixture.payments || []).filter(function (row) { return String(row.id) === String(args.p_payment_id); })[0];
    if (!pay) return { ok: false, message: "That payment was not found." };
    var locker = lockerByNumber(args.p_locker_number);
    if (!locker) return { ok: false, message: "Choose a locker or a waiting list row." };
    if (locker.status === "comp") return { ok: false, message: "A comp locker does not take a payment." };
    locker.payment_id = pay.id;
    locker.paid_at = pay.created_at;
    locker.amount_cents = pay.amount_cents;
    locker.source = pay.source || "Zeffy";
    locker.paid = true;
    locker.status = "assigned";
    locker.unverified = false;
    fixtureRefresh();
    return { ok: true, message: "Payment linked. The paid date is the payment date." };
  }

  function fixtureRecord(args) {
    var note = (args.p_note || "").trim();
    if (!note) return { ok: false, message: "A note is required for an off-Zeffy payment." };
    if (!args.p_paid_on) return { ok: false, message: "Enter the date the payment was received." };
    if (!args.p_amount_cents || args.p_amount_cents <= 0) return { ok: false, message: "Enter the amount in dollars. Use Mark as comp for a locker that is not charged." };
    var locker = lockerByNumber(args.p_locker_number);
    if (!locker || !locker.holder_name) return { ok: false, message: "Assign a named holder before recording a payment." };
    var id = "pay-" + Date.now();
    locker.payment_id = id;
    locker.paid_at = args.p_paid_on + "T16:00:00Z";
    locker.amount_cents = args.p_amount_cents;
    locker.source = "Off Zeffy";
    locker.paid = true;
    locker.status = "assigned";
    locker.unverified = false;
    lockerFixture.payments = lockerFixture.payments || [];
    lockerFixture.payments.push({ id: id, payer_name: locker.holder_name, amount_cents: args.p_amount_cents, created_at: locker.paid_at, source: "Off Zeffy", description: note });
    fixtureRefresh();
    return { ok: true, message: "Off-Zeffy payment recorded for " + locker.holder_name + "." };
  }

  async function savePanel() {
    if (!panelMode) return;
    var confirmBox = document.getElementById("hubLockerPanelConfirm");
    var confirmed = !!(confirmBox && confirmBox.checked);
    var numberEl = document.getElementById("hubLockerNumber");
    var number = numberEl ? numberEl.value : "";
    var result;
    if (panelMode.mode === "assign") {
      var wait = document.getElementById("hubLockerWaitPick");
      var member = document.getElementById("hubLockerMemberId");
      var reservationId = wait && wait.value ? wait.value : null;
      if (!reservationId && member && member.value && board) {
        var mine = (board.waiting || []).filter(function (row) { return String(row.member_id) === String(member.value); });
        if (mine.length === 1) reservationId = mine[0].id;
      }
      if (!number) { setOfficerMsg("Choose an open locker.", "err"); return; }
      if (selectedSize() && lockerByNumber(number) && lockerByNumber(number).size !== selectedSize() && !confirmed) {
        refreshSizeWarning();
        setOfficerMsg("Check the box to assign a different size.", "err");
        return;
      }
      result = await callOfficer("officer_locker_assign", {
        p_member_id: member && member.value ? member.value : null,
        p_reservation_id: reservationId,
        p_locker_number: number,
        p_confirm_size: confirmed
      });
    } else if (panelMode.mode === "move") {
      if (!number) { setOfficerMsg("Choose an open locker.", "err"); return; }
      result = await callOfficer("officer_locker_move", {
        p_from_locker_number: panelMode.from,
        p_to_locker_number: number,
        p_confirm_size: confirmed
      });
    } else if (panelMode.mode === "comp") {
      result = await callOfficer("officer_locker_mark_comp", {
        p_locker_number: panelMode.from,
        p_holder_name: (document.getElementById("hubLockerCompName").value || "").trim()
      });
    } else if (panelMode.mode === "pay") {
      var paymentId = (document.getElementById("hubLockerPaymentId").value || "").trim();
      var note = (document.getElementById("hubLockerPayNote").value || "").trim();
      var paidOn = (document.getElementById("hubLockerPaidOn").value || "").trim();
      var amountRaw = (document.getElementById("hubLockerAmount").value || "").trim();
      if (paymentId) {
        result = await callOfficer("officer_locker_link_payment", {
          p_payment_id: paymentId,
          p_locker_number: panelMode.from || null,
          p_reservation_id: panelMode.reservationId || null
        });
      } else {
        if (!note) { setOfficerMsg("A note is required for an off-Zeffy payment.", "err"); return; }
        var dollars = Number(amountRaw);
        if (!paidOn || !isFinite(dollars) || dollars <= 0) {
          setOfficerMsg("Enter the date and amount, or choose a Zeffy payment.", "err");
          return;
        }
        result = await callOfficer("officer_locker_record_payment", {
          p_paid_on: paidOn,
          p_amount_cents: Math.round(dollars * 100),
          p_note: note,
          p_locker_number: panelMode.from || null,
          p_reservation_id: panelMode.reservationId || null
        });
      }
    }
    if (rpcFailed(result)) {
      setOfficerMsg(rpcMessage(result, "Could not update the locker."), "err");
      if (result && result.data && result.data.code === "size_mismatch") refreshSizeWarning();
      return;
    }
    setOfficerMsg(rpcMessage(result, "Saved."), "ok");
    closePanel();
    if (!lockerFixture) await loadOfficer();
  }

  async function freeLocker(id) {
    if (!window.confirm("Free this locker? The holder returns to the waiting list when they are not a comp.")) return;
    var result = await callOfficer("officer_locker_free", { p_locker_id: id });
    if (rpcFailed(result)) {
      setOfficerMsg(rpcMessage(result, "Could not free that locker."), "err");
      return;
    }
    setOfficerMsg(rpcMessage(result, "Locker is open."), "ok");
    if (!lockerFixture) await loadOfficer();
  }

  window.__kosLockerOfficerFixture = function (fx) {
    lockerFixture = fx || null;
    if (!lockerFixture) return;
    if (!lockerFixture.summary) lockerFixture.summary = summarize(lockerFixture.lockers, lockerFixture.waiting);
    ensureOfficerCard();
    paintBoard(lockerFixture);
  };

  window.kosPaintLockerOfficer = function (model) {
    lockerFixture = model || null;
    if (lockerFixture && !lockerFixture.summary) lockerFixture.summary = summarize(lockerFixture.lockers, lockerFixture.waiting);
    paintBoard(model || {});
  };

  async function loadOfficer() {
    var seq = ++officerSeq;
    if (lockerFixture) {
      paintBoard(lockerFixture);
      return;
    }
    var client = sb();
    if (!client) return;
    ensureOfficerCard();
    try {
      var res = await client.rpc("officer_locker_board");
      if (seq !== officerSeq) return;
      if (!res || res.error || !res.data || res.data.ok === false) {
        paintBoard({ urls: defaultUrls(), lockers: [], waiting: [], summary: summarize([], []) });
        setOfficerMsg((res && res.data && res.data.message) || (res && res.error && res.error.message) || "Could not load lockers. Apply sql/kos_locker_desk.sql in Supabase, then refresh.", "err");
        return;
      }
      paintBoard(res.data);
    } catch (e) {
      if (seq !== officerSeq) return;
      paintBoard({ urls: defaultUrls(), lockers: [], waiting: [], summary: summarize([], []) });
      setOfficerMsg("Could not load lockers. Apply sql/kos_locker_desk.sql in Supabase, then refresh.", "err");
    }
  }

  window.kosLoadOfficerLockers = loadOfficer;

  async function saveUrls() {
    var client = sb();
    if (!client || lockerFixture) {
      setOfficerMsg(lockerFixture ? "Pay links are preview only here." : "Not signed in.", "err");
      return;
    }
    var small = (document.getElementById("hubLockerSmallUrl").value || "").trim();
    var large = (document.getElementById("hubLockerLargeUrl").value || "").trim();
    setOfficerMsg("Saving pay links…", "");
    var a = await client.rpc("officer_locker_set_setting", { p_key: "ZEFFY_LOCKER_SMALL_URL", p_value: small });
    if (a && (a.error || (a.data && a.data.ok === false))) {
      setOfficerMsg((a.error && a.error.message) || (a.data && a.data.message) || "Could not save the small link.", "err");
      return;
    }
    var b = await client.rpc("officer_locker_set_setting", { p_key: "ZEFFY_LOCKER_LARGE_URL", p_value: large });
    if (b && (b.error || (b.data && b.data.ok === false))) {
      setOfficerMsg((b.error && b.error.message) || (b.data && b.data.message) || "Could not save the large link.", "err");
      return;
    }
    setOfficerMsg("Pay links saved.", "ok");
    await loadMember();
    await loadOfficer();
  }

  async function detectOfficer() {
    var client = sb();
    if (!client || !client.rpc) return false;
    try {
      var res = await client.rpc("is_krewe_officer");
      if (res && res.data) return true;
      var tool = await client.rpc("has_tool", { p_tool: "lockers" });
      return !!(tool && tool.data);
    } catch (e) {
      return false;
    }
  }

  async function refreshAll() {
    bindMember();
    try { await loadMember(); } catch (e) {}
    var officer = false;
    try { officer = await detectOfficer(); } catch (e2) { officer = false; }
    var existing = document.getElementById("hubLockers");
    if (officer || existing || lockerFixture) {
      ensureOfficerCard();
      if (officer || lockerFixture) {
        try { await loadOfficer(); } catch (e3) {}
      }
    }
  }

  function hookDesk() {
    if (deskHooked || typeof window.kosRefreshOfficerDesk !== "function") return;
    deskHooked = true;
    var prev = window.kosRefreshOfficerDesk;
    window.kosRefreshOfficerDesk = function () {
      if (typeof prev === "function") prev();
      if (document.getElementById("hubLockers")) ensureOfficerCard();
    };
  }

  var prevUnlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof prevUnlock === "function") prevUnlock();
    hookDesk();
    setTimeout(refreshAll, 80);
  };

  bindMember();
  hookDesk();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(refreshAll, 400); });
  } else {
    setTimeout(refreshAll, 400);
  }
})();
