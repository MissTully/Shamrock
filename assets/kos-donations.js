/* Member Desk giving card and the Charity chair's read-only gift list.
   Intents are saved with kos_create_donation_intent, then Zeffy opens
   with ?amount= (the param name comes from the donation flag). */
(function () {
  var bound = false;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(cents) {
    var n = Number(cents);
    if (!isFinite(n)) return "";
    return "$" + (n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function giftDate(value) {
    var date = new Date(value || "");
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(date);
  }

  function injectCss() {
    if (document.getElementById("kosDonationCss")) return;
    var style = document.createElement("style");
    style.id = "kosDonationCss";
    style.textContent = [
      "#hubDonations .kos-give-lead{margin:0 0 12px;line-height:1.45;}",
      "#hubDonations .kos-give-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}",
      "#hubDonations .kos-give-chips button{appearance:none;border:1px solid rgba(168,128,28,.55);background:#fffdf6;",
      "color:#14532d;border-radius:999px;min-height:44px;padding:8px 16px;font:inherit;font-weight:700;cursor:pointer;}",
      "#hubDonations .kos-give-chips button.on{background:linear-gradient(180deg,#f3dd97,#e4c56a);color:#3a2c00;border-color:#a67c00;}",
      "#hubDonations form label{display:block;margin:10px 0 4px;font-weight:700;color:#14532d;}",
      "#hubDonations form input,#hubDonations form textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;",
      "padding:12px 14px;border-radius:12px;border:1px solid rgba(168,128,28,.4);background:#fff;}",
      "#hubDonations form textarea{min-height:96px;resize:vertical;}",
      "#hubDonations .kos-give-count{margin:4px 0 0;color:#5c6b60;font-size:14px;}",
      "#hubDonations .kos-give-msg{min-height:1.2em;margin:10px 0 0;}",
      "#hubDonations .kos-give-gifts{margin-top:18px;}",
      "#hubDonations .kos-give-gifts h3,#hubCharityDonations h3{font-family:var(--display),Georgia,serif;color:#14532d;margin:0 0 8px;}",
      ".kos-give-table{width:100%;border-collapse:collapse;font-size:15px;}",
      ".kos-give-table th{text-align:left;background:#14532d;color:#f6efdc;padding:8px 10px;}",
      ".kos-give-table td{padding:8px 10px;border-top:1px solid rgba(168,128,28,.25);vertical-align:top;}",
      ".kos-give-pill{display:inline-block;border-radius:999px;padding:2px 8px;font-size:13px;font-weight:700;}",
      ".kos-give-pill.paid{background:#e7f3ea;color:#14532d;}",
      ".kos-give-pill.pending{background:#fff4c2;color:#6b4e00;}",
      "@media (max-width:720px){",
      ".kos-give-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}",
      ".kos-give-table tr{display:block;padding:8px 0;border-top:1px solid rgba(168,128,28,.35);}",
      ".kos-give-table td{display:flex;justify-content:space-between;gap:12px;border:0;padding:3px 0;}",
      ".kos-give-table td::before{content:attr(data-label);font-weight:700;color:#14532d;}" ,
      "}"
    ].join("");
    document.head.appendChild(style);
  }

  function rowsOf(data) {
    if (!data) return [];
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return []; }
    }
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.gifts)) return data.gifts;
    if (Array.isArray(data.rows)) return data.rows;
    return [];
  }

  function statusLabel(row) {
    var matched = row.matched === true || String(row.status || "").toLowerCase() === "paid" || row.payment_id;
    return matched ? "Matched" : "Pending";
  }

  function memberGiftRows(rows) {
    if (!rows.length) {
      return '<p class="empty">You have not given through the Hub yet. When you do, your gifts will be listed here.</p>';
    }
    var html = '<table class="kos-give-table"><thead><tr><th>Date</th><th>Amount</th><th>Note</th><th>Status</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      var matched = statusLabel(row) === "Matched";
      html += "<tr><td data-label=\"Date\">" + esc(giftDate(row.created_at)) + "</td>"
        + "<td data-label=\"Amount\">" + esc(money(row.amount_cents)) + "</td>"
        + "<td data-label=\"Note\">" + esc(row.note || "No note") + "</td>"
        + '<td data-label="Status"><span class="kos-give-pill ' + (matched ? "paid" : "pending") + '">'
        + esc(statusLabel(row)) + "</span></td></tr>";
    });
    return html + "</tbody></table>";
  }

  function officerRows(rows) {
    if (!rows.length) {
      return '<p class="empty">No gifts have come in yet. When someone gives, their gift will show up here.</p>';
    }
    var html = '<table class="kos-give-table"><thead><tr><th>Date</th><th>Amount</th><th>Donor</th><th>Member</th><th>Note</th></tr></thead><tbody>';
    rows.forEach(function (row) {
      html += "<tr><td data-label=\"Date\">" + esc(giftDate(row.created_at || row.when)) + "</td>"
        + "<td data-label=\"Amount\">" + esc(money(row.amount_cents)) + "</td>"
        + "<td data-label=\"Donor\">" + esc(row.donor_name || row.payer_name || "Friend of the Krewe") + "</td>"
        + "<td data-label=\"Member\">" + esc(row.member_name || "Not matched to a member") + "</td>"
        + "<td data-label=\"Note\">" + esc(row.note || "No note") + "</td></tr>";
    });
    return html + "</tbody></table>";
  }

  function paintGifts(rows) {
    var host = document.getElementById("hubDonationGifts");
    if (!host) return;
    host.innerHTML = memberGiftRows(rows || []);
  }

  function selectedAmount() {
    var input = document.getElementById("hubDonationAmount");
    return input ? input.value : "";
  }

  function syncChips() {
    var amount = String(selectedAmount() || "").replace(/[$,\s]/g, "");
    document.querySelectorAll("#hubDonations [data-give-amount]").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-give-amount") === amount);
    });
  }

  function syncCount() {
    var note = document.getElementById("hubDonationNote");
    var count = document.getElementById("hubDonationCount");
    if (!note || !count) return;
    count.textContent = String(note.value || "").length + " of 500";
  }

  function setMessage(text, ok) {
    var msg = document.getElementById("hubDonationMsg");
    if (!msg) return;
    msg.textContent = text || "";
    msg.style.color = ok ? "#14532d" : "#8a1c12";
  }

  function rpcMissing(error) {
    var blob = String((error && (error.message || error.details || error.code)) || "");
    return /PGRST202|404|does not exist|kos_create_donation_intent|schema cache/i.test(blob);
  }

  function openGift(cents) {
    var api = window.KosDonate;
    var url = api && typeof api.withAmount === "function" ? api.withAmount(cents) : "";
    window.__kosLastDonationUrl = url;
    if (!url) {
      setMessage("The giving form link is not ready yet. Please try again in a moment.", false);
      return;
    }
    var opened = window.open(url, "_blank", "noopener");
    if (!opened) {
      setMessage("Your gift is saved. If a new tab did not open, use this link: " + url, true);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    var api = window.KosDonate;
    var parsed = api && typeof api.parseGiftAmount === "function"
      ? api.parseGiftAmount(selectedAmount())
      : { ok: false, message: "Enter a gift amount to continue." };
    if (!parsed.ok) {
      setMessage(parsed.message, false);
      return;
    }
    var noteEl = document.getElementById("hubDonationNote");
    var note = noteEl ? String(noteEl.value || "").trim() : "";
    if (note.length > 500) {
      setMessage("Please keep your note to 500 characters.", false);
      return;
    }
    var button = document.getElementById("hubDonationSubmit");
    if (button) button.disabled = true;
    setMessage("Opening the giving form…", true);
    var preview = window.__kosDonationPreview;
    try {
      if (preview) {
        preview.last = { amount_cents: parsed.amount_cents, note: note };
        window.__kosLastDonation = preview.last;
        openGift(parsed.amount_cents);
        setMessage("Thank you. Your giving form is open in a new tab.", true);
        await loadMine();
        return;
      }
      var client = window.__kosSb;
      if (!client || typeof client.rpc !== "function") {
        setMessage("Please sign in again, then try your gift once more.", false);
        return;
      }
      var res = await client.rpc("kos_create_donation_intent", {
        p_amount_cents: parsed.amount_cents,
        p_note: note || null
      });
      if (res && res.error) {
        if (rpcMissing(res.error)) {
          openGift(parsed.amount_cents);
          setMessage("Your giving form is open. Hub gift records start once that step is turned on.", true);
          return;
        }
        setMessage((res.error && res.error.message) || "We could not save your gift just yet. Please try again.", false);
        return;
      }
      var data = res && res.data;
      if (data && data.ok === false) {
        setMessage(data.message || "Please check the amount and try again.", false);
        return;
      }
      openGift(parsed.amount_cents);
      setMessage("Thank you. Your giving form is open in a new tab.", true);
      if (noteEl) noteEl.value = "";
      syncCount();
      await loadMine();
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function loadMine() {
    var preview = window.__kosDonationPreview;
    if (preview && Array.isArray(preview.gifts)) {
      paintGifts(preview.gifts);
      return;
    }
    var client = window.__kosSb;
    if (!client || typeof client.rpc !== "function") {
      paintGifts([]);
      return;
    }
    try {
      var res = await client.rpc("kos_list_my_donation_intents");
      var data = res && !res.error ? res.data : null;
      paintGifts(rowsOf(data));
    } catch (e) {
      paintGifts([]);
    }
  }

  function bind() {
    var form = document.getElementById("hubDonationForm");
    if (!form || form.getAttribute("data-bound") === "1") return;
    form.setAttribute("data-bound", "1");
    form.addEventListener("submit", onSubmit);
    var amount = document.getElementById("hubDonationAmount");
    if (amount) amount.addEventListener("input", syncChips);
    var note = document.getElementById("hubDonationNote");
    if (note) note.addEventListener("input", syncCount);
    document.querySelectorAll("#hubDonations [data-give-amount]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (amount) amount.value = btn.getAttribute("data-give-amount") || "";
        syncChips();
        if (amount) amount.focus();
      });
    });
    syncChips();
    syncCount();
    bound = true;
  }

  function mount() {
    injectCss();
    if (!document.getElementById("hubDonations")) return;
    bind();
    loadMine();
  }

  window.kosPaintCharityDonations = function (card, rows) {
    if (!card) return;
    injectCss();
    card.innerHTML = '<div class="app-head"><span class="ic">💚</span><div><h2>Donations</h2>'
      + "<small>Gifts to the Krewe. This list is read only.</small></div></div>"
      + '<div class="app-body" id="hubCharityDonationsBody">'
      + "<p>These are gifts that came in through Give to the Krewe. The note is the one from the Hub when we matched it, or the note they left on Zeffy.</p>"
      + officerRows(rows || [])
      + "</div>";
  };

  window.kosLoadCharityDonations = async function () {
    var card = document.getElementById("hubCharityDonations");
    if (!card) return;
    if (Array.isArray(window.__kosDonationLedger)) {
      window.kosPaintCharityDonations(card, window.__kosDonationLedger);
      return;
    }
    var client = window.__kosSb;
    if (!client || typeof client.rpc !== "function") {
      window.kosPaintCharityDonations(card, []);
      return;
    }
    try {
      var res = await client.rpc("kos_list_donations");
      var data = res && !res.error ? res.data : null;
      if (data && data.ok === false) {
        card.innerHTML = '<div class="app-body"><p class="empty">' + esc(data.message || "These gifts are not open for this login.") + "</p></div>";
        return;
      }
      window.kosPaintCharityDonations(card, rowsOf(data));
    } catch (e) {
      window.kosPaintCharityDonations(card, []);
    }
  };

  window.kosMountDonations = mount;

  function boot() {
    setTimeout(mount, 0);
  }

  var previousUnlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof previousUnlock === "function") previousUnlock();
    setTimeout(mount, 80);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
