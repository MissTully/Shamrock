/* Krewe Chat v1, companion to members-desk.js.
   Channels (General, Parade day), text plus one optional photo, a small set
   of emoji reactions, reply-to, officer pins, authors delete their own
   messages, and the bell unread count. No moderation tools, by request.
   Data lives in chat_* tables (sql/kos_krewe_chat_v1.sql). RLS lets only
   signed-in active members read or write; photos sit in the PRIVATE
   chat-photos bucket and load through short-lived signed URLs.
   Updates arrive over Supabase Realtime, with a 15 second poll as backup. */
(function () {
  "use strict";

  var BUCKET = "chat-photos";
  var EMOJI = ["☘️", "❤️", "😂", "👍", "🎉", "🍀"];
  var POLL_MS = 15000;
  var UNREAD_MS = 60000;
  var PAGE = 80;

  var CSS = [
    ".kc-veil{position:fixed;inset:0;z-index:8000;background:#0f2b1d;color:#fff;display:flex;flex-direction:column;}",
    ".kc-veil[hidden]{display:none;}",
    ".kc-top{display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 10px;background:#123524;border-bottom:1px solid rgba(226,193,90,.35);}",
    ".kc-back{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.08);color:#f6e7b8;font-size:22px;cursor:pointer;flex:none;}",
    ".kc-title{flex:1;min-width:0;}",
    ".kc-title h2{margin:0;font-family:var(--display);font-size:22px;color:#fff;line-height:1.1;}",
    ".kc-title p{margin:2px 0 0;font-size:12.5px;color:#e2c15a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".kc-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 12px 8px;}",
    ".kc-chan{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fbf7ec;color:#23291f;border:1px solid rgba(168,128,28,.45);border-radius:16px;padding:14px;margin:0 0 10px;font:inherit;cursor:pointer;min-height:64px;}",
    ".kc-chan .ic{width:44px;height:44px;border-radius:14px;background:#123524;color:#f0d78c;display:grid;place-items:center;font-size:20px;flex:none;}",
    ".kc-chan b{display:block;font-family:var(--display);color:var(--green-800,#1b4d33);font-size:17px;}",
    ".kc-chan small{display:block;color:#6b6656;font-size:13px;margin-top:2px;}",
    ".kc-chan .n{margin-left:auto;background:#e23d3d;color:#fff;border-radius:999px;min-width:24px;height:24px;padding:0 7px;display:grid;place-items:center;font-size:12.5px;font-weight:700;}",
    ".kc-note{font-size:13.5px;color:rgba(255,255,255,.75);margin:8px 2px 0;line-height:1.45;}",
    ".kc-pins{background:#fbf2d6;color:#3a3220;border-bottom:1px solid rgba(168,128,28,.5);padding:8px 12px;font-size:13.5px;}",
    ".kc-pins[hidden]{display:none;}",
    ".kc-pins b{font-family:var(--display);color:#8a6a14;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:2px;}",
    ".kc-pins button{display:block;width:100%;text-align:left;background:transparent;border:0;padding:4px 0;font:inherit;color:#23291f;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".kc-msg{display:flex;gap:10px;margin:0 0 12px;align-items:flex-start;}",
    ".kc-msg.flash .kc-card{box-shadow:0 0 0 3px #e2c15a;}",
    ".kc-av{width:38px;height:38px;border-radius:50%;flex:none;border:2px solid rgba(226,193,90,.6);background:#1b4d33;color:#f6efdc;display:grid;place-items:center;font-family:var(--display);font-size:13px;overflow:hidden;cursor:pointer;padding:0;}",
    ".kc-av img{width:100%;height:100%;object-fit:cover;}",
    ".kc-card{flex:1;min-width:0;background:#fbf7ec;color:#23291f;border-radius:4px 16px 16px 16px;padding:8px 12px 8px;border:1px solid rgba(168,128,28,.35);}",
    ".kc-msg.mine .kc-card{background:#f3ead0;}",
    ".kc-meta{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}",
    ".kc-name{background:none;border:0;padding:0;font:inherit;font-family:var(--display);color:var(--green-800,#1b4d33);font-size:14.5px;cursor:pointer;}",
    ".kc-time{font-size:11.5px;color:#7b7563;}",
    ".kc-tag{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#8a6a14;background:#f6e7b8;border-radius:999px;padding:1px 7px;}",
    ".kc-text{margin:3px 0 0;font-size:15px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;}",
    ".kc-quote{display:block;width:100%;text-align:left;margin:4px 0 2px;border:0;border-left:3px solid #c9a23a;background:rgba(168,128,28,.1);border-radius:6px;padding:4px 8px;font:inherit;font-size:13px;color:#5a5440;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".kc-photo{display:block;margin:6px 0 2px;max-width:100%;max-height:280px;border-radius:12px;border:1px solid rgba(168,128,28,.35);background:#e9e1c8;}",
    ".kc-rx{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center;}",
    ".kc-rx button{min-height:32px;border-radius:999px;border:1px solid rgba(168,128,28,.4);background:#fff;padding:2px 9px;font-size:14px;cursor:pointer;color:#23291f;}",
    ".kc-rx button.on{background:#123524;color:#f6e7b8;border-color:#123524;}",
    ".kc-rx .kc-more{color:#6b6656;font-size:13px;}",
    ".kc-sheet{position:fixed;inset:0;z-index:8100;background:rgba(5,16,10,.55);display:flex;align-items:flex-end;}",
    ".kc-sheet[hidden]{display:none;}",
    ".kc-sheet-card{width:100%;background:#fbf7ec;color:#23291f;border-radius:20px 20px 0 0;padding:14px 14px calc(env(safe-area-inset-bottom,0px) + 14px);border-top:2px solid #c9a23a;max-height:80vh;overflow:auto;}",
    ".kc-sheet-card h3{margin:0 0 8px;font-family:var(--display);color:var(--green-800,#1b4d33);font-size:18px;}",
    ".kc-emoji{display:flex;gap:8px;justify-content:space-between;margin:0 0 10px;}",
    ".kc-emoji button{flex:1;min-height:48px;font-size:22px;border-radius:14px;border:1px solid rgba(168,128,28,.35);background:#fff;cursor:pointer;}",
    ".kc-act{display:block;width:100%;text-align:left;min-height:48px;border:0;border-top:1px solid rgba(168,128,28,.25);background:transparent;font:inherit;font-size:15.5px;color:var(--green-800,#1b4d33);cursor:pointer;padding:0 4px;}",
    ".kc-act.warn{color:#a3271d;}",
    ".kc-sheet textarea{width:100%;min-height:84px;border-radius:12px;border:1px solid rgba(168,128,28,.5);padding:10px;font:inherit;font-size:15px;box-sizing:border-box;}",
    ".kc-row{display:flex;gap:8px;margin-top:10px;}",
    ".kc-btn{flex:1;min-height:46px;border-radius:999px;border:1px solid rgba(168,128,28,.45);background:#f0e8d2;color:var(--green-800,#1b4d33);font-family:var(--display);font-size:15px;cursor:pointer;}",
    ".kc-btn.go{background:#123524;color:#f6e7b8;border-color:#123524;}",
    ".kc-compose{background:#123524;border-top:1px solid rgba(226,193,90,.35);padding:8px 10px calc(env(safe-area-inset-bottom,0px) + 8px);}",
    ".kc-replying{display:flex;align-items:center;gap:8px;font-size:13px;color:#f0d78c;margin:0 0 6px;}",
    ".kc-replying[hidden],.kc-attach[hidden]{display:none;}",
    ".kc-replying span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
    ".kc-replying button,.kc-attach button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;min-width:36px;min-height:36px;}",
    ".kc-attach{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:13px;color:#f6efdc;}",
    ".kc-attach img{width:44px;height:44px;object-fit:cover;border-radius:8px;}",
    ".kc-bar{display:flex;gap:8px;align-items:flex-end;}",
    ".kc-bar textarea{flex:1;min-height:44px;max-height:120px;resize:none;border-radius:22px;border:1px solid rgba(226,193,90,.45);background:#fbf7ec;color:#23291f;padding:11px 14px;font:inherit;font-size:15px;box-sizing:border-box;}",
    ".kc-icbtn{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#f6e7b8;font-size:20px;cursor:pointer;flex:none;display:grid;place-items:center;}",
    ".kc-icbtn.send{background:#c9a23a;color:#123524;font-weight:700;}",
    ".kc-empty{color:rgba(255,255,255,.75);text-align:center;margin:30px 10px;font-size:15px;}",
    ".kc-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:#fbf7ec;color:#123524;border:1px solid #c9a23a;border-radius:999px;padding:9px 16px;font-size:14px;z-index:8200;box-shadow:0 8px 20px rgba(0,0,0,.3);}",
    ".app-tile-badge{position:absolute;top:-4px;right:6px;background:#e23d3d;color:#fff;border-radius:999px;min-width:20px;height:20px;padding:0 6px;font-size:11.5px;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #123524;}",
    ".app-tile{position:relative;}",
    ".app-bell-count{position:absolute;top:3px;right:2px;background:#e23d3d;color:#fff;border-radius:999px;min-width:18px;height:18px;padding:0 5px;font-size:11px;font-weight:700;display:grid;place-items:center;box-shadow:0 0 0 2px #123524;}",
    ".app-bell-count[hidden]{display:none;}"
  ].join("\n");

  var st = {
    open: false, view: "list", channel: null, channels: [], messages: [],
    reactions: {}, people: {}, photoUrls: {}, replyTo: null, file: null,
    unread: {}, unreadTotal: 0, poll: null, rt: null, fixture: null
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function me() { return (window.kosProfile || {}).member_id || null; }
  function isOfficer() { return typeof window.kosIsOfficer === "function" && !!window.kosIsOfficer(); }
  function toast(t) {
    var el = document.createElement("div");
    el.className = "kc-toast"; el.textContent = t; el.setAttribute("role", "status");
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }
  function when(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var now = new Date();
    var t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return t;
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + t;
  }
  function nameOf(id) {
    var p = st.people[id];
    if (!p) return "Krewe member";
    return ((p.first_name || "") + " " + (p.last_name || "")).trim() || "Krewe member";
  }
  function initials(id) {
    var p = st.people[id] || {};
    return ((p.first_name || "?")[0] + ((p.last_name || "")[0] || "")).toUpperCase();
  }
  function snippet(m) {
    if (!m) return "";
    var t = (m.body || "").trim();
    return t ? (t.length > 80 ? t.slice(0, 80) + "…" : t) : "Photo";
  }

  async function getClient() {
    var c = window.__kosSb || null;
    for (var i = 0; i < 30 && !c; i++) {
      await new Promise(function (r) { setTimeout(r, 200); });
      c = window.__kosSb || null;
    }
    return c;
  }

  /* ---------------- data layer (live or preview fixture) ---------------- */
  var live = {
    channels: async function (sb) {
      var r = await sb.from("chat_channels").select("id,name,description,sort_order").order("sort_order");
      if (r.error) throw r.error; return r.data || [];
    },
    messages: async function (sb, ch) {
      var r = await sb.from("chat_messages")
        .select("id,channel_id,member_id,body,photo_path,reply_to,pinned_at,created_at")
        .eq("channel_id", ch).order("created_at", { ascending: false }).limit(PAGE);
      if (r.error) throw r.error; return (r.data || []).reverse();
    },
    reactions: async function (sb, ids) {
      if (!ids.length) return [];
      var r = await sb.from("chat_reactions").select("message_id,member_id,emoji").in("message_id", ids);
      if (r.error) throw r.error; return r.data || [];
    },
    people: async function (sb, ids) {
      if (!ids.length) return [];
      var r = await sb.from("v_member_profiles").select("member_id,first_name,last_name,photo_url").in("member_id", ids);
      return r.data || [];
    },
    photoUrls: async function (sb, paths) {
      if (!paths.length) return {};
      var r = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
      var out = {};
      (r.data || []).forEach(function (x) { if (x.signedUrl) out[x.path] = x.signedUrl; });
      return out;
    },
    send: async function (sb, row, file) {
      if (file) {
        var u = await sb.auth.getUser();
        var uid = u && u.data && u.data.user && u.data.user.id;
        if (!uid) throw new Error("Please sign in again.");
        var ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        var path = uid + "/" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + "." + ext;
        var up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw up.error;
        row.photo_path = path;
      }
      var r = await sb.from("chat_messages").insert(row);
      if (r.error) throw r.error;
    },
    react: async function (sb, mid, emoji, on) {
      var r = on
        ? await sb.from("chat_reactions").insert({ message_id: mid, emoji: emoji })
        : await sb.from("chat_reactions").delete().eq("message_id", mid).eq("member_id", me()).eq("emoji", emoji);
      if (r.error) throw r.error;
    },
    remove: async function (sb, mid) {
      var r = await sb.from("chat_messages").delete().eq("id", mid);
      if (r.error) throw r.error;
    },
    rpc: async function (sb, fn, args) {
      var r = await sb.rpc(fn, args || {});
      if (r.error) throw r.error; return r.data;
    }
  };

  function fixtureApi() {
    var F = st.fixture;
    return {
      channels: async function () { return F.channels; },
      messages: async function (sb, ch) {
        return F.messages.filter(function (m) { return m.channel_id === ch; });
      },
      reactions: async function (sb, ids) { return F.reactions.filter(function (r) { return ids.indexOf(r.message_id) >= 0; }); },
      people: async function () { return F.people; },
      photoUrls: async function (sb, paths) { var o = {}; paths.forEach(function (p) { o[p] = F.photos[p] || p; }); return o; },
      send: async function (sb, row) {
        F.messages.push(Object.assign({ id: "m" + Date.now(), member_id: me(), created_at: new Date().toISOString() }, row));
      },
      react: async function (sb, mid, emoji, on) {
        if (on) F.reactions.push({ message_id: mid, member_id: me(), emoji: emoji });
        else F.reactions = F.reactions.filter(function (r) { return !(r.message_id === mid && r.member_id === me() && r.emoji === emoji); });
      },
      remove: async function (sb, mid) { F.messages = F.messages.filter(function (m) { return m.id !== mid; }); },
      rpc: async function (sb, fn, a) {
        var m = a && F.messages.find(function (x) { return x.id === a.p_message; });
        if (fn === "chat_set_pinned" && m) m.pinned_at = a.p_pinned ? new Date().toISOString() : null;
        if (fn === "chat_unread_count") return F.unread || 0;
        return null;
      }
    };
  }
  function api() { return st.fixture ? fixtureApi() : live; }
  async function client() { return st.fixture ? null : await getClient(); }

  /* ---------------- shell ---------------- */
  function ensureCss() {
    if (document.getElementById("kosChatCss")) return;
    var style = document.createElement("style");
    style.id = "kosChatCss"; style.textContent = CSS;
    document.head.appendChild(style);
  }
  function ensureShell() {
    if (document.getElementById("kosChat")) return;
    ensureCss();
    var veil = document.createElement("div");
    veil.className = "kc-veil"; veil.id = "kosChat"; veil.hidden = true;
    veil.setAttribute("role", "dialog"); veil.setAttribute("aria-modal", "true"); veil.setAttribute("aria-labelledby", "kcTitle");
    veil.innerHTML =
      '<header class="kc-top"><button type="button" class="kc-back" id="kcBack" aria-label="Back">‹</button>' +
      '<div class="kc-title"><h2 id="kcTitle">Krewe Chat</h2><p id="kcSub">Members only</p></div></header>' +
      '<div class="kc-pins" id="kcPins" hidden></div>' +
      '<div class="kc-body" id="kcBody" aria-live="polite"></div>' +
      '<div class="kc-compose" id="kcCompose" hidden>' +
        '<div class="kc-replying" id="kcReplying" hidden><span id="kcReplyText"></span><button type="button" id="kcReplyX" aria-label="Cancel reply">×</button></div>' +
        '<div class="kc-attach" id="kcAttach" hidden><img id="kcAttachImg" alt="" /><span>Photo ready</span><button type="button" id="kcAttachX" aria-label="Remove photo">×</button></div>' +
        '<div class="kc-bar" id="kcBar">' +
          '<button type="button" class="kc-icbtn" id="kcPhotoBtn" aria-label="Add a photo">📷</button>' +
          '<input type="file" id="kcFile" accept="image/*" hidden />' +
          '<textarea id="kcInput" rows="1" maxlength="2000" placeholder="Message the krewe" aria-label="Message"></textarea>' +
          '<button type="button" class="kc-icbtn send" id="kcSend" aria-label="Send">➤</button>' +
        "</div>" +
      "</div>" +
      '<div class="kc-sheet" id="kcSheet" hidden><div class="kc-sheet-card" id="kcSheetCard"></div></div>';
    document.body.appendChild(veil);

    document.getElementById("kcBack").addEventListener("click", function () {
      if (st.view === "channel") showList(); else closeChat();
    });
    document.getElementById("kcSheet").addEventListener("click", function (e) { if (e.target.id === "kcSheet") closeSheet(); });
    document.getElementById("kcReplyX").addEventListener("click", function () { setReply(null); });
    document.getElementById("kcAttachX").addEventListener("click", function () { setFile(null); });
    document.getElementById("kcPhotoBtn").addEventListener("click", function () { document.getElementById("kcFile").click(); });
    document.getElementById("kcFile").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (f && f.size > 5 * 1024 * 1024) { toast("Photos must be under 5 MB."); e.target.value = ""; return; }
      setFile(f || null);
    });
    document.getElementById("kcSend").addEventListener("click", send);
    document.getElementById("kcInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); send(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && st.open) { if (!document.getElementById("kcSheet").hidden) closeSheet(); else if (st.view === "channel") showList(); else closeChat(); }
    });
  }

  function openChat(channelId) {
    ensureShell();
    st.open = true;
    document.getElementById("kosChat").hidden = false;
    document.body.style.overflow = "hidden";
    if (channelId) openChannel(channelId); else showList();
    startPolling();
  }
  function closeChat() {
    st.open = false;
    var v = document.getElementById("kosChat"); if (v) v.hidden = true;
    document.body.style.overflow = "";
    stopPolling();
    refreshUnread();
  }

  async function showList() {
    st.view = "list"; st.channel = null;
    document.getElementById("kcTitle").textContent = "Krewe Chat";
    document.getElementById("kcSub").textContent = "Members only. Be kind, be craic.";
    document.getElementById("kcPins").hidden = true;
    document.getElementById("kcCompose").hidden = true;
    var body = document.getElementById("kcBody");
    try {
      var sb = await client();
      st.channels = await api().channels(sb);
    } catch (e) {
      body.innerHTML = '<p class="kc-empty">Chat is not available yet. Please try again soon.</p>';
      return;
    }
    body.innerHTML = st.channels.map(function (c) {
      var n = st.unread[c.id] || 0;
      return '<button type="button" class="kc-chan" data-kc-chan="' + esc(c.id) + '">' +
        '<span class="ic" aria-hidden="true">' + (c.id === "parade-day" ? "🥁" : "☘") + "</span>" +
        "<span><b>" + esc(c.name) + "</b><small>" + esc(c.description || "") + "</small></span>" +
        (n ? '<span class="n" aria-label="' + n + ' unread">' + (n > 99 ? "99+" : n) + "</span>" : "") +
        "</button>";
    }).join("") +
      '<p class="kc-note">Only signed-in members can see Krewe Chat. Tap ☺ ⋯ or long-press a message to react or reply.</p>';
    body.querySelectorAll("[data-kc-chan]").forEach(function (b) {
      b.addEventListener("click", function () { openChannel(b.getAttribute("data-kc-chan")); });
    });
  }

  async function openChannel(id) {
    st.view = "channel"; st.channel = id;
    var c = st.channels.find(function (x) { return x.id === id; }) || { name: id === "parade-day" ? "Parade day" : "General" };
    document.getElementById("kcTitle").textContent = c.name;
    document.getElementById("kcSub").textContent = c.description || "Krewe Chat";
    document.getElementById("kcCompose").hidden = false;
    document.getElementById("kcBody").innerHTML = '<p class="kc-empty">Loading…</p>';
    await loadChannel(true);
    try { var sb = await client(); await api().rpc(sb, "chat_mark_read", { p_channel: id }); } catch (e) {}
    st.unread[id] = 0;
    refreshUnread();
  }

  async function loadChannel(scrollEnd) {
    if (!st.channel) return;
    var sb = await client(), A = api();
    try {
      var msgs = await A.messages(sb, st.channel);
      var ids = msgs.map(function (m) { return m.id; });
      var rx = await A.reactions(sb, ids);
      var need = {};
      msgs.forEach(function (m) { if (!st.people[m.member_id]) need[m.member_id] = 1; });
      var ppl = await A.people(sb, Object.keys(need));
      ppl.forEach(function (p) { st.people[p.member_id] = p; });
      var paths = msgs.filter(function (m) { return m.photo_path && !st.photoUrls[m.photo_path]; }).map(function (m) { return m.photo_path; });
      Object.assign(st.photoUrls, await A.photoUrls(sb, paths));
      st.messages = msgs;
      st.reactions = {};
      rx.forEach(function (r) { (st.reactions[r.message_id] = st.reactions[r.message_id] || []).push(r); });
    } catch (e) {
      document.getElementById("kcBody").innerHTML = '<p class="kc-empty">Could not load messages. Please try again.</p>';
      return;
    }
    renderChannel(scrollEnd);
  }

  function avatar(id) {
    var p = st.people[id] || {};
    return '<button type="button" class="kc-av" data-kc-profile="' + esc(id) + '" aria-label="Open profile for ' + esc(nameOf(id)) + '">' +
      (p.photo_url ? '<img src="' + esc(p.photo_url) + '" alt="" />' : esc(initials(id))) + "</button>";
  }

  function renderChannel(scrollEnd) {
    var body = document.getElementById("kcBody");
    var nearEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    var byId = {};
    st.messages.forEach(function (m) { byId[m.id] = m; });
    var pins = st.messages.filter(function (m) { return m.pinned_at; });
    var pinBar = document.getElementById("kcPins");
    pinBar.hidden = !pins.length;
    pinBar.innerHTML = pins.length ? "<b>📌 Pinned</b>" + pins.map(function (m) {
      return '<button type="button" data-kc-jump="' + esc(m.id) + '">' + esc(nameOf(m.member_id)) + ": " + esc(snippet(m)) + "</button>";
    }).join("") : "";
    if (!st.messages.length) {
      body.innerHTML = '<p class="kc-empty">No messages yet. Say hello to the krewe!</p>';
    } else {
      body.innerHTML = st.messages.map(function (m) {
        var mine = m.member_id === me();
        var q = m.reply_to ? byId[m.reply_to] : null;
        var rx = st.reactions[m.id] || [];
        var counts = {};
        rx.forEach(function (r) { counts[r.emoji] = counts[r.emoji] || { n: 0, me: false }; counts[r.emoji].n++; if (r.member_id === me()) counts[r.emoji].me = true; });
        var rxHtml = EMOJI.filter(function (e) { return counts[e]; }).map(function (e) {
          return '<button type="button" class="' + (counts[e].me ? "on" : "") + '" data-kc-rx="' + esc(m.id) + '" data-e="' + e + '" aria-pressed="' + counts[e].me + '">' + e + " " + counts[e].n + "</button>";
        }).join("");
        return '<div class="kc-msg' + (mine ? " mine" : "") + '" id="kcm-' + esc(m.id) + '">' +
          avatar(m.member_id) +
          '<div class="kc-card" data-kc-msg="' + esc(m.id) + '">' +
            '<div class="kc-meta"><button type="button" class="kc-name" data-kc-profile="' + esc(m.member_id) + '">' + esc(nameOf(m.member_id)) + "</button>" +
            '<span class="kc-time">' + esc(when(m.created_at)) + "</span>" +
            (m.pinned_at ? '<span class="kc-tag">Pinned</span>' : "") + "</div>" +
            (m.reply_to ? '<button type="button" class="kc-quote" data-kc-jump="' + esc(m.reply_to) + '">↩ ' +
              (q ? esc(nameOf(q.member_id)) + ": " + esc(snippet(q)) : "Earlier message") + "</button>" : "") +
            (m.body ? '<p class="kc-text">' + esc(m.body) + "</p>" : "") +
            (m.photo_path && st.photoUrls[m.photo_path] ? '<img class="kc-photo" loading="lazy" alt="Photo from ' + esc(nameOf(m.member_id)) + '" src="' + esc(st.photoUrls[m.photo_path]) + '" />' : "") +
            '<div class="kc-rx">' + rxHtml + '<button type="button" class="kc-more" data-kc-menu="' + esc(m.id) + '" aria-label="React, reply, or more">☺ ⋯</button></div>' +
          "</div></div>";
      }).join("");
    }
    wireChannel();
    if (scrollEnd || nearEnd) body.scrollTop = body.scrollHeight;
  }

  function wireChannel() {
    var root = document.getElementById("kosChat");
    root.querySelectorAll("[data-kc-profile]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        if (typeof window.openMemberProfile === "function") window.openMemberProfile(b.getAttribute("data-kc-profile"));
      };
    });
    root.querySelectorAll("[data-kc-jump]").forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); jumpTo(b.getAttribute("data-kc-jump")); };
    });
    root.querySelectorAll("[data-kc-rx]").forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); toggleReact(b.getAttribute("data-kc-rx"), b.getAttribute("data-e")); };
    });
    root.querySelectorAll("[data-kc-menu]").forEach(function (b) {
      b.onclick = function (e) { e.stopPropagation(); openMenu(b.getAttribute("data-kc-menu")); };
    });
    root.querySelectorAll("[data-kc-msg]").forEach(function (c) {
      var t = null;
      c.addEventListener("touchstart", function () { t = setTimeout(function () { openMenu(c.getAttribute("data-kc-msg")); }, 500); }, { passive: true });
      c.addEventListener("touchend", function () { clearTimeout(t); });
      c.addEventListener("touchmove", function () { clearTimeout(t); }, { passive: true });
    });
  }

  function jumpTo(id) {
    var el = document.getElementById("kcm-" + id);
    if (!el) { toast("That message is older than what is loaded."); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash"); setTimeout(function () { el.classList.remove("flash"); }, 1400);
  }

  function msgById(id) { return st.messages.find(function (m) { return m.id === id; }); }

  function sheet(html) {
    var s = document.getElementById("kcSheet");
    document.getElementById("kcSheetCard").innerHTML = html;
    s.hidden = false;
  }
  function closeSheet() { document.getElementById("kcSheet").hidden = true; }

  function openMenu(id) {
    var m = msgById(id); if (!m) return;
    var mine = m.member_id === me(), off = isOfficer();
    var html = "<h3>" + esc(nameOf(m.member_id)) + "</h3>" +
      '<div class="kc-emoji">' + EMOJI.map(function (e) { return '<button type="button" data-kc-pick="' + e + '" aria-label="React ' + e + '">' + e + "</button>"; }).join("") + "</div>" +
      '<button type="button" class="kc-act" data-a="reply">↩ Reply</button>' +
      (off ? '<button type="button" class="kc-act" data-a="pin">' + (m.pinned_at ? "Unpin" : "📌 Pin to top") + "</button>" : "") +
      (mine ? '<button type="button" class="kc-act warn" data-a="delete">Delete my message</button>' : "") +
      '<button type="button" class="kc-act" data-a="close">Cancel</button>';
    sheet(html);
    var card = document.getElementById("kcSheetCard");
    card.querySelectorAll("[data-kc-pick]").forEach(function (b) {
      b.onclick = function () { closeSheet(); toggleReact(id, b.getAttribute("data-kc-pick"), true); };
    });
    card.querySelectorAll("[data-a]").forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute("data-a");
        if (a === "close") return closeSheet();
        if (a === "reply") { closeSheet(); setReply(m); document.getElementById("kcInput").focus(); return; }
        if (a === "delete") return confirmSheet("Delete this message?", "It is removed for everyone.", "Delete", function () { return act("remove", m.id); });
        if (a === "pin") { closeSheet(); return mod("chat_set_pinned", { p_message: m.id, p_pinned: !m.pinned_at }, m.pinned_at ? "Unpinned." : "Pinned."); }
      };
    });
  }

  function confirmSheet(title, text, label, fn) {
    sheet("<h3>" + esc(title) + '</h3><p style="margin:0 0 6px;font-size:14.5px;">' + esc(text) + "</p>" +
      '<div class="kc-row"><button type="button" class="kc-btn" id="kcNo">Cancel</button><button type="button" class="kc-btn go" id="kcYes">' + esc(label) + "</button></div>");
    document.getElementById("kcNo").onclick = closeSheet;
    document.getElementById("kcYes").onclick = async function () { closeSheet(); await fn(); };
  }

  async function act(kind, id) {
    try { var sb = await client(); await api()[kind](sb, id); await loadChannel(false); }
    catch (e) { toast("That did not work. Please try again."); }
  }
  async function mod(fn, args, ok) {
    try { var sb = await client(); await api().rpc(sb, fn, args); toast(ok); await loadChannel(false); }
    catch (e) { toast("Officers only, or the connection dropped."); }
  }
  async function toggleReact(id, emoji, forceOn) {
    var mine = (st.reactions[id] || []).some(function (r) { return r.member_id === me() && r.emoji === emoji; });
    if (forceOn && mine) return;
    try { var sb = await client(); await api().react(sb, id, emoji, !mine); await loadChannel(false); }
    catch (e) { toast("Could not save that reaction."); }
  }

  function setReply(m) {
    st.replyTo = m ? m.id : null;
    document.getElementById("kcReplying").hidden = !m;
    document.getElementById("kcReplyText").textContent = m ? "Replying to " + nameOf(m.member_id) + ": " + snippet(m) : "";
  }
  function setFile(f) {
    st.file = f;
    var box = document.getElementById("kcAttach");
    box.hidden = !f;
    if (f) document.getElementById("kcAttachImg").src = URL.createObjectURL(f);
    else document.getElementById("kcFile").value = "";
  }

  var sending = false;
  async function send() {
    if (sending) return;
    var input = document.getElementById("kcInput");
    var text = (input.value || "").trim();
    if (!text && !st.file) return;
    sending = true;
    var btn = document.getElementById("kcSend"); btn.disabled = true;
    try {
      var sb = await client();
      await api().send(sb, { channel_id: st.channel, body: text, reply_to: st.replyTo }, st.file);
      input.value = ""; setReply(null); setFile(null);
      await loadChannel(true);
      try { await api().rpc(sb, "chat_mark_read", { p_channel: st.channel }); } catch (e2) {}
    } catch (e) {
      toast("Could not send. Please try again.");
    } finally { sending = false; btn.disabled = false; }
  }

  /* ---------------- realtime + polling ---------------- */
  async function startPolling() {
    stopPolling();
    st.poll = setInterval(function () { if (st.view === "channel") loadChannel(false); else showList(); }, POLL_MS);
    if (st.fixture) return;
    try {
      var sb = await getClient();
      if (!sb || !sb.channel) return;
      st.rt = sb.channel("kos-chat")
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, function (p) {
          var row = p.new && p.new.channel_id ? p.new : p.old || {};
          if (st.view === "channel" && (!row.channel_id || row.channel_id === st.channel)) loadChannel(false);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "chat_reactions" }, function () {
          if (st.view === "channel") loadChannel(false);
        })
        .subscribe();
    } catch (e) {}
  }
  function stopPolling() {
    if (st.poll) clearInterval(st.poll); st.poll = null;
    if (st.rt) { try { st.rt.unsubscribe(); } catch (e) {} st.rt = null; }
  }

  /* ---------------- unread (bell + tile badge) ---------------- */
  async function refreshUnread() {
    try {
      var sb = await client();
      if (!st.fixture && !sb) return;
      var n = await api().rpc(sb, "chat_unread_count");
      st.unreadTotal = Number(n) || 0;
    } catch (e) { st.unreadTotal = 0; }
    window.kosChatUnread = st.unreadTotal;
    paintUnread();
  }
  function paintUnread() {
    ensureCss();
    var n = st.unreadTotal, label = n > 99 ? "99+" : String(n);
    var bell = document.getElementById("appBell");
    if (bell) {
      var c = document.getElementById("appBellChat");
      if (!c) { c = document.createElement("span"); c.className = "app-bell-count"; c.id = "appBellChat"; bell.appendChild(c); }
      c.hidden = !n; c.textContent = label;
      bell.setAttribute("aria-label", n ? "Notifications, " + n + " new in Krewe Chat" : "Notes from the officers");
    }
    var tile = document.querySelector('.app-tile[data-app-go="chat"]');
    if (tile) {
      var b = tile.querySelector(".app-tile-badge");
      if (!n) { if (b) b.remove(); }
      else { if (!b) { b = document.createElement("span"); b.className = "app-tile-badge"; tile.appendChild(b); } b.textContent = label; }
    }
  }

  /* ---------------- boot ---------------- */
  window.kosOpenChat = openChat;
  window.kosChatRefreshUnread = refreshUnread;
  window.kosChatPaint = paintUnread;
  /* Preview fixture: offline Playwright runs pass sample channels, people,
     messages, reactions, and photos. */
  window.__kosChatFixture = function (data) {
    st.fixture = Object.assign({ channels: [], people: [], messages: [], reactions: [], photos: {}, unread: 0 }, data || {});
    (st.fixture.people || []).forEach(function (p) { st.people[p.member_id] = p; });
    refreshUnread();
  };

  function boot() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (window.kosProfile && window.kosProfile.member_id) {
        clearInterval(t);
        refreshUnread();
        setInterval(function () { if (!st.open && !document.hidden) refreshUnread(); }, UNREAD_MS);
      } else if (tries > 120) clearInterval(t);
    }, 500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
