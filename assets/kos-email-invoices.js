/* Officer desk: Email members + level-based Send invoices.
   Any krewe officer (is_krewe_officer).
   Invoices: kos_dues_catalog, kos_set_membership_level, kos_create_level_invoices.
   Email notices: officer_send_member_email → outbound_emails / Resend. */
(function () {
  var CSS =
    ".hub-ei label{display:block;font-size:13px;color:var(--muted);margin:0 0 4px;}" +
    ".hub-ei input[type=text],.hub-ei input[type=number],.hub-ei input[type=search],.hub-ei textarea,.hub-ei select{" +
    "width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid rgba(168,128,28,.35);" +
    "background:#fff;font:inherit;font-size:16px;min-height:48px;}" +
    ".hub-ei textarea{min-height:140px;resize:vertical;}" +
    ".hub-ei .hub-ei-grid{display:grid;gap:14px;margin-top:8px;}" +
    ".hub-ei .hub-ei-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;}" +
    ".hub-ei .hub-ei-row .btn{min-height:48px;padding:12px 18px;font-size:16px;}" +
    ".hub-ei .hub-ei-msg{margin:10px 0 0;font-size:14px;min-height:1.2em;}" +
    ".hub-ei .hub-ei-msg.ok{color:#1d6b3e;}" +
    ".hub-ei .hub-ei-msg.err{color:#b3261e;}" +
    ".hub-ei .hub-ei-note{margin:8px 0 0;font-size:13px;color:var(--muted);line-height:1.45;}" +
    ".hub-ei .hub-ei-pills{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px;}" +
    ".hub-ei .hub-ei-pill{appearance:none;border:1px solid rgba(168,128,28,.4);background:#fff;border-radius:999px;" +
    "padding:10px 14px;font:inherit;font-size:14px;min-height:44px;cursor:pointer;}" +
    ".hub-ei .hub-ei-pill.on{background:#14532d;color:#fff;border-color:#14532d;}" +
    ".hub-ei .hub-ei-list{max-height:240px;overflow:auto;border:1px solid rgba(168,128,28,.25);border-radius:12px;" +
    "background:#fff;margin-top:8px;}" +
    ".hub-ei .hub-ei-list.hub-ei-invlist{max-height:440px;}" +
    ".hub-ei .hub-ei-catalog{border:1px solid rgba(168,128,28,.3);border-radius:12px;padding:10px 12px;background:#fff;font-size:14px;line-height:1.45;}" +
    ".hub-ei .hub-ei-catalog div{margin-top:4px;}" +
    ".hub-ei .hub-ei-warn{margin:8px 0 0;font-size:13px;color:#8a4b08;line-height:1.45;}" +
    ".hub-ei .hub-ei-counts{margin-top:8px;padding:10px 12px;border-radius:12px;background:#f6efdd;font-size:14px;line-height:1.45;}" +
    ".hub-ei select.hub-ei-levelsel{width:auto;min-width:11rem;min-height:44px;padding:8px 10px;margin-top:6px;}" +
    ".hub-ei .hub-ei-item{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;" +
    "border-top:1px solid rgba(168,128,28,.18);font-size:15px;}" +
    ".hub-ei .hub-ei-item:first-child{border-top:0;}" +
    ".hub-ei .hub-ei-item input{margin-top:3px;width:20px;height:20px;}" +
    ".hub-ei .hub-ei-item .meta{font-size:12px;color:var(--muted);margin-top:2px;}" +
    ".hub-ei .hub-ei-preview{border:1px solid rgba(168,128,28,.4);border-radius:10px;overflow:hidden;" +
    "background:#f6efdd;max-width:420px;font-size:13px;line-height:1.45;margin-top:8px;}" +
    ".hub-ei .hub-ei-prev-hdr{display:flex;gap:10px;align-items:center;padding:10px 12px;" +
    "background:linear-gradient(180deg,#14532d,#0c3b21);border-bottom:3px solid #d4af37;color:#fff;}" +
    ".hub-ei .hub-ei-prev-hdr img{width:36px;height:36px;border-radius:50%;background:#fff;}" +
    ".hub-ei .hub-ei-prev-body{background:#fff;padding:14px;color:#23291f;}" +
    ".hub-ei .hub-ei-prev-body h1{margin:0 0 10px;font-family:var(--display);font-size:16px;color:#14532d;}" +
    ".hub-ei .hub-ei-history{margin-top:22px;border-top:1px solid rgba(168,128,28,.25);padding-top:14px;}" +
    ".hub-ei .hub-ei-history h3{margin:0 0 10px;font-family:var(--display);font-size:17px;}" +
    ".hub-ei .hub-ei-hrow{padding:10px 0;border-top:1px solid rgba(168,128,28,.2);font-size:14px;}" +
    ".hub-ei .hub-ei-hrow:first-of-type{border-top:0;}" +
    ".hub-ei .hub-ei-confirm{display:flex;gap:10px;align-items:flex-start;margin:12px 0 4px;font-size:14px;line-height:1.4;}" +
    ".hub-ei .hub-ei-confirm input{margin-top:3px;width:20px;height:20px;}";

  var LOGO = "https://www.kreweofshamrock.com/assets/img/emblem-shamrock.png";

  var emailState = { audience: "active", selected: {}, counts: {} };
  var LEVELS = [
    { id: "full", label: "Full" },
    { id: "associate", label: "Associate" },
    { id: "loa", label: "Leave of absence" },
    { id: "auxiliary", label: "Auxiliary" }
  ];
  var LEVEL_LABEL = { full: "Full", associate: "Associate", loa: "Leave of absence", auxiliary: "Auxiliary" };
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var invState = {
    filter: "unpaid",
    selected: {},
    roster: [],
    duesByMember: {},
    catalog: {}
  };

  function injectCss() {
    if (document.getElementById("kosEmailInvoicesCss")) return;
    var s = document.createElement("style");
    s.id = "kosEmailInvoicesCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(v) {
    return (v == null ? "" : String(v)).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function when(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function toHtml(body) {
    var t = (body || "").trim();
    if (!t) return "";
    if (/<[a-z][\s\S]*>/i.test(t)) return t;
    return t.split(/\n{2,}/).map(function (p) {
      return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  function selectedIds(map) {
    return Object.keys(map).filter(function (k) { return map[k]; });
  }

  function setMsg(id, text, kind) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
    el.className = "hub-ei-msg" + (kind ? " " + kind : "");
  }

  function ensureCard(id, title, desc, icon) {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;
    var card = document.getElementById(id);
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = id;
      panel.appendChild(card);
    }
    return card;
  }

  function updateEmailPreview() {
    var box = document.getElementById("hubEmPreview");
    if (!box) return;
    var subject = val("hubEmSubject") || "Your subject here";
    var bodyHtml = toHtml(val("hubEmBody")) || "<p><em>Message preview…</em></p>";
    box.innerHTML =
      '<div class="hub-ei-prev-hdr"><img src="' + LOGO + '" alt="" />' +
      '<div><div style="font-family:var(--display);font-size:14px;">Krewe of Shamrock</div>' +
      '<div style="font-size:10px;color:#ecd07e;margin-top:2px;">Since 1999</div></div></div>' +
      '<div class="hub-ei-prev-body"><h1>' + esc(subject) + "</h1>" + bodyHtml + "</div>";
  }

  function renderPickList(targetId, rows, stateMap, opts) {
    var target = document.getElementById(targetId);
    if (!target) return;
    opts = opts || {};
    if (!rows || !rows.length) {
      target.innerHTML = '<p class="empty" style="padding:12px;">No members match.</p>';
      return;
    }
    var html = "";
    rows.forEach(function (m) {
      var id = m.id;
      var checked = stateMap[id] ? " checked" : "";
      var extra = opts.extra ? opts.extra(m) : "";
      html +=
        '<label class="hub-ei-item"><input type="checkbox" data-id="' + esc(id) + '"' + checked + " />" +
        "<div><b>" + esc(m.first_name || "") + " " + esc(m.last_name || "") + "</b>" +
        '<div class="meta">' + esc(m.email || "") +
        (m.officer_title ? " · " + esc(m.officer_title) : "") +
        extra +
        "</div></div></label>";
    });
    target.innerHTML = html;
    target.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var mid = cb.getAttribute("data-id");
        if (cb.checked) stateMap[mid] = true;
        else delete stateMap[mid];
        if (typeof opts.onChange === "function") opts.onChange();
      });
    });
  }

  async function loadEmailHistory(client) {
    var target = document.getElementById("hubEmHistory");
    if (!target) return;
    try {
      var res = await client.rpc("officer_list_outreach_log", { p_kind: "email", p_limit: 30 });
      if (res.error) throw res.error;
      var items = (res.data && res.data.items) || [];
      if (!items.length) {
        target.innerHTML = '<p class="empty">No officer emails logged yet.</p>';
        return;
      }
      target.innerHTML = items.map(function (m) {
        return (
          '<div class="hub-ei-hrow"><b>' + esc(m.subject || "(no subject)") + "</b>" +
          '<div class="meta" style="color:var(--muted);font-size:13px;margin-top:2px;">' +
          esc(when(m.created_at)) + " · " + esc(m.audience || "") +
          " · " + (m.recipient_count != null ? m.recipient_count + " recipients" : "") +
          "</div></div>"
        );
      }).join("");
    } catch (e) {
      target.innerHTML = '<p class="empty">Could not load history.</p>';
    }
  }

  async function refreshAudienceCounts(client) {
    try {
      var res = await client.rpc("officer_email_audience_counts");
      if (res.error) throw res.error;
      emailState.counts = res.data || {};
      var cActive = document.getElementById("hubEmCountActive");
      var cOff = document.getElementById("hubEmCountOfficers");
      var cCh = document.getElementById("hubEmCountChairs");
      if (cActive) cActive.textContent = emailState.counts.active != null ? "(" + emailState.counts.active + ")" : "";
      if (cOff) cOff.textContent = emailState.counts.officers != null ? "(" + emailState.counts.officers + ")" : "";
      if (cCh) cCh.textContent = emailState.counts.chairs != null ? "(" + emailState.counts.chairs + ")" : "";
    } catch (e) {}
  }

  function setAudience(aud) {
    emailState.audience = aud;
    ["active", "officers", "chairs", "selected"].forEach(function (a) {
      var btn = document.getElementById("hubEmAud_" + a);
      if (btn) btn.classList.toggle("on", a === aud);
    });
    var pick = document.getElementById("hubEmPickWrap");
    if (pick) pick.style.display = aud === "selected" ? "" : "none";
  }

  async function searchRoster(client) {
    var q = val("hubEmSearch");
    var res = await client.rpc("officer_search_roster", { p_q: q, p_limit: 50 });
    if (res.error) throw res.error;
    var members = (res.data && res.data.members) || [];
    renderPickList("hubEmPickList", members, emailState.selected);
  }

  async function sendEmail(client) {
    var subject = val("hubEmSubject");
    var bodyRaw = val("hubEmBody");
    var confirm = document.getElementById("hubEmConfirm");
    var btn = document.getElementById("hubEmSend");
    if (!subject) { setMsg("hubEmMsg", "Subject is required.", "err"); return; }
    if (!bodyRaw) { setMsg("hubEmMsg", "Message body is required.", "err"); return; }
    if (!confirm || !confirm.checked) {
      setMsg("hubEmMsg", "Please confirm you are ready to queue this email.", "err");
      return;
    }
    var ids = selectedIds(emailState.selected);
    if (emailState.audience === "selected" && !ids.length) {
      setMsg("hubEmMsg", "Pick at least one member from the roster.", "err");
      return;
    }
    var who =
      emailState.audience === "active" ? "ALL active members" :
      emailState.audience === "officers" ? "officers and board" :
      emailState.audience === "chairs" ? "chairs / officers / board" :
      ids.length + " selected member(s)";
    if (!window.confirm("Queue this email for " + who + "?")) return;
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
    setMsg("hubEmMsg", "");
    try {
      var res = await client.rpc("officer_send_member_email", {
        p_subject: subject,
        p_body_html: toHtml(bodyRaw),
        p_audience: emailState.audience,
        p_member_ids: emailState.audience === "selected" ? ids : null
      });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not send.");
      setMsg(
        "hubEmMsg",
        "Queued for " + (data.recipient_count != null ? data.recipient_count : "?") +
          " recipient(s). Delivery runs through the outbound email queue (Resend).",
        "ok"
      );
      document.getElementById("hubEmSubject").value = "";
      document.getElementById("hubEmBody").value = "";
      confirm.checked = false;
      emailState.selected = {};
      updateEmailPreview();
      await loadEmailHistory(client);
    } catch (e) {
      setMsg("hubEmMsg", "Could not send: " + ((e && e.message) || e), "err");
    }
    if (btn) { btn.disabled = false; btn.textContent = "Send email"; }
  }

  async function loadEmailCard(client) {
    var card = ensureCard("hubEmailMembers");
    if (!card) return;
    card.innerHTML =
      '<div class="app-head"><span class="ic">✉️</span><div><h2>Email members</h2>' +
      "<small>Write once, choose who gets it, preview, then send</small></div></div>" +
      '<div class="app-body hub-ei">' +
      '<p class="hub-ei-note">Uses the same branded Shamrock template and outbound queue as All Krewe Messages. Available to any officer on Officer desk.</p>' +
      '<div class="hub-ei-grid">' +
      "<div><label>Audience</label>" +
      '<div class="hub-ei-pills" role="group" aria-label="Email audience">' +
      '<button type="button" class="hub-ei-pill on" id="hubEmAud_active">All active <span id="hubEmCountActive"></span></button>' +
      '<button type="button" class="hub-ei-pill" id="hubEmAud_officers">Officers &amp; board <span id="hubEmCountOfficers"></span></button>' +
      '<button type="button" class="hub-ei-pill" id="hubEmAud_chairs">Chairs / officers <span id="hubEmCountChairs"></span></button>' +
      '<button type="button" class="hub-ei-pill" id="hubEmAud_selected">Pick from roster</button>' +
      "</div></div>" +
      '<div id="hubEmPickWrap" style="display:none;">' +
      '<label for="hubEmSearch">Search roster</label>' +
      '<input id="hubEmSearch" type="search" placeholder="Name or email" autocomplete="off" />' +
      '<div class="hub-ei-list" id="hubEmPickList"><p class="empty" style="padding:12px;">Type to search…</p></div></div>' +
      '<div><label for="hubEmSubject">Subject</label><input id="hubEmSubject" type="text" maxlength="200" placeholder="e.g. Meeting reminder" /></div>' +
      '<div><label for="hubEmBody">Message</label><textarea id="hubEmBody" placeholder="Plain text is fine. Keep it warm and clear."></textarea></div>' +
      '<div><label>Preview</label><div class="hub-ei-preview" id="hubEmPreview" aria-live="polite"></div></div>' +
      "</div>" +
      '<label class="hub-ei-confirm"><input type="checkbox" id="hubEmConfirm" />' +
      "<span>I understand this will queue email for the audience I chose.</span></label>" +
      '<div class="hub-ei-row"><button class="btn btn-primary" type="button" id="hubEmSend">Send email</button></div>' +
      '<p class="hub-ei-msg" id="hubEmMsg" aria-live="polite"></p>' +
      '<div class="hub-ei-history"><h3>Recent emails</h3><div id="hubEmHistory"><p class="empty">Loading…</p></div></div>' +
      "</div>";

    ["active", "officers", "chairs", "selected"].forEach(function (a) {
      var btn = document.getElementById("hubEmAud_" + a);
      if (btn) btn.addEventListener("click", function () { setAudience(a); });
    });
    var search = document.getElementById("hubEmSearch");
    var searchTimer = null;
    if (search) {
      search.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          searchRoster(client).catch(function () {});
        }, 220);
      });
    }
    document.getElementById("hubEmSend").addEventListener("click", function () { sendEmail(client); });
    ["hubEmSubject", "hubEmBody"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", updateEmailPreview);
    });
    setAudience("active");
    updateEmailPreview();
    await refreshAudienceCounts(client);
    await loadEmailHistory(client);
  }

  function levelLabel(level) {
    return LEVEL_LABEL[level] || level || "Full";
  }

  function money(amount) {
    var n = Number(amount);
    if (!isFinite(n)) return "";
    return "$" + n.toFixed(2);
  }

  function invoiceYear() {
    var n = parseInt(val("hubInvYear") || "2026", 10);
    if (!n || n < 2000 || n > 2100) return 2026;
    return n;
  }

  function excludeOfficers() {
    var el = document.getElementById("hubInvExclude");
    return el ? !!el.checked : true;
  }

  function isElectedOfficerTitle(title) {
    return String(title || "").split(/\s*·\s*/).some(function (part) {
      return /^(president|vice president|secretary|treasurer)$/i.test(part.trim());
    });
  }

  function quoteFor(level) {
    var key = LEVEL_LABEL[level] ? level : "full";
    var row = invState.catalog[key];
    if (!row) return { level: key, amount: null, zeffy_url: null, from_catalog: false };
    var url = row.zeffy_url == null ? "" : String(row.zeffy_url).trim();
    return {
      level: key,
      amount: Number(row.amount),
      zeffy_url: url || null,
      from_catalog: true
    };
  }

  function dueDateIso(dues, year) {
    var raw = dues && dues.due_date ? String(dues.due_date).slice(0, 10) : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return year + "-06-30";
  }

  function formatDue(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    return MONTHS[Number(m[2]) - 1] + " " + Number(m[3]) + ", " + m[1];
  }

  function classifyMember(m) {
    var dues = invState.duesByMember[m.id] || null;
    if (dues && dues.waiver_status === "applied") return { result: "skipped_waiver", dues: dues, quote: quoteFor(m.membership_level) };
    if (dues && dues.paid) return { result: "skipped_paid", dues: dues, quote: quoteFor(m.membership_level) };
    if (excludeOfficers() && isElectedOfficerTitle(m.officer_title)) {
      return { result: "skipped_officer", dues: dues, quote: quoteFor(m.membership_level) };
    }
    var quote = quoteFor(m.membership_level || "full");
    if (!quote.from_catalog) return { result: "skipped_no_catalog", dues: dues, quote: quote };
    if (!dues) return { result: "created", dues: null, quote: quote };
    return { result: "updated", dues: dues, quote: quote };
  }

  function resultLabel(result) {
    if (result === "created") return "Will create";
    if (result === "updated") return "Will update";
    if (result === "skipped_paid") return "Skip: paid";
    if (result === "skipped_waiver") return "Skip: applied waiver";
    if (result === "skipped_officer") return "Skip: elected officer";
    if (result === "skipped_no_catalog") return "Skip: no catalog rate";
    return result || "";
  }

  function previewFor(ids) {
    var counts = {
      created: 0, updated: 0, skipped_paid: 0, skipped_waiver: 0,
      skipped_officer: 0, skipped_no_catalog: 0, skipped_missing: 0, missing_url: 0
    };
    var byId = {};
    invState.roster.forEach(function (m) { byId[m.id] = m; });
    ids.forEach(function (id) {
      var m = byId[id];
      if (!m) { counts.skipped_missing += 1; return; }
      var c = classifyMember(m);
      if (counts[c.result] != null) counts[c.result] += 1;
      if ((c.result === "created" || c.result === "updated") && c.quote && !c.quote.zeffy_url &&
          (c.quote.level === "associate" || c.quote.level === "auxiliary")) {
        counts.missing_url += 1;
      }
    });
    return counts;
  }

  function visibleMembers() {
    var q = val("hubInvSearch").toLowerCase();
    var level = val("hubInvLevel") || "full";
    var rows = invState.roster.filter(function (m) {
      var dues = invState.duesByMember[m.id];
      if (invState.filter === "unpaid") return !!(dues && !dues.paid);
      if (invState.filter === "norow") return !dues;
      if (invState.filter === "level") return (m.membership_level || "full") === level;
      var blob = ((m.first_name || "") + " " + (m.last_name || "") + " " + (m.email || "") + " " + (m.officer_title || "")).toLowerCase();
      if (!q) return false;
      return blob.indexOf(q) !== -1;
    });
    rows.sort(function (a, b) {
      var ln = String(a.last_name || "").localeCompare(String(b.last_name || ""));
      if (ln) return ln;
      return String(a.first_name || "").localeCompare(String(b.first_name || ""));
    });
    return rows;
  }

  function paintCatalog() {
    var box = document.getElementById("hubInvCatalog");
    var warn = document.getElementById("hubInvUrlWarn");
    if (!box) return;
    var year = invoiceYear();
    var missing = [];
    box.innerHTML = "<b>" + year + " dues catalog</b>" + LEVELS.map(function (lv) {
      var q = quoteFor(lv.id);
      var link = !q.from_catalog ? "No catalog row" : (q.zeffy_url ? "Zeffy link ready" : "No Zeffy link yet");
      if (q.from_catalog && !q.zeffy_url && (lv.id === "associate" || lv.id === "auxiliary")) missing.push(lv.label);
      return "<div>" + esc(lv.label) + " · " + (q.from_catalog ? esc(money(q.amount)) : "—") + " · " + esc(link) + "</div>";
    }).join("");
    if (warn) {
      warn.textContent = missing.length
        ? missing.join(" and ") + (missing.length > 1 ? " have" : " has") +
          " no Zeffy link yet. Emails for those levels will not include a pay button."
        : "";
    }
  }

  function paintPreview() {
    var box = document.getElementById("hubInvPreview");
    var count = document.getElementById("hubInvSelCount");
    var ids = selectedIds(invState.selected);
    if (count) count.textContent = ids.length + " selected";
    if (!box) return;
    if (!ids.length) {
      box.textContent = "Select members to preview how many invoices will be created, updated, or skipped.";
      return;
    }
    var c = previewFor(ids);
    var text = "Preview for " + ids.length + " selected: create " + c.created +
      ", update " + c.updated +
      ". Skips: paid " + c.skipped_paid +
      ", applied waiver " + c.skipped_waiver +
      ", elected officer " + c.skipped_officer +
      ", no catalog " + c.skipped_no_catalog +
      (c.skipped_missing ? ", missing " + c.skipped_missing : "") + ".";
    if (c.missing_url) {
      text += " " + c.missing_url + " associate or auxiliary invoice(s) have no Zeffy link. Those emails will not include a pay button.";
    }
    box.textContent = text;
  }

  function renderInvoiceList(client) {
    var target = document.getElementById("hubInvList");
    if (!target) return;
    var scroll = target.scrollTop;
    var rows = visibleMembers();
    if (invState.filter === "roster" && !val("hubInvSearch")) {
      target.innerHTML = '<p class="empty" style="padding:12px;">Type a name or email to pick from the roster.</p>';
      paintPreview();
      return;
    }
    if (!rows.length) {
      target.innerHTML = '<p class="empty" style="padding:12px;">No members match.</p>';
      paintPreview();
      return;
    }
    target.innerHTML = rows.map(function (m) {
      var c = classifyMember(m);
      var q = c.quote || quoteFor(m.membership_level);
      var checked = invState.selected[m.id] ? " checked" : "";
      var options = LEVELS.map(function (lv) {
        var sel = (m.membership_level || "full") === lv.id ? " selected" : "";
        return '<option value="' + lv.id + '"' + sel + ">" + esc(lv.label) + "</option>";
      }).join("");
      var link = !q.from_catalog ? "No catalog rate for this year" :
        (q.zeffy_url ? '<a href="' + esc(q.zeffy_url) + '" target="_blank" rel="noopener">Zeffy link</a>' : "No Zeffy link yet");
      var duesBit = !c.dues ? "No dues row" : (c.dues.paid ? "Paid" : "Unpaid " + money(c.dues.amount));
      return '<div class="hub-ei-item">' +
        '<input type="checkbox" data-id="' + esc(m.id) + '" aria-label="' + esc((m.first_name || "") + " " + (m.last_name || "")) + '"' + checked + " />" +
        "<div><b>" + esc(m.first_name || "") + " " + esc(m.last_name || "") + "</b>" +
        '<div class="meta">' + esc(m.email || "No email") +
        (m.officer_title ? " · " + esc(m.officer_title) : "") +
        " · " + esc(duesBit) + "</div>" +
        '<label>Membership level <select class="hub-ei-levelsel" data-level-for="' + esc(m.id) + '">' + options + "</select></label>" +
        '<div class="meta">Quote: ' + esc(levelLabel(q.level)) + " · " + (q.from_catalog ? esc(money(q.amount)) : "—") + " · " + link + "</div>" +
        '<div class="meta">' + esc(resultLabel(c.result)) + "</div></div></div>";
    }).join("");
    target.scrollTop = scroll;
    target.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var mid = cb.getAttribute("data-id");
        if (cb.checked) invState.selected[mid] = true;
        else delete invState.selected[mid];
        paintPreview();
      });
    });
    target.querySelectorAll("select[data-level-for]").forEach(function (sel) {
      sel.addEventListener("change", function () {
        changeMemberLevel(client, sel.getAttribute("data-level-for"), sel.value, sel);
      });
    });
    paintPreview();
  }

  async function rowsOf(builder) {
    var res = await builder;
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function paged(client, table, columns, apply) {
    var size = 1000;
    var start = 0;
    var all = [];
    while (true) {
      var q = client.from(table).select(columns);
      if (apply) q = apply(q);
      var res = await q.range(start, start + size - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      all = all.concat(batch);
      if (batch.length < size) break;
      start += size;
    }
    return all;
  }

  async function loadInvoiceData(client) {
    var year = invoiceYear();
    var catalogRows = await rowsOf(
      client.from("kos_dues_catalog")
        .select("membership_year, level, amount, zeffy_url, active")
        .eq("membership_year", year)
        .eq("active", true)
    );
    invState.catalog = {};
    catalogRows.forEach(function (row) {
      if (row && row.level) invState.catalog[row.level] = row;
    });
    invState.roster = await paged(
      client,
      "members",
      "id, first_name, last_name, email, membership_level, officer_title, membership_status",
      function (q) {
        return q.is("merged_into", null)
          .in("membership_status", ["active", "lapsed", "pending-renewal"])
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });
      }
    );
    var duesRows = await paged(
      client,
      "dues_payments",
      "id, member_id, membership_year, amount, paid, due_date, waiver_status, membership_level",
      function (q) { return q.eq("membership_year", year); }
    );
    invState.duesByMember = {};
    duesRows.forEach(function (d) {
      if (d && d.member_id) invState.duesByMember[d.member_id] = d;
    });
    paintCatalog();
    renderInvoiceList(client);
  }

  async function changeMemberLevel(client, memberId, level, sel) {
    var member = null;
    invState.roster.forEach(function (m) { if (m.id === memberId) member = m; });
    var previous = member ? (member.membership_level || "full") : "full";
    if (sel) sel.disabled = true;
    setMsg("hubInvMsg", "");
    try {
      var res = await client.rpc("kos_set_membership_level", {
        p_member_id: memberId,
        p_level: level
      });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not change level.");
      if (member) member.membership_level = data.membership_level || level;
      setMsg("hubInvMsg", data.message || "Level updated.", "ok");
      renderInvoiceList(client);
    } catch (e) {
      if (sel) { sel.value = previous; sel.disabled = false; }
      setMsg("hubInvMsg", "Could not change level: " + ((e && e.message) || e), "err");
    }
  }

  function setInvFilter(f) {
    invState.filter = f;
    ["unpaid", "norow", "level", "roster"].forEach(function (a) {
      var btn = document.getElementById("hubInvFilt_" + a);
      if (btn) btn.classList.toggle("on", a === f);
    });
    var sw = document.getElementById("hubInvSearchWrap");
    var lw = document.getElementById("hubInvLevelWrap");
    if (sw) sw.style.display = f === "roster" ? "" : "none";
    if (lw) lw.style.display = f === "level" ? "" : "none";
  }

  function invoiceEmailHtml(sample, year, level, amount, dueIso, url) {
    var hi = sample ? ("Hi " + esc(sample.first_name || "friend") + ",") : "Hi,";
    var html =
      "<p>" + hi + "</p>" +
      "<p>This is your Krewe of Shamrock membership invoice for <b>" + year + "</b>.</p>" +
      "<p><b>Membership level:</b> " + esc(levelLabel(level)) + "</p>" +
      "<p><b>Amount due:</b> " + esc(money(amount)) + "</p>" +
      "<p><b>Due date:</b> " + esc(formatDue(dueIso)) + "</p>";
    if (url) {
      html +=
        "<p>Please pay securely through our Zeffy membership form (no card numbers are collected in the Member Hub):</p>" +
        '<p style="margin:18px 0;"><a href="' + esc(url) + '" ' +
        'style="display:inline-block;background:#14532d;color:#fff;padding:12px 18px;border-radius:999px;' +
        'text-decoration:none;font-weight:700;">Pay dues on Zeffy</a></p>';
    } else {
      html +=
        "<p>A Zeffy pay link for this membership level is not set up yet. Please contact the treasurer at " +
        "treasurer@kreweofshamrock.com before you pay. Do not send card numbers by email.</p>";
    }
    html += "<p>If you already paid, thank you. You can ignore this note.</p><p>Slainte,<br>Krewe of Shamrock</p>";
    return html;
  }

  async function emailLevelInvoices(client, details, year) {
    var byId = {};
    invState.roster.forEach(function (m) { byId[m.id] = m; });
    var groups = {};
    var order = [];
    (details || []).forEach(function (d) {
      if (!d || (d.result !== "created" && d.result !== "updated")) return;
      var member = byId[d.member_id];
      if (!member || !member.email || member.email.indexOf("@") < 0) return;
      if (invState.duesByMember[d.member_id] && invState.duesByMember[d.member_id].paid) return;
      var level = d.membership_level || member.membership_level || "full";
      var quote = quoteFor(level);
      var dueIso = dueDateIso(d.result === "created" ? null : invState.duesByMember[d.member_id], year);
      var amount = d.amount;
      var key = [level, amount, dueIso, quote.zeffy_url || ""].join("|");
      if (!groups[key]) {
        groups[key] = {
          level: level,
          amount: amount,
          dueIso: dueIso,
          url: quote.zeffy_url,
          ids: [],
          sample: null
        };
        order.push(key);
      }
      groups[key].ids.push(d.member_id);
      if (groups[key].ids.length === 1) groups[key].sample = member;
      else groups[key].sample = null;
    });
    var emailed = 0;
    var failed = 0;
    var subject = "Krewe of Shamrock dues invoice (" + year + ")";
    for (var i = 0; i < order.length; i++) {
      var g = groups[order[i]];
      var res = await client.rpc("officer_send_member_email", {
        p_subject: subject,
        p_body_html: invoiceEmailHtml(g.sample, year, g.level, g.amount, g.dueIso, g.url),
        p_audience: "selected",
        p_member_ids: g.ids
      });
      if (res.error || (res.data && res.data.ok === false)) failed += g.ids.length;
      else emailed += (res.data && res.data.recipient_count != null) ? res.data.recipient_count : g.ids.length;
    }
    return { emailed: emailed, failed: failed };
  }

  async function loadInvoiceHistory(client) {
    var target = document.getElementById("hubInvHistory");
    if (!target) return;
    try {
      var res = await client.rpc("officer_list_outreach_log", { p_kind: "invoice", p_limit: 30 });
      if (res.error) throw res.error;
      var items = (res.data && res.data.items) || [];
      if (!items.length) {
        target.innerHTML = '<p class="empty">No invoices logged yet.</p>';
        return;
      }
      target.innerHTML = items.map(function (m) {
        var meta = m.meta || {};
        return (
          '<div class="hub-ei-hrow"><b>' + esc(m.subject || "Invoices") + "</b>" +
          '<div style="color:var(--muted);font-size:13px;margin-top:2px;">' +
          esc(when(m.created_at)) +
          " · " + (m.recipient_count != null ? m.recipient_count + " members" : "") +
          (meta.emailed != null ? " · emailed " + meta.emailed : "") +
          "</div></div>"
        );
      }).join("");
    } catch (e) {
      target.innerHTML = '<p class="empty">Could not load history.</p>';
    }
  }

  async function sendInvoices(client) {
    var ids = selectedIds(invState.selected);
    var btn = document.getElementById("hubInvSend");
    var confirm = document.getElementById("hubInvConfirm");
    if (!ids.length) { setMsg("hubInvMsg", "Select at least one member.", "err"); return; }
    if (!confirm || !confirm.checked) {
      setMsg("hubInvMsg", "Please confirm before creating invoices.", "err");
      return;
    }
    var year = invoiceYear();
    var exclude = excludeOfficers();
    var sendEmail = !!(document.getElementById("hubInvEmail") && document.getElementById("hubInvEmail").checked);
    var preview = previewFor(ids);
    var prompt = "Create level invoices for " + year + ": " + preview.created + " new, " +
      preview.updated + " updates. Skips stay unpaid or untouched.";
    if (sendEmail) prompt += " Email notices will go only to members whose invoice is created or updated.";
    if (preview.missing_url) prompt += " Some associate or auxiliary invoices have no Zeffy link.";
    if (!window.confirm(prompt)) return;
    if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
    setMsg("hubInvMsg", "");
    try {
      var res = await client.rpc("kos_create_level_invoices", {
        p_member_ids: ids,
        p_year: year,
        p_exclude_elected_officers: exclude
      });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not create invoices.");
      var emailed = 0;
      var emailFailed = 0;
      if (sendEmail) {
        var mail = await emailLevelInvoices(client, data.details || [], year);
        emailed = mail.emailed;
        emailFailed = mail.failed;
      }
      var logged = true;
      try {
        var logRes = await client.from("officer_outreach_log").insert({
          kind: "invoice",
          audience: "level",
          subject: "Level invoices " + year,
          body_html: "",
          recipient_count: (data.created || 0) + (data.updated || 0),
          member_ids: ids,
          meta: {
            year: year,
            created: data.created || 0,
            updated: data.updated || 0,
            skipped_paid: data.skipped_paid || 0,
            skipped_waiver: data.skipped_waiver || 0,
            skipped_officer: data.skipped_officer || 0,
            skipped_no_catalog: data.skipped_no_catalog || 0,
            emailed: emailed,
            exclude_elected_officers: exclude,
            send_email: sendEmail
          }
        });
        if (logRes && logRes.error) logged = false;
      } catch (logErr) {
        logged = false;
      }
      var msg = data.message || "Invoices saved.";
      if (sendEmail) msg += " Queued " + emailed + " email notice(s).";
      if (emailFailed) msg += " " + emailFailed + " email(s) could not be queued.";
      if (!logged) msg += " Recent history could not be updated.";
      setMsg("hubInvMsg", msg, emailFailed ? "err" : "ok");
      invState.selected = {};
      if (confirm) confirm.checked = false;
      await loadInvoiceData(client);
      await loadInvoiceHistory(client);
    } catch (e) {
      setMsg("hubInvMsg", "Could not create: " + ((e && e.message) || e), "err");
    }
    if (btn) { btn.disabled = false; btn.textContent = "Create invoices"; }
  }

  async function loadInvoiceCard(client) {
    var card = ensureCard("hubSendInvoices");
    if (!card) return;
    card.innerHTML =
      '<div class="app-head"><span class="ic">🧾</span><div><h2>Send invoices</h2>' +
      "<small>Create level-based dues invoices and optionally email the catalog pay link</small></div></div>" +
      '<div class="app-body hub-ei">' +
      '<p class="hub-ei-note">Amounts come from the dues catalog for each member\'s level. No card numbers are collected here. Paid rows and applied waivers are skipped and never emailed.</p>' +
      '<div class="hub-ei-catalog" id="hubInvCatalog">Loading catalog…</div>' +
      '<p class="hub-ei-warn" id="hubInvUrlWarn"></p>' +
      '<div class="hub-ei-grid">' +
      "<div><label for=\"hubInvYear\">Membership year</label>" +
      '<input id="hubInvYear" type="number" min="2000" max="2100" value="2026" /></div>' +
      "<div><label>Who to invoice</label>" +
      '<div class="hub-ei-pills">' +
      '<button type="button" class="hub-ei-pill on" id="hubInvFilt_unpaid">Unpaid</button>' +
      '<button type="button" class="hub-ei-pill" id="hubInvFilt_norow">No dues row</button>' +
      '<button type="button" class="hub-ei-pill" id="hubInvFilt_level">By level</button>' +
      '<button type="button" class="hub-ei-pill" id="hubInvFilt_roster">Roster pick</button>' +
      "</div></div>" +
      '<div id="hubInvLevelWrap" style="display:none;">' +
      '<label for="hubInvLevel">Level</label>' +
      '<select id="hubInvLevel">' +
      '<option value="full">Full</option>' +
      '<option value="associate">Associate</option>' +
      '<option value="loa">Leave of absence</option>' +
      '<option value="auxiliary">Auxiliary</option>' +
      "</select></div>" +
      '<div id="hubInvSearchWrap" style="display:none;">' +
      '<label for="hubInvSearch">Search roster</label>' +
      '<input id="hubInvSearch" type="search" placeholder="Name or email" autocomplete="off" /></div>' +
      '<div class="hub-ei-list hub-ei-invlist" id="hubInvList"><p class="empty" style="padding:12px;">Loading…</p></div>' +
      '<div class="hub-ei-row">' +
      '<button class="btn" type="button" id="hubInvSelectShown">Select shown</button>' +
      '<button class="btn" type="button" id="hubInvClear">Clear selection</button>' +
      "</div>" +
      '<p class="hub-ei-note" id="hubInvSelCount">0 selected</p>' +
      '<div class="hub-ei-counts" id="hubInvPreview" aria-live="polite">Select members to preview how many invoices will be created, updated, or skipped.</div>' +
      "</div>" +
      '<label class="hub-ei-confirm"><input type="checkbox" id="hubInvExclude" checked />' +
      "<span>Exclude elected officers (President, Vice President, Secretary, Treasurer)</span></label>" +
      '<label class="hub-ei-confirm"><input type="checkbox" id="hubInvEmail" checked />' +
      "<span>Also email a notice with level, amount, due date, and the catalog Zeffy link</span></label>" +
      '<label class="hub-ei-confirm"><input type="checkbox" id="hubInvConfirm" />' +
      "<span>I confirm these invoice records and any emails look right.</span></label>" +
      '<div class="hub-ei-row"><button class="btn btn-primary" type="button" id="hubInvSend">Create invoices</button></div>' +
      '<p class="hub-ei-msg" id="hubInvMsg" aria-live="polite"></p>' +
      '<div class="hub-ei-history"><h3>Recent invoice batches</h3><div id="hubInvHistory"><p class="empty">Loading…</p></div></div>' +
      "</div>";

    ["unpaid", "norow", "level", "roster"].forEach(function (f) {
      var btn = document.getElementById("hubInvFilt_" + f);
      if (!btn) return;
      btn.addEventListener("click", function () {
        setInvFilter(f);
        renderInvoiceList(client);
      });
    });
    var search = document.getElementById("hubInvSearch");
    if (search) search.addEventListener("input", function () { renderInvoiceList(client); });
    var levelEl = document.getElementById("hubInvLevel");
    if (levelEl) levelEl.addEventListener("change", function () { renderInvoiceList(client); });
    var yearEl = document.getElementById("hubInvYear");
    if (yearEl) {
      yearEl.addEventListener("change", function () {
        invState.selected = {};
        loadInvoiceData(client).catch(function (e) {
          setMsg("hubInvMsg", (e && e.message) || "Could not load the catalog.", "err");
        });
      });
    }
    var excludeEl = document.getElementById("hubInvExclude");
    if (excludeEl) excludeEl.addEventListener("change", function () { renderInvoiceList(client); });
    document.getElementById("hubInvSelectShown").addEventListener("click", function () {
      visibleMembers().forEach(function (m) { invState.selected[m.id] = true; });
      renderInvoiceList(client);
    });
    document.getElementById("hubInvClear").addEventListener("click", function () {
      invState.selected = {};
      renderInvoiceList(client);
    });
    document.getElementById("hubInvSend").addEventListener("click", function () { sendInvoices(client); });
    setInvFilter("unpaid");
    try {
      await loadInvoiceData(client);
    } catch (e) {
      setMsg("hubInvMsg", (e && e.message) || "Could not load members or the dues catalog.", "err");
    }
    await loadInvoiceHistory(client);
  }

  async function boot() {
    injectCss();
    var client = window.__kosSb || null;
    for (var i = 0; i < 40 && !client; i++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      client = window.__kosSb || null;
    }
    if (!client) return;
    var isOfficer = false;
    try {
      var res = await client.rpc("is_krewe_officer");
      isOfficer = !!res.data;
    } catch (e) {
      isOfficer = false;
    }
    if (!isOfficer) return;
    await loadEmailCard(client);
    await loadInvoiceCard(client);
    if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();
  }

  var _unlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof _unlock === "function") _unlock();
    setTimeout(boot, 160);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 600); });
  } else {
    setTimeout(boot, 600);
  }
})();
