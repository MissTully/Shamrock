/* Record one cash or check dues entry. Calls kos_record_dues_receipt.
   No email. The server sends the message, including "No email was sent." */
(function () {
  "use strict";

  var CSS =
    ".kos-receipt-back{position:fixed;inset:0;background:rgba(20,40,20,.45);display:flex;align-items:center;justify-content:center;z-index:80;padding:16px;}" +
    ".kos-receipt-card{background:#fffdf6;border:1px solid rgba(168,128,28,.45);border-radius:16px;padding:18px;width:min(460px,100%);max-height:92vh;overflow:auto;box-shadow:0 16px 40px rgba(0,0,0,.18);}" +
    ".kos-receipt-card h3{margin:0 0 6px;font-family:Georgia,serif;color:#14532d;font-size:1.35rem;}" +
    ".kos-receipt-card p{margin:0 0 10px;line-height:1.45;}" +
    ".kos-receipt-card label{display:block;font-size:13px;color:#5c5648;margin:10px 0 4px;}" +
    ".kos-receipt-card input,.kos-receipt-card select,.kos-receipt-card textarea{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(168,128,28,.35);background:#fff;font:inherit;font-size:16px;}" +
    ".kos-receipt-card textarea{min-height:72px;}" +
    ".kos-receipt-card .kos-receipt-check{display:flex;gap:8px;align-items:center;font-size:15px;color:#14532d;margin-top:12px;}" +
    ".kos-receipt-card .kos-receipt-check input{width:auto;}" +
    ".kos-receipt-card .kos-receipt-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;}" +
    ".kos-receipt-card .kos-receipt-msg{min-height:1.2em;margin-top:8px;}" +
    ".kos-receipt-card .kos-receipt-msg.is-err{color:#8a1c12;font-weight:600;}";

  function injectCss() {
    if (document.getElementById("kosDuesReceiptsCss")) return;
    var s = document.createElement("style");
    s.id = "kosDuesReceiptsCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function personName(person) {
    if (!person) return "";
    if (person.name) return String(person.name);
    return [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  }

  function todayISO() {
    var d = new Date();
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function money(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return "";
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function cents(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return null;
    return Math.round(n * 100);
  }

  function rpcMissing(err) {
    var msg = (err && (err.message || err.details || err.code)) || "";
    return !!(err && (err.code === "PGRST202" || /PGRST202|schema cache|does not exist|Could not find the function/i.test(String(msg))));
  }

  function close() {
    var node = document.getElementById("kosReceiptDialog");
    if (node) node.remove();
  }

  function open(opts) {
    injectCss();
    close();
    opts = opts || {};
    var member = opts.member || {};
    var partner = opts.partner || null;
    var partnerName = personName(partner);
    var one = opts.expected != null ? Number(opts.expected) : Number(member.amount);
    if (!isFinite(one)) one = 0;
    var two = partner && opts.partnerExpected != null ? Number(opts.partnerExpected) : (partner ? one : 0);
    if (!isFinite(two)) two = 0;
    var today = todayISO();
    var root = document.createElement("div");
    root.className = "kos-receipt-back";
    root.id = "kosReceiptDialog";
    root.innerHTML =
      '<form class="kos-receipt-card" role="dialog" aria-modal="true" aria-labelledby="kosReceiptTitle">' +
      '<h3 id="kosReceiptTitle">Record cash or check</h3>' +
      "<p><b>" + esc(personName(member) || "Member") + "</b>" +
      (member.membership_status ? " · " + esc(member.membership_status) : "") +
      "</p>" +
      '<label for="kosReceiptMethod">Method</label>' +
      '<select id="kosReceiptMethod"><option value="check">Check</option><option value="cash">Cash</option></select>' +
      '<label for="kosReceiptAmount">Amount</label>' +
      '<input id="kosReceiptAmount" type="number" min="0.01" step="0.01" value="' + esc(one.toFixed(2)) + '" />' +
      '<label for="kosReceiptDate">Date received</label>' +
      '<input id="kosReceiptDate" type="date" value="' + today + '" max="' + today + '" />' +
      '<label for="kosReceiptCheck">Check number</label>' +
      '<input id="kosReceiptCheck" type="text" autocomplete="off" />' +
      (partnerName
        ? '<label class="kos-receipt-check"><input id="kosReceiptPartner" type="checkbox" /> <span>Also covers ' + esc(partnerName) + "</span></label>"
        : "") +
      '<label for="kosReceiptNote">Note</label>' +
      '<textarea id="kosReceiptNote" placeholder="Required when the amount is not the catalog total."></textarea>' +
      '<p class="kos-receipt-msg" id="kosReceiptMsg" role="status"></p>' +
      '<div class="kos-receipt-actions">' +
      '<button type="submit" class="btn btn-primary" id="kosReceiptSave">Confirm</button>' +
      '<button type="button" class="btn" id="kosReceiptCancel">Cancel</button>' +
      "</div></form>";
    document.body.appendChild(root);

    var amountEl = root.querySelector("#kosReceiptAmount");
    var methodEl = root.querySelector("#kosReceiptMethod");
    var checkEl = root.querySelector("#kosReceiptCheck");
    var partnerEl = root.querySelector("#kosReceiptPartner");
    var noteEl = root.querySelector("#kosReceiptNote");
    var msgEl = root.querySelector("#kosReceiptMsg");

    function expectedNow() {
      if (partnerEl && partnerEl.checked) return Math.round((one + two) * 100) / 100;
      return Math.round(one * 100) / 100;
    }

    function syncAmount() {
      if (!amountEl) return;
      amountEl.value = expectedNow().toFixed(2);
    }

    function syncCheck() {
      var isCheck = methodEl && methodEl.value === "check";
      if (checkEl) checkEl.required = !!isCheck;
    }

    if (partnerEl) partnerEl.addEventListener("change", syncAmount);
    if (methodEl) methodEl.addEventListener("change", syncCheck);
    syncCheck();

    root.querySelector("#kosReceiptCancel").addEventListener("click", function () {
      close();
    });

    root.querySelector("form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      save();
    });

    function say(text, isErr) {
      if (!msgEl) return;
      msgEl.textContent = text || "";
      msgEl.classList.toggle("is-err", !!isErr);
    }

    async function save() {
      var method = methodEl ? methodEl.value : "check";
      var amount = amountEl ? Number(amountEl.value) : 0;
      var received = root.querySelector("#kosReceiptDate").value;
      var checkNo = checkEl ? String(checkEl.value || "").trim() : "";
      var note = noteEl ? String(noteEl.value || "").trim() : "";
      var cover = !!(partnerEl && partnerEl.checked);
      if (!(amount > 0)) {
        say("Amount must be more than zero.", true);
        return;
      }
      if (!received) {
        say("Date received is required.", true);
        return;
      }
      if (received > today) {
        say("Date received cannot be in the future.", true);
        return;
      }
      if (method === "check" && !checkNo) {
        say("Check number is required.", true);
        return;
      }
      if (cents(amount) !== cents(expectedNow()) && !note) {
        say("Amount differs from " + money(expectedNow()) + " expected. Add a note.", true);
        return;
      }
      var payload = {
        p_member_id: member.id,
        p_method: method,
        p_amount: amount,
        p_received_on: received,
        p_check_number: method === "check" ? checkNo : null,
        p_include_partner: cover,
        p_note: note || null
      };
      var client = window.__kosSb;
      if (!client || typeof client.rpc !== "function") {
        if (opts.allowOffline) {
          var offline = {
            ok: true,
            message: (personName(member) || "Member") + " is marked paid by " + method + " in this preview. No email was sent."
          };
          say(offline.message, false);
          if (typeof opts.onDone === "function") opts.onDone(offline);
          close();
        } else {
          say("Still connecting.", true);
        }
        return;
      }
      var btn = root.querySelector("#kosReceiptSave");
      if (btn) btn.disabled = true;
      try {
        var res = await client.rpc("kos_record_dues_receipt", payload);
        if (res.error) {
          if (rpcMissing(res.error)) {
            close();
            if (typeof opts.onMissing === "function") opts.onMissing();
            return;
          }
          throw res.error;
        }
        var data = res.data || {};
        if (data.ok === false) {
          say(data.message || "Could not record that payment.", true);
          if (btn) btn.disabled = false;
          return;
        }
        say(data.message || "Recorded. No email was sent.", false);
        if (typeof opts.onDone === "function") opts.onDone(data);
        close();
      } catch (e) {
        say((e && e.message) || "Could not record that payment.", true);
        if (btn) btn.disabled = false;
      }
    }
  }

  window.KosDuesReceipts = { open: open, close: close };
})();
