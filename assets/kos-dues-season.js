/* Dues season is June through May, same window as krewe_volunteer_season_year.
   Volunteer season year is the year the season ends (June 2026 returns 2027).
   Dues membership_year is the year the season starts (June 2026 returns 2026),
   which matches kos_dues_catalog and existing paid rows.
   November 2026 and January 2027 both stay on 2026. The season does not
   reset on January 1.
   Keep supabase/functions/zeffy-webhook/infer-kind.mjs duesSeasonYear in step.
   SQL: public.kos_dues_season_year (sql/kos_dues_renewal.sql). */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.kosDuesSeason = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parts(date) {
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "numeric",
      day: "numeric"
    });
    var map = {};
    fmt.formatToParts(date || new Date()).forEach(function (p) {
      if (p.type !== "literal") map[p.type] = Number(p.value);
    });
    return { year: map.year, month: map.month, day: map.day };
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function duesSeasonYear(date) {
    var p = parts(date || new Date());
    return p.month >= 6 ? p.year : p.year - 1;
  }

  function seasonLabel(year) {
    var y = Number(year);
    return y + "-" + String(y + 1).slice(-2);
  }

  function invoiceDueDate(issued) {
    var p = parts(issued || new Date());
    var due = new Date(Date.UTC(p.year, p.month - 1, p.day) + 30 * 86400000);
    return due.getUTCFullYear() + "-" + pad(due.getUTCMonth() + 1) + "-" + pad(due.getUTCDate());
  }

  /* A notice should not quote a due date that is already past. */
  function noticeDueDate(existingIso, now) {
    var fresh = invoiceDueDate(now || new Date());
    var raw = existingIso ? String(existingIso).slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fresh;
    var p = parts(now || new Date());
    var today = p.year + "-" + pad(p.month) + "-" + pad(p.day);
    if (raw < today) return fresh;
    return raw;
  }

  return {
    parts: parts,
    duesSeasonYear: duesSeasonYear,
    seasonLabel: seasonLabel,
    invoiceDueDate: invoiceDueDate,
    noticeDueDate: noticeDueDate
  };
});
