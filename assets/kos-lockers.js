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

  function paintMine(rows) {
    var box = document.getElementById("lockerMine");
    if (!box) return;
    if (!rows || !rows.length) {
      box.innerHTML = '<p class="empty">You are not on the list yet.</p>';
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
    var client = sb();
    if (!client) {
      if (seq !== memberSeq) return;
      paintCounts(counts);
      paintPay(urls, counts);
      paintMine([]);
      return;
    }
    try {
      var settings = await client.from("locker_settings").select("key,value");
      if (settings && !settings.error && settings.data) applySettings(settings.data, urls);
      var avail = await client.rpc("locker_availability");
      if (avail && avail.error) {
        show("lkMsg", "Locker counts are not available yet. An officer still needs to apply the locker update in Supabase.", "error");
      } else if (avail && avail.data) {
        counts.small = Number(avail.data.small);
        counts.large = Number(avail.data.large);
        if (!isFinite(counts.small)) counts.small = null;
        if (!isFinite(counts.large)) counts.large = null;
      }
      var mineRes = await client.rpc("my_locker_reservations");
      if (mineRes && !mineRes.error && Array.isArray(mineRes.data)) mine = mineRes.data;
    } catch (e) {
      show("lkMsg", "Could not load locker availability.", "error");
    }
    if (seq !== memberSeq) return;
    paintCounts(counts);
    paintPay(urls, counts);
    paintMine(mine);
  }

  window.kosLoadLockers = loadMember;

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
      '<div class="app-head"><span class="ic">🔑</span><div><h2>Locker rentals</h2>' +
      '<small>Queue, inventory, and assign a number</small></div></div>' +
      '<div class="app-body hub-ei" id="hubLockerBody">' +
      '<p class="hub-ei-note">Members join the list first. A Zeffy payment for these campaigns marks the matching reservation paid and claims the next open locker of that size. Assign a number here when none were open, or when the payer email did not match a reservation.</p>' +
      '<p class="hub-ei-note" id="hubLockerCounts"></p>' +
      '<h3>Zeffy pay links</h3>' +
      '<div class="hub-ei-grid">' +
      '<div><label for="hubLockerSmallUrl">Small $75</label>' +
      '<input id="hubLockerSmallUrl" type="url" /></div>' +
      '<div><label for="hubLockerLargeUrl">Large $200</label>' +
      '<input id="hubLockerLargeUrl" type="url" /></div></div>' +
      '<p class="hub-ei-note" id="hubLockerCampaigns"></p>' +
      '<div class="hub-ei-row"><button class="btn btn-primary" type="button" id="hubLockerSaveUrls">Save pay links</button></div>' +
      '<h3>Reservation list</h3>' +
      '<p class="hub-ei-note">First come, first served. Place is by the time they joined, within each size.</p>' +
      '<div class="rpt-tablewrap"><table class="rpt-table"><thead><tr>' +
      '<th>Place</th><th>Name</th><th>Email</th><th>Size</th><th>Paid</th><th>Locker</th><th></th>' +
      '</tr></thead><tbody id="hubLockerQueue"></tbody></table></div>' +
      '<h3>Inventory</h3>' +
      '<div class="rpt-tablewrap"><table class="rpt-table"><thead><tr>' +
      '<th>Locker</th><th>Size</th><th>Holder</th><th>Status</th><th></th>' +
      '</tr></thead><tbody id="hubLockerInventory"></tbody></table></div>' +
      '<p class="hub-ei-msg" id="hubLockerMsg" aria-live="polite"></p>' +
      '</div>';
  }

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
    if (card.getAttribute("data-locker-ready") === "1") return card;
    card.setAttribute("data-locker-ready", "1");
    card.innerHTML = officerHtml();
    var save = document.getElementById("hubLockerSaveUrls");
    if (save) save.addEventListener("click", saveUrls);
    card.addEventListener("click", onOfficerClick);
    return card;
  }

  function notEmailName(v) {
    v = (v == null ? "" : String(v)).trim();
    return v && v.indexOf("@") === -1 ? v : "";
  }

  function joinedPersonName(first, last) {
    return notEmailName([notEmailName(first), notEmailName(last)].filter(Boolean).join(" "));
  }

  // Roster and profile names win. An email is only the label when no real name exists.
  function reservationDisplayName(r, member, profile) {
    var profileFull = profile ? notEmailName(profile.full_name) : "";
    var profileJoined = profile ? joinedPersonName(profile.first_name, profile.last_name) : "";
    var memberJoined = member ? joinedPersonName(member.first_name, member.last_name) : "";
    var stamped = notEmailName(r.display_name) || joinedPersonName(r.member_first_name, r.member_last_name);
    var request = notEmailName(r.requester_name);
    return profileFull || profileJoined || memberJoined || stamped || request || String(r.requester_email || r.requester_name || "");
  }

  function nameTokens(full) {
    var parts = String(full || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
    if (parts.length < 2) return null;
    if (parts[0].length < 2 || parts[parts.length - 1].length < 2) return null;
    return { first: parts[0], last: parts[parts.length - 1] };
  }

  // Same rule as kos_match_member_by_name: exact last name, and the first name
  // is equal or one is a prefix of the other (Doug matches Douglas).
  function namesMatch(holder, person) {
    var h = nameTokens(holder);
    var p = nameTokens(person);
    if (!h || !p || h.last !== p.last) return false;
    return h.first === p.first || h.first.indexOf(p.first) === 0 || p.first.indexOf(h.first) === 0;
  }

  function cleanEmail(v) {
    return (v == null ? "" : String(v)).trim().toLowerCase();
  }

  function indexRows(rows, key) {
    var map = {};
    (rows || []).forEach(function (row) {
      if (row && row[key] != null && row[key] !== "") map[row[key]] = row;
    });
    return map;
  }

  function personFromReservation(r, membersById, profilesById) {
    var member = r.member_id ? membersById[r.member_id] : null;
    var profile = r.member_id ? profilesById[r.member_id] : null;
    var display = reservationDisplayName(r, member, profile);
    return {
      memberId: r.member_id || null,
      email: cleanEmail(r.requester_email || (member && member.email) || ""),
      name: notEmailName(display),
      display: display,
      size: r.size
    };
  }

  function lockerHeld(l) {
    return !!(l && (l.status === "assigned" || l.status === "paid"));
  }

  function matchScore(person, locker) {
    if (!lockerHeld(locker)) return 0;
    var score = 0;
    if (person.memberId && locker.member_id && person.memberId === locker.member_id) score = 100;
    else if (person.email && cleanEmail(locker.holder_email) && person.email === cleanEmail(locker.holder_email)) score = 80;
    else if (person.name && namesMatch(locker.holder_name, person.name)) score = 40;
    else return 0;
    if (person.size && locker.size === person.size) score += 10;
    if (locker.status === "paid") score += 5;
    return score;
  }

  function reservationPaid(r, locker) {
    return !!(r.paid_at || (locker && locker.status === "paid"));
  }

  // Inventory is the assignment of record. A reservation with no locker_id
  // still shows the locker that member already holds.
  function lockerForReservations(reservations, inventory, membersById, profilesById) {
    var byId = {};
    (inventory || []).forEach(function (l) { if (l && l.id != null) byId[l.id] = l; });
    var used = {};
    var direct = {};
    (reservations || []).forEach(function (r) {
      var linked = r.locker_id && byId[r.locker_id];
      if (linked) {
        direct[r.id] = linked;
        used[linked.id] = r.id;
      }
    });
    var pairs = [];
    (reservations || []).forEach(function (r) {
      if (direct[r.id]) return;
      var person = personFromReservation(r, membersById, profilesById);
      (inventory || []).forEach(function (l) {
        if (!l || used[l.id]) return;
        var score = matchScore(person, l);
        if (score > 0) pairs.push({ id: r.id, locker: l, score: score, created: r.created_at || "" });
      });
    });
    pairs.sort(function (a, b) {
      return b.score - a.score
        || String(a.created).localeCompare(String(b.created))
        || String(a.locker.locker_number || "").localeCompare(String(b.locker.locker_number || ""));
    });
    var matched = {};
    pairs.forEach(function (p) {
      if (matched[p.id] || used[p.locker.id]) return;
      matched[p.id] = p.locker;
      used[p.locker.id] = p.id;
    });
    return function (r) {
      return direct[r.id] || matched[r.id] || null;
    };
  }

  function queuePlace(rows, row, lockerOf) {
    var mine = lockerOf ? lockerOf(row) : null;
    if (row.status !== "queued" || mine) return "";
    var ahead = rows.filter(function (r) {
      var taken = lockerOf ? lockerOf(r) : null;
      return r.size === row.size && r.status === "queued" && !taken &&
        (r.created_at < row.created_at || (r.created_at === row.created_at && String(r.id) <= String(row.id)));
    });
    return String(ahead.length);
  }

  function paintOfficer(model) {
    ensureOfficerCard();
    var urls = model.urls || defaultUrls();
    var smallUrl = document.getElementById("hubLockerSmallUrl");
    var largeUrl = document.getElementById("hubLockerLargeUrl");
    if (smallUrl) smallUrl.value = urls.small;
    if (largeUrl) largeUrl.value = urls.large;
    var camps = document.getElementById("hubLockerCampaigns");
    if (camps) camps.textContent = urls.smallCampaign + " · " + urls.largeCampaign;
    var counts = document.getElementById("hubLockerCounts");
    if (counts) {
      var openLarge = (model.inventory || []).filter(function (l) { return l.size === "large" && l.status === "available"; }).length;
      var openSmall = (model.inventory || []).filter(function (l) { return l.size === "small" && l.status === "available"; }).length;
      counts.textContent = openLarge + " large available, " + openSmall + " small available.";
    }
    var available = (model.inventory || []).filter(function (l) { return l.status === "available"; }).sort(compareLockers);
    var membersById = indexRows(model.members, "id");
    var profilesById = indexRows(model.profiles, "member_id");
    var queue = document.getElementById("hubLockerQueue");
    if (queue) {
      var reservations = (model.reservations || []).slice().sort(function (a, b) {
        return String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id));
      });
      var lockerOf = lockerForReservations(reservations, model.inventory, membersById, profilesById);
      if (!reservations.length) {
        queue.innerHTML = '<tr><td colspan="7">No reservations yet.</td></tr>';
      } else {
        queue.innerHTML = reservations.map(function (r) {
          var locker = lockerOf(r);
          var person = personFromReservation(r, membersById, profilesById);
          var paid = reservationPaid(r, locker);
          var choices = available.filter(function (l) { return l.size === r.size; });
          var options = '<option value="">Choose an open locker</option>' + choices.map(function (l) {
            return '<option value="' + esc(l.locker_number) + '">' + esc(l.locker_number) + '</option>';
          }).join("");
          var actions = "";
          if (!paid) {
            actions += '<button type="button" class="btn btn-green" data-mark-paid="' + esc(r.id) + '"';
            if (locker && locker.id !== r.locker_id) actions += ' data-mark-locker="' + esc(locker.id) + '"';
            actions += ' style="padding:6px 10px">Mark paid</button> ';
          }
          if (!locker && r.status !== "cancelled") {
            actions += '<select data-assign-for="' + esc(r.id) + '" aria-label="Locker number for ' + esc(person.display) + '">' + options + '</select> ';
            actions += '<button type="button" class="btn btn-primary" data-assign="' + esc(r.id) + '" style="padding:6px 10px">Assign</button>';
          }
          return '<tr><td>' + esc(queuePlace(reservations, r, lockerOf)) + '</td><td>' + esc(person.display) +
            '</td><td>' + esc(r.requester_email || "") + '</td><td>' + esc(r.size) +
            '</td><td>' + (paid ? "Yes" : "No") + '</td><td>' + esc(locker && locker.locker_number || "") +
            '</td><td>' + actions + '</td></tr>';
        }).join("");
      }
    }
    var body = document.getElementById("hubLockerInventory");
    if (body) {
      var inventory = (model.inventory || []).slice().sort(compareLockers);
      if (!inventory.length) {
        body.innerHTML = '<tr><td colspan="5">No lockers yet. Apply sql/kos_locker_rentals.sql in Supabase.</td></tr>';
      } else {
        body.innerHTML = inventory.map(function (l) {
          var actions = "";
          if (l.status === "assigned") {
            actions += '<button type="button" class="btn btn-green" data-mark-locker="' + esc(l.id) + '" style="padding:6px 10px">Mark paid</button> ';
          }
          if (l.status !== "available") {
            actions += '<button type="button" class="btn" data-free="' + esc(l.id) + '" style="padding:6px 10px">Free</button>';
          }
          var holder = l.holder_name || (l.status === "available" ? "Open" : "");
          return '<tr><td>' + esc(l.locker_number) + '</td><td>' + esc(l.size) + '</td><td>' + esc(holder) +
            '</td><td><span class="badge ' + esc(l.status) + '">' + esc(l.status) + '</span></td><td>' + actions + '</td></tr>';
        }).join("");
      }
    }
  }

  window.kosPaintLockerOfficer = paintOfficer;

  async function loadOfficer() {
    var seq = ++officerSeq;
    var client = sb();
    if (!client) return;
    ensureOfficerCard();
    var urls = defaultUrls();
    var inventory = [];
    var reservations = [];
    try {
      var settings = await client.from("locker_settings").select("key,value");
      if (settings && settings.error) throw settings.error;
      if (settings && settings.data) applySettings(settings.data, urls);
      var inv = await client.from("lockers").select("id,locker_number,size,holder_name,holder_email,status,notes,member_id");
      if (inv && inv.error) throw inv.error;
      inventory = inv.data || [];
      var res = await client.from("locker_reservations").select("id,requester_name,requester_email,size,notes,status,paid_at,locker_id,created_at,member_id");
      if (res && res.error) throw res.error;
      reservations = (res.data || []).filter(function (r) { return r.status !== "cancelled"; });
      var members = [];
      var profiles = [];
      try {
        var mem = await client.from("members").select("id,first_name,last_name,email");
        if (mem && !mem.error && mem.data) members = mem.data;
      } catch (ignoreMembers) {}
      try {
        var prof = await client.from("profiles").select("member_id,full_name,first_name,last_name");
        if (prof && !prof.error && prof.data) profiles = prof.data;
      } catch (ignoreProfiles) {}
      if (seq !== officerSeq) return;
      paintOfficer({ urls: urls, inventory: inventory, reservations: reservations, members: members, profiles: profiles });
    } catch (e) {
      if (seq !== officerSeq) return;
      paintOfficer({ urls: urls, inventory: [], reservations: [] });
      setOfficerMsg("Could not load lockers. Apply sql/kos_locker_rentals.sql in Supabase, then refresh.", "err");
    }
  }

  window.kosLoadOfficerLockers = loadOfficer;

  async function saveUrls() {
    var client = sb();
    if (!client) return;
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

  async function onOfficerClick(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var client = sb();
    if (!client) return;
    var mark = t.getAttribute("data-mark-paid");
    var markLocker = t.getAttribute("data-mark-locker");
    var assign = t.getAttribute("data-assign");
    var free = t.getAttribute("data-free");
    if (!mark && !markLocker && !assign && !free) return;
    ev.preventDefault();
    var result;
    if (mark) {
      result = await client.rpc("officer_locker_mark_paid", { p_reservation_id: mark });
      if (!result || result.error || (result.data && result.data.ok === false)) {
        setOfficerMsg((result && result.error && result.error.message) || (result && result.data && result.data.message) || "Could not update the locker.", "err");
        return;
      }
    }
    if (markLocker) {
      result = await client.rpc("officer_locker_mark_paid", { p_locker_id: markLocker });
    } else if (!mark && free) {
      if (!window.confirm("Free this locker and return it to available?")) return;
      result = await client.rpc("officer_locker_free", { p_locker_id: free });
    } else if (assign) {
      var sel = document.querySelector('select[data-assign-for="' + assign + '"]');
      var num = sel ? sel.value : "";
      if (!num) {
        setOfficerMsg("Choose an open locker number first.", "err");
        return;
      }
      result = await client.rpc("officer_locker_assign", { p_reservation_id: assign, p_locker_number: num });
    }
    if (!result || result.error || (result.data && result.data.ok === false)) {
      setOfficerMsg((result && result.error && result.error.message) || (result && result.data && result.data.message) || "Could not update the locker.", "err");
      return;
    }
    setOfficerMsg("Saved.", "ok");
    await loadOfficer();
    await loadMember();
  }

  async function detectOfficer() {
    var client = sb();
    if (!client || !client.rpc) return false;
    try {
      var res = await client.rpc("is_krewe_officer");
      return !!(res && res.data);
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
    if (officer || existing) {
      ensureOfficerCard();
      if (officer) {
        try { await loadOfficer(); } catch (e3) {}
      } else if (!document.getElementById("hubLockerQueue")) {
        setOfficerMsg("Sign in as an officer to load the queue and inventory.", "");
      } else if (!officer) {
        var q = document.getElementById("hubLockerQueue");
        if (q && !q.children.length) {
          setOfficerMsg("Sign in as an officer to load the queue and inventory.", "");
        }
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
