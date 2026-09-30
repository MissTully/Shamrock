/* Member Hub: personal home + tabbed sections. Preserves existing feature cards. */
(function () {
  "use strict";

  var TAB_HOME = "hub";
  var CSS = [
    ".hub-wrap{margin:0 0 18px;}",
    /* Tartan accent strip: a narrow woven band in the crest's green, navy,
       and gold across the top of the hub - a nod to Tampa's Original Kilted
       Krewe. Layers: diagonal weave texture, vertical navy bands with gold
       pinstripes, a horizontal gold hairline, on a deep green ground. */
    ".hub-wrap::before{content:'';display:block;height:14px;border-radius:999px;margin:0 0 12px;border:1px solid rgba(169,128,28,.55);box-shadow:inset 0 1px 2px rgba(0,0,0,.3);background:" +
      "repeating-linear-gradient(45deg,rgba(255,255,255,.09) 0 2px,transparent 2px 4px)," +
      "repeating-linear-gradient(0deg,transparent 0 4px,rgba(212,175,55,.4) 4px 5px,transparent 5px 14px)," +
      "repeating-linear-gradient(90deg,transparent 0 26px,rgba(49,55,112,.85) 26px 40px,transparent 40px 52px,rgba(212,175,55,.9) 52px 55px,transparent 55px 68px,rgba(49,55,112,.85) 68px 74px,transparent 74px 96px)," +
      "linear-gradient(180deg,#1d6b3e,#14532d);}",
    ".hub-welcome{position:relative;overflow:hidden;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:18px;padding:20px 22px;box-shadow:var(--shadow-sm);}",
    ".hub-welcome::before{content:'☘';position:absolute;top:-8px;right:10px;font-size:64px;opacity:.12;pointer-events:none;transform:rotate(12deg);}",
    ".hub-welcome h2{font-family:var(--display);color:var(--green-800);margin:0 0 12px;font-size:26px;}",
    ".hub-welcome .hub-hello{margin:0 0 4px;font-size:16px;color:var(--muted);}",
    ".hub-welcome .hub-chips{margin:0 0 10px;}",
    ".hub-birthday{display:grid;grid-template-columns:minmax(148px,240px) minmax(0,1fr);gap:12px 16px;align-items:center;position:relative;overflow:hidden;background:linear-gradient(165deg,#fffdf4 0%,#f8f1d8 46%,#e7f3ea 100%);border:2px solid rgba(168,128,28,.55);border-radius:18px;padding:14px;box-shadow:var(--shadow-sm);}",
    ".hub-birthday-art{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:14px;border:1px solid rgba(168,128,28,.4);background:#e7f3ea;display:block;}",
    ".hub-birthday-copy{min-width:0;}",
    ".hub-birthday h3{font-family:var(--display);color:var(--green-800);margin:0 0 8px;font-size:24px;line-height:1.25;}",
    ".hub-birthday-rule{height:3px;background:linear-gradient(90deg,#a9801c,#d4af37,#ecd07e,#d4af37,#a9801c);border-radius:2px;margin:0 0 12px;}",
    ".hub-birthday p{margin:0 0 8px;font-size:16px;line-height:1.4;color:#3a3a2e;}",
    ".hub-birthday .hub-birthday-when{font-family:var(--display);color:var(--green-800);letter-spacing:.03em;margin:0 0 10px;}",
    ".hub-birthday-names{list-style:none;margin:4px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:8px;}",
    ".hub-birthday-names li{background:var(--green-800);color:#f6efdc;border:1px solid rgba(212,175,55,.75);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:16px;line-height:1.2;}",
    "@media (max-width:560px){.hub-birthday{grid-template-columns:1fr;padding:12px;}.hub-birthday-art{max-height:240px;}}",
    ".hub-craic{position:relative;overflow:hidden;background:repeating-linear-gradient(-45deg,rgba(201,162,39,.10) 0 10px,rgba(194,69,30,.09) 10px 20px,transparent 20px 34px),linear-gradient(165deg,#1d6b3e 0%,#14532d 55%,#0f3d22 100%);color:#f6efdc;border-radius:20px;padding:22px 22px 18px;box-shadow:0 6px 18px rgba(23,94,67,.25);border:2px solid #c9a227;}",
    ".hub-craic::before,.hub-craic::after{content:'☘';position:absolute;pointer-events:none;line-height:1;opacity:.16;z-index:0;}",
    ".hub-craic::before{top:-6px;left:8px;font-size:72px;transform:rotate(-18deg);}",
    ".hub-craic::after{bottom:-10px;right:6px;font-size:84px;transform:rotate(22deg);opacity:.14;}",
    ".hub-craic > *{position:relative;z-index:1;}",
    ".hub-craic h2{font-family:var(--display);margin:0 0 4px;font-size:28px;color:#fff;}",
    ".hub-craic .tag{opacity:.9;font-size:16px;margin:0 0 14px;}",
    ".hub-craic-grid{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;}",
    ".hub-craic .rank-big{font-size:52px;line-height:1;}",
    ".hub-craic .clovers{font-size:34px;font-family:var(--display);font-weight:700;}",
    ".hub-craic .meta{font-size:16px;opacity:.92;}",
    ".hub-craic .prog{height:12px;background:rgba(255,255,255,.2);border-radius:999px;overflow:hidden;margin-top:8px;box-shadow:inset 0 1px 2px rgba(0,0,0,.18);}",
    ".hub-craic .prog>i{display:block;height:100%;background:linear-gradient(90deg,#fff6c8 0%,#f0d78c 35%,#d4af37 70%,#f7e7a1 100%);box-shadow:0 0 10px rgba(240,215,140,.55);position:relative;}",
    ".hub-craic .prog>i::after{content:'';position:absolute;inset:0;background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,.45) 50%,transparent 60%);background-size:200% 100%;animation:hubSparkle 2.8s ease-in-out infinite;}",
    "@keyframes hubSparkle{0%,100%{background-position:100% 0}50%{background-position:0 0}}",
    ".hub-quest{margin-top:14px;}",
    ".hub-quest-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 10px;}",
    ".hub-quest-head b{font-family:var(--display);font-size:18px;}",
    ".hub-quest-head span{font-size:15px;opacity:.88;}",
    ".hub-quest-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;}",
    ".hub-quest-card{background:rgba(255,255,255,.12);border:1px solid rgba(240,215,140,.35);border-radius:14px;padding:12px 13px;display:flex;flex-direction:column;gap:6px;min-height:118px;}",
    ".hub-quest-card .date{display:inline-block;align-self:flex-start;background:rgba(240,215,140,.22);border:1px solid rgba(240,215,140,.45);color:#f6efdc;border-radius:999px;padding:3px 9px;font-size:14px;font-family:var(--display);letter-spacing:.02em;}",
    ".hub-quest-card .title{font-family:var(--display);font-size:17px;line-height:1.25;color:#fff;}",
    ".hub-quest-card .meta{font-size:14px;opacity:.88;line-height:1.35;}",
    ".hub-quest-card .hint{font-size:14px;color:#f0d78c;font-weight:700;}",
    ".hub-quest-card .btn{margin-top:auto;background:#f0d78c;color:#14532d;border:0;text-decoration:none;display:inline-block;padding:7px 12px;border-radius:999px;font-weight:700;font-size:15px;align-self:flex-start;}",
    ".hub-quest-empty{background:rgba(255,255,255,.12);border:1px solid rgba(240,215,140,.35);border-radius:14px;padding:12px 14px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;}",
    ".hub-quest-empty .btn{background:#f0d78c;color:#14532d;border:0;text-decoration:none;display:inline-block;padding:8px 14px;border-radius:999px;font-weight:700;}",
    ".hub-board{margin-top:14px;background:#fffdf4;border:1px solid rgba(168,128,28,.4);border-radius:18px;padding:20px 22px;box-shadow:var(--shadow-sm);}",
    ".hub-board h3{font-family:var(--display);color:var(--green-800);margin:0 0 8px;font-size:21px;}",
    ".hub-board-rule{height:3px;background:linear-gradient(90deg,#a9801c,#d4af37,#ecd07e,#d4af37,#a9801c);border-radius:2px;margin:0 0 4px;border-bottom:3px solid #fffdf4;box-shadow:0 5px 0 -2px rgba(169,128,28,.55);}",
    ".hub-board .hub-board-date{font-size:15px;color:var(--muted);font-family:var(--display);letter-spacing:.03em;margin:10px 0 2px;}",
    ".hub-board h4{font-family:var(--display);color:var(--green-800);margin:4px 0 10px;font-size:19px;}",
    ".hub-board p{margin:0 0 10px;line-height:1.6;}",
    ".hub-board p.hub-board-preview{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3;overflow:hidden;line-height:1.45;max-height:calc(1.45em * 3);margin:6px 0 0;}",
    ".hub-board-more{appearance:none;background:transparent;border:0;padding:8px 0 2px;min-height:44px;font-family:var(--display);font-weight:700;font-size:16px;color:var(--gold-deep);cursor:pointer;}",
    ".hub-board-item{border-top:1px solid rgba(168,128,28,.3);padding:12px 0 2px;}",
    ".hub-board-item h4{margin:0 0 2px;}",
    ".hub-board-old{border-top:1px solid rgba(168,128,28,.3);padding:10px 0 4px;}",
    ".hub-board-old summary{cursor:pointer;font-family:var(--display);color:var(--green-800);font-size:16px;}",
    ".hub-board-old .hub-board-date{display:inline;margin:0;}",
    ".hub-board-archive-wrap{margin-top:12px;border-top:1px solid rgba(168,128,28,.3);padding-top:12px;}",
    ".hub-board-archive-wrap h4{margin:0 0 6px;}",
    ".hub-board-archive-wrap .empty{color:var(--muted);font-size:14px;}",
    ".hub-soft-desk{margin-top:14px;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:16px;padding:14px 16px;color:var(--green-800);}",
    ".hub-soft-desk h3{font-family:var(--display);margin:0 0 8px;font-size:19px;}",
    ".hub-soft-desk .hub-chips{margin:0 0 8px;}",
    ".hub-chips{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 4px;}",
    ".hub-chip{display:inline-flex;align-items:center;gap:8px;background:#fbf7ec;border:1px solid rgba(168,128,28,.35);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:16px;color:var(--green-800);}",
    ".hub-chip.ok{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-chip.warn{background:#f0e2bd;color:#7a5b00;border-color:#d4b45a;}",
    ".hub-actions{margin-top:16px;}",
    ".hub-actions h3{font-family:var(--display);color:var(--green-800);margin:0 0 10px;font-size:19px;}",
    ".hub-action-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;}",
    ".hub-action{text-align:left;background:#fffdf4;border:1px dashed rgba(168,128,28,.55);border-radius:14px;padding:12px 14px;cursor:pointer;font:inherit;}",
    ".hub-action:hover{background:#f7efd8;}",
    ".hub-action b{display:block;color:var(--green-800);font-family:var(--display);margin-bottom:4px;}",
    ".hub-action b a{color:inherit;text-decoration:underline;}",
    ".hub-find a[href='#docs']{color:var(--green-800);text-decoration:underline;}",
    ".hub-action span{font-size:15px;color:var(--muted);line-height:1.35;}",
    ".hub-find{margin-top:14px;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:16px;padding:14px 16px;}",
    ".hub-find h3{font-family:var(--display);color:var(--green-800);margin:0 0 10px;font-size:19px;}",
    ".hub-find-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}",
    ".hub-find .hub-action{width:100%;display:flex;align-items:flex-start;gap:12px;}",
    ".hub-find h3{display:flex;align-items:center;gap:9px;}",
    ".hub-find h3 .qk-ic{width:32px;height:32px;}",
    ".hub-find h3 .qk-ic svg{width:20px;height:20px;}",
    ".hub-find-sub{margin:-4px 0 12px;font-size:15px;color:var(--muted);}",
    ".qk-ic{flex:none;width:42px;height:42px;border-radius:50%;background:#f4ecd6;border:1px solid rgba(168,128,28,.45);color:var(--green-800);display:inline-flex;align-items:center;justify-content:center;}",
    ".qk-ic svg{width:24px;height:24px;display:block;}",
    ".hub-find button.hub-action:hover .qk-ic{background:var(--green-800);border-color:var(--green-800);color:#f0d78c;}",
    ".qk-copy{flex:1;min-width:0;display:block;}",
    ".qk-copy > span{display:block;}",
    ".hub-officer-card{margin-top:16px;background:linear-gradient(145deg,#fff4c2 0%,#f0d078 38%,#d4a017 100%);color:#14532d;border-radius:20px;padding:22px 24px;display:flex;flex-direction:column;gap:14px;cursor:pointer;border:2px solid #a67c00;box-shadow:0 6px 18px rgba(166,124,0,.22);}",
    ".hub-officer-card:hover{filter:brightness(1.03);}",
    ".hub-officer-card .go{margin-left:auto;color:#7a5b00;font-family:var(--display);}",
    ".hub-officer-picker{background:#fff;border:1px solid rgba(168,128,28,.35);border-radius:16px;padding:14px 16px;margin:0 0 14px;}",
    ".hub-officer-picker label{display:block;font-family:var(--display);color:var(--green-800);font-size:17px;margin:0 0 8px;}",
    ".hub-officer-picker select{width:100%;box-sizing:border-box;font:inherit;font-size:17px;padding:12px 14px;border-radius:10px;border:1px solid rgba(168,128,28,.5);background:#fbf7ec;color:var(--green-800);}",
    ".hub-officer-picker .hint{margin:8px 0 0;font-size:15px;color:var(--muted);line-height:1.35;}",
    "#hubOfficer > .app-card.hub-officer-hidden,#hubOfficer > section.app-card.hub-officer-hidden{display:none !important;}",
    ".hub-tabs{position:sticky;top:0;z-index:40;display:flex;flex-wrap:wrap;gap:8px;padding:10px 0 14px;background:linear-gradient(180deg,#fbf7ec 70%,rgba(251,247,236,0));}",
    ".hub-tabs button{border:1px solid rgba(168,128,28,.4);background:#fff;color:var(--green-800);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:16px;cursor:pointer;}",
    ".hub-tabs button.on{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-panel{display:none !important;}",
    ".hub-panel.hub-on{display:block !important;}",
    ".hub-panel > .member-grid{display:grid;gap:26px;}",
    ".hub-docs{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;}",
    ".hub-docs a{display:inline-block;background:#f0e8d2;border:1px solid rgba(168,128,28,.3);color:var(--green-800);border-radius:999px;padding:6px 13px;font-size:16px;font-family:var(--display);text-decoration:none;}",
    ".hub-docs a:hover{background:#e8ddc0;}",
    "#docs,#hubMemberDirectory,#hubEventStudio{scroll-margin-top:88px;}",
    ".hub-profile{background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:16px;padding:16px 18px;margin-bottom:14px;}",
    ".hub-profile h3{margin:0 0 6px;font-family:var(--display);color:var(--green-800);}",
    ".hub-fb-members{margin-top:12px;padding:12px 14px;background:#fbf7ec;border:1px solid rgba(168,128,28,.35);border-radius:12px;}",
    ".hub-fb-members a{color:var(--green-800);font-weight:700;text-decoration:none;}",
    ".hub-fb-members a:hover{text-decoration:underline;}",
    ".hub-badge{display:inline-block;margin-left:6px;min-width:20px;padding:1px 6px;border-radius:999px;background:#b3261e;color:#fff;font-size:14px;text-align:center;}",
    ".hub-avatar{width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);flex:none;}",
    ".hub-avatar-blank{display:flex;align-items:center;justify-content:center;background:var(--green-800);color:#f6efdc;font-family:var(--display);font-size:24px;}",
    ".hub-prof-head{display:flex;gap:14px;align-items:center;margin:6px 0 10px;}",
    ".hub-prof-line{margin:6px 0;font-size:16px;}",
    ".hub-prof-form label{display:block;font-size:15px;color:var(--muted);margin:10px 0 3px;}",
    ".hub-prof-form input,.hub-prof-form textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;font:inherit;background:#fff;}",
    ".hub-prof-form textarea{min-height:70px;resize:vertical;}",
    ".hub-prof-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}",
    "@media (max-width:520px){.hub-prof-grid{grid-template-columns:1fr;}}",
    ".hub-appr{display:flex;gap:12px;justify-content:space-between;align-items:flex-start;border:1px solid rgba(168,128,28,.3);border-radius:12px;padding:10px 12px;margin:8px 0;background:#fffdf4;flex-wrap:wrap;}",
    ".hub-appr .muted{color:var(--muted);font-size:15px;}",
    ".hub-appr-btns{display:flex;gap:8px;flex-wrap:wrap;}",
    ".hub-appr-h{font-family:var(--display);color:var(--green-800);margin:14px 0 6px;font-size:18px;}",
    ".hub-claim{margin-top:0;}",
    ".hub-claim label{display:block;font-size:15px;color:var(--muted);margin:10px 0 3px;}",
    ".hub-claim select,.hub-claim input,.hub-claim textarea{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;font:inherit;background:#fff;}",
    ".hub-claim textarea{min-height:64px;resize:vertical;}",
    ".hub-claim-row{display:none;}",
    ".hub-claim-row.on{display:block;}",
    ".hub-claim-msg{margin:10px 0 0;font-size:16px;color:var(--green-800);}",
    ".hub-claim-list{margin:14px 0 0;padding:0;list-style:none;}",
    ".hub-claim-list li{border-top:1px solid rgba(168,128,28,.22);padding:8px 0;font-size:16px;}",
    ".hub-claim-list .st{font-size:14px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);}",
    ".hub-claim-list .st.pending{color:#7a5b00;}",
    ".hub-claim-list .st.approved{color:var(--green-800);}",
    ".hub-claim-list .st.denied{color:#b3261e;}",
    "#memberContent > .member-grid{display:none !important;}",
    ".hub-event-form h3,.hub-event-list h3{font-family:var(--display);color:var(--green-800);margin:0 0 10px;font-size:19px;}",
    ".hub-event-form label{display:block;font-size:15px;color:var(--muted);margin:10px 0 3px;}",
    ".hub-event-form input,.hub-event-form textarea,.hub-event-form select{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;font:inherit;background:#fff;}",
    ".hub-event-form textarea{min-height:76px;resize:vertical;}",
    ".hub-event-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}",
    ".hub-event-grid .wide{grid-column:1 / -1;}",
    ".hub-event-checks{display:flex;flex-wrap:wrap;gap:16px;margin:12px 0;}",
    ".hub-event-checks label{display:flex;align-items:center;gap:7px;margin:0;color:var(--green-800);cursor:pointer;}",
    ".hub-event-checks input{width:auto;}",
    "#hubEventStudio,.hub-event-list,.hub-event-form{width:100%;max-width:100%;box-sizing:border-box;}",
    ".hub-event-row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;border:1px solid rgba(168,128,28,.3);border-radius:12px;padding:11px 12px;margin:8px 0;background:#fffdf4;width:100%;box-sizing:border-box;}",
    ".hub-event-row b{font-family:var(--display);color:var(--green-800);}",
    ".hub-event-row .muted{color:var(--muted);font-size:15px;line-height:1.45;}",
    ".hub-event-copy{flex:1 1 220px;min-width:0;}",
    ".hub-event-row .hub-appr-btns{flex:1 1 auto;justify-content:flex-end;}",
    ".hub-event-row .qr-slot{flex:1 1 100%;width:100%;}",
    ".hub-parade-status{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px;}",
    ".hub-parade-status span{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:12px;font-family:var(--display);letter-spacing:.02em;border:1px solid rgba(168,128,28,.35);background:#fff;color:var(--green-800);}",
    ".hub-parade-status span.ok{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-parade-status span.warn{background:#f0e2bd;color:#7a5b00;border-color:#d4b45a;}",
    ".hub-parade-warn{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:#fff5f2;border:1px solid #e0b4a8;color:#8b2e1c;font-size:14px;line-height:1.4;}",
    ".hub-parade-msg{min-height:1.2em;margin:8px 0 0;font-size:14px;color:var(--green-800);}",
    ".hub-event-msg{min-height:1.2em;color:var(--green-800);font-size:16px;margin:8px 0 0;}",
    ".hub-event-form{margin-top:18px;padding-top:16px;border-top:1px dashed rgba(168,128,28,.4);}",
    ".hub-flyer-note{font-size:14px;color:var(--muted);margin:4px 0 0;}",
    ".hub-flyer-preview{margin-top:10px;display:none;align-items:center;gap:12px;flex-wrap:wrap;}",
    ".hub-flyer-preview.show{display:flex;}",
    ".hub-flyer-preview img{max-width:160px;max-height:120px;border-radius:10px;border:1px solid rgba(168,128,28,.35);object-fit:cover;background:#fff;}",
    ".hub-event-thumb{width:54px;height:54px;border-radius:10px;object-fit:cover;border:1px solid rgba(168,128,28,.35);background:#f3efe2;flex:none;}",
    ".hub-event-thumb.ph{display:grid;place-items:center;font-size:15px;color:var(--muted);text-align:center;padding:4px;}",
    ".hub-event-optional{grid-column:1/-1;margin-top:8px;padding:12px;border:1px solid rgba(168,128,28,.28);border-radius:12px;background:#fff;}",
    ".hub-event-optional h4{margin:0 0 6px;font-family:var(--display);color:var(--green-800);font-size:16px;}",
    ".hub-event-optional p.hub-opt-hint{font-size:15px;color:var(--muted);margin:0 0 8px;line-height:1.4;}",
    ".hub-event-optional-fields{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;}",
    ".btn.btn-danger,.hub-event-form .btn-danger{border-color:#b3452e;color:#8b2e1c;background:#fff5f2;}",
    ".hub-event-delete-panel{margin-top:16px;padding:14px;border:1px solid #b3452e;border-radius:12px;background:#fff5f2;}",
    ".hub-event-delete-panel h4{margin:0 0 8px;font-family:var(--display);color:#8b2e1c;font-size:17px;}",
    ".hub-event-delete-panel p{font-size:15px;color:#5c2b20;line-height:1.45;margin:0 0 8px;}",
    ".hub-event-delete-panel #hubEventDeleteErr{color:#8b2e1c;min-height:1.2em;}",
    "@media(max-width:620px){.hub-event-grid{grid-template-columns:1fr;}.hub-event-grid .wide{grid-column:auto;}.hub-event-row{flex-direction:column;}.hub-event-optional-fields{grid-template-columns:1fr;}}",
    "@keyframes kosHoursFlash{0%,100%{box-shadow:none}40%{box-shadow:0 0 0 4px rgba(29,107,62,.45)}}",
    "#vhForm.kos-hours-flash{animation:kosHoursFlash 1.6s ease;border-radius:12px;}",
    /* ---- Signed-in + Officer desk discoverability ---- */
    ".hub-member-bar{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px;padding:8px 2px 12px;}",
    ".hub-signed-pill{display:none;align-items:center;gap:8px;background:var(--green-800);color:#f6efdc;border:1px solid rgba(212,175,55,.55);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:15px;line-height:1.2;box-shadow:var(--shadow-sm);}",
    ".hub-signed-pill.is-on{display:inline-flex;}",
    ".hub-signed-pill .dot{width:8px;height:8px;border-radius:50%;background:#7dcea0;box-shadow:0 0 0 3px rgba(125,206,160,.35);flex:none;}",
    ".hub-signout-btn{cursor:pointer;border:1px solid rgba(168,128,28,.5);background:#fff;color:var(--green-800);border-radius:999px;padding:8px 14px;font-size:14px;font-weight:600;font-family:var(--display);}",
    ".hub-officer-chip{display:none;align-items:center;gap:8px;margin-right:auto;background:linear-gradient(180deg,#1d6b3e,var(--green-900));color:#fff;border:2px solid var(--gold);border-radius:999px;padding:9px 16px;font-family:var(--display);font-size:16px;font-weight:700;cursor:pointer;box-shadow:var(--shadow-sm);}",
    ".hub-officer-chip.show{display:inline-flex;}",
    ".hub-officer-chip:hover{filter:brightness(1.06);}",
    ".hub-officer-chip .ic{font-size:18px;line-height:1;}",
    ".hub-tabs button[data-hub-tab=\"officer\"]{border:2px solid var(--gold);background:linear-gradient(180deg,#1d6b3e,var(--green-900));color:#fff;font-weight:700;padding:10px 16px;box-shadow:0 2px 10px rgba(12,59,33,.18);}",
    ".hub-tabs button[data-hub-tab=\"officer\"].on{background:var(--gold);color:var(--green-900);border-color:var(--gold-deep);}",
    ".hub-officer-card{margin-top:18px;background:linear-gradient(145deg,#fff4c2 0%,#f0d078 38%,#d4a017 100%);color:#14532d;border-radius:20px;padding:22px 24px;display:flex;flex-direction:column;gap:14px;cursor:pointer;border:2px solid #a67c00;box-shadow:0 6px 18px rgba(166,124,0,.22);}",
    ".hub-officer-card-top{display:flex;gap:16px;align-items:center;width:100%;}",
    ".hub-officer-card .ic{font-size:42px;line-height:1;flex:none;}",
    ".hub-officer-card .copy{flex:1;min-width:0;}",
    ".hub-officer-card b{display:block;font-family:var(--display);font-size:28px;margin:0 0 6px;letter-spacing:.02em;color:#14532d;}",
    ".hub-officer-card .sub{opacity:.95;font-size:17px;line-height:1.4;color:#3d5a40;}",
    ".hub-officer-card .go{margin-left:auto;color:#7a5b00;font-family:var(--display);font-size:20px;font-weight:700;flex:none;}",
    ".hub-officer-tools{display:flex;flex-wrap:wrap;gap:8px;}",
    ".hub-officer-tool{display:inline-flex;align-items:center;background:rgba(255,255,255,.72);border:1px solid rgba(122,91,0,.35);border-radius:999px;padding:7px 12px;font-size:15px;line-height:1.3;color:#14532d;font-family:var(--display);}",
    ".hub-officer-card:hover{filter:brightness(1.03);}",
    "@keyframes hubOfficerPulse{0%,100%{box-shadow:0 6px 18px rgba(166,124,0,.22)}40%{box-shadow:0 0 0 8px rgba(212,175,55,.55),0 6px 18px rgba(166,124,0,.22)}70%{box-shadow:0 0 0 3px rgba(212,175,55,.28),0 6px 18px rgba(166,124,0,.22)}}",
    ".hub-officer-card.hub-officer-pulse{animation:hubOfficerPulse 1.8s ease 2;}",
    ".hub-apps-banner{margin-top:14px;width:100%;text-align:left;cursor:pointer;background:linear-gradient(145deg,#fffdf4 0%,#f3e3a4 55%,#e7f3ea 100%);color:#14532d;border-radius:18px;padding:16px 18px;display:flex;gap:14px;align-items:center;border:2px solid #a67c00;font:inherit;box-shadow:0 4px 14px rgba(166,124,0,.18);}",
    ".hub-apps-banner:hover{filter:brightness(1.03);}",
    ".hub-apps-banner .ic{font-size:36px;line-height:1;flex:none;}",
    ".hub-apps-banner .copy{flex:1;min-width:0;}",
    ".hub-apps-banner b{display:block;font-family:var(--display);font-size:24px;margin:0 0 4px;color:#14532d;}",
    ".hub-apps-banner .sub{display:block;font-size:16px;line-height:1.4;color:#3d5a40;}",
    ".hub-apps-banner .go{margin-left:auto;color:#7a5b00;font-family:var(--display);font-size:18px;font-weight:700;flex:none;}",
    ".hub-app-filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px;}",
    ".hub-app-filters button{border:1px solid rgba(168,128,28,.45);background:#fff;color:var(--green-800);border-radius:999px;padding:8px 12px;font-family:var(--display);font-size:15px;cursor:pointer;}",
    ".hub-app-filters button.on{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-app-note{width:100%;box-sizing:border-box;min-height:68px;margin-top:6px;font:inherit;padding:8px 10px;border:1px solid rgba(168,128,28,.4);border-radius:8px;background:#fff;}",
    ".hub-app-flash{background:#e7f3ea;border:1px solid rgba(29,107,62,.35);border-radius:12px;padding:12px 14px;margin:0 0 12px;color:#14532d;line-height:1.45;}",
    ".hub-app-status{display:inline-block;margin-left:8px;border-radius:999px;padding:2px 8px;font-size:13px;font-family:var(--display);background:#f0e2bd;color:#7a5b00;border:1px solid #d4b45a;vertical-align:middle;}",
    ".hub-app-status.ok{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-app-fee{margin:6px 0 0;font-size:15px;line-height:1.4;color:#3a3a2e;}",
    ".hub-app-id{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0;}",
    ".hub-app-id > span{min-width:0;}",
    ".hub-app-copy{min-height:36px;padding:6px 14px;}",
    "@media (max-width:520px){.hub-apps-banner{flex-wrap:wrap;padding:14px;}.hub-apps-banner .go{margin-left:0;}.hub-apps-banner b{font-size:22px;}}",
    /* ---- Officer desk layout ---- */
    ".hub-officer-hero{background:#fff;border:1px solid rgba(168,128,28,.3);border-radius:18px;padding:18px 20px;margin:0 0 16px;}",
    ".hub-officer-hero h2{font-family:var(--display);color:var(--green-800);margin:0 0 6px;font-size:26px;}",
    ".hub-officer-hero p{margin:0;color:var(--muted);font-size:17px;line-height:1.4;}",
    ".hub-officer-launcher{margin:0 0 18px;}",
    ".hub-officer-section{margin:0 0 16px;}",
    ".hub-officer-section h3{font-family:var(--display);color:var(--green-800);font-size:18px;margin:0 0 10px;letter-spacing:.02em;}",
    ".hub-officer-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}",
    ".hub-officer-tile{text-align:left;background:#fff;border:1px solid rgba(168,128,28,.35);border-radius:16px;padding:16px 16px 14px;cursor:pointer;font:inherit;min-height:108px;display:flex;flex-direction:column;gap:6px;box-shadow:var(--shadow-sm);transition:border-color .15s,background .15s,transform .15s;}",
    ".hub-officer-tile:hover{background:#fbf7ec;border-color:var(--gold-deep);transform:translateY(-1px);}",
    ".hub-officer-tile .tic{font-size:26px;line-height:1;}",
    ".hub-officer-tile b{font-family:var(--display);color:var(--green-800);font-size:18px;line-height:1.25;}",
    ".hub-officer-tile span{font-size:15px;color:var(--muted);line-height:1.35;}",
    ".hub-officer-tile.on{background:linear-gradient(180deg,#1d6b3e,var(--green-900));border-color:var(--gold);color:#fff;}",
    ".hub-officer-tile.on b,.hub-officer-tile.on span{color:#f6efdc;}",
    ".hub-officer-tile.on span{opacity:.9;}",
    ".hub-officer-activebar{display:none;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#fbf7ec;border:1px solid rgba(168,128,28,.35);border-radius:14px;padding:12px 14px;margin:0 0 14px;}",
    ".hub-officer-activebar.show{display:flex;}",
    ".hub-officer-activebar .lbl{font-family:var(--display);color:var(--green-800);font-size:17px;}",
    ".hub-officer-activebar button{border:1px solid rgba(168,128,28,.45);background:#fff;color:var(--green-800);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:15px;cursor:pointer;}",
    ".hub-officer-picker{background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:14px;padding:12px 14px;margin:0 0 14px;}",
    ".hub-officer-picker label{display:block;font-family:var(--display);color:var(--green-800);font-size:15px;margin:0 0 6px;}",
    ".hub-officer-picker select{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:11px 12px;border-radius:10px;border:1px solid rgba(168,128,28,.45);background:#fbf7ec;color:var(--green-800);}",
    ".hub-officer-picker .hint{margin:6px 0 0;font-size:14px;color:var(--muted);line-height:1.35;}",
    ".hub-officer-picker.compact{opacity:.95;}",
    "#hubOfficer > .app-card.hub-officer-hidden,#hubOfficer > section.app-card.hub-officer-hidden{display:none !important;}",
    "@media (max-width:520px){.hub-officer-card{padding:20px 18px;}.hub-officer-card-top{flex-wrap:wrap;}.hub-officer-card .go{margin-left:0;}.hub-officer-card b{font-size:26px;}.hub-officer-tiles{grid-template-columns:1fr;}}",

    /* ==== Hub-wide calm polish (mobile-first, Sep 2026) ==== */
    ".hub-wrap{margin:0 0 22px;}",
    ".hub-shell{display:flex;flex-direction:column;gap:0;}",
    ".hub-member-bar{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px;padding:4px 0 10px;}",
    ".hub-signed-pill{display:none;align-items:center;gap:8px;background:var(--green-800);color:#f6efdc;border:1px solid rgba(212,175,55,.55);border-radius:999px;padding:10px 16px;font-family:var(--display);font-size:15px;line-height:1.25;box-shadow:var(--shadow-sm);max-width:100%;}",
    ".hub-signed-pill.is-on{display:inline-flex;}",
    ".hub-signed-pill .hub-signed-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(62vw,280px);}",
    ".hub-signout-btn{cursor:pointer;border:1px solid rgba(168,128,28,.45);background:#fff;color:var(--green-800);border-radius:999px;padding:10px 16px;font-size:15px;font-weight:600;font-family:var(--display);min-height:44px;}",
    ".hub-officer-chip{display:none;align-items:center;gap:8px;margin-right:auto;background:var(--green-800);color:#fff;border:1px solid var(--gold);border-radius:999px;padding:10px 16px;font-family:var(--display);font-size:15px;font-weight:700;cursor:pointer;min-height:44px;}",
    ".hub-officer-chip.show{display:inline-flex;}",
    ".hub-tabs{position:sticky;top:0;z-index:50;display:flex;flex-wrap:nowrap;gap:8px;padding:8px 0 12px;margin:0 0 14px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;background:rgba(251,247,236,.97);backdrop-filter:blur(8px);border-bottom:1px solid rgba(168,128,28,.22);}",
    ".hub-tabs::-webkit-scrollbar{display:none;}",
    ".hub-tabs button{flex:none;border:1px solid rgba(168,128,28,.32);background:#fff;color:var(--green-800);border-radius:999px;padding:11px 16px;font-family:var(--display);font-size:15px;cursor:pointer;min-height:44px;line-height:1.2;white-space:nowrap;}",
    ".hub-tabs button.on{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".hub-tabs button[data-hub-tab=\"officer\"]{border-color:rgba(168,128,28,.55);background:#fff;color:var(--green-800);font-weight:700;box-shadow:none;}",
    ".hub-tabs button[data-hub-tab=\"officer\"].on{background:var(--gold);color:var(--green-900);border-color:var(--gold-deep);}",
    ".hub-panel{display:none !important;}",
    ".hub-panel.hub-on{display:block !important;}",
    ".hub-panel > .member-grid{display:grid;gap:18px;}",
    /* Home */
    ".hub-home-stack{display:flex;flex-direction:column;gap:14px;}",
    ".hub-craic{border-radius:18px;padding:20px 18px 16px;}",
    ".hub-craic h2{font-size:24px;}",
    ".hub-craic-grid{gap:12px;}",
    ".hub-quest-grid{grid-template-columns:1fr;gap:10px;}",
    ".hub-quest-card{min-height:0;padding:14px;}",
    ".hub-quest-card .btn{min-height:44px;padding:10px 14px;display:inline-flex;align-items:center;}",
    ".hub-soft-desk{margin-top:0;border-radius:16px;padding:16px 16px 14px;border:1px solid rgba(168,128,28,.22);box-shadow:none;}",
    ".hub-soft-desk h3{font-size:20px;margin:0 0 10px;}",
    ".hub-status-list{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px;}",
    ".hub-status-list li{display:flex;align-items:flex-start;gap:10px;background:#fbf7ec;border-radius:12px;padding:12px 14px;font-size:16px;line-height:1.35;color:#3a3a2e;}",
    ".hub-status-list .mark{flex:none;width:1.25em;text-align:center;}",
    ".hub-soft-desk .btn{min-height:48px;padding:12px 18px;font-size:16px;}",
    ".hub-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;}",
    ".hub-chip{font-size:15px;padding:8px 12px;}",
    ".hub-officer-card{margin-top:0;background:linear-gradient(145deg,#fff4c2 0%,#f0d078 42%,#d4a017 100%);color:#14532d;border-radius:18px;padding:20px 18px;display:flex;flex-direction:column;gap:12px;cursor:pointer;border:2px solid #a67c00;box-shadow:0 6px 16px rgba(166,124,0,.18);}",
    ".hub-officer-card-top{display:flex;gap:14px;align-items:center;width:100%;}",
    ".hub-officer-card .ic{font-size:36px;line-height:1;flex:none;}",
    ".hub-officer-card b{display:block;font-family:var(--display);font-size:24px;margin:0 0 4px;letter-spacing:.02em;color:#14532d;}",
    ".hub-officer-card .sub{font-size:16px;line-height:1.4;color:#3d5a40;}",
    ".hub-officer-card .go{margin-left:auto;color:#7a5b00;font-family:var(--display);font-size:18px;font-weight:700;flex:none;}",
    ".hub-officer-inside{margin:0;padding:0 0 0 1.15em;list-style:disc;display:grid;gap:6px;font-size:16px;line-height:1.35;color:#14532d;}",
    ".hub-officer-inside li{padding:0;}",
    ".hub-install{background:#fff;border:1px solid rgba(168,128,28,.22);border-radius:16px;padding:16px 16px 14px;}",
    ".hub-install h3{font-family:var(--display);color:var(--green-800);margin:0 0 8px;font-size:20px;}",
    /* Computer Home: the mobile-app card. min-height reserves its space on
       first paint so the QR image cannot shove the cards below it. */
    ".hub .hub-desk-app{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 176px;gap:8px 18px;align-items:center;background:linear-gradient(165deg,#fffdf8 0%,#f4f8f1 52%,#e7f3ea 100%);border:1px solid #c9b57a;border-top:4px solid #14532d;border-radius:18px;padding:14px 16px 14px 18px;box-shadow:var(--shadow-sm);min-height:228px;}",
    ".hub-desk-app-head{display:flex;align-items:center;gap:12px;min-width:0;padding-right:40px;}",
    ".hub-desk-app-ic{flex:none;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:#14532d;color:#f0d78c;border:2px solid #c9a227;box-shadow:0 2px 8px rgba(20,83,45,.18);}",
    ".hub-desk-app-ic svg{width:30px;height:30px;display:block;}",
    ".hub-desk-app h3{font-family:var(--display);color:var(--green-800);margin:0;font-size:22px;line-height:1.2;}",
    ".hub-desk-app-rule{height:3px;background:linear-gradient(90deg,#a9801c,#d4af37,#ecd07e,#d4af37,#a9801c);border-radius:2px;margin:8px 0 8px;}",
    ".hub-desk-app p{margin:0 0 4px;font-size:16px;line-height:1.35;color:#3a3a2e;}",
    ".hub-desk-app-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;align-items:center;}",
    ".hub-desk-app-copyline{display:flex;flex-wrap:wrap;align-items:center;gap:10px;min-width:0;}",
    ".hub-desk-app-url{font-size:16px;line-height:1.3;color:var(--navy,#313770);text-underline-offset:3px;overflow-wrap:anywhere;}",
    ".hub-desk-app-actions .btn{min-height:44px;padding:10px 16px;background:#fff;color:#14532d;border:2px solid #14532d;box-shadow:none;}",
    ".hub-desk-app-actions .btn.btn-primary{background:linear-gradient(180deg,#f6e7a8,#e2c15a);color:#14532d;border-color:#a9801c;box-shadow:0 4px 12px rgba(168,128,28,.28);}",
    ".hub-desk-app-x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;border-radius:12px;background:transparent;color:#14532d;cursor:pointer;display:grid;place-items:center;padding:0;}",
    ".hub-desk-app-x svg{width:20px;height:20px;display:block;}",
    ".hub-desk-app-qr{margin:0;display:grid;justify-items:center;align-content:center;gap:6px;background:#fff;border:1px solid rgba(168,128,28,.5);border-radius:16px;padding:10px 10px 8px;min-height:176px;}",
    ".hub-desk-app-qr img{width:132px;height:132px;display:block;}",
    ".hub-desk-app-qr figcaption{margin:0;font-family:var(--display);font-size:13px;line-height:1.25;text-align:center;color:#14532d;}",
    ".hub-desk-app-row{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;margin:0 0 10px;padding:8px 14px;text-align:left;background:#fffdf4;border:1px solid rgba(168,128,28,.5);border-radius:14px;cursor:pointer;font:inherit;color:var(--green-800);font-family:var(--display);font-weight:700;font-size:17px;}",
    ".hub-desk-app-row .qk-ic svg{width:22px;height:22px;display:block;}",
    ".hub-install p{margin:0 0 10px;font-size:16px;line-height:1.4;color:#3a3a2e;}",
    ".hub-install-steps{margin:0 0 10px;padding:0 0 0 1.2em;display:grid;gap:8px;font-size:16px;line-height:1.4;color:#3a3a2e;}",
    ".hub-install-note{margin:0;font-size:15px;color:var(--muted);}",
    ".hub-find{margin-top:0;background:#fff;border:1px solid rgba(168,128,28,.22);border-radius:16px;padding:16px;}",
    ".hub-find h3{margin:0 0 10px;font-size:18px;}",
    ".hub-find-grid{display:grid;grid-template-columns:1fr;gap:10px;}",
    ".hub-action{width:100%;text-align:left;background:#fffdf4;border:1px solid rgba(168,128,28,.35);border-radius:14px;padding:14px 16px;cursor:pointer;font:inherit;min-height:56px;}",
    ".hub-action b{font-size:17px;margin-bottom:4px;}",
    ".hub-action span{font-size:15px;}",
    ".qk-ic{width:40px;height:40px;}",
    ".qk-ic svg{width:22px;height:22px;}",
    ".hub-find h3 .qk-ic{width:30px;height:30px;}",
    /* Officer desk calm */
    ".hub-officer-hero{background:#fbf7ec;border:0;border-radius:16px;padding:16px 16px 14px;margin:0 0 14px;}",
    ".hub-officer-hero h2{font-size:24px;margin:0 0 6px;}",
    ".hub-officer-hero p{margin:0;font-size:16px;line-height:1.45;color:var(--muted);}",
    ".hub-officer-launcher{margin:0 0 16px;}",
    ".hub-officer-section{margin:0 0 18px;}",
    ".hub-officer-section h3{font-family:var(--display);color:var(--green-800);font-size:15px;margin:0 0 8px;letter-spacing:.04em;text-transform:uppercase;opacity:.9;}",
    ".hub-officer-tiles{display:flex;flex-direction:column;gap:10px;}",
    ".hub-officer-tile{text-align:left;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:14px;padding:14px 16px;cursor:pointer;font:inherit;min-height:56px;display:grid;grid-template-columns:40px 1fr;grid-template-rows:auto auto;column-gap:12px;row-gap:2px;align-items:center;box-shadow:none;}",
    ".hub-officer-tile:hover{background:#fbf7ec;border-color:var(--gold-deep);transform:none;}",
    ".hub-officer-tile .tic{font-size:22px;line-height:1;grid-row:1 / span 2;align-self:center;}",
    ".hub-officer-tile b{font-family:var(--display);color:var(--green-800);font-size:17px;line-height:1.25;grid-column:2;}",
    ".hub-officer-tile span{font-size:15px;color:var(--muted);line-height:1.35;grid-column:2;}",
    ".hub-officer-tile.on{background:var(--green-800);border-color:var(--green-800);color:#fff;}",
    ".hub-officer-tile.on b,.hub-officer-tile.on span{color:#f6efdc;}",
    ".hub-officer-activebar{display:none;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid rgba(168,128,28,.28);border-radius:14px;padding:12px 14px;margin:0 0 14px;}",
    ".hub-officer-activebar.show{display:flex;position:sticky;top:58px;z-index:45;box-shadow:0 4px 14px rgba(0,0,0,.06);}",
    ".hub-officer-activebar .lbl{font-family:var(--display);color:var(--green-800);font-size:17px;}",
    ".hub-officer-activebar button{border:1px solid rgba(168,128,28,.4);background:#fbf7ec;color:var(--green-800);border-radius:999px;padding:12px 16px;font-family:var(--display);font-size:16px;cursor:pointer;min-height:48px;}",
    ".hub-officer-picker{background:transparent;border:0;border-radius:0;padding:4px 0 8px;margin:0 0 10px;}",
    ".hub-officer-picker label{display:block;font-family:var(--display);color:var(--green-800);font-size:15px;margin:0 0 6px;}",
    ".hub-officer-picker select{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:14px 12px;border-radius:12px;border:1px solid rgba(168,128,28,.4);background:#fff;color:var(--green-800);min-height:48px;}",
    ".hub-officer-picker .hint{margin:8px 0 0;font-size:14px;color:var(--muted);line-height:1.35;}",
    "#hubOfficer > .app-card.hub-officer-hidden,#hubOfficer > section.app-card.hub-officer-hidden{display:none !important;}",
    /* Panels: readable forms, larger taps, less nested chrome */
    ".hub-wrap .app-body,.hub-panel .app-body{font-size:16px;line-height:1.45;}",
    ".hub-wrap .app-card > .app-head{padding:14px 16px;}",
    ".hub-wrap .app-body{padding:16px;}",
    ".hub-profile{background:#fbf7ec;border:0;border-radius:14px;padding:14px;margin-bottom:12px;}",
    ".hub-docs{gap:8px;}",
    ".hub-docs a{min-height:44px;display:inline-flex;align-items:center;padding:10px 14px;}",
    ".hub-prof-form input,.hub-prof-form textarea,.hub-claim select,.hub-claim input,.hub-claim textarea,.hub-event-form input,.hub-event-form textarea,.hub-event-form select{font-size:16px;padding:12px 12px;border-radius:10px;min-height:48px;}",
    ".hub-prof-form textarea,.hub-claim textarea,.hub-event-form textarea{min-height:88px;}",
    ".hub-appr{padding:12px 14px;border-radius:12px;gap:10px;}",
    ".hub-appr-btns .btn,.hub-appr-btns button{min-height:44px;}",
    ".hub-event-row{padding:14px;border-radius:12px;}",
    ".dir-grid{grid-template-columns:1fr;gap:10px;}",
    ".dir-card{min-height:56px;padding:12px 14px;}",
    ".people-row{grid-template-columns:1fr 1fr;}",
    ".hub-panel .btn,.hub-wrap .btn{min-height:48px;}",
    "@media (min-width:720px){",
    ".hub-quest-grid{grid-template-columns:repeat(2,minmax(0,1fr));}",
    ".hub-officer-tiles{display:grid;grid-template-columns:1fr 1fr;gap:12px;}",
    ".hub-find-grid{grid-template-columns:1fr 1fr;}",
    ".hub-tabs{flex-wrap:wrap;overflow:visible;}",
    ".dir-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));}",
    "}",
    "@media (max-width:520px){",
    ".hub-craic-grid{grid-template-columns:1fr;}",
    ".hub-officer-card-top{flex-wrap:nowrap;}",
    ".hub-officer-card .go{margin-left:auto;}",
    ".hub-officer-card b{font-size:22px;}",
    ".hub-prof-grid,.hub-event-grid{grid-template-columns:1fr;}",
    ".people-row{grid-template-columns:1fr;}",
    ".hub-member-bar{padding-bottom:8px;}",
    ".hub-signed-pill{order:1;width:100%;justify-content:flex-start;}",
    ".hub-signout-btn{order:2;}",
    ".hub-officer-chip{order:0;width:100%;justify-content:center;margin-right:0;}",
    "}",

    /* ==== Member desk: one desk, four labeled counters (Irish masthead) ====
       Knotwork trim comes from the site's own Celtic SVG assets; type and
       color follow the heritage pages (Cinzel display, parchment, gold rule,
       crest green), so the desk reads as part of the same illuminated page. */
    ".desk-hero{position:relative;overflow:hidden;background:linear-gradient(180deg,#fffdf8,#f7f0dd);border:1px solid rgba(168,128,28,.42);border-radius:18px;padding:27px 20px 16px;margin:0 0 16px;box-shadow:var(--shadow-sm);}",
    ".desk-hero::before{content:'';position:absolute;left:0;right:0;top:0;height:13px;background:url('/assets/img/celtic-border.svg') repeat-x;background-size:auto 100%;}",
    ".desk-hero::after{content:'';position:absolute;right:-16px;bottom:-16px;width:130px;height:130px;background:url('/assets/img/celtic-corner.svg') no-repeat center/contain;opacity:.15;transform:rotate(180deg);pointer-events:none;}",
    ".desk-hero>*{position:relative;z-index:1;}",
    ".desk-kicker{margin:6px 0 2px;font-family:var(--fancy);font-style:italic;font-size:17px;color:var(--gold-text);letter-spacing:.04em;}",
    ".desk-hero h2{margin:0 0 8px;font-family:var(--display);font-size:clamp(24px,4vw,30px);color:var(--green-800);letter-spacing:.02em;}",
    ".desk-hero p{margin:0 0 12px;font-size:16px;line-height:1.5;color:#3a3a2e;max-width:52em;}",
    ".desk-nav{display:flex;flex-wrap:wrap;gap:8px;}",
    ".desk-nav button{display:inline-flex;align-items:center;gap:7px;min-height:44px;border:1px solid rgba(168,128,28,.45);background:#fff;color:var(--green-800);border-radius:999px;padding:9px 15px;font-family:var(--display);font-size:15px;cursor:pointer;box-shadow:0 1px 3px rgba(42,33,24,.10);}",
    ".desk-nav button:hover{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".desk-group-head{display:flex;align-items:center;gap:12px;padding:8px 2px 10px;}",
    ".desk-group-head .dg-ic{flex:none;width:44px;height:44px;display:grid;place-items:center;font-size:22px;background:#fdf6dd;border:2px solid rgba(168,128,28,.5);border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.12);}",
    ".desk-group-head h3{margin:0;font-family:var(--display);font-size:22px;color:var(--green-800);letter-spacing:.03em;}",
    ".desk-group-head .dg-sub{display:block;margin-top:2px;font-size:15px;color:var(--muted);font-family:var(--fancy);font-style:italic;line-height:1.35;}",
    ".desk-group-rule{height:3px;background:linear-gradient(90deg,#a9801c,#d4af37,#ecd07e,#d4af37,rgba(169,128,28,0));border-radius:2px;margin:0 0 14px;}",
    ".desk-group > .member-grid{display:grid;gap:18px;}",
    "#deskSeason,#deskShare,#deskTravel,#deskLearn,#shareCard,#orientationCard{scroll-margin-top:88px;}",

    /* Officer desk variant of the same masthead: gold-washed parchment for
       the officer identity, and the illuminated group headers replace the
       old small uppercase section labels. */
    ".desk-hero.desk-officer{background:linear-gradient(180deg,#fffdf4,#f6ecd2);border-color:rgba(166,124,0,.5);}",
    ".desk-officer .desk-kicker{color:#7a5b00;}",
    ".desk-group-head h3{text-transform:none;opacity:1;}",
    "#hubOfficerLauncher .hub-officer-section{scroll-margin-top:88px;}",
    /* Member FAQ tab. The group stays out of the desk until the FAQ chip
       or a #faq link opens it, so the rest of the desk keeps its height.
       Section pills swap answers in place: no scroll-into-view, no snap. */
    "#deskFaq{display:none;}",
    "[data-hub-panel='parade'].desk-faq-on #deskFaq{display:block;}",
    "[data-hub-panel='parade'].desk-faq-on #hubParade>.desk-group:not(#deskFaq){display:none !important;}",
    "[data-hub-panel='parade'].desk-faq-on .desk-hero>p:not(.desk-kicker){display:none;}",
    "[data-hub-panel='parade'].desk-faq-on #deskFaq>.desk-group-head,[data-hub-panel='parade'].desk-faq-on #deskFaq>.desk-group-rule{display:none;}",
    ".desk-nav button.on{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    "#hubFaq .app-body{color:#23291f;}",
    ".faq-kicker{margin:0 0 4px;font-family:var(--display);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#a9801c;}",
    ".faq-title{margin:0 0 4px;font-family:var(--display);font-size:clamp(22px,4vw,28px);color:var(--green-800);line-height:1.2;}",
    ".faq-lead{margin:0 0 12px;color:#5c5848;font-size:16px;line-height:1.45;}",
    ".faq-jump{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;}",
    ".faq-jump button{display:inline-flex;align-items:center;min-height:44px;border:1px solid rgba(168,128,28,.45);background:#fff;color:var(--green-800);border-radius:999px;padding:8px 14px;font-family:var(--display);font-size:15px;cursor:pointer;box-shadow:0 1px 3px rgba(42,33,24,.10);}",
    ".faq-jump button.on,.faq-jump button[aria-pressed='true']{background:var(--green-800);color:#f6efdc;border-color:var(--green-800);}",
    ".faq-block h2{margin:0 0 8px;font-family:var(--display);font-size:22px;color:var(--green-800);line-height:1.25;}",
    ".faq-block .faq-sub{margin:-2px 0 10px;font-family:var(--fancy);font-style:italic;color:#5c5848;font-size:16px;}",
    ".faq-block h3{margin:14px 0 6px;font-family:var(--display);font-size:18px;color:var(--green-800);}",
    ".faq-block p,.faq-block li{font-size:17px;line-height:1.55;}",
    ".faq-block ul,.faq-block ol{margin:0 0 12px;padding-left:1.25em;}",
    ".faq-block li{margin:0 0 6px;}",
    ".faq-block a{color:var(--green-800);font-weight:700;overflow-wrap:anywhere;}",
    ".faq-block[hidden]{display:none !important;}",
    "@media (max-width:520px){.faq-jump button{font-size:14px;padding:8px 12px;}}",

  ].join("");

  var state = { officer: false, shopOnly: false, socialOnly: false, canViewPayments: false, canManageEvents: false, canReviewApplications: false, canReviewHours: false, pendingHours: [], hourDecisionFlash: "", applicationCount: 0, applicationBucket: "new", applicationRows: [], applicationCounts: { "new": 0, background: 0, dues: 0, approved: 0, declined: 0, archived: 0, renewal: 0, prospect: 0 }, applicationRecent: [], applicationFlash: "", parade: null, hoursApproved: 0, membershipStatus: null, game: null, nextEvent: null, nextEvents: [], hubEvents: [], announcements: [], birthdays: [], tidingsReady: false, birthdaysReady: false, paradeSeason: [], nextParade: null };
  var feedLock = null;
  var applicationsFixture = null;
  // Full DL and SSN for the offline fixture only. Never written into the card.
  var applicationIdVault = {};
  var hourApprovalsFixture = false;

  function canOpenOfficerDesk() {
    return !!(state.officer || state.canManageEvents || state.canReviewApplications || state.canReviewHours);
  }

  function newApplicationLabel(n) {
    n = Number(n) || 0;
    if (n === 1) return "1 new application";
    if (n === 0) return "No new applications";
    return n + " new applications";
  }

  function applicationsTileDesc() {
    var n = Number(state.applicationCount) || 0;
    if (n === 1) return "1 new join-form application waiting";
    if (n === 0) return "No new join-form applications right now";
    return n + " new join-form applications waiting";
  }
  var hoursDeepLink = false;

  function hoursIntent() {
    try {
      var hash = (location.hash || "").replace(/^#/, "").toLowerCase();
      var intent = "";
      try { intent = sessionStorage.getItem("kos_hub_intent") || ""; } catch (ie) {}
      return hoursDeepLink || intent === "hours" || hash === "hours" || hash === "volunteer";
    } catch (e) {
      return hoursDeepLink;
    }
  }

  function clearHoursIntent() {
    hoursDeepLink = false;
    try { sessionStorage.removeItem("kos_hub_intent"); } catch (re) {}
    try {
      var h = (location.hash || "").replace(/^#/, "").toLowerCase();
      if ((h === "hours" || h === "volunteer") && !(history.state && history.state.kosHub)) {
        history.replaceState(null, "", location.pathname);
      }
    } catch (he) {}
  }

  function injectCss() {
    if (document.getElementById("kosHubCss")) return;
    var s = document.createElement("style");
    s.id = "kosHubCss";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* Phone-app shell helpers. The signed-in hub keeps every existing panel.
     This layer adds the header, countdown, tiles, and bottom tabs. */
  function svgIcon(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }
  var APP_ICO = {
    home: svgIcon('<path d="M4 10.5 12 3.8l8 6.7V20a1 1 0 0 1-1 1h-5.1v-6.2H10.1V21H5a1 1 0 0 1-1-1Z"/>'),
    events: svgIcon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/>'),
    parade: svgIcon('<path d="M6 21V4"/><path d="M6 5h11l-2.2 3.2L17 11.5H6"/>'),
    me: svgIcon('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 19.5c1.2-3 3.4-4.5 6.5-4.5s5.3 1.5 6.5 4.5"/>'),
    officer: svgIcon('<path d="m12 3.2 2.2 4.6 5 .6-3.7 3.4.9 5L12 14.6 7.6 16.8l.9-5L4.8 8.4l5-.6Z"/>'),
    bell: svgIcon('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5"/><path d="M4.5 16.5h15"/><path d="M10 18.5a2 2 0 0 0 4 0"/>'),
    card: svgIcon('<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="11" r="1.6"/><path d="M13 10.2h5M13 13.4h4"/>'),
    cal: svgIcon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/>'),
    dues: svgIcon('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/><path d="M7 14.2h3.2"/>'),
    chat: svgIcon('<path d="M6 16.5 4 19.2V7.2A2.2 2.2 0 0 1 6.2 5h11.6A2.2 2.2 0 0 1 20 7.2v6.2a2.2 2.2 0 0 1-2.2 2.2H8.2Z"/>'),
    car: svgIcon('<path d="M4 15.2 5.8 9.6A2 2 0 0 1 7.7 8.2h8.6a2 2 0 0 1 1.9 1.4L20 15.2"/><path d="M3.8 15.2h16.4V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1.2-1Z"/><circle cx="7.5" cy="15.2" r="1.1"/><circle cx="16.5" cy="15.2" r="1.1"/>'),
    heart: svgIcon('<path d="M12 19.4s-6.4-3.9-6.4-8.1A3.5 3.5 0 0 1 12 8.8a3.5 3.5 0 0 1 6.4 2.5c0 4.2-6.4 8.1-6.4 8.1Z"/>'),
    bag: svgIcon('<path d="M6.5 8.5h11l-.8 11H7.3Z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>'),
    camera: svgIcon('<path d="M8.2 7.4 9.4 5.4h5.2l1.2 2"/><rect x="4" y="7.4" width="16" height="11.2" rx="2"/><circle cx="12" cy="13" r="2.5"/>'),
    phone: svgIcon('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18.2h2"/>')
  };
  var TAB_TITLES = { hub: "Home", events: "Events", parade: "Parade", krewe: "Me", fun: "Craic Cup", officer: "Officer" };
  var DUES_FULL_URL = "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership";
  var DUES_LOA_URL = "https://www.zeffy.com/en-US/ticketing/krewe-of-shamrock-membership-2";

  function tabButton(id, label, icon, extra) {
    return '<button type="button" data-hub-tab="' + id + '">' +
      '<span class="app-tab-ic" aria-hidden="true">' + icon + "</span>" +
      '<span class="app-tab-tx">' + label + "</span>" +
      (extra || "") + "</button>";
  }

  var BACK_ICO = svgIcon('<path d="M15 5 8 12l7 7"/>');
  /* Filled in after showTab exists. Clicks before that still switch panels. */
  var appNavApi = {
    ready: false,
    openTab: function (tab) { showTab(tab); },
    openEvent: function () {},
    openFocus: function (tab) { showTab(tab); },
    openCard: function () { openMemberCard(); },
    openGetApp: function () {},
    openAnnouncement: function () {},
    openFun: function () { showTab("fun"); },
    back: function () { try { history.back(); } catch (e) {} },
    boot: function () {},
    sync: function () {},
    onHash: function () {}
  };

  function appChromeHtml() {
    return '<header class="app-top" id="appTop">' +
      '<div class="app-rootbar" id="appRootBar">' +
      '<div class="app-av" id="appAv" aria-hidden="true">☘</div>' +
      '<div class="app-top-copy"><p class="app-greet" id="appGreet">Good afternoon</p>' +
      '<h1 id="appPageTitle">Home</h1></div>' +
      '<button type="button" class="app-bell" id="appBell" aria-label="Notes from the officers">' +
      APP_ICO.bell + '<span class="app-bell-dot" id="appBellDot" hidden></span></button>' +
      '</div>' +
      '<div class="app-backbar" id="appBackBar" hidden>' +
      '<button type="button" class="app-back" id="appBack">' + BACK_ICO + ' Back</button>' +
      '<h1 id="appBackTitle">Back</h1></div>' +
      '<div class="app-bell-panel" id="appBellPanel" hidden></div></header>' +
      '<div class="app-sheet" id="appSheet" hidden>' +
      '<div class="app-sheet-card" role="dialog" aria-modal="true" aria-labelledby="appSheetTitle">' +
      '<div class="app-sheet-grab" aria-hidden="true"></div>' +
      '<button type="button" class="app-sheet-x" id="appSheetClose">Close</button>' +
      '<div id="appSheetBody"></div></div></div>' +
      '<div id="appDrill" hidden>' +
      '<div class="app-drill-scroll" id="appDrillScroll"></div>' +
      '<div class="app-drill-actions" id="appDrillActions"></div></div>' +
      '<div class="app-toast" id="appToast" hidden role="status"></div>';
  }

  function meLinksHtml() {
    return '<section class="app-card" id="appMeLinks">' +
      '<div class="app-head"><span class="ic" aria-hidden="true">☘</span><div><h2>Your hub</h2>' +
      '<small>Everything else still lives here</small></div></div>' +
      '<div class="app-body app-links">' +
      '<button type="button" class="app-install-row" id="hubInstallMe" data-app-go="get-app">' +
      "<span>Install the app</span><span class=\"go\">Open</span></button>" +
      "<p>The Parade tab is your Member desk: Parade Ready, volunteer hours, carpools, vans, lockers, documents, the orientation video, and the member FAQ. The Craic Cup is here too.</p>" +
      '<button type="button" class="btn btn-primary" data-app-go="fun">Open the Craic Cup</button>' +
      '<button type="button" class="btn" data-app-go="parade">Open Member desk</button>' +
      '<button type="button" class="btn" data-app-go="docs">Documents</button>' +
      '<button type="button" class="btn" data-app-go="tune">Play the Irish tune</button>' +
      '<button type="button" class="btn" data-app-go="signout">Sign out</button>' +
      "<h3>Rest of the website</h3>" +
      '<a href="index.html">Public home</a>' +
      '<a href="event-signup.html">Upcoming events</a>' +
      '<a href="parades.html">Parades</a>' +
      '<a href="tartan-ball.html">Tartan Ball</a>' +
      '<a href="members.html#faq">Member FAQ</a>' +
      '<a href="learn.html">Our heritage</a>' +
      '<a href="krewe-history.html">Krewe history</a>' +
      '<a href="poetry.html">Krewe creativity</a>' +
      '<a href="gallery.html">Photo gallery</a>' +
      '<a href="videos.html">Videos</a>' +
      '<a href="share.html">Share yours</a>' +
      '<a href="volunteer.html">Volunteer</a>' +
      '<a href="store.html">Shop</a>' +
      '<a href="membership-application.html">Membership application</a>' +
      '<a href="https://kreweofshamrock.wildapricot.org" target="_blank" rel="noopener noreferrer">Archive of the previous site</a>' +
      "</div></section>";
  }

  function memberEventWhereHtml(ev) {
    var bits = [];
    if (ev.members_only) bits.push('<div class="meta">Members only</div>');
    if (ev.member_address) bits.push('<div class="meta">' + esc(ev.member_address) + '</div>');
    else if (ev.location) bits.push('<div class="meta">' + esc(ev.location) + '</div>');
    return bits.join("");
  }

  function renderHubMemberEvents(list) {
    var target = document.getElementById("hubMemberEventList");
    if (!target) return;
    var rows = list || [];
    if (!rows.length) {
      target.innerHTML = '<p class="empty">No upcoming Shamrock events just now. Check the public calendar for IKC listings.</p>';
      return;
    }
    target.innerHTML = rows.map(function (ev) {
      var when = "";
      if (ev.start_time) {
        var d = new Date(ev.start_time);
        when = isNaN(d.getTime()) ? String(ev.start_time) : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      } else {
        when = "Date to be announced";
      }
      var addr = ev.member_address ? String(ev.member_address).trim() : "";
      var teaser = ev.location ? String(ev.location).trim() : "";
      var where = addr
        ? ('<div style="margin:4px 0 0;"><b>Address:</b> ' + esc(addr) + '</div>')
        : (teaser ? ('<div style="margin:4px 0 0;">' + esc(teaser) + '</div>') : "");
      var bits = appEventBits(ev.start_time);
      var dateBlock = bits
        ? '<span class="app-date"><b>' + esc(bits.month) + '</b><span>' + esc(bits.day) + '</span></span>'
        : '<span class="app-date"><b>TBD</b><span></span></span>';
      return '<button type="button" class="app-event-hit" data-app-event="' + esc(ev.id || "") + '">' +
        dateBlock +
        '<span class="app-event-copy"><b>' + esc(ev.name || "Krewe event") + '</b>' +
        '<span class="muted" style="display:block;">' + esc(when) + (ev.members_only ? " · Members only" : "") + '</span>' +
        where +
        (teaser && addr ? '<span class="muted" style="display:block;margin-top:2px;">Public note: ' + esc(teaser) + '</span>' : "") +
        '</span><span class="app-rsvp">RSVP</span></button>';
    }).join("");
  }

  function whenLabel(value) {
    if (!value) return "Date to be announced";
    var d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function statusPill(ok, yesText, noText) {
    return '<span class="' + (ok ? "ok" : "warn") + '">' + esc(ok ? yesText : noText) + "</span>";
  }

  function calendarBtn(ev, label) {
    if (!ev || !ev.start_time) return "";
    return '<button type="button" class="btn" data-hub-ics="' + esc(ev.id || ev.name || "") + '">' +
      esc(label || "Add to calendar") + "</button>";
  }

  function paradeSeasonCardHtml(row) {
    var meeting = row.meeting || null;
    var eligible = !!row.eligible;
    var gated = !!row.soft_gate_checkin;
    var paradeWhere = "";
    if (row.member_address) paradeWhere = '<div style="margin:4px 0 0;"><b>Staging:</b> ' + esc(row.member_address) + "</div>";
    else if (row.location) paradeWhere = '<div style="margin:4px 0 0;">' + esc(row.location) + "</div>";
    var meetLine = "";
    if (meeting) {
      var meetWhere = meeting.member_address
        ? ('<div style="margin:2px 0 0;"><b>Meeting address:</b> ' + esc(meeting.member_address) + "</div>")
        : (meeting.location ? '<div class="muted">' + esc(meeting.location) + "</div>" : "");
      meetLine = '<div style="margin-top:10px;"><b>Mandatory meeting:</b> ' + esc(meeting.name || "Briefing") +
        '<div class="muted">' + esc(whenLabel(meeting.start_time)) + "</div>" + meetWhere + "</div>";
    }
    var warn = gated
      ? '<p class="hub-parade-warn">Door Check-In for this parade will warn and stay blocked until you check in at the mandatory meeting. RSVP is still open.</p>'
      : "";
    var btns = [];
    if (meeting && !meeting.rsvpd) {
      btns.push('<button type="button" class="btn btn-primary" data-hub-parade-rsvp="' + esc(meeting.id) + '">RSVP to meeting</button>');
    }
    if (!row.parade_rsvpd) {
      btns.push('<button type="button" class="btn btn-primary" data-hub-parade-rsvp="' + esc(row.id) + '">RSVP to parade</button>');
    }
    if (meeting) btns.push(calendarBtn(meeting, "Add meeting to calendar"));
    btns.push(calendarBtn(row, "Add parade to calendar"));
    return '<div class="hub-event-row" data-parade-card="' + esc(row.id) + '">' +
      '<div style="flex:1;min-width:0;"><b>' + esc(row.name || "Parade") + "</b>" +
      '<div class="muted">' + esc(whenLabel(row.start_time)) + (row.members_only ? " · Members only" : "") + "</div>" +
      paradeWhere +
      (row.location && row.member_address ? '<div class="muted" style="margin-top:2px;">Public note: ' + esc(row.location) + "</div>" : "") +
      (row.notes ? '<div style="margin:6px 0 0;"><b>Role notes:</b> ' + esc(row.notes) + "</div>" : "") +
      '<div class="hub-parade-status">' +
      statusPill(!!(meeting && meeting.rsvpd), "Meeting RSVP’d", meeting ? "Meeting not RSVP’d" : "No meeting linked") +
      statusPill(!!(meeting && meeting.checked_in), "Meeting checked in", meeting ? "Meeting not checked in" : "Meeting check-in n/a") +
      statusPill(!!row.parade_rsvpd, "Parade RSVP’d", "Parade not RSVP’d") +
      statusPill(eligible, "Eligible", "Not yet eligible") +
      statusPill(!!row.parade_checked_in, "Parade checked in", "Parade not checked in") +
      "</div>" +
      meetLine + warn +
      '<p class="hub-parade-msg" data-parade-msg="' + esc(row.id) + '"></p></div>' +
      '<div class="hub-appr-btns">' + btns.join("") + "</div></div>";
  }

  function wireParadeSeasonList(root, list) {
    if (!root) return;
    root.querySelectorAll("[data-hub-parade-rsvp]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        hubRsvpParadeEvent(btn.getAttribute("data-hub-parade-rsvp"), btn);
      });
    });
    root.querySelectorAll("[data-hub-ics]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-hub-ics");
        var ev = null;
        (list || []).forEach(function (row) {
          if (String(row.id) === String(key)) ev = row;
          else if (row.meeting && String(row.meeting.id) === String(key)) ev = row.meeting;
        });
        if (!ev) return;
        if (window.kosCalendar && typeof window.kosCalendar.download === "function") {
          window.kosCalendar.download({
            id: ev.id,
            name: ev.name,
            start_time: ev.start_time,
            end_time: ev.end_time,
            location: ev.location,
            description: ev.description || ""
          });
        }
      });
    });
  }

  function renderHubParadeSeason(list) {
    if (feedLock && Array.isArray(feedLock.parades)) list = feedLock.parades;
    var rows = list || [];
    state.paradeSeason = rows;
    var html = rows.length
      ? rows.map(paradeSeasonCardHtml).join("")
      : '<p class="empty">No published Shamrock parades on the calendar yet. Officers add them in Event Studio.</p>';
    document.querySelectorAll(".hub-parade-season-list").forEach(function (target) {
      target.innerHTML = html;
      wireParadeSeasonList(target, rows);
    });
  }
  window.__kosRenderParadeSeason = renderHubParadeSeason;

  async function hubRsvpParadeEvent(eventId, btn) {
    var client = window.__kosSb;
    var card = btn && btn.closest ? btn.closest("[data-parade-card]") : null;
    var msg = card ? card.querySelector("[data-parade-msg]") : null;
    if (!client || !eventId) return;
    var p = window.kosProfile || {};
    var first = p.first_name || firstName();
    var last = p.last_name || "";
    var email = p.email || "";
    if (!email || !last) {
      if (msg) msg.textContent = "Your member profile needs a first name, last name, and email to RSVP.";
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
    try {
      var res = await client.rpc("rsvp_to_event", {
        p_event_id: eventId,
        p_first_name: first,
        p_last_name: last,
        p_email: email,
        p_guests_count: 0,
        p_signup_role: "attendee"
      });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not RSVP.");
      if (msg) msg.textContent = (res.data && res.data.message) || "You're signed up.";
      await loadParadeSeason(client);
    } catch (e) {
      if (msg) msg.textContent = (e && e.message) || "Could not RSVP. Try again.";
      if (btn) { btn.disabled = false; btn.textContent = "RSVP"; }
    }
  }

  function signupStatusMap(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.event_id) return;
      map[r.event_id] = r.status || "";
    });
    return map;
  }

  function deriveParadeSeason(events, signups) {
    var status = signupStatusMap(signups);
    var byId = {};
    (events || []).forEach(function (e) { if (e && e.id) byId[e.id] = e; });
    return (events || []).filter(function (e) {
      return String(e.event_type || "").toLowerCase() === "parade";
    }).map(function (e) {
      var meet = e.linked_meeting_id ? byId[e.linked_meeting_id] : null;
      var paradeStatus = status[e.id] || "";
      var meetStatus = meet ? (status[meet.id] || "") : "";
      var meetAttended = meetStatus === "attended";
      return {
        id: e.id,
        name: e.name,
        description: e.description,
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location,
        member_address: e.member_address,
        members_only: e.members_only,
        notes: e.notes || "",
        linked_meeting_id: e.linked_meeting_id,
        parade_rsvpd: !!paradeStatus,
        parade_checked_in: paradeStatus === "attended",
        parade_rsvp_status: paradeStatus || null,
        eligible: !meet || meetAttended,
        soft_gate_checkin: !!(meet && !meetAttended),
        meeting: meet ? {
          id: meet.id,
          name: meet.name,
          start_time: meet.start_time,
          end_time: meet.end_time,
          location: meet.location,
          member_address: meet.member_address,
          rsvpd: !!meetStatus,
          checked_in: meetAttended,
          rsvp_status: meetStatus || null
        } : null
      };
    });
  }

  async function loadParadeSeason(client) {
    if (window.__kosParadeSeasonLocked) return;
    if (!client) return;
    try {
      var res = await client.rpc("member_parade_season");
      if (!res.error && res.data && res.data.ok) {
        renderHubParadeSeason(res.data.parades || []);
        return;
      }
    } catch (e) {}
    try {
      var evs = await client.from("events")
        .select("id,name,description,start_time,end_time,location,member_address,members_only,event_type,linked_meeting_id,status,source,notes")
        .eq("source", "krewe")
        .order("start_time", { ascending: true })
        .limit(40);
      if (evs.error) throw evs.error;
      var list = (evs.data || []).filter(function (e) {
        var st = String(e.status || "published").toLowerCase();
        return st === "published" || st === "live";
      });
      var meId = (window.kosProfile || {}).member_id || null;
      var signed = [];
      if (meId) {
        var su = await client.from("event_signups")
          .select("event_id,status")
          .eq("member_id", meId)
          .in("status", ["registered", "confirmed", "attended", "waitlisted"]);
        signed = su.data || [];
      }
      renderHubParadeSeason(deriveParadeSeason(list, signed));
    } catch (e2) {
      renderHubParadeSeason([]);
    }
  }

  function firstName() {
    var p = window.kosProfile || {};
    if (p.first_name) return String(p.first_name);
    var dn = (p.display_name || "").toString().trim();
    if (dn) return dn.split(/\s+/)[0];
    return "Member";
  }

  // Root-absolute so pills work even if the Hub URL has a nested path.
  var DOC_PAGES = {
    bylaws: "/assets/docs/bylaws.html",
    codeOfConduct: "/assets/docs/code-of-conduct.html",
    paradeRules: "/assets/docs/parade-rules.html"
  };

  function hubDocsPillsHtml(style) {
    return '<div class="hub-docs"' + (style ? ' style="' + style + '"' : "") + ">" +
      '<a href="' + DOC_PAGES.bylaws + '">Bylaws</a>' +
      '<a href="' + DOC_PAGES.codeOfConduct + '">Code of Conduct</a>' +
      '<a href="' + DOC_PAGES.paradeRules + '">Parade Rules</a>' +
      "</div>";
  }

  function headingOf(sec) {
    var h = sec.querySelector("h2");
    return h ? (h.textContent || "").toLowerCase() : "";
  }

  function tagSections() {
    var sections = document.querySelectorAll("#memberContent .member-grid > section");
    sections.forEach(function (sec) {
      if (sec.getAttribute("data-hub")) return;
      if (sec.id === "prCard") sec.setAttribute("data-hub", "parade");
      else if (sec.id === "dashCard") {
        // Reports belong on Officer desk only - never on member Home.
        sec.setAttribute("data-hub", "officer");
        sec.style.display = "none";
        sec.setAttribute("hidden", "");
        sec.setAttribute("aria-hidden", "true");
      }
      else {
        var h = headingOf(sec);
        if (h.indexOf("parade") !== -1) sec.setAttribute("data-hub", "parade");
        else if (h.indexOf("craic") !== -1) sec.setAttribute("data-hub", "fun");
        else if (h.indexOf("raffle") !== -1) sec.setAttribute("data-hub", "hub");
        else if (h.indexOf("report") !== -1) sec.setAttribute("data-hub", "hub");
        else if (h.indexOf("share") !== -1) sec.setAttribute("data-hub", "parade");
        else if (h.indexOf("locker") !== -1) sec.setAttribute("data-hub", "parade");
        else if (h.indexOf("carpool") !== -1) sec.setAttribute("data-hub", "parade");
        else if (h.indexOf("van") !== -1) sec.setAttribute("data-hub", "parade");
        else if (h.indexOf("volunteer") !== -1 || h.indexOf("hours") !== -1) sec.setAttribute("data-hub", "parade");
        else if (h.indexOf("directory") !== -1) sec.setAttribute("data-hub", "krewe");
        else if (h.indexOf("document") !== -1) sec.setAttribute("data-hub", "parade");
      }
    });
  }

  function relocateHours() {
    var pr = document.getElementById("prCard");
    var body = document.getElementById("hubHoursBody");
    if (!pr || !body) return;
    var nodes = Array.prototype.slice.call(pr.querySelectorAll(".app-body > *"));
    var frag = document.createDocumentFragment();
    nodes.forEach(function (n) {
      if (n.id === "prHours" || n.id === "vhIntro" || n.id === "vhForm" || (n.tagName === "H4" && /volunteer hours/i.test(n.textContent || ""))) {
        frag.appendChild(n);
      }
    });
    if (frag.childNodes.length) {
      body.innerHTML = "";
      body.appendChild(frag);
    } else {
      body.innerHTML = '<p style="font-size:16px;color:var(--muted);">Volunteer hours appear after your Parade Ready data loads. You can also log hours from the Parade Day tab.</p>';
    }
  }

  function moveIntoPanels() {
    if (document.getElementById("hubRoot")) return;
    var main = document.getElementById("memberContent");
    if (!main) return;
    var oldGrid = main.querySelector(".member-grid");
    if (!oldGrid) return;

    var root = document.createElement("div");
    root.id = "hubRoot";
    root.className = "hub-wrap";

    var tabHtml = '<nav class="hub-tabs" id="hubTabs" aria-label="Member hub sections">' +
      tabButton("hub", "Home", APP_ICO.home) +
      tabButton("events", "Events", APP_ICO.events) +
      tabButton("parade", "Parade", APP_ICO.parade) +
      tabButton("krewe", "Me", APP_ICO.me) +
      tabButton("fun", "Craic Cup", APP_ICO.heart) +
      tabButton("officer", "Officer", APP_ICO.officer, '<span class="app-tab-badge" id="appOfficerBadge" hidden>0</span>') +
      "</nav>";

    root.innerHTML =
      appChromeHtml() +
      tabHtml +
      '<div id="hubHome" class="hub-panel hub-on" data-hub-panel="hub">' +
      '<div id="hubHomeTop" class="hub-home-stack"></div><div class="member-grid" id="hubHomeGrid"></div></div>' +
      '<div class="hub-panel" data-hub-panel="krewe"><div class="member-grid" id="hubKrewe"></div></div>' +
      '<div class="hub-panel" data-hub-panel="events"><div class="member-grid" id="hubEvents"></div></div>' +
      '<div class="hub-panel" data-hub-panel="parade"><div class="member-grid" id="hubParade"></div></div>' +
      '<div class="hub-panel" data-hub-panel="give" style="display:none"><div class="member-grid" id="hubGive"></div></div>' +
      '<div class="hub-panel" data-hub-panel="fun"><div class="member-grid" id="hubFun"></div></div>' +
      '<div class="hub-panel" data-hub-panel="officer"><div class="member-grid" id="hubOfficer"></div></div>';

    var bar = document.getElementById("memberBar");
    if (bar) bar.insertAdjacentElement("afterend", root);
    else main.insertBefore(root, oldGrid);

    var krewe = document.getElementById("hubKrewe");
    krewe.innerHTML =
      '<section class="app-card"><div class="app-head"><span class="ic">☘</span><div><h2>My Krewe</h2><small>Profile and member directory</small></div></div>' +
      '<div class="app-body">' +
      '<div class="hub-profile" id="hubProfileCard"><h3>Your profile</h3><p class="empty">Loading…</p></div>' +
      "</div></div></section>";

    var events = document.getElementById("hubEvents");
    events.innerHTML =
      '<section class="app-card"><div class="app-head"><span class="ic">📅</span><div><h2>Events and RSVPs</h2><small>Member addresses show here after you sign in</small></div></div>' +
      '<div class="app-body"><p>RSVP to krewe events, track attendance, and keep your calendar current.</p>' +
      '<div id="hubMemberEventList"><p class="empty">Loading events…</p></div>' +
      '<p><a class="btn btn-primary" href="event-signup.html">Open event signup</a></p>' +
      '<p style="font-size:16px;color:var(--muted);margin-top:12px;">Attendance feeds Parade Ready and the Craic Cup.</p></div></section>' +
      '<section class="app-card" id="hubParadeSeasonEvents"><div class="app-head"><span class="ic">🥁</span><div><h2>Parade season</h2><small>Meeting and parade RSVP, eligibility, and your calendar</small></div></div>' +
      '<div class="app-body"><div class="hub-parade-season-list" id="hubParadeSeasonList"><p class="empty">Loading parade season…</p></div></div></section>';

    var give = document.getElementById("hubGive");
    if (give) give.innerHTML =
      '<section class="app-card" id="hubHoursCard"><div class="app-head"><span class="ic">🤝</span><div><h2>Volunteer hours</h2><small>Log hours for this season (June through May)</small></div></div>' +
      '<div class="app-body" id="hubHoursBody"><p class="empty">Loading hours…</p></div></section>';

    var parade = document.getElementById("hubParade");
    if (parade && !document.getElementById("hubParadeSeasonCard")) {
      var seasonCard = document.createElement("section");
      seasonCard.className = "app-card";
      seasonCard.id = "hubParadeSeasonCard";
      seasonCard.innerHTML =
        '<div class="app-head"><span class="ic">🥁</span><div><h2>Parade season</h2><small>Meeting RSVP, parade eligibility, and add-to-calendar</small></div></div>' +
        '<div class="app-body"><div class="hub-parade-season-list" id="hubParadeSeasonDeskList"><p class="empty">Loading parade season…</p></div></div>';
      parade.appendChild(seasonCard);
    }
    var fun = document.getElementById("hubFun");
    var officer = document.getElementById("hubOfficer");
    var homeGrid = document.getElementById("hubHomeGrid");
    Array.prototype.slice.call(oldGrid.children).forEach(function (sec) {
      var hub = sec.getAttribute("data-hub");
      if (hub === "parade" || hub === "give") parade.appendChild(sec);
      else if (hub === "fun") fun.appendChild(sec);
      else if (hub === "officer") officer.appendChild(sec);
      else if (hub === "krewe") krewe.appendChild(sec);
      else if (hub === "hub" && homeGrid) homeGrid.appendChild(sec);
      else if (homeGrid) homeGrid.appendChild(sec);
      else fun.appendChild(sec);
    });
    // Volunteer hours joins the parade grid; layoutMemberDesk() groups it
    // under "Get Season Ready" right after the Parade Ready card.
    if (give && give.firstChild) parade.insertBefore(give.firstChild, parade.firstChild);
    oldGrid.remove();
    relocateHours();
    layoutMemberDesk();
    if (!document.getElementById("appMeLinks")) {
      var kreweLinks = document.getElementById("hubKrewe");
      if (kreweLinks) kreweLinks.insertAdjacentHTML("beforeend", meLinksHtml());
    }
    bindAppChrome();
    ensureClaimCloversCard();
  }

  /* Member FAQ sections. Hashes are #faq and #faq-beads (and the other
     section names). None of those strings is an element id, so the browser
     does not scroll the page to a matching anchor on load. */
  var FAQ_SECTIONS = ["events", "beads", "charities", "communication", "merchandise", "parades", "attire", "guests"];

  function faqHashSection(hash) {
    var h = String(hash || "").replace(/^#/, "").toLowerCase();
    if (h === "faq") return "";
    if (h.indexOf("faq-") === 0) {
      var sec = h.slice(4);
      if (FAQ_SECTIONS.indexOf(sec) !== -1) return sec;
    }
    return null;
  }

  function clearFaqMode() {
    var panel = document.querySelector('[data-hub-panel="parade"]');
    if (panel) panel.classList.remove("desk-faq-on");
    document.querySelectorAll('.desk-nav [data-desk-goto="deskFaq"]').forEach(function (btn) {
      btn.classList.remove("on");
      btn.removeAttribute("aria-current");
    });
  }

  function applyFaqView(section) {
    var sec = section && FAQ_SECTIONS.indexOf(section) !== -1 ? section : "events";
    var panel = document.querySelector('[data-hub-panel="parade"]');
    if (panel) panel.classList.add("desk-faq-on");
    document.querySelectorAll("#hubFaq [data-faq-section]").forEach(function (el) {
      if (el.getAttribute("data-faq-section") === sec) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
    document.querySelectorAll("#hubFaq [data-faq-pill]").forEach(function (btn) {
      var on = btn.getAttribute("data-faq-pill") === sec;
      btn.classList.toggle("on", on);
      if (on) btn.setAttribute("aria-pressed", "true");
      else btn.setAttribute("aria-pressed", "false");
    });
    document.querySelectorAll(".desk-nav [data-desk-goto]").forEach(function (btn) {
      var on = btn.getAttribute("data-desk-goto") === "deskFaq";
      btn.classList.toggle("on", on);
      if (on) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    });
  }

  function openMemberFaq(section) {
    var sec = section || "";
    if (sec && FAQ_SECTIONS.indexOf(sec) === -1) sec = "";
    if (appNavApi.ready && typeof appNavApi.openFocus === "function") {
      appNavApi.openFocus("parade", "hubFaq", "FAQ", sec);
      return;
    }
    showTab("parade", { skipScroll: true });
    applyFaqView(sec);
  }

  function bindFaqPills() {
    var root = document.getElementById("hubFaq");
    if (!root || root.getAttribute("data-faq-bound") === "1") return;
    root.setAttribute("data-faq-bound", "1");
    root.querySelectorAll("[data-faq-pill]").forEach(function (btn) {
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        openMemberFaq(btn.getAttribute("data-faq-pill") || "");
      });
    });
  }

  /* ---- Member desk layout: one desk, labeled counters ----
     A member who taps Member desk should understand at a glance what lives
     here, so every everyday tool files under a labeled group with jump chips
     in an Irish-styled masthead. The flow reads top to bottom: get season
     ready, share your media for the public site, sort rides and gear, then
     learn and look things up, including the member FAQ. Cards keep their ids
     and internal wiring - only their position changes - and a card no group
     claims files in last, so future desk cards never vanish. */
  var DESK_GROUPS = [
    { id: "deskSeason", icon: "🎗️", chip: "Season checklist", title: "Get Season Ready",
      sub: "Dues, waiver, parade RSVP, meeting check-in, photo release, and your volunteer hours.",
      cards: ["prCard", "hubParadeSeasonCard", "hubHoursCard"] },
    { id: "deskShare", icon: "📸", chip: "Share your media", title: "Share Your Media & Creativity",
      sub: "Photos and videos for the public site - an officer approves each one - plus artwork, poems, stories, and recipes.",
      cards: ["shareCard"] },
    { id: "deskTravel", icon: "🚐", chip: "Rides & locker", title: "Getting There & Your Gear",
      sub: "Carpools, seats on the krewe vans, and locker rentals.",
      cards: ["carpoolCard", "vanCard", "lockerCard"] },
    { id: "deskLearn", icon: "📜", chip: "Learn & documents", title: "Learn & Look Up",
      sub: "The new member orientation video and the governing documents.",
      cards: ["orientationCard", "docs"] },
    { id: "deskFaq", icon: "❓", chip: "FAQ", title: "Frequently Asked Questions",
      sub: "Events, beads, volunteer hours, parades, and krewe gear.",
      cards: ["hubFaq"] }
  ];

  function layoutMemberDesk() {
    var grid = document.getElementById("hubParade");
    if (!grid || document.getElementById("deskHero")) return;
    var panel = grid.parentElement;
    if (!panel) return;

    var hero = document.createElement("div");
    hero.className = "desk-hero";
    hero.id = "deskHero";
    hero.innerHTML =
      '<p class="desk-kicker">Fáilte, a chara - welcome, friend</p>' +
      "<h2>☘ Your Member Desk</h2>" +
      "<p>Everything a member needs, on one desk: get Parade Ready and log your volunteer hours, " +
      "share your photos and videos for the public site (an officer approves each one before it goes live), " +
      "find a ride or a locker, look up documents, and read the member FAQ.</p>" +
      '<nav class="desk-nav" aria-label="Member desk sections">' +
      DESK_GROUPS.map(function (g) {
        return '<button type="button" data-desk-goto="' + g.id + '">' + g.icon + " " + g.chip + "</button>";
      }).join("") +
      "</nav>";
    panel.insertBefore(hero, grid);

    DESK_GROUPS.forEach(function (g) {
      var cards = g.cards.map(function (id) { return document.getElementById(id); })
        .filter(function (el) { return el && el.parentElement === grid; });
      if (!cards.length) return;
      var wrap = document.createElement("section");
      wrap.className = "desk-group";
      wrap.id = g.id;
      wrap.innerHTML =
        '<header class="desk-group-head"><span class="dg-ic" aria-hidden="true">' + g.icon + "</span>" +
        "<div><h3>" + g.title + '</h3><span class="dg-sub">' + g.sub + "</span></div></header>" +
        '<div class="desk-group-rule"></div>';
      var inner = document.createElement("div");
      inner.className = "member-grid";
      cards.forEach(function (el) { inner.appendChild(el); });
      wrap.appendChild(inner);
      grid.appendChild(wrap);
    });

    // Cards no group claimed keep working - they just file in after the groups.
    Array.prototype.slice.call(grid.children).forEach(function (el) {
      if (el.classList && el.classList.contains("desk-group")) return;
      grid.appendChild(el);
    });

    hero.querySelectorAll("[data-desk-goto]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-desk-goto");
        if (id === "deskFaq") {
          openMemberFaq("");
          return;
        }
        var paradePanel = document.querySelector('[data-hub-panel="parade"]');
        if (paradePanel && paradePanel.classList.contains("desk-faq-on") && typeof appNavApi.showParadeRoot === "function") {
          appNavApi.showParadeRoot();
        }
        focusHubTarget(document.getElementById(id));
      });
    });
    bindFaqPills();
  }

  function profileDuesExempt(profile) {
    var p = profile || window.kosProfile || {};
    var roles = [];
    if (p.member_role) roles.push(p.member_role);
    var grants = p.roles || p.member_roles || [];
    if (Array.isArray(grants)) {
      grants.forEach(function (g) {
        if (typeof g === "string") roles.push(g);
        else if (g && g.role) roles.push(g.role);
      });
    }
    var L = window.KOS_LEADERSHIP;
    if (L && typeof L.highestMemberRole === "function") {
      var top = L.highestMemberRole(roles);
      if (top === "officer" || top === "board") return true;
      if (p.officer_title && typeof L.splitTitles === "function" && typeof L.rolesForTitle === "function") {
        var fromTitles = [];
        L.splitTitles(p.officer_title).forEach(function (title) {
          fromTitles = fromTitles.concat(L.rolesForTitle(title) || []);
        });
        var titled = L.highestMemberRole(fromTitles);
        if (titled === "officer" || titled === "board") return true;
      }
      return false;
    }
    return roles.some(function (r) {
      return /^(officer|captain|board|treasurer|secretary)$/i.test(String(r || ""));
    });
  }

  window.kosDuesExempt = function () { return profileDuesExempt(); };

  function standingChip() {
    var st = (state.membershipStatus || "").toString().toLowerCase();
    var unpaid = /unpaid|delinquent|lapsed|owing|past.?due/.test(st);
    var good = /good|active|current|paid/.test(st) && !unpaid;
    var exempt = profileDuesExempt();
    if (!exempt && state.parade && state.parade.dues_paid === true) good = true;
    if (!exempt && state.parade && state.parade.dues_paid === false) { good = false; unpaid = true; }
    if (exempt && state.parade && state.parade.dues_paid === true) good = true;
    var label = good ? "Good Standing" : (state.membershipStatus ? String(state.membershipStatus) : (unpaid ? "Dues attention" : "Standing TBD"));
    var cls = good ? "ok" : (unpaid ? "warn" : "");
    return '<span class="hub-chip ' + cls + '">🏷 ' + esc(label) + "</span>";
  }

  function duesGateMet(me) {
    if (profileDuesExempt()) return true;
    return !!(me && me.dues_paid);
  }

  function paradeChip() {
    var me = state.parade;
    if (!me) return '<span class="hub-chip">🎗️ Parade Ready · -</span>';
    var ready = !!(duesGateMet(me) && me.waiver_signed && me.meeting_attended);
    return '<span class="hub-chip ' + (ready ? "ok" : "warn") + '">🎗️ ' + (ready ? "Parade Ready" : "Not parade ready") + "</span>";
  }

  function hoursChip() {
    var n = state.hoursApproved || 0;
    var cls = n >= 12 ? "ok" : "";
    return '<span class="hub-chip ' + cls + '">🤝 ' + n + "/12 volunteer hours</span>";
  }

  function craicHeroHtml() {
    var g = state.game || {};
    var found = !!g.found;
    var life = found ? Number(g.lifetime || 0) : 0;
    var season = found ? Number(g.season || 0) : 0;
    var rank = found ? (g.rank_name || "Newcomer") : "Newcomer";
    var icon = found ? (g.rank_icon || "🌱") : "🌱";
    var next = g.next_rank_name || null;
    var need = Number(g.clovers_to_next || 0);
    var total = life + need;
    var pct = total > 0 ? Math.min(100, Math.round(life / total * 100)) : 0;
    var kickoffNote = (life > 0)
      ? '<p class="tag" style="margin-top:-6px;opacity:.95;">You\'re off the line with a head start. Now see if you can climb. Kind rivalry only. ☘️</p>'
      : '<p class="tag" style="margin-top:-6px;opacity:.95;">Show up, pitch in, collect Clovers. Cheer your krewe, then try to catch them.</p>';
    return '<div class="hub-craic">' +
      '<div class="tag">☘ Our kindly competitive game of showing up</div>' +
      '<h2>This is the Craic Cup</h2>' +
      kickoffNote +
      '<div class="hub-craic-grid">' +
      '<div class="rank-big">' + esc(icon) + '</div>' +
      '<div><div style="font-size:17px;opacity:.9;">Right now you\'re a</div>' +
      '<div style="font-family:var(--display);font-size:24px;margin:2px 0 6px;">' + esc(icon) + ' ' + esc(rank) + '</div>' +
      '<div class="clovers">' + life + ' 🍀</div>' +
      '<div class="meta">This season: <b>' + season + '</b>' +
      (next ? (' · <b>' + need + '</b> Clovers to ' + esc(next)) : ' · you\'re at the top of the ladder!') + '</div>' +
      (next ? ('<div class="prog"><i style="width:' + pct + '%"></i></div>') : '') +
      '</div></div>' +
      nextQuestHtml() +
      '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">' +
      '<button type="button" class="btn" id="hubClaimClovers" style="background:#f0d78c;color:#14532d;border:0;font-weight:700;">Claim Clovers</button>' +
      '<button type="button" class="btn" id="hubOpenCraic" style="background:transparent;border:1px solid rgba(240,215,140,.55);color:#f6efdc;">See the standings →</button></div>' +
      '</div>';
  }

  function questDateChip(iso) {
    if (!iso) return "Soon";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }

  function nextQuestHtml() {
    var list = (state.nextEvents && state.nextEvents.length) ? state.nextEvents : (state.nextEvent ? [state.nextEvent] : []);
    var head = '<div class="hub-quest"><div class="hub-quest-head"><b>Next Easy Win</b><span>Shamrock-hosted events · +5 Clovers for RSVP</span></div>';
    if (!list.length) {
      return head +
        '<div class="hub-quest-empty"><div><b>You\'re caught up</b><div style="font-size:16px;opacity:.95;margin-top:2px;">Clovers await at the next Shamrock event</div></div>' +
        '<a class="btn" href="event-signup.html">Browse calendar</a></div></div>';
    }
    var cards = list.slice(0, 4).map(function (ev) {
      var loc = memberEventWhereHtml(ev);
      var href = 'event-signup.html?event=' + encodeURIComponent(ev.id || '');
      return '<div class="hub-quest-card">' +
        '<span class="date">' + esc(questDateChip(ev.start_time)) + '</span>' +
        '<div class="title">' + esc(ev.name || 'Krewe event') + '</div>' +
        loc +
        '<div class="hint">+5 Clovers for RSVP</div>' +
        '<a class="btn" href="' + href + '">RSVP</a>' +
        '</div>';
    }).join('');
    return head + '<div class="hub-quest-grid">' + cards + '</div></div>';
  }

  /* ---- Krewe Tidings (all-krewe announcements, member view) ---- */
  // The email HTML is reduced to plain paragraphs so the card renders safely
  // and consistently; the first paragraph gets the illuminated drop capital
  // (.dropcap in krewe.css, Cinzel Decorative) from the heritage pages.
  function annParagraphs(html) {
    var t = String(html || "")
      .replace(/<\s*(?:br|\/p|\/div|\/h[1-6]|\/li)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ");
    var ta = document.createElement("textarea");
    ta.innerHTML = t;
    t = ta.value;
    return t.split(/\n+/).map(function (p) {
      return p.replace(/\s+/g, " ").trim();
    }).filter(Boolean);
  }

  function annDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
  }

  function annPlain(html) {
    var paras = annParagraphs(html);
    return paras.join(" ") || "(No message text.)";
  }

  function annId(m, i) {
    if (m && m.id != null && String(m.id) !== "") return String(m.id);
    return "i" + i + "-" + String((m && m.created_at) || "");
  }

  function annMeta(m) {
    return esc(annDate(m && m.created_at)) +
      (m && m.sender_name ? (" · from " + esc(m.sender_name)) : "");
  }

  function annPreviewHtml(m, i) {
    return '<p class="hub-board-preview">' + esc(annPlain(m && m.body_html)) + "</p>" +
      '<button type="button" class="hub-board-more" data-ann-id="' + esc(annId(m, i)) + '">Read more</button>';
  }

  function findAnnouncement(id) {
    var key = String(id || "");
    if (!key) return null;
    var pools = [state.announcements || [], boardArchive.list || []];
    var p, i, m;
    for (p = 0; p < pools.length; p++) {
      for (i = 0; i < pools[p].length; i++) {
        m = pools[p][i];
        if (!m) continue;
        if (annId(m, i) === key || String(m.id || "") === key) return m;
      }
    }
    return null;
  }

  function announcementScreenHtml(m) {
    if (!m) {
      return '<div class="app-detail" id="appAnn"><h2>Krewe Tidings</h2><p>That announcement is not available.</p></div>';
    }
    var paras = annParagraphs(m.body_html);
    if (!paras.length) paras = ["(No message text.)"];
    var body = paras.map(function (p, i) {
      return "<p" + (i === 0 ? ' class="dropcap"' : "") + ">" + esc(p) + "</p>";
    }).join("");
    return '<article class="app-detail" id="appAnn">' +
      '<p class="app-detail-kicker">From the officers</p>' +
      '<div class="app-ann"><h2>' + esc(m.subject || "Announcement") + "</h2>" +
      '<p class="app-ann-meta">' + annMeta(m) + "</p>" +
      body + "</div></article>";
  }

  function tidingsSkeletonHtml() {
    return '<section class="hub-board hub-board-skel" aria-hidden="true" aria-label="Announcements from the board">' +
      '<p class="app-from">From the officers</p>' +
      "<h3>📜 Krewe Tidings</h3>" +
      '<div class="hub-board-rule"></div>' +
      '<div class="hub-board-date">News from the Board</div>' +
      '<div class="skel-line"></div><div class="skel-line"></div><div class="skel-line skel-short"></div>' +
      "</section>";
  }

  function boardAnnouncementsHtml() {
    var list = state.announcements || [];
    if (!list.length) return state.tidingsReady ? "" : tidingsSkeletonHtml();
    var latest = list[0];
    var older = list.slice(1).map(function (m, i) {
      return '<details class="hub-board-old"><summary>' + esc(m.subject || "Announcement") +
        ' <span class="hub-board-date">' + esc(annDate(m.created_at)) + "</span></summary>" +
        '<div class="hub-board-date">' + annMeta(m) + "</div>" +
        annPreviewHtml(m, i + 1) + "</details>";
    }).join("");
    return '<section class="hub-board" aria-label="Announcements from the board">' +
      '<p class="app-from">From the officers</p>' +
      "<h3>📜 Krewe Tidings</h3>" +
      '<div class="hub-board-rule"></div>' +
      '<div class="hub-board-date">News from the Board</div>' +
      '<article class="hub-board-feature" id="hubBoardLatest">' +
      "<h4>" + esc(latest.subject || "Announcement") + "</h4>" +
      '<div class="hub-board-date">' + annMeta(latest) + "</div>" +
      annPreviewHtml(latest, 0) +
      "</article>" + older +
      '<div class="hub-board-archive-wrap">' +
      (boardArchive.open
        ? '<div id="hubBoardArchive" aria-live="polite">' + boardArchiveInnerHtml() + "</div>"
        : '<button type="button" class="btn" id="hubBoardArchiveBtn">📜 See all announcements</button>' +
          '<div id="hubBoardArchive" hidden aria-live="polite"></div>') +
      "</div></section>";
  }

  /* Full archive of all-krewe announcements: every message officers email to
     the membership also lives here, so nothing is lost to the inbox. Loaded
     on demand (up to 100 via list_board_announcements); if the archive call
     fails we fall back to the announcements already on hand. State lives
     outside the card so background Home re-renders keep the archive open. */
  var boardArchive = { open: false, loading: false, list: null, fellBack: false };
  /* Playwright injects announcements before the live hub load finishes.
     That load must not wipe the fixture, or Read more and the archive
     look up an empty list. */
  var announcementFixture = false;

  function boardArchiveListHtml(list) {
    return list.map(function (m, i) {
      return '<article class="hub-board-item">' +
        "<h4>" + esc(m.subject || "Announcement") + "</h4>" +
        '<div class="hub-board-date">' + annMeta(m) + "</div>" +
        annPreviewHtml(m, i) + "</article>";
    }).join("");
  }

  function boardArchiveInnerHtml() {
    if (boardArchive.loading) return '<p class="empty">Loading the announcement archive…</p>';
    var list = boardArchive.list || [];
    if (!list.length) return '<p class="empty">No announcements yet.</p>';
    return '<h4 style="margin-top:14px;">Every announcement (' + list.length + ")</h4>" +
      boardArchiveListHtml(list) +
      (boardArchive.fellBack
        ? '<p class="empty">Showing the announcements already loaded. The full archive needs a connection. Try again in a moment.</p>'
        : "");
  }

  function paintBoardArchive() {
    var box = document.getElementById("hubBoardArchive");
    var btn = document.getElementById("hubBoardArchiveBtn");
    if (btn) btn.hidden = boardArchive.open;
    if (!box) return;
    box.hidden = !boardArchive.open;
    box.innerHTML = boardArchive.open ? boardArchiveInnerHtml() : "";
  }

  async function loadBoardArchive() {
    boardArchive.open = true;
    boardArchive.loading = true;
    paintBoardArchive();
    var list = null;
    var client = window.__kosSb || null;
    if (client && !announcementFixture) {
      try {
        var res = await client.rpc("list_board_announcements", { p_limit: 100 });
        var data = (res && res.data) || {};
        if (!res.error && data.ok && Array.isArray(data.messages) && data.messages.length) list = data.messages;
      } catch (e) { /* fall back below */ }
    }
    boardArchive.fellBack = !list;
    boardArchive.list = list || state.announcements || [];
    boardArchive.loading = false;
    paintBoardArchive();
  }

  function isHubStandalone() {
    try {
      if (window.navigator && window.navigator.standalone) return true;
      return !!(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    } catch (e) {
      return false;
    }
  }

  function getAppDismissed() {
    try { return localStorage.getItem("kosHubGetAppDismissed") === "1"; } catch (e) { return false; }
  }

  /* Wide browsers use the computer Hub. Phones, and the home-screen app at
     any width, keep the phone shell. 960px keeps a sideways phone on the
     app and treats a landscape tablet as a computer. */
  var HUB_DESKTOP_MQ = "(min-width: 960px)";

  function wantsHubApp() {
    if (isHubStandalone()) return true;
    try {
      return !(window.matchMedia && window.matchMedia(HUB_DESKTOP_MQ).matches);
    } catch (e) {
      return false;
    }
  }

  function getAppBannerHtml() {
    if (!document.body.classList.contains("hub-app")) return "";
    if (isHubStandalone() || getAppDismissed()) return "";
    return '<section class="app-getapp" id="hubGetAppBanner">' +
      '<button type="button" class="app-getapp-open" data-app-go="get-app">' +
      '<span class="app-getapp-ic" aria-hidden="true">' + APP_ICO.phone + "</span>" +
      '<span class="app-getapp-copy"><b>Get the mobile app</b>' +
      "<span>Add Shamrock to your home screen.</span></span>" +
      '<span class="app-getapp-go">Open</span></button>' +
      '<button type="button" class="app-getapp-x" id="hubGetAppDismiss" data-app-go="dismiss-get-app" aria-label="Dismiss Get the mobile app">' +
      svgIcon('<path d="M6 6 18 18M18 6 6 18"/>') + "</button></section>";
  }

  /* Little Celtic line icons for the Quick links tiles. Stroke-only SVGs in
     currentColor so the disc can invert to green-on-gold on hover. */
  var QK_ICONS = {
    // Trinity knot (three interlaced rings) - the krewe, together.
    trinity: '<circle cx="12" cy="8.6" r="4.6"/><circle cx="8.2" cy="15.2" r="4.6"/><circle cx="15.8" cy="15.2" r="4.6"/>',
    // Irish harp - music, gatherings, events.
    harp: '<path d="M6.5 3.5c7.2.3 11 4.5 11 11.2v5.8"/><path d="M6.5 3.5v17"/><path d="M6.5 20.5h11"/><path d="M9.6 8.2v12.3"/><path d="M12.6 10.4v10.1"/><path d="M15 13.2v7.3"/>',
    // Celtic shield - Parade Ready, waiver, dues: your standing, protected.
    shield: '<path d="M12 3l7 2.8v5.4c0 4.9-2.9 8-7 9.8-4.1-1.8-7-4.9-7-9.8V5.8Z"/><path d="M12 7.5v7"/><path d="M8.5 11h7"/>',
    // Chalice - the Craic Cup itself.
    chalice: '<path d="M7 4h10v3.5a5 5 0 0 1-10 0Z"/><path d="M7 5H4.5a3.2 3.2 0 0 0 3.1 3.8"/><path d="M17 5h2.5a3.2 3.2 0 0 1-3.1 3.8"/><path d="M12 12.5V17"/><path d="M8 20h8"/><path d="M9.5 17h5"/>',
    // Celtic high cross - the official governing documents.
    cross: '<circle cx="12" cy="9.5" r="4.2"/><path d="M12 3v18"/><path d="M5.5 9.5h13"/><path d="M9 20.5h6"/>',
    // Quill - officers writing the calendar.
    quill: '<path d="M19.5 4.5c-5.5.2-9.6 3-11.6 8.2L6.2 17l4.2-1.7c5.2-2 8-6.1 8.2-11.6Z"/><path d="M5 19.5 12.5 12"/>',
    // Triskele (triple spiral) - creativity in motion: Share your media.
    triskele: '<path d="M12 12c0-3.6 2.7-6.3 6.1-6.3"/><path d="M12 12c3.1 1.8 3.8 5.5 2 8.4"/><path d="M12 12c-3.1 1.8-6.4.8-8.1-2.1"/><circle cx="12" cy="12" r="1.7"/>',
    // Shamrock for the card heading.
    shamrock: '<circle cx="12" cy="7.4" r="3.2"/><circle cx="7.9" cy="12.8" r="3.2"/><circle cx="16.1" cy="12.8" r="3.2"/><path d="M12 13c.3 3.2-.5 5.6-2.6 7.5"/>',
    // Open book - the member FAQ.
    book: '<path d="M5 5.2h6.2A2.8 2.8 0 0 1 14 8v11a2.4 2.4 0 0 0-2.2-1.2H5Z"/><path d="M19 5.2h-6.2A2.8 2.8 0 0 0 10 8v11a2.4 2.4 0 0 1 2.2-1.2H19Z"/>'
  };

  function qkIcon(name) {
    return '<span class="qk-ic" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (QK_ICONS[name] || QK_ICONS.shamrock) +
      "</svg></span>";
  }

  /* ---- Today's birthdays -------------------------------------------------
     Signed-in members call list_todays_birthdays(), which reads
     members.birthday (no extra month/day column) and keeps rows whose
     EXTRACT(month) and EXTRACT(day) match today in America/New_York.
     The function returns first and last name only — never the year,
     email, or phone. Current members: not merged away, and active /
     pending-renewal / pending-new. The same rules live in birthdaysToday()
     so tests can stub a day without the database. */
  var CURRENT_MEMBER_STATUSES = { active: true, "pending-renewal": true, "pending-new": true };
  var birthdayFixture = false;

  /* Melissa's five Shamrock birthday cards. The same picture shows for
     everyone on a given America/New_York date: day-of-year modulo five. */
  var BIRTHDAY_ART = [
    "/assets/img/hub/birthday/leprechaun-in-cake.jpg",
    "/assets/img/hub/birthday/felt-leprechaun-cake.jpg",
    "/assets/img/hub/birthday/lego-white-cake.jpg",
    "/assets/img/hub/birthday/happy-birthday-topper.jpg",
    "/assets/img/hub/birthday/lego-green-cake.jpg"
  ];

  function nyCalendar(now) {
    var year = 0;
    var month = 0;
    var day = 0;
    try {
      var fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "numeric",
        day: "numeric"
      });
      fmt.formatToParts(now || new Date()).forEach(function (p) {
        if (p.type === "year") year = Number(p.value);
        if (p.type === "month") month = Number(p.value);
        if (p.type === "day") day = Number(p.value);
      });
    } catch (e) { /* fall through */ }
    if (year && month && day) return { year: year, month: month, day: day };
    var d = now || new Date();
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function nyTodayParts(now) {
    var c = nyCalendar(now);
    return { month: c.month, day: c.day };
  }

  function birthdayArtIndex(today) {
    var cal = nyCalendar();
    var year = (today && today.year) || cal.year;
    var month = (today && today.month) || cal.month;
    var day = (today && today.day) || cal.day;
    var doy = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000);
    var n = BIRTHDAY_ART.length;
    return ((doy % n) + n) % n;
  }

  function birthdayArtSrc(today) {
    return BIRTHDAY_ART[birthdayArtIndex(today)];
  }

  function birthdayParts(value) {
    var s = String(value == null ? "" : value).slice(0, 10);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { month: month, day: day };
  }

  function isCurrentKreweMember(row) {
    if (!row || row.merged_into) return false;
    var st = String(row.membership_status || "").toLowerCase();
    return !!CURRENT_MEMBER_STATUSES[st];
  }

  function birthdayDisplayNames(rows) {
    var people = [];
    (rows || []).forEach(function (r) {
      var first = String((r && r.first_name) || "").replace(/\s+/g, " ").trim();
      var last = String((r && r.last_name) || "").replace(/\s+/g, " ").trim();
      if (!first && !last) return;
      people.push({ first: first, last: last });
    });
    var counts = {};
    people.forEach(function (p) {
      var k = p.first.toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    });
    var initialCounts = {};
    people.forEach(function (p) {
      if (!p.first || (counts[p.first.toLowerCase()] || 0) < 2) return;
      var ik = p.first.toLowerCase() + "\0" + p.last.charAt(0).toLocaleUpperCase();
      initialCounts[ik] = (initialCounts[ik] || 0) + 1;
    });
    var names = people.map(function (p) {
      if (!p.first) return p.last;
      if ((counts[p.first.toLowerCase()] || 0) < 2) return p.first;
      if (!p.last) return p.first;
      var ik = p.first.toLowerCase() + "\0" + p.last.charAt(0).toLocaleUpperCase();
      if ((initialCounts[ik] || 0) < 2) return p.first + " " + p.last.charAt(0).toLocaleUpperCase() + ".";
      return p.first + " " + p.last;
    });
    names.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: "base" }); });
    return names;
  }

  function birthdaysToday(rows, today) {
    var t = today || nyTodayParts();
    var matches = (rows || []).filter(function (r) {
      if (!isCurrentKreweMember(r)) return false;
      var parts = birthdayParts(r.birthday);
      return !!(parts && parts.month === t.month && parts.day === t.day);
    });
    return birthdayDisplayNames(matches);
  }

  function birthdayCardHtml() {
    var names = state.birthdays || [];
    if (!names.length) return "";
    var today = state.birthdayToday || nyTodayParts();
    var monthName = MONTH_NAMES[today.month - 1] || "";
    var when = monthName ? (monthName + " " + today.day) : "";
    var one = names.length === 1;
    var lead = one ? ("Happy Birthday, " + names[0] + "!") : "Happy Birthday!";
    var sub = one
      ? "The krewe raises a glass to you."
      : "The krewe raises a glass to today's celebrants.";
    var chips = names.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("");
    var art = birthdayArtSrc(today);
    return '<section class="hub-birthday" id="hubBirthdayCard" aria-label="Happy Birthday">' +
      '<img class="hub-birthday-art" src="' + esc(art) + '" alt="Shamrock birthday card" width="960" height="723" />' +
      '<div class="hub-birthday-copy">' +
      "<h3>🎂 " + esc(lead) + "</h3>" +
      '<div class="hub-birthday-rule"></div>' +
      (when ? '<p class="hub-birthday-when">' + esc(when) + "</p>" : "") +
      "<p>" + esc(sub) + "</p>" +
      (one ? "" : '<ul class="hub-birthday-names">' + chips + "</ul>") +
      "</div></section>";
  }

  window.__kosBirthdaysToday = birthdaysToday;
  window.__kosNyTodayParts = nyTodayParts;
  window.__kosBirthdayArtSrc = birthdayArtSrc;

  function timeGreeting() {
    var h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }

  function memberInitials() {
    var p = window.kosProfile || {};
    var a = String(p.first_name || "").trim().charAt(0);
    var b = String(p.last_name || "").trim().charAt(0);
    var both = (a + b).toUpperCase();
    if (both.trim()) return both;
    var dn = String(p.display_name || "").trim();
    if (!dn) return "☘";
    var parts = dn.split(/\s+/);
    var ini = ((parts[0] || "").charAt(0) + (parts[1] || "").charAt(0)).toUpperCase();
    return ini.trim() ? ini : "☘";
  }

  function currentHubTab() {
    var on = document.querySelector("[data-hub-panel].hub-on");
    return (on && on.getAttribute("data-hub-panel")) || "hub";
  }

  function latestAnnKey() {
    var latest = (state.announcements || [])[0];
    if (!latest) return "";
    return String(latest.id || latest.subject || latest.created_at || "note");
  }

  function paintAppHeader(tab) {
    tab = tab || currentHubTab();
    var greet = document.getElementById("appGreet");
    var title = document.getElementById("appPageTitle");
    var av = document.getElementById("appAv");
    if (greet) greet.textContent = timeGreeting();
    if (title) title.textContent = TAB_TITLES[tab] || "Home";
    if (av) {
      var p = window.kosProfile || {};
      if (p.photo_url) av.innerHTML = '<img src="' + esc(p.photo_url) + '" alt="" />';
      else av.textContent = memberInitials();
    }
    var dot = document.getElementById("appBellDot");
    var key = latestAnnKey();
    var seen = "";
    try { seen = sessionStorage.getItem("kosBellSeen") || ""; } catch (e) {}
    if (dot) dot.hidden = !(key && key !== seen);
    var badge = document.getElementById("appOfficerBadge");
    if (badge) {
      var n = state.canReviewApplications ? (Number(state.applicationCount) || 0) : 0;
      badge.hidden = !(n > 0);
      badge.textContent = n > 9 ? "9+" : String(n);
    }
  }

  function closeBell() {
    var panel = document.getElementById("appBellPanel");
    if (panel) panel.hidden = true;
  }

  function toggleBell() {
    var panel = document.getElementById("appBellPanel");
    if (!panel) return;
    if (!panel.hidden) { closeBell(); return; }
    var key = latestAnnKey();
    try { if (key) sessionStorage.setItem("kosBellSeen", key); } catch (e) {}
    var dot = document.getElementById("appBellDot");
    if (dot) dot.hidden = true;
    var list = state.announcements || [];
    panel.innerHTML = list.length
      ? '<p class="app-bell-kicker">From the officers</p>' + list.map(function (m, i) {
        return '<button type="button" data-app-note="' + i + '">' + esc(m.subject || "Announcement") + "</button>";
      }).join("")
      : '<p class="app-bell-empty">No new notes from the officers.</p>';
    panel.hidden = false;
    panel.querySelectorAll("[data-app-note]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeBell();
        showTab("hub", { skipScroll: true });
        setTimeout(function () {
          var board = document.querySelector(".hub-board");
          if (board) focusHubTarget(board);
        }, 60);
      });
    });
  }

  function closeSheet() {
    var sheet = document.getElementById("appSheet");
    if (sheet) sheet.hidden = true;
  }

  function openSheet(html) {
    var body = document.getElementById("appSheetBody");
    var sheet = document.getElementById("appSheet");
    if (!body || !sheet) return;
    body.innerHTML = html;
    sheet.hidden = false;
  }

  var toastTimer = null;
  function showToast(text) {
    var el = document.getElementById("appToast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3400);
  }

  function plainStanding() {
    var st = (state.membershipStatus || "").toString();
    var me = state.parade;
    if (profileDuesExempt()) {
      if (/unpaid|delinquent|lapsed|owing|past/.test(st.toLowerCase())) return "Dues need attention";
      if (/good|active|current|paid/.test(st.toLowerCase()) || (me && me.dues_paid === true)) return "Good standing";
      if (st) return st;
      return "Standing updates after your roster record loads";
    }
    if (me && me.dues_paid === true) return "Good standing";
    if (me && me.dues_paid === false) return "Dues need attention";
    if (/unpaid|delinquent|lapsed|owing|past/.test(st.toLowerCase())) return "Dues need attention";
    if (/good|active|current|paid/.test(st.toLowerCase())) return "Good standing";
    if (st) return st;
    return "Standing updates after your roster record loads";
  }

  function plainParadeReady() {
    var me = state.parade;
    if (!me) return "Parade Ready status loads with your roster record";
    return (duesGateMet(me) && me.waiver_signed && me.meeting_attended) ? "Parade Ready" : "Not parade ready yet";
  }

  function openMemberCard() {
    var p = window.kosProfile || {};
    var name = (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Krewe member").toString().trim();
    var title = (p.officer_title || "").toString().trim();
    var since = (p.parade_since || "").toString().trim();
    var email = (p.email || "").toString().trim();
    openSheet(
      '<div class="app-pass">' +
      '<img src="assets/img/emblem-shamrock.png" alt="Krewe of Shamrock emblem" />' +
      '<p class="app-pass-kicker">Krewe of Shamrock</p>' +
      '<h2 id="appSheetTitle">' + esc(name) + "</h2>" +
      (title ? '<p class="app-pass-title">' + esc(title) + "</p>" : "") +
      (email ? "<p>" + esc(email) + "</p>" : "") +
      '<ul class="app-pass-facts"><li>' + esc(plainStanding()) + "</li><li>" + esc(plainParadeReady()) + "</li>" +
      (since ? "<li>Marching since " + esc(since) + "</li>" : "") +
      "</ul><p>Show this card at the float. It uses the profile and Parade Ready details already on your account.</p></div>"
    );
  }

  function openPayDues() {
    openSheet(
      '<div class="app-dues"><h2 id="appSheetTitle">Pay dues</h2>' +
      "<p>These links are membership dues. They are not the join application fee ($50 single or $75 couple).</p>" +
      "<p>Dues are collected on Zeffy. Choose the membership you are paying.</p>" +
      '<p><a class="btn btn-primary" href="' + DUES_FULL_URL + '" target="_blank" rel="noopener noreferrer">Pay full krewe dues</a></p>' +
      '<p><a class="btn" href="' + DUES_LOA_URL + '" target="_blank" rel="noopener noreferrer">Pay leave of absence</a></p></div>'
    );
  }

  function paradeHeroPhoto(name) {
    var n = String(name || "").toLowerCase();
    if (n.indexOf("children") !== -1) return "assets/img/parades/childrens-gasparilla.jpg";
    if (n.indexOf("pirate") !== -1 || n.indexOf("gasparilla") !== -1) return "assets/img/parades/gasparilla-pirates.jpg";
    if (n.indexOf("santa") !== -1) return "assets/img/parades/santafest.jpg";
    if (n.indexOf("pride") !== -1) return "assets/img/parades/tampa-pride.jpg";
    if (n.indexOf("knight") !== -1 || n.indexOf("yago") !== -1) return "assets/img/parades/santyago-knight.jpg";
    if (n.indexOf("patrick") !== -1) return "assets/img/parades/st-patricks.jpg";
    return "assets/img/gallery/krewe-parade-kilts.jpg";
  }

  function isParadeLike(ev) {
    if (!ev) return false;
    var t = String(ev.event_type || "").toLowerCase();
    if (t === "meeting") return false;
    if (t === "parade" || t === "march") return true;
    var n = String(ev.name || "").toLowerCase();
    return n.indexOf("parade") !== -1 || n.indexOf("march") !== -1;
  }

  function pickNextParade() {
    var rows = [];
    (state.paradeSeason || []).forEach(function (r) { if (r && r.start_time) rows.push(r); });
    (state.hubEvents || []).forEach(function (e) { if (isParadeLike(e) && e.start_time) rows.push(e); });
    var now = Date.now();
    var upcoming = rows.filter(function (r) {
      var t = new Date(r.start_time).getTime();
      return !isNaN(t) && t > now;
    }).sort(function (a, b) { return new Date(a.start_time) - new Date(b.start_time); });
    state.nextParade = upcoming[0] || null;
    return state.nextParade;
  }

  var countdownTimer = null;
  function paintCountdown() {
    var days = document.getElementById("appCdDays");
    if (!days || !state.nextParade || !state.nextParade.start_time) return;
    var ms = new Date(state.nextParade.start_time).getTime() - Date.now();
    if (isNaN(ms) || ms < 0) ms = 0;
    var sec = Math.floor(ms / 1000);
    var d = Math.floor(sec / 86400);
    sec -= d * 86400;
    var h = Math.floor(sec / 3600);
    sec -= h * 3600;
    var m = Math.floor(sec / 60);
    sec -= m * 60;
    days.textContent = String(d);
    var he = document.getElementById("appCdHours");
    var mi = document.getElementById("appCdMin");
    var se = document.getElementById("appCdSec");
    if (he) he.textContent = String(h).padStart(2, "0");
    if (mi) mi.textContent = String(m).padStart(2, "0");
    if (se) se.textContent = String(sec).padStart(2, "0");
  }

  function startCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    paintCountdown();
    if (state.nextParade && state.nextParade.start_time) countdownTimer = setInterval(paintCountdown, 1000);
  }

  function appEventBits(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return {
      month: d.toLocaleDateString([], { month: "short" }).toUpperCase(),
      day: String(d.getDate()),
      line: d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + " · " +
        d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    };
  }

  function appTile(go, label, icon, soon) {
    return '<button type="button" class="app-tile' + (soon ? " is-soon" : "") + '" data-app-go="' + go + '">' +
      '<span class="app-tile-ic" aria-hidden="true">' + icon + "</span>" +
      '<span class="app-tile-lb">' + label + "</span>" +
      (soon ? '<span class="app-tile-soon">Coming soon</span>' : "") +
      "</button>";
  }

  function appDashHtml() {
    var parade = pickNextParade();
    var photo = paradeHeroPhoto(parade && parade.name);
    var title = parade && parade.name ? parade.name : "Next Shamrock parade";
    var count = parade
      ? '<div class="app-count" id="appCount">' +
        '<div><strong id="appCdDays">0</strong><small>Days</small></div>' +
        '<div><strong id="appCdHours">00</strong><small>Hours</small></div>' +
        '<div><strong id="appCdMin">00</strong><small>Min</small></div>' +
        '<div><strong id="appCdSec">00</strong><small>Sec</small></div></div>'
      : '<p class="app-hero-wait">Next parade date is not on the calendar yet.</p>';
    var where = (parade && (parade.member_address || parade.location))
      ? '<p class="app-hero-where">' + esc(parade.member_address || parade.location) + "</p>"
      : "";
    var ev = state.nextEvent;
    var next;
    if (!ev) {
      next = '<p class="app-next-empty">No upcoming published events yet.</p>';
    } else {
      var bits = appEventBits(ev.start_time) || { month: "TBD", day: "", line: "Date to be announced" };
      var loc = ev.member_address || ev.location || "";
      next = '<article class="app-event" data-app-event="' + esc(ev.id || "") + '">' +
        '<div class="app-date"><b>' + esc(bits.month) + "</b><span>" + esc(bits.day) + "</span></div>" +
        '<div class="app-event-copy"><h3>' + esc(ev.name || "Krewe event") + "</h3><p>" + esc(bits.line) + "</p>" +
        (loc ? '<p class="app-event-loc">' + esc(loc) + "</p>" : "") +
        '</div><button type="button" class="app-rsvp" data-app-event="' + esc(ev.id || "") + '">RSVP</button></article>';
    }
    return '<div id="appDash">' +
      getAppBannerHtml() +
      '<section class="app-hero" style="background-image:url(\'' + photo + '\')">' +
      '<p class="kicker">Countdown to the parade</p><h2>' + esc(title) + "</h2>" + where + count +
      "</section>" +
      '<div class="app-tiles" aria-label="Member shortcuts">' +
      appTile("card", "Member Card", APP_ICO.card) +
      appTile("events", "RSVP", APP_ICO.cal) +
      (profileDuesExempt() ? "" : appTile("dues", "Pay Dues", APP_ICO.dues)) +
      appTile("chat", "Chat", APP_ICO.chat, true) +
      appTile("carpool", "Carpool", APP_ICO.car) +
      appTile("volunteer", "Volunteer", APP_ICO.heart) +
      appTile("shop", "Shop", APP_ICO.bag) +
      appTile("photos", "Photos", APP_ICO.camera) +
      "</div>" +
      '<section class="app-next" id="appNextUp" aria-label="Next up">' +
      '<div class="app-next-head"><h2>Next up</h2>' +
      '<button type="button" data-app-go="events">All events</button></div>' +
      next + "</section></div>";
  }

  function paintGetAppScreen() {
    if (typeof window.__kosPaintGetApp === "function") window.__kosPaintGetApp();
  }

  function promptHubInstall() {
    var api = window.KOS_HUB_INSTALL;
    var btn = document.getElementById("appInstallBtn");
    if (!api || typeof api.prompt !== "function") {
      paintGetAppScreen();
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Installing..."; }
    api.prompt().then(function () { paintGetAppScreen(); });
  }

  function copyText(url, done) {
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      ta.remove();
      done();
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(url).then(done).catch(fallback);
      return;
    }
    fallback();
  }

  function copyDeskAppLink() {
    copyText(DESK_APP_URL, function () {
      var btn = document.getElementById("hubDeskAppCopy");
      if (btn) btn.textContent = "Link copied";
      showToast("Link copied. Text it to your phone.");
    });
  }

  function copyHubLink() {
    var api = window.KOS_HUB_INSTALL;
    var url = (api && api.hubUrl) || "https://kreweofshamrock.com/members.html";
    function done() {
      var btn = document.getElementById("appCopyLink");
      if (btn) btn.textContent = "Link copied";
      showToast("Link copied. Paste it into Safari or Chrome.");
    }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) {}
      ta.remove();
      done();
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(url).then(done).catch(fallback);
      return;
    }
    fallback();
  }

  function handleAppGo(go) {
    if (go === "events") { appNavApi.openTab("events"); return; }
    if (go === "parade" || go === "desk") { appNavApi.openTab("parade"); return; }
    if (go === "fun") { appNavApi.openFun(); return; }
    if (go === "docs") { revealDocsCard(); return; }
    if (go === "faq") { openMemberFaq(""); return; }
    if (go === "directory") { openDirectoryFromHome(); return; }
    if (go === "card") { appNavApi.openCard(); return; }
    if (go === "dues") { openPayDues(); return; }
    if (go === "chat") {
      showToast("Chat is coming soon. Members still gather in the krewe Facebook group.");
      return;
    }
    if (go === "carpool") { appNavApi.openFocus("parade", "carpoolCard", "Carpool"); return; }
    if (go === "volunteer") { appNavApi.openFocus("parade", "hubHoursCard", "Volunteer hours"); return; }
    if (go === "shop") { location.href = "store.html"; return; }
    if (go === "photos") { location.href = "gallery.html"; return; }
    if (go === "get-app") {
      if (appNavApi.openGetApp) appNavApi.openGetApp();
      return;
    }
    if (go === "dismiss-get-app") {
      try { localStorage.setItem("kosHubGetAppDismissed", "1"); } catch (e) {}
      var banner = document.getElementById("hubGetAppBanner");
      if (banner) banner.remove();
      if (document.getElementById("hubDeskAppCard")) {
        try { renderHome(); } catch (e2) {}
      }
      return;
    }
    if (go === "prompt-install") { promptHubInstall(); return; }
    if (go === "copy-hub-link") { copyHubLink(); return; }
    if (go === "copy-desk-app-link") { copyDeskAppLink(); return; }
    if (go === "tune") {
      var music = document.getElementById("kreweMusicBtn");
      if (music) music.click();
      showToast("The Irish tune is playing. Open Me and tap again to pause it.");
      return;
    }
    if (go === "signout" && window.kosSignOut) window.kosSignOut();
  }

  var appChromeBound = false;
  function bindAppChrome() {
    if (appChromeBound) return;
    var root = document.getElementById("hubRoot");
    if (!root) return;
    appChromeBound = true;
    root.addEventListener("click", function (ev) {
      var annBtn = ev.target && ev.target.closest ? ev.target.closest("[data-ann-id]") : null;
      if (annBtn && root.contains(annBtn)) {
        ev.preventDefault();
        if (appNavApi.openAnnouncement) appNavApi.openAnnouncement(annBtn.getAttribute("data-ann-id"));
        return;
      }
      var hit = ev.target && ev.target.closest ? ev.target.closest("[data-app-event]") : null;
      if (hit && root.contains(hit)) {
        var eventId = hit.getAttribute("data-app-event");
        if (eventId) {
          ev.preventDefault();
          appNavApi.openEvent(eventId);
          return;
        }
      }
      var go = ev.target && ev.target.closest ? ev.target.closest("[data-app-go]") : null;
      if (!go || !root.contains(go)) return;
      ev.preventDefault();
      handleAppGo(go.getAttribute("data-app-go"));
    });
    var bell = document.getElementById("appBell");
    if (bell) bell.addEventListener("click", function (ev) {
      ev.stopPropagation();
      toggleBell();
    });
    var sheet = document.getElementById("appSheet");
    var closeBtn = document.getElementById("appSheetClose");
    if (closeBtn) closeBtn.addEventListener("click", closeSheet);
    if (sheet) sheet.addEventListener("click", function (ev) { if (ev.target === sheet) closeSheet(); });
    var sheetCard = sheet && sheet.querySelector(".app-sheet-card");
    if (sheetCard) {
      var touchY = 0;
      sheetCard.addEventListener("touchstart", function (ev) {
        touchY = ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0;
      }, { passive: true });
      sheetCard.addEventListener("touchend", function (ev) {
        var y = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0].clientY : touchY;
        if (y - touchY > 72) closeSheet();
      }, { passive: true });
    }
    var backBtn = document.getElementById("appBack");
    if (backBtn) backBtn.addEventListener("click", function () { appNavApi.back(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { closeSheet(); closeBell(); }
    });
    document.addEventListener("click", function (ev) {
      var panel = document.getElementById("appBellPanel");
      if (!panel || panel.hidden) return;
      if (ev.target && ev.target.closest && ev.target.closest("#appBell, #appBellPanel")) return;
      closeBell();
    });
  }

  function syncAppChrome() {
    var content = document.getElementById("memberContent");
    var signedIn = !!(content && content.style.display !== "none");
    var on = signedIn && wantsHubApp();
    document.body.classList.toggle("hub-app", on);
    document.body.classList.toggle("hub-desk", signedIn && !on);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", on ? "#0c3b21" : "#14532d");
    if (on) paintAppHeader(currentHubTab());
    if (signedIn && document.getElementById("hubHome") && !document.getElementById("hubWelcomeCard")) {
      try { renderHome(); } catch (e) {}
    }
  }

  var DESK_APP_URL = "https://kreweofshamrock.com/members.html#get-app";
  var DESK_APP_QR = "/assets/img/hub-install-qr.svg";

  /* Phone with a shamrock on the screen. Decorative; the heading names it. */
  var DESK_APP_PHONE = '<svg viewBox="0 0 48 48" aria-hidden="true">' +
    '<rect x="14" y="3" width="20" height="42" rx="3.5" fill="#14532d" stroke="#e2c15a" stroke-width="1.6"/>' +
    '<rect x="17.2" y="8" width="13.6" height="26" rx="1.4" fill="#fbf7ec"/>' +
    '<circle cx="24" cy="16.2" r="2.5" fill="#1d6b3e"/>' +
    '<circle cx="20.6" cy="20.4" r="2.5" fill="#1d6b3e"/>' +
    '<circle cx="27.4" cy="20.4" r="2.5" fill="#1d6b3e"/>' +
    '<path d="M24 21.6v5.2" stroke="#1d6b3e" stroke-width="1.4" stroke-linecap="round"/>' +
    '<path d="M21.2 39.2h5.6" stroke="#e2c15a" stroke-width="1.6" stroke-linecap="round"/>' +
    "</svg>";

  function desktopGetAppCardHtml() {
    if (wantsHubApp() || isHubStandalone() || getAppDismissed()) return "";
    return '<section class="hub-desk-app" id="hubDeskAppCard" aria-labelledby="hubDeskAppTitle">' +
      '<button type="button" class="hub-desk-app-x" id="hubDeskAppDismiss" data-app-go="dismiss-get-app" aria-label="Dismiss Get the mobile app">' +
      svgIcon('<path d="M6 6 18 18M18 6 6 18"/>') + "</button>" +
      '<div class="hub-desk-app-main">' +
      '<div class="hub-desk-app-head">' +
      '<span class="hub-desk-app-ic" aria-hidden="true">' + DESK_APP_PHONE + "</span>" +
      '<h3 id="hubDeskAppTitle">Get the Shamrock Hub mobile app</h3></div>' +
      '<div class="hub-desk-app-rule" aria-hidden="true"></div>' +
      "<p>It puts the Member Hub on your phone's home screen, like an app, for iPhone and Android.</p>" +
      "<p>It's free, and there's nothing to download from an app store.</p>" +
      "<p>You open it with one tap.</p>" +
      '<div class="hub-desk-app-actions">' +
      '<button type="button" class="btn btn-primary" id="hubGetAppLink" data-app-go="get-app">See how to install</button>' +
      '<span class="hub-desk-app-copyline">' +
      '<button type="button" class="btn" id="hubDeskAppCopy" data-app-go="copy-desk-app-link" data-hub-url="' + DESK_APP_URL + '">Copy link</button>' +
      '<a class="hub-desk-app-url" id="hubDeskAppUrl" href="' + DESK_APP_URL + '">kreweofshamrock.com/members.html#get-app</a>' +
      "</span></div></div>" +
      '<figure class="hub-desk-app-qr">' +
      '<img src="' + DESK_APP_QR + '" width="132" height="132" alt="QR code that opens the Member Hub" />' +
      "<figcaption>Scan with your phone's camera</figcaption>" +
      "</figure></section>";
  }

  function desktopGetAppQuickHtml() {
    if (wantsHubApp() || isHubStandalone() || !getAppDismissed()) return "";
    return '<button type="button" class="hub-desk-app-row" id="hubGetAppQuick" data-app-go="get-app">' +
      '<span class="qk-ic" aria-hidden="true">' + APP_ICO.phone + "</span>" +
      "<span>Get the mobile app</span></button>";
  }

  function applyFeedLock() {
    if (!feedLock) return;
    var feed = feedLock;
    if (feed.profile) window.kosProfile = Object.assign({}, window.kosProfile || {}, feed.profile);
    if (Array.isArray(feed.events)) {
      state.hubEvents = feed.events.slice();
      state.nextEvents = feed.events.slice(0, 4);
      state.nextEvent = state.nextEvents[0] || null;
      try { renderHubMemberEvents(state.hubEvents); } catch (e) {}
    }
    if (Array.isArray(feed.parades)) {
      try { renderHubParadeSeason(feed.parades); } catch (e2) {}
    }
    if (feed.paradeReady) state.parade = feed.paradeReady;
    if (feed.membershipStatus) state.membershipStatus = feed.membershipStatus;
    renderHome();
    try { syncSignedInPill(); } catch (e3) {}
    try { appNavApi.sync(); } catch (e4) {}
  }

  window.__kosHubSetFeed = function (feed) {
    feedLock = feed || {};
    applyFeedLock();
  };

  /* ---- Welcome hero: the home page opens with the member, not the game.
     Greeting, standing chips, and the season checklist up top; the Craic
     Cup keeps its own clearly-labeled card further down the stack. */
  function welcomeDeskHtml() {
    var me = state.parade;
    var needsProfile = !!(window.kosNeedsProfile);
    var bits = [];
    if (me) {
      if (!me.waiver_signed) bits.push("liability waiver");
      if (!me.dues_paid && !profileDuesExempt()) bits.push("dues");
      if (!me.meeting_attended) bits.push("mandatory meeting");
    }
    if ((state.hoursApproved || 0) < 1) bits.push("hours since July 1");
    if (needsProfile) bits.push("My Krewe profile");
    var ready = !!(me && duesGateMet(me) && me.waiver_signed && me.meeting_attended);
    var line = "Parade Ready, volunteer hours, media sharing, rides, and your locker - all on one desk.";
    if (ready && !needsProfile && (state.hoursApproved || 0) >= 1) {
      line = "You are set for the season. The desk still has your rides, locker, and media sharing.";
    } else if (bits.length) {
      line = "Still open: " + bits.join(", ") + ".";
    }
    var profileBtn = needsProfile
      ? '<button type="button" class="btn" id="hubOpenProfile" style="margin-top:8px;width:100%;">Complete My Krewe profile</button>'
      : '';
    return '<div class="hub-welcome" id="hubWelcomeCard">' +
      '<p class="hub-hello">☘ Fáilte, a chara - welcome, friend</p>' +
      '<h2>Welcome home, ' + esc(firstName() || 'friend') + '</h2>' +
      '<div class="hub-chips">' + standingChip() + paradeChip() + hoursChip() + '</div>' +
      '<p style="margin:0 0 12px;font-size:16px;color:var(--muted);line-height:1.4;">' + esc(line) + '</p>' +
      '<ul class="hub-status-list" aria-label="Season checklist">' +
      '<li><span class="mark" aria-hidden="true">1</span><span>Parade Ready: waiver and Photo Release</span></li>' +
      '<li><span class="mark" aria-hidden="true">2</span><span>My Krewe profile</span></li>' +
      '<li><span class="mark" aria-hidden="true">3</span><span>Total hours since July 1</span></li>' +
      (profileDuesExempt() ? "" :
        '<li id="hubDuesCheck"><span class="mark" aria-hidden="true">4</span><span>Pay membership dues <button type="button" class="btn" data-app-go="dues">Pay dues</button></span></li>') +
      '</ul>' +
      '<button type="button" class="btn btn-primary" data-hub-action="parade" style="width:100%;">Open Member desk</button>' +
      profileBtn +
      '</div>';
  }

  function renderHome() {
    var home = document.getElementById("hubHome");
    if (!home) return;
    var top = document.getElementById("hubHomeTop");
    if (!top) {
      top = document.createElement("div");
      top.id = "hubHomeTop";
      top.className = "hub-home-stack";
      home.insertBefore(top, home.firstChild);
    } else {
      top.className = "hub-home-stack";
    }
    if (!document.getElementById("hubHomeGrid")) {
      var grid = document.createElement("div");
      grid.className = "member-grid";
      grid.id = "hubHomeGrid";
      home.appendChild(grid);
    }
    var officerPulse = "";
    try {
      if (canOpenOfficerDesk() && sessionStorage.getItem("kosOfficerDeskSeen") !== "1") {
        officerPulse = " hub-officer-pulse";
      }
    } catch (pe) {}
    var hostHoursOnly = state.canReviewHours && !state.officer && !state.canManageEvents && !state.canReviewApplications;
    var officerCard = !canOpenOfficerDesk()
      ? ""
      : hostHoursOnly
      ? '<div class="hub-officer-card' + officerPulse + '" data-hub-action="officer" role="button" tabindex="0">' +
        '<div class="hub-officer-card-top">' +
        '<div class="ic" aria-hidden="true">✅</div>' +
        '<div class="copy"><b>Hour approvals</b><div class="sub">Confirm volunteer hours for events you host.</div></div>' +
        '<div class="go">Open →</div></div></div>'
      : '<div class="hub-officer-card' + officerPulse + '" data-hub-action="officer" role="button" tabindex="0">' +
        '<div class="hub-officer-card-top">' +
        '<div class="ic" aria-hidden="true">🎖️</div>' +
        '<div class="copy"><b>Officer desk</b><div class="sub">Events, approvals, money, and reports in one calm place.</div></div>' +
        '<div class="go">Open →</div></div>' +
        '<div class="hub-officer-inside-wrap">' +
        '<div style="font-family:var(--display);font-size:15px;margin:0 0 6px;color:#7a5b00;">What\'s inside</div>' +
        '<ul class="hub-officer-inside" aria-label="Officer desk tools">' +
        (state.canReviewApplications ? '<li>Membership Applications</li>' : '') +
        '<li>Event Studio and calendar</li>' +
        '<li>Approvals (hours, photos, videos, clovers)</li>' +
        '<li>Shop, member records, and money</li>' +
        '<li>Reports, QR tools, and messages</li>' +
        '</ul></div></div>';
    var appsBanner = state.canReviewApplications
      ? '<button type="button" class="hub-apps-banner" id="hubAppsHomeLink" data-hub-goto="applications">' +
        '<span class="ic" aria-hidden="true">📝</span>' +
        '<span class="copy"><b>' + esc(newApplicationLabel(state.applicationCount)) + '</b>' +
        '<span class="sub">Membership Applications on your Officer desk. Move an applicant through new, background check, and dues pending, or approve, decline, or archive.</span></span>' +
        '<span class="go">Open</span></button>'
      : "";
    function quickTile(goto, icon, title, sub) {
      return '<button type="button" class="hub-action" data-hub-goto="' + goto + '">' +
        qkIcon(icon) +
        '<span class="qk-copy"><b>' + title + "</b><span>" + sub + "</span></span>" +
        "</button>";
    }
    var findCards =
      '<div class="hub-find">' +
      '<h3>' + qkIcon("shamrock") + 'Quick links</h3>' +
      '<p class="hub-find-sub">Tap a tile to jump straight there.</p>' +
      desktopGetAppQuickHtml() +
      '<div class="hub-find-grid">' +
      quickTile("directory", "trinity", "My Krewe", "Your member directory - faces and profiles of the whole krewe.") +
      quickTile("events", "harp", "Events &amp; RSVPs", "See what's coming up and RSVP. Attendance feeds Parade Ready.") +
      quickTile("desk", "shield", "Member desk", "Parade Ready, volunteer hours, rides, your locker, and media sharing.") +
      quickTile("faq", "book", "Member FAQ", "Events, beads, volunteer hours, parades, and krewe gear.") +
      quickTile("share", "triskele", "Share your media", "Upload photos &amp; videos for the public site - an officer approves them - plus artwork, poems &amp; recipes.") +
      quickTile("fun", "chalice", "Craic Cup", "Claim clovers, check the leaderboard, and join the fun.") +
      '<div class="hub-action" id="docsHome" style="cursor:default">' +
      qkIcon("cross") +
      '<div class="qk-copy">' +
      '<b><a href="#docs">Documents</a></b>' +
      '<span>Governing documents for members and officers. Open bylaws and the Code of Conduct in-Hub.</span>' +
      hubDocsPillsHtml("margin-top:10px;") +
      '<p style="margin:10px 0 0;"><a href="#docs">All Documents</a></p>' +
      '<p style="margin:10px 0 0;"><button type="button" class="btn" data-hub-goto="docs">Open Documents card</button></p>' +
      "</div></div>" +
      ((state.officer || state.canManageEvents)
        ? quickTile("event-studio", "quill", "Add or edit events &amp; calendar", "Open Event Studio to change dates (Basket Social and more) without a developer.")
        : '') +
      '</div></div>';
    // Only refresh the welcome strip - never wipe the beautiful card grid below.
    // Computer: birthday, welcome, the mobile-app card, tidings, officer tools, the Cup, then links.
    // Phone: the app home (countdown and tiles) stays above that same desk.
    var phoneHome = document.body.classList.contains("hub-app");
    top.innerHTML =
      birthdayCardHtml() +
      (phoneHome ? appDashHtml() : "") +
      (phoneHome ? boardAnnouncementsHtml() : "") +
      welcomeDeskHtml() +
      (phoneHome ? "" : desktopGetAppCardHtml()) +
      (phoneHome ? "" : boardAnnouncementsHtml()) +
      appsBanner + officerCard + craicHeroHtml() + findCards;

    renderProfileCard();

    top.querySelectorAll("[data-hub-action]").forEach(function (btn) {
      btn.addEventListener("click", function () { appNavApi.openTab(btn.getAttribute("data-hub-action")); });
      btn.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          appNavApi.openTab(btn.getAttribute("data-hub-action"));
        }
      });
    });
    top.querySelectorAll("[data-hub-goto]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var go = btn.getAttribute("data-hub-goto");
        if (go === "directory") openDirectoryFromHome();
        else if (go === "applications") openApplicationsFromHome();
        else if (go === "event-studio") openEventStudioFromHome();
        else if (go === "docs") revealDocsCard();
        else if (go === "events") gotoHubTabFromHome("events", "events");
        else if (go === "desk") gotoHubTabFromHome("parade", "desk");
        else if (go === "share") revealShareGroup();
        else if (go === "faq") openMemberFaq("");
        else if (go === "fun") gotoHubTabFromHome("fun", "fun");
      });
    });
    var op = document.getElementById("hubOpenProfile");
    if (op) op.addEventListener("click", function () {
      if (window.kosOpenProfileStage) window.kosOpenProfileStage();
    });
    var archBtn = document.getElementById("hubBoardArchiveBtn");
    if (archBtn) archBtn.addEventListener("click", function () { loadBoardArchive(); });
    var openC = document.getElementById("hubOpenCraic");
    if (openC) openC.addEventListener("click", function () {
      if (typeof window.openGame === "function") window.openGame();
    });
    var claimBtn = document.getElementById("hubClaimClovers");
    if (claimBtn) claimBtn.addEventListener("click", function () {
      showTab("fun");
      setTimeout(function () {
        var el = document.getElementById("hubClaimCard");
        if (el) el.scrollIntoView({ behavior: "auto", block: "nearest" });
      }, 60);
    });
    paintAppHeader(currentHubTab());
    startCountdown();
  }

  window.__hubShowTab = showTab;
  window.showHubTab = showTab;
  window.kosRevealDocs = revealDocsCard;
  window.kosOpenFaq = openMemberFaq;
  window.kosOpenDirectory = openDirectoryFromHome;
  window.kosOpenEventStudio = openEventStudioFromHome;

  function focusHubTarget(el, focusEl) {
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "auto", block: "nearest" });
    if (!focusEl) return;
    try { focusEl.focus({ preventScroll: true }); } catch (fe) {
      try { focusEl.focus(); } catch (fe2) {}
    }
  }

  function gotoHubTabFromHome(tab) {
    appNavApi.openTab(tab);
  }

  function revealShareGroup() {
    appNavApi.openFocus("parade", "shareCard", "Share your media");
  }

  function revealDocsCard() {
    appNavApi.openFocus("parade", "docs", "Documents");
  }

  function openDirectoryFromHome() {
    appNavApi.openFocus("krewe", "hubMemberDirectory", "Directory");
  }

  function openApplicationsFromHome() {
    if (!state.canReviewApplications) return;
    try { sessionStorage.setItem("kosOfficerTool", "tool:hubApplications"); } catch (e2) {}
    appNavApi.openTab("officer");
    try { wireOfficerDeskPicker(); } catch (e3) {}
    try { renderApplicationsFromState(); } catch (e4) {}
    openOfficerTool("tool:hubApplications", true);
    setTimeout(function () {
      focusHubTarget(document.getElementById("hubApplications"));
    }, 80);
  }

  function openEventStudioFromHome() {
    if (!state.officer && !state.canManageEvents) return;
    appNavApi.openTab("officer");
    try { wireOfficerDeskPicker(); } catch (e) {}
    openOfficerTool("tool:hubEventStudio", true);
    setTimeout(function () {
      var card = document.getElementById("hubEventStudio");
      focusHubTarget(card, document.getElementById("hubEventName"));
    }, 80);
  }

  var roleFixture = null;

  /* Test fixture: inject announcements and re-render the Home tab, mirroring
     __kosHubSetRole below. Lets the offline Playwright suite exercise the
     Krewe Tidings card and its archive without a live database. */
  window.__kosHubSetAnnouncements = function (list) {
    announcementFixture = true;
    state.tidingsReady = true;
    state.announcements = Array.isArray(list) ? list : [];
    renderHome();
  };

  /* Test fixture: inject roster rows and an optional America/New_York
     {month, day} so the suite can celebrate a known day without the database.
     Only first names (plus a last initial or last name when needed) are kept. */
  window.__kosHubSetBirthdays = function (rows, today) {
    birthdayFixture = true;
    state.birthdaysReady = true;
    state.birthdayToday = today && today.month && today.day ? { month: Number(today.month), day: Number(today.day) } : null;
    state.birthdays = birthdaysToday(rows || [], state.birthdayToday || nyTodayParts());
    renderHome();
  };

  window.__kosHubSetRole = function (flags) {
    flags = flags || {};
    roleFixture = flags;
    if ("officer" in flags) state.officer = !!flags.officer;
    if ("canManageEvents" in flags) state.canManageEvents = !!flags.canManageEvents;
    if ("canViewPayments" in flags) state.canViewPayments = !!flags.canViewPayments;
    if ("canReviewHours" in flags) state.canReviewHours = !!flags.canReviewHours;
    applyApplicationFixture();
    syncOfficerChip();
    renderHome();
    if (canOpenOfficerDesk()) {
      try { wireOfficerDeskPicker(); } catch (e) {}
    }
    if (state.canReviewApplications) {
      try { renderApplicationsFromState(); } catch (e2) {}
    }
    if (state.canManageEvents) {
      var studioClient = window.__kosSb || {
        rpc: function () { return Promise.resolve({ data: { ok: true, events: [] }, error: null }); }
      };
      try { loadEventStudio(studioClient); } catch (e3) {}
    }
  };

  function showTab(name, opts) {
    var tab = name || TAB_HOME;
    opts = opts || {};
    if (tab === "officer" && !canOpenOfficerDesk()) tab = TAB_HOME;
    document.querySelectorAll("[data-hub-panel]").forEach(function (el) {
      el.classList.toggle("hub-on", el.getAttribute("data-hub-panel") === tab);
    });
    document.querySelectorAll("[data-hub-tab]").forEach(function (btn) {
      var id = btn.getAttribute("data-hub-tab");
      btn.classList.toggle("on", id === tab);
      if (id === tab) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
      if (id === "officer") btn.style.display = canOpenOfficerDesk() ? "" : "none";
    });
    syncOfficerChip();
    try { sessionStorage.setItem("kosHubTab", tab); } catch (e) {}
    if (tab === "officer") {
      try { sessionStorage.setItem("kosOfficerDeskSeen", "1"); } catch (e2) {}
      var pulseCards = document.querySelectorAll(".hub-officer-card.hub-officer-pulse");
      for (var pi = 0; pi < pulseCards.length; pi++) pulseCards[pi].classList.remove("hub-officer-pulse");
      setTimeout(wireOfficerDeskPicker, 60);
      setTimeout(wireOfficerDeskPicker, 500);
    }
    closeBell();
    if (tab === "hub" && !opts.skipHomeRender) renderHome();
    else paintAppHeader(tab);
    if (!opts.skipScroll) {
      // One instant scroll after the panel is shown. Smooth scrolling here
      // fights the next scroll and snaps the page back.
      setTimeout(function () {
        var active = document.querySelector("[data-hub-panel].hub-on");
        if (document.body.classList.contains("hub-app")) {
          if (active) active.scrollTop = 0;
          return;
        }
        var tabs = document.getElementById("hubTabs");
        if (!tabs) return;
        var y = tabs.getBoundingClientRect().top + window.pageYOffset - 4;
        try { window.scrollTo({ top: Math.max(0, y), behavior: "auto" }); } catch (e3) {}
      }, 0);
    }
  }

  window.kosShowHub = showTab;

  function syncOfficerChip() {
    var chip = document.getElementById("hubOfficerChip");
    if (!chip) {
      var bar = document.getElementById("memberBar");
      if (!bar) return;
      chip = document.createElement("button");
      chip.type = "button";
      chip.id = "hubOfficerChip";
      chip.className = "hub-officer-chip";
      chip.innerHTML = '<span class="ic" aria-hidden="true">🎖️</span><span>Officer desk</span>';
      chip.addEventListener("click", function () { showTab("officer"); });
      bar.insertBefore(chip, bar.firstChild);
    }
    var show = canOpenOfficerDesk();
    chip.classList.toggle("show", show);
    chip.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function syncSignedInPill() {
    var who = document.getElementById("memberWho");
    if (!who) return;
    var p = window.kosProfile || {};
    var nm = (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "").toString().trim();
    var title = (p.officer_title || "").toString().trim();
    who.classList.add("hub-signed-pill");
    if (!who.querySelector(".dot")) {
      who.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="hub-signed-label"></span>';
    }
    var label = who.querySelector(".hub-signed-label");
    if (label) {
      if (nm && title) label.textContent = "Signed in as " + nm + " · " + title;
      else if (nm) label.textContent = "Signed in as " + nm;
      else label.textContent = "Signed in";
    }
    who.classList.add("is-on");
    who.setAttribute("aria-live", "polite");
  }

  async function loadHubData() {
    var client = window.__kosSb || null;
    if (!client) {
      for (var i = 0; i < 20 && !client; i++) {
        client = window.__kosSb || null;
        if (!client) await new Promise(function (r) { setTimeout(r, 100); });
      }
    }
    if (!client) {
      state.tidingsReady = true;
      state.birthdaysReady = true;
      renderHome();
      try { appNavApi.boot(); } catch (faqBoot) {}
      return;
    }

    try {
      var off = await client.rpc("is_krewe_officer");
      state.officer = !!off.data;
    } catch (e) { state.officer = false; }
    if (roleFixture && ("officer" in roleFixture)) state.officer = !!roleFixture.officer;
    state.shopOnly = false;
    state.socialOnly = false;
    // Committee desks without full board officer access
    if (!state.officer) {
      try {
        var shop = await client.rpc("can_manage_shop");
        if (shop.data) {
          state.officer = true;
          state.shopOnly = true;
        }
      } catch (e2) {}
      try {
        var social = await client.rpc("can_manage_social_charity");
        if (social.data) {
          state.officer = true;
          state.socialOnly = true;
          // Social/Charity also drives Event Studio via can_manage_events
        }
      } catch (e3) {}
    }
    try {
      var dash = document.getElementById("dashCard");
      if (dash) {
        // Keep Reports off Member Hub Home for everyone; officers use Officer desk.
        dash.style.display = "none";
        dash.setAttribute("hidden", "");
        dash.setAttribute("aria-hidden", "true");
      }
    } catch (e) {}
    try {
      var pay = await client.rpc("can_view_payments");
      state.canViewPayments = !!pay.data;
    } catch (e) { state.canViewPayments = false; }
    if (roleFixture && ("canViewPayments" in roleFixture)) state.canViewPayments = !!roleFixture.canViewPayments;
    try { var eventManager = await client.rpc("can_manage_events"); state.canManageEvents = !!eventManager.data; } catch (e) { state.canManageEvents = false; }
    if (roleFixture) {
      if ("officer" in roleFixture) state.officer = !!roleFixture.officer;
      if ("canManageEvents" in roleFixture) state.canManageEvents = !!roleFixture.canManageEvents;
      if ("canReviewHours" in roleFixture) state.canReviewHours = !!roleFixture.canReviewHours;
    }
    await refreshApplicationAccess(client);
    if (state.officer || state.canReviewHours) loadApprovals(client);
    if (state.canViewPayments) loadPaymentsCard(client);
    if (state.canManageEvents) loadEventStudio(client);
    loadClaimClovers(client);

    try {
      var email = (window.kosProfile || {}).email || null;
      if (email) {
        var gc = await client.rpc("get_member_game_card", { p_email: email });
        state.game = gc.data || null;
      }
    } catch (e) { state.game = null; }
    if (!announcementFixture) {
      try {
        var ann = await client.rpc("list_board_announcements", { p_limit: 3 });
        var annPayload = ann.data || {};
        if (!announcementFixture) {
          state.announcements = (annPayload.ok && Array.isArray(annPayload.messages)) ? annPayload.messages : [];
        }
      } catch (e) {
        if (!announcementFixture) state.announcements = [];
      }
      state.tidingsReady = true;
    } else {
      state.tidingsReady = true;
    }
    if (!birthdayFixture) {
      try {
        var bday = await client.rpc("list_todays_birthdays");
        if (!birthdayFixture) {
          state.birthdayToday = nyTodayParts();
          state.birthdays = (!bday || bday.error || !Array.isArray(bday.data))
            ? []
            : birthdayDisplayNames(bday.data);
        }
      } catch (bdayErr) {
        if (!birthdayFixture) state.birthdays = [];
      }
      state.birthdaysReady = true;
    } else {
      state.birthdaysReady = true;
    }
    try {
      var evSelect = "id,name,start_time,end_time,location,member_address,members_only,status,source,event_type,linked_meeting_id,description";
      var evs = await client.from("events")
        .select(evSelect)
        .eq("source", "krewe")
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(20);
      if (evs.error) {
        evs = await client.from("events")
          .select("id,name,start_time,location,status,source")
          .eq("source", "krewe")
          .gte("start_time", new Date().toISOString())
          .order("start_time", { ascending: true })
          .limit(20);
      }
      var list = (evs.data || []).filter(function (e) {
        var st = String(e.status || "published").toLowerCase();
        var src = String(e.source || "").toLowerCase();
        return src === "krewe" && (st === "published" || st === "live");
      });
      var lockedEvents = !!(feedLock && Array.isArray(feedLock.events));
      if (!lockedEvents) state.hubEvents = list.slice(0, 12);
      renderHubMemberEvents(state.hubEvents);
      await loadParadeSeason(client);
      if (!lockedEvents) {
        var open = list.slice();
        var meId = (window.kosProfile || {}).member_id || null;
        if (meId && open.length) {
          try {
            var signed = await client.from("event_signups")
              .select("event_id,status")
              .eq("member_id", meId)
              .in("status", ["registered", "confirmed", "attended", "waitlisted"]);
            var taken = {};
            (signed.data || []).forEach(function (r) { if (r.event_id) taken[r.event_id] = true; });
            open = open.filter(function (e) { return !taken[e.id]; });
          } catch (signupErr) { /* keep unfiltered krewe list */ }
        }
        state.nextEvents = open.slice(0, 4);
        state.nextEvent = state.nextEvents[0] || null;
      }
    } catch (e) {
      if (!(feedLock && Array.isArray(feedLock.events))) {
        state.nextEvents = [];
        state.nextEvent = null;
        state.hubEvents = [];
        renderHubMemberEvents([]);
      }
      try { await loadParadeSeason(client); } catch (pe) { renderHubParadeSeason([]); }
    }
    try {
      var meId = (window.kosProfile || {}).member_id || null;
      var pr = await client.from("v_parade_ready").select("*");
      var rows = pr.data || [];
      if (!(feedLock && feedLock.paradeReady)) {
        state.parade = (meId && rows.find(function (r) { return r.member_id === meId; })) || (rows.length === 1 ? rows[0] : null);
      }
      if (state.parade) {
        state.membershipStatus = state.parade.membership_status || state.membershipStatus;
        if (state.parade.volunteer_hours_approved != null) {
          state.hoursApproved = Number(state.parade.volunteer_hours_approved) || 0;
        }
      }
    } catch (e) {}

    if (!state.membershipStatus) {
      try { state.membershipStatus = (window.kosProfile || {}).membership_status || null; } catch (e) {}
    }

    if (!state.hoursApproved) {
      try {
        var mid = (window.kosProfile || {}).member_id || null;
        if (mid) {
          var vh = await client.from("volunteer_hours").select("hours,status").eq("member_id", mid);
          var approved = (vh.data || []).filter(function (r) {
            return String(r.status || "").toLowerCase() === "approved";
          });
          state.hoursApproved = approved.reduce(function (n, r) { return n + (Number(r.hours) || 0); }, 0);
        }
      } catch (e) {}
    }

    var saved = TAB_HOME;
    var wantHours = hoursIntent();
    var wantDocs = false;
    var wantShare = false;
    var wantApplications = false;
    try {
      var hash = (location.hash || "").replace(/^#/, "").toLowerCase();
      if (wantHours) {
        hoursDeepLink = true;
        saved = "parade";
      } else if (hash === "parade" || hash === "desk") saved = "parade";
      else if (hash === "officer") saved = "officer";
      else if (hash === "applications") { saved = "officer"; wantApplications = true; }
      else if (hash === "krewe" || hash === "directory") saved = "krewe";
      else if (hash === "docs") { saved = "parade"; wantDocs = true; }
      else if (hash === "share") { saved = "parade"; wantShare = true; }
      else if (faqHashSection(hash) !== null) saved = "parade";
      else if (hash === "events") saved = "events";
      else if (hash === "fun") saved = "fun";
      else if (hash === "home") saved = TAB_HOME;
      else {
        // Always land on Home after login/refresh unless the URL asks for a tab.
        saved = TAB_HOME;
      }
    } catch (e) {
      if (wantHours) saved = "parade";
    }
    if (saved === "officer" && !canOpenOfficerDesk()) saved = TAB_HOME;
    try {
      var already = document.querySelector("[data-hub-panel].hub-on");
      var alreadyTab = already && already.getAttribute("data-hub-panel");
      if (alreadyTab && alreadyTab !== TAB_HOME) saved = alreadyTab;
    } catch (e) {}

    syncSignedInPill();
    syncOfficerChip();

    // One settle: pick the tab once, skip scroll on first paint, then optionally
    // deep-link hours after layout is stable (prevents Home <-> desk snap).
    // If the member already moved (a tab tap can land while this load is in
    // flight), leave that screen alone.
    if (!(appNavApi.hasMoved && appNavApi.hasMoved())) showTab(saved, { skipScroll: true });
    if (saved !== "hub") renderHome();
    if (wantHours) {
      setTimeout(function () { openVolunteerHoursForm(false); }, 280);
    } else if (wantDocs) {
      setTimeout(function () { revealDocsCard(); }, 280);
    } else if (wantShare) {
      setTimeout(function () { revealShareGroup(); }, 280);
    } else if (wantApplications) {
      setTimeout(function () { openApplicationsFromHome(); }, 280);
    }
    if (state.canReviewApplications) {
      try { renderApplicationsFromState(); } catch (appPaint) {}
    }
    if (feedLock) applyFeedLock();
    try { appNavApi.boot(); } catch (navBootErr) {}
  }

  function openVolunteerHoursForm(clearIntent) {
    function hubVisible() {
      var content = document.getElementById("memberContent");
      return !!(content && content.style.display !== "none");
    }
    function go() {
      if (!hubVisible()) return false;
      hoursDeepLink = true;
      showTab("parade", { skipScroll: true });
      var form = document.getElementById("vhForm");
      if (!form) return false;
      var card = document.getElementById("hubHoursCard") || form || document.getElementById("prHours");
      // Defer scroll until after the parade panel is painted (avoids login snap).
      setTimeout(function () {
        if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "auto", block: "nearest" });
      }, 120);
      var hours = document.getElementById("vhHours") || document.getElementById("vhActivity");
      if (hours) {
        try { hours.focus({ preventScroll: true }); } catch (fe) { try { hours.focus(); } catch (fe2) {} }
      }
      try { form.classList.add("kos-hours-flash"); } catch (ce) {}
      setTimeout(function () { try { form.classList.remove("kos-hours-flash"); } catch (ce2) {} }, 1800);
      if (clearIntent) clearHoursIntent();
      return true;
    }
    if (go()) return;
    var tries = 0;
    var t = setInterval(function () {
      tries += 1;
      if (go() || tries > 25) clearInterval(t);
    }, 200);
  }
  window.kosOpenVolunteerHours = function () { openVolunteerHoursForm(false); };

  // ---- My profile: photo, birthday, anniversary, and friendly questions ----
  // View mode shows what the directory sees; Edit mode saves through the
  // update_my_member_profile function, which can never change role or status.
  var profileEditing = false;
  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function fmtMonthDay(d) {
    var parts = String(d || "").split("-");
    if (parts.length < 3) return String(d || "");
    var m = MONTH_NAMES[Number(parts[1]) - 1];
    return m ? m + " " + Number(parts[2]) : String(d);
  }

  function profileAvatarHtml(p) {
    if (p.photo_url) return '<img class="hub-avatar" src="' + esc(p.photo_url) + '" alt="Profile photo" id="hubProfAvatar" />';
    var initials = (((p.first_name || " ")[0] || "") + ((p.last_name || " ")[0] || "")).toUpperCase();
    return '<div class="hub-avatar hub-avatar-blank" id="hubProfAvatar">' + esc(initials || "☘") + "</div>";
  }

  function renderProfileCard() {
    var pc = document.getElementById("hubProfileCard");
    if (!pc) return;
    var p = window.kosProfile || {};
    if (profileEditing) { renderProfileEdit(pc, p); return; }
    var nm = (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Member").toString();
    var facts = [];
    if (p.officer_title) facts.push("🎖 " + esc(p.officer_title));
    else if (p.member_role) facts.push("Role: " + esc(p.member_role));
    if (p.membership_status || state.membershipStatus) facts.push("Status: " + esc(p.membership_status || state.membershipStatus));
    if (p.hometown) facts.push("🏠 " + esc(p.hometown));
    if (p.street_address || p.city) {
      var addr = [p.street_address, [p.city, p.state].filter(Boolean).join(", "), p.zip].filter(Boolean).join(" · ");
      if (addr) facts.push("📫 " + esc(addr));
    }
    if (p.parade_since) facts.push("🥁 Marching since " + esc(p.parade_since));
    if (p.birthday) facts.push("🎂 " + esc(fmtMonthDay(p.birthday)));
    if (p.anniversary) facts.push("💍 " + esc(fmtMonthDay(p.anniversary)));
    var longs = "";
    if (p.bio) longs += '<p class="hub-prof-line"><b>About me:</b> ' + esc(p.bio) + "</p>";
    if (p.hobbies) longs += '<p class="hub-prof-line"><b>Hobbies:</b> ' + esc(p.hobbies) + "</p>";
    if (p.interests) longs += '<p class="hub-prof-line"><b>Interests:</b> ' + esc(p.interests) + "</p>";
    if (p.favorite_memory) longs += '<p class="hub-prof-line"><b>Favorite krewe memory:</b> ' + esc(p.favorite_memory) + "</p>";
    if (p.fun_fact) longs += '<p class="hub-prof-line"><b>Fun fact:</b> ' + esc(p.fun_fact) + "</p>";
    pc.innerHTML =
      "<h3>Your profile</h3>" +
      '<div class="hub-prof-head">' + profileAvatarHtml(p) +
      "<div><b>" + esc(nm) + "</b>" +
      (p.email ? '<div style="color:var(--muted);font-size:16px;">' + esc(p.email) + "</div>" : "") +
      (facts.length ? '<div style="color:var(--muted);font-size:16px;">' + facts.join(" · ") + "</div>" : "") +
      "</div></div>" + longs +
'<div class="hub-fb-members">' +
      '<div style="font-size:15px;color:var(--muted);margin-bottom:4px;">Members only</div>' +
      '<a href="https://www.facebook.com/groups/1790675004521855" target="_blank" rel="noopener noreferrer">📘 Join the Krewe members Facebook group →</a>' +
      '</div>' +
      '<button class="btn btn-primary" id="hubProfEditBtn" type="button" style="margin-top:10px;">✏️ Edit my profile</button>' +
      (p.profile_visible === false ? '<p style="color:var(--muted);font-size:15px;">Your profile is hidden from the member directory.</p>' : "") +
      '<p style="color:var(--muted);font-size:14px;margin:8px 0 0;">Fellow members see your birthday and anniversary as month and day only - never the year.</p>';
    var btn = document.getElementById("hubProfEditBtn");
    if (btn) btn.addEventListener("click", function () { profileEditing = true; renderProfileCard(); });
  }

  function renderProfileEdit(pc, p) {
    function attr(v) { return esc(v == null ? "" : String(v)); }
    pc.innerHTML =
      "<h3>Edit my profile</h3>" +
      '<div class="hub-prof-form">' +
      '<div class="hub-prof-head">' + profileAvatarHtml(p) +
      '<div><label for="hubPfPhoto">Profile picture (JPG or PNG)</label>' +
      '<input type="file" id="hubPfPhoto" accept="image/*" /></div></div>' +
      '<div class="hub-prof-grid">' +
      '<div><label for="hubPfFirst">First name</label><input id="hubPfFirst" value="' + attr(p.first_name) + '" required /></div>' +
      '<div><label for="hubPfLast">Last name</label><input id="hubPfLast" value="' + attr(p.last_name) + '" required /></div>' +
      '<div><label for="hubPfPhone">Phone</label><input id="hubPfPhone" type="tel" value="' + attr(p.phone) + '" /></div>' +
      '<div><label for="hubPfHometown">Hometown</label><input id="hubPfHometown" value="' + attr(p.hometown) + '" /></div>' +
      '<div style="grid-column:1/-1;"><label for="hubPfStreet">Mailing address</label><input id="hubPfStreet" value="' + attr(p.street_address) + '" autocomplete="street-address" /></div>' +
      '<div><label for="hubPfCity">City</label><input id="hubPfCity" value="' + attr(p.city) + '" autocomplete="address-level2" /></div>' +
      '<div><label for="hubPfState">State</label><input id="hubPfState" value="' + attr(p.state) + '" maxlength="20" autocomplete="address-level1" /></div>' +
      '<div><label for="hubPfZip">ZIP</label><input id="hubPfZip" value="' + attr(p.zip) + '" maxlength="16" autocomplete="postal-code" /></div>' +
      '<div><label for="hubPfBirthday">Birthday (members see month + day only)</label><input id="hubPfBirthday" type="date" value="' + attr(p.birthday) + '" /></div>' +
      '<div><label for="hubPfAnniversary">Anniversary (month + day shown)</label><input id="hubPfAnniversary" type="date" value="' + attr(p.anniversary) + '" /></div>' +
      '<div><label for="hubPfSince">Marching with the krewe since (year)</label><input id="hubPfSince" type="number" min="1998" max="2100" value="' + attr(p.parade_since) + '" /></div>' +
      "</div>" +
      '<label for="hubPfBio">About me</label><textarea id="hubPfBio">' + esc(p.bio || "") + "</textarea>" +
      '<label for="hubPfHobbies">Hobbies (what do you love doing?)</label><input id="hubPfHobbies" value="' + attr(p.hobbies) + '" placeholder="e.g. Gardening, bagpipes, beach days" />' +
      '<label for="hubPfInterests">Interests (what would you chat about all night?)</label><input id="hubPfInterests" value="' + attr(p.interests) + '" placeholder="e.g. Irish history, cooking, live music" />' +
      '<label for="hubPfMemory">Favorite krewe or parade memory</label><textarea id="hubPfMemory">' + esc(p.favorite_memory || "") + "</textarea>" +
      '<label for="hubPfFact">A fun fact about you</label><input id="hubPfFact" value="' + attr(p.fun_fact) + '" placeholder="e.g. I once caught 47 strands of beads in one parade" />' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:12px;cursor:pointer;">' +
      '<input type="checkbox" id="hubPfVisible" style="width:auto;"' + (p.profile_visible === false ? "" : " checked") + " /> Show my profile in the member directory</label>" +
      '<div style="display:flex;gap:10px;margin-top:14px;">' +
      '<button class="btn btn-primary" id="hubPfSave" type="button">☘ Save profile</button>' +
      '<button class="btn" id="hubPfCancel" type="button">Cancel</button></div>' +
      '<div class="err" id="hubPfMsg" style="margin-top:8px;"></div>' +
      "</div>";
    document.getElementById("hubPfCancel").addEventListener("click", function () {
      profileEditing = false; renderProfileCard();
    });
    document.getElementById("hubPfPhoto").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var av = document.getElementById("hubProfAvatar");
      if (av) {
        var img = document.createElement("img");
        img.className = "hub-avatar";
        img.id = "hubProfAvatar";
        img.alt = "Profile photo preview";
        img.src = URL.createObjectURL(f);
        av.replaceWith(img);
      }
    });
    document.getElementById("hubPfSave").addEventListener("click", function () { saveMyProfile(); });
  }

  function uploadAvatar(client, file) {
    return new Promise(function (resolve, reject) {
      var objUrl = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 512;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(objUrl);
          if (!blob) { reject(new Error("Could not read that image.")); return; }
          (async function () {
            var uid = (window.kosProfile || {}).user_id;
            if (!uid) {
              var u = await client.auth.getUser();
              uid = u.data && u.data.user && u.data.user.id;
            }
            if (!uid) throw new Error("Please sign in again.");
            var path = uid + "/avatar.jpg";
            var up = await client.storage.from("avatars").upload(path, blob, {
              upsert: true, contentType: "image/jpeg", cacheControl: "3600"
            });
            if (up.error) throw up.error;
            var pub = client.storage.from("avatars").getPublicUrl(path);
            return pub.data.publicUrl + "?v=" + Date.now();
          })().then(resolve, reject);
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(objUrl); reject(new Error("That file does not look like an image.")); };
      img.src = objUrl;
    });
  }

  async function saveMyProfile() {
    var client = window.__kosSb;
    var msg = document.getElementById("hubPfMsg");
    function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
    if (!client) { if (msg) msg.textContent = "Still connecting - try again in a moment."; return; }
    if (msg) { msg.style.color = ""; msg.textContent = "Saving…"; }
    try {
      var photoUrl = null;
      var fileInput = document.getElementById("hubPfPhoto");
      var f = fileInput && fileInput.files && fileInput.files[0];
      if (f) {
        if (msg) msg.textContent = "Uploading photo…";
        photoUrl = await uploadAvatar(client, f);
        if (msg) msg.textContent = "Saving…";
      }
      var since = parseInt(val("hubPfSince"), 10);
      var res = await client.rpc("update_my_member_profile", {
        p_first: val("hubPfFirst"),
        p_last: val("hubPfLast"),
        p_phone: val("hubPfPhone") || null,
        p_bio: val("hubPfBio") || null,
        p_hometown: val("hubPfHometown") || null,
        p_street_address: val("hubPfStreet") || null,
        p_city: val("hubPfCity") || null,
        p_state: val("hubPfState") || null,
        p_zip: val("hubPfZip") || null,
        p_parade_since: isNaN(since) ? null : since,
        p_interests: val("hubPfInterests") || null,
        p_photo_url: photoUrl,
        p_birthday: val("hubPfBirthday") || null,
        p_anniversary: val("hubPfAnniversary") || null,
        p_hobbies: val("hubPfHobbies") || null,
        p_favorite_memory: val("hubPfMemory") || null,
        p_fun_fact: val("hubPfFact") || null,
        p_profile_visible: !!(document.getElementById("hubPfVisible") || {}).checked
      });
      if (res.error) throw res.error;
      if (res.data) window.kosProfile = res.data;
      profileEditing = false;
      renderProfileCard();
      renderHome();
      try { if (window.kosSyncLepWelcome) window.kosSyncLepWelcome(); } catch (syncErr) {}
    } catch (e) {
      if (msg) msg.textContent = "Couldn't save: " + ((e && e.message) || e);
    }
  }

  // Opens the My Krewe profile editor (Me tab). The welcome modal links here.
  window.kosEditMyProfile = function () {
    profileEditing = true;
    showTab("krewe");
    renderProfileCard();
    setTimeout(function () {
      var card = document.getElementById("hubProfileCard");
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "auto", block: "start" });
    }, 80);
  };


  // ---- Claim Clovers: member submits activities for officer approval ----
  var CLAIM_ACTIVITIES = [
    { code: "attend_event", label: "Attend an event (verified)", clovers: 20 },
    { code: "attend_meeting", label: "Attend a members' meeting", clovers: 15 },
    { code: "attend_ikc_event", label: "Attend another IKC krewe's event", clovers: 25 },
    { code: "volunteer_event", label: "Volunteer at an event", clovers: 30 },
    { code: "volunteer_priority", label: "Volunteer for a priority shift (setup / teardown / parade day)", clovers: 60 },
    { code: "organize_event", label: "Organize an event", clovers: 50 },
    { code: "bring_guest", label: "Bring a guest (up to 3)", clovers: 5, perGuest: true },
    { code: "dues_on_time", label: "Pay your dues on time", clovers: 25 },
    { code: "dues_early", label: "Pay your dues early (by St. Paddy's)", clovers: 15 },
    { code: "refer_member", label: "Refer a member who joins", clovers: 40 }
  ];

  function ensureClaimCloversCard() {
    var fun = document.getElementById("hubFun");
    if (!fun) return;
    if (document.getElementById("hubClaimCard")) return;
    var card = document.createElement("section");
    card.className = "app-card";
    card.id = "hubClaimCard";
    card.innerHTML =
      '<div class="app-head"><span class="ic">🍀</span><div><h2>Claim Clovers</h2><small>Ask officers to credit an activity that is not auto-awarded</small></div></div>' +
      '<div class="app-body hub-claim" id="hubClaimBody"><p class="empty">Loading…</p></div>';
    var cup = fun.querySelector(".game-head");
    if (cup) fun.insertBefore(card, cup.nextSibling);
    else fun.appendChild(card);
  }

  function claimOptionsHtml() {
    return CLAIM_ACTIVITIES.map(function (a) {
      var pts = a.perGuest ? (a.clovers + " each") : ("+" + a.clovers);
      return '<option value="' + a.code + '">' + esc(a.label) + " · " + pts + " 🍀</option>";
    }).join("");
  }

  function renderClaimForm(client, rows) {
    ensureClaimCloversCard();
    var body = document.getElementById("hubClaimBody");
    if (!body) return;
    var pending = (rows || []).filter(function (r) { return r.status === "pending"; });
    var recent = (rows || []).slice(0, 8);
    var listHtml = "";
    if (recent.length) {
      listHtml = '<h3 style="font-family:var(--display);color:var(--green-800);margin:16px 0 6px;font-size:17px;">Your recent claims</h3><ul class="hub-claim-list">';
      recent.forEach(function (r) {
        var extra = [];
        if (r.guest_count) extra.push(r.guest_count + (r.guest_count === 1 ? " guest" : " guests"));
        if (r.event_name) extra.push(r.event_name);
        listHtml += '<li><span class="st ' + esc(r.status) + '">' + esc(r.status) + '</span> · <b>' +
          esc(r.activity_label || r.activity_code) + '</b> · +' + Number(r.clovers || 0) + ' 🍀' +
          (extra.length ? '<div class="muted" style="color:var(--muted);font-size:15px;">' + esc(extra.join(" · ")) + "</div>" : "") +
          "</li>";
      });
      listHtml += "</ul>";
    } else {
      listHtml = '<p class="empty" style="margin-top:14px;">No claims yet. RSVPs still earn +5 automatically.</p>';
    }
    body.innerHTML =
      '<p style="margin:0 0 8px;font-size:16px;color:var(--muted);">Pick an activity. Officers review and credit Clovers to your Craic Cup. RSVP to an event is already automatic, so it is not listed here. Went to another IKC krewe’s event? That one is worth <b>+25 🍀</b> - supporting the krewe family counts.</p>' +
      '<form id="hubClaimForm">' +
      '<label for="hubClaimActivity">Activity</label>' +
      '<select id="hubClaimActivity" required><option value="">Choose one…</option>' + claimOptionsHtml() + "</select>" +
      '<div class="hub-claim-row" id="hubClaimGuestsRow"><label for="hubClaimGuests">How many guests (1-3)</label>' +
      '<select id="hubClaimGuests"><option value="1">1 · +5</option><option value="2">2 · +10</option><option value="3">3 · +15</option></select></div>' +
      '<label for="hubClaimEvent">Event or activity name (optional)</label>' +
      '<input id="hubClaimEvent" type="text" maxlength="120" placeholder="e.g. Members meeting, parade setup">' +
      '<label for="hubClaimNotes">Notes for officers (optional)</label>' +
      '<textarea id="hubClaimNotes" maxlength="400" placeholder="Anything that helps them verify"></textarea>' +
      '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">' +
      '<button type="submit" class="btn btn-primary" id="hubClaimSubmit">Submit claim</button>' +
      (pending.length ? ('<span style="font-size:15px;color:var(--muted);">' + pending.length + " pending</span>") : "") +
      "</div>" +
      '<p class="hub-claim-msg" id="hubClaimMsg" hidden></p>' +
      "</form>" + listHtml;

    var act = document.getElementById("hubClaimActivity");
    var guestRow = document.getElementById("hubClaimGuestsRow");
    function syncGuests() {
      if (guestRow) guestRow.classList.toggle("on", act && act.value === "bring_guest");
    }
    if (act) act.addEventListener("change", syncGuests);
    syncGuests();

    var form = document.getElementById("hubClaimForm");
    if (form) form.addEventListener("submit", async function (ev) {
      ev.preventDefault();
      var code = (act && act.value) || "";
      if (!code) return;
      var btn = document.getElementById("hubClaimSubmit");
      var msg = document.getElementById("hubClaimMsg");
      if (btn) btn.disabled = true;
      var guests = null;
      if (code === "bring_guest") {
        guests = Number((document.getElementById("hubClaimGuests") || {}).value || 1);
      }
      var eventName = ((document.getElementById("hubClaimEvent") || {}).value || "").trim() || null;
      var notes = ((document.getElementById("hubClaimNotes") || {}).value || "").trim() || null;
      try {
        var res = await client.rpc("submit_clover_request", {
          p_activity_code: code,
          p_guest_count: guests,
          p_event_name: eventName,
          p_notes: notes
        });
        if (res.error) throw res.error;
        var payload = res.data || {};
        if (!payload.ok) throw new Error(payload.message || "Could not submit");
        if (msg) {
          msg.hidden = false;
          msg.textContent = "Sent to officers for approval.";
        }
        loadClaimClovers(client);
      } catch (e) {
        if (msg) {
          msg.hidden = false;
          msg.textContent = "Could not send: " + ((e && e.message) || e);
        }
        if (btn) btn.disabled = false;
      }
    });
  }

  async function loadClaimClovers(client) {
    ensureClaimCloversCard();
    var rows = [];
    try {
      var res = await client.rpc("list_my_clover_requests");
      if (res.data && Array.isArray(res.data)) rows = res.data;
    } catch (e) {}
    renderClaimForm(client, rows);
  }

  // ---- Membership Applications: join form pipeline, separate from renewals ----
  var APP_BUCKET_STATUS = {
    "new": "pending-new",
    background: "background-check",
    dues: "dues-pending",
    approved: "active",
    declined: "declined",
    archived: "archived",
    renewal: "pending-renewal",
    prospect: "prospect"
  };

  function scrubApplicationRow(row) {
    if (!row || typeof row !== "object") return row;
    Object.keys(row).forEach(function (key) {
      var k = String(key).toLowerCase();
      if (/last4$/.test(k) || k.indexOf("has_") === 0) return;
      if (/ssn|social|id_digit|driver|licen[cs]e|token|dl_/.test(k)) delete row[key];
    });
    return row;
  }

  function rememberApplicationIds(row) {
    if (!row || row.id == null) return;
    function keep(slot, kind, keys) {
      var raw = "";
      keys.forEach(function (key) {
        if (!raw && row[key] != null && String(row[key]).trim()) raw = String(row[key]).trim();
      });
      if (!raw) return;
      applicationIdVault[String(row.id) + ":" + slot + ":" + kind] = raw;
    }
    keep("applicant", "ssn", ["ssn_full", "ssn", "id_digits"]);
    keep("applicant", "dl", ["dl_full", "driver_license", "dl"]);
    keep("partner", "ssn", ["partner_ssn_full", "partner_ssn"]);
    keep("partner", "dl", ["partner_dl_full", "partner_driver_license", "partner_dl"]);
  }

  function redactDisplayedId(text) {
    return String(text == null ? "" : text)
      .replace(/\d{3}[-\s]\d{2}[-\s]\d{4}/g, "[redacted]")
      .replace(/\d{9,}/g, "[redacted]");
  }

  function applyApplicationFixture() {
    if (!roleFixture) return;
    if ("canReviewApplications" in roleFixture) state.canReviewApplications = !!roleFixture.canReviewApplications;
    applicationIdVault = {};
    if (Array.isArray(roleFixture.applications)) {
      var applicationClones = roleFixture.applications.map(function (row) {
        var clone = {};
        Object.keys(row || {}).forEach(function (key) { clone[key] = row[key]; });
        return clone;
      });
      applicationClones.forEach(rememberApplicationIds);
      applicationsFixture = applicationClones.map(scrubApplicationRow);
      state.applicationRows = applicationsFixture.slice();
      state.applicationRecent = Array.isArray(roleFixture.applicationRecent) ? roleFixture.applicationRecent : [];
      syncApplicationFixtureCounts();
    } else if ("applicationCount" in roleFixture) {
      state.applicationCount = Number(roleFixture.applicationCount) || 0;
    }
  }

  function countStatus(rows, status) {
    return rows.filter(function (r) { return r && r.membership_status === status; }).length;
  }

  function syncApplicationFixtureCounts() {
    var rows = applicationsFixture || state.applicationRows || [];
    state.applicationCounts = {
      "new": countStatus(rows, "pending-new"),
      background: countStatus(rows, "background-check"),
      dues: countStatus(rows, "dues-pending"),
      approved: countStatus(rows, "active"),
      declined: countStatus(rows, "declined"),
      archived: countStatus(rows, "archived"),
      renewal: countStatus(rows, "pending-renewal"),
      prospect: countStatus(rows, "prospect")
    };
    state.applicationCount = state.applicationCounts["new"];
  }

  function applyApplicationPayload(data) {
    if (!data || data.ok === false) {
      state.applicationRows = [];
      state.applicationLoadError = (data && data.message) || "Could not load membership applications.";
      return;
    }
    var asked = state.applicationBucket || "new";
    if (data.bucket && data.bucket !== asked && asked !== "new" && asked !== "renewal" && asked !== "prospect" && data.bucket === "new") {
      state.applicationRows = [];
      state.applicationLoadError = "This stage needs the database update in sql/kos_membership_application_pipeline.sql.";
      return;
    }
    state.applicationLoadError = "";
    state.applicationRows = (Array.isArray(data.applications) ? data.applications : []).map(scrubApplicationRow);
    state.applicationCounts = data.counts || state.applicationCounts;
    if (data.counts && data.counts["new"] != null) state.applicationCount = Number(data.counts["new"]) || 0;
    state.applicationRecent = Array.isArray(data.recent) ? data.recent : [];
    if (data.bucket) state.applicationBucket = data.bucket;
  }

  async function refreshApplicationAccess(client) {
    var fixtureLocks = roleFixture && ("canReviewApplications" in roleFixture || Array.isArray(roleFixture.applications));
    if (!fixtureLocks && client) {
      try {
        var can = await client.rpc("can_review_applications");
        state.canReviewApplications = !!(can && can.data);
      } catch (e) { state.canReviewApplications = false; }
    }
    applyApplicationFixture();
    if (!state.canReviewApplications || applicationsFixture || !client) return;
    try {
      var listed = await client.rpc("list_membership_applications", { p_bucket: state.applicationBucket || "new" });
      if (listed && listed.error) throw listed.error;
      applyApplicationPayload(listed && listed.data);
    } catch (e2) {
      state.applicationLoadError = "Could not load membership applications. If this stays blank, the database update may not be applied yet.";
    }
  }

  function formatAppliedEt(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      }).format(d) + " ET";
    } catch (e) {
      return String(iso).slice(0, 16);
    }
  }

  function applicationAddress(row) {
    var street = (row.street_address || "").trim();
    var city = (row.city || "").trim();
    var st = (row.state || "").trim();
    var zip = (row.zip || "").trim();
    var line2 = [city, st].filter(Boolean).join(", ");
    if (zip) line2 = line2 ? (line2 + " " + zip) : zip;
    return [street, line2].filter(Boolean).join(", ");
  }

  function applicationStatusLabel(status) {
    if (status === "pending-new") return "New";
    if (status === "background-check") return "Background check in progress";
    if (status === "dues-pending") return "Dues pending";
    if (status === "active") return "Approved";
    if (status === "declined") return "Declined";
    if (status === "archived") return "Archived";
    if (status === "pending-renewal") return "Renewal";
    if (status === "prospect") return "Event prospect";
    return "New";
  }

  function applicationBucketRows() {
    var bucket = state.applicationBucket || "new";
    var want = APP_BUCKET_STATUS[bucket] || "pending-new";
    var rows = state.applicationRows || [];
    return rows.filter(function (r) { return r && r.membership_status === want; });
  }

  function applicationCountOf(bucket) {
    var counts = state.applicationCounts || {};
    if (counts[bucket] != null) return Number(counts[bucket]) || 0;
    return 0;
  }

  function applicationActionWord(action) {
    if (action === "decline") return "Declined";
    if (action === "archive") return "Archived";
    if (action === "background_check") return "Background check in progress";
    if (action === "dues_pending") return "Dues pending";
    if (action === "next_step_sent") return "Next step sent";
    if (action === "full_application_sent") return "Full application sent";
    if (action === "full_application_received") return "Full application received";
    if (action === "id_revealed") return "Background-check number opened";
    if (action === "approve") return "Approved";
    return "Updated";
  }

  function applicationFeeLine(row) {
    var t = String(row.application_fee_type || row.fee_type || "").toLowerCase();
    if (t === "dual" || t === "couple") {
      return "Application fee: couple, $75. This is the background check fee, not membership dues.";
    }
    if (t === "single") {
      return "Application fee: single applicant, $50. This is the background check fee, not membership dues.";
    }
    return "Application fee: $50 single or $75 couple. This is the background check fee, not membership dues.";
  }

  function applicationTail4(value) {
    var s = String(value == null ? "" : value).replace(/[^A-Za-z0-9]/g, "");
    if (s.length < 4) return "";
    return s.slice(-4);
  }

  function applicationIdLine(row, which, kind) {
    var prefix = which === "partner" ? "partner_" : "";
    var last = applicationTail4(row[prefix + (kind === "dl" ? "dl_last4" : "ssn_last4")]);
    var hasKey = kind === "dl"
      ? (which === "partner" ? row.has_partner_dl : row.has_dl)
      : (which === "partner" ? row.has_partner_ssn : row.has_ssn);
    var label = kind === "dl"
      ? (which === "partner" ? "Partner driver's license on file, last 4 only" : "Driver's license on file, last 4 only")
      : (which === "partner" ? "Partner SSN on file, last 4 only" : "SSN on file, last 4 only");
    if (!last) {
      if (hasKey || (which !== "partner" && kind === "ssn" && row.has_ssn)) {
        return label.replace(", last 4 only", "") + ". Lists show the last 4 only.";
      }
      return "";
    }
    return label + ": " + (kind === "dl" ? "••••" : "•••-••-") + last;
  }

  function applicationIdMarkup(row, which, kind) {
    var line = applicationIdLine(row, which, kind);
    if (!line || !state.canReviewApplications) return "";
    var slot = which === "partner" ? "partner" : "applicant";
    var attr = kind === "dl" ? "data-app-dl" : "data-app-ssn";
    var copyLabel = kind === "dl"
      ? (slot === "partner" ? "Copy partner driver's license number" : "Copy driver's license number")
      : (slot === "partner" ? "Copy partner Social Security number" : "Copy Social Security number");
    return '<div class="hub-app-id" ' + attr + ' data-app-id-slot="' + slot + '">' +
      "<span>" + esc(line) + "</span>" +
      '<button type="button" class="btn hub-app-copy" data-app-copy="' + esc(row.id) + '" data-app-copy-slot="' + slot + '" data-app-copy-kind="' + kind + '" aria-label="' + esc(copyLabel) + '">Copy</button>' +
      "</div>";
  }

  function formatCopiedId(kind, raw) {
    var text = String(raw == null ? "" : raw).trim();
    var digits = text.replace(/\D/g, "");
    if (kind === "ssn" && digits.length === 9) {
      return digits.slice(0, 3) + "-" + digits.slice(3, 5) + "-" + digits.slice(5);
    }
    return text;
  }

  async function copyApplicationId(client, btn) {
    if (!state.canReviewApplications || !btn) return;
    var id = btn.getAttribute("data-app-copy");
    var slot = btn.getAttribute("data-app-copy-slot") || "applicant";
    var kind = btn.getAttribute("data-app-copy-kind") === "dl" ? "dl" : "ssn";
    var value = applicationIdVault[String(id) + ":" + slot + ":" + kind] || "";
    var label = kind === "dl" ? "driver's license number" : "Social Security number";
    btn.disabled = true;
    try {
      if (!value) {
        if (!client || typeof client.rpc !== "function") throw new Error("Could not copy that " + label + ".");
        var res = await client.rpc("reveal_membership_application_id", {
          p_member_id: id,
          p_slot: slot,
          p_kind: kind
        });
        if (res && res.error) throw res.error;
        var payload = (res && res.data) || {};
        if (payload.ok === false) throw new Error(payload.message || ("Could not copy that " + label + "."));
        value = kind === "dl" ? payload.dl : payload.ssn;
      }
      value = formatCopiedId(kind, value);
      if (!value) throw new Error("No " + label + " is on file for that person.");
      copyText(value, function () {
        btn.disabled = false;
        btn.textContent = "Copied";
        showToast((kind === "dl" ? "Driver's license number" : "Social Security number") + " copied. The list stays masked.");
        setTimeout(function () {
          if (btn.isConnected && btn.textContent === "Copied") btn.textContent = "Copy";
        }, 2000);
      });
    } catch (e) {
      btn.disabled = false;
      alert("Could not copy that " + label + ". " + ((e && e.message) || "Please try again."));
    }
  }

  function applicationPacketLine(row) {
    var got = !!(row.has_ssn || row.has_dl || row.has_partner_ssn || row.has_partner_dl
      || applicationTail4(row.ssn_last4) || applicationTail4(row.dl_last4)
      || applicationTail4(row.partner_ssn_last4) || applicationTail4(row.partner_dl_last4));
    if (got) return "Full application received. Lists show the last 4 only.";
    if (row.full_application_sent_at) return "Full application link sent. Waiting for the applicant.";
    return "Full application: not sent yet.";
  }

  function applicationOpenStatus(status) {
    return status === "pending-new" || status === "background-check" || status === "dues-pending" || status === "prospect" || status === "pending-renewal";
  }

  function fixtureActor() {
    var p = window.kosProfile || {};
    var name = (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Membership Chair").toString().trim();
    return {
      actor_name: name || "Membership Chair",
      actor_email: (p.email || "lsugrue99@gmail.com").toString(),
      created_at: new Date().toISOString()
    };
  }

  async function reloadApplications(client) {
    if (applicationsFixture) {
      syncApplicationFixtureCounts();
      renderApplicationsFromState();
      renderHome();
      return;
    }
    if (!client) client = window.__kosSb || null;
    if (!client) return;
    try {
      var listed = await client.rpc("list_membership_applications", { p_bucket: state.applicationBucket || "new" });
      if (listed && listed.error) throw listed.error;
      applyApplicationPayload(listed && listed.data);
    } catch (e) {
      state.applicationLoadError = "Could not refresh the list.";
    }
    renderApplicationsFromState();
    renderHome();
    try { wireOfficerDeskPicker(); } catch (e2) {}
    openOfficerTool("tool:hubApplications", false);
  }

  function applicationFlashFor(action) {
    if (action === "approve") {
      return "Approved. They are an active member now. We emailed them a welcome note with steps to create a Member Hub login: open the Member Hub, tap Create or reset your password, and use the email on this application. Signing up with that email links their login to this membership.";
    }
    if (action === "decline") return "Declined. Their record stays on file and is off the new-application list. Nothing was deleted.";
    if (action === "archive") return "Archived. Their record stays on file and is off the new-application list. Nothing was deleted.";
    if (action === "background_check") return "Moved to background check. We emailed them a secure link to finish the full application, the background check payment, and each membership level with a short note and a pay link. The email does not include a Social Security number or a driver's license number. Membership dues are invoiced when they submit that form and begin the check.";
    if (action === "dues_pending") return "Moved to dues pending. This is membership dues, not the application fee. The dues invoice is emailed when they submit the full application and begin the background check.";
    if (action === "next_step_sent") return "Next step sent. The note is on the application history.";
    if (action === "full_application_sent") return "Full application sent. We emailed them a secure link to finish the background check. The email does not include a Social Security number or a driver's license number.";
    return "Saved.";
  }

  function applicationStatusFor(action, from) {
    if (action === "approve") return "active";
    if (action === "decline") return "declined";
    if (action === "archive") return "archived";
    if (action === "background_check") return "background-check";
    if (action === "dues_pending") return "dues-pending";
    return from;
  }

  var lastDecisionStamp = { key: "", at: 0 };

  async function decideApplication(client, action, id, note, btn) {
    // A status click rebuilds the card. A second click in the same moment
    // (a double tap, or the browser retrying after the first button is
    // replaced) would log an empty note on top of the real one.
    var stamp = String(action) + ":" + String(id);
    var now = Date.now();
    if (lastDecisionStamp.key === stamp && now - lastDecisionStamp.at < 800) return;
    lastDecisionStamp.key = stamp;
    lastDecisionStamp.at = now;
    if (btn) btn.disabled = true;
    if (applicationsFixture) {
      var row = null;
      (applicationsFixture || []).forEach(function (r) {
        if (String(r.id) === String(id)) row = r;
      });
      if (!row) {
        if (btn) btn.disabled = false;
        return;
      }
      var from = row.membership_status;
      var actor = fixtureActor();
      var recent = state.applicationRecent || [];
      if (action === "background_check") {
        row.full_application_sent_at = new Date().toISOString();
        recent.unshift({
          id: "act-link-" + Date.now(),
          member_id: row.id,
          action: "full_application_sent",
          note: note || "",
          from_status: from,
          to_status: from,
          actor_name: actor.actor_name,
          actor_email: actor.actor_email,
          created_at: actor.created_at,
          applicant: ((row.first_name || "") + " " + (row.last_name || "")).trim()
        });
      }
      row.membership_status = applicationStatusFor(action, from);
      recent.unshift({
        id: "act-" + Date.now(),
        member_id: row.id,
        action: action,
        note: note || "",
        from_status: from,
        to_status: row.membership_status,
        actor_name: actor.actor_name,
        actor_email: actor.actor_email,
        created_at: actor.created_at,
        applicant: ((row.first_name || "") + " " + (row.last_name || "")).trim()
      });
      state.applicationRecent = recent.slice(0, 12);
      if (roleFixture) {
        roleFixture.applications = applicationsFixture;
        roleFixture.applicationRecent = state.applicationRecent;
      }
      state.applicationRows = applicationsFixture.slice();
      syncApplicationFixtureCounts();
      state.applicationFlash = applicationFlashFor(action);
      renderHome();
      renderApplicationsFromState();
      openOfficerTool("tool:hubApplications", false);
      return;
    }
    var args = { p_member_id: id, p_action: action, p_note: note || null };
    try {
      var res = await client.rpc("set_membership_application_status", args);
      var missing = res && res.error && /function|schema cache|PGRST202|Could not find/i.test(String(res.error.message || res.error));
      if (missing && (action === "approve" || action === "decline" || action === "archive")) {
        var legacy = action === "approve" ? "approve_membership_application"
          : action === "decline" ? "decline_membership_application"
          : "archive_membership_application";
        var legacyArgs = action === "approve" ? { p_member_id: id } : { p_member_id: id, p_note: note || null };
        res = await client.rpc(legacy, legacyArgs);
      }
      if (res.error) throw res.error;
      var payload = res.data || {};
      if (payload.ok === false) throw new Error(payload.message || "Could not update that application.");
      state.applicationFlash = payload.message || "Saved.";
    } catch (e) {
      alert("Could not update that application: " + ((e && e.message) || e));
      if (btn) btn.disabled = false;
      return;
    }
    reloadApplications(client);
  }

  function renderApplicationsFromState() {
    if (!state.canReviewApplications) return;
    var panel = document.getElementById("hubOfficer");
    if (!panel) return;
    var card = ensureOfficerToolCard("hubApplications");
    if (!card) return;
    var bucket = state.applicationBucket || "new";
    var rows = applicationBucketRows();
    var intro = {
      renewal: "These are renewals, not new join-form applications.",
      prospect: "These are event RSVP prospects, not new join-form applications.",
      background: "Background check is in progress. When prospect emails are on, Move to background check emails a link to finish the full application, the background check payment, and each membership level. The dues invoice is sent when they submit that form and begin the check. The application fee is separate from membership dues.",
      dues: "This list is membership dues, not the application fee. The dues invoice is emailed when they submit the full application and begin the background check.",
      approved: "Approved applications. These people are active members.",
      declined: "Declined applications stay on file. Nothing was deleted.",
      archived: "Archived applications stay on file. Nothing was deleted.",
      "new": "These people asked to join. Newest first. Interest comes in first. When prospect emails are on, Move to background check emails a link to finish the full application, the background check payment, and each membership level. The dues invoice is sent when they begin the check."
    }[bucket] || "These people asked to join. Newest first. Interest comes in first. When prospect emails are on, Move to background check emails a link to finish the full application, the background check payment, and each membership level. The dues invoice is sent when they begin the check.";
    var empty = {
      renewal: "No pending renewals.",
      prospect: "No event prospects in this list.",
      background: "Nobody is in background check right now.",
      dues: "Nobody is waiting on membership dues right now.",
      approved: "No approved applications in this list yet.",
      declined: "No declined applications.",
      archived: "No archived applications.",
      "new": "No new applications right now. When someone submits the join form, they will show up here."
    }[bucket] || "No new applications right now. When someone submits the join form, they will show up here.";
    function filterBtn(key, label) {
      return '<button type="button" data-app-bucket="' + key + '"' + (bucket === key ? ' class="on"' : "") + ">" +
        label + " (" + applicationCountOf(key) + ")</button>";
    }
    var html = '<div class="app-head"><span class="ic">📝</span><div><h2>Membership Applications</h2>' +
      '<small>Interest comes in first. When prospect emails are on, Move to background check emails the full application, the background check payment, and each membership level. The dues invoice is sent when they begin the check.</small></div></div>' +
      '<div class="app-body" id="hubApplicationsBody">';
    if (state.applicationFlash) {
      html += '<div class="hub-app-flash" id="hubAppFlash">' + esc(state.applicationFlash) + "</div>";
    }
    html += '<div class="hub-app-filters" role="tablist" aria-label="Application lists">' +
      filterBtn("new", "New applications") +
      filterBtn("background", "Background check") +
      filterBtn("dues", "Dues pending") +
      filterBtn("approved", "Approved") +
      filterBtn("declined", "Declined") +
      filterBtn("archived", "Archived") +
      filterBtn("renewal", "Renewals") +
      filterBtn("prospect", "Event prospects") +
      "</div>" +
      '<p style="margin:0 0 12px;font-size:16px;color:var(--muted);line-height:1.45;">' + esc(intro) + "</p>";
    if (state.applicationLoadError && !rows.length) {
      html += '<p class="empty">' + esc(state.applicationLoadError) + "</p>";
    } else if (!rows.length) {
      html += '<p class="empty">' + esc(empty) + "</p>";
    } else {
      rows.forEach(function (row) {
        var name = ((row.first_name || "") + " " + (row.last_name || "")).trim() || "Applicant";
        var addr = applicationAddress(row);
        var when = formatAppliedEt(row.created_at);
        var partner = ((row.partner_first_name || "") + " " + (row.partner_last_name || "")).trim();
        var open = applicationOpenStatus(row.membership_status);
        var id = esc(row.id);
        html += '<div class="hub-appr" data-app-id="' + id + '" data-app-status="' + esc(row.membership_status || "") + '">' +
          "<div><b>" + esc(name) + "</b>" +
          '<span class="hub-app-status' + (row.membership_status === "active" ? " ok" : "") + '">' + esc(applicationStatusLabel(row.membership_status)) + "</span>" +
          (row.email ? ' <span class="muted"><a href="mailto:' + esc(row.email) + '">' + esc(row.email) + "</a></span>" : "") +
          (row.phone ? '<div class="muted">Phone: ' + esc(row.phone) + "</div>" : "") +
          (addr ? '<div class="muted">Address: ' + esc(addr) + "</div>" : '<div class="muted">Address: not provided</div>') +
          (partner ? '<div class="muted">Second applicant: ' + esc(partner) + "</div>" : "") +
          '<div class="hub-app-fee">' + esc(applicationFeeLine(row)) + "</div>" +
          '<div class="muted">Membership dues are not the application fee. The dues invoice is emailed when they submit the full application and begin the background check. The background check email lists each level: Full Krewe $375, Associate $450, Auxiliary $200, and Leave of Absence $100.</div>' +
          '<div class="muted" data-app-packet>' + esc(applicationPacketLine(row)) + "</div>" +
          applicationIdMarkup(row, "applicant", "dl") +
          applicationIdMarkup(row, "applicant", "ssn") +
          applicationIdMarkup(row, "partner", "dl") +
          applicationIdMarkup(row, "partner", "ssn") +
          (when ? '<div class="muted">Applied: ' + esc(when) + "</div>" : "") +
          (row.interests && String(row.interests).trim() ? '<div class="muted">Interests: ' + esc(redactDisplayedId(row.interests)) + "</div>" : "") +
          (row.notes && String(row.notes).trim() ? '<div class="muted">Their note: ' + esc(redactDisplayedId(row.notes)) + "</div>" : '<div class="muted">Their note: none</div>') +
          (open
            ? '<label class="muted" style="display:block;margin-top:8px;" for="hubAppNote-' + id + '">Note for the record</label>' +
              '<textarea class="hub-app-note" id="hubAppNote-' + id + '" data-app-note maxlength="1000" placeholder="Short note other officers can see"></textarea>'
            : "") +
          "</div>";
        if (open) {
          html += '<div class="hub-appr-btns">' +
            (row.membership_status === "background-check" ? "" : '<button type="button" class="btn btn-primary" data-app-bg="' + id + '">Move to background check</button>') +
            (row.membership_status === "dues-pending" ? "" : '<button type="button" class="btn" data-app-dues="' + id + '">Move to dues pending</button>') +
            '<button type="button" class="btn btn-primary" data-app-approve="' + id + '">Approve</button>' +
            '<button type="button" class="btn" data-app-decline="' + id + '">Decline</button>' +
            '<button type="button" class="btn" data-app-archive="' + id + '">Archive</button>' +
            "</div>";
        }
        html += "</div>";
      });
    }
    var recent = state.applicationRecent || [];
    if (recent.length) {
      html += '<h3 class="hub-appr-h">Recent decisions</h3>';
      recent.forEach(function (r) {
        var when = formatAppliedEt(r.created_at);
        html += '<div class="hub-appr" data-app-history="' + esc(r.action || "") + '"><div><b>' + esc(applicationActionWord(r.action)) + "</b>" +
          (r.applicant ? " · " + esc(r.applicant) : "") +
          '<div class="muted">' + (function () {
            var fromLabel = applicationStatusLabel(r.from_status);
            var toLabel = applicationStatusLabel(r.to_status);
            return esc(fromLabel === toLabel ? fromLabel : fromLabel + " to " + toLabel);
          })() + "</div>" +
          '<div class="muted">by ' + esc(r.actor_name || r.actor_email || "Officer") +
          (when ? " · " + esc(when) : "") + "</div>" +
          (r.note ? '<div class="muted">Note: ' + esc(redactDisplayedId(r.note)) + "</div>" : "") +
          "</div></div>";
      });
    }
    html += "</div>";
    card.innerHTML = html;
    var body = card.querySelector("#hubApplicationsBody");
    if (!body) return;
    body.querySelectorAll("[data-app-bucket]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.applicationBucket = btn.getAttribute("data-app-bucket") || "new";
        state.applicationFlash = "";
        if (applicationsFixture) renderApplicationsFromState();
        else reloadApplications(window.__kosSb || null);
      });
    });
    function noteFor(id) {
      var el = document.getElementById("hubAppNote-" + id);
      return el ? (el.value || "").trim() : "";
    }
    body.querySelectorAll("[data-app-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (!confirm("Approve this application? They become an active member, and we email them how to create a Member Hub login.")) return;
        decideApplication(window.__kosSb || null, "approve", btn.getAttribute("data-app-approve"), noteFor(btn.getAttribute("data-app-approve")), btn);
      });
    });
    body.querySelectorAll("[data-app-decline]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-app-decline");
        if (!confirm("Decline this application? Their record stays on file. They leave the new-application list.")) return;
        decideApplication(window.__kosSb || null, "decline", id, noteFor(id), btn);
      });
    });
    body.querySelectorAll("[data-app-archive]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-app-archive");
        if (!confirm("Archive this application? Their record stays on file. Nothing is deleted.")) return;
        decideApplication(window.__kosSb || null, "archive", id, noteFor(id), btn);
      });
    });
    body.querySelectorAll("[data-app-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        copyApplicationId(window.__kosSb || null, btn);
      });
    });
    body.querySelectorAll("[data-app-bg]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-app-bg");
        if (!confirm("Move this application to background check? When prospect emails are on, we email them a secure link to finish the full application, background check payment ($50 individual or $75 couple), and each membership level with a short note and a pay link. The email does not include a Social Security number or a driver's license number. While prospect emails are paused, the stage still changes and nothing is emailed.")) return;
        decideApplication(window.__kosSb || null, "background_check", id, noteFor(id), btn);
      });
    });
    body.querySelectorAll("[data-app-dues]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-app-dues");
        if (!confirm("Move this application to dues pending? That marks membership dues as the next stage. The dues invoice is emailed when they submit the full application, not by this button.")) return;
        decideApplication(window.__kosSb || null, "dues_pending", id, noteFor(id), btn);
      });
    });
  }

  // ---- Officer Approvals queue: role requests + duplicate-record merges + media ----
  function mediaLogHtml(rows) {
    var html = '<h3 class="hub-appr-h">Recent media decisions</h3>';
    html += '<div style="font-size:15px;color:var(--muted);margin:0 0 8px;">Who approved or denied photos and videos (newest first).</div>';
    (rows || []).forEach(function (r) {
      var when = r.created_at ? String(r.created_at).slice(0, 16).replace("T", " ") : "";
      var act = String(r.action || "").toLowerCase() === "deny" ? "Denied" : "Approved";
      var kind = r.content_type === "video" ? "video" : "photo";
      html += '<div class="hub-appr" style="align-items:flex-start;">' +
        '<div><b>' + esc(act) + '</b> · ' + esc(kind) + ' <b>' + esc(r.content_title || "") + '</b>' +
        '<div class="muted">by ' + esc(r.officer_name || r.officer_email || "Officer") +
        (when ? (" · " + esc(when) + " UTC") : "") +
        (r.submitter_name ? (" · from " + esc(r.submitter_name)) : "") + '</div>' +
        (r.note ? '<div class="muted">Note: ' + esc(r.note) + '</div>' : "") +
        '</div></div>';
    });
    return html;
  }


  // Officers decide on the website; every decision is recorded with who/when.
  function setOfficerBadge(n) {
    var btn = document.querySelector('[data-hub-tab="officer"]');
    if (!btn) return;
    var b = btn.querySelector(".hub-badge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "hub-badge"; btn.appendChild(b); }
    b.textContent = String(n);
  }

  async function decideApproval(client, fn, args, btn) {
    if (btn) btn.disabled = true;
    try {
      var res = await client.rpc(fn, args);
      if (res.error) throw res.error;
    } catch (e) {
      alert("Couldn't complete that: " + ((e && e.message) || e));
    }
    loadApprovals(client);
  }

  function hourSourceLabel(source) {
    var s = String(source || "").toLowerCase();
    if (s === "event_signup") return "Event signup";
    if (s === "door_checkin") return "Door check-in";
    if (s === "in_kind") return "In-kind";
    if (s === "trackitforward_import") return "Imported";
    return "Logged in the Hub";
  }

  function renderHourApprovalsHtml(rows) {
    if (!rows || !rows.length) return "";
    var html = '<h3 class="hub-appr-h">Volunteer hours</h3>';
    rows.forEach(function (q) {
      var when = q.worked_on ? String(q.worked_on).slice(0, 10) : "";
      var bits = [hourSourceLabel(q.source)];
      if (q.event_name) bits.push(q.event_name);
      if (when) bits.push(when);
      html += '<div class="hub-appr" data-hours-id="' + esc(q.id) + '">' +
        "<div><b>" + esc(q.member_name || "Member") + "</b>" +
        '<div class="muted"><b>' + esc(String(q.hours)) + " hours</b> · " + esc(q.activity || "Volunteer hours") + "</div>" +
        '<div class="muted">' + esc(bits.join(" · ")) + "</div>" +
        (q.notes ? '<div class="muted">' + esc(q.notes) + "</div>" : "") +
        '<label class="muted" style="display:block;margin-top:8px;" for="hubHoursNote-' + esc(q.id) + '">Optional note</label>' +
        '<textarea class="hub-app-note" id="hubHoursNote-' + esc(q.id) + '" data-hours-note maxlength="500" placeholder="Only if you want a short note saved with this decision"></textarea>' +
        '</div><div class="hub-appr-btns">' +
        '<button type="button" class="btn btn-primary" data-hours-approve="' + esc(q.id) + '">Approve</button>' +
        '<button type="button" class="btn" data-hours-decline="' + esc(q.id) + '">Decline</button>' +
        "</div></div>";
    });
    return html;
  }

  function hourNoteFor(id) {
    var el = document.getElementById("hubHoursNote-" + id);
    return el ? (el.value || "").trim() : "";
  }

  function applyHourDecision(client, id, approved, btn) {
    var note = hourNoteFor(id);
    if (hourApprovalsFixture) {
      var row = (state.pendingHours || []).filter(function (h) { return String(h.id) === String(id); })[0];
      state.pendingHours = (state.pendingHours || []).filter(function (h) { return String(h.id) !== String(id); });
      state.hourDecisionFlash = (approved ? "Approved" : "Declined") +
        (row && row.member_name ? " " + row.member_name : "") +
        (note ? ". Note saved." : ".");
      loadApprovals(client);
      return;
    }
    decideApproval(client, "decide_volunteer_hours", {
      p_id: id,
      p_approved: !!approved,
      p_note: note || null
    }, btn);
  }

  window.__kosHubSetHourApprovals = function (rows, opts) {
    opts = opts || {};
    hourApprovalsFixture = true;
    state.pendingHours = Array.isArray(rows) ? rows : [];
    state.canReviewHours = opts.host === false ? state.canReviewHours : true;
    state.hourDecisionFlash = "";
    if (opts.officer === false) state.officer = false;
    if (opts.officer === true) state.officer = true;
    var officerBtn = document.querySelector('[data-hub-tab="officer"]');
    if (officerBtn && canOpenOfficerDesk()) officerBtn.style.display = "";
    loadApprovals(window.__kosSb || { rpc: function () { return Promise.resolve({ data: null, error: null }); } });
  };

  async function loadApprovals(client) {
    if (!state.officer && !state.canReviewHours) return;
    var panel = document.getElementById("hubOfficer");
    if (!panel) return;
    var card = document.getElementById("hubApprovals");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubApprovals";
      panel.insertBefore(card, panel.firstChild);
    }
    var hostOnlyQueue = state.canReviewHours && !state.officer;
    card.innerHTML =
      '<div class="app-head"><span class="ic">✅</span><div><h2>Approvals</h2><small>' +
      (hostOnlyQueue
        ? "Volunteer hours for events you host"
        : "Role requests, clover claims, media, volunteer hours, and record merges") +
      "</small></div></div>" +
      '<div class="app-body" id="hubApprovalsBody"><p class="empty">Loading approvals…</p></div>';
    var body = card.querySelector("#hubApprovalsBody");
    var data = null;
    var clovers = [];
    var media = [];
    var mediaLog = [];
    try {
      var res = await client.rpc("list_officer_approvals");
      data = res.data || null;
    } catch (e) {}
    try {
      var cr = await client.rpc("list_pending_clover_requests");
      if (cr.data && Array.isArray(cr.data)) clovers = cr.data;
    } catch (e2) {}
    try {
      var mr = await client.rpc("list_pending_media_approvals");
      if (mr.data && Array.isArray(mr.data)) media = mr.data;
    } catch (e3) {}
    try {
      var lr = await client.rpc("list_content_approval_log", { p_limit: 25 });
      if (lr.data && Array.isArray(lr.data)) mediaLog = lr.data;
    } catch (e4) {}
    var hours = state.pendingHours || [];
    if (!hourApprovalsFixture && client && client.rpc) {
      try {
        var hr = await client.rpc("list_pending_volunteer_hours");
        if (hr.data && hr.data.viewer && hr.data.viewer !== "none") {
          state.canReviewHours = true;
          hours = Array.isArray(hr.data.hours) ? hr.data.hours : [];
          state.pendingHours = hours;
        } else if (hr.data && Array.isArray(hr.data.hours)) {
          hours = hr.data.hours;
          state.pendingHours = hours;
        }
      } catch (e5) {}
    }
    if (!state.officer) {
      data = { role_requests: [], duplicates: [] };
      clovers = [];
      media = [];
      mediaLog = [];
    } else if (!data) {
      if (!hourApprovalsFixture && !hours.length) {
        body.innerHTML = '<p class="empty">Couldn&rsquo;t load the approvals queue. Try again in a moment.</p>';
        return;
      }
      data = { role_requests: [], duplicates: [] };
    }
    var reqs = data.role_requests || [];
    var dups = data.duplicates || [];
    setOfficerBadge(reqs.length + dups.length + clovers.length + media.length + hours.length);
    if (!reqs.length && !dups.length && !clovers.length && !media.length && !hours.length) {
      var emptyHtml = "";
      if (state.hourDecisionFlash) emptyHtml += '<p class="hub-app-flash" id="hubHoursFlash">' + esc(state.hourDecisionFlash) + "</p>";
      emptyHtml += '<p class="empty">Nothing waiting · all caught up. ☘</p>';
      if (mediaLog.length) emptyHtml += mediaLogHtml(mediaLog);
      body.innerHTML = emptyHtml;
      wireOfficerDeskPicker();
      return;
    }
    var html = "";
    if (state.hourDecisionFlash) {
      html += '<p class="hub-app-flash" id="hubHoursFlash">' + esc(state.hourDecisionFlash) + "</p>";
    }
    html += renderHourApprovalsHtml(hours);
    if (media.length) {
      html += '<h3 class="hub-appr-h">Media approvals</h3>';
      media.forEach(function (q) {
        var when = q.created_at ? String(q.created_at).slice(0, 16).replace("T", " ") : "";
        var kind = (q.type === "video") ? "Video" : "Photo";
        var preview = "";
        if (q.url && q.type === "photo") {
          preview = '<div style="margin-top:6px;"><a href="' + esc(q.url) + '" target="_blank" rel="noopener"><img src="' + esc(q.url) + '" alt="" style="max-width:140px;max-height:100px;border-radius:8px;object-fit:cover;border:1px solid rgba(168,128,28,.35);" /></a></div>';
        } else if (q.url) {
          preview = '<div class="muted" style="margin-top:4px;"><a href="' + esc(q.url) + '" target="_blank" rel="noopener">Open / preview video</a></div>';
        }
        html += '<div class="hub-appr">' +
          '<div><b>' + esc(q.submitter_name || "Member") + '</b> <span class="muted">' + esc(kind) + (when ? (" · " + esc(when) + " UTC") : "") + '</span>' +
          '<div class="muted"><b>' + esc(q.title || "(untitled)") + '</b></div>' +
          (q.notes ? '<div class="muted">' + esc(q.notes) + '</div>' : "") +
          preview +
          '</div><div class="hub-appr-btns">' +
          '<button class="btn btn-primary" data-media-approve="' + esc(q.id) + '">Approve</button>' +
          '<button class="btn" data-media-deny="' + esc(q.id) + '">Deny</button>' +
          '</div></div>';
      });
    }
    if (clovers.length) {
      html += '<h3 class="hub-appr-h">Clover claims</h3>';
      clovers.forEach(function (q) {
        var bits = [];
        if (q.guest_count) bits.push(q.guest_count + (q.guest_count === 1 ? " guest" : " guests"));
        if (q.event_name) bits.push(q.event_name);
        if (q.notes) bits.push(q.notes);
        html += '<div class="hub-appr">' +
          '<div><b>' + esc(q.member_name || q.member_email || "Member") + '</b> <span class="muted">' + esc(q.member_email || "") + '</span>' +
          '<div class="muted"><b>' + esc(q.activity_label || q.activity_code) + '</b> · +' + Number(q.clovers || 0) + ' 🍀</div>' +
          (bits.length ? '<div class="muted">' + esc(bits.join(" · ")) + '</div>' : "") +
          '</div><div class="hub-appr-btns">' +
          '<button class="btn btn-primary" data-clover-approve="' + esc(q.id) + '">Approve</button>' +
          '<button class="btn" data-clover-deny="' + esc(q.id) + '">Deny</button>' +
          '</div></div>';
      });
    }
    if (reqs.length) {
      html += '<h3 class="hub-appr-h">Role requests</h3>';
      reqs.forEach(function (q) {
        var titles = (q.answers && q.answers.titles && q.answers.titles.length)
          ? q.answers.titles.join(" · ")
          : (q.requested_roles || []).join(", ");
        var extra = [];
        if (q.answers && q.answers.committee) extra.push("Committee: " + esc(q.answers.committee));
        if (q.answers && q.answers.committees && q.answers.committees.length > 1) {
          extra.push("Committees: " + esc(q.answers.committees.join(", ")));
        }
        if (q.answers && q.answers.note) extra.push("Note: " + esc(q.answers.note));
        html += '<div class="hub-appr">' +
          '<div><b>' + esc(q.full_name || q.email) + '</b> <span class="muted">' + esc(q.email) + '</span>' +
          '<div class="muted">Requests: <b>' + esc(titles) + '</b>' + (q.linked ? " · matches the roster" : " · <b>no roster match</b>") + '</div>' +
          (extra.length ? '<div class="muted">' + extra.join(" · ") + '</div>' : "") +
          '</div><div class="hub-appr-btns">' +
          '<button class="btn btn-primary" data-appr-approve="' + esc(q.id) + '">Approve</button>' +
          '<button class="btn" data-appr-deny="' + esc(q.id) + '">Deny</button>' +
          '</div></div>';
      });
    }
    if (dups.length) {
      html += '<h3 class="hub-appr-h">Possible duplicate records</h3>';
      dups.forEach(function (d) {
        html += '<div class="hub-appr">' +
          '<div><div class="muted">' + esc(d.reason) + '</div>' +
          '<div><b>A:</b> ' + esc(d.a.name) + ' · ' + esc(d.a.email || "no email") + (d.a.joined ? " · joined " + esc(d.a.joined) : "") + '</div>' +
          '<div><b>B:</b> ' + esc(d.b.name) + ' · ' + esc(d.b.email || "no email") + (d.b.joined ? " · joined " + esc(d.b.joined) : "") + '</div>' +
          '</div><div class="hub-appr-btns">' +
          '<button class="btn btn-primary" data-appr-merge data-keep="' + esc(d.a.id) + '" data-dupe="' + esc(d.b.id) + '">Keep A, fold B in</button>' +
          '<button class="btn btn-primary" data-appr-merge data-keep="' + esc(d.b.id) + '" data-dupe="' + esc(d.a.id) + '">Keep B, fold A in</button>' +
          '<button class="btn" data-appr-dismiss="' + esc(d.id) + '">Not duplicates</button>' +
          '</div></div>';
      });
    }
    if (mediaLog.length) html += mediaLogHtml(mediaLog);
    body.innerHTML = html;
    body.querySelectorAll("[data-hours-approve]").forEach(function (b) {
      b.addEventListener("click", function () {
        applyHourDecision(client, b.getAttribute("data-hours-approve"), true, b);
      });
    });
    body.querySelectorAll("[data-hours-decline]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Decline these hours? They will not count toward the 12-hour season goal.")) return;
        applyHourDecision(client, b.getAttribute("data-hours-decline"), false, b);
      });
    });
    body.querySelectorAll("[data-media-approve]").forEach(function (b) {
      b.addEventListener("click", function () {
        decideApproval(client, "approve_content_item", { p_id: b.getAttribute("data-media-approve") }, b);
      });
    });
    body.querySelectorAll("[data-media-deny]").forEach(function (b) {
      b.addEventListener("click", function () {
        var note = prompt("Optional note for the record (why deny?)");
        if (note === null) return;
        decideApproval(client, "deny_content_item", { p_id: b.getAttribute("data-media-deny"), p_note: note || null }, b);
      });
    });
    body.querySelectorAll("[data-clover-approve]").forEach(function (b) {
      b.addEventListener("click", function () {
        decideApproval(client, "approve_clover_request", { p_id: b.getAttribute("data-clover-approve") }, b);
      });
    });
    body.querySelectorAll("[data-clover-deny]").forEach(function (b) {
      b.addEventListener("click", function () {
        var note = prompt("Optional note for the record (why deny?)");
        if (note === null) return;
        decideApproval(client, "deny_clover_request", { p_id: b.getAttribute("data-clover-deny"), p_note: note || null }, b);
      });
    });
    body.querySelectorAll("[data-appr-approve]").forEach(function (b) {
      b.addEventListener("click", function () {
        decideApproval(client, "approve_role_request", { p_id: b.getAttribute("data-appr-approve") }, b);
      });
    });
    body.querySelectorAll("[data-appr-deny]").forEach(function (b) {
      b.addEventListener("click", function () {
        var note = prompt("Optional note for the record (why deny?)");
        if (note === null) return;
        decideApproval(client, "deny_role_request", { p_id: b.getAttribute("data-appr-deny"), p_note: note || null }, b);
      });
    });
    body.querySelectorAll("[data-appr-merge]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!confirm("Merge these two records? Dues and event history move to the kept record, and the other is retired (not deleted).")) return;
        decideApproval(client, "merge_members", { p_keep: b.getAttribute("data-keep"), p_duplicate: b.getAttribute("data-dupe") }, b);
      });
    });
    body.querySelectorAll("[data-appr-dismiss]").forEach(function (b) {
      b.addEventListener("click", function () {
        decideApproval(client, "dismiss_duplicate", { p_id: b.getAttribute("data-appr-dismiss") }, b);
      });
    });
    wireOfficerDeskPicker();
  }

  // ---- Officer payments: Dues & Payments tabs, with the ledger as a fallback ----
  async function loadPaymentsCard(client) {
    if (!state.canViewPayments) return;
    var panel = document.getElementById("hubOfficer");
    if (!panel) return;
    var card = document.getElementById("hubPayments");
    if (!card) {
      card = document.createElement("section");
      card.className = "app-card";
      card.id = "hubPayments";
      var approvals = document.getElementById("hubApprovals");
      if (approvals && approvals.nextSibling) panel.insertBefore(card, approvals.nextSibling);
      else panel.appendChild(card);
    }
    if (typeof window.kosRenderDuesPayments === "function") {
      try {
        var painted = await window.kosRenderDuesPayments(client);
        if (painted || card.querySelector("#hubPayTabs")) {
          wireOfficerDeskPicker();
          return;
        }
      } catch (e) {}
    }
    card.innerHTML =
      '<div class="app-head"><span class="ic">💵</span><div><h2>Payments</h2><small>Treasurer &amp; board - online payments recorded automatically</small></div></div>' +
      '<div class="app-body" id="hubPaymentsBody"><p class="empty">Loading payments…</p></div>';
    var body = card.querySelector("#hubPaymentsBody");
    var data = null;
    try {
      var res = await client.rpc("list_recent_payments", { p_limit: 50 });
      data = res.data;
    } catch (e) {}
    if (!data || !data.length) {
      body.innerHTML = '<p class="empty">No online payments yet. They appear here automatically once the payment system is connected (see PAYMENTS_SETUP.md).</p>';
      return;
    }
    var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:16px;">' +
      '<tr style="text-align:left;color:var(--muted);"><th style="padding:4px 8px;">When</th><th style="padding:4px 8px;">Who</th><th style="padding:4px 8px;">What</th><th style="padding:4px 8px;">Amount</th></tr>';
    data.forEach(function (r) {
      var when = String(r.when || "").slice(0, 10);
      html += '<tr style="border-top:1px solid rgba(168,128,28,.25);">' +
        '<td style="padding:6px 8px;white-space:nowrap;">' + esc(when) + "</td>" +
        '<td style="padding:6px 8px;">' + esc(r.payer || "?") + (r.matched ? "" : ' <span style="color:#b3261e;">(no roster match)</span>') + "</td>" +
        '<td style="padding:6px 8px;">' + esc(r.description || r.kind || "") + "</td>" +
        '<td style="padding:6px 8px;white-space:nowrap;">$' + (Number(r.amount_cents || 0) / 100).toFixed(2) + "</td></tr>";
    });
    html += "</table></div>";
    body.innerHTML = html;
    wireOfficerDeskPicker();
  }


  function studioAbs(path) {
    var origin = (location.origin || "").replace(/\/$/, "");
    return origin + "/" + String(path || "").replace(/^\//, "");
  }

  function studioPaintQR(slot, url, label) {
    if (window.kosQR) kosQR.paint(slot, url, label);
  }

  async function studioShowEventCheckinQR(eventId, slot) {
    var client = window.__kosSb;
    if (!client) { slot.innerHTML = '<p class="empty">Sign-in client not ready. Refresh and try again.</p>'; return; }
    slot.innerHTML = '<p class="empty">Making check-in QR…</p>';
    try {
      var res = await client.rpc("officer_enable_checkin", { p_event: eventId });
      if (res.error || !res.data) throw res.error || new Error("No check-in code returned.");
      var code = res.data;
      var url = studioAbs("members.html?checkin=" + encodeURIComponent(code));
      studioPaintQR(slot, url, "Door check-in");
    } catch (e) {
      slot.innerHTML = '<p class="empty">Couldn’t make a check-in QR. ' + esc((e && e.message) || "Try again.") +
        " (Check-in codes work for krewe meetings/events the officer check-in system knows.)</p>";
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
      '<div class="wide" style="margin-top:-4px;"><p style="font-size:15px;color:var(--muted);margin:0 0 6px;line-height:1.4;">Optional. After this date/time, public signup shows Registration closed and blocks new RSVPs and ticket checkout. Leave blank to stay open. You can edit address, dates, and this close date. Saving stores a draft and does not publish.</p></div>' +
      '<div class="wide"><label for="hubEventLocation">Public location teaser</label><input id="hubEventLocation" placeholder="Members home, Tampa" />' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Safe for the public site. For a house party, keep this vague. Do not put a street address here.</p></div>' +
      '<div class="wide"><label for="hubEventMemberAddress">Private / member address</label><input id="hubEventMemberAddress" placeholder="Full street address" autocomplete="off" />' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Full address for signed-in members in the Member Hub and the RSVP confirmation email. Never shown on public pages.</p></div>' +
      '<div><label for="hubEventCapacity">Capacity</label><input id="hubEventCapacity" type="number" min="0" step="1" /></div>' +
      '<div><label for="hubEventVolunteerCap">Volunteer slots</label><input id="hubEventVolunteerCap" type="number" min="0" step="1" placeholder="No cap" />' +
      '<p class="hub-opt-hint" id="hubEventVolunteerCapHint" style="margin-top:6px;">Leave blank for no cap. When a member signs up as volunteer and a slot remains, the Hub logs pending hours for the host or an officer to confirm. A full cap blocks more volunteer signups, including parade security.</p></div>' +
      '<div class="wide"><label for="hubEventDescription">Description</label><textarea id="hubEventDescription"></textarea></div></div>' +
      '<div class="hub-event-checks"><label><input type="checkbox" id="hubEventPublic" checked /> Public event</label>' +
      '<label><input type="checkbox" id="hubEventMembersOnly" /> Members only</label>' +
      '<label><input type="checkbox" id="hubEventMandatory" /> Mandatory meeting</label>' +
      '<label><input type="checkbox" id="hubEventFeatured" /> Featured Event</label></div>' +
      '<p class="hub-opt-hint" style="margin:-4px 0 10px;">Members only: public pages show title, date, and the teaser, plus a sign-in note. Uncheck Public event to hide it from the public calendar. The street address stays off public pages either way.</p>' +
      '<div class="hub-event-grid">' +
      '<div><label for="hubEventStatus">Status</label><select id="hubEventStatus"><option value="draft">Draft</option><option value="cancelled">Cancelled</option></select></div>' +
      '<div><label for="hubEventTicketLabel">Ticket label</label><input id="hubEventTicketLabel" placeholder="e.g. Member ticket" /></div>' +
      '<div><label for="hubEventTicketPrice">Ticket price (dollars)</label><input id="hubEventTicketPrice" type="number" min="0" step="0.01" placeholder="0.00" /></div>' +
      '<div><label for="hubEventPaymentUrl">Ticket payment URL</label><input id="hubEventPaymentUrl" type="url" placeholder="https://www.zeffy.com/en-US/ticketing/..." /></div>' +
      '<div class="wide" style="grid-column:1/-1;"><div class="hub-event-checks" style="margin:0;">' +
      '<label><input type="checkbox" id="hubEventCollectGuests" checked /> Ask for guest count</label>' +
      '<label><input type="checkbox" id="hubEventCollectGuestNames" checked /> Ask for guest names</label></div>' +
      '<p style="font-size:15px;color:var(--muted);margin:6px 0 0;line-height:1.4;">Guest fields default on. Uncheck to hide them on public signup.</p></div>' +
      '<div class="wide hub-event-optional" id="hubEventRaffleBox">' +
      '<h4>Raffle tickets (optional)</h4>' +
      '<p class="hub-opt-hint">Uses the existing Raffles tool (raffle_events) plus signup qty. Uncheck to leave this event without raffle tickets. If a price is needed, enter it. Do not leave a made-up amount.</p>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventCollectRaffle" /> Offer raffle tickets</label></div>' +
      '<div class="hub-event-optional-fields" id="hubEventRaffleFields" hidden>' +
      '<div><label for="hubEventRaffleOptions">Raffle qty choices</label><input id="hubEventRaffleOptions" placeholder="0,1,5,15" value="0,1,5,15" /></div>' +
      '<div><label for="hubEventRafflePrice">Raffle ticket price (dollars)</label><input id="hubEventRafflePrice" type="number" min="0" step="0.01" placeholder="Officer enters the price" /></div>' +
      '<div style="grid-column:1/-1;"><label for="hubEventRaffleEvent">Attach existing raffle</label>' +
      '<select id="hubEventRaffleEvent"><option value="">None (qty only, or enter a price to create one)</option></select>' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Qty is saved with the signup. A price or an existing raffle links raffle_events.ticket_price. There is no hardcoded dollar amount.</p></div></div></div>' +
      '<div class="wide hub-event-optional" id="hubEventMealBox">' +
      '<h4>Meal choice (optional)</h4>' +
      '<p class="hub-opt-hint">Off unless you turn it on. Members only see meal choices on events that have them.</p>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventCollectMeals" /> Ask members to choose a meal</label></div>' +
      '<div id="hubEventMealFields" hidden>' +
      '<label for="hubEventMealOptions">Meal options (one per line)</label>' +
      '<textarea id="hubEventMealOptions" placeholder="Chicken piccata&#10;Vegetarian pasta&#10;Kids meal"></textarea>' +
      '</div></div>' +
      '<div class="wide hub-event-optional" id="hubEventOnlineBox">' +
      '<h4>Online meeting (optional)</h4>' +
      '<p class="hub-opt-hint">When this is an online event, save the open meeting join link. Signup emails that link only to the member who just registered.</p>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventOnline" /> This is an online event</label></div>' +
      '<div id="hubEventOnlineFields" hidden>' +
      '<label for="hubEventMeetingUrl">Meeting join URL</label>' +
      '<input id="hubEventMeetingUrl" type="url" inputmode="url" autocomplete="url" placeholder="https://..." />' +
      '</div></div>' +
      '<div class="wide hub-event-optional" id="hubEventParadeBox" hidden>' +
      '<h4>Parade season</h4>' +
      '<p class="hub-opt-hint">A Parade is the krewe march. Keep it Public so it appears as a recruiting card on parades.html, and Members only so there is no public march RSVP. Public teaser location only — put staging streets in Private staging address. Description is the recruiting blurb on the Parades page.</p>' +
      '<label for="hubEventRoleNotes">Role notes</label>' +
      '<textarea id="hubEventRoleNotes" placeholder="March, float, hospitality, etc."></textarea>' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Shown to signed-in members on the Hub parade card. Not shown on the public Parades page.</p>' +
      '<label for="hubEventLinkedMeeting">Mandatory meeting</label>' +
      '<select id="hubEventLinkedMeeting"><option value="">None (no Door Check-In meeting gate)</option></select>' +
      '<p class="hub-opt-hint" style="margin-top:6px;">Members can still RSVP to the parade if they missed the meeting. Parade Door Check-In warns and stays blocked until they check in at this meeting.</p>' +
      '<div class="hub-event-checks" style="margin:10px 0 8px;">' +
      '<label><input type="checkbox" id="hubEventCreateMeeting" /> Create a new mandatory meeting with this parade</label></div>' +
      '<div id="hubEventCreateMeetingFields" hidden>' +
      '<div class="hub-event-optional-fields">' +
      '<div><label for="hubEventCreateMeetingName">Meeting name</label><input id="hubEventCreateMeetingName" placeholder="Gasparilla briefing" /></div>' +
      '<div><label for="hubEventCreateMeetingStart">Meeting start</label><input id="hubEventCreateMeetingStart" type="datetime-local" /></div></div>' +
      '<div class="hub-event-checks" style="margin:8px 0 0;">' +
      '<label><input type="checkbox" id="hubEventCreateMeetingMandatory" checked /> Meeting is mandatory</label></div>' +
      '</div></div>' +
      '<div class="wide hub-event-optional" id="hubEventEmailsBox">' +
      '<h4>Scheduled krewe emails (optional)</h4>' +
      '<p class="hub-opt-hint">Queue up to three automatic emails to active members about this event: an announcement, a buy-your-tickets reminder, and a last-call warning sent two days before registration closes. Nothing sends while the event is a draft; an email that comes due goes out shortly after you publish. Save the event to store the schedule.</p>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventEmails" /> Schedule krewe emails for this event</label></div>' +
      '<div id="hubEventEmailFields" hidden>' +
      '<div class="hub-event-checks" style="margin:0 0 8px;">' +
      '<label><input type="checkbox" id="hubEventEmailAnnounce" /> 1) Announcement email</label></div>' +
      '<div class="hub-event-optional-fields" id="hubEventEmailAnnounceFields" hidden>' +
      '<div><label for="hubEventEmailAnnounceAt">Send announcement on</label><input id="hubEventEmailAnnounceAt" type="datetime-local" /></div>' +
      '<div><label for="hubEventEmailAnnounceSubject">Subject (optional)</label><input id="hubEventEmailAnnounceSubject" placeholder="New Krewe event: …" /></div></div>' +
      '<div class="hub-event-checks" style="margin:8px 0 8px;">' +
      '<label><input type="checkbox" id="hubEventEmailTicket" /> 2) Buy-your-tickets reminder</label></div>' +
      '<div class="hub-event-optional-fields" id="hubEventEmailTicketFields" hidden>' +
      '<div><label for="hubEventEmailTicketAt">Send reminder on</label><input id="hubEventEmailTicketAt" type="datetime-local" /></div>' +
      '<div><label for="hubEventEmailTicketSubject">Subject (optional)</label><input id="hubEventEmailTicketSubject" placeholder="Reminder: get your tickets" /></div>' +
      '<div style="grid-column:1/-1;"><p class="hub-opt-hint" style="margin:0;">Skips members who already paid for this event.</p></div></div>' +
      '<div class="hub-event-checks" style="margin:8px 0 8px;">' +
      '<label><input type="checkbox" id="hubEventEmailClosing" /> 3) Registration-closing warning</label></div>' +
      '<div class="hub-event-optional-fields" id="hubEventEmailClosingFields" hidden>' +
      '<div style="grid-column:1/-1;"><p class="hub-opt-hint" style="margin:0 0 6px;" id="hubEventEmailClosingWhen">Sends automatically two days before the &ldquo;Close registrations on&rdquo; date above. Set that date first to use this email.</p></div>' +
      '<div><label for="hubEventEmailClosingSubject">Subject (optional)</label><input id="hubEventEmailClosingSubject" placeholder="Last call: registration closes soon" /></div>' +
      '<div style="grid-column:1/-1;"><p class="hub-opt-hint" style="margin:0;">Skips members who already signed up for this event.</p></div></div>' +
      '<p class="hub-event-msg" id="hubEventEmailStatus" aria-live="polite" style="margin:6px 0 0;"></p>' +
      '</div></div>' +
      '<div class="wide"><label for="hubEventFlyerUrl">Event image / PDF URL</label><input id="hubEventFlyerUrl" type="url" placeholder="https://… or upload a file below" /></div>' +
      '<div class="wide"><label for="hubEventFlyerFile">Upload event image or PDF</label>' +
      '<input id="hubEventFlyerFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />' +
      '<p class="hub-flyer-note" id="hubEventFlyerNote" aria-live="polite">Upload fills the URL above. Then press Save event to attach it. Published public events show on the Events page. Check Featured Event to pin one in the Featured spot (only one at a time).</p>' +
      '<div class="hub-flyer-preview" id="hubEventFlyerPreview"></div>' +
      '<button class="btn" type="button" id="hubEventFlyerClear" style="margin-top:8px;">Clear image / PDF</button></div></div>' +
      '<p style="font-size:15px;color:var(--muted);margin:10px 0 0;">For paid tickets, create a Zeffy ticketing campaign and paste the public share link here. Sign me up / RSVP will open that checkout. Save stores a draft and does not publish. After a successful save, review the saved name, date and time, location, and ticket price. Publish appears only after you confirm those details. Cancel that review and the event is not published and nobody is notified. If the event was already public, saving moves it back to a draft until you publish again. Each paid event needs its own Zeffy link.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;"><button class="btn btn-primary" type="submit" id="hubEventSave">☘ Save event</button>' +
      '<button class="btn btn-primary" type="button" id="hubEventPublish" hidden style="display:none">Publish</button>' +
      '<button class="btn" type="button" id="hubEventNew">New / clear</button>' +
      '<button class="btn btn-danger" type="button" id="hubEventDelete" hidden style="display:none">Delete permanently</button></div>' +
      '<p class="hub-flyer-note" id="hubEventDeleteHint" hidden>To hide this event without removing it, set Status to Cancelled. Delete permanently is only for mistaken events.</p>' +
      '<p class="hub-event-msg" id="hubEventMsg" aria-live="polite"></p></form>' +
      eventDeletePanelHtml() + '</div>';
  }

  function eventDeletePanelHtml() {
    return '<div class="hub-event-delete-panel" id="hubEventDeletePanel" hidden>' +
      '<h4>Delete this event permanently?</h4>' +
      '<p id="hubEventDeleteSummary"></p>' +
      '<p>This removes the event from Event Studio and the public calendar. RSVPs for this event are deleted. Payment records stay; the event link on them is cleared. Linked raffles are unlinked, not deleted. Cancelled status hides an event without destroying it.</p>' +
      '<label for="hubEventDeleteTyped">Type the event name or Delete permanently to confirm</label>' +
      '<input id="hubEventDeleteTyped" autocomplete="off" />' +
      '<div class="hub-appr-btns" style="margin-top:10px;">' +
      '<button class="btn" type="button" id="hubEventDeleteCancel">Cancel</button>' +
      '<button class="btn btn-danger" type="button" id="hubEventDeleteGo" disabled>Delete permanently</button></div>' +
      '<p class="hub-event-msg" id="hubEventDeleteErr" aria-live="polite"></p></div>';
  }


  var FLYER_MAX_BYTES = 10 * 1024 * 1024;
  var FLYER_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  async function uploadEventFlyer(client, file) {
    var ext = FLYER_TYPES[file.type];
    if (!ext) {
      var name = (file.name || "").toLowerCase();
      if (name.endsWith(".pdf")) ext = "pdf";
      else if (name.endsWith(".jpg") || name.endsWith(".jpeg")) ext = "jpg";
      else if (name.endsWith(".png")) ext = "png";
      else if (name.endsWith(".webp")) ext = "webp";
    }
    if (!ext) throw new Error("Please choose a PDF, JPG, PNG, or WEBP file.");
    if (file.size > FLYER_MAX_BYTES) throw new Error("Files must be 10 MB or smaller.");
    var base = (file.name || "flyer").replace(/\.[^.]*$/, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "flyer";
    var path = Date.now() + "-" + base + "." + ext;
    var up = await client.storage.from("event-flyers").upload(path, file, {
      upsert: false, contentType: file.type || undefined, cacheControl: "3600"
    });
    if (up.error) throw up.error;
    return client.storage.from("event-flyers").getPublicUrl(path).data.publicUrl;
  }
  function syncFlyerPreview() {
    var urlEl = document.getElementById("hubEventFlyerUrl");
    var preview = document.getElementById("hubEventFlyerPreview");
    if (!preview) return;
    var url = urlEl ? urlEl.value.trim() : "";
    if (!url) { preview.className = "hub-flyer-preview"; preview.innerHTML = ""; return; }
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

  // ---- Scheduled krewe emails: announcement / ticket reminder / closing warning ----
  var eventStudioClient = null;
  var eventEmailHadRows = false;
  var EVENT_EMAIL_KINDS = {
    announcement: { check: "hubEventEmailAnnounce", at: "hubEventEmailAnnounceAt", subject: "hubEventEmailAnnounceSubject", label: "Announcement" },
    ticket_reminder: { check: "hubEventEmailTicket", at: "hubEventEmailTicketAt", subject: "hubEventEmailTicketSubject", label: "Ticket reminder" },
    closing_warning: { check: "hubEventEmailClosing", at: null, subject: "hubEventEmailClosingSubject", label: "Closing warning" }
  };

  function syncClosingEmailHint() {
    var hint = document.getElementById("hubEventEmailClosingWhen");
    if (!hint) return;
    var fallback = 'Sends automatically two days before the “Close registrations on” date above. Set that date first to use this email.';
    var rc = document.getElementById("hubEventRegCloses");
    var raw = rc ? rc.value : "";
    var d = raw ? new Date(raw) : null;
    if (!d || isNaN(d.getTime())) { hint.textContent = fallback; return; }
    var sendAt = new Date(d.getTime() - 2 * 24 * 60 * 60 * 1000);
    hint.textContent = "Sends automatically two days before registrations close: " +
      sendAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) + ".";
  }

  function syncVolunteerCapHint() {
    var el = document.getElementById("hubEventVolunteerCap");
    var hint = document.getElementById("hubEventVolunteerCapHint");
    if (!el || !hint) return;
    var raw = String(el.value || "").trim();
    if (raw === "") {
      hint.textContent = "Leave blank for no cap. When a member signs up as volunteer and a slot remains, the Hub logs pending hours for the host or an officer to confirm. A full cap blocks more volunteer signups, including parade security.";
      return;
    }
    var n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) {
      hint.textContent = "Enter a whole number, or leave blank for no cap.";
      return;
    }
    if (n === 0) {
      hint.textContent = "Zero volunteer slots. Volunteer signup is blocked for this event.";
      return;
    }
    hint.textContent = "Volunteer signup stops after " + n + (n === 1 ? " member" : " members") + ". Each signup logs pending hours. It will not overbook.";
  }

  function resetEventEmailFields() {
    eventEmailHadRows = false;
    var master = document.getElementById("hubEventEmails");
    if (master) master.checked = false;
    Object.keys(EVENT_EMAIL_KINDS).forEach(function (kind) {
      var m = EVENT_EMAIL_KINDS[kind];
      var check = document.getElementById(m.check); if (check) check.checked = false;
      if (m.at) { var at = document.getElementById(m.at); if (at) at.value = ""; }
      var subject = document.getElementById(m.subject); if (subject) subject.value = "";
    });
    var status = document.getElementById("hubEventEmailStatus");
    if (status) status.textContent = "";
  }

  function emailScheduleNotes(rows) {
    var notes = [];
    (rows || []).forEach(function (row) {
      var m = EVENT_EMAIL_KINDS[row.email_kind];
      if (!m || row.status === "cancelled") return;
      if (row.status === "sent") {
        notes.push(m.label + " email sent " + eventLocalDisplay(row.sent_at) +
          (row.recipient_count != null ? " to " + row.recipient_count + " members." : "."));
      } else {
        notes.push(m.label + " email scheduled for " + eventLocalDisplay(row.send_at) + ".");
      }
    });
    return notes;
  }

  async function loadEventEmailSchedule(client, eventId) {
    var status = document.getElementById("hubEventEmailStatus");
    try {
      var res = await client.rpc("officer_list_event_scheduled_emails", { p_event_id: eventId });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Not authorized.");
      var rows = Array.isArray(data.emails) ? data.emails : [];
      // The officer may have opened a different event while this loaded.
      var idEl = document.getElementById("hubEventId");
      if (!idEl || String(idEl.value) !== String(eventId)) return;
      var live = rows.filter(function (row) { return row.status !== "cancelled"; });
      eventEmailHadRows = rows.length > 0;
      if (live.length) {
        var master = document.getElementById("hubEventEmails");
        if (master) master.checked = true;
      }
      live.forEach(function (row) {
        var m = EVENT_EMAIL_KINDS[row.email_kind];
        if (!m) return;
        var check = document.getElementById(m.check); if (check) check.checked = true;
        if (m.at) { var at = document.getElementById(m.at); if (at) at.value = eventLocalInput(row.send_at); }
        var subject = document.getElementById(m.subject); if (subject) subject.value = row.subject || "";
      });
      if (status) status.textContent = emailScheduleNotes(rows).join(" ");
      syncOptionalEventFields();
    } catch (e) {
      // Schedule RPC missing or unreachable; the rest of the form still works.
      if (status) status.textContent = "";
    }
  }

  async function saveEventEmailSchedule(client, eventId, cfg) {
    function value(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
    if (!cfg.emailsOn && !eventEmailHadRows) return "";
    var status = document.getElementById("hubEventEmailStatus");
    try {
      var res = await client.rpc("officer_set_event_scheduled_emails", { p: {
        event_id: eventId,
        announcement: {
          enabled: cfg.announceOn,
          send_at: cfg.announceAt ? cfg.announceAt.toISOString() : null,
          subject: value("hubEventEmailAnnounceSubject") || null
        },
        ticket_reminder: {
          enabled: cfg.ticketOn,
          send_at: cfg.ticketAt ? cfg.ticketAt.toISOString() : null,
          subject: value("hubEventEmailTicketSubject") || null
        },
        closing_warning: {
          enabled: cfg.closingOn,
          subject: value("hubEventEmailClosingSubject") || null
        }
      } });
      if (res.error) throw res.error;
      var data = res.data || {};
      if (data.ok === false) throw new Error(data.message || "Could not save the email schedule.");
      var rows = Array.isArray(data.emails) ? data.emails : [];
      eventEmailHadRows = rows.length > 0;
      var notes = emailScheduleNotes(rows);
      if (status) status.textContent = notes.join(" ");
      if (!cfg.emailsOn) return "";
      return notes.length ? "Krewe emails: " + notes.join(" ") : "";
    } catch (e) {
      var note = "Krewe email schedule not saved: " + ((e && e.message) || e);
      if (status) status.textContent = note;
      return note;
    }
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
    function emailChecked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
    var emailsOn = emailChecked("hubEventEmails");
    showEl("hubEventEmailFields", emailsOn);
    showEl("hubEventEmailAnnounceFields", emailsOn && emailChecked("hubEventEmailAnnounce"));
    showEl("hubEventEmailTicketFields", emailsOn && emailChecked("hubEventEmailTicket"));
    showEl("hubEventEmailClosingFields", emailsOn && emailChecked("hubEventEmailClosing"));
    syncClosingEmailHint();
    syncVolunteerCapHint();
    var loc = document.getElementById("hubEventLocation");
    var membersOnly = !!(document.getElementById("hubEventMembersOnly") && document.getElementById("hubEventMembersOnly").checked);
    var paradeOn = !!(typeEl && typeEl.value === "parade");
    showEl("hubEventParadeBox", paradeOn);
    var createMeet = !!(document.getElementById("hubEventCreateMeeting") && document.getElementById("hubEventCreateMeeting").checked);
    showEl("hubEventCreateMeetingFields", paradeOn && createMeet);
    if (paradeOn) {
      var moBox = document.getElementById("hubEventMembersOnly");
      if (moBox && !moBox.dataset.kosTouched) moBox.checked = true;
      membersOnly = !!(moBox && moBox.checked);
    }
    setFieldLabel("hubEventStart", paradeOn ? "Muster / step-off start *" : "Start time *");
    setFieldLabel("hubEventEnd", paradeOn ? "Step-off window end" : "End time");
    setFieldLabel("hubEventLocation", paradeOn ? "Public teaser location" : "Public location teaser");
    setFieldLabel("hubEventMemberAddress", paradeOn ? "Private staging address" : "Private / member address");
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

  function confirmDeleteTextMatches(typed, name) {
    var t = String(typed || "").trim().toLowerCase();
    if (!t) return false;
    if (t === "delete permanently") return true;
    return t === String(name || "").trim().toLowerCase();
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

  function hideDeletePanel() {
    pendingDelete = null;
    var panel = document.getElementById("hubEventDeletePanel");
    var typed = document.getElementById("hubEventDeleteTyped");
    var err = document.getElementById("hubEventDeleteErr");
    var go = document.getElementById("hubEventDeleteGo");
    if (typed) typed.value = "";
    if (err) err.textContent = "";
    if (go) {
      go.disabled = true;
      go.textContent = "Delete permanently";
    }
    if (panel) {
      panel.hidden = true;
      panel.style.display = "none";
    }
  }

  function syncDeleteGoEnabled() {
    var go = document.getElementById("hubEventDeleteGo");
    var typed = document.getElementById("hubEventDeleteTyped");
    if (!go) return;
    go.disabled = !pendingDelete || !confirmDeleteTextMatches(typed && typed.value, pendingDelete.name);
  }

  function showDeletePanel(event) {
    var row = event || {};
    if (!row.id) return;
    pendingDelete = {
      id: row.id,
      name: row.name || "",
      start_time: row.start_time || ""
    };
    var panel = document.getElementById("hubEventDeletePanel");
    var summary = document.getElementById("hubEventDeleteSummary");
    var typed = document.getElementById("hubEventDeleteTyped");
    var err = document.getElementById("hubEventDeleteErr");
    var when = eventLocalDisplay(pendingDelete.start_time);
    if (summary) {
      summary.textContent = (pendingDelete.name || "This event") + (when ? " — " + when : "");
    }
    if (typed) typed.value = "";
    if (err) err.textContent = "";
    syncDeleteGoEnabled();
    if (panel) {
      panel.hidden = false;
      panel.style.display = "";
      panel.scrollIntoView({ behavior: "auto", block: "nearest" });
    }
    if (typed) typed.focus();
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
    var typed = document.getElementById("hubEventDeleteTyped");
    var msg = document.getElementById("hubEventMsg");
    var confirm = typed ? typed.value.trim() : "";
    if (!pendingDelete || !pendingDelete.id) {
      if (err) err.textContent = "Choose an event to delete.";
      return;
    }
    if (!confirmDeleteTextMatches(confirm, pendingDelete.name)) {
      if (err) err.textContent = "Type the event name or Delete permanently to confirm.";
      return;
    }
    if (go) {
      go.disabled = true;
      go.textContent = "Deleting…";
    }
    if (err) err.textContent = "";
    try {
      var res = await client.rpc("officer_delete_event", {
        p_event_id: pendingDelete.id,
        p_confirm: confirm
      });
      if (res.error) throw res.error;
      if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not delete event.");
      var name = (res.data && res.data.name) || pendingDelete.name || "the event";
      var id = String(pendingDelete.id);
      hideDeletePanel();
      var idEl = document.getElementById("hubEventId");
      if (idEl && String(idEl.value) === id) clearEventForm();
      if (msg) msg.textContent = "Deleted " + name + ".";
      await refreshEventStudio(client);
    } catch (e) {
      var text = (e && e.message) || String(e);
      if (err) err.textContent = text;
      if (msg) msg.textContent = "Couldn't delete: " + text;
      if (go) go.textContent = "Delete permanently";
      syncDeleteGoEnabled();
    }
  }

  function wireEventDelete(client) {
    var formBtn = document.getElementById("hubEventDelete");
    if (formBtn) {
      formBtn.addEventListener("click", function () {
        showDeletePanel(eventFromFormForDelete());
      });
    }
    var cancel = document.getElementById("hubEventDeleteCancel");
    if (cancel) {
      cancel.addEventListener("click", function () {
        hideDeletePanel();
        var msg = document.getElementById("hubEventMsg");
        if (msg) msg.textContent = "Delete cancelled. Nothing was removed.";
      });
    }
    var go = document.getElementById("hubEventDeleteGo");
    if (go) {
      go.addEventListener("click", function () { runDeleteEvent(client); });
    }
    var typed = document.getElementById("hubEventDeleteTyped");
    if (typed) {
      typed.addEventListener("input", syncDeleteGoEnabled);
      typed.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runDeleteEvent(client);
        }
      });
    }
  }

  function clearEventForm() {
    var form = document.getElementById("hubEventForm");
    if (!form) return;
    form.reset();
    document.getElementById("hubEventId").value = "";
    document.getElementById("hubEventPublic").checked = true;
    var moOnly = document.getElementById("hubEventMembersOnly");
    if (moOnly) { moOnly.checked = false; delete moOnly.dataset.kosTouched; }
    var ma = document.getElementById("hubEventMemberAddress"); if (ma) ma.value = "";
    document.getElementById("hubEventMandatory").checked = false;
    document.getElementById("hubEventFeatured").checked = false;
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
    var lm = document.getElementById("hubEventLinkedMeeting"); if (lm) lm.value = "";
    var cmMeet = document.getElementById("hubEventCreateMeeting"); if (cmMeet) cmMeet.checked = false;
    var cmn = document.getElementById("hubEventCreateMeetingName"); if (cmn) cmn.value = "";
    var cms = document.getElementById("hubEventCreateMeetingStart"); if (cms) cms.value = "";
    var cmm = document.getElementById("hubEventCreateMeetingMandatory"); if (cmm) cmm.checked = true;
    var rn = document.getElementById("hubEventRoleNotes"); if (rn) rn.value = "";
    var rcClear = document.getElementById("hubEventRegCloses"); if (rcClear) rcClear.value = "";
    resetEventEmailFields();
    document.getElementById("hubEventStatus").value = "draft";
    var payClear = document.getElementById("hubEventPaymentUrl"); if (payClear) payClear.value = "";
    document.getElementById("hubEventType").value = "social";
    document.getElementById("hubEventFormTitle").textContent = "New event";
    document.getElementById("hubEventMsg").textContent = "";
    hidePublishButton();
    showEventDeleteButton(false);
    hideDeletePanel();
    var note = document.getElementById("hubEventFlyerNote");
    if (note) note.textContent = "Upload fills the URL above. Then press Save event to attach it. Published public events show on the Events page.";
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
    var vcap = get("hubEventVolunteerCap");
    if (vcap) vcap.value = event.volunteer_cap == null ? "" : event.volunteer_cap;
    get("hubEventDescription").value = event.description || "";
    get("hubEventPublic").checked = event.is_public !== false;
    var monly = get("hubEventMembersOnly");
    if (monly) { monly.checked = !!event.members_only; monly.dataset.kosTouched = "1"; }
    get("hubEventMandatory").checked = !!event.is_mandatory;
    get("hubEventFeatured").checked = !!event.is_featured;
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
    if (get("hubEventType").value !== typeVal && typeVal) get("hubEventType").value = "other";
    var onl = get("hubEventOnline"); if (onl) onl.checked = !!event.is_online || typeVal === "online";
    var mu = get("hubEventMeetingUrl"); if (mu) mu.value = event.meeting_url || "";
    fillLinkedMeetingSelect(event.linked_meeting_id || "");
    var rnFill = get("hubEventRoleNotes"); if (rnFill) rnFill.value = event.notes || "";
    var cmMeetFill = get("hubEventCreateMeeting"); if (cmMeetFill) cmMeetFill.checked = false;
    var cmnFill = get("hubEventCreateMeetingName"); if (cmnFill) cmnFill.value = "";
    var cmsFill = get("hubEventCreateMeetingStart"); if (cmsFill) cmsFill.value = "";
    get("hubEventFlyerUrl").value = event.flyer_url || "";
    resetEventEmailFields();
    if (event.id && eventStudioClient) loadEventEmailSchedule(eventStudioClient, event.id);
    syncFlyerPreview();
    syncOptionalEventFields();
    get("hubEventFormTitle").textContent = "Edit event";
    get("hubEventMsg").textContent = "";
    showEventDeleteButton(!!event.id);
    hideDeletePanel();
    var wrap = document.getElementById("hubEventFormWrap");
    if (wrap) wrap.scrollIntoView({ behavior: "auto", block: "nearest" });
  }
  function renderEventList(list) {
    var target = document.getElementById("hubEventList");
    if (!target) return;
    if (!list.length) {
      target.innerHTML = '<p class="empty">No Krewe events yet. Create the first one below. After you save, you can make RSVP and door check-in QR codes here.</p>';
      return;
    }
    var html = "";
    list.forEach(function (event) {
      var details = [];
      if (event.start_time) details.push(eventLocalDisplay(event.start_time) + (event.end_time ? " - " + eventLocalDisplay(event.end_time) : ""));
      if (event.location) details.push(event.location);
      if (event.member_address) details.push("Member address set");
      if (event.members_only) details.push("Members only");
      if (event.linked_meeting_id) details.push("Linked meeting");
      if (event.registration_closes_at) details.push("Regs close " + eventLocalDisplay(event.registration_closes_at));
      var ticket = event.ticket_price_cents != null ? " · $" + (Number(event.ticket_price_cents) / 100).toFixed(2) : "";
      var readOnly = String(event.source || "").toLowerCase() === "ikc";
      var eid = esc(event.id);
      var flyer = event.flyer_url || "";
      var thumb = flyer
        ? (/\.pdf(?:$|[?#])/i.test(flyer)
            ? '<div class="hub-event-thumb ph">PDF</div>'
            : '<img class="hub-event-thumb" src="' + esc(flyer) + '" alt="" />')
        : '<div class="hub-event-thumb ph">No image</div>';
      html += '<div class="hub-event-row">' + thumb + '<div class="hub-event-copy"><b>' + esc(event.name) + '</b>' +
        '<div class="muted">' + esc(details.join(" · ") || "Date to be announced") + '</div>' +
        '<div class="muted">' + esc(event.status || "published") + (event.event_type ? " · " + esc(event.event_type) : "") + esc(ticket) +
        (event.is_featured ? " · Featured" : "") +
        (event.collect_raffle || event.raffle_event_id ? " · raffle" : "") +
        (event.collect_meals ? " · meals" : "") +
        (event.members_only ? " · members only" : "") +
        (event.is_online || event.event_type === "online" ? " · online" : "") +
        (flyer ? " · has image/PDF" : " · add image/PDF") +
        (readOnly ? " · IKC event (read-only)" : "") + '</div></div>' +
        (readOnly ? "" : '<div class="hub-appr-btns">' +
          '<button class="btn btn-primary" type="button" data-event-edit="' + eid + '">Edit event</button>' +
          '<button class="btn" type="button" data-event-rsvp-qr="' + eid + '">▦ RSVP QR</button>' +
          '<button class="btn btn-primary" type="button" data-event-checkin-qr="' + eid + '">▦ Door check-in QR</button>' +
          '<button class="btn btn-danger" type="button" data-event-delete="' + eid + '">Delete permanently</button>' +
        '</div>') +
        '<div class="qr-slot" data-event-qr-slot="' + eid + '" style="flex-basis:100%;margin-top:8px;"></div></div>';
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
        if (event && String(event.source || "").toLowerCase() !== "ikc") showDeletePanel(event);
      });
    });
    target.querySelectorAll("[data-event-rsvp-qr]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-event-rsvp-qr");
        var slot = target.querySelector('[data-event-qr-slot="' + id + '"]');
        var url = studioAbs("event-signup.html?event=" + encodeURIComponent(id));
        studioPaintQR(slot, url, "RSVP / Sign me up");
      });
    });
    target.querySelectorAll("[data-event-checkin-qr]").forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-event-checkin-qr");
        var slot = target.querySelector('[data-event-qr-slot="' + id + '"]');
        studioShowEventCheckinQR(id, slot);
      });
    });
  }

  async function refreshEventStudio(client) {
    var target = document.getElementById("hubEventList");
    if (!target) return;
    target.innerHTML = '<p class="empty">Loading events…</p>';
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
    var volunteerCapValue = value("hubEventVolunteerCap");
    var ticketValue = value("hubEventTicketPrice");
    var capacity = capacityValue === "" ? null : parseInt(capacityValue, 10);
    var volunteerCap = volunteerCapValue === "" ? null : parseInt(volunteerCapValue, 10);
    var dollars = ticketValue === "" ? null : Number(ticketValue);
    if (capacityValue !== "" && (isNaN(capacity) || capacity < 0)) { if (msg) msg.textContent = "Capacity must be a whole number."; return; }
    if (volunteerCapValue !== "" && (isNaN(volunteerCap) || volunteerCap < 0)) { if (msg) msg.textContent = "Volunteer slots must be a whole number, or blank for no cap."; return; }
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
    function boxChecked(id) { var el = document.getElementById(id); return !!(el && el.checked); }
    var emailsOn = boxChecked("hubEventEmails");
    var emailCfg = {
      emailsOn: emailsOn,
      announceOn: emailsOn && boxChecked("hubEventEmailAnnounce"),
      ticketOn: emailsOn && boxChecked("hubEventEmailTicket"),
      closingOn: emailsOn && boxChecked("hubEventEmailClosing"),
      announceAt: null,
      ticketAt: null
    };
    if (emailCfg.announceOn) {
      var annValue = value("hubEventEmailAnnounceAt");
      emailCfg.announceAt = annValue ? new Date(annValue) : null;
      if (!emailCfg.announceAt || isNaN(emailCfg.announceAt.getTime())) {
        if (msg) msg.textContent = "Pick a send date/time for the announcement email.";
        return;
      }
    }
    if (emailCfg.ticketOn) {
      var tickValue = value("hubEventEmailTicketAt");
      emailCfg.ticketAt = tickValue ? new Date(tickValue) : null;
      if (!emailCfg.ticketAt || isNaN(emailCfg.ticketAt.getTime())) {
        if (msg) msg.textContent = "Pick a send date/time for the ticket reminder email.";
        return;
      }
    }
    if (emailCfg.closingOn && !regClose) {
      if (msg) msg.textContent = "Set “Close registrations on” above to schedule the registration-closing warning email.";
      return;
    }
    var payload = {
      id: value("hubEventId") || null, name: value("hubEventName"), start_time: start.toISOString(),
      end_time: end ? end.toISOString() : null, location: value("hubEventLocation") || null,
      member_address: value("hubEventMemberAddress") || null,
      description: value("hubEventDescription") || null, event_type: value("hubEventType") || "other",
      capacity: capacity, volunteer_cap: volunteerCap, is_public: !!document.getElementById("hubEventPublic").checked,
      members_only: !!(document.getElementById("hubEventMembersOnly") && document.getElementById("hubEventMembersOnly").checked),
      is_mandatory: !!document.getElementById("hubEventMandatory").checked,
      is_featured: !!document.getElementById("hubEventFeatured").checked,
      status: value("hubEventStatus") === "cancelled" ? "cancelled" : "draft",
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
      var savedEventId = (res.data && res.data.event && res.data.event.id) || payload.id;
      var capNote = "";
      if (savedEventId) {
        try {
          var capRes = await client.rpc("officer_set_volunteer_cap", {
            p_event: savedEventId,
            p_cap: payload.volunteer_cap
          });
          if (capRes.error || (capRes.data && capRes.data.ok === false)) {
            capNote = " Volunteer slots were not saved. Apply sql/kos_hub_volunteer_hours.sql, then save again.";
          }
        } catch (capErr) {
          capNote = " Volunteer slots were not saved. Apply sql/kos_hub_volunteer_hours.sql, then save again.";
        }
      }
      var emailNote = "";
      if (savedEventId) {
        emailNote = await saveEventEmailSchedule(client, savedEventId, emailCfg);
      } else if (emailCfg.emailsOn) {
        emailNote = "Krewe email schedule not saved: the saved event id was not returned. Edit the event and save again.";
      }
      if (save) { save.disabled = false; save.textContent = "☘ Save event"; }
      finishSavedReview(msg, res, payload, cleared,
        "You can make an RSVP QR or a Door check-in QR from the list above." + (emailNote ? " " + emailNote : "") + capNote);
    } catch (e) { if (msg) msg.textContent = "Couldn't save: " + ((e && e.message) || e); }
    if (save) { save.disabled = false; save.textContent = "☘ Save event"; }
  }
  var eventStudioLoading = null;
  async function loadEventStudio(client) {
    if (document.getElementById("hubEventForm")) return;
    if (eventStudioLoading) return eventStudioLoading;
    eventStudioLoading = loadEventStudioNow(client).finally(function () { eventStudioLoading = null; });
    return eventStudioLoading;
  }
  async function loadEventStudioNow(client) {
    window.__kosHubOwnsEventStudio = true;
    if (!state.canManageEvents) return;
    eventStudioClient = client;
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
      else panel.appendChild(card);
    }
    card.innerHTML =
      '<div class="app-head"><span class="ic">📅</span><div><h2>Event Studio</h2><small>Add or edit events, then make RSVP and door check-in QR codes. Save stores a draft. Publish only after you review.</small></div></div>' +
      '<div class="app-body">' +
      '<p style="font-size:16px;color:var(--muted);margin:0 0 12px;">Tap <b>Edit event</b> on any published row to change address, start/end, or registration close. How QR works: <b>save the event</b>, then tap <b>RSVP QR</b> (flyer/table tent) or <b>Door check-in QR</b> (projector at the door). The square is just that link. Saving stores a draft and does not publish.</p>' +
      '<div class="hub-event-list"><h3>Events</h3><div id="hubEventList"><p class="empty">Loading events…</p></div></div>' +
      eventStudioFormHtml() + '</div>';
    document.getElementById("hubEventForm").addEventListener("submit", function (e) {
      e.preventDefault(); saveEventStudio(client);
    });
    document.getElementById("hubEventNew").addEventListener("click", clearEventForm);
    wireEventDelete(client);
    var publishBtn = document.getElementById("hubEventPublish");
    if (publishBtn) publishBtn.addEventListener("click", function () { publishReviewedEvent(client); });
    var eventForm = document.getElementById("hubEventForm");
    if (eventForm) {
      eventForm.addEventListener("input", onEventFormEdited);
      eventForm.addEventListener("change", onEventFormEdited);
    }
    ["hubEventType", "hubEventCollectRaffle", "hubEventCollectMeals", "hubEventOnline", "hubEventMembersOnly",
      "hubEventCreateMeeting", "hubEventVolunteerCap",
      "hubEventEmails", "hubEventEmailAnnounce", "hubEventEmailTicket", "hubEventEmailClosing"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", syncOptionalEventFields);
    });
    var vcapEl = document.getElementById("hubEventVolunteerCap");
    if (vcapEl) vcapEl.addEventListener("input", syncVolunteerCapHint);
    var moTouch = document.getElementById("hubEventMembersOnly");
    if (moTouch) moTouch.addEventListener("change", function () { moTouch.dataset.kosTouched = "1"; });
    var regClosesEl = document.getElementById("hubEventRegCloses");
    if (regClosesEl) {
      regClosesEl.addEventListener("input", syncClosingEmailHint);
      regClosesEl.addEventListener("change", syncClosingEmailHint);
    }
    var rafflePick = document.getElementById("hubEventRaffleEvent");
    if (rafflePick) rafflePick.addEventListener("change", onRaffleEventPicked);
    var flyerFile = document.getElementById("hubEventFlyerFile");
    if (flyerFile) flyerFile.addEventListener("change", async function () {
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
    wireOfficerDeskPicker();
  }

  // Each bottom tab keeps its own stack. History entries mirror the visible
  // stack so the system back button, Android back, and the iOS edge swipe
  // pop a screen instead of leaving the hub. Back from a tab root returns
  // to Home. Back from Home is the browser's own back, and it does not sign out.
  function installAppNav() {
    var TAB_IDS = ["hub", "events", "parade", "krewe", "fun", "officer", "give"];
    var appNav = {
      tab: "hub",
      stacks: null,
      scroll: {},
      depth: 0,
      booted: false,
      userMoved: false,
      writing: false,
      pending: null,
      funFrom: "hub",
      motion: ""
    };

    function freshStacks() {
      var o = {};
      TAB_IDS.forEach(function (t) { o[t] = [{ kind: "root" }]; });
      return o;
    }

    function ensure() {
      if (!appNav.stacks) appNav.stacks = freshStacks();
    }

    function framesOf(tab) {
      ensure();
      if (!appNav.stacks[tab]) appNav.stacks[tab] = [{ kind: "root" }];
      return appNav.stacks[tab];
    }

    function desiredDepth(tab, frames) {
      var extra = Math.max(0, (frames ? frames.length : 1) - 1);
      if (tab === "hub") return extra;
      return 1 + extra;
    }

    function slim(frames) {
      return (frames || []).map(function (fr) {
        var row = { kind: fr.kind || "root", id: fr.id || "", title: fr.title || "" };
        if (fr.section) row.section = fr.section;
        return row;
      });
    }

    function hashFor(tab, frames) {
      var top = frames && frames.length ? frames[frames.length - 1] : { kind: "root" };
      if (top.kind === "event" && top.id) return "#events/" + encodeURIComponent(top.id);
      if (top.kind === "focus") {
        if (top.id === "docs") return "#docs";
        if (top.id === "hubHoursCard") return "#hours";
        if (top.id === "shareCard") return "#share";
        if (top.id === "carpoolCard") return "#parade/carpool";
        if (top.id === "hubMemberDirectory") return "#directory";
        if (top.id === "hubFaq") return top.section ? ("#faq-" + top.section) : "#faq";
        return "#parade";
      }
      if (top.kind === "card") return "#card";
      if (top.kind === "getapp") return "#get-app";
      if (top.kind === "ann" && top.id) return "#tidings/" + encodeURIComponent(top.id);
      if (tab === "hub") return "#home";
      if (tab === "parade") return "#parade";
      if (tab === "krewe") return "#krewe";
      return "#" + tab;
    }

    function stateObj() {
      return {
        kosHub: {
          tab: appNav.tab,
          frames: slim(framesOf(appNav.tab)),
          depth: appNav.depth,
          funFrom: appNav.funFrom || "hub"
        }
      };
    }

    function writeHistory(method) {
      appNav.writing = true;
      try {
        history[method](stateObj(), "", hashFor(appNav.tab, framesOf(appNav.tab)));
      } catch (e) {}
      setTimeout(function () { appNav.writing = false; }, 0);
    }

    function routeFromHash(raw) {
      var h = "";
      try { h = decodeURIComponent(String(raw || "").replace(/^#/, "")); } catch (e) { h = String(raw || "").replace(/^#/, ""); }
      var lower = h.toLowerCase();
      if (lower.indexOf("craic") === 0) return null;
      if (!lower || lower === "home" || lower === "hub") return { tab: "hub", frames: [{ kind: "root" }] };
      var evMatch = h.match(/^events\/(.+)$/i);
      if (evMatch) return { tab: "events", frames: [{ kind: "root" }, { kind: "event", id: evMatch[1], title: "Event" }] };
      if (lower === "events") return { tab: "events", frames: [{ kind: "root" }] };
      if (lower === "parade" || lower === "desk") return { tab: "parade", frames: [{ kind: "root" }] };
      if (lower === "docs") return { tab: "parade", frames: [{ kind: "root" }, { kind: "focus", id: "docs", title: "Documents" }] };
      if (lower === "hours" || lower === "volunteer") return { tab: "parade", frames: [{ kind: "root" }, { kind: "focus", id: "hubHoursCard", title: "Volunteer hours" }] };
      if (lower === "share") return { tab: "parade", frames: [{ kind: "root" }, { kind: "focus", id: "shareCard", title: "Share your media" }] };
      if (faqHashSection(lower) !== null) {
        var faqFrame = { kind: "focus", id: "hubFaq", title: "FAQ" };
        if (faqHashSection(lower)) faqFrame.section = faqHashSection(lower);
        return { tab: "parade", frames: [{ kind: "root" }, faqFrame] };
      }
      if (lower === "parade/carpool" || lower === "carpool") return { tab: "parade", frames: [{ kind: "root" }, { kind: "focus", id: "carpoolCard", title: "Carpool" }] };
      if (lower === "directory") return { tab: "krewe", frames: [{ kind: "root" }, { kind: "focus", id: "hubMemberDirectory", title: "Directory" }] };
      if (lower === "krewe" || lower === "me") return { tab: "krewe", frames: [{ kind: "root" }] };
      if (lower === "card") return { tab: "hub", frames: [{ kind: "root" }, { kind: "card", title: "Member card" }] };
      if (lower === "get-app" || lower === "getapp") return { tab: "hub", frames: [{ kind: "root" }, { kind: "getapp", title: "Get the App" }] };
      var tidingsMatch = h.match(/^tidings\/(.+)$/i);
      if (tidingsMatch) return { tab: "hub", frames: [{ kind: "root" }, { kind: "ann", id: tidingsMatch[1], title: "Krewe Tidings" }] };
      if (lower === "fun") return { tab: "fun", frames: [{ kind: "root" }] };
      if (lower === "officer") return { tab: "officer", frames: [{ kind: "root" }] };
      if (lower === "applications") return { tab: "officer", frames: [{ kind: "root" }], tool: "applications" };
      if (lower === "event-studio") return { tab: "officer", frames: [{ kind: "root" }], tool: "event-studio" };
      return null;
    }

    function findHubEvent(id) {
      var key = String(id || "");
      if (!key) return null;
      var pools = [state.hubEvents, state.nextEvents, state.paradeSeason];
      if (state.nextEvent) pools.push([state.nextEvent]);
      if (state.nextParade) pools.push([state.nextParade]);
      var i, j, row, meet;
      for (i = 0; i < pools.length; i++) {
        var list = pools[i] || [];
        for (j = 0; j < list.length; j++) {
          row = list[j];
          if (!row) continue;
          if (String(row.id) === key) return row;
          meet = row.meeting;
          if (meet && String(meet.id) === key) return meet;
        }
      }
      return null;
    }

    function saveScroll() {
      if (document.body.classList.contains("app-screen")) return;
      var panel = document.querySelector("[data-hub-panel].hub-on");
      if (!panel) return;
      var top = framesOf(appNav.tab).slice(-1)[0];
      if (top && top.kind !== "root") return;
      appNav.scroll[appNav.tab] = panel.scrollTop || 0;
    }

    function restoreScroll(forceTop) {
      var panel = document.querySelector('[data-hub-panel="' + appNav.tab + '"]');
      if (!panel || document.body.classList.contains("app-screen") || document.body.classList.contains("app-focus")) return;
      var y = forceTop ? 0 : (appNav.scroll[appNav.tab] || 0);
      if (forceTop) appNav.scroll[appNav.tab] = 0;
      try { panel.scrollTop = y; } catch (e) {}
    }

    function showBack(title) {
      var back = document.getElementById("appBackBar");
      var rootBar = document.getElementById("appRootBar");
      var label = document.getElementById("appBackTitle");
      if (back) back.hidden = false;
      if (rootBar) rootBar.hidden = true;
      if (label) label.textContent = title || "Back";
    }

    function showRootBar() {
      var back = document.getElementById("appBackBar");
      var rootBar = document.getElementById("appRootBar");
      if (back) back.hidden = true;
      if (rootBar) rootBar.hidden = false;
    }

    function clearFocusMarks() {
      document.querySelectorAll(".app-focus-target").forEach(function (el) {
        el.classList.remove("app-focus-target");
      });
    }

    function markOriginTab() {
      if (appNav.tab !== "fun") return;
      var origin = appNav.funFrom || "hub";
      document.querySelectorAll("[data-hub-tab]").forEach(function (btn) {
        var id = btn.getAttribute("data-hub-tab");
        var on = id === origin;
        btn.classList.toggle("on", on);
        if (on) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
      });
    }

    function addEventCalendar(ev) {
      if (!ev || !ev.start_time) {
        showToast("This event does not have a date yet.");
        return;
      }
      if (window.kosCalendar && typeof window.kosCalendar.download === "function") {
        window.kosCalendar.download({
          id: ev.id,
          name: ev.name,
          start_time: ev.start_time,
          end_time: ev.end_time,
          location: ev.location,
          description: ev.description || ""
        });
        return;
      }
      showToast("Calendar download is not available in this browser.");
    }

    async function rsvpFromDetail(ev, btn) {
      var client = window.__kosSb;
      if (!client) {
        showToast("RSVP needs a connection. The full signup form is linked below.");
        return;
      }
      var p = window.kosProfile || {};
      var email = p.email || "";
      var last = p.last_name || "";
      if (!email || !last) {
        showToast("Your profile needs a first name, last name, and email to RSVP.");
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
      try {
        var res = await client.rpc("rsvp_to_event", {
          p_event_id: ev.id,
          p_first_name: p.first_name || firstName(),
          p_last_name: last,
          p_email: email,
          p_guests_count: 0,
          p_signup_role: "attendee"
        });
        if (res.error) throw res.error;
        if (res.data && res.data.ok === false) throw new Error(res.data.message || "Could not RSVP.");
        if (btn) { btn.textContent = "You're going"; btn.disabled = true; }
        showToast((res.data && res.data.message) || "You're signed up.");
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = "RSVP"; }
        showToast((err && err.message) || "Could not RSVP. Try again.");
      }
    }

    function paintEvent(id) {
      var scroll = document.getElementById("appDrillScroll");
      var actions = document.getElementById("appDrillActions");
      var ev = findHubEvent(id);
      if (!scroll || !actions) return;
      if (!ev) {
        showBack("Event");
        scroll.innerHTML = '<div class="app-detail"><p>That event is not on your calendar yet.</p></div>';
        actions.innerHTML = "";
        return;
      }
      showBack(ev.name || "Event");
      var bits = appEventBits(ev.start_time);
      var when = bits ? bits.line : whenLabel(ev.start_time);
      var loc = ev.member_address || ev.location || "";
      var desc = ev.description ? String(ev.description) : "";
      var more = ev.id
        ? '<p><a class="app-detail-more" href="event-signup.html?event=' + encodeURIComponent(ev.id) + '">Full signup form</a></p>'
        : "";
      scroll.innerHTML =
        '<article class="app-detail" id="appEventDetail">' +
        '<p class="app-detail-kicker">' + esc(String(ev.event_type || "event")) + "</p>" +
        "<h2>" + esc(ev.name || "Krewe event") + "</h2>" +
        "<p>" + esc(when) + (ev.members_only ? " · Members only" : "") + "</p>" +
        (loc ? "<p>" + esc(loc) + "</p>" : "") +
        (desc ? "<p>" + esc(desc) + "</p>" : "") +
        more +
        "<p>RSVP here keeps you on this screen. Use the full signup form for guests, tickets, or meals.</p>" +
        "</article>";
      actions.innerHTML =
        '<button type="button" class="app-rsvp" id="appRsvpBtn">RSVP</button>' +
        '<button type="button" class="app-cal" id="appCalBtn">Add to calendar</button>';
      var rsvpBtn = document.getElementById("appRsvpBtn");
      var calBtn = document.getElementById("appCalBtn");
      if (ev.parade_rsvpd || ev.rsvpd) {
        if (rsvpBtn) { rsvpBtn.textContent = "You're going"; rsvpBtn.disabled = true; }
      }
      if (rsvpBtn) rsvpBtn.addEventListener("click", function () { rsvpFromDetail(ev, rsvpBtn); });
      if (calBtn) calBtn.addEventListener("click", function () { addEventCalendar(ev); });
    }

    function paintCard() {
      var scroll = document.getElementById("appDrillScroll");
      var actions = document.getElementById("appDrillActions");
      showBack("Member card");
      if (actions) actions.innerHTML = "";
      if (!scroll) return;
      var p = window.kosProfile || {};
      var name = (p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Krewe member").toString().trim();
      var title = (p.officer_title || "").toString().trim();
      var since = (p.parade_since || "").toString().trim();
      var email = (p.email || "").toString().trim();
      scroll.innerHTML =
        '<div class="app-detail"><div class="app-pass">' +
        '<img src="assets/img/emblem-shamrock.png" alt="Krewe of Shamrock emblem" />' +
        '<p class="app-pass-kicker">Krewe of Shamrock</p>' +
        "<h2>" + esc(name) + "</h2>" +
        (title ? '<p class="app-pass-title">' + esc(title) + "</p>" : "") +
        (email ? "<p>" + esc(email) + "</p>" : "") +
        '<ul class="app-pass-facts"><li>' + esc(plainStanding()) + "</li><li>" + esc(plainParadeReady()) + "</li>" +
        (since ? "<li>Marching since " + esc(since) + "</li>" : "") +
        "</ul><p>Show this card at the float. It uses the profile and Parade Ready details already on your account.</p></div></div>";
    }

    function renderTop(motion) {
      var top = framesOf(appNav.tab).slice(-1)[0] || { kind: "root" };
      var drill = document.getElementById("appDrill");
      document.body.classList.remove("app-screen", "app-focus", "app-nav-push", "app-nav-pop", "app-getapp", "app-ann");
      clearFocusMarks();
      var skipHome = !(appNav.tab === "hub" && top.kind === "root");
      showTab(appNav.tab, { skipScroll: true, skipHomeRender: skipHome });
      if (!(top.kind === "focus" && top.id === "hubFaq")) clearFaqMode();
      if (top.kind === "root") {
        if (drill) drill.hidden = true;
        if (appNav.tab === "fun") showBack("Craic Cup");
        else showRootBar();
        markOriginTab();
        paintAppHeader(appNav.tab === "fun" ? (appNav.funFrom || "hub") : appNav.tab);
        restoreScroll(false);
      } else if (top.kind === "focus") {
        if (drill) drill.hidden = true;
        var el = document.getElementById(top.id);
        if (el) el.classList.add("app-focus-target");
        if (top.id === "hubFaq") {
          /* Keep the desk masthead and topic pills. Swap the answer in place
             and do not scroll the page or the panel when a pill changes. */
          showBack(top.title || "FAQ");
          var paradePanel = document.querySelector('[data-hub-panel="parade"]');
          var alreadyFaq = !!(paradePanel && paradePanel.classList.contains("desk-faq-on"));
          applyFaqView(top.section || "");
          if (paradePanel && !alreadyFaq) paradePanel.scrollTop = 0;
        } else {
          /* Carpool and volunteer hours are single tools. Documents, share, and
             the directory stay on the desk so the rest of that desk remains visible. */
          if (top.id === "carpoolCard" || top.id === "hubHoursCard") document.body.classList.add("app-focus");
          showBack(top.title || "Back");
          var panel = document.querySelector("[data-hub-panel].hub-on");
          if (document.body.classList.contains("hub-app")) {
            if (panel && el && document.body.classList.contains("app-focus")) panel.scrollTop = 0;
            else if (panel && el) panel.scrollTop = Math.max(0, (el.offsetTop || 0) - 8);
          } else if (el && el.getBoundingClientRect) {
            var rect = el.getBoundingClientRect();
            if (rect.top < 72 || rect.bottom > window.innerHeight - 16) {
              el.scrollIntoView({ behavior: "auto", block: "nearest" });
            }
          }
        }
      } else if (top.kind === "event") {
        if (drill) drill.hidden = false;
        document.body.classList.add("app-screen");
        paintEvent(top.id);
      } else if (top.kind === "card") {
        if (drill) drill.hidden = false;
        document.body.classList.add("app-screen");
        paintCard();
      } else if (top.kind === "getapp") {
        if (drill) drill.hidden = false;
        document.body.classList.add("app-screen", "app-getapp");
        paintGetApp();
      } else if (top.kind === "ann") {
        if (drill) drill.hidden = false;
        document.body.classList.add("app-screen", "app-ann");
        paintAnnouncement(top.id);
      } else {
        if (drill) drill.hidden = true;
        showRootBar();
      }
      if (motion === "push" || motion === "pop") {
        document.body.classList.add(motion === "push" ? "app-nav-push" : "app-nav-pop");
      }
      if (top.kind === "root" && appNav.tab === "hub") startCountdown();
    }

    function applyRoute(tab, frames, motion) {
      ensure();
      appNav.tab = tab;
      appNav.stacks[tab] = frames && frames.length ? frames : [{ kind: "root" }];
      appNav.depth = desiredDepth(tab, appNav.stacks[tab]);
      renderTop(motion || "");
    }

    function seed(route) {
      ensure();
      var tab = route.tab;
      var frames = route.frames && route.frames.length ? route.frames : [{ kind: "root" }];
      var levels = [];
      if (tab !== "hub" || frames.length > 1) levels.push({ tab: "hub", frames: [{ kind: "root" }] });
      if (tab !== "hub") levels.push({ tab: tab, frames: [{ kind: "root" }] });
      if (frames.length > 1 || (tab === "hub" && frames.length > 1)) levels.push({ tab: tab, frames: frames });
      if (tab !== "hub" && frames.length > 1) {
        /* the tab root level is already queued; the last push is the drill */
      }
      if (!levels.length) levels.push({ tab: "hub", frames: [{ kind: "root" }] });
      /* Drop a duplicate root if the drill level repeats it. */
      var seen = {};
      levels = levels.filter(function (lv) {
        var key = lv.tab + ":" + (lv.frames.length) + ":" + (lv.frames[lv.frames.length - 1].kind);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
      levels.forEach(function (lv, i) {
        appNav.tab = lv.tab;
        appNav.stacks[lv.tab] = lv.frames;
        appNav.depth = desiredDepth(lv.tab, lv.frames);
        writeHistory(i === 0 ? "replaceState" : "pushState");
      });
      renderTop("");
      if (route.tool === "applications") {
        try { sessionStorage.setItem("kosOfficerTool", "tool:hubApplications"); } catch (e1) {}
        try { wireOfficerDeskPicker(); } catch (e2) {}
        try { openOfficerTool("tool:hubApplications", false); } catch (e3) {}
      }
      if (route.tool === "event-studio") {
        try { wireOfficerDeskPicker(); } catch (e4) {}
        try { openOfficerTool("tool:hubEventStudio", false); } catch (e5) {}
      }
    }

    function sameFrames(a, b) {
      a = a || [];
      b = b || [];
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) {
        if ((a[i].kind || "root") !== (b[i].kind || "root")) return false;
        if (String(a[i].id || "") !== String(b[i].id || "")) return false;
        if (String(a[i].section || "") !== String(b[i].section || "")) return false;
      }
      return true;
    }

    function pushFrames(tab, frames, motion) {
      ensure();
      saveScroll();
      if (tab !== appNav.tab && frames.length === 1 && frames[0].kind === "root") {
        switchTab(tab);
        return;
      }
      var cur = framesOf(appNav.tab);
      if (tab === appNav.tab && sameFrames(cur, frames)) {
        renderTop("");
        return;
      }
      appNav.tab = tab;
      appNav.stacks[tab] = frames;
      appNav.depth = desiredDepth(tab, frames);
      writeHistory("pushState");
      renderTop(motion || "push");
    }

    function switchTab(tab) {
      ensure();
      if (roleFixture && ("officer" in roleFixture)) state.officer = !!roleFixture.officer;
      if (roleFixture && ("canManageEvents" in roleFixture)) state.canManageEvents = !!roleFixture.canManageEvents;
      if (roleFixture && ("canReviewHours" in roleFixture)) state.canReviewHours = !!roleFixture.canReviewHours;
      if (!tab) tab = "hub";
      if (tab === "officer" && !canOpenOfficerDesk()) tab = "hub";
      if (tab !== "parade") clearHoursIntent();
      if (tab === appNav.tab) {
        var cur = framesOf(tab);
        if (cur.length > 1) {
          var drop = cur.length - 1;
          appNav.stacks[tab] = [{ kind: "root" }];
          appNav.scroll[tab] = 0;
          if (appNav.depth >= drop) {
            appNav.pending = { tab: tab, frames: [{ kind: "root" }], scrollTop: true };
            try { history.go(-drop); } catch (e) { applyRoute(tab, [{ kind: "root" }], "pop"); }
          } else {
            appNav.depth = desiredDepth(tab, [{ kind: "root" }]);
            writeHistory("replaceState");
            applyRoute(tab, [{ kind: "root" }], "pop");
            restoreScroll(true);
          }
          return;
        }
        appNav.scroll[tab] = 0;
        var panel = document.querySelector("[data-hub-panel].hub-on");
        if (panel) panel.scrollTop = 0;
        if (!document.body.classList.contains("hub-app")) {
          var tabsTop = document.getElementById("hubTabs");
          if (tabsTop) {
            var yTop = tabsTop.getBoundingClientRect().top + window.pageYOffset - 4;
            try { window.scrollTo({ top: Math.max(0, yTop), behavior: "auto" }); } catch (e2) {}
          }
        }
        return;
      }
      saveScroll();
      var dest = framesOf(tab).slice();
      var want = desiredDepth(tab, dest);
      if (appNav.depth > want) {
        appNav.pending = { tab: tab, frames: dest };
        try { history.go(-(appNav.depth - want)); } catch (e3) { applyRoute(tab, dest, ""); }
        return;
      }
      if (appNav.depth < want) {
        var built = [];
        dest.forEach(function (fr) {
          built.push(fr);
          appNav.tab = tab;
          appNav.stacks[tab] = built.slice();
          var need = desiredDepth(tab, built);
          if (need > appNav.depth) {
            appNav.depth = need;
            writeHistory("pushState");
          } else {
            appNav.depth = need;
            writeHistory("replaceState");
          }
        });
        renderTop("");
        return;
      }
      appNav.tab = tab;
      appNav.depth = want;
      writeHistory("replaceState");
      renderTop("");
    }

    function openEvent(id) {
      if (!id) return;
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      var frames = framesOf(appNav.tab).slice();
      var top = frames[frames.length - 1];
      if (top && top.kind === "event" && String(top.id) === String(id)) return;
      if (top && top.kind !== "root") frames = [{ kind: "root" }];
      frames.push({ kind: "event", id: String(id), title: "Event" });
      pushFrames(appNav.tab, frames, "push");
    }

    function openFocus(tab, id, title, section) {
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      var focus = { kind: "focus", id: id, title: title || "Back" };
      if (section) focus.section = section;
      var frames = [{ kind: "root" }, focus];
      if (appNav.tab === tab && sameFrames(framesOf(tab), frames)) {
        renderTop("");
        return;
      }
      /* Opening a tool from another tab: land on that tab, then push the tool
         so Back returns to the tab root, and another Back returns Home. */
      if (appNav.tab !== tab) {
        var rootFrames = [{ kind: "root" }];
        var wantRoot = desiredDepth(tab, rootFrames);
        if (appNav.depth < wantRoot) {
          appNav.tab = tab;
          appNav.stacks[tab] = rootFrames;
          appNav.depth = wantRoot;
          writeHistory("pushState");
        } else if (appNav.depth > wantRoot) {
          appNav.pending = { tab: tab, frames: frames, after: "focus" };
          try { history.go(-(appNav.depth - wantRoot)); return; } catch (e) {}
        } else {
          appNav.tab = tab;
          appNav.stacks[tab] = rootFrames;
          appNav.depth = wantRoot;
          writeHistory("replaceState");
        }
      }
      pushFrames(tab, frames, "push");
    }

    function openCard() {
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      var frames = framesOf(appNav.tab).slice();
      var top = frames[frames.length - 1];
      if (top && top.kind === "card") return;
      if (top && top.kind !== "root") frames = [{ kind: "root" }];
      frames.push({ kind: "card", title: "Member card" });
      pushFrames(appNav.tab, frames, "push");
    }

    function openFun() {
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      if (appNav.tab !== "fun") appNav.funFrom = appNav.tab;
      pushFrames("fun", [{ kind: "root" }], "push");
    }

    function openTab(tab) {
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      switchTab(tab || "hub");
    }

    function goBack() {
      if (appNav.depth > 0) {
        try { history.back(); return; } catch (e) {}
      }
      if (appNav.tab !== "hub") openTab("hub");
    }

    function onPop(e) {
      ensure();
      var pend = appNav.pending;
      appNav.pending = null;
      if (pend) {
        if (pend.after === "focus") {
          applyRoute(pend.tab, [{ kind: "root" }], "");
          writeHistory("replaceState");
          pushFrames(pend.tab, pend.frames, "push");
          return;
        }
        applyRoute(pend.tab, pend.frames, "pop");
        if (pend.scrollTop) {
          appNav.scroll[pend.tab] = 0;
          restoreScroll(true);
        }
        writeHistory("replaceState");
        return;
      }
      var st = e.state && e.state.kosHub;
      if (!st) {
        if (!document.body.classList.contains("hub-app")) return;
        appNav.tab = "hub";
        appNav.stacks.hub = [{ kind: "root" }];
        appNav.depth = 0;
        renderTop("pop");
        return;
      }
      ensure();
      appNav.funFrom = st.funFrom || appNav.funFrom || "hub";
      applyRoute(st.tab || "hub", st.frames, "pop");
      appNav.depth = typeof st.depth === "number" ? st.depth : appNav.depth;
    }

    function onHash() {
      if (appNav.writing) return;
      ensure();
      var route = routeFromHash(location.hash);
      if (!route) return;
      var st = history.state && history.state.kosHub;
      if (st && hashFor(st.tab, st.frames) === location.hash) return;
      appNav.userMoved = true;
      appNav.booted = true;
      var prevDepth = st && typeof st.depth === "number" ? st.depth : appNav.depth;
      appNav.tab = route.tab;
      appNav.stacks[route.tab] = route.frames;
      appNav.depth = prevDepth + (route.frames.length > 1 || route.tab !== "hub" ? 1 : 0);
      writeHistory("replaceState");
      renderTop("");
      if (route.tool === "applications") {
        try { sessionStorage.setItem("kosOfficerTool", "tool:hubApplications"); } catch (e) {}
        try { wireOfficerDeskPicker(); } catch (e2) {}
        try { openOfficerTool("tool:hubApplications", true); } catch (e3) {}
      } else if (route.tool === "event-studio") {
        try { wireOfficerDeskPicker(); } catch (e4) {}
        try { openOfficerTool("tool:hubEventStudio", true); } catch (e5) {}
      }
    }

    function boot() {
      ensure();
      if (!appNav.booted && !appNav.userMoved) {
        appNav.booted = true;
        var route = routeFromHash(location.hash) || { tab: "hub", frames: [{ kind: "root" }] };
        var bareHash = !location.hash || location.hash === "#";
        var alreadyPanel = document.querySelector("[data-hub-panel].hub-on");
        var alreadyTab = alreadyPanel && alreadyPanel.getAttribute("data-hub-panel");
        if (history.state && history.state.kosHub) {
          var st = history.state.kosHub;
          applyRoute(st.tab || route.tab, st.frames || route.frames, "");
        } else if (bareHash && alreadyTab && alreadyTab !== "hub") {
          // A caller already opened a desk (tests, or a tab tap before the
          // client settles). Do not seed Home over that panel.
          appNav.tab = alreadyTab;
          if (!appNav.stacks[alreadyTab]) appNav.stacks[alreadyTab] = [{ kind: "root" }];
        } else {
          seed(route);
        }
      } else {
        appNav.booted = true;
      }
      var top = framesOf(appNav.tab).slice(-1)[0];
      if (top && top.kind === "event") paintEvent(top.id);
      else if (top && top.kind === "getapp") paintGetApp();
      else if (top && top.kind === "ann") paintAnnouncement(top.id);
      var hashRoute = routeFromHash(location.hash);
      if (hashRoute && hashRoute.frames.some(function (fr) { return fr.kind === "event"; })) {
        var evId = hashRoute.frames[hashRoute.frames.length - 1].id;
        if (!appNav.userMoved) {
          applyRoute(hashRoute.tab, hashRoute.frames, "");
        } else if (top && top.kind === "event") {
          paintEvent(evId);
        }
      }
      if (hashRoute && hashRoute.frames.some(function (fr) { return fr.kind === "getapp"; })) {
        if (!appNav.userMoved) applyRoute(hashRoute.tab, hashRoute.frames, "");
        else if (top && top.kind === "getapp") paintGetApp();
      }
    }

    function paintAnnouncement(id) {
      var scroll = document.getElementById("appDrillScroll");
      var actions = document.getElementById("appDrillActions");
      var m = findAnnouncement(id);
      showBack((m && m.subject) || "Krewe Tidings");
      if (actions) actions.innerHTML = "";
      if (!scroll) return;
      scroll.innerHTML = announcementScreenHtml(m);
    }

    function openAnnouncement(id) {
      if (!id) return;
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      var frames = [{ kind: "root" }, { kind: "ann", id: String(id), title: "Krewe Tidings" }];
      if (appNav.tab === "hub" && sameFrames(framesOf("hub"), frames)) {
        renderTop("");
        return;
      }
      if (appNav.depth > 0) {
        appNav.pending = { tab: "hub", frames: frames, after: "focus" };
        try { history.go(-appNav.depth); return; } catch (e) {}
        appNav.pending = null;
      }
      if (appNav.tab !== "hub") {
        appNav.tab = "hub";
        appNav.stacks.hub = [{ kind: "root" }];
        appNav.depth = 0;
        writeHistory("replaceState");
      }
      pushFrames("hub", frames, "push");
    }

    function paintGetApp() {
      var scroll = document.getElementById("appDrillScroll");
      var actions = document.getElementById("appDrillActions");
      showBack("Get the App");
      if (actions) actions.innerHTML = "";
      if (!scroll) return;
      var api = window.KOS_HUB_INSTALL;
      if (api && typeof api.screenHtml === "function") scroll.innerHTML = api.screenHtml();
      else {
        scroll.innerHTML = '<div class="app-detail" id="appGetApp"><h2>Get the App</h2>' +
          "<p>Add Shamrock to your home screen from the browser menu.</p>" +
          "<p>You sign in once the first time.</p></div>";
      }
    }

    function openGetApp() {
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      var frames = [{ kind: "root" }, { kind: "getapp", title: "Get the App" }];
      if (appNav.tab === "hub" && sameFrames(framesOf("hub"), frames)) {
        renderTop("");
        return;
      }
      if (appNav.depth > 0) {
        appNav.pending = { tab: "hub", frames: frames, after: "focus" };
        try { history.go(-appNav.depth); return; } catch (e) {}
        appNav.pending = null;
      }
      if (appNav.tab !== "hub") {
        appNav.tab = "hub";
        appNav.stacks.hub = [{ kind: "root" }];
        appNav.depth = 0;
        writeHistory("replaceState");
      }
      pushFrames("hub", frames, "push");
    }

    function sync() {
      var top = framesOf(appNav.tab).slice(-1)[0];
      if (top && top.kind === "event") paintEvent(top.id);
      else if (top && top.kind === "card") paintCard();
      else if (top && top.kind === "getapp") paintGetApp();
      else if (top && top.kind === "ann") paintAnnouncement(top.id);
      var hashRoute = routeFromHash(location.hash);
      if (!appNav.userMoved && hashRoute && hashRoute.frames.some(function (fr) {
        return fr.kind === "event" || fr.kind === "getapp";
      })) {
        if (!(history.state && history.state.kosHub)) seed(hashRoute);
        else applyRoute(hashRoute.tab, hashRoute.frames, "");
      }
    }

    appNavApi.openTab = openTab;
    appNavApi.openEvent = openEvent;
    appNavApi.openFocus = openFocus;
    appNavApi.showParadeRoot = function () {
      ensure();
      appNav.userMoved = true;
      appNav.booted = true;
      applyRoute("parade", [{ kind: "root" }], "");
      writeHistory("replaceState");
    };
    appNavApi.openCard = openCard;
    appNavApi.openGetApp = openGetApp;
    appNavApi.openAnnouncement = openAnnouncement;
    appNavApi.openFun = openFun;
    window.__kosPaintGetApp = paintGetApp;
    if (!window.__kosHubInstallBound) {
      window.__kosHubInstallBound = true;
      window.addEventListener("kos-hub-app-installed", function () {
        var top = framesOf(appNav.tab).slice(-1)[0];
        if (top && top.kind === "getapp") paintGetApp();
      });
      window.addEventListener("kos-hub-install-prompt", function () {
        var top = framesOf(appNav.tab).slice(-1)[0];
        if (top && top.kind === "getapp") paintGetApp();
      });
    }
    appNavApi.back = goBack;
    appNavApi.boot = boot;
    appNavApi.sync = sync;
    appNavApi.onHash = onHash;
    appNavApi.hasMoved = function () { return !!appNav.userMoved; };
    appNavApi.ready = true;
    window.__kosHubSyncRoute = sync;

    if (!window.__kosHubPopBound) {
      window.__kosHubPopBound = true;
      window.addEventListener("popstate", onPop);
    }

    document.querySelectorAll("[data-hub-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-hub-tab");
        openTab(tab);
      });
    });
  }

  function bindTabs() {
    installAppNav();
    if (!window.__hubDocsHashBound) {
      window.__hubDocsHashBound = true;
      window.addEventListener("hashchange", function () {
        appNavApi.onHash();
      });
    }
    if (!window.__hubSamePageBound) {
      window.__hubSamePageBound = true;
      document.addEventListener("click", function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest("a") : null;
        if (!a) return;
        var href = (a.getAttribute("href") || "").trim();
        if (!href) return;
        var hash = "";
        if (href.charAt(0) === "#") hash = href.slice(1).toLowerCase();
        else {
          var m = href.match(/(?:^|\/)members\.html#(.+)$/i);
          if (m) hash = m[1].toLowerCase();
        }
        var faqSec = faqHashSection(hash);
        if (faqSec !== null) {
          ev.preventDefault();
          openMemberFaq(faqSec);
        } else if (hash === "docs") {
          ev.preventDefault();
          revealDocsCard();
        } else if (hash === "directory") {
          ev.preventDefault();
          openDirectoryFromHome();
        } else if (hash === "applications") {
          ev.preventDefault();
          openApplicationsFromHome();
        } else if (hash === "event-studio") {
          ev.preventDefault();
          openEventStudioFromHome();
        } else if (hash === "get-app" || hash === "getapp") {
          ev.preventDefault();
          if (appNavApi.openGetApp) appNavApi.openGetApp();
        }
      });
    }
  }

  
  var OFFICER_TOOL_ORDER = [
    "hubApplications",
    "hubApprovals",
    "hubPayments",
    "hubLockers",
    "hubEventStudio",
    "hubShopStudio",
    "hubQrStudio",
    "hubDocStudio",
    "hubReports",
    "hubAllKrewe",
    "hubEmailMembers",
    "hubSendInvoices",
    "hubDuesWaivers"
  ];

  var OFFICER_TOOL_META = {
    hubApplications: { title: "Membership Applications", desc: "Review join-form applications", icon: "📝", section: "Membership" },
    hubApprovals: { title: "Approvals", desc: "Volunteer hours, roles, clover claims, media, and record merges", icon: "✅", section: "Approvals" },
    hubPayments: { title: "Dues & Payments", desc: "Season dues, waivers, exports, and the payments ledger", icon: "💳", section: "Money" },
    hubLockers: { title: "Locker rentals", desc: "Reservation list, inventory, and assign a number", icon: "🔑", section: "Gear" },
    hubEventStudio: { title: "Event Studio", desc: "Add or edit events, RSVP QR, door check-in", icon: "📅", section: "Events" },
    hubShopStudio: { title: "Shop Studio", desc: "Products, Zeffy links, shop QR", icon: "🛍️", section: "Shop" },
    hubQrStudio: { title: "QR Code Studio", desc: "Meeting check-in and handy link QRs", icon: "📱", section: "Events" },
    hubDocStudio: { title: "Document Studio", desc: "Upload, publish, and hide library documents", icon: "📜", section: "Documents" },
    hubReports: { title: "Reports", desc: "Attendance, fundraising, and live event numbers", icon: "📊", section: "Reports" },
    hubAllKrewe: { title: "All Krewe Messages", desc: "Email the full membership", icon: "✉️", section: "Reports" },
    hubEmailMembers: { title: "Email members", desc: "Choose audience, write, preview, and send", icon: "✉️", section: "Email & invoices" },
    hubSendInvoices: { title: "Send invoices", desc: "Level-based dues invoices and Zeffy pay links", icon: "🧾", section: "Email & invoices" },
    hubDuesWaivers: { title: "Dues waivers", desc: "Request, approve, or batch-apply elected-officer exemptions", icon: "🎖", section: "Email & invoices" }
  };

  var OFFICER_SECTION_ORDER = [
    "Membership",
    "Events",
    "Approvals",
    "Documents",
    "Shop",
    "Gear",
    "Money",
    "Email & invoices",
    "Reports"
  ];

  /* Masthead chips and illuminated headers for each launcher section. The
     sub line tells an officer what the counter holds before they open it. */
  var OFFICER_SECTION_META = {
    "Membership": { icon: "📝", sub: "Join-form applications: new, background check, dues pending, then approve, decline, or archive." },
    "Events": { icon: "📅", sub: "Event Studio, QR check-in, and the calendar." },
    "Approvals": { icon: "✅", sub: "Volunteer hours, photos and videos, clover claims, roles, and record merges." },
    "Documents": { icon: "📜", sub: "Upload, publish, and hide library documents." },
    "Shop": { icon: "🛍️", sub: "Products, Zeffy links, and the shop QR." },
    "Gear": { icon: "🔑", sub: "Locker inventory, the reservation list, and who has paid." },
    "Money": { icon: "💳", sub: "Season dues tracker, waiver report, exports, and the online payments ledger." },
    "Email & invoices": { icon: "✉️", sub: "Write the membership, send dues invoices, and record dues waivers." },
    "Reports": { icon: "📊", sub: "Attendance, fundraising, and live event numbers." },
    "More tools": { icon: "☘", sub: "Everything else on the desk." }
  };

  function officerSectionSlug(sec) {
    return "deskOff-" + String(sec).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function officerDeskCards() {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return [];
    return Array.prototype.filter.call(panel.children, function (el) {
      if (!el.classList || !el.classList.contains("app-card")) return false;
      // Home dash cards (Reports shortcut, etc.) must never appear as officer tools
      if (el.classList.contains("dash-card") || el.id === "dashCard") return false;
      return true;
    });
  }

  function ensureOfficerToolCard(id) {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;
    var card = document.getElementById(id);
    if (card) return card;
    var meta = OFFICER_TOOL_META[id] || { title: id, desc: "" };
    card = document.createElement("section");
    card.className = "app-card";
    card.id = id;
    card.innerHTML =
      '<div class="app-head"><span class="ic">☘</span><div><h2>' +
      meta.title +
      "</h2><small>" +
      (meta.desc || "Loading…") +
      "</small></div></div>" +
      '<div class="app-body"><p class="empty">Loading this tool… If it stays blank, refresh the page.</p></div>';
    panel.appendChild(card);
    return card;
  }

  function officerReportDefs() {
    var list = window.REPORTS;
    if (!list || !list.length) return [];
    return list.filter(function (r) {
      return r && r.id && r.title;
    });
  }

  function openOfficerReport(reportId) {
    if (typeof window.openReports === "function") window.openReports();
    if (typeof window.runReport === "function") {
      setTimeout(function () {
        window.runReport(reportId);
      }, 40);
    }
  }

  function currentOfficerToolOrder() {
    var toolOrder = OFFICER_TOOL_ORDER.slice();
    if (!state.officer && !state.canManageEvents && !state.shopOnly && !state.socialOnly && (state.canReviewApplications || state.canReviewHours)) {
      toolOrder = [];
      if (state.canReviewApplications) toolOrder.push("hubApplications");
      if (state.canReviewHours) toolOrder.push("hubApprovals");
    } else if (state.shopOnly && state.socialOnly) {
      toolOrder = ["hubShopStudio", "hubEventStudio", "hubReports"];
    } else if (state.shopOnly) {
      toolOrder = ["hubShopStudio"];
    } else if (state.socialOnly) {
      toolOrder = ["hubEventStudio", "hubReports"];
    }
    if (!state.canReviewApplications) {
      toolOrder = toolOrder.filter(function (id) { return id !== "hubApplications"; });
    } else if (toolOrder.indexOf("hubApplications") === -1) {
      toolOrder.unshift("hubApplications");
    }
    if (!state.canViewPayments) {
      toolOrder = toolOrder.filter(function (id) { return id !== "hubPayments"; });
    }
    if (!state.officer || state.shopOnly || state.socialOnly) {
      toolOrder = toolOrder.filter(function (id) { return id !== "hubLockers"; });
    }
    return toolOrder;
  }

  function ensureOfficerDeskChrome() {
    var panel = document.getElementById("hubOfficer");
    if (!panel) return null;

    var hero = document.getElementById("hubOfficerHero");
    if (!hero) {
      hero = document.createElement("div");
      hero.id = "hubOfficerHero";
      hero.className = "desk-hero desk-officer";
      hero.innerHTML =
        '<p class="desk-kicker">Céad míle fáilte - a hundred thousand welcomes</p>' +
        "<h2>🎖️ Your Officer Desk</h2>" +
        "<p>Everything the krewe trusts you with, on one desk: run events and check-ins, " +
        "approve members' photos, videos, and clover claims, publish documents, mind the shop " +
        "and the money, write the membership, record dues waivers, and read the numbers. Pick one tool at a time - " +
        "the desk stays tidy.</p>" +
        '<nav class="desk-nav" id="hubOfficerDeskNav" aria-label="Officer desk sections"></nav>';
      panel.insertBefore(hero, panel.firstChild);
    }

    var launcher = document.getElementById("hubOfficerLauncher");
    if (!launcher) {
      launcher = document.createElement("div");
      launcher.id = "hubOfficerLauncher";
      launcher.className = "hub-officer-launcher";
      panel.insertBefore(launcher, hero.nextSibling);
    }

    var activeBar = document.getElementById("hubOfficerActiveBar");
    if (!activeBar) {
      activeBar = document.createElement("div");
      activeBar.id = "hubOfficerActiveBar";
      activeBar.className = "hub-officer-activebar";
      activeBar.innerHTML =
        '<div class="lbl" id="hubOfficerActiveLabel">Tool open</div>' +
        '<button type="button" id="hubOfficerBackBtn">← All tools</button>';
      panel.insertBefore(activeBar, launcher.nextSibling);
      document.getElementById("hubOfficerBackBtn").addEventListener("click", function () {
        try { sessionStorage.removeItem("kosOfficerTool"); } catch (e) {}
        var sel = document.getElementById("officerToolSelect");
        if (sel) {
          sel.value = "";
          sel.selectedIndex = -1;
        }
        showOfficerOverview();
      });
    }

    var picker = document.getElementById("hubOfficerPicker");
    if (!picker) {
      picker = document.createElement("div");
      picker.className = "hub-officer-picker compact";
      picker.id = "hubOfficerPicker";
      picker.innerHTML =
        '<label for="officerToolSelect">Jump by name</label>' +
        '<select id="officerToolSelect"><option value="">Choose a tool or report…</option></select>' +
        '<p class="hint" id="officerToolHint">Optional menu if you prefer searching by name.</p>';
      panel.insertBefore(picker, activeBar.nextSibling);
    }
    return panel;
  }

  function showOfficerOverview() {
    var launcher = document.getElementById("hubOfficerLauncher");
    var activeBar = document.getElementById("hubOfficerActiveBar");
    if (launcher) launcher.style.display = "";
    if (activeBar) activeBar.classList.remove("show");
    officerDeskCards().forEach(function (card) {
      card.classList.add("hub-officer-hidden");
      card.style.display = "none";
    });
    var tiles = document.querySelectorAll(".hub-officer-tile");
    for (var i = 0; i < tiles.length; i++) tiles[i].classList.remove("on");
  }

  function openOfficerTool(raw, fromUser) {
    var launcher = document.getElementById("hubOfficerLauncher");
    var activeBar = document.getElementById("hubOfficerActiveBar");
    var label = document.getElementById("hubOfficerActiveLabel");
    var sel = document.getElementById("officerToolSelect");
    var hint = document.getElementById("officerToolHint");

    if (!raw) {
      showOfficerOverview();
      return;
    }

    if (sel && Array.prototype.some.call(sel.options, function (o) { return o.value === raw; })) {
      sel.value = raw;
    }
    var opt = sel && sel.options[sel.selectedIndex];
    if (hint && opt) hint.textContent = opt.getAttribute("data-desc") || "Pick a tool from the list.";

    if (raw.indexOf("report:") === 0) {
      var rid = raw.slice(7);
      var showId = "hubReports";
      ensureOfficerToolCard(showId);
      if (launcher) launcher.style.display = "none";
      if (activeBar) activeBar.classList.add("show");
      if (label) label.textContent = (opt && opt.textContent) ? opt.textContent : "Report";
      officerDeskCards().forEach(function (card) {
        var show = card.id === showId;
        card.classList.toggle("hub-officer-hidden", !show);
        card.style.display = show ? "" : "none";
      });
      document.querySelectorAll(".hub-officer-tile").forEach(function (t) {
        t.classList.toggle("on", t.getAttribute("data-tool") === "tool:hubReports");
      });
      if (fromUser) openOfficerReport(rid);
    } else {
      var id = raw.indexOf("tool:") === 0 ? raw.slice(5) : raw;
      if (fromUser && typeof window.closeReports === "function") {
        try { window.closeReports(); } catch (e) {}
      }
      ensureOfficerToolCard(id);
      var meta = OFFICER_TOOL_META[id] || {};
      if (launcher) launcher.style.display = "none";
      if (activeBar) activeBar.classList.add("show");
      if (label) label.textContent = meta.title || id;
      officerDeskCards().forEach(function (card) {
        var show = card.id === id;
        card.classList.toggle("hub-officer-hidden", !show);
        card.style.display = show ? "" : "none";
      });
      document.querySelectorAll(".hub-officer-tile").forEach(function (t) {
        t.classList.toggle("on", t.getAttribute("data-tool") === ("tool:" + id));
      });
    }
    try { if (raw) sessionStorage.setItem("kosOfficerTool", raw); } catch (e2) {}
  }

  function buildOfficerLauncher(toolOrder) {
    var launcher = document.getElementById("hubOfficerLauncher");
    if (!launcher) return;
    var bySection = {};
    toolOrder.forEach(function (id) {
      var meta = OFFICER_TOOL_META[id] || { title: id, desc: "", icon: "☘", section: "More tools" };
      var sec = meta.section || "More tools";
      if (!bySection[sec]) bySection[sec] = [];
      bySection[sec].push({ id: id, meta: meta });
    });
    function sectionHtml(sec) {
      var meta = OFFICER_SECTION_META[sec] || { icon: "☘", sub: "" };
      var h = '<div class="hub-officer-section" id="' + officerSectionSlug(sec) + '">' +
        '<header class="desk-group-head"><span class="dg-ic" aria-hidden="true">' + meta.icon + "</span>" +
        "<div><h3>" + sec + "</h3>" +
        (meta.sub ? '<span class="dg-sub">' + meta.sub + "</span>" : "") +
        "</div></header>" +
        '<div class="desk-group-rule"></div>' +
        '<div class="hub-officer-tiles">';
      bySection[sec].forEach(function (item) {
        var desc = item.meta.desc || "";
        if (item.id === "hubApplications") desc = applicationsTileDesc();
        h +=
          '<button type="button" class="hub-officer-tile" data-tool="tool:' + item.id + '">' +
          '<span class="tic" aria-hidden="true">' + (item.meta.icon || "☘") + "</span>" +
          "<b>" + item.meta.title + "</b>" +
          "<span>" + desc + "</span></button>";
      });
      return h + "</div></div>";
    }

    var html = "";
    var rendered = [];
    OFFICER_SECTION_ORDER.forEach(function (sec) {
      if (!bySection[sec] || !bySection[sec].length) return;
      rendered.push(sec);
      html += sectionHtml(sec);
    });
    Object.keys(bySection).forEach(function (sec) {
      if (rendered.indexOf(sec) !== -1) return;
      rendered.push(sec);
      html += sectionHtml(sec);
    });
    launcher.innerHTML = html;
    launcher.querySelectorAll(".hub-officer-tile").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openOfficerTool(btn.getAttribute("data-tool"), true);
      });
    });

    // Masthead jump chips mirror whichever sections this officer actually
    // sees (committee roles get a shorter desk). A chip first returns to the
    // overview - the launcher must be visible before the scroll lands.
    var nav = document.getElementById("hubOfficerDeskNav");
    if (nav) {
      nav.innerHTML = rendered.map(function (sec) {
        var meta = OFFICER_SECTION_META[sec] || { icon: "☘" };
        return '<button type="button" data-desk-goto="' + officerSectionSlug(sec) + '">' + meta.icon + " " + sec + "</button>";
      }).join("");
      nav.querySelectorAll("[data-desk-goto]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          try { sessionStorage.removeItem("kosOfficerTool"); } catch (e) {}
          var sel = document.getElementById("officerToolSelect");
          if (sel) { sel.value = ""; sel.selectedIndex = -1; }
          showOfficerOverview();
          setTimeout(function () {
            focusHubTarget(document.getElementById(btn.getAttribute("data-desk-goto")));
          }, 60);
        });
      });
    }
  }

  function wireOfficerDeskPicker() {
    var panel = ensureOfficerDeskChrome();
    if (!panel) return;

    var toolOrder = currentOfficerToolOrder();
    toolOrder.forEach(ensureOfficerToolCard);

    var cards = officerDeskCards();
    var sel = document.getElementById("officerToolSelect");
    var hint = document.getElementById("officerToolHint");
    var prev = sel ? sel.value : "";

    buildOfficerLauncher(toolOrder);

    if (hint) {
      if (state.shopOnly && state.socialOnly) {
        hint.textContent = "Committee tools: Shop Studio, Event Studio, and related reports.";
      } else if (state.shopOnly) {
        hint.textContent = "Merchandise Chair: Shop Studio (products, Zeffy links, shop QR).";
      } else if (state.socialOnly) {
        hint.textContent = "Social / Charity: Event Studio and event or charity reports.";
      } else {
        hint.textContent = "Optional menu if you prefer searching by name.";
      }
    }

    cards.forEach(function (card) {
      if (!card || !card.id) return;
      var limited = state.shopOnly || state.socialOnly;
      if (toolOrder.indexOf(card.id) === -1 && (limited || card.id === "hubApplications")) {
        card.style.display = "none";
        card.classList.add("hub-officer-hidden");
      }
    });

    sel.innerHTML = '<option value="">Choose a tool or report…</option>';

    var studioGroup = document.createElement("optgroup");
    studioGroup.label = (state.shopOnly && !state.socialOnly) ? "Merchandise tools" : (state.socialOnly && !state.shopOnly) ? "Social / Charity tools" : (state.shopOnly && state.socialOnly) ? "Committee tools" : "Studios & officer tools";
    toolOrder.forEach(function (id) {
      var card = document.getElementById(id);
      var meta = OFFICER_TOOL_META[id] || {};
      var h = card && card.querySelector(".app-head h2, h2");
      var title = (h && h.textContent && h.textContent.trim()) || meta.title || id;
      var small = card && card.querySelector(".app-head small");
      var desc = (small && small.textContent.trim()) || meta.desc || "";
      var opt = document.createElement("option");
      opt.value = "tool:" + id;
      opt.textContent = title;
      opt.setAttribute("data-desc", desc);
      studioGroup.appendChild(opt);
    });
    sel.appendChild(studioGroup);

    var known = {};
    OFFICER_TOOL_ORDER.forEach(function (id) { known[id] = true; });
    var extras = (state.shopOnly || state.socialOnly) ? [] : cards.filter(function (c) { return c.id && !known[c.id]; });
    if (extras.length) {
      var extraGroup = document.createElement("optgroup");
      extraGroup.label = "More tools";
      extras.forEach(function (card) {
        var h = card.querySelector(".app-head h2, h2");
        var title = (h && h.textContent) ? h.textContent.trim() : card.id;
        var small = card.querySelector(".app-head small");
        var opt = document.createElement("option");
        opt.value = "tool:" + card.id;
        opt.textContent = title;
        opt.setAttribute("data-desc", small ? small.textContent.trim() : "");
        extraGroup.appendChild(opt);
      });
      sel.appendChild(extraGroup);
    }

    var reports = officerReportDefs();
    if (state.shopOnly && !state.socialOnly) {
      reports = [];
    } else if (state.socialOnly) {
      var SOCIAL_REPORT_CATS = { "Events & Attendance": true };
      var SOCIAL_REPORT_IDS = {
        event_attendance: true,
        events_upcoming: true,
        event_headcount: true,
        volunteer_coverage: true,
        attendee_contacts: true,
        tartan_ball: true
      };
      reports = reports.filter(function (r) {
        return !!(SOCIAL_REPORT_IDS[r.id] || SOCIAL_REPORT_CATS[r.cat]);
      });
    }
    if (reports.length) {
      var byCat = {};
      reports.forEach(function (r) {
        var cat = r.cat || "Reports";
        if (!byCat[cat]) byCat[cat] = [];
        byCat[cat].push(r);
      });
      Object.keys(byCat).forEach(function (cat) {
        var group = document.createElement("optgroup");
        group.label = "Report: " + cat;
        byCat[cat].forEach(function (r) {
          var opt = document.createElement("option");
          opt.value = "report:" + r.id;
          opt.textContent = (r.icon ? r.icon + " " : "") + r.title;
          opt.setAttribute("data-desc", r.desc || "");
          group.appendChild(opt);
        });
        sel.appendChild(group);
      });
    }

    var tryVals = [];
    if (prev) tryVals.push(prev);
    try {
      var saved = sessionStorage.getItem("kosOfficerTool");
      if (saved) {
        tryVals.push(saved);
        if (saved.indexOf("tool:") !== 0 && saved.indexOf("report:") !== 0) {
          tryVals.push("tool:" + saved);
        }
      }
    } catch (e) {}
    var picked = null;
    for (var i = 0; i < tryVals.length; i++) {
      var v = tryVals[i];
      if (Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) {
        picked = v;
        break;
      }
    }

    sel.onchange = function () {
      var raw = sel.value || "";
      if (!raw) showOfficerOverview();
      else openOfficerTool(raw, true);
    };

    if (picked) openOfficerTool(picked, false);
    else showOfficerOverview();

    if (!panel._kosOfficerObs) {
      var timer = null;
      panel._kosOfficerObs = new MutationObserver(function (mutations) {
        var selfChange = false;
        for (var mi = 0; mi < mutations.length; mi++) {
          var nodes = mutations[mi].addedNodes;
          for (var ni = 0; ni < nodes.length; ni++) {
            var n = nodes[ni];
            if (n && n.id && (n.id === "hubOfficerHero" || n.id === "hubOfficerLauncher" || n.id === "hubOfficerActiveBar" || n.id === "hubOfficerPicker")) {
              selfChange = true;
            }
          }
        }
        if (selfChange) return;
        clearTimeout(timer);
        timer = setTimeout(function () { wireOfficerDeskPicker(); }, 120);
      });
      panel._kosOfficerObs.observe(panel, { childList: true, subtree: false });
    }
  }

  window.kosRefreshOfficerDesk = wireOfficerDeskPicker;


  var hubBootStarted = false;
  var hubLoadGen = 0;
  var hubLoadInFlight = false;
  var hubSettled = false;

  var _loadHubDataInner = loadHubData;
  loadHubData = async function () {
    if (hubLoadInFlight) return;
    hubLoadInFlight = true;
    var gen = ++hubLoadGen;
    try {
      await _loadHubDataInner();
      if (gen === hubLoadGen) hubSettled = true;
    } finally {
      if (gen === hubLoadGen) hubLoadInFlight = false;
    }
  };

  function bindLayoutMode() {
    if (window.__kosHubLayoutBound) return;
    window.__kosHubLayoutBound = true;
    try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) {}
    function apply() {
      var wasApp = document.body.classList.contains("hub-app");
      var wasDesk = document.body.classList.contains("hub-desk");
      syncAppChrome();
      if (wasApp === document.body.classList.contains("hub-app") && wasDesk === document.body.classList.contains("hub-desk")) return;
      if (!document.getElementById("hubHome")) return;
      try { renderHome(); } catch (e2) {}
      try { if (appNavApi.sync) appNavApi.sync(); } catch (e3) {}
    }
    var mq = null;
    var stand = null;
    try { mq = window.matchMedia(HUB_DESKTOP_MQ); } catch (e4) {}
    try { stand = window.matchMedia("(display-mode: standalone)"); } catch (e5) {}
    if (mq && mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq && mq.addListener) mq.addListener(apply);
    if (stand && stand.addEventListener) stand.addEventListener("change", apply);
    else if (stand && stand.addListener) stand.addListener(apply);
  }

  function boot() {
    bindLayoutMode();
    if (!document.getElementById("memberContent")) return;
    if (document.getElementById("hubRoot")) {
      // Already built: only refresh data if we have not settled this session.
      syncAppChrome();
      try { appNavApi.boot(); } catch (faqBootEarly) {}
      if (!hubSettled && !hubLoadInFlight) loadHubData();
      return;
    }
    if (hubBootStarted) return;
    hubBootStarted = true;
    injectCss();
    tagSections();
    moveIntoPanels();
    bindTabs();
    var tries = 0;
    var t = setInterval(function () {
      tries += 1;
      var content = document.getElementById("memberContent");
      var visible = content && content.style.display !== "none";
      if (visible || tries > 50) {
        clearInterval(t);
        syncAppChrome();
        try { appNavApi.boot(); } catch (faqBootVisible) {}
        loadHubData();
      }
    }, 200);
  }

  var _unlock = window.kosUnlock;
  window.kosUnlock = function () {
    if (typeof _unlock === "function") _unlock();
    // Build hub once; loadHubData itself is single-flight. Do not open hours
    // here - loadHubData settles the tab and defers the hours deep-link.
    syncAppChrome();
    setTimeout(boot, 40);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

