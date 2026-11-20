/* Officer Desk: Member roles and access.
   Search a member, set an official title, adjust extra tools, confirm, and undo.
   The database functions in sql/kos_member_roles_and_access.sql enforce this.
   Until that file is applied, the screen explains that and can still show
   chair requests through the older list. */
(function () {
  "use strict";

  var rules = window.kosRolesRules;
  if (!rules) return;

  var CSS = [
    ".kos-roles{color:#243028;}",
    ".kos-roles h3{font-family:var(--display);color:var(--green-800);margin:18px 0 6px;font-size:22px;}",
    ".kos-roles .lead{margin:0 0 12px;color:#3a463c;}",
    ".kos-roles .sample{background:#fff8e4;border:1px solid rgba(168,128,28,.55);border-radius:12px;padding:10px 12px;margin:0 0 12px;color:#5c4810;}",
    ".kos-roles .msg{min-height:1.2em;color:var(--green-800);margin:8px 0;}",
    ".kos-roles input[type=search],.kos-roles input[type=date],.kos-roles input[type=text],.kos-roles select,.kos-roles textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid rgba(168,128,28,.45);border-radius:10px;font:inherit;background:#fff;}",
    ".kos-roles .row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;}",
    ".kos-roles .row > *{flex:1 1 180px;}",
    ".kos-roles .hit{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:8px;}",
    ".kos-roles .hit button,.kos-roles .person{text-align:left;background:#fffdf4;border:1px solid rgba(168,128,28,.35);border-radius:14px;padding:12px 14px;font:inherit;cursor:pointer;min-height:44px;}",
    ".kos-roles .hit button.on,.kos-roles .person.on{border-color:var(--gold-deep);box-shadow:inset 0 0 0 2px rgba(212,175,55,.45);}",
    ".kos-roles .hit b,.kos-roles .person b{font-family:var(--display);color:var(--green-800);font-size:18px;}",
    ".kos-roles .muted{color:#5f6b5a;font-size:15px;}",
    ".kos-roles .pill{display:inline-block;background:var(--green-800);color:#f6efdc;border-radius:999px;padding:3px 8px;font-size:13px;margin-left:6px;}",
    ".kos-roles .pill.warn{background:#8a5a00;}",
    ".kos-roles .pill.pause{background:#5f6b5a;}",
    ".kos-roles .title-grid,.kos-roles .tool-list{display:flex;flex-direction:column;gap:8px;margin:8px 0 0;}",
    ".kos-roles label.check{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:12px;padding:10px 12px;min-height:44px;}",
    ".kos-roles label.check input{width:20px;height:20px;margin-top:2px;flex:0 0 auto;}",
    ".kos-roles label.check span{display:block;}",
    ".kos-roles .section-label{font-family:var(--display);color:var(--gold-deep);font-size:14px;letter-spacing:.04em;text-transform:uppercase;margin:14px 0 4px;}",
    ".kos-roles .confirm{background:linear-gradient(180deg,#fffdf6,#f4f8f1);border:2px solid var(--gold);border-radius:16px;padding:14px;margin-top:14px;}",
    ".kos-roles .confirm ul{margin:8px 0;padding-left:18px;}",
    ".kos-roles .btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}",
    ".kos-roles .req,.kos-roles .change{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:center;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:12px;padding:10px 12px;margin:8px 0;}",
    ".kos-roles .req .btns,.kos-roles .change .btns{margin:0;}",
    "@media (max-width:640px){.kos-roles h3{font-size:20px;}.kos-roles .req,.kos-roles .change{align-items:stretch;}.kos-roles .btns .btn{flex:1 1 auto;}}"
  ].join("");

  var fixture = null;
  var model = null;
  var draft = null;
  var query = "";
  var message = "";
  var review = null;
  var roster = [];
  var serverHits = null;
  var serverHitsQuery = "";
  var searchTimer = null;
  var searchSeq = 0;
  var detailSeq = 0;
  var detailPendingId = "";
  var searchPending = false;
  var searchFocused = false;

  function injectCss() {
    if (document.getElementById("kosRolesCss")) return;
    var style = document.createElement("style");
    style.id = "kosRolesCss";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
    });
  }

  function personName(member) {
    if (!member) return "Member";
    return [member.first_name, member.last_name].filter(Boolean).join(" ") || "Member";
  }

  function toolLabel(key) {
    var tool = rules.toolByKey(key);
    return tool ? tool.label : key;
  }

  function titleLabel(key) {
    var title = rules.titleByKey(key);
    return title ? title.label : key;
  }

  function blankDraft(member) {
    var extras = (member.grants || []).filter(function (grant) {
      return rules.grantState(grant, member.membership_status, new Date()) !== "revoked"
        && rules.grantState(grant, member.membership_status, new Date()) !== "expired";
    }).map(function (grant) {
      return {
        tool_key: grant.tool_key,
        ends_on: (grant.ends_on || (grant.endsAt ? String(grant.endsAt).slice(0, 10) : rules.nextGrantEnd(new Date())))
      };
    });
    return {
      titleKeys: (member.title_keys || []).slice(),
      extras: extras,
      handover: false,
      handoverTo: "",
      handoverTitle: (member.title_keys || [])[0] || "",
      keepTools: []
    };
  }

  function findMember(id) {
    if (!id) return null;
    var pools = [];
    if (model && model.members) pools.push(model.members);
    if (serverHits) pools.push(serverHits);
    if (roster.length) pools.push(roster);
    var p, i, list;
    for (p = 0; p < pools.length; p++) {
      list = pools[p];
      for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === id) return list[i];
      }
    }
    return null;
  }

  function selectedMember() {
    if (!model || !model.selectedId) return null;
    return findMember(model.selectedId);
  }

  function viewer() {
    return (model && model.viewer) || {};
  }

  function paintShell() {
    injectCss();
    var card = document.getElementById("hubRolesAccess");
    if (!card && typeof window.kosEnsureOfficerToolCard === "function") {
      card = window.kosEnsureOfficerToolCard("hubRolesAccess");
    }
    if (!card) return null;
    if (!card.querySelector("#kosRolesRoot")) {
      card.innerHTML =
        '<div class="app-head"><span class="ic">🎖</span><div><h2>Member roles and access</h2>' +
        "<small>Set an official title and the Officer Desk tools a member can use.</small></div></div>" +
        '<div class="app-body kos-roles" id="kosRolesRoot"><p class="empty">Loading…</p></div>';
    }
    if (model && (draft || !selectedMember())) render();
    return card;
  }

  function normalizeQuery(value) {
    return String(value || "").toLowerCase().replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function memberMatchesQuery(member, q) {
    if (!q) return true;
    var first = String(member.first_name || "").toLowerCase().trim();
    var last = String(member.last_name || "").toLowerCase().trim();
    var full = (first + " " + last).trim();
    var flipped = (last + " " + first).trim();
    if (full.indexOf(q) !== -1 || flipped.indexOf(q) !== -1) return true;
    if (first.indexOf(q) !== -1 || last.indexOf(q) !== -1) return true;
    var extra = ((member.officer_title || "") + " " + (member.email || "")).toLowerCase();
    if (extra.indexOf(q) !== -1) return true;
    var tokens = q.split(" ").filter(Boolean);
    if (tokens.length > 1) {
      return tokens.every(function (token) {
        return first.indexOf(token) !== -1 || last.indexOf(token) !== -1;
      });
    }
    return false;
  }

  function searchSource() {
    var q = normalizeQuery(query);
    if (q && serverHits && serverHitsQuery === q) return serverHits;
    if (roster.length) return roster;
    return (model && model.members) || [];
  }

  function filteredMembers() {
    var q = normalizeQuery(query);
    return searchSource().filter(function (member) {
      if (!member || member.merged_into) return false;
      return memberMatchesQuery(member, q);
    }).slice(0, 12);
  }

  function statusLabel(status) {
    if (!status || status === "active") return "";
    if (status === "pending-renewal") return "Pending renewal";
    if (status === "lapsed") return "Lapsed";
    if (status === "inactive") return "Inactive";
    return status;
  }

  function renderRequests() {
    var requests = model.requests || [];
    if (!viewer().canChangeChairTitles && !viewer().canChangeAnyTitle && !viewer().isAdmin) return "";
    var html = "<h3>Chair requests</h3>";
    if (!requests.length) {
      return html + '<p class="muted">No pending chair requests.</p>';
    }
    requests.forEach(function (req) {
      html += '<div class="req"><div><b>' + esc(personName(req)) + "</b>" +
        '<div class="muted">Asked to chair ' + esc(req.committee) + (req.note ? ". " + esc(req.note) : "") + "</div></div>" +
        '<div class="btns"><button class="btn btn-primary" type="button" data-req-approve="' + esc(req.id) + '">Approve</button>' +
        '<button class="btn" type="button" data-req-decline="' + esc(req.id) + '">Decline</button></div></div>';
    });
    return html;
  }

  function renderSearch() {
    var hits = filteredMembers();
    var html = "<h3>Find a member</h3>" +
      '<label class="muted" for="kosRolesSearch">Name</label>' +
      '<input id="kosRolesSearch" type="search" value="' + esc(query) + '" placeholder="Type a name" autocomplete="off" />' +
      '<ul class="hit" id="kosRolesResults">';
    if (!hits.length) {
      html += '<li class="muted">' + (searchPending && normalizeQuery(query) ? "Searching…" : "No matching member.") + "</li>";
    }
    hits.forEach(function (member) {
      var on = member.id === model.selectedId ? " on" : "";
      var badge = statusLabel(member.membership_status);
      html += '<li><button type="button" class="person' + on + '" data-member="' + esc(member.id) + '"><b>' +
        esc(personName(member)) + "</b>" +
        (badge ? '<span class="pill' + (badge === "Lapsed" || badge === "Inactive" ? " pause" : "") + '">' + esc(badge) + "</span>" : "") +
        '<div class="muted">' + esc(member.officer_title || "No officer title") + "</div></button></li>";
    });
    return html + "</ul>";
  }

  function renderTitles(member) {
    var html = "<h3>Title</h3><p class=\"lead\">Official titles only. Checking a title turns on the tools that come with it.</p>";
    if (viewer().id === member.id) {
      html += '<p class="msg">You cannot change your own title or tools.</p>';
    }
    html += '<div class="title-grid" id="kosRolesTitles">';
    rules.TITLES.forEach(function (title) {
      var checked = draft.titleKeys.indexOf(title.key) !== -1;
      var enabled = rules.canEditTitle(viewer(), title, member.id);
      html += '<label class="check"><input type="checkbox" data-title="' + esc(title.key) + '"' +
        (checked ? " checked" : "") + (enabled ? "" : " disabled") + " />" +
        "<span><b>" + esc(title.label) + "</b>" +
        (enabled ? "" : '<span class="muted"> Not yours to change.</span>') +
        "</span></label>";
    });
    return html + "</div>";
  }

  function renderTools(member) {
    var fromTitle = rules.toolsForTitles(draft.titleKeys);
    var html = "<h3>Tools</h3><p class=\"lead\">Checked tools that come with the title stay with the title. Extra tools need an end date. The usual end date is " +
      esc(rules.formatGrantEnd(rules.nextGrantEnd(new Date()))) + ".</p>";
    var section = "";
    html += '<div class="tool-list" id="kosRolesTools">';
    rules.TOOLS.forEach(function (tool) {
      if (tool.section !== section) {
        section = tool.section;
        html += '<div class="section-label">' + esc(section) + "</div>";
      }
      var titled = fromTitle.indexOf(tool.key) !== -1;
      var extra = draft.extras.filter(function (item) { return item.tool_key === tool.key; })[0];
      var existing = (member.grants || []).filter(function (grant) { return grant.tool_key === tool.key; })[0];
      var state = existing ? rules.grantState(existing, member.membership_status, new Date()) : "";
      var checked = titled || !!extra;
      var canGrant = rules.canGrantTool(viewer(), tool.key, member.id);
      var disabled = titled || !canGrant;
      html += '<label class="check"><input type="checkbox" data-tool="' + esc(tool.key) + '"' +
        (checked ? " checked" : "") + (disabled ? " disabled" : "") + " />" +
        "<span><b>" + esc(tool.label) + "</b>";
      if (titled) html += ' <span class="muted">Comes with the title.</span>';
      else if (extra) html += ' <span class="muted">Extra grant.</span>';
      if (state === "review") html += ' <span class="pill warn">Needs review</span>';
      if (state === "paused") html += ' <span class="pill pause">Paused until they are active again</span>';
      if (state === "expired") html += ' <span class="pill pause">Ended</span>';
      if (tool.sensitive && !titled) html += '<span class="muted"> This tool sees applications or money. Giving it is written in the audit log.</span>';
      if (!titled && extra && canGrant) {
        html += '<span style="display:block;margin-top:8px;max-width:220px;"><span class="muted">End date</span>' +
          '<input type="date" data-end="' + esc(tool.key) + '" value="' + esc(extra.ends_on || rules.nextGrantEnd(new Date())) + '" /></span>';
      }
      html += "</span></label>";
    });
    return html + "</div>";
  }

  function renderHandover(member) {
    if (!draft.titleKeys.length || viewer().id === member.id) return "";
    var html = "<h3>Hand a title to someone else</h3>" +
      '<p class="lead">The title and the tools that come with it move in one step. Extra grants stay with ' +
      esc(personName(member)) + ".</p>";
    html += '<div class="row"><label>Title<select id="kosRolesHandoverTitle">';
    draft.titleKeys.forEach(function (key) {
      var title = rules.titleByKey(key);
      if (!title || !rules.canEditTitle(viewer(), title, member.id)) return;
      html += '<option value="' + esc(key) + '"' + (draft.handoverTitle === key ? " selected" : "") + ">" + esc(title.label) + "</option>";
    });
    html += '</select></label><label>Incoming member<select id="kosRolesHandoverTo"><option value="">Choose…</option>';
    (model.members || []).forEach(function (other) {
      if (other.id === member.id) return;
      html += '<option value="' + esc(other.id) + '"' + (draft.handoverTo === other.id ? " selected" : "") + ">" + esc(personName(other)) + "</option>";
    });
    html += "</select></label></div>";
    html += '<div class="btns"><button class="btn" type="button" id="kosRolesHandoverBtn">Review handover</button></div>';
    return html;
  }

  function currentDiff(member) {
    var beforeExtras = (member.grants || []).filter(function (grant) {
      var state = rules.grantState(grant, member.membership_status, new Date());
      return state === "live" || state === "review" || state === "paused";
    }).map(function (grant) { return grant.tool_key; });
    return rules.accessDiff({
      beforeTitles: member.title_keys || [],
      afterTitles: draft.titleKeys,
      beforeExtras: beforeExtras,
      afterExtras: draft.extras.map(function (item) { return item.tool_key; }),
      keepTools: draft.keepTools
    });
  }

  function renderReview(member) {
    if (!review) return "";
    var html = '<div class="confirm" id="kosRolesConfirm"><h3 style="margin-top:0;">Confirm the change</h3>';
    if (review.mode === "handover") {
      var incoming = (model.members || []).filter(function (item) { return item.id === review.to; })[0];
      var preview = rules.handoverPreview({
        fromTitles: member.title_keys || [],
        titleKey: review.titleKey,
        extras: (member.grants || []).map(function (grant) { return grant.tool_key; }),
        keepTools: draft.keepTools
      });
      html += "<p><b>" + esc(titleLabel(review.titleKey)) + "</b> moves from " + esc(personName(member)) +
        " to " + esc(personName(incoming)) + ".</p>";
      if (preview.stays.length) {
        html += "<p>These extra grants stay with " + esc(personName(member)) + ":</p><ul>";
        preview.stays.forEach(function (key) { html += "<li>" + esc(toolLabel(key)) + "</li>"; });
        html += "</ul>";
      } else {
        html += "<p>No extra grants stay behind. " + esc(personName(member)) + " does not have any.</p>";
      }
      if (preview.lostUnlessKept.length) {
        html += "<p>These tools came only from that title. Check any that should stay as an extra grant until " +
          esc(rules.formatGrantEnd(rules.nextGrantEnd(new Date()))) + ".</p>";
        preview.lostUnlessKept.forEach(function (key) {
          var on = draft.keepTools.indexOf(key) !== -1;
          html += '<label class="check"><input type="checkbox" data-keep="' + esc(key) + '"' + (on ? " checked" : "") +
            " /><span>" + esc(toolLabel(key)) + "</span></label>";
        });
      }
    } else {
      var diff = currentDiff(member);
      var lines = [];
      diff.addedTitles.forEach(function (key) { lines.push("Add title: " + titleLabel(key) + "."); });
      diff.removedTitles.forEach(function (key) { lines.push("Remove title: " + titleLabel(key) + "."); });
      diff.extrasAdded.forEach(function (key) {
        var extra = draft.extras.filter(function (item) { return item.tool_key === key; })[0];
        lines.push("Add extra grant: " + toolLabel(key) + " until " + rules.formatGrantEnd(extra && extra.ends_on) + ".");
      });
      diff.extrasRemoved.forEach(function (key) { lines.push("Remove extra grant: " + toolLabel(key) + "."); });
      diff.droppedWithTitle.forEach(function (key) { lines.push("Remove " + toolLabel(key) + " because the title is going away."); });
      diff.kept.forEach(function (key) { lines.push("Keep " + toolLabel(key) + " as an extra grant."); });
      if (!lines.length) {
        html += "<p>Nothing will change.</p>";
      } else {
        html += "<ul>" + lines.map(function (line) { return "<li>" + esc(line) + "</li>"; }).join("") + "</ul>";
      }
      if (diff.onlyFromRemoved.length) {
        html += "<p>Check a tool to keep it as an extra grant. Unchecked tools from the old title are removed.</p>";
        diff.onlyFromRemoved.forEach(function (key) {
          var on = draft.keepTools.indexOf(key) !== -1;
          html += '<label class="check"><input type="checkbox" data-keep="' + esc(key) + '"' + (on ? " checked" : "") +
            " /><span>" + esc(toolLabel(key)) + "</span></label>";
        });
      }
    }
    html += '<div class="btns"><button class="btn btn-primary" type="button" id="kosRolesSave">Save</button>' +
      '<button class="btn" type="button" id="kosRolesCancel">Back</button></div></div>';
    return html;
  }

  function renderChanges() {
    var changes = model.changes || [];
    var html = "<h3>Recent changes</h3>";
    if (!changes.length) return html + '<p class="muted">No access changes yet.</p>';
    changes.slice(0, 12).forEach(function (change) {
      var undo = rules.canUndo({
        undone: change.undone,
        hasNewer: change.hasNewer,
        actorId: change.actor_member_id || change.actorId,
        createdAt: change.created_at || change.createdAt
      }, {
        id: viewer().id,
        canChangeAnyTitle: viewer().canChangeAnyTitle,
        isAdmin: viewer().isAdmin
      }, new Date());
      html += '<div class="change"><div><b>' + esc(change.summary) + "</b>" +
        '<div class="muted">' + esc(change.actor_name || "Officer") + "</div></div>";
      if (undo) html += '<div class="btns"><button class="btn" type="button" data-undo="' + esc(change.id) + '">Undo</button></div>';
      html += "</div>";
    });
    return html;
  }

  function render() {
    var root = document.getElementById("kosRolesRoot");
    if (!root || !model) return;
    var member = selectedMember();
    var html = "";
    if (model.sample) {
      html += '<p class="sample" id="kosRolesSample">Sample for review. Nothing here is saved to the roster.</p>';
    }
    if (!model.ready && model.missingSql) {
      html += '<p class="lead">Title and tool changes need the database update in sql/kos_member_roles_and_access.sql. It has not been applied yet.</p>';
    }
    html += '<p class="msg" id="kosRolesMsg">' + esc(message) + "</p>";
    html += renderRequests();
    html += renderSearch();
    if (member && draft) {
      html += '<h3 id="kosRolesMember">' + esc(personName(member)) + "</h3>";
      html += '<p class="muted">' + esc(member.officer_title || "No officer title");
      if ((member.committees || []).length) html += " · Committees: " + esc(member.committees.join(", "));
      html += "</p>";
      html += renderTitles(member);
      html += renderTools(member);
      html += '<div class="btns"><button class="btn btn-primary" type="button" id="kosRolesReview">Review changes</button></div>';
      html += renderHandover(member);
      html += renderReview(member);
    } else if (member) {
      html += '<h3 id="kosRolesMember">' + esc(personName(member)) + "</h3>";
      if (detailPendingId === member.id) {
        html += '<p class="muted" id="kosRolesOpening">Opening their titles and tools…</p>';
      }
    }
    html += renderChanges();
    root.innerHTML = html;
    bind(root, member);
  }

  function bind(root, member) {
    var search = document.getElementById("kosRolesSearch");
    if (search) {
      search.addEventListener("input", function () {
        query = search.value;
        searchFocused = true;
        if (!fixture) searchPending = true;
        render();
        scheduleServerSearch();
        refocusSearch();
      });
    }
    root.querySelectorAll("[data-member]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        searchFocused = false;
        var id = btn.getAttribute("data-member");
        var hit = findMember(id);
        model.selectedId = id;
        if (hit && !(model.members || []).some(function (member) { return member.id === id; })) {
          model.members = (model.members || []).concat([hit]);
        }
        var next = selectedMember();
        review = null;
        message = "";
        if (fixture || (next && next.accessReady)) {
          detailPendingId = "";
          draft = next ? blankDraft(next) : null;
          render();
        } else {
          draft = null;
          detailPendingId = id;
          render();
          openMemberDetail(id);
        }
      });
    });
    root.querySelectorAll("[data-title]").forEach(function (box) {
      box.addEventListener("change", function () {
        var key = box.getAttribute("data-title");
        if (box.checked) {
          if (draft.titleKeys.indexOf(key) === -1) draft.titleKeys.push(key);
        } else {
          draft.titleKeys = draft.titleKeys.filter(function (item) { return item !== key; });
        }
        review = null;
        render();
      });
    });
    root.querySelectorAll("[data-tool]").forEach(function (box) {
      box.addEventListener("change", function () {
        var key = box.getAttribute("data-tool");
        if (box.checked) {
          if (!draft.extras.some(function (item) { return item.tool_key === key; })) {
            draft.extras.push({ tool_key: key, ends_on: rules.nextGrantEnd(new Date()) });
          }
        } else {
          draft.extras = draft.extras.filter(function (item) { return item.tool_key !== key; });
        }
        review = null;
        render();
      });
    });
    root.querySelectorAll("[data-end]").forEach(function (input) {
      input.addEventListener("change", function () {
        var key = input.getAttribute("data-end");
        draft.extras.forEach(function (item) {
          if (item.tool_key === key) item.ends_on = input.value;
        });
      });
    });
    root.querySelectorAll("[data-keep]").forEach(function (box) {
      box.addEventListener("change", function () {
        var key = box.getAttribute("data-keep");
        if (box.checked) {
          if (draft.keepTools.indexOf(key) === -1) draft.keepTools.push(key);
        } else {
          draft.keepTools = draft.keepTools.filter(function (item) { return item !== key; });
        }
      });
    });
    var reviewBtn = document.getElementById("kosRolesReview");
    if (reviewBtn && member) {
      reviewBtn.addEventListener("click", function () {
        review = { mode: "edit" };
        render();
        var box = document.getElementById("kosRolesConfirm");
        if (box && box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
      });
    }
    var handoverBtn = document.getElementById("kosRolesHandoverBtn");
    if (handoverBtn) {
      handoverBtn.addEventListener("click", function () {
        draft.handoverTitle = (document.getElementById("kosRolesHandoverTitle") || {}).value || draft.handoverTitle;
        draft.handoverTo = (document.getElementById("kosRolesHandoverTo") || {}).value || "";
        if (!draft.handoverTitle || !draft.handoverTo) {
          message = "Choose the title and the member who should receive it.";
          render();
          return;
        }
        review = { mode: "handover", titleKey: draft.handoverTitle, to: draft.handoverTo };
        message = "";
        render();
      });
    }
    var cancel = document.getElementById("kosRolesCancel");
    if (cancel) cancel.addEventListener("click", function () { review = null; render(); });
    var save = document.getElementById("kosRolesSave");
    if (save && member) save.addEventListener("click", function () { saveChange(member, save); });
    root.querySelectorAll("[data-req-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () { decideRequest(btn.getAttribute("data-req-approve"), true, btn); });
    });
    root.querySelectorAll("[data-req-decline]").forEach(function (btn) {
      btn.addEventListener("click", function () { decideRequest(btn.getAttribute("data-req-decline"), false, btn); });
    });
    root.querySelectorAll("[data-undo]").forEach(function (btn) {
      btn.addEventListener("click", function () { undoChange(btn.getAttribute("data-undo"), btn); });
    });
  }

  function clientOrNull() {
    var client = window.__kosSb;
    if (!client || typeof client.rpc !== "function") return null;
    return client;
  }

  async function saveChange(member, btn) {
    if (!fixture && (!draft || !member || !member.accessReady)) {
      message = "Their titles and tools are still loading.";
      render();
      return;
    }
    if (viewer().id === member.id) {
      message = "You cannot change your own title or tools.";
      render();
      return;
    }
    btn.disabled = true;
    if (fixture) {
      applyFixtureSave(member);
      btn.disabled = false;
      return;
    }
    var client = clientOrNull();
    if (!client) {
      message = "Still connecting. Try again in a moment.";
      render();
      return;
    }
    try {
      var res;
      if (review && review.mode === "handover") {
        res = await client.rpc("handover_member_title", {
          p_from: member.id,
          p_to: review.to,
          p_title_key: review.titleKey,
          p_keep_tools: draft.keepTools,
          p_note: null,
          p_keep_ends_on: rules.nextGrantEnd(new Date())
        });
      } else {
        var diff = currentDiff(member);
        var extras = draft.extras.filter(function (item) {
          return rules.toolsForTitles(draft.titleKeys).indexOf(item.tool_key) === -1;
        });
        diff.kept.forEach(function (key) {
          if (!extras.some(function (item) { return item.tool_key === key; })) {
            extras.push({ tool_key: key, ends_on: rules.nextGrantEnd(new Date()) });
          }
        });
        res = await client.rpc("set_member_access", {
          p_member_id: member.id,
          p_title_keys: draft.titleKeys,
          p_extra_tools: extras.map(function (item) {
            return { tool_key: item.tool_key, ends_on: item.ends_on };
          }),
          p_note: null,
          p_drop_legacy: false
        });
      }
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not save.");
      message = (res.data && res.data.summary) || "Saved.";
      review = null;
      await loadLive(client, member.id);
    } catch (err) {
      message = (err && err.message) || "Could not save.";
      render();
    }
  }

  function applyFixtureSave(member) {
    if (review && review.mode === "handover") {
      var incoming = (model.members || []).filter(function (item) { return item.id === review.to; })[0];
      var preview = rules.handoverPreview({
        fromTitles: member.title_keys || [],
        titleKey: review.titleKey,
        extras: (member.grants || []).map(function (grant) { return grant.tool_key; }),
        keepTools: draft.keepTools
      });
      member.title_keys = preview.remaining;
      member.officer_title = preview.remaining.map(titleLabel).join(" · ");
      preview.kept.forEach(function (key) {
        member.grants = member.grants || [];
        member.grants.push({ tool_key: key, ends_on: rules.nextGrantEnd(new Date()) });
      });
      if (incoming) {
        incoming.title_keys = (incoming.title_keys || []).concat([review.titleKey]);
        incoming.officer_title = incoming.title_keys.map(titleLabel).join(" · ");
      }
      message = "Moved " + titleLabel(review.titleKey) + ". Extra grants stayed with " + personName(member) + ".";
    } else {
      var diff = currentDiff(member);
      member.title_keys = draft.titleKeys.slice();
      member.officer_title = draft.titleKeys.map(titleLabel).join(" · ");
      var extras = draft.extras.filter(function (item) {
        return rules.toolsForTitles(draft.titleKeys).indexOf(item.tool_key) === -1;
      });
      diff.kept.forEach(function (key) {
        extras.push({ tool_key: key, ends_on: rules.nextGrantEnd(new Date()) });
      });
      member.grants = extras.map(function (item) {
        return { tool_key: item.tool_key, ends_on: item.ends_on, needsReview: false };
      });
      message = "Saved.";
    }
    model.changes = [{
      id: "local-" + Date.now(),
      summary: message,
      actor_name: viewer().name || "You",
      actor_member_id: viewer().id,
      created_at: new Date().toISOString(),
      undone: false,
      hasNewer: false
    }].concat(model.changes || []);
    review = null;
    draft = blankDraft(member);
    render();
  }

  async function decideRequest(id, approve, btn) {
    if (fixture) {
      var req = (model.requests || []).filter(function (item) { return item.id === id; })[0];
      model.requests = (model.requests || []).filter(function (item) { return item.id !== id; });
      if (approve && req) {
        var member = (model.members || []).filter(function (item) { return item.id === req.member_id; })[0];
        var title = rules.TITLES.filter(function (item) {
          return item.kind === "chair" && item.committee === req.committee;
        })[0];
        if (member && title && (member.title_keys || []).indexOf(title.key) === -1) {
          member.title_keys = (member.title_keys || []).concat([title.key]);
          member.officer_title = member.title_keys.map(titleLabel).join(" · ");
        }
      }
      message = approve ? "Approved the chair request." : "Declined the chair request.";
      if (model.selectedId) draft = blankDraft(selectedMember());
      render();
      return;
    }
    var client = clientOrNull();
    if (!client) return;
    if (btn) btn.disabled = true;
    try {
      var res = await client.rpc("decide_access_chair_request", {
        p_id: id,
        p_approve: approve,
        p_note: null
      });
      if (res.error) throw res.error;
      message = approve ? "Approved the chair request." : "Declined the chair request.";
      await loadLive(client, model.selectedId);
    } catch (err) {
      message = (err && err.message) || "Could not update that request.";
      render();
    }
  }

  async function undoChange(id, btn) {
    if (fixture) {
      (model.changes || []).forEach(function (change) {
        if (change.id === id) change.undone = true;
      });
      message = "Undid that change in the sample.";
      render();
      return;
    }
    var client = clientOrNull();
    if (!client) return;
    if (btn) btn.disabled = true;
    try {
      var res = await client.rpc("undo_member_access_change", { p_audit_id: id });
      if (res.error) throw res.error;
      message = "Undid that change.";
      await loadLive(client, model.selectedId);
    } catch (err) {
      message = (err && err.message) || "Could not undo.";
      render();
    }
  }

  function useModel(next, keepMessage) {
    model = next;
    if (!keepMessage) message = "";
    var member = selectedMember();
    if (member) draft = blankDraft(member);
    else draft = null;
    review = null;
    if (next.reviewOpen && member) {
      review = { mode: "edit" };
    }
    if (next.handoverOpen && member && next.handoverTo && next.handoverTitle) {
      draft.handoverTitle = next.handoverTitle;
      draft.handoverTo = next.handoverTo;
      review = { mode: "handover", titleKey: next.handoverTitle, to: next.handoverTo };
    }
    render();
  }

  function refocusSearch() {
    if (!searchFocused) return;
    var again = document.getElementById("kosRolesSearch");
    if (!again) return;
    var active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement && active.id !== "kosRolesSearch") return;
    again.focus();
    var pos = again.value.length;
    try { again.setSelectionRange(pos, pos); } catch (eFocus) {}
  }

  // The first RPC result is only a short roster preview. Typing must ask
  // search_member_access again, or members past that page (Anna Peterson)
  // stay hidden. The box still filters the latest result locally so either
  // name order matches before and after the database function is updated.
  function scheduleServerSearch() {
    if (fixture) return;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchTimer = null;
      runServerSearch();
    }, 200);
  }

  function rememberSearch(rows, requested) {
    var sent = normalizeQuery(requested);
    var list = Array.isArray(rows) ? rows : [];
    if (!sent) {
      roster = list.slice();
      if (!normalizeQuery(query)) {
        serverHits = null;
        serverHitsQuery = "";
      }
      return;
    }
    if (sent === normalizeQuery(query)) {
      serverHits = list.slice();
      serverHitsQuery = sent;
    }
  }

  function prepSearchRow(item) {
    item.title_keys = item.title_keys || [];
    item.committees = item.committees || [];
    item.grants = item.grants || [];
    return item;
  }

  async function fetchSearch(client, q) {
    var res = await client.rpc("search_member_access", { p_q: q });
    if (res.error) throw res.error;
    var members = Array.isArray(res.data) ? res.data : [];
    members.forEach(prepSearchRow);
    return members;
  }

  function intersectTokenHits(lists, q) {
    var counts = {};
    var byId = {};
    lists.forEach(function (list) {
      var seen = {};
      list.forEach(function (item) {
        if (!item || item.id == null || seen[item.id]) return;
        seen[item.id] = true;
        counts[item.id] = (counts[item.id] || 0) + 1;
        if (!byId[item.id]) byId[item.id] = item;
      });
    });
    var need = lists.length;
    return Object.keys(byId).filter(function (id) {
      return counts[id] === need && !byId[id].merged_into && memberMatchesQuery(byId[id], q);
    }).map(function (id) { return byId[id]; });
  }

  async function runServerSearch() {
    if (fixture) return;
    var client = clientOrNull();
    var requested = query;
    var seq = ++searchSeq;
    if (!client) {
      if (seq !== searchSeq) return;
      searchPending = false;
      if (model) render();
      return;
    }
    try {
      var qNorm = normalizeQuery(requested);
      var members = await fetchSearch(client, String(requested || "").trim());
      if (seq !== searchSeq) return;
      var direct = members.filter(function (item) {
        return memberMatchesQuery(item, qNorm);
      });
      // The database function currently loaded may only match one name order.
      // When "Peterson Anna" comes back empty, ask for each name and keep
      // members that match every word. After sql/kos_member_search_any_name.sql
      // is applied, the first call already returns those members.
      var tokens = qNorm.split(" ").filter(Boolean);
      if (!direct.length && tokens.length > 1) {
        var lists = [];
        var t;
        for (t = 0; t < tokens.length; t++) {
          var part = await fetchSearch(client, tokens[t]);
          if (seq !== searchSeq) return;
          lists.push(part);
        }
        members = intersectTokenHits(lists, qNorm);
      } else {
        members = direct;
      }
      rememberSearch(members, requested);
      searchPending = false;
      if (model) {
        render();
        refocusSearch();
      }
    } catch (err) {
      if (seq !== searchSeq) return;
      searchPending = false;
      if (model && normalizeQuery(query)) {
        message = (err && err.message) || "Could not search members.";
        render();
        refocusSearch();
      }
    }
  }

  function grantsFromTools(tools) {
    var grants = [];
    (tools || []).forEach(function (tool) {
      if (tool.grant && !tool.grant.expired) {
        grants.push({
          tool_key: tool.key,
          ends_on: tool.grant.ends_at ? String(tool.grant.ends_at).slice(0, 10) : null,
          endsAt: tool.grant.ends_at,
          needsReview: !!tool.grant.needs_review,
          needs_review: !!tool.grant.needs_review
        });
      }
    });
    return grants;
  }

  async function openMemberDetail(id) {
    var client = clientOrNull();
    if (!client || fixture || !id) {
      if (detailPendingId === id) {
        detailPendingId = "";
        draft = null;
        message = "Still connecting. Try again in a moment.";
        if (model) render();
      }
      return;
    }
    var seq = ++detailSeq;
    try {
      var detail = await client.rpc("get_member_access", { p_member_id: id });
      if (seq !== detailSeq || !model || model.selectedId !== id) return;
      if (detail.error) throw detail.error;
      var memberRow = detail.data && detail.data.member;
      if (!memberRow) throw new Error("Could not open that member.");
      memberRow.title_keys = memberRow.title_keys || [];
      memberRow.committees = memberRow.committees || [];
      memberRow.grants = grantsFromTools(detail.data.tools);
      memberRow.accessReady = true;
      var replaced = false;
      model.members = (model.members || []).map(function (member) {
        if (member.id !== id) return member;
        replaced = true;
        return memberRow;
      });
      if (!replaced) model.members = model.members.concat([memberRow]);
      if (serverHits) {
        serverHits = serverHits.map(function (member) {
          return member.id === id ? memberRow : member;
        });
      }
      if (detailPendingId === id) detailPendingId = "";
      draft = blankDraft(memberRow);
      review = null;
      render();
    } catch (err) {
      if (seq !== detailSeq || !model || model.selectedId !== id) return;
      if (detailPendingId === id) detailPendingId = "";
      draft = null;
      review = null;
      message = (err && err.message) || "Could not open that member.";
      render();
    }
  }

  async function loadLive(client, selectId) {
    paintShell();
    var root = document.getElementById("kosRolesRoot");
    if (fixture) {
      useModel(fixture, true);
      return;
    }
    if (!client) {
      model = { members: [], requests: [], changes: [], missingSql: true, ready: false, viewer: {} };
      render();
      return;
    }
    var requested = query || "";
    try {
      var search = await client.rpc("search_member_access", { p_q: requested });
      if (search.error) throw search.error;
      var requests = await client.rpc("list_access_chair_requests");
      var changes = await client.rpc("list_member_access_changes", { p_limit: 20 });
      var members = Array.isArray(search.data) ? search.data : [];
      var picked = selectId || model && model.selectedId || (members[0] && members[0].id);
      var detail = null;
      if (picked) {
        detail = await client.rpc("get_member_access", { p_member_id: picked });
        if (detail.error) throw detail.error;
      }
      var memberRow = detail && detail.data && detail.data.member;
      var viewerRow = detail && detail.data && detail.data.viewer;
      if (memberRow) {
        memberRow.title_keys = memberRow.title_keys || [];
        memberRow.committees = memberRow.committees || [];
        memberRow.accessReady = true;
        memberRow.grants = [];
        (detail.data.tools || []).forEach(function (tool) {
          if (tool.grant && !tool.grant.expired) {
            memberRow.grants.push({
              tool_key: tool.key,
              ends_on: tool.grant.ends_at ? String(tool.grant.ends_at).slice(0, 10) : null,
              endsAt: tool.grant.ends_at,
              needsReview: !!tool.grant.needs_review,
              needs_review: !!tool.grant.needs_review
            });
          }
        });
      }
      var normalized = members.map(function (item) {
        if (memberRow && item.id === memberRow.id) return memberRow;
        item.title_keys = item.title_keys || [];
        item.committees = item.committees || [];
        item.grants = item.grants || [];
        return item;
      });
      if (memberRow && !normalized.some(function (item) { return item.id === memberRow.id; })) {
        normalized.unshift(memberRow);
      }
      if (!searchTimer) searchPending = false;
      rememberSearch(normalized, requested);
      useModel({
        ready: true,
        sample: false,
        selectedId: picked,
        members: normalized,
        requests: Array.isArray(requests.data) ? requests.data : [],
        changes: Array.isArray(changes.data) ? changes.data : [],
        viewer: viewerRow ? {
          id: viewerRow.member_id,
          canChangeAnyTitle: !!viewerRow.can_change_any_title,
          canChangeChairTitles: !!viewerRow.can_change_chair_titles,
          isAdmin: !!viewerRow.is_admin,
          isOfficerBoardOrChair: true,
          grantable: viewerRow.grantable || []
        } : {}
      }, true);
      if (root && message) {
        var msg = document.getElementById("kosRolesMsg");
        if (msg) msg.textContent = message;
      }
    } catch (err) {
      searchPending = false;
      var missing = /could not find the function|schema cache|kos_member_roles/i.test(String(err && err.message || err));
      model = {
        ready: false,
        missingSql: missing,
        members: [],
        requests: [],
        changes: [],
        viewer: { canChangeChairTitles: !!(window.kosHubState && window.kosHubState.canAssignChairs) }
      };
      message = missing
        ? "Title and tool changes need the database update in sql/kos_member_roles_and_access.sql. It has not been applied yet."
        : ((err && err.message) || "Could not load members.");
      if (!missing && window.kosHubState && window.kosHubState.canAssignChairs) {
        try {
          var legacy = await client.rpc("list_chair_desk");
          if (legacy && legacy.data && legacy.data.requests) model.requests = legacy.data.requests;
        } catch (e2) {}
      }
      render();
    }
  }

  function openRoles() {
    paintShell();
    if (fixture) {
      // Officer desk wiring re-opens this tool after the member is already
      // on screen. Re-applying the fixture would wipe an in-progress edit.
      var already = document.getElementById("kosRolesMember");
      if (already && model && draft && String(model.selectedId) === String(fixture.selectedId)) return;
      useModel(fixture, true);
      return;
    }
    var client = clientOrNull();
    loadLive(client, model && model.selectedId);
  }

  window.kosRolesAccessOpen = openRoles;
  window.kosRolesAccessPaint = paintShell;

  window.__kosSetRolesAccess = function (payload) {
    fixture = payload || null;
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    searchPending = false;
    searchSeq += 1;
    if (fixture) {
      query = fixture.query || "";
      roster = [];
      serverHits = null;
      serverHitsQuery = "";
      useModel(fixture, false);
    } else {
      roster = [];
      serverHits = null;
      serverHitsQuery = "";
      model = null;
      draft = null;
    }
    paintShell();
  };

  window.kosPaintHubNotices = function (host) {
    var notices = window.__kosHubNotices || [];
    var unread = notices.filter(function (notice) { return notice && !notice.read_at; });
    var existing = document.getElementById("hubNoticesCard");
    if (!unread.length) {
      if (existing) existing.remove();
      return;
    }
    if (!host) return;
    if (!existing) {
      existing = document.createElement("div");
      existing.id = "hubNoticesCard";
      existing.className = "hub-board";
      host.insertBefore(existing, host.firstChild);
    }
    existing.innerHTML = "<h3>Notices</h3><div class=\"hub-board-rule\"></div>" +
      unread.map(function (notice) {
        return '<div class="hub-board-item"><h4>' + esc(notice.title) + "</h4><p>" + esc(notice.body) + "</p>" +
          '<button class="btn" type="button" data-notice="' + esc(notice.id) + '">Dismiss</button></div>';
      }).join("");
    existing.querySelectorAll("[data-notice]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-notice");
        window.__kosHubNotices = (window.__kosHubNotices || []).map(function (notice) {
          if (notice.id === id) notice.read_at = new Date().toISOString();
          return notice;
        });
        var client = clientOrNull();
        if (client && !fixture) {
          client.rpc("mark_hub_notice_read", { p_id: id }).catch(function () {});
        }
        window.kosPaintHubNotices(host);
      });
    });
  };
})();
