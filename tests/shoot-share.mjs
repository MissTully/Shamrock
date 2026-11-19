// Capture the PR screenshots: public events, Member Hub, and the SantaFest preview.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const PORT = process.env.PORT || "4183";
const BASE = "http://127.0.0.1:" + PORT;
const OUT = "/opt/cursor/artifacts";
const SANTA_ID = "6918ff19-f232-4ddf-83d7-82f0a141eb95";
const FLYER = "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/1794544500325-sand-save-1794544458706.png";

function santa() {
  return {
    id: SANTA_ID,
    name: "SantaFest",
    description: "Tampa's downtown holiday kickoff parade and the start of the krewe's marching season. Join us downtown as we march into the holiday season.",
    event_type: "parade",
    start_time: "2026-12-05T18:00:00.000Z",
    end_time: "2026-12-05T22:00:00.000Z",
    location: "Starts at Morgan St. and Madison St., Downtown Tampa, FL",
    source: "krewe",
    status: "published",
    is_public: true,
    is_featured: true,
    members_only: false,
    flyer_url: FLYER
  };
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("dev server did not start")), 8000);
    child.stdout.on("data", (buf) => {
      if (String(buf).includes("dev server")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("dev server exited " + code));
    });
  });
}

async function shoot() {
  mkdirSync(OUT, { recursive: true });
  const child = spawn("node", ["dev-server.mjs"], {
    cwd: new URL(".", import.meta.url).pathname,
    env: Object.assign({}, process.env, { PORT: PORT }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  await waitForServer(child);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/google/chrome/chrome"
  });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });

  await page.route("**/rest/v1/v_raffle_events_public*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: "[]"
  }));
  await page.route("**/rest/v1/rpc/**", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: "[]"
  }));
  await page.route("**/rest/v1/v_public_events*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([santa()])
  }));
  await page.route("**/rest/v1/events*", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: "[]"
  }));

  await page.goto(BASE + "/event-signup.html", { waitUntil: "networkidle" });
  const eventsShare = page.locator("#featured-event .kos-share");
  await eventsShare.waitFor({ state: "visible" });
  await eventsShare.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await page.waitForTimeout(250);
  await page.screenshot({ path: OUT + "/share-events-mobile.png" });

  await page.goto(BASE + "/members.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const auth = document.getElementById("authStage");
    if (auth) auth.style.display = "none";
    const content = document.getElementById("memberContent");
    if (content) content.style.display = "block";
    if (typeof window.kosUnlock === "function") window.kosUnlock();
    if (typeof window.kosShowHub === "function") window.kosShowHub("hub", { skipScroll: true });
  });
  await page.waitForSelector("#hubRoot");
  await page.evaluate((ev) => {
    window.__kosHubSetFeed({
      profile: { first_name: "Maeve", last_name: "Kelly", email: "maeve@example.com" },
      parades: [],
      events: [ev],
      paradeReady: { dues_paid: true, waiver_signed: true, meeting_attended: true },
      membershipStatus: "active"
    });
  }, santa());
  await page.locator('[data-hub-tab="events"]').click();
  const hubShare = page.locator("#hubMemberEventList .kos-share");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await hubShare.waitFor({ state: "visible", timeout: 5000 });
      await page.waitForTimeout(400);
      await hubShare.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
      break;
    } catch (err) {
      if (attempt === 3) throw err;
      await page.locator('[data-hub-tab="events"]').click();
    }
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "/share-hub-mobile.png" });

  const html = await (await page.request.get(BASE + "/events/fixture-santafest")).text();
  function meta(prop) {
    const re = new RegExp('(?:property|name)="' + prop + '" content="([^"]*)"');
    const match = html.match(re);
    return match ? match[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&lt;/g, "<") : "";
  }
  const tags = {
    "og:title": meta("og:title"),
    "og:description": meta("og:description"),
    "og:image": meta("og:image"),
    "og:url": meta("og:url"),
    "og:type": meta("og:type"),
    "og:site_name": meta("og:site_name"),
    "twitter:card": meta("twitter:card"),
    "twitter:title": meta("twitter:title"),
    "twitter:description": meta("twitter:description"),
    "twitter:image": meta("twitter:image")
  };
  await page.setViewportSize({ width: 420, height: 980 });
  await page.setContent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{margin:0;background:#e7e9ee;font-family:Helvetica,Arial,sans-serif;color:#1c1e21;}
  .wrap{padding:18px 14px 28px;}
  .card{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.15);}
  .card img{display:block;width:100%;height:210px;object-fit:contain;background:#f4efe2;}
  .card .body{padding:10px 12px 14px;}
  .domain{font-size:12px;color:#65676b;text-transform:uppercase;letter-spacing:.03em;}
  h1{font-size:17px;line-height:1.25;margin:4px 0;}
  p{font-size:14px;line-height:1.35;color:#65676b;margin:0;}
  h2{font-size:15px;margin:18px 0 8px;}
  dl{background:#fff;border-radius:10px;padding:10px 12px;margin:0;}
  dt{font-size:12px;font-weight:700;color:#14532d;margin-top:8px;}
  dd{font-size:13px;margin:2px 0 0;overflow-wrap:anywhere;}
</style></head><body>
<div class="wrap">
  <article class="card">
    <img src="${tags["og:image"]}" alt="" />
    <div class="body">
      <div class="domain">kreweofshamrock.com</div>
      <h1>${tags["og:title"]}</h1>
      <p>${tags["og:description"]}</p>
    </div>
  </article>
  <h2>Tags in the first HTML response</h2>
  <dl>
    ${Object.keys(tags).map((key) => `<dt>${key}</dt><dd>${tags[key].replace(/</g, "&lt;")}</dd>`).join("")}
  </dl>
</div>
</body></html>`, { waitUntil: "networkidle" });
  await page.screenshot({ path: OUT + "/share-santafest-og.png", fullPage: true });

  await browser.close();
  child.kill();
  console.log("wrote screenshots to " + OUT);
}

shoot().catch((err) => {
  console.error(err);
  process.exit(1);
});
