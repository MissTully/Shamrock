/* Show / Hide control for every password field.
   One helper enhances inputs already on the page and any added later.
   Each field gets its own button. The button never submits the form.
   Showing the password keeps the cursor where it was. Submit, reset,
   or hiding the screen puts the field back to a concealed password. */
(function () {
  if (window.__kosShowPassword) return;
  window.__kosShowPassword = true;

  var STYLE_ID = "kos-show-password-style";
  var BUTTONS = new WeakMap();

  var CSS = [
    ".kos-reveal{position:relative;display:block;max-width:100%;}",
    ".kos-reveal>input{margin-top:0 !important;text-align:left !important;",
    "padding-right:102px !important;min-height:48px;box-sizing:border-box;}",
    ".kos-reveal>input::-ms-reveal,.kos-reveal>input::-ms-clear{display:none;}",
    ".kos-reveal-btn{position:absolute;top:50%;right:5px;transform:translateY(-50%);",
    "z-index:2;box-sizing:border-box;width:88px;height:44px;min-width:44px;min-height:44px;",
    "margin:0 !important;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;",
    "gap:4px;border:1.5px solid #a9801c;border-radius:8px;background:#fffdf6;color:#14532d;",
    "font-family:var(--ui),Verdana,sans-serif;font-size:14px;font-weight:700;line-height:1;",
    "letter-spacing:0;white-space:nowrap;cursor:pointer;touch-action:manipulation;",
    "-webkit-tap-highlight-color:transparent;}",
    ".kos-reveal-btn:hover{background:#f6e7a8;}",
    ".kos-reveal-btn[aria-pressed='true']{background:linear-gradient(180deg,#f6e7a8,#e2c15a);color:#14532d;}",
    ".kos-reveal-ic{display:flex;width:18px;height:18px;flex:none;}",
    ".kos-reveal-ic svg{display:block;width:18px;height:18px;}",
    ".kos-reveal-btn .kos-eye-off{display:none;}",
    ".kos-reveal-btn[aria-pressed='true'] .kos-eye{display:none;}",
    ".kos-reveal-btn[aria-pressed='true'] .kos-eye-off{display:block;}",
    ".kos-reveal-word{display:inline-block;min-width:2.5em;text-align:left;}",
    "@media (max-width:959px){",
    ".kos-reveal>input{min-height:52px;}",
    ".kos-reveal-btn{width:92px;height:44px;min-width:44px;min-height:44px;}",
    ".kos-reveal>input{padding-right:106px !important;}",
    "}"
  ].join("");

  var EYE = '<svg class="kos-eye" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>' +
    '<circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    "</svg>";
  var EYE_OFF = '<svg class="kos-eye-off" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M10.6 6.1A10.7 10.7 0 0 1 12 5.5C18.4 5.5 22 12 22 12a18.5 18.5 0 0 1-3.2 4.2"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6.1 6.7C3.7 8.3 2 12 2 12s3.6 6.5 10 6.5c1.5 0 2.9-.3 4.1-.8"/>' +
    '<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M9.9 9.9a2.7 2.7 0 0 0 3.8 3.8"/>' +
    "</svg>";

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function paint(btn, shown) {
    if (!btn) return;
    btn.setAttribute("aria-pressed", shown ? "true" : "false");
    btn.setAttribute("aria-label", shown ? "Hide password" : "Show password");
    var word = btn.querySelector(".kos-reveal-word");
    if (word) word.textContent = shown ? "Hide" : "Show";
  }

  function readSelection(input) {
    try {
      return {
        start: input.selectionStart,
        end: input.selectionEnd,
        dir: input.selectionDirection || "none"
      };
    } catch (err) {
      return { start: null, end: null, dir: "none" };
    }
  }

  function writeSelection(input, sel) {
    if (!sel || sel.start == null || sel.end == null) return;
    try { input.setSelectionRange(sel.start, sel.end, sel.dir); } catch (err) {}
  }

  function restoreSelection(input, sel) {
    writeSelection(input, sel);
    /* Changing the input type clears the caret after the click finishes.
       Put it back once the browser is done. */
    setTimeout(function () { writeSelection(input, sel); }, 0);
  }

  function setShown(input, shown, focus, preset) {
    var sel = preset || readSelection(input);
    var value = input.value;
    input.type = shown ? "text" : "password";
    if (input.value !== value) input.value = value;
    paint(BUTTONS.get(input), shown);
    if (focus) {
      input.focus();
      restoreSelection(input, sel);
    }
  }

  function conceal(input) {
    if (!input || !BUTTONS.has(input)) return;
    if (input.type !== "text") {
      paint(BUTTONS.get(input), false);
      return;
    }
    setShown(input, false, false);
  }

  function viewIsHidden(el) {
    var node = el;
    while (node && node.nodeType === 1) {
      if (node.hidden) return true;
      var cs;
      try { cs = window.getComputedStyle(node); } catch (err) { cs = null; }
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return true;
      node = node.parentElement;
    }
    return false;
  }

  function concealFields(list) {
    for (var i = 0; i < list.length; i++) conceal(list[i]);
  }

  function concealIn(root) {
    if (!root || !root.querySelectorAll) return;
    concealFields(root.querySelectorAll(".kos-reveal > input"));
  }

  function concealHidden() {
    var inputs = document.querySelectorAll(".kos-reveal > input");
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].type === "text" && viewIsHidden(inputs[i])) conceal(inputs[i]);
    }
  }

  function buildButton(input) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kos-reveal-btn";
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-label", "Show password");
    if (input.id) btn.setAttribute("aria-controls", input.id);
    btn.innerHTML = '<span class="kos-reveal-ic" aria-hidden="true">' + EYE + EYE_OFF +
      '</span><span class="kos-reveal-word">Show</span>';
    /* Keep the caret in the field. A normal click would move focus to the button.
       On a phone, cancelling mousedown can swallow the click, so touchend
       toggles too. The flag stops that one tap from toggling twice. */
    var held = null;
    var touchToggled = false;
    function remember() { held = readSelection(input); }
    function toggle() {
      var sel = held || readSelection(input);
      held = null;
      setShown(input, input.type === "password", true, sel);
    }
    btn.addEventListener("touchstart", remember, { passive: true });
    btn.addEventListener("mousedown", function (ev) {
      remember();
      ev.preventDefault();
    });
    btn.addEventListener("touchend", function (ev) {
      var touch = ev.changedTouches && ev.changedTouches[0];
      if (touch) {
        var hit = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!hit || !btn.contains(hit)) return;
      }
      touchToggled = true;
      toggle();
      setTimeout(function () { touchToggled = false; }, 700);
    });
    btn.addEventListener("click", function () {
      if (touchToggled) {
        touchToggled = false;
        return;
      }
      toggle();
    });
    BUTTONS.set(input, btn);
    return btn;
  }

  function enhance(input) {
    if (!input || input.nodeType !== 1) return;
    if (input.dataset.kosRevealWired === "1") return;
    if (input.type !== "password") return;
    if (input.closest(".kos-reveal")) return;
    input.dataset.kosRevealWired = "1";
    if (!input.hasAttribute("autocapitalize")) input.setAttribute("autocapitalize", "off");
    if (!input.hasAttribute("autocorrect")) input.setAttribute("autocorrect", "off");
    if (!input.hasAttribute("spellcheck")) input.setAttribute("spellcheck", "false");

    var wrap = document.createElement("div");
    wrap.className = "kos-reveal";
    if (input.style.marginTop) {
      wrap.style.marginTop = input.style.marginTop;
      input.style.marginTop = "0px";
    }
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    wrap.appendChild(buildButton(input));
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    if (scope.nodeType === 1 && scope.matches && scope.matches("input[type='password']")) {
      enhance(scope);
    }
    var inputs = scope.querySelectorAll ? scope.querySelectorAll("input[type='password']") : [];
    for (var i = 0; i < inputs.length; i++) enhance(inputs[i]);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    var run = function () {
      queued = false;
      scan(document);
      concealHidden();
    };
    if (window.requestAnimationFrame) requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function onSubmitOrReset(ev) {
    var form = ev.target;
    if (!form || !form.querySelectorAll) return;
    concealIn(form);
  }

  function start() {
    injectStyle();
    scan(document);
    document.addEventListener("submit", onSubmitOrReset, true);
    document.addEventListener("reset", onSubmitOrReset, true);
    if (window.MutationObserver) {
      var observer = new MutationObserver(schedule);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "type"]
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
