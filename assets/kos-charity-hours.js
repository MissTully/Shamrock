/* Charity desk: member volunteer hours roster.
   Pure helpers for the season math, filters, duplicate warning, and CSV.
   The database (sql/kos_charity_volunteer_hours.sql) decides who may see rows.
   This file never reads another member's hours by itself. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.kosCharityHours = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var REQUIRED = 12;
  var RATE = 12;
  var DUPLICATE_NOTE = "Possible duplicate of another log on this day for the same activity or event.";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function seasonYear(date) {
    var when = date instanceof Date ? date : new Date(date || Date.now());
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric"
    }).formatToParts(when);
    var year = 0;
    var month = 0;
    parts.forEach(function (part) {
      if (part.type === "year") year = Number(part.value);
      if (part.type === "month") month = Number(part.value);
    });
    if (!year || !month) return null;
    return month >= 6 ? year + 1 : year;
  }

  function seasonLabel(year) {
    var end = Number(year);
    if (!end) return "";
    return "June " + (end - 1) + " through May " + end;
  }

  function levelKey(level) {
    var key = String(level == null || level === "" ? "full" : level).toLowerCase();
    if (key === "associate" || key === "auxiliary" || key === "loa" || key === "full") return key;
    return "full";
  }

  function isFull(level) {
    return levelKey(level) === "full";
  }

  function levelLabel(level) {
    var key = levelKey(level);
    if (key === "associate") return "Associate";
    if (key === "auxiliary") return "Auxiliary";
    if (key === "loa") return "LOA";
    return "Full";
  }

  function memberName(member) {
    var named = String((member && member.name) || "").trim();
    if (named) return named;
    named = [member && member.first_name, member && member.last_name].filter(Boolean).join(" ").trim();
    return named || "Member";
  }

  function roundHours(n) {
    var x = Number(n);
    if (!isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  }

  function formatHours(n) {
    var x = roundHours(n);
    if (Math.abs(x - Math.round(x)) < 0.001) return String(Math.round(x));
    return String(x);
  }

  function formatMoney(n) {
    var x = roundHours(n);
    if (Math.abs(x - Math.round(x)) < 0.001) return "$" + Math.round(x);
    return "$" + x.toFixed(2);
  }

  function formatDay(iso) {
    var bits = String(iso || "").slice(0, 10).split("-");
    if (bits.length < 3 || bits[0].length !== 4) return String(iso || "");
    var month = MONTHS[Number(bits[1]) - 1] || bits[1];
    return month + " " + Number(bits[2]) + ", " + bits[0];
  }

  function logType(log) {
    var source = String((log && log.source) || "").toLowerCase();
    var activity = String((log && log.activity) || "");
    var notes = String((log && log.notes) || "");
    var blob = activity + " " + notes;
    if (source === "in_kind" || /in[- ]kind/i.test(blob)) return "In-kind";
    if (source === "trackitforward_import" || /season hours on file/i.test(activity) || /one-time season balance|season hours imported/i.test(notes)) {
      return "Season hours on file";
    }
    return "Shift";
  }

  function statusKey(log) {
    var status = String((log && log.status) || "").toLowerCase();
    if (status === "rejected") return "rejected";
    if (status === "approved" || (log && log.approved && status !== "rejected")) return "approved";
    if (status === "pending" || status === "") return "pending";
    return status || "pending";
  }

  function isApproved(log) {
    return statusKey(log) === "approved";
  }

  function isPending(log) {
    return statusKey(log) === "pending";
  }

  function statusLabel(log) {
    var key = statusKey(log);
    if (key === "approved") return "Approved";
    if (key === "rejected") return "Rejected";
    return "Pending";
  }

  function sameDay(a, b) {
    var left = String(a || "").slice(0, 10);
    var right = String(b || "").slice(0, 10);
    return !!left && left === right;
  }

  function sameActivity(a, b) {
    var left = String(a || "").trim().toLowerCase();
    var right = String(b || "").trim().toLowerCase();
    return !!left && left === right;
  }

  function sameEvent(a, b) {
    if (!a || !b) return false;
    return String(a) === String(b);
  }

  /* Counted log that matches another counted log: same member, same date,
     and the same activity text or the same event. Rejected logs are skipped. */
  function countsTowardTotal(log) {
    return statusKey(log) !== "rejected";
  }

  function isPossibleDuplicate(log, logs) {
    if (!log || !countsTowardTotal(log)) return false;
    return (logs || []).some(function (other) {
      if (!other || String(other.id) === String(log.id)) return false;
      if (!countsTowardTotal(other)) return false;
      if (log.member_id && other.member_id && String(log.member_id) !== String(other.member_id)) return false;
      if (!sameDay(log.worked_on, other.worked_on)) return false;
      return sameActivity(log.activity, other.activity) || sameEvent(log.event_id, other.event_id);
    });
  }

  function logsForSeason(member, season) {
    return (member.logs || []).filter(function (log) {
      if (!log || log.is_demo) return false;
      if (season && log.season_year != null && Number(log.season_year) !== Number(season)) return false;
      return true;
    });
  }

  function summarize(member, season) {
    var logs = logsForSeason(member, season).map(function (log) {
      return Object.assign({}, log, {
        member_id: log.member_id || member.member_id,
        type_label: log.type_label || logType(log)
      });
    });
    logs.forEach(function (log) {
      log.possible_duplicate = !!log.possible_duplicate || isPossibleDuplicate(log, logs);
    });
    logs.sort(function (a, b) {
      var day = String(b.worked_on || "").localeCompare(String(a.worked_on || ""));
      if (day) return day;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
    var logged = 0;
    logs.forEach(function (log) {
      if (!countsTowardTotal(log)) return;
      logged += roundHours(log.hours);
    });
    logged = roundHours(logged);
    var full = isFull(member.membership_level);
    var needed = full ? roundHours(Math.max(0, REQUIRED - logged)) : null;
    var buyout = full ? roundHours(needed * RATE) : null;
    return {
      member_id: member.member_id,
      first_name: member.first_name || "",
      last_name: member.last_name || "",
      name: memberName(member),
      membership_level: levelKey(member.membership_level),
      membership_status: member.membership_status || "active",
      level_label: levelLabel(member.membership_level),
      is_full: full,
      hours_logged: logged,
      hours_approved: logged,
      hours_pending: 0,
      hours_needed: needed,
      buyout_estimate: buyout,
      log_count: logs.length,
      logs: logs
    };
  }

  function matchesQuery(row, query) {
    var q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    var blob = [row.name, row.first_name, row.last_name].join(" ").toLowerCase();
    return blob.indexOf(q) !== -1;
  }

  function matchesFilter(row, filter) {
    if (filter === "met") return !!(row.is_full && row.hours_needed === 0);
    if (filter === "under") return !!(row.is_full && row.hours_needed > 0);
    if (filter === "duplicate" || filter === "pending") {
      return (row.logs || []).some(function (log) { return !!log.possible_duplicate; });
    }
    return true;
  }

  function sortRows(rows, sort) {
    var copy = (rows || []).slice();
    copy.sort(function (a, b) {
      if (sort === "hours") {
        var diff = (b.hours_logged || b.hours_approved || 0) - (a.hours_logged || a.hours_approved || 0);
        if (diff) return diff;
      }
      var last = String(a.last_name || a.name || "").toLowerCase().localeCompare(String(b.last_name || b.name || "").toLowerCase());
      if (last) return last;
      return String(a.first_name || "").toLowerCase().localeCompare(String(b.first_name || "").toLowerCase());
    });
    return copy;
  }

  function seasonChoices(payload, season) {
    var years = [];
    function add(year) {
      var n = Number(year);
      if (!n || years.indexOf(n) !== -1) return;
      years.push(n);
    }
    add(season);
    add(payload && payload.season_year);
    ((payload && payload.seasons) || []).forEach(add);
    ((payload && payload.members) || []).forEach(function (member) {
      (member.logs || []).forEach(function (log) { add(log.season_year); });
    });
    years.sort(function (a, b) { return b - a; });
    return years;
  }

  function prepare(payload, ui) {
    payload = payload || {};
    ui = ui || {};
    var season = Number(ui.season || payload.season_year || seasonYear(new Date()));
    var members = (payload.members || []).map(function (member) {
      return summarize(member, season);
    });
    var pending = [];
    members.forEach(function (member) {
      member.logs.forEach(function (log) {
        if (!isPending(log)) return;
        pending.push(Object.assign({ member_name: member.name }, log));
      });
    });
    pending.sort(function (a, b) {
      var day = String(a.worked_on || "").localeCompare(String(b.worked_on || ""));
      if (day) return day;
      return String(a.member_name || "").localeCompare(String(b.member_name || ""));
    });
    var shown = sortRows(members.filter(function (row) {
      return matchesQuery(row, ui.query) && matchesFilter(row, ui.filter || "all");
    }), ui.sort || "name");
    return {
      season: season,
      seasonLabel: seasonLabel(season),
      seasons: seasonChoices(payload, season),
      requiredHours: REQUIRED,
      buyoutRate: RATE,
      pending: pending,
      members: shown,
      total: members.length,
      duplicateNote: DUPLICATE_NOTE
    };
  }

  function rosterLine(row) {
    var logs = Number(row.log_count) || 0;
    var logged = row.hours_logged != null ? row.hours_logged : row.hours_approved;
    return [
      formatHours(logged) + " logged",
      logs + (logs === 1 ? " log" : " logs")
    ].join(" · ");
  }

  function needLine(row) {
    if (!row.is_full) return "12 hour goal not required";
    if (!row.hours_needed) return "12 hour goal met";
    var hours = formatHours(row.hours_needed);
    var noun = Number(row.hours_needed) === 1 ? "hour still needed" : "hours still needed";
    return hours + " " + noun + " · estimated buyout " + formatMoney(row.buyout_estimate);
  }

  function csvCell(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function toCsv(rows, seasonText) {
    var headers = ["Name", "Membership", "Logged hours", "Hours still needed", "Estimated shortfall buyout", "Logs", "Season"];
    var lines = [headers.join(",")];
    (rows || []).forEach(function (row) {
      var logged = row.hours_logged != null ? row.hours_logged : row.hours_approved;
      lines.push([
        row.name,
        row.level_label,
        formatHours(logged),
        row.is_full ? formatHours(row.hours_needed) : "Not required",
        row.is_full ? formatMoney(row.buyout_estimate) : "Not required",
        row.log_count,
        seasonText || ""
      ].map(csvCell).join(","));
    });
    return lines.join("\r\n");
  }

  return {
    REQUIRED: REQUIRED,
    RATE: RATE,
    DUPLICATE_NOTE: DUPLICATE_NOTE,
    seasonYear: seasonYear,
    seasonLabel: seasonLabel,
    levelLabel: levelLabel,
    isFull: isFull,
    memberName: memberName,
    formatHours: formatHours,
    formatMoney: formatMoney,
    formatDay: formatDay,
    logType: logType,
    statusKey: statusKey,
    statusLabel: statusLabel,
    isPossibleDuplicate: isPossibleDuplicate,
    summarize: summarize,
    matchesFilter: matchesFilter,
    prepare: prepare,
    rosterLine: rosterLine,
    needLine: needLine,
    toCsv: toCsv
  };
});
