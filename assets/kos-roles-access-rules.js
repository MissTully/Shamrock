/* Shared rules for Member roles and access.
   The database (sql/kos_member_roles_and_access.sql) is the authority.
   This file drives the confirmation screen and the offline tests.
   Keep the title bundles in step with that SQL file. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.kosRolesRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FULL = [
    "member_contacts", "volunteer_inquiries", "approvals", "lockers",
    "event_studio", "parade_guests", "event_outreach", "shop_studio",
    "qr_studio", "doc_studio", "reports", "reports.events", "reports.parades",
    "reports.members", "all_krewe", "email_members", "roles_access"
  ];
  var MONEY = ["payments", "send_invoices", "dues_waivers"];

  function uniq(list) {
    var out = [];
    (list || []).forEach(function (item) {
      if (item && out.indexOf(item) === -1) out.push(item);
    });
    return out;
  }

  var TOOLS = [
    { key: "applications", label: "Membership Applications", section: "Membership", sensitive: true },
    { key: "member_contacts", label: "Member contacts", section: "Membership" },
    { key: "roles_access", label: "Member roles and access", section: "Membership" },
    { key: "volunteer_inquiries", label: "Volunteer inquiries", section: "Charity" },
    { key: "approvals", label: "Approvals", section: "Approvals" },
    { key: "event_studio", label: "Event Studio", section: "Events" },
    { key: "parade_guests", label: "Parade guests", section: "Events" },
    { key: "event_outreach", label: "Event outreach", section: "Events" },
    { key: "qr_studio", label: "QR Code Studio", section: "Events" },
    { key: "doc_studio", label: "Document Studio", section: "Documents" },
    { key: "shop_studio", label: "Shop Studio", section: "Shop" },
    { key: "lockers", label: "Locker rentals", section: "Gear" },
    { key: "payments", label: "Dues and Payments", section: "Money", sensitive: true },
    { key: "send_invoices", label: "Send invoices", section: "Email and invoices", sensitive: true },
    { key: "dues_waivers", label: "Dues waivers", section: "Email and invoices", sensitive: true },
    { key: "email_members", label: "Email members", section: "Email and invoices" },
    { key: "all_krewe", label: "All Krewe Messages", section: "Email and invoices" },
    { key: "reports", label: "Reports", section: "Reports" },
    { key: "reports.events", label: "Event reports", section: "Reports", group: "events" },
    { key: "reports.merch", label: "Merchandise reports", section: "Reports", group: "merch" },
    { key: "reports.parades", label: "Parade reports", section: "Reports", group: "parades" },
    { key: "reports.members", label: "Member reports", section: "Reports", group: "members" },
    { key: "reports.finance", label: "Finance reports", section: "Reports", group: "finance" }
  ];

  var TITLES = [
    { key: "president", label: "President", kind: "officer", tools: uniq(FULL.concat(MONEY, ["applications", "reports.finance"])) },
    { key: "vice_president", label: "Vice President", kind: "officer", tools: FULL.slice() },
    { key: "secretary", label: "Secretary", kind: "officer", tools: uniq(FULL.concat(MONEY, ["applications"])) },
    { key: "treasurer", label: "Treasurer", kind: "officer", tools: uniq(FULL.concat(MONEY, ["reports.finance"])) },
    { key: "board_member", label: "Board Member", kind: "board", tools: FULL.slice() },
    { key: "chair_membership", label: "Committee Chair of Membership", kind: "chair", committee: "Membership", tools: uniq(FULL.concat(MONEY, ["applications"])) },
    { key: "chair_bylaws", label: "Committee Chair of Bylaws and Rules", kind: "chair", committee: "Bylaws and Rules", tools: FULL.slice() },
    { key: "chair_float", label: "Committee Chair of Float", kind: "chair", committee: "Float", tools: FULL.slice() },
    { key: "chair_parade", label: "Committee Chair of Parade", kind: "chair", committee: "Parade", tools: FULL.slice() },
    { key: "chair_social", label: "Committee Chair of Social", kind: "chair", committee: "Social", tools: FULL.slice() },
    { key: "chair_charity", label: "Committee Chair of Charity/Fundraising", kind: "chair", committee: "Charity/Fundraising", tools: FULL.slice() },
    { key: "chair_merchandise", label: "Committee Chair of Merchandise", kind: "chair", committee: "Merchandise", tools: ["member_contacts", "shop_studio", "reports.merch", "roles_access"] },
    { key: "cochair_merchandise", label: "Co-Chair of Merchandise", kind: "co_chair", committee: "Merchandise", tools: ["member_contacts", "shop_studio", "reports.merch", "roles_access"] },
    { key: "chair_finance", label: "Committee Chair of Finance", kind: "chair", committee: "Finance", tools: uniq(FULL.concat(MONEY, ["reports.finance"])) },
    { key: "chair_communication", label: "Committee Chair of Communication", kind: "chair", committee: "Communication", tools: FULL.slice() },
    { key: "chair_technology", label: "Chair of Technology", kind: "chair", committee: "Technology", tools: uniq(FULL.concat(MONEY, ["applications"])) }
  ];

  var TOOL_BY_KEY = {};
  TOOLS.forEach(function (tool) { TOOL_BY_KEY[tool.key] = tool; });
  var TITLE_BY_KEY = {};
  TITLES.forEach(function (title) { TITLE_BY_KEY[title.key] = title; });

  function titleByKey(key) { return TITLE_BY_KEY[key] || null; }
  function toolByKey(key) { return TOOL_BY_KEY[key] || null; }

  function isChairTitle(title) {
    return !!(title && (title.kind === "chair" || title.kind === "co_chair"));
  }

  function toolsForTitles(keys) {
    var out = [];
    (keys || []).forEach(function (key) {
      var title = TITLE_BY_KEY[key];
      if (!title) return;
      title.tools.forEach(function (tool) {
        if (out.indexOf(tool) === -1) out.push(tool);
      });
    });
    return out;
  }

  function nyParts(now) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    var parts = fmt.formatToParts(now instanceof Date ? now : new Date(now));
    var map = {};
    parts.forEach(function (part) { map[part.type] = part.value; });
    return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
  }

  /* The upcoming June 30 in America/New_York. June 30 itself rolls to next year. */
  function nextGrantEnd(now) {
    var p = nyParts(now || new Date());
    var year = p.year;
    if (p.month > 6 || (p.month === 6 && p.day >= 30)) year += 1;
    return year + "-06-30";
  }

  function formatGrantEnd(isoDate) {
    if (!isoDate) return "";
    var bits = String(isoDate).slice(0, 10).split("-");
    if (bits.length < 3) return String(isoDate);
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var month = months[Number(bits[1]) - 1] || bits[1];
    return month + " " + Number(bits[2]) + ", " + bits[0];
  }

  function memberIsActive(status) {
    var s = status || "active";
    return s === "active" || s === "pending-renewal";
  }

  function grantState(grant, memberStatus, now) {
    if (!grant || grant.revokedAt || grant.revoked_at) return "revoked";
    var endRaw = grant.endsAt || grant.ends_at || (grant.ends_on ? grant.ends_on + "T23:59:59-04:00" : null);
    var end = endRaw ? new Date(endRaw) : null;
    var clock = now instanceof Date ? now : new Date(now || Date.now());
    if (end && !isNaN(end.getTime()) && end.getTime() <= clock.getTime()) return "expired";
    if (!memberIsActive(memberStatus)) return "paused";
    if (grant.needsReview || grant.needs_review) return "review";
    return "live";
  }

  function grantAllows(grant, memberStatus, now) {
    var state = grantState(grant, memberStatus, now);
    return state === "live" || state === "review";
  }

  function canEditTitle(viewer, title, targetId) {
    if (!viewer || !title || !targetId || viewer.id === targetId) return false;
    if (viewer.canChangeAnyTitle || viewer.isAdmin) return true;
    if (viewer.canChangeChairTitles && isChairTitle(title)) return true;
    return false;
  }

  function canGrantTool(viewer, toolKey, targetId) {
    if (!viewer || !toolKey || !targetId || viewer.id === targetId) return false;
    if (viewer.isAdmin) return true;
    if (!viewer.isOfficerBoardOrChair) return false;
    var grantable = viewer.grantable || [];
    if (grantable.indexOf(toolKey) !== -1) return true;
    if (String(toolKey).indexOf("reports.") === 0 && grantable.indexOf("reports") !== -1) return true;
    return false;
  }

  function accessDiff(input) {
    input = input || {};
    var beforeTitles = input.beforeTitles || [];
    var afterTitles = input.afterTitles || [];
    var beforeExtras = input.beforeExtras || [];
    var afterExtras = input.afterExtras || [];
    var keepTools = input.keepTools || [];
    var beforeSet = toolsForTitles(beforeTitles);
    var afterSet = toolsForTitles(afterTitles);
    var addedTitles = afterTitles.filter(function (key) { return beforeTitles.indexOf(key) === -1; });
    var removedTitles = beforeTitles.filter(function (key) { return afterTitles.indexOf(key) === -1; });
    var onlyFromRemoved = beforeSet.filter(function (key) {
      return afterSet.indexOf(key) === -1 && beforeExtras.indexOf(key) === -1;
    });
    var extrasAdded = afterExtras.filter(function (key) {
      return beforeExtras.indexOf(key) === -1 && afterSet.indexOf(key) === -1;
    });
    var extrasRemoved = beforeExtras.filter(function (key) {
      return afterExtras.indexOf(key) === -1 && afterSet.indexOf(key) === -1;
    });
    var kept = keepTools.filter(function (key) { return onlyFromRemoved.indexOf(key) !== -1; });
    var droppedWithTitle = onlyFromRemoved.filter(function (key) { return kept.indexOf(key) === -1; });
    return {
      addedTitles: addedTitles,
      removedTitles: removedTitles,
      onlyFromRemoved: onlyFromRemoved,
      kept: kept,
      droppedWithTitle: droppedWithTitle,
      extrasAdded: extrasAdded,
      extrasRemoved: extrasRemoved
    };
  }

  function handoverPreview(input) {
    input = input || {};
    var fromTitles = input.fromTitles || [];
    var titleKey = input.titleKey;
    var extras = input.extras || [];
    var remaining = fromTitles.filter(function (key) { return key !== titleKey; });
    var beforeSet = toolsForTitles(fromTitles);
    var afterSet = toolsForTitles(remaining);
    var lost = beforeSet.filter(function (key) {
      return afterSet.indexOf(key) === -1 && extras.indexOf(key) === -1;
    });
    var keep = input.keepTools || [];
    return {
      moved: titleKey,
      remaining: remaining,
      stays: extras.slice(),
      lostUnlessKept: lost,
      kept: keep.filter(function (key) { return lost.indexOf(key) !== -1; })
    };
  }

  var SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  function canUndo(change, viewer, now) {
    if (!change || !viewer || change.undone || change.hasNewer) return false;
    if (viewer.canChangeAnyTitle || viewer.isAdmin) return true;
    if (!change.actorId || change.actorId !== viewer.id) return false;
    var clock = now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime();
    var created = new Date(change.createdAt).getTime();
    if (isNaN(created)) return false;
    return clock - created <= SEVEN_DAYS;
  }

  return {
    TOOLS: TOOLS,
    TITLES: TITLES,
    titleByKey: titleByKey,
    toolByKey: toolByKey,
    isChairTitle: isChairTitle,
    toolsForTitles: toolsForTitles,
    nextGrantEnd: nextGrantEnd,
    formatGrantEnd: formatGrantEnd,
    memberIsActive: memberIsActive,
    grantState: grantState,
    grantAllows: grantAllows,
    canEditTitle: canEditTitle,
    canGrantTool: canGrantTool,
    accessDiff: accessDiff,
    handoverPreview: handoverPreview,
    canUndo: canUndo
  };
});
