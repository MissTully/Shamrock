/* Parade security shifts.
   Members sign up on the Parade tab. Officers with the parade_security tool
   post shifts and read the roster. Phones never go on a public page.
   Local fixtures: window.__kosParadeSecurity and window.__kosOfficerParadeSecurity. */
(function (global) {
  "use strict";

  var memberModel = null;
  var officerModel = null;
  var memberMsg = "";
  var officerMsg = "";
  var pickedParade = "";
  var pickedShift = "";
  var editingId = "";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function injectCss() {
    if (document.getElementById("kosParadeSecurityCss")) return;
    var s = document.createElement("style");
    s.id = "kosParadeSecurityCss";
    s.textContent = [
      ".ps-form label{display:block;font-weight:600;margin:0 0 4px;}",
      ".ps-form input,.ps-form select,.ps-form textarea{width:100%;box-sizing:border-box;font-size:17px;min-height:44px;margin:0 0 10px;}",
      ".ps-form textarea{min-height:88px;}",
      ".ps-note{font-size:15.5px;color:var(--ink);margin:0 0 12px;line-height:1.45;}",
      ".ps-spots{font-weight:700;color:var(--green-800);margin:0 0 8px;}",
      ".ps-mine{margin:0 0 14px;}",
      ".ps-shift-line{margin:0 0 8px;}",
      "#hubParadeSecurity a.ps-tel,#hubParadeSecurityCard a.ps-tel{color:var(--green-800);font-weight:700;}",
      ".ps-actions{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px;}",
      /* Same inset as Parade guests: .hub-wrap .app-body is 16px on every side. */
      "#hubParadeSecurity.app-card > .app-body{padding:16px;}",
      "#hubParadeSecurityDesk{max-width:100%;}",
      "#hubParadeSecurityDesk .hub-report-tablewrap{max-width:100%;}"
    ].join("");
    document.head.appendChild(s);
  }

  function etParts(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return null;
    var fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    var map = {};
    fmt.formatToParts(d).forEach(function (p) { map[p.type] = p.value; });
    return map;
  }

  function shiftWhen(start, end) {
    function parts(value) {
      var d = new Date(value);
      if (isNaN(d.getTime())) return null;
      return {
        date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }),
        time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })
      };
    }
    var a = parts(start);
    var b = end ? parts(end) : null;
    if (!a) return "";
    if (!b) return a.date + ", " + a.time + " ET";
    if (a.date === b.date) return a.date + ", " + a.time + " to " + b.time + " ET";
    return a.date + ", " + a.time + " ET to " + b.date + ", " + b.time + " ET";
  }

  function toEtInput(iso) {
    var p = etParts(iso);
    if (!p) return "";
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }

  function fromEtInput(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5];
    var utc = Date.UTC(y, mo - 1, d, h, mi);
    var i;
    for (i = 0; i < 4; i++) {
      var parts = etParts(new Date(utc));
      if (!parts) break;
      var asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
      var want = Date.UTC(y, mo - 1, d, h, mi);
      if (asUtc === want) break;
      utc += (want - asUtc);
    }
    return new Date(utc).toISOString();
  }

  function telHref(phone) {
    var digits = String(phone || "").replace(/[^\d+]/g, "");
    if (digits.indexOf("+") > 0) digits = digits.replace(/\+/g, "");
    if (digits.replace(/\D/g, "").length < 7) return "";
    return "tel:" + digits;
  }

  function spotsLeft(shift) {
    if (!shift) return 0;
    if (Array.isArray(shift.signups)) {
      var used = 0;
      shift.signups.forEach(function (row) {
        if (row && row.status === "signed_up") used += 1;
      });
      return Math.max(0, (Number(shift.capacity) || 0) - used);
    }
    if (shift.spots_left == null) return 0;
    return Math.max(0, Number(shift.spots_left) || 0);
  }

  function spotsLabel(n) {
    n = Number(n) || 0;
    if (n === 0) return "This shift is full.";
    if (n === 1) return "1 spot left";
    return n + " spots left";
  }

  function statusLabel(status) {
    if (status === "signed_up") return "Signed up";
    if (status === "cancelled") return "Cancelled";
    return status || "";
  }

  function findParade(list, id) {
    var found = null;
    (list || []).forEach(function (row) {
      if (String(row.event_id || row.id) === String(id)) found = row;
    });
    return found;
  }

  function findShift(parade, id) {
    var found = null;
    if (!parade) return null;
    (parade.shifts || []).forEach(function (row) {
      if (String(row.id) === String(id)) found = row;
    });
    return found;
  }

  function csvEscape(v) {
    var t = v == null ? "" : String(v);
    if (/[",\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function rosterCsv(parades) {
    var lines = ["Parade,Shift,Starts,Ends,Name,Phone,Email,Status"];
    (parades || []).forEach(function (parade) {
      (parade.shifts || []).forEach(function (shift) {
        (shift.signups || []).forEach(function (row) {
          lines.push([
            parade.name,
            shift.label,
            shift.starts_at,
            shift.ends_at,
            row.name,
            row.phone,
            row.email,
            statusLabel(row.status)
          ].map(csvEscape).join(","));
        });
      });
    });
    return lines.join("\n");
  }

  function client() {
    return global.__kosSb || null;
  }

  function renderMember(model) {
    injectCss();
    memberModel = model || { phone: "", parades: [] };
    var host = document.getElementById("hubParadeSecurityBody");
    if (!host) return;
    var parades = memberModel.parades || [];
    var html = '<p class="ps-note">The krewe provides a vest, and there is a briefing before each parade. No drinking while you are on duty.</p>';
    if (memberModel.message && !parades.length) {
      html += '<p class="empty">' + esc(memberModel.message) + "</p>";
      host.innerHTML = html;
      return;
    }
    if (!parades.length) {
      html += '<p class="empty">Security shifts are coming soon. Check back once the parade chairs post times.</p>';
      host.innerHTML = html;
      return;
    }

    var mine = [];
    parades.forEach(function (parade) {
      (parade.shifts || []).forEach(function (shift) {
        if (shift.my_status === "signed_up") mine.push({ parade: parade, shift: shift });
      });
    });
    if (mine.length) {
      html += '<div class="ps-mine"><p style="margin:0 0 6px;"><b>Your shifts</b></p>';
      mine.forEach(function (item) {
        html += '<p class="ps-shift-line"><b>' + esc(item.parade.name) + "</b>, " + esc(item.shift.label) +
          ". " + esc(shiftWhen(item.shift.starts_at, item.shift.ends_at)) +
          ' <button type="button" class="btn" data-ps-cancel="' + esc(item.shift.id) + '">Cancel</button></p>';
      });
      html += "</div>";
    }

    if (!pickedParade || !findParade(parades, pickedParade)) pickedParade = String(parades[0].event_id);
    var parade = findParade(parades, pickedParade) || parades[0];
    var shifts = parade.shifts || [];
    if (!pickedShift || !findShift(parade, pickedShift)) {
      var open = null;
      shifts.forEach(function (shift) {
        if (!open && shift.my_status !== "signed_up" && spotsLeft(shift) > 0) open = shift;
      });
      pickedShift = String((open || shifts[0] || {}).id || "");
    }
    var shift = findShift(parade, pickedShift);

    html += '<div class="ps-form hub-event-grid">';
    html += '<div><label for="psParade">Parade</label><select id="psParade">';
    parades.forEach(function (row) {
      html += '<option value="' + esc(row.event_id) + '"' + (String(row.event_id) === String(parade.event_id) ? " selected" : "") + ">" +
        esc(row.name || "Parade") + "</option>";
    });
    html += "</select></div>";
    html += '<div><label for="psShift">Shift</label><select id="psShift">';
    shifts.forEach(function (row) {
      var left = spotsLeft(row);
      var tag = row.my_status === "signed_up" ? " (signed up)" : (left === 0 ? " (full)" : "");
      html += '<option value="' + esc(row.id) + '"' + (shift && String(row.id) === String(shift.id) ? " selected" : "") + ">" +
        esc(row.label || "Shift") + esc(tag) + "</option>";
    });
    html += "</select></div>";
    if (shift) {
      var leftNow = spotsLeft(shift);
      var phone = shift.my_status === "signed_up" && shift.my_phone ? shift.my_phone : (memberModel.phone || "");
      html += '<div class="wide"><p class="ps-spots" id="psSpots">' + esc(spotsLabel(leftNow)) + "</p>" +
        "<p class=\"ps-note\" style=\"margin:0;\">" + esc(shiftWhen(shift.starts_at, shift.ends_at)) +
        (shift.notes ? ". " + esc(shift.notes) : "") + "</p></div>";
      html += '<div class="wide"><label for="psPhone">Phone</label>' +
        '<input id="psPhone" type="tel" autocomplete="tel" inputmode="tel" value="' + esc(phone) + '" />' +
        '<p class="hub-opt-hint">Parade chairs use this number to reach you. It is not shown on the public site.</p></div>';
      html += "</div>";
      html += '<div class="ps-actions">';
      if (shift.my_status === "signed_up") {
        html += '<button type="button" class="btn btn-primary" id="psSignup">Update phone</button>';
        html += '<button type="button" class="btn" id="psCancel">Cancel my signup</button>';
      } else if (leftNow <= 0) {
        html += '<button type="button" class="btn btn-primary" id="psSignup" disabled>Shift full</button>';
      } else {
        html += '<button type="button" class="btn btn-primary" id="psSignup">Sign up</button>';
      }
      html += "</div>";
    } else {
      html += "</div>";
    }
    if (memberMsg) html += '<p class="hub-report-msg" id="psMsg">' + esc(memberMsg) + "</p>";
    host.innerHTML = html;
    wireMember();
  }

  function wireMember() {
    var paradeSel = document.getElementById("psParade");
    var shiftSel = document.getElementById("psShift");
    if (paradeSel) paradeSel.addEventListener("change", function () {
      pickedParade = paradeSel.value;
      pickedShift = "";
      renderMember(memberModel);
    });
    if (shiftSel) shiftSel.addEventListener("change", function () {
      pickedShift = shiftSel.value;
      renderMember(memberModel);
    });
    var signup = document.getElementById("psSignup");
    if (signup) signup.addEventListener("click", function () { submitSignup(signup); });
    var cancel = document.getElementById("psCancel");
    if (cancel) cancel.addEventListener("click", function () { submitCancel(pickedShift, cancel); });
    var host = document.getElementById("hubParadeSecurityBody");
    if (!host) return;
    host.querySelectorAll("[data-ps-cancel]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        submitCancel(btn.getAttribute("data-ps-cancel"), btn);
      });
    });
  }

  function readPhone() {
    var input = document.getElementById("psPhone");
    return input ? input.value : "";
  }

  async function submitSignup(btn) {
    var phone = readPhone();
    if (String(phone).replace(/\D/g, "").length < 7) {
      memberMsg = "Add a phone number so the parade chairs can reach you.";
      renderMember(memberModel);
      return;
    }
    if (btn) btn.disabled = true;
    memberMsg = "";
    try {
      if (global.__kosParadeSecurityLocked) {
        applyLocalSignup(pickedShift, phone);
        memberMsg = "You are signed up. The parade chairs have your phone number.";
        renderMember(memberModel);
        return;
      }
      var c = client();
      if (!c || typeof c.rpc !== "function") throw new Error("Still connecting. Try again in a moment.");
      var res = await c.rpc("member_signup_parade_security", { p_shift_id: pickedShift, p_phone: phone });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) {
        memberMsg = res.data.message || "That signup did not go through.";
      } else {
        memberMsg = (res.data && res.data.message) || "You are signed up.";
      }
      await refreshMember();
    } catch (e) {
      memberMsg = (e && e.message) || "Could not sign up. Try again.";
      renderMember(memberModel);
    }
  }

  function applyLocalSignup(shiftId, phone) {
    var parades = (memberModel && memberModel.parades) || [];
    parades.forEach(function (parade) {
      (parade.shifts || []).forEach(function (shift) {
        if (String(shift.id) !== String(shiftId)) return;
        var was = shift.my_status === "signed_up";
        shift.my_status = "signed_up";
        shift.my_phone = phone;
        if (!was && shift.spots_left != null) shift.spots_left = Math.max(0, Number(shift.spots_left) - 1);
      });
    });
    global.__kosParadeSecurity = memberModel;
  }

  function applyLocalCancel(shiftId) {
    var parades = (memberModel && memberModel.parades) || [];
    parades.forEach(function (parade) {
      (parade.shifts || []).forEach(function (shift) {
        if (String(shift.id) !== String(shiftId)) return;
        if (shift.my_status === "signed_up" && shift.spots_left != null) {
          shift.spots_left = Number(shift.spots_left) + 1;
        }
        shift.my_status = "cancelled";
      });
    });
    global.__kosParadeSecurity = memberModel;
  }

  async function submitCancel(shiftId, btn) {
    if (!shiftId) return;
    if (btn) btn.disabled = true;
    memberMsg = "";
    try {
      if (global.__kosParadeSecurityLocked) {
        applyLocalCancel(shiftId);
        memberMsg = "Signup cancelled. The spot is open for another member.";
        renderMember(memberModel);
        return;
      }
      var c = client();
      if (!c || typeof c.rpc !== "function") throw new Error("Still connecting. Try again in a moment.");
      var res = await c.rpc("member_cancel_parade_security", { p_shift_id: shiftId });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) memberMsg = res.data.message || "Could not cancel.";
      else memberMsg = (res.data && res.data.message) || "Signup cancelled.";
      await refreshMember();
    } catch (e) {
      memberMsg = (e && e.message) || "Could not cancel. Try again.";
      renderMember(memberModel);
    }
  }

  async function refreshMember() {
    if (global.__kosParadeSecurityLocked) {
      renderMember(global.__kosParadeSecurity || { phone: "", parades: [] });
      return;
    }
    var c = client();
    if (!c || typeof c.rpc !== "function") {
      renderMember(memberModel || { phone: "", parades: [], message: "" });
      if (!memberModel) {
        renderMember({ phone: "", parades: [] });
      }
      return;
    }
    try {
      var res = await c.rpc("member_parade_security_shifts");
      if (global.__kosParadeSecurityLocked) {
        renderMember(global.__kosParadeSecurity || { phone: "", parades: [] });
        return;
      }
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) {
        renderMember({ phone: "", parades: [], message: data.message || "Sign in to sign up for parade security." });
        return;
      }
      renderMember(data);
    } catch (e) {
      if (global.__kosParadeSecurityLocked) {
        renderMember(global.__kosParadeSecurity || { phone: "", parades: [] });
        return;
      }
      var text = (e && e.message) || "";
      if (/member_parade_security_shifts|schema cache|PGRST202|404/i.test(text)) {
        renderMember({ phone: "", parades: [] });
        return;
      }
      renderMember({ phone: "", parades: [], message: "Security shifts could not be loaded. Try again in a moment." });
    }
  }

  function paradeChoices() {
    var model = officerModel || {};
    if (model.parade_choices && model.parade_choices.length) return model.parade_choices;
    return (model.parades || []).map(function (row) {
      return { event_id: row.event_id, name: row.name, start_time: row.start_time };
    });
  }

  function renderOfficer() {
    injectCss();
    var host = document.getElementById("hubParadeSecurityDesk");
    if (!host) return;
    if (global.__kosOfficerParadeSecurity) officerModel = global.__kosOfficerParadeSecurity;
    var model = officerModel || { parades: [], parade_choices: [] };
    var choices = paradeChoices();
    var editing = null;
    (model.parades || []).forEach(function (parade) {
      (parade.shifts || []).forEach(function (shift) {
        if (String(shift.id) === String(editingId)) editing = { parade: parade, shift: shift };
      });
    });
    var html = "";
    if (officerMsg) html += '<p class="hub-report-msg" id="psOfficerMsg">' + esc(officerMsg) + "</p>";
    html += '<form class="ps-form hub-event-grid" id="psOfficerForm">';
    html += '<div class="wide"><h3 style="margin:0 0 8px;">' + (editing ? "Edit shift" : "Add a shift") + "</h3></div>";
    html += '<div><label for="psOffParade">Parade</label><select id="psOffParade" required>';
    if (!choices.length) html += '<option value="">No published parades yet</option>';
    choices.forEach(function (row) {
      var selected = editing ? String(editing.parade.event_id) === String(row.event_id) : false;
      html += '<option value="' + esc(row.event_id) + '"' + (selected ? " selected" : "") + ">" + esc(row.name || "Parade") + "</option>";
    });
    html += "</select></div>";
    html += '<div><label for="psOffLabel">Label</label><input id="psOffLabel" required maxlength="120" placeholder="Route walk" value="' +
      esc(editing ? editing.shift.label : "") + '" /></div>';
    html += '<div><label for="psOffStart">Start</label><input id="psOffStart" type="datetime-local" required value="' +
      esc(editing ? toEtInput(editing.shift.starts_at) : "") + '" /></div>';
    html += '<div><label for="psOffEnd">End</label><input id="psOffEnd" type="datetime-local" required value="' +
      esc(editing ? toEtInput(editing.shift.ends_at) : "") + '" /></div>';
    html += '<div><label for="psOffCap">Capacity</label><input id="psOffCap" type="number" min="1" max="500" required value="' +
      esc(editing ? editing.shift.capacity : "8") + '" /></div>';
    html += '<div class="wide"><label for="psOffNotes">Notes</label><textarea id="psOffNotes" maxlength="1000" placeholder="Where to meet, and anything the crew should know.">' +
      esc(editing ? (editing.shift.notes || "") : "") + "</textarea></div>";
    html += '<div class="wide ps-actions"><button type="submit" class="btn btn-primary" id="psOffSave">' +
      (editing ? "Save shift" : "Add shift") + "</button>";
    if (editing) html += '<button type="button" class="btn" id="psOffCancelEdit">Cancel edit</button>';
    html += "</div></form>";
    html += '<p class="ps-note">Times are Eastern. Published parades from Event Studio show in the list above.</p>';

    var parades = (model.parades || []).filter(function (row) { return (row.shifts || []).length; });
    html += '<div class="ps-actions"><button type="button" class="btn" id="psOffCsv"' + (parades.length ? "" : " disabled") + ">Export CSV</button></div>";
    if (!parades.length) {
      html += '<p class="empty">No security shifts yet. Add the first shift above.</p>';
    }
    parades.forEach(function (parade) {
      html += '<h3 style="margin:16px 0 6px;">' + esc(parade.name || "Parade") + "</h3>";
      (parade.shifts || []).forEach(function (shift) {
        var left = spotsLeft(shift);
        html += '<div class="hub-parade-guest-parade" style="margin:0 0 14px;">';
        html += "<p style=\"margin:0 0 6px;\"><b>" + esc(shift.label || "Shift") + "</b> · " +
          esc(shiftWhen(shift.starts_at, shift.ends_at)) + " · " +
          esc(String((Number(shift.capacity) || 0) - left) + " of " + String(shift.capacity || 0)) +
          " · " + esc(spotsLabel(left)) + "</p>";
        if (shift.notes) html += '<p class="ps-note">' + esc(shift.notes) + "</p>";
        html += '<div class="ps-actions">' +
          '<button type="button" class="btn" data-ps-edit="' + esc(shift.id) + '">Edit</button>' +
          '<button type="button" class="btn" data-ps-delete="' + esc(shift.id) + '">Delete</button></div>';
        var rows = shift.signups || [];
        if (!rows.length) {
          html += '<p class="empty">No signups yet.</p>';
        } else {
          html += '<div class="hub-report-tablewrap"><table class="hub-report-table"><thead><tr>' +
            "<th>Name</th><th>Phone</th><th>Email</th><th>Status</th></tr></thead><tbody>";
          rows.forEach(function (row) {
            var href = telHref(row.phone);
            var phoneCell = href
              ? '<a class="ps-tel" href="' + esc(href) + '">' + esc(row.phone) + "</a>"
              : esc(row.phone || "");
            html += "<tr><td>" + esc(row.name || "") + "</td><td>" + phoneCell + "</td><td>" +
              esc(row.email || "") + "</td><td>" + esc(statusLabel(row.status)) + "</td></tr>";
          });
          html += "</tbody></table></div>";
        }
        html += "</div>";
      });
    });
    host.innerHTML = html;
    wireOfficer();
  }

  function wireOfficer() {
    var form = document.getElementById("psOfficerForm");
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      saveShift();
    });
    var cancelEdit = document.getElementById("psOffCancelEdit");
    if (cancelEdit) cancelEdit.addEventListener("click", function () {
      editingId = "";
      renderOfficer();
    });
    var csv = document.getElementById("psOffCsv");
    if (csv) csv.addEventListener("click", function () {
      var blob = new Blob([rosterCsv((officerModel && officerModel.parades) || [])], { type: "text/csv;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "parade-security.csv";
      a.click();
    });
    var host = document.getElementById("hubParadeSecurityDesk");
    if (!host) return;
    host.querySelectorAll("[data-ps-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        editingId = btn.getAttribute("data-ps-edit");
        renderOfficer();
        var formEl = document.getElementById("psOfficerForm");
        if (formEl && formEl.scrollIntoView) formEl.scrollIntoView({ block: "nearest" });
      });
    });
    host.querySelectorAll("[data-ps-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        deleteShift(btn.getAttribute("data-ps-delete"));
      });
    });
  }

  function formValue(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  async function saveShift() {
    var payload = {
      p_id: editingId || null,
      p_event_id: formValue("psOffParade"),
      p_label: formValue("psOffLabel"),
      p_starts_at: fromEtInput(formValue("psOffStart")),
      p_ends_at: fromEtInput(formValue("psOffEnd")),
      p_capacity: Number(formValue("psOffCap")),
      p_notes: formValue("psOffNotes")
    };
    if (!payload.p_label || !String(payload.p_label).trim()) {
      officerMsg = "Give the shift a name, such as Route walk or Staging detail.";
      renderOfficer();
      return;
    }
    if (!payload.p_starts_at || !payload.p_ends_at) {
      officerMsg = "The shift needs a start and an end, and the end has to be later.";
      renderOfficer();
      return;
    }
    officerMsg = "";
    try {
      if (global.__kosOfficerParadeSecurity) {
        applyLocalSave(payload);
        officerMsg = editingId ? "Shift updated." : "Shift posted. Members can sign up in the Hub.";
        editingId = "";
        renderOfficer();
        return;
      }
      var c = client();
      if (!c || typeof c.rpc !== "function") throw new Error("Still connecting. Try again in a moment.");
      var res = await c.rpc("officer_save_parade_security_shift", payload);
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) officerMsg = res.data.message || "Could not save that shift.";
      else {
        officerMsg = (res.data && res.data.message) || "Saved.";
        editingId = "";
      }
      await refreshOfficer();
    } catch (e) {
      officerMsg = (e && e.message) || "Could not save that shift.";
      renderOfficer();
    }
  }

  function applyLocalSave(payload) {
    var model = officerModel || { parades: [], parade_choices: [] };
    var choices = paradeChoices();
    var parade = null;
    (model.parades || []).forEach(function (row) {
      if (String(row.event_id) === String(payload.p_event_id)) parade = row;
    });
    if (!parade) {
      var choice = null;
      choices.forEach(function (row) {
        if (String(row.event_id) === String(payload.p_event_id)) choice = row;
      });
      parade = {
        event_id: payload.p_event_id,
        name: choice ? choice.name : "Parade",
        start_time: choice ? choice.start_time : payload.p_starts_at,
        shifts: []
      };
      model.parades = model.parades || [];
      model.parades.push(parade);
    }
    var shift = null;
    if (payload.p_id) {
      (parade.shifts || []).forEach(function (row) {
        if (String(row.id) === String(payload.p_id)) shift = row;
      });
    }
    if (!shift) {
      shift = { id: "shift-" + Date.now(), signups: [] };
      parade.shifts = parade.shifts || [];
      parade.shifts.push(shift);
    }
    shift.label = String(payload.p_label).trim();
    shift.starts_at = payload.p_starts_at;
    shift.ends_at = payload.p_ends_at;
    shift.capacity = payload.p_capacity;
    shift.notes = payload.p_notes || "";
    officerModel = model;
    global.__kosOfficerParadeSecurity = model;
  }

  async function deleteShift(id) {
    var label = "this shift";
    (officerModel && officerModel.parades || []).forEach(function (parade) {
      (parade.shifts || []).forEach(function (shift) {
        if (String(shift.id) === String(id)) label = shift.label || label;
      });
    });
    if (global.confirm && !global.confirm("Delete " + label + "? Members signed up for it will be removed.")) return;
    officerMsg = "";
    try {
      if (global.__kosOfficerParadeSecurity) {
        var signed = 0;
        (officerModel.parades || []).forEach(function (parade) {
          parade.shifts = (parade.shifts || []).filter(function (shift) {
            if (String(shift.id) !== String(id)) return true;
            (shift.signups || []).forEach(function (row) {
              if (row.status === "signed_up") signed += 1;
            });
            return false;
          });
        });
        officerModel.parades = (officerModel.parades || []).filter(function (parade) {
          return (parade.shifts || []).length;
        });
        global.__kosOfficerParadeSecurity = officerModel;
        editingId = "";
        officerMsg = signed
          ? "Shift deleted. " + signed + " signed-up member" + (signed === 1 ? " was" : "s were") + " removed from it."
          : "Shift deleted.";
        renderOfficer();
        return;
      }
      var c = client();
      if (!c || typeof c.rpc !== "function") throw new Error("Still connecting. Try again in a moment.");
      var res = await c.rpc("officer_delete_parade_security_shift", { p_id: id });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) officerMsg = res.data.message || "Could not delete that shift.";
      else {
        officerMsg = (res.data && res.data.message) || "Shift deleted.";
        if (String(editingId) === String(id)) editingId = "";
      }
      await refreshOfficer();
    } catch (e) {
      officerMsg = (e && e.message) || "Could not delete that shift.";
      renderOfficer();
    }
  }

  async function refreshOfficer() {
    if (global.__kosOfficerParadeSecurity) {
      officerModel = global.__kosOfficerParadeSecurity;
      renderOfficer();
      return;
    }
    var c = client();
    var host = document.getElementById("hubParadeSecurityDesk");
    if (!c || typeof c.rpc !== "function") {
      if (host) host.innerHTML = '<p class="empty">Sign in to load parade security.</p>';
      return;
    }
    try {
      var res = await c.rpc("officer_parade_security_roster");
      if (global.__kosOfficerParadeSecurity) {
        officerModel = global.__kosOfficerParadeSecurity;
        renderOfficer();
        return;
      }
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) {
        if (host) host.innerHTML = '<p class="empty">' + esc(res.data.message || "Not authorized.") + "</p>";
        return;
      }
      officerModel = res.data || { parades: [], parade_choices: [] };
      renderOfficer();
    } catch (e) {
      if (global.__kosOfficerParadeSecurity) {
        officerModel = global.__kosOfficerParadeSecurity;
        renderOfficer();
        return;
      }
      if (host) host.innerHTML = '<p class="empty">Could not load parade security. ' + esc((e && e.message) || "") + "</p>";
    }
  }

  function paintOfficer() {
    var card = document.getElementById("hubParadeSecurity");
    if (!card) return;
    var body = card.querySelector(".app-body");
    if (body && !document.getElementById("hubParadeSecurityDesk")) {
      body.innerHTML = '<div id="hubParadeSecurityDesk"><p class="empty">Loading security shifts…</p></div>';
    }
    refreshOfficer();
  }

  global.__kosHubSetParadeSecurity = function (payload) {
    global.__kosParadeSecurity = payload || { phone: "", parades: [] };
    global.__kosParadeSecurityLocked = true;
    memberMsg = "";
    renderMember(global.__kosParadeSecurity);
  };

  global.__kosHubSetOfficerParadeSecurity = function (payload) {
    global.__kosOfficerParadeSecurity = payload || { parades: [], parade_choices: [] };
    officerModel = global.__kosOfficerParadeSecurity;
    officerMsg = "";
    renderOfficer();
  };

  global.kosParadeSecurity = {
    refreshMember: refreshMember,
    refreshOfficer: refreshOfficer,
    paintOfficer: paintOfficer,
    renderOfficer: renderOfficer
  };
})(typeof window !== "undefined" ? window : this);
