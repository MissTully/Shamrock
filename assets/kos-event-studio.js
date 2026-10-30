/* Event Studio — companion to members-desk.js
   Lets board/officers/chairs create & edit events (optional Zeffy ticket links). */
(function () {
  "use strict";

  var CSS = [
    ".hub-event-form h3,.hub-event-list h3{font-family:var(--display);color:var(--green-800);margin:0 0 10px;font-size:18px;}",
    ".hub-event-form label{display:block;font-size:13px;color:var(--muted);margin:10px 0 3px;}",
    ".hub-event-form input,.hub-event-form textarea,.hub-event-form select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;font:inherit;background:#fff;}",
    ".hub-event-form textarea{min-height:76px;resize:vertical;}",
    ".hub-event-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}",
    ".hub-event-grid .wide{grid-column:1 / -1;}",
    ".hub-event-checks{display:flex;flex-wrap:wrap;gap:16px;margin:12px 0;}",
    ".hub-event-checks label{display:flex;align-items:center;gap:7px;margin:0;color:var(--green-800);cursor:pointer;}",
    ".hub-event-checks input{width:auto;}",
    ".hub-event-row{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;border:1px solid rgba(168,128,28,.3);border-radius:12px;padding:11px 12px;margin:8px 0;background:#fffdf4;}",
    ".hub-event-row b{font-family:var(--display);color:var(--green-800);}",
    ".hub-event-row .muted{color:var(--muted);font-size:13px;line-height:1.45;}",
    ".hub-event-row .hub-appr-btns{flex:none;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}",
    ".btn.btn-danger,.hub-event-form .btn-danger{border-color:#b3452e;color:#8b2e1c;background:#fff5f2;}",
    ".hub-event-delete-dialog{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(12,40,24,.55);}",
    ".hub-event-delete-dialog[hidden]{display:none !important;}",
    ".hub-event-delete-card{width:min(440px,100%);background:#fffdf4;color:var(--green-800);border:2px solid rgba(168,128,28,.75);border-radius:16px;padding:18px 18px 14px;box-shadow:0 16px 40px rgba(12,40,24,.28);}",
    ".hub-event-delete-card p{font-family:var(--display);font-size:17px;line-height:1.45;margin:0 0 16px;color:var(--green-800);}",
    ".hub-event-delete-card .hub-appr-btns{justify-content:flex-end;}",
    ".hub-event-delete-card #hubEventDeleteErr{font-family:inherit;font-size:14px;color:#8b2e1c;min-height:0;margin:10px 0 0;}",
    ".hub-event-delete-card #hubEventDeleteErr:empty{display:none;}",
    ".hub-feature-row{margin:0 0 10px;}",
    ".hub-feature-toggle{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(168,128,28,.7);background:#fffdf4;color:var(--green-800);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:14px;cursor:pointer;line-height:1.2;}",
    ".hub-feature-toggle .star{color:var(--gold-deep);font-size:16px;line-height:1;}",
    ".hub-feature-toggle[aria-pressed='true']{background:var(--green-800);color:#f6efdc;border-color:var(--gold);}",
    ".hub-feature-toggle[aria-pressed='true'] .star{color:var(--gold);}",
    ".hub-event-msg{min-height:1.2em;color:var(--green-800);font-size:14px;margin:8px 0 0;}",
    ".hub-event-form{margin-top:18px;padding-top:16px;border-top:1px dashed rgba(168,128,28,.4);}",
    ".hub-flyer-note{font-size:12px;color:var(--muted);margin:4px 0 0;}",
    ".hub-flyer-preview{margin-top:10px;display:none;align-items:center;gap:12px;flex-wrap:wrap;}",
    ".hub-flyer-preview.show{display:flex;}",
    ".hub-flyer-preview img{max-width:160px;max-height:120px;border-radius:10px;border:1px solid rgba(168,128,28,.35);object-fit:cover;background:#fff;}",
    ".hub-flyer-preview a{font-size:13px;}",
    ".hub-event-thumb{width:54px;height:54px;border-radius:10px;object-fit:cover;border:1px solid rgba(168,128,28,.35);background:#f3efe2;flex:none;}",
    ".hub-event-thumb.ph{display:grid;place-items:center;font-size:11px;color:var(--muted);text-align:center;padding:4px;}",
    ".hub-event-optional{grid-column:1/-1;margin-top:8px;padding:12px;border:1px solid rgba(168,128,28,.28);border-radius:12px;background:#fff;}",
    ".hub-event-optional h4{margin:0 0 6px;font-family:var(--display);color:var(--green-800);font-size:15px;}",
    ".hub-event-optional p.hub-opt-hint{font-size:12px;color:var(--muted);margin:0 0 8px;line-height:1.4;}",
    ".hub-event-optional-fields{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}",
    "@media(max-width:620px){.hub-event-grid{grid-template-columns:1fr;}.hub-event-grid .wide{grid-column:auto;}.hub-event-row{flex-direction:column;}.hub-event-optional-fields{grid-template-columns:1fr;}.hub-event-optional{padding:12px;}}",
  ].join("");

  function injectCss() {
    if (document.getElementById("kosEventStudioCss")) return;
    var s = document.createElement("style");
    s.id = "kosEventStudioCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function showOfficerTab() {
    document.querySelectorAll('[data-hub-tab="officer"]').forEach(function (btn) {
      btn.style.display = "";
    });
    var home = document.querySelector("[data-hub-panel='hub']") || document.getElementById("hubHome");
    // Ensure officer card exists on home if desk already rendered without it
    var wrap = document.querySelector(".hub-welcome");
    if (wrap && !document.querySelector("[data-hub-action='officer']")) {
      var card = document.createElement("div");
      card.className = "hub-officer-card";
      card.setAttribute("data-hub-action", "officer");
      card.innerHTML = '<div><b style="font-family:var(--display);font-size:18px;">Officer desk</b><div style="opacity:.9;font-size:14px;margin-top:4px;">Event Studio and officer tools</div></div><div class="go">Open →</div>';
      card.addEventListener("click", function () {
        if (typeof window.kosShowHub === "function") window.kosShowHub("officer");
      });
      wrap.appendChild(card);
    }
  }


  // ---- Event Studio: authorized event creation and editing ----
  function eventLocalInput(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value).slice(0, 16);
    function pad(n) { return n < 10 ? "0" + n : String(n); }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function eventLocalDisplay(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function eventStudioFormHtml() {
    return '<div class="hub-event-form" id="hubEventFormWrap">' +
      '<h3 id="hubEventFormTitle">New event</h3>' +
      '<form id="hubEventForm"><input type="hidden" id="hubEventId" />' +
      '<div class="hub-event-grid">' +
      '<div><label for="hubEventName">Name *</label><input id="hubEventName" required /></div>' +
      '<div><label for="hubEventType">Event type</label><select id="hubEventType">' +
      '<option value="social">Social</option><option value="parade">Parade</option><option value="meeting">Meeting</option>' +
      '<option value="online">Online</option>' +
      '<option value="fundraiser">Fundraiser</option><option value="other">Other</option></select></div>' +
      '<div><label for="hubEventStart">Start time *</label><input id="hubEventStart" type="datetime-local" required /></div>' +
      '<div><label for="hubEventEnd">End time</label><input id="hubEventEnd" type="datetime-local" /></div>' +
      '<div><label for="hubEventRegCloses">Close registrations on</label><input id="hubEventRegCloses" type="datetime-local" /></div>' +
      '<div class="wide" style="margin-top:-4px;"><p style="font-size:12px;color:var(--muted);margin:0 0 6px;line-height:1.4;">Optional. After this date/time, public signup shows Registration closed and blocks new RSVPs and ticket checkout. Leave blank to stay open. You can edit address, dates, and this close date. Saving stores a draft and does not publish.</p></div>' +
      '<div class="wide"><label for="hubEventLocation">Public location teaser</label><input id="hubEventLocation" placeholder="Members home, Tampa" />' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Safe for the public site. For a house party, keep this vague. Do not put a street address here.</p></div>' +
      '<div class="wide"><label for="hubEventMemberAddress">Private / member address</label><input id="hubEventMemberAddress" placeholder="Full street address" autocomplete="off" />' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Full address for signed-in members in the Member Hub and the RSVP confirmation email. Never shown on public pages.</p></div>' +
      '<div><label for="hubEventCapacity">Capacity</label><input id="hubEventCapacity" type="number" min="0" step="1" /></div>' +
      '<div class="wide"><label for="hubEventDescription">Description</label><textarea id="hubEventDescription"></textarea></div></div>' +
      '<div class="hub-event-checks"><label><input type="checkbox" id="hubEventPublic" checked /> Public event</label>' +
      '<label><input type="checkbox" id="hubEventMembersOnly" /> Members only</label>' +
      '<label><input type="checkbox" id="hubEventMandatory" /> Mandatory meeting</label></div>' +
      '<div class="hub-feature-row"><button class="hub-feature-toggle" type="button" id="hubEventFeatureToggle" aria-pressed="false"><span class="star" aria-hidden="true">\u2606</span> Feature on public site</button>' +
      '<p class="hub-opt-hint" style="margin:6px 0 0;">Featuring an event makes it public and published. Only one event is featured at a time. Ended events are not highlighted.</p></div>' +
      '<p class="hub-opt-hint" id="hubEventVisibilityHint" style="margin:-4px 0 4px;">Members only events don\'t appear on the public website.</p>' +
      '<p class="hub-opt-hint" style="margin:0 0 10px;">The street address stays off public pages either way. Uncheck Public event to hide an event from the public calendar.</p>' +
      '<div class="hub-event-grid">' +
      '<div><label for="hubEventStatus">Status</label><select id="hubEventStatus"><option value="draft">Draft</option><option value="cancelled">Cancelled</option></select></div>' +
      '<div><label for="hubEventTicketLabel">Ticket label</label><input id="hubEventTicketLabel" placeholder="e.g. Member ticket" /></div>' +
      '<div><label for="hubEventTicketPrice">Ticket price (dollars)</label><input id="hubEventTicketPrice" type="number" min="0" step="0.01" placeholder="0.00" /></div>' +
      '<div><label for="hubEventPaymentUrl">Ticket payment URL</label><input id="hubEventPaymentUrl" type="url" placeholder="https://www.zeffy.com/en-US/ticketing/..." /></div>' +
      '<div class="wide" style="grid-column:1/-1;"><div class="hub-event-checks" style="margin:0;">' +
      '<label><input type="checkbox" id="hubEventCollectGuests" checked /> Ask for guest count</label>' +
      '<label><input type="checkbox" id="hubEventCollectGuestNames" checked /> Ask for guest names</label></div>' +
      '<p style="font-size:12px;color:var(--muted);margin:6px 0 0;line-height:1.4;">Guest fields default on for Mini Golf style events. Uncheck to hide them on public signup.</p></div>' +
      '<div class="hub-event-optional" id="hubEventRaffleBox">' +
      '<h4>Raffle tickets (optional)</h4>' +
      '<p class="hub-opt-hint">Uses the existing Raffles tool (raffle_events) plus signup qty. Uncheck to leave this event without raffle tickets. If a price is needed, enter it. Do not leave a made-up amount.</p>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventCollectRaffle" /> Offer raffle tickets</label></div>' +
      '<div class="hub-event-optional-fields" id="hubEventRaffleFields" hidden>' +
      '<div><label for="hubEventRaffleOptions">Raffle qty choices</label><input id="hubEventRaffleOptions" placeholder="0,1,5,15" value="0,1,5,15" /></div>' +
      '<div><label for="hubEventRafflePrice">Raffle ticket price (dollars)</label><input id="hubEventRafflePrice" type="number" min="0" step="0.01" placeholder="Officer enters the price" /></div>' +
      '<div class="wide" style="grid-column:1/-1;"><label for="hubEventRaffleEvent">Attach existing raffle</label>' +
      '<select id="hubEventRaffleEvent"><option value="">None (qty only, or enter a price to create one)</option></select>' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Qty is saved with the signup (same path Mini Golf uses). A price or an existing raffle links raffle_events.ticket_price. There is no hardcoded dollar amount.</p></div></div></div>' +
      '<div class="hub-event-optional" id="hubEventMealBox">' +
      '<h4>Meal choice (optional)</h4>' +
      '<p class="hub-opt-hint">Off unless you turn it on. Members only see meal choices on events that have them.</p>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventCollectMeals" /> Ask members to choose a meal</label></div>' +
      '<div id="hubEventMealFields" hidden>' +
      '<label for="hubEventMealOptions">Meal options (one per line)</label>' +
      '<textarea id="hubEventMealOptions" placeholder="Chicken piccata&#10;Vegetarian pasta&#10;Kids meal"></textarea>' +
      '</div></div>' +
      '<div class="hub-event-optional" id="hubEventOnlineBox">' +
      '<h4>Online meeting (optional)</h4>' +
      '<p class="hub-opt-hint">In addition to in-person types. When this is an online event, save the open meeting join link. Signup emails that link only to the member who just registered.</p>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventOnline" /> This is an online event</label></div>' +
      '<div id="hubEventOnlineFields" hidden>' +
      '<label for="hubEventMeetingUrl">Meeting join URL</label>' +
      '<input id="hubEventMeetingUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://..." />' +
      '</div></div>' +
      '<div class="hub-event-optional" id="hubEventParadeBox" hidden>' +
      '<h4>Parade season</h4>' +
      '<p class="hub-opt-hint">Keep a Parade public for parades.html recruiting cards, and Members only so there is no public march RSVP. Staging streets go in Private staging address.</p>' +
      '<label for="hubEventRoleNotes">Role notes</label>' +
      '<textarea id="hubEventRoleNotes" placeholder="March, float, hospitality, etc."></textarea>' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Shown to signed-in members on the Hub parade card. Not shown on the public Parades page.</p>' +
      '<label for="hubEventLinkedMeeting">Mandatory meeting</label>' +
      '<select id="hubEventLinkedMeeting"><option value="">None (no Door Check-In meeting gate)</option></select>' +
      '<div class="hub-event-checks" style="margin:10px 0 8px;">' +
      '<label><input type="checkbox" id="hubEventCreateMeeting" /> Create a new mandatory meeting with this parade</label></div>' +
      '<div id="hubEventCreateMeetingFields" hidden>' +
      '<label for="hubEventCreateMeetingName">Meeting name</label><input id="hubEventCreateMeetingName" placeholder="Parade briefing" />' +
      '<label for="hubEventCreateMeetingStart">Meeting start</label><input id="hubEventCreateMeetingStart" type="datetime-local" />' +
      '<div class="hub-event-checks"><label><input type="checkbox" id="hubEventCreateMeetingMandatory" checked /> Meeting is mandatory</label></div>' +
      '</div></div>' +
      '<div class="wide"><label for="hubEventFlyerUrl">Event image / PDF URL</label><input id="hubEventFlyerUrl" type="url" placeholder="https://… or upload a file below" /></div>' +
      '<div class="wide"><label for="hubEventFlyerFile">Upload event image or PDF</label>' +
      '<input id="hubEventFlyerFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />' +
      '<p class="hub-flyer-note" id="hubEventFlyerNote" aria-live="polite">' + FLYER_NOTE_DEFAULT + '</p>' +
      '<div class="hub-flyer-preview" id="hubEventFlyerPreview" aria-live="polite"></div>' +
      '<button class="btn" type="button" id="hubEventFlyerClear" style="margin-top:8px;">Clear image / PDF</button></div></div>' +
      '<p style="font-size:13px;color:var(--muted);margin:10px 0 0;">For paid tickets, create a Zeffy ticketing campaign and paste the public share link here. Sign me up / RSVP will open that checkout. See PAYMENTS_SETUP.md. Save stores a draft and does not publish. After a successful save, review the saved name, date and time, location, and ticket price. Publish appears only after you confirm those details. Cancel that review and the event is not published and nobody is notified. If the event was already public, saving moves it back to a draft until you publish again. Each paid event needs its own Zeffy link.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;"><button class="btn btn-primary" type="submit" id="hubEventSave">☘ Save event</button>' +
      '<button class="btn btn-primary" type="button" id="hubEventPublish" hidden style="display:none">Publish</button>' +
      '<button class="btn" type="button" id="hubEventNew">New / clear</button>' +
      '<button class="btn btn-danger" type="button" id="hubEventDelete" hidden style="display:none">Delete</button></div>' +
      '<p class="hub-flyer-note" id="hubEventDeleteHint" hidden>To hide this event without removing it, set Status to Cancelled.</p>' +
      '<p class="hub-event-msg" id="hubEventMsg" aria-live="polite"></p></form>' +
      eventDeletePanelHtml() + eventFeaturePanelHtml() + '</div>';
  }

  function eventDeletePanelHtml() {
    return '<div class="hub-event-delete-dialog" id="hubEventDeletePanel" hidden role="dialog" aria-modal="true" aria-labelledby="hubEventDeleteSummary">' +
      '<div class="hub-event-delete-card">' +
      '<p id="hubEventDeleteSummary"></p>' +
      '<div class="hub-appr-btns">' +
      '<button class="btn" type="button" id="hubEventDeleteCancel">Cancel</button>' +
      '<button class="btn btn-danger" type="button" id="hubEventDeleteGo">Delete</button></div>' +
      '<p class="hub-event-msg" id="hubEventDeleteErr" aria-live="assertive"></p></div></div>';
  }

  function eventFeaturePanelHtml() {
    return '<div class="hub-event-delete-dialog" id="hubEventFeaturePanel" hidden role="dialog" aria-modal="true" aria-labelledby="hubEventFeatureSummary">' +
      '<div class="hub-event-delete-card">' +
      '<p id="hubEventFeatureSummary"></p>' +
      '<div class="hub-appr-btns">' +
      '<button class="btn" type="button" id="hubEventFeatureCancel">Cancel</button>' +
      '<button class="btn btn-primary" type="button" id="hubEventFeatureGo">Feature</button></div></div></div>';
  }

  // Uploads a flyer file to the public "event-flyers" storage bucket and
  // returns its public URL. Storage RLS only lets can_manage_events() write.
  var FLYER_NOTE_DEFAULT = "Upload fills the URL above. Published public events show on the Events page. Feature on public site highlights one event. Only one event is featured at a time.";
  var FLYER_MAX_BYTES = 10 * 1024 * 1024;
  var FLYER_TYPES = {
    "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"
  };
  async function uploadEventFlyer(client, file) {
    var ext = FLYER_TYPES[file.type];
    if (!ext) throw new Error("Please choose a PDF, JPG, PNG, or WEBP file.");
    if (file.size > FLYER_MAX_BYTES) throw new Error("Flyer files must be 10 MB or smaller.");
    var base = (file.name || "flyer").replace(/\.[^.]*$/, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "flyer";
    var path = Date.now() + "-" + base + "." + ext;
    var up = await client.storage.from("event-flyers").upload(path, file, {
      upsert: false, contentType: file.type, cacheControl: "3600"
    });
    if (up.error) throw up.error;
    return client.storage.from("event-flyers").getPublicUrl(path).data.publicUrl;
  }


  function syncFlyerPreview() {
    var urlEl = document.getElementById("hubEventFlyerUrl");
    var preview = document.getElementById("hubEventFlyerPreview");
    if (!preview) return;
    var url = urlEl ? urlEl.value.trim() : "";
    if (!url) {
      preview.className = "hub-flyer-preview";
      preview.innerHTML = "";
      return;
    }
    preview.className = "hub-flyer-preview show";
    if (/\.pdf(?:$|[?#])/i.test(url)) {
      preview.innerHTML = '<span class="hub-event-thumb ph">PDF</span><a href="' + esc(url) + '" target="_blank" rel="noopener">Open PDF ↗</a>';
    } else {
      preview.innerHTML = '<img src="' + esc(url) + '" alt="Event media preview" /><a href="' + esc(url) + '" target="_blank" rel="noopener">Open image ↗</a>';
    }
  }

  var eventRaffles = [];
  var eventStudioList = [];
  var pendingDelete = null;
  var deleteBusy = false;
  var deleteReturnFocus = null;
  var studioClient = null;
  var DELETE_RPC_CONFIRM = "Delete permanently";

  function showEl(id, on) {
    var el = document.getElementById(id);
    if (!el) return;
    if (on) { el.hidden = false; el.style.display = ""; }
    else { el.hidden = true; el.style.display = "none"; }
  }

  function fillRaffleEventSelect(selectedId) {
    var sel = document.getElementById("hubEventRaffleEvent");
    if (!sel) return;
    var html = '<option value="">None (qty only, or enter a price to create one)</option>';
    eventRaffles.forEach(function (r) {
      if (!r || !r.id) return;
      var label = (r.name || "Raffle") + (r.is_active === false ? " (inactive)" : "");
      if (r.ticket_price != null && r.ticket_price !== "") label += " · $" + Number(r.ticket_price).toFixed(2);
      html += '<option value="' + esc(r.id) + '"' + (String(r.id) === String(selectedId || "") ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    sel.innerHTML = html;
    if (selectedId) sel.value = selectedId;
  }

  function fillLinkedMeetingSelect(selectedId) {
    var sel = document.getElementById("hubEventLinkedMeeting");
    if (!sel) return;
    var currentId = document.getElementById("hubEventId");
    var selfId = currentId ? currentId.value : "";
    var html = '<option value="">None (no Door Check-In meeting gate)</option>';
    (eventStudioList || []).forEach(function (ev) {
      if (!ev || !ev.id) return;
      if (String(ev.id) === String(selfId)) return;
      if (String(ev.source || "").toLowerCase() === "ikc") return;
      if (String(ev.event_type || "").toLowerCase() !== "meeting") return;
      var label = (ev.name || "Meeting") + (ev.start_time ? " · " + eventLocalDisplay(ev.start_time) : "");
      html += '<option value="' + esc(ev.id) + '"' + (String(ev.id) === String(selectedId || "") ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    sel.innerHTML = html;
    if (selectedId) sel.value = selectedId;
  }

  function syncOptionalEventFields() {
    var typeEl = document.getElementById("hubEventType");
    var onlineBox = document.getElementById("hubEventOnline");
    if (typeEl && onlineBox && typeEl.value === "online") onlineBox.checked = true;
    var raffleOn = !!(document.getElementById("hubEventCollectRaffle") && document.getElementById("hubEventCollectRaffle").checked);
    var mealOn = !!(document.getElementById("hubEventCollectMeals") && document.getElementById("hubEventCollectMeals").checked);
    var onlineOn = !!(onlineBox && onlineBox.checked) || (typeEl && typeEl.value === "online");
    showEl("hubEventRaffleFields", raffleOn);
    showEl("hubEventMealFields", mealOn);
    showEl("hubEventOnlineFields", onlineOn);
    var paradeOn = !!(typeEl && typeEl.value === "parade");
    showEl("hubEventParadeBox", paradeOn);
    showEl("hubEventCreateMeetingFields", paradeOn && !!(document.getElementById("hubEventCreateMeeting") && document.getElementById("hubEventCreateMeeting").checked));
    setFieldLabel("hubEventStart", paradeOn ? "Muster / step-off start *" : "Start time *");
    setFieldLabel("hubEventEnd", paradeOn ? "Step-off window end" : "End time");
    setFieldLabel("hubEventLocation", paradeOn ? "Public teaser location" : "Public location teaser");
    setFieldLabel("hubEventMemberAddress", paradeOn ? "Private staging address" : "Private / member address");
    var loc = document.getElementById("hubEventLocation");
    var membersOnly = !!(document.getElementById("hubEventMembersOnly") && document.getElementById("hubEventMembersOnly").checked);
    if (loc) {
      if (onlineOn) loc.placeholder = "Optional for online events";
      else if (paradeOn) loc.placeholder = "Bayshore Boulevard, Tampa";
      else if (membersOnly) loc.placeholder = "Members home, Tampa";
      else loc.placeholder = "Venue name or city (public)";
    }
    var addr = document.getElementById("hubEventMemberAddress");
    if (addr) addr.placeholder = paradeOn ? "Staging street (Hub + RSVP email only)" : "Full street address";
  }

  function setFieldLabel(inputId, text) {
    var lab = document.querySelector('label[for="' + inputId + '"]');
    if (lab) lab.textContent = text;
  }

  function onRaffleEventPicked() {
    var sel = document.getElementById("hubEventRaffleEvent");
    var price = document.getElementById("hubEventRafflePrice");
    if (!sel || !price || !sel.value) return;
    var row = eventRaffles.find(function (r) { return String(r.id) === String(sel.value); });
    if (row && row.ticket_price != null && row.ticket_price !== "" && !price.value) {
      price.value = Number(row.ticket_price).toFixed(2);
    }
  }

  async function loadEventRaffles(client) {
    try {
      var res = await client.rpc("officer_list_event_raffles");
      if (res.error) throw res.error;
      var data = res.data || {};
      eventRaffles = Array.isArray(data.raffles) ? data.raffles : [];
    } catch (e) {
      eventRaffles = [];
    }
    var current = document.getElementById("hubEventRaffleEvent");
    fillRaffleEventSelect(current ? current.value : "");
  }

  function eventOnDateLabel(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  }

  function deleteConfirmMessage(name, start) {
    var title = String(name || "").trim() || "this event";
    var date = eventOnDateLabel(start);
    var lead = date ? ("Delete " + title + " on " + date + "?") : ("Delete " + title + "?");
    return lead + " This also removes its RSVPs. This can't be undone.";
  }

  function showDeletedMessage() {
    var msg = document.getElementById("hubEventMsg");
    var listMsg = document.getElementById("hubEventListMsg");
    if (msg) msg.textContent = "Deleted";
    if (listMsg) listMsg.textContent = "Deleted";
  }

  function removeEventFromList(id) {
    var before = eventStudioList || [];
    var next = before.filter(function (row) { return String(row.id) !== String(id); });
    if (next.length === before.length) return;
    eventStudioList = next;
    renderEventList(eventStudioList);
    var linked = document.getElementById("hubEventLinkedMeeting");
    fillLinkedMeetingSelect(linked ? linked.value : "");
  }

  function showEventDeleteButton(on) {
    var btn = document.getElementById("hubEventDelete");
    var hint = document.getElementById("hubEventDeleteHint");
    if (btn) {
      btn.hidden = !on;
      btn.style.display = on ? "" : "none";
      btn.disabled = false;
    }
    if (hint) {
      hint.hidden = !on;
      hint.style.display = on ? "" : "none";
    }
  }

  function parkDialog(panel) {
    if (panel && panel.parentNode !== document.body) document.body.appendChild(panel);
    return panel;
  }

  function hideDeletePanel() {
    if (deleteBusy) return;
    pendingDelete = null;
    var panel = document.getElementById("hubEventDeletePanel");
    var err = document.getElementById("hubEventDeleteErr");
    var go = document.getElementById("hubEventDeleteGo");
    var cancel = document.getElementById("hubEventDeleteCancel");
    if (err) err.textContent = "";
    if (go) {
      go.disabled = false;
      go.textContent = "Delete";
    }
    if (cancel) cancel.disabled = false;
    if (panel) {
      panel.hidden = true;
      panel.style.display = "none";
    }
    var back = deleteReturnFocus;
    deleteReturnFocus = null;
    if (back && document.contains(back) && typeof back.focus === "function") {
      try { back.focus(); } catch (e) {}
    }
  }

  function showDeletePanel(event, trigger) {
    var row = event || {};
    if (!row.id) return;
    pendingDelete = {
      id: row.id,
      name: row.name || "",
      start_time: row.start_time || ""
    };
    var panel = parkDialog(document.getElementById("hubEventDeletePanel"));
    var summary = document.getElementById("hubEventDeleteSummary");
    var err = document.getElementById("hubEventDeleteErr");
    var go = document.getElementById("hubEventDeleteGo");
    var cancel = document.getElementById("hubEventDeleteCancel");
    if (summary) summary.textContent = deleteConfirmMessage(pendingDelete.name, pendingDelete.start_time);
    if (err) err.textContent = "";
    if (go) {
      go.disabled = false;
      go.textContent = "Delete";
    }
    if (cancel) cancel.disabled = false;
    deleteReturnFocus = trigger || document.activeElement;
    if (panel) {
      panel.hidden = false;
      panel.style.display = "flex";
    }
    if (cancel) cancel.focus();
  }

  function eventFromFormForDelete() {
    var idEl = document.getElementById("hubEventId");
    var nameEl = document.getElementById("hubEventName");
    var startEl = document.getElementById("hubEventStart");
    var startVal = startEl ? startEl.value.trim() : "";
    var startIso = "";
    if (startVal) {
      var d = new Date(startVal);
      startIso = isNaN(d.getTime()) ? startVal : d.toISOString();
    }
    return {
      id: idEl ? idEl.value.trim() : "",
      name: nameEl ? nameEl.value.trim() : "",
      start_time: startIso
    };
  }

  async function runDeleteEvent(client) {
    var err = document.getElementById("hubEventDeleteErr");
    var go = document.getElementById("hubEventDeleteGo");
    var cancel = document.getElementById("hubEventDeleteCancel");
    var msg = document.getElementById("hubEventMsg");
    if (deleteBusy) return;
    if (!pendingDelete || !pendingDelete.id) {
      if (err) err.textContent = "Choose an event to delete.";
      return;
    }
    deleteBusy = true;
    if (go) {
      go.disabled = true;
      go.textContent = "Deleting...";
    }
    if (cancel) cancel.disabled = true;
    if (err) err.textContent = "";
    var id = String(pendingDelete.id);
    try {
      var res = await client.rpc("officer_delete_event", {
        p_event_id: pendingDelete.id,
        p_confirm: DELETE_RPC_CONFIRM
      });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not delete event.");
      deleteBusy = false;
      hideDeletePanel();
      var idEl = document.getElementById("hubEventId");
      if (idEl && String(idEl.value) === id) clearEventForm();
      removeEventFromList(id);
      showDeletedMessage();
      refreshEventStudio(client, { quiet: true });
    } catch (e) {
      deleteBusy = false;
      var text = (e && e.message) || String(e);
      if (err) err.textContent = text;
      if (msg) msg.textContent = "Couldn't delete: " + text;
      if (go) {
        go.disabled = false;
        go.textContent = "Delete";
      }
      if (cancel) cancel.disabled = false;
    }
  }

  function wireEventDelete(client) {
    studioClient = client;
    parkDialog(document.getElementById("hubEventDeletePanel"));
    var formBtn = document.getElementById("hubEventDelete");
    if (formBtn) {
      formBtn.addEventListener("click", function () {
        showDeletePanel(eventFromFormForDelete(), formBtn);
      });
    }
    var cancel = document.getElementById("hubEventDeleteCancel");
    if (cancel) cancel.addEventListener("click", hideDeletePanel);
    var go = document.getElementById("hubEventDeleteGo");
    if (go) go.addEventListener("click", function () { runDeleteEvent(client); });
    var panel = document.getElementById("hubEventDeletePanel");
    if (panel) {
      panel.addEventListener("click", function (e) {
        if (e.target === panel) hideDeletePanel();
      });
      panel.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          e.preventDefault();
          hideDeletePanel();
        }
      });
    }
  }

  function featureToggleOn() {
    var btn = document.getElementById("hubEventFeatureToggle");
    return !!(btn && btn.getAttribute("aria-pressed") === "true");
  }

  function setFeatureToggle(on) {
    var btn = document.getElementById("hubEventFeatureToggle");
    if (!btn) return;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    var star = btn.querySelector(".star");
    if (star) star.textContent = on ? "\u2605" : "\u2606";
  }

  function eventHasEnded(ev) {
    if (window.kosCalendar && typeof window.kosCalendar.eventHasEnded === "function") {
      return window.kosCalendar.eventHasEnded(ev);
    }
    var now = Date.now();
    if (!ev) return false;
    var end = ev.end_time ? new Date(ev.end_time) : null;
    if (end && !isNaN(end.getTime())) return end.getTime() < now;
    var start = ev.start_time ? new Date(ev.start_time) : null;
    if (!start || isNaN(start.getTime())) return false;
    return start.getTime() < now;
  }

  function featureReasons(row) {
    var reasons = [];
    if (row && row.members_only) reasons.push("members only");
    var status = String((row && row.status) || "draft").toLowerCase();
    if (status === "cancelled") reasons.push("cancelled");
    else if (status !== "published") reasons.push("still a draft");
    else if (row && row.is_public === false) reasons.push("hidden from the public site");
    return reasons;
  }

  function featureNeedsPrompt(row) {
    return featureReasons(row).length > 0;
  }

  function featurePromptCopy(name, row) {
    var title = String(name || "").trim() || "this event";
    var reasons = featureReasons(row);
    var why = reasons.length ? (" This event is " + reasons.join(" and ") + ".") : "";
    return "Feature " + title + " on the public site?" + why + " Featuring it makes it public and published.";
  }

  function askFeatureConfirm(copy) {
    return new Promise(function (resolve) {
      var panel = parkDialog(document.getElementById("hubEventFeaturePanel"));
      var summary = document.getElementById("hubEventFeatureSummary");
      var cancel = document.getElementById("hubEventFeatureCancel");
      var go = document.getElementById("hubEventFeatureGo");
      if (!panel || !cancel || !go) {
        resolve(window.confirm(copy));
        return;
      }
      if (summary) summary.textContent = copy;
      function finish(ok) {
        panel.hidden = true;
        panel.style.display = "none";
        cancel.removeEventListener("click", onCancel);
        go.removeEventListener("click", onGo);
        panel.removeEventListener("click", onBackdrop);
        panel.removeEventListener("keydown", onKey);
        resolve(ok);
      }
      function onCancel() { finish(false); }
      function onGo() { finish(true); }
      function onBackdrop(e) { if (e.target === panel) finish(false); }
      function onKey(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }
      cancel.addEventListener("click", onCancel);
      go.addEventListener("click", onGo);
      panel.addEventListener("click", onBackdrop);
      panel.addEventListener("keydown", onKey);
      panel.hidden = false;
      panel.style.display = "flex";
      cancel.focus();
    });
  }

  function savedEventById(id) {
    return (eventStudioList || []).find(function (row) { return String(row.id) === String(id); }) || null;
  }

  function formFeatureSnapshot() {
    var idEl = document.getElementById("hubEventId");
    var nameEl = document.getElementById("hubEventName");
    var startEl = document.getElementById("hubEventStart");
    var id = idEl ? idEl.value.trim() : "";
    var saved = id ? savedEventById(id) : null;
    var startVal = startEl ? startEl.value.trim() : "";
    var startIso = "";
    if (startVal) {
      var d = new Date(startVal);
      startIso = isNaN(d.getTime()) ? startVal : d.toISOString();
    }
    var statusEl = document.getElementById("hubEventStatus");
    var statusChoice = statusEl ? statusEl.value : "draft";
    var status = statusChoice === "cancelled" ? "cancelled" : "draft";
    if (status !== "cancelled" && saved && String(saved.status || "").toLowerCase() === "published") status = "published";
    return {
      id: id,
      name: (nameEl && nameEl.value.trim()) || (saved && saved.name) || "",
      start_time: startIso || (saved && saved.start_time) || "",
      end_time: (saved && saved.end_time) || "",
      members_only: !!(document.getElementById("hubEventMembersOnly") && document.getElementById("hubEventMembersOnly").checked),
      is_public: !!(document.getElementById("hubEventPublic") && document.getElementById("hubEventPublic").checked),
      status: status,
      is_featured: featureToggleOn()
    };
  }

  function applyFeatureLocally(id, on) {
    var sid = String(id || "");
    eventStudioList = (eventStudioList || []).map(function (row) {
      if (!row) return row;
      var mine = String(row.id) === sid;
      if (on) {
        var next = Object.assign({}, row, { is_featured: mine });
        if (mine) {
          next.is_public = true;
          next.members_only = false;
          next.status = "published";
        }
        return next;
      }
      if (mine) return Object.assign({}, row, { is_featured: false });
      return row;
    });
    renderEventList(eventStudioList);
    var linked = document.getElementById("hubEventLinkedMeeting");
    fillLinkedMeetingSelect(linked ? linked.value : "");
    var idEl = document.getElementById("hubEventId");
    if (!idEl || !idEl.value) {
      if (!sid) setFeatureToggle(!!on);
      return;
    }
    if (String(idEl.value) === sid) {
      setFeatureToggle(!!on);
      if (on) {
        var pub = document.getElementById("hubEventPublic");
        var mo = document.getElementById("hubEventMembersOnly");
        if (pub) pub.checked = true;
        if (mo) mo.checked = false;
      }
      return;
    }
    var open = savedEventById(idEl.value);
    if (open) setFeatureToggle(!!open.is_featured);
  }

  function featureResultMessage(event, on) {
    if (!on) return "Removed from the public featured spot.";
    if (eventHasEnded(event)) return "Featured. This event has already ended, so it will not be highlighted on the public site.";
    return "Featured on the public site.";
  }

  async function commitFeature(event, on) {
    var client = studioClient;
    var msg = document.getElementById("hubEventMsg");
    var listMsg = document.getElementById("hubEventListMsg");
    if (!client || !event || !event.id) return;
    if (!event.name || !event.start_time) {
      var missing = "Save a name and start time before featuring this event.";
      if (msg) msg.textContent = missing;
      if (listMsg) listMsg.textContent = missing;
      return;
    }
    var payload = {
      id: event.id,
      name: event.name,
      start_time: event.start_time,
      is_featured: !!on
    };
    if (on) {
      payload.is_public = true;
      payload.members_only = false;
      payload.status = "published";
    }
    var res = await client.rpc("officer_upsert_event", { p: payload });
    if (res.error) throw res.error;
    if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not update this event.");
    applyFeatureLocally(event.id, on);
    var note = featureResultMessage(event, on);
    if (msg) msg.textContent = note;
    if (listMsg) listMsg.textContent = note;
    refreshEventStudio(client, { quiet: true });
  }

  async function onFeatureClick(eventRow, fromForm) {
    var snapshot = fromForm ? formFeatureSnapshot() : (eventRow || {});
    var turningOn = fromForm ? !featureToggleOn() : !snapshot.is_featured;
    if (!turningOn) {
      if (!snapshot.id) {
        setFeatureToggle(false);
        return;
      }
      try { await commitFeature(snapshot, false); }
      catch (e) {
        var offText = (e && e.message) || String(e);
        var offMsg = document.getElementById("hubEventMsg");
        if (offMsg) offMsg.textContent = "Couldn't update feature: " + offText;
      }
      return;
    }
    if (featureNeedsPrompt(snapshot)) {
      var ok = await askFeatureConfirm(featurePromptCopy(snapshot.name, snapshot));
      if (!ok) return;
    }
    if (!snapshot.id) {
      setFeatureToggle(true);
      var pub = document.getElementById("hubEventPublic");
      var mo = document.getElementById("hubEventMembersOnly");
      if (pub) pub.checked = true;
      if (mo) mo.checked = false;
      var msg = document.getElementById("hubEventMsg");
      if (msg) msg.textContent = "This event will be public and published when you save.";
      return;
    }
    try { await commitFeature(snapshot, true); }
    catch (e2) {
      var onText = (e2 && e2.message) || String(e2);
      if (/is_featured|column/i.test(onText)) {
        onText += " Apply sql/kos_event_featured.sql in Supabase, then try again.";
      }
      var onMsg = document.getElementById("hubEventMsg");
      var listMsg = document.getElementById("hubEventListMsg");
      if (onMsg) onMsg.textContent = "Couldn't feature: " + onText;
      if (listMsg) listMsg.textContent = "Couldn't feature: " + onText;
    }
  }

  function wireFeatureToggle() {
    var btn = document.getElementById("hubEventFeatureToggle");
    if (!btn || btn.dataset.kosWired === "1") return;
    btn.dataset.kosWired = "1";
    btn.addEventListener("click", function () { onFeatureClick(null, true); });
  }

  function clearEventForm() {
    var form = document.getElementById("hubEventForm");
    if (!form) return;
    form.reset();
    document.getElementById("hubEventId").value = "";
    document.getElementById("hubEventPublic").checked = true;
    var moOnly = document.getElementById("hubEventMembersOnly"); if (moOnly) moOnly.checked = false;
    var ma = document.getElementById("hubEventMemberAddress"); if (ma) ma.value = "";
    document.getElementById("hubEventMandatory").checked = false;
    setFeatureToggle(false);
    var cg = document.getElementById("hubEventCollectGuests"); if (cg) cg.checked = true;
    var cn = document.getElementById("hubEventCollectGuestNames"); if (cn) cn.checked = true;
    var cr = document.getElementById("hubEventCollectRaffle"); if (cr) cr.checked = false;
    var ro = document.getElementById("hubEventRaffleOptions"); if (ro) ro.value = "0,1,5,15";
    var rp = document.getElementById("hubEventRafflePrice"); if (rp) rp.value = "";
    fillRaffleEventSelect("");
    var cm = document.getElementById("hubEventCollectMeals"); if (cm) cm.checked = false;
    var mo = document.getElementById("hubEventMealOptions"); if (mo) mo.value = "";
    var onl = document.getElementById("hubEventOnline"); if (onl) onl.checked = false;
    var mu = document.getElementById("hubEventMeetingUrl"); if (mu) mu.value = "";
    var rcClear = document.getElementById("hubEventRegCloses"); if (rcClear) rcClear.value = "";
    document.getElementById("hubEventStatus").value = "draft";
    var payClear = document.getElementById("hubEventPaymentUrl"); if (payClear) payClear.value = "";
    document.getElementById("hubEventType").value = "social";
    var lm = document.getElementById("hubEventLinkedMeeting"); if (lm) lm.value = "";
    var cmMeet = document.getElementById("hubEventCreateMeeting"); if (cmMeet) cmMeet.checked = false;
    var rn = document.getElementById("hubEventRoleNotes"); if (rn) rn.value = "";
    document.getElementById("hubEventFormTitle").textContent = "New event";
    document.getElementById("hubEventMsg").textContent = "";
    hidePublishButton();
    showEventDeleteButton(false);
    hideDeletePanel();
    var note = document.getElementById("hubEventFlyerNote");
    if (note) note.textContent = FLYER_NOTE_DEFAULT;
    syncFlyerPreview();
    syncOptionalEventFields();
  }

  function fillEventForm(event) {
    hidePublishButton();
    function get(id) { return document.getElementById(id); }
    get("hubEventId").value = event.id || "";
    get("hubEventName").value = event.name || "";
    get("hubEventType").value = event.event_type || "other";
    get("hubEventStart").value = eventLocalInput(event.start_time);
    get("hubEventEnd").value = eventLocalInput(event.end_time);
    var rc = get("hubEventRegCloses"); if (rc) rc.value = eventLocalInput(event.registration_closes_at);
    get("hubEventLocation").value = event.location || "";
    var maFill = get("hubEventMemberAddress"); if (maFill) maFill.value = event.member_address || "";
    get("hubEventCapacity").value = event.capacity == null ? "" : event.capacity;
    get("hubEventDescription").value = event.description || "";
    get("hubEventPublic").checked = event.is_public !== false;
    var monly = get("hubEventMembersOnly"); if (monly) monly.checked = !!event.members_only;
    get("hubEventMandatory").checked = !!event.is_mandatory;
    setFeatureToggle(!!event.is_featured);
    get("hubEventStatus").value = String(event.status || "").toLowerCase() === "cancelled" ? "cancelled" : "draft";
    get("hubEventTicketLabel").value = event.ticket_label || "";
    get("hubEventTicketPrice").value = event.ticket_price_cents == null ? "" : (Number(event.ticket_price_cents) / 100).toFixed(2);
    get("hubEventPaymentUrl").value = event.ticket_payment_url || "";
    var cg = get("hubEventCollectGuests"); if (cg) cg.checked = event.collect_guests !== false;
    var cn = get("hubEventCollectGuestNames"); if (cn) cn.checked = event.collect_guest_names !== false;
    var cr = get("hubEventCollectRaffle"); if (cr) cr.checked = !!event.collect_raffle || !!event.raffle_event_id;
    var ro = get("hubEventRaffleOptions"); if (ro) ro.value = event.raffle_options || "0,1,5,15";
    fillRaffleEventSelect(event.raffle_event_id || "");
    var rp = get("hubEventRafflePrice");
    if (rp) {
      rp.value = event.raffle_ticket_price == null || event.raffle_ticket_price === ""
        ? ""
        : Number(event.raffle_ticket_price).toFixed(2);
    }
    var cm = get("hubEventCollectMeals"); if (cm) cm.checked = !!event.collect_meals;
    var mo = get("hubEventMealOptions"); if (mo) mo.value = event.meal_options || "";
    var typeVal = event.event_type || "other";
    get("hubEventType").value = typeVal;
    if (get("hubEventType").value !== typeVal && typeVal) {
      get("hubEventType").value = "other";
    }
    var onl = get("hubEventOnline"); if (onl) onl.checked = !!event.is_online || typeVal === "online";
    var mu = get("hubEventMeetingUrl"); if (mu) mu.value = event.meeting_url || "";
    fillLinkedMeetingSelect(event.linked_meeting_id || "");
    var rnFill = get("hubEventRoleNotes"); if (rnFill) rnFill.value = event.notes || "";
    get("hubEventFlyerUrl").value = event.flyer_url || "";
    syncFlyerPreview();
    syncOptionalEventFields();
    get("hubEventFormTitle").textContent = "Edit event";
    get("hubEventMsg").textContent = "";
    showEventDeleteButton(!!event.id);
    hideDeletePanel();
    var wrap = document.getElementById("hubEventFormWrap");
    if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function renderEventList(list) {
    var target = document.getElementById("hubEventList");
    if (!target) return;
    if (!list.length) {
      target.innerHTML = '<p class="empty">No Krewe events yet. Create the first one below.</p>';
      return;
    }
    var html = "";
    list.forEach(function (event) {
      var details = [];
      if (event.start_time) details.push(eventLocalDisplay(event.start_time) + (event.end_time ? " - " + eventLocalDisplay(event.end_time) : ""));
      if (event.location) details.push(event.location);
      if (event.member_address) details.push("Member address set");
      if (event.members_only) details.push("Members only");
      if (event.registration_closes_at) details.push("Regs close " + eventLocalDisplay(event.registration_closes_at));
      var ticket = event.ticket_price_cents != null ? " · $" + (Number(event.ticket_price_cents) / 100).toFixed(2) : "";
      var readOnly = String(event.source || "").toLowerCase() === "ikc";
      var flyer = event.flyer_url || "";
      var thumb = flyer
        ? (/\.pdf(?:$|[?#])/i.test(flyer)
            ? '<div class="hub-event-thumb ph">PDF</div>'
            : '<img class="hub-event-thumb" src="' + esc(flyer) + '" alt="" />')
        : '<div class="hub-event-thumb ph">No image</div>';
      html += '<div class="hub-event-row">' + thumb + '<div style="flex:1;min-width:0;"><b>' + esc(event.name) + '</b>' +
        '<div class="muted">' + esc(details.join(" · ") || "Date to be announced") + '</div>' +
        '<div class="muted">' + esc(event.status || "published") + (event.event_type ? " · " + esc(event.event_type) : "") + esc(ticket) +
        (event.is_featured ? " · Featured" : "") +
        (event.collect_raffle || event.raffle_event_id ? " · raffle" : "") +
        (event.collect_meals ? " · meals" : "") +
        (event.members_only ? " · members only" : "") +
        (event.is_online || event.event_type === "online" ? " · online" : "") +
        (flyer ? " · has image/PDF" : " · add image/PDF") +
        (readOnly ? " · IKC event (read-only)" : "") + '</div></div>' +
        (readOnly ? "" : '<div class="hub-appr-btns"><button class="btn btn-primary" type="button" data-event-edit="' + esc(event.id) + '">Edit event</button>' +
        '<button class="hub-feature-toggle" type="button" data-event-feature="' + esc(event.id) + '" aria-pressed="' + (event.is_featured ? "true" : "false") + '"><span class="star" aria-hidden="true">' + (event.is_featured ? "\u2605" : "\u2606") + '</span> Feature on public site</button>' +
        '<button class="btn btn-danger" type="button" data-event-delete="' + esc(event.id) + '">Delete</button></div>') + '</div>';
    });
    target.innerHTML = html;
    target.querySelectorAll("[data-event-edit]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-event-edit");
        var event = list.find(function (row) { return String(row.id) === String(id); });
        if (event && String(event.source || "").toLowerCase() !== "ikc") fillEventForm(event);
      });
    });
    target.querySelectorAll("[data-event-delete]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-event-delete");
        var event = list.find(function (row) { return String(row.id) === String(id); });
        if (event && String(event.source || "").toLowerCase() !== "ikc") showDeletePanel(event, button);
      });
    });
    target.querySelectorAll("[data-event-feature]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-event-feature");
        var event = list.find(function (row) { return String(row.id) === String(id); });
        if (event && String(event.source || "").toLowerCase() !== "ikc") onFeatureClick(event, false);
      });
    });
  }

  async function refreshEventStudio(client, opts) {
    var quiet = !!(opts && opts.quiet);
    var target = document.getElementById("hubEventList");
    if (!target) return;
    if (!quiet) target.innerHTML = '<p class="empty">Loading events…</p>';
    try {
      var res = await client.rpc("officer_list_events");
      if (res.error) throw res.error;
      var data = res.data || {};
      var list = Array.isArray(data) ? data : (data.events || []);
      if (data.ok === false) throw new Error(data.message || "Not authorized.");
      eventStudioList = list;
      var linked = document.getElementById("hubEventLinkedMeeting");
      fillLinkedMeetingSelect(linked ? linked.value : "");
      renderEventList(list);
    } catch (e) {
      if (quiet) return;
      target.innerHTML = '<p class="empty">Couldn&rsquo;t load events. ' + esc((e && e.message) || "Try again in a moment.") + '</p>';
    }
  }

  var reviewedPublish = null;

  function hidePublishButton() {
    reviewedPublish = null;
    var btn = document.getElementById("hubEventPublish");
    if (!btn) return;
    btn.hidden = true;
    btn.style.display = "none";
    btn.disabled = false;
    btn.textContent = "Publish";
  }

  function showPublishButton() {
    var btn = document.getElementById("hubEventPublish");
    if (!btn) return;
    btn.hidden = false;
    btn.style.display = "";
    btn.disabled = false;
    btn.textContent = "Publish";
  }

  function onEventFormEdited() {
    if (!reviewedPublish) return;
    hidePublishButton();
    var msg = document.getElementById("hubEventMsg");
    if (msg) msg.textContent = "Details changed. Save and review again before publishing.";
  }

  function ticketPriceLabel(cents) {
    if (cents == null || cents === "") return "Not set";
    var n = Number(cents);
    if (isNaN(n)) return "Not set";
    return "$" + (n / 100).toFixed(2);
  }

  function confirmSavedReview(event, clearedNote) {
    var row = event || {};
    var when = eventLocalDisplay(row.start_time) || "Not set";
    var where = row.location && String(row.location).trim() ? String(row.location).trim() : "Not set";
    var memberAddr = row.member_address && String(row.member_address).trim() ? String(row.member_address).trim() : "Not set";
    var note = clearedNote ? "\n" + clearedNote + "\n" : "";
    return window.confirm(
      "Review the saved event. Confirm these details are correct.\n\n" +
      "Name: " + (row.name || "Not set") + "\n" +
      "Date and time: " + when + "\n" +
      "Public location teaser: " + where + "\n" +
      "Private member address: " + memberAddr + "\n" +
      (row.members_only ? "Members only: yes\n" : "") +
      "Ticket price: " + ticketPriceLabel(row.ticket_price_cents) + "\n" +
      note + "\n" +
      "OK means the saved details are correct. It does not publish and does not notify anyone. A Publish button appears after OK.\n" +
      "Cancel keeps this save. It does not publish and does not notify anyone."
    );
  }

  function finishSavedReview(msg, res, payload, cleared, extra) {
    var saved = (res && res.data && res.data.event && res.data.event.id) ? res.data.event : null;
    var sent = String((payload && payload.status) || "draft").toLowerCase();
    if (saved && String(saved.status || "").toLowerCase() === "published" && sent !== "published") {
      hidePublishButton();
      if (msg) msg.textContent = "Saved, but the server marked this event published. It was not left as a draft." + (cleared || "");
      return;
    }
    if (saved && saved.id) {
      var idEl = document.getElementById("hubEventId");
      if (idEl) idEl.value = saved.id;
      var title = document.getElementById("hubEventFormTitle");
      if (title) title.textContent = "Edit event";
    }
    if (res && res.data && res.data.ticket_url_cleared) {
      var pay = document.getElementById("hubEventPaymentUrl");
      if (pay) pay.value = (saved && saved.ticket_payment_url) ? String(saved.ticket_payment_url) : "";
    }
    var keptStatus = String((saved && saved.status) || sent || "draft").toLowerCase();
    var statusEl = document.getElementById("hubEventStatus");
    if (statusEl) statusEl.value = keptStatus === "cancelled" ? "cancelled" : "draft";
    hidePublishButton();
    var kept = keptStatus === "cancelled" ? "cancelled" : "a draft";
    var reviewSource = saved || {
      name: payload.name,
      start_time: payload.start_time,
      location: payload.location,
      member_address: payload.member_address,
      members_only: payload.members_only,
      ticket_price_cents: payload.ticket_price_cents
    };
    var clearedNote = cleared ? String(cleared).trim() : "";
    if (!confirmSavedReview(reviewSource, clearedNote)) {
      if (msg) msg.textContent = "Saved as " + kept + ". Not published. Nobody was notified." + (cleared || "");
      return;
    }
    if (!saved || !saved.id || !saved.name || !saved.start_time) {
      if (msg) msg.textContent = "Saved as " + kept + ". The review was confirmed, but Publish is not available until the saved event can be found." + (cleared || "");
      return;
    }
    reviewedPublish = {
      id: saved.id,
      name: saved.name,
      start_time: saved.start_time
    };
    showPublishButton();
    var tail = extra ? " " + extra : "";
    if (msg) msg.textContent = "Saved as " + kept + ". Details confirmed. Use Publish to make this event public." + tail + (cleared || "");
  }

  async function publishReviewedEvent(client) {
    var msg = document.getElementById("hubEventMsg");
    var btn = document.getElementById("hubEventPublish");
    var save = document.getElementById("hubEventSave");
    var snap = reviewedPublish;
    if (!snap || !snap.id || !snap.name || !snap.start_time) {
      hidePublishButton();
      if (msg) msg.textContent = "Save the event and confirm the review before publishing.";
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Publishing…"; }
    if (save) save.disabled = true;
    try {
      var res = await client.rpc("officer_upsert_event", {
        p: {
          id: snap.id,
          name: snap.name,
          start_time: snap.start_time,
          status: "published"
        }
      });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not publish event.");
      var cleared = res.data && res.data.ticket_url_cleared
        ? " The ticket payment link was cleared because another event already uses it. Paste this event's own Zeffy link."
        : "";
      clearEventForm();
      if (msg) msg.textContent = "Published." + cleared;
      await refreshEventStudio(client);
    } catch (e) {
      if (msg) msg.textContent = "Couldn't publish: " + ((e && e.message) || e);
      if (btn && reviewedPublish) { btn.disabled = false; btn.textContent = "Publish"; }
    }
    if (save) save.disabled = false;
  }


  async function saveEventStudio(client) {
    var msg = document.getElementById("hubEventMsg");
    var save = document.getElementById("hubEventSave");
    function value(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
    var startValue = value("hubEventStart");
    var start = startValue ? new Date(startValue) : null;
    if (!start || isNaN(start.getTime())) { if (msg) msg.textContent = "A valid start time is required."; return; }
    var endValue = value("hubEventEnd");
    var end = endValue ? new Date(endValue) : null;
    if (endValue && (!end || isNaN(end.getTime()))) { if (msg) msg.textContent = "Please check the end time."; return; }
    var regCloseValue = value("hubEventRegCloses");
    var regClose = regCloseValue ? new Date(regCloseValue) : null;
    if (regCloseValue && (!regClose || isNaN(regClose.getTime()))) { if (msg) msg.textContent = "Please check the registration close date/time."; return; }
    var capacityValue = value("hubEventCapacity");
    var ticketValue = value("hubEventTicketPrice");
    var capacity = capacityValue === "" ? null : parseInt(capacityValue, 10);
    var dollars = ticketValue === "" ? null : Number(ticketValue);
    if (capacityValue !== "" && (isNaN(capacity) || capacity < 0)) { if (msg) msg.textContent = "Capacity must be a whole number."; return; }
    if (ticketValue !== "" && (isNaN(dollars) || dollars < 0)) { if (msg) msg.textContent = "Ticket price must be zero or more."; return; }
    var rafflePriceValue = value("hubEventRafflePrice");
    var raffleDollars = rafflePriceValue === "" ? null : Number(rafflePriceValue);
    if (rafflePriceValue !== "" && (isNaN(raffleDollars) || raffleDollars < 0)) {
      if (msg) msg.textContent = "Raffle ticket price must be zero or more. Enter the amount or leave it blank.";
      return;
    }
    var collectRaffle = !!(document.getElementById("hubEventCollectRaffle") && document.getElementById("hubEventCollectRaffle").checked);
    var collectMeals = !!(document.getElementById("hubEventCollectMeals") && document.getElementById("hubEventCollectMeals").checked);
    var mealOptions = value("hubEventMealOptions");
    if (collectMeals && !mealOptions) {
      if (msg) msg.textContent = "List at least one meal option, or turn meal choice off.";
      return;
    }
    var isOnline = !!(document.getElementById("hubEventOnline") && document.getElementById("hubEventOnline").checked)
      || value("hubEventType") === "online";
    var meetingUrl = value("hubEventMeetingUrl");
    if (isOnline && meetingUrl && !/^https?:\/\//i.test(meetingUrl)) {
      if (msg) msg.textContent = "Meeting join link must start with http:// or https://.";
      return;
    }
    var payload = {
      id: value("hubEventId") || null, name: value("hubEventName"), start_time: start.toISOString(),
      end_time: end ? end.toISOString() : null, location: value("hubEventLocation") || null,
      member_address: value("hubEventMemberAddress") || null,
      description: value("hubEventDescription") || null, event_type: value("hubEventType") || "other",
      capacity: capacity,
      is_mandatory: !!document.getElementById("hubEventMandatory").checked,
      is_public: featureToggleOn() ? true : !!document.getElementById("hubEventPublic").checked,
      members_only: featureToggleOn() ? false : !!(document.getElementById("hubEventMembersOnly") && document.getElementById("hubEventMembersOnly").checked),
      is_featured: featureToggleOn(),
      status: featureToggleOn() ? "published" : (value("hubEventStatus") === "cancelled" ? "cancelled" : "draft"),
      ticket_label: value("hubEventTicketLabel") || null,
      ticket_price_cents: ticketValue === "" ? null : Math.round(dollars * 100),
      ticket_payment_url: value("hubEventPaymentUrl") || null, flyer_url: value("hubEventFlyerUrl") || null,
      collect_guests: !!(document.getElementById("hubEventCollectGuests") && document.getElementById("hubEventCollectGuests").checked),
      collect_guest_names: !!(document.getElementById("hubEventCollectGuestNames") && document.getElementById("hubEventCollectGuestNames").checked),
      collect_raffle: collectRaffle,
      raffle_options: value("hubEventRaffleOptions") || "0,1,5,15",
      raffle_event_id: collectRaffle ? (value("hubEventRaffleEvent") || null) : null,
      raffle_ticket_price: collectRaffle && rafflePriceValue !== "" ? raffleDollars : null,
      collect_meals: collectMeals,
      meal_options: collectMeals ? mealOptions : null,
      is_online: isOnline,
      meeting_url: isOnline ? (meetingUrl || null) : null,
      notes: value("hubEventRoleNotes") || null,
      linked_meeting_id: value("hubEventType") === "parade" ? (value("hubEventLinkedMeeting") || null) : null,
      registration_closes_at: (function () {
        var rv = value("hubEventRegCloses");
        if (!rv) return null;
        var rd = new Date(rv);
        if (isNaN(rd.getTime())) return null;
        return rd.toISOString();
      })()
    };
    if (payload.event_type === "parade" && document.getElementById("hubEventCreateMeeting") && document.getElementById("hubEventCreateMeeting").checked) {
      var meetName = value("hubEventCreateMeetingName");
      var meetStartVal = value("hubEventCreateMeetingStart");
      var meetStart = meetStartVal ? new Date(meetStartVal) : null;
      if (!meetName) { if (msg) msg.textContent = "Give the new mandatory meeting a name, or uncheck create meeting."; return; }
      if (!meetStart || isNaN(meetStart.getTime())) { if (msg) msg.textContent = "Give the new mandatory meeting a start date and time."; return; }
      payload.create_meeting_name = meetName;
      payload.create_meeting_start = meetStart.toISOString();
      payload.create_meeting_mandatory = !!(document.getElementById("hubEventCreateMeetingMandatory") && document.getElementById("hubEventCreateMeetingMandatory").checked);
    }
    if (!payload.name) { if (msg) msg.textContent = "Event name is required."; return; }
    if (save) { save.disabled = true; save.textContent = "Saving…"; }
    if (msg) msg.textContent = "";
    try {
      var res = await client.rpc("officer_upsert_event", { p: payload });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not save event.");
      var cleared = res.data && res.data.ticket_url_cleared
        ? " The ticket payment link was cleared because another event already uses it. Paste this event's own Zeffy link."
        : "";
      await refreshEventStudio(client);
      await loadEventRaffles(client);
      if (save) { save.disabled = false; save.textContent = "☘ Save event"; }
      finishSavedReview(msg, res, payload, cleared, "");
    } catch (e) { if (msg) msg.textContent = "Couldn't save: " + ((e && e.message) || e); }
    if (save) { save.disabled = false; save.textContent = "☘ Save event"; }
  }
  async function loadEventStudio(client) {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return;
    var card = document.getElementById("hubEventStudio");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubEventStudio";
      var payments = document.getElementById("hubPayments");
      var approvals = document.getElementById("hubApprovals");
      var after = payments || approvals;
      if (after && after.nextSibling) panel.insertBefore(card, after.nextSibling);
      else if (after) panel.appendChild(card);
    if (typeof window.kosRefreshOfficerDesk === "function") window.kosRefreshOfficerDesk();

      else panel.appendChild(card);
    }
    card.innerHTML =
      '<div class="app-head"><span class="ic">📅</span><div><h2>Event Studio</h2><small>Create and edit krewe events. Save stores a draft. Publish only after you review.</small></div></div>' +
      '<div class="app-body"><p style="font-size:14px;color:var(--muted);margin:0 0 12px;line-height:1.45;">Tap <b>Edit event</b> to change location, dates, or Close registrations on. Then Save event. Saving stores a draft and does not publish.</p><div class="hub-event-list"><h3>Events</h3><div id="hubEventList"><p class="empty">Loading events…</p></div></div>' +
      eventStudioFormHtml() + '</div>';
    document.getElementById("hubEventForm").addEventListener("submit", function (e) {
      e.preventDefault(); saveEventStudio(client);
    });
    document.getElementById("hubEventNew").addEventListener("click", clearEventForm);
    wireEventDelete(client);
    wireFeatureToggle();
    var publishBtn = document.getElementById("hubEventPublish");
    if (publishBtn) publishBtn.addEventListener("click", function () { publishReviewedEvent(client); });
    var eventForm = document.getElementById("hubEventForm");
    if (eventForm) {
      eventForm.addEventListener("input", onEventFormEdited);
      eventForm.addEventListener("change", onEventFormEdited);
    }
    ["hubEventType", "hubEventCollectRaffle", "hubEventCollectMeals", "hubEventOnline", "hubEventMembersOnly", "hubEventCreateMeeting"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", syncOptionalEventFields);
    });
    var rafflePick = document.getElementById("hubEventRaffleEvent");
    if (rafflePick) rafflePick.addEventListener("change", onRaffleEventPicked);
    var flyerFile = document.getElementById("hubEventFlyerFile");
    flyerFile.addEventListener("change", async function () {
      var note = document.getElementById("hubEventFlyerNote");
      var file = flyerFile.files && flyerFile.files[0];
      if (!file) return;
      if (note) note.textContent = "Uploading…";
      flyerFile.disabled = true;
      try {
        var url = await uploadEventFlyer(client, file);
        document.getElementById("hubEventFlyerUrl").value = url;
        syncFlyerPreview();
        if (note) note.textContent = "Uploaded. Press ☘ Save event to attach it to this event.";
      } catch (e) {
        if (note) note.textContent = "Upload failed: " + ((e && e.message) || e);
      }
      flyerFile.disabled = false;
      flyerFile.value = "";
    });
    var flyerUrl = document.getElementById("hubEventFlyerUrl");
    if (flyerUrl) flyerUrl.addEventListener("input", syncFlyerPreview);
    var flyerClear = document.getElementById("hubEventFlyerClear");
    if (flyerClear) flyerClear.addEventListener("click", function () {
      if (flyerUrl) flyerUrl.value = "";
      syncFlyerPreview();
      var note = document.getElementById("hubEventFlyerNote");
      if (note) note.textContent = "Cleared. Save the event to remove it from the public page.";
    });
    clearEventForm();
    await loadEventRaffles(client);
    await refreshEventStudio(client);
  }


  async function bootEventStudio() {
    injectCss();
    // members-desk.js is the Event Studio that includes Door check-in / RSVP QR.
    // If this companion also mounts, it overwrites that card and drops those buttons.
    if (document.querySelector("script[src*='members-desk.js']") || window.__kosHubOwnsEventStudio) {
      return;
    }
    var client = window.__kosSb || null;
    for (var i = 0; i < 40 && !client; i++) {
      await new Promise(function (r) { setTimeout(r, 150); });
      client = window.__kosSb || null;
    }
    if (!client) return;
    var can = false;
    try {
      var res = await client.rpc("can_manage_events");
      can = !!res.data;
    } catch (e) { can = false; }
    if (!can) return;
    showOfficerTab();
    await loadEventStudio(client);
  }

  var _unlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof _unlock === "function") _unlock();
    setTimeout(bootEventStudio, 80);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(bootEventStudio, 400); });
  else setTimeout(bootEventStudio, 400);
})();
