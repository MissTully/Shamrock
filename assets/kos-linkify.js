/* Turn http(s) addresses in already-escaped HTML into links.
   Callers escape with their own esc() first, then pass that string here.
   Only http and https are linked. Trailing sentence punctuation stays outside the link. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.kosLinkify = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function safeHttp(url) {
    var value = String(url == null ? "" : url).trim();
    if (!/^https?:\/\//i.test(value)) return "";
    if (/[\u0000-\u0020<>"']/.test(value)) return "";
    return value;
  }

  function className(opts) {
    var value = opts && opts.className ? String(opts.className) : "kos-url";
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(value)) return "kos-url";
    return value;
  }

  function linkify(escapedHtml, opts) {
    var s = String(escapedHtml == null ? "" : escapedHtml);
    var re = /https?:\/\/[^\s<>"']+/gi;
    var cls = className(opts);
    var out = "";
    var last = 0;
    var m;
    while ((m = re.exec(s))) {
      var prev = m.index > 0 ? s.charAt(m.index - 1) : "";
      if (prev && /[A-Za-z0-9]/.test(prev)) continue;
      out += s.slice(last, m.index);
      var href = m[0];
      var trail = "";
      while (href && /[.,);:!?]$/.test(href)) {
        var ch = href.slice(-1);
        if (ch === ")" && (href.split("(").length >= href.split(")").length)) break;
        // A semicolon that finishes &amp; / &quot; / &#39; is part of the escaped URL.
        if (ch === ";" && /&(?:\#\d+|\#x[0-9a-f]+|[a-z]{2,8})$/i.test(href.slice(0, -1))) break;
        trail = ch + trail;
        href = href.slice(0, -1);
      }
      if (!/^https?:\/\/[^/?#\s]/i.test(href)) out += m[0];
      else {
        out += '<a class="' + cls + '" href="' + href + '" target="_blank" rel="noopener noreferrer">' +
          href + "</a>" + trail;
      }
      last = m.index + m[0].length;
    }
    out += s.slice(last);
    return out;
  }

  linkify.safeHttp = safeHttp;
  return linkify;
});
