(function () {
  "use strict";
  function esc(s) { return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) { return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]; }); }
  function csv(s) { s = s == null ? "" : String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function install() {
    var body = document.getElementById("reportBody"), title = document.getElementById("reportTitle");
    if (!body || !title || document.getElementById("kosReportExports")) return;
    var actions = document.createElement("div"); actions.id = "kosReportExports";
    actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px;";
    actions.innerHTML = '<button class="rpt-btn" type="button" id="kosReportCsv">⬇ Download CSV</button><button class="rpt-btn" type="button" id="kosReportPdf">🖨 Print / Save PDF</button>';
    title.insertAdjacentElement("afterend", actions);
    actions.querySelector("#kosReportCsv").onclick = function () {
      var table = body.querySelector("table"), text = table ? Array.prototype.map.call(table.querySelectorAll("tr"), function (tr) { return Array.prototype.map.call(tr.children, function (c) { return csv(c.textContent.trim()); }).join(","); }).join("\n") : body.innerText.trim();
      var url = URL.createObjectURL(new Blob([text], {type:"text/csv;charset=utf-8"})), a = document.createElement("a");
      a.href = url; a.download = (title.textContent || "krewe-report").replace(/[^a-z0-9]+/gi,"-").toLowerCase() + ".csv"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    };
    actions.querySelector("#kosReportPdf").onclick = function () {
      var w = window.open("", "_blank", "noopener,noreferrer"); if (!w) { alert("Please allow pop-ups to print this report."); return; }
      w.document.write("<!doctype html><html><head><title>" + esc(title.textContent) + "</title><style>body{font:14px Arial;padding:24px;color:#222}h1{color:#14532d}table{border-collapse:collapse;width:100%}th{background:#14532d;color:#fff;text-align:left}th,td{padding:7px;border:1px solid #ccc}tr:nth-child(even){background:#f6f1e5}</style></head><body><h1>" + esc(title.textContent) + "</h1>" + body.innerHTML + "</body></html>"); w.document.close(); w.focus(); w.print();
    };
  }
  function boot() {
    var body = document.getElementById("reportBody"); if (!body || !window.MutationObserver) return;
    new MutationObserver(install).observe(body, {childList:true,subtree:true}); install();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 500); }); else setTimeout(boot, 500);
})();
