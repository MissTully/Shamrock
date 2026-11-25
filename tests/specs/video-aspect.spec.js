// Member videos size their frame from the file. Embeds stay 16:9,
// except YouTube Shorts and Facebook Reels, which stay 9:16.
const { test, expect } = require("./kos-fixtures");

const PORTRAIT = "http://127.0.0.1:4173/tests/fixtures/video-portrait.mp4";
const LANDSCAPE = "http://127.0.0.1:4173/tests/fixtures/video-landscape.mp4";

function rows() {
  return [
    {
      title: "Festival of Trees TBL Tree",
      url: PORTRAIT,
      notes: "Member phone clip",
      created_at: "2026-11-19T22:01:08Z"
    },
    {
      title: "Parade day",
      url: LANDSCAPE,
      notes: "Sample landscape",
      created_at: "2026-11-18T22:01:08Z"
    }
  ];
}

async function mockVideos(page) {
  await page.route("**/rest/v1/content_items*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(rows())
  }));
}

function measure() {
  const cards = Array.from(document.querySelectorAll("#content .vid-card"));
  const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  return {
    sw,
    vw: document.documentElement.clientWidth,
    cards: cards.map((card) => {
      const video = card.querySelector("video");
      const cap = card.querySelector("figcaption");
      const vr = video.getBoundingClientRect();
      const cr = cap.getBoundingClientRect();
      return {
        w: vr.width,
        h: vr.height,
        vw: video.videoWidth,
        vh: video.videoHeight,
        preload: video.getAttribute("preload"),
        fitted: card.classList.contains("is-fit"),
        capTop: cr.top,
        videoBottom: vr.bottom,
        title: cap.querySelector("strong").textContent
      };
    })
  };
}

test("file videos match their own aspect and keep the title underneath", async ({ page }) => {
  await mockVideos(page);
  for (const width of [1280, 390, 344]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/videos.html");
    await page.locator("#content .vid-card.is-fit").nth(1).waitFor();
    const box = await page.evaluate(measure);
    expect(box.cards, "two videos at " + width).toHaveLength(2);
    expect(box.sw, "no sideways scroll at " + width).toBeLessThanOrEqual(box.vw + 1);
    const portrait = box.cards.find((c) => c.vh > c.vw);
    const landscape = box.cards.find((c) => c.vw > c.vh);
    expect(portrait, "portrait at " + width).toBeTruthy();
    expect(landscape, "landscape at " + width).toBeTruthy();
    for (const card of box.cards) {
      expect(card.fitted).toBe(true);
      expect(card.preload).toBe("metadata");
      expect(card.capTop).toBeGreaterThanOrEqual(card.videoBottom - 2);
      expect(card.w).toBeGreaterThan(40);
      expect(card.h).toBeGreaterThan(40);
      expect(card.w).toBeLessThanOrEqual(box.vw + 1);
      expect(Math.abs(card.w / card.h - card.vw / card.vh), "frame ratio at " + width).toBeLessThan(0.08);
    }
    expect(portrait.h).toBeGreaterThan(portrait.w);
    expect(landscape.w).toBeGreaterThan(landscape.h);
    const maxH = width <= 420 ? 490 : 530;
    expect(portrait.h, "portrait max height at " + width).toBeLessThanOrEqual(maxH);
    if (width >= 1000) {
      const videoTops = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("#content video")).map((v) => Math.round(v.getBoundingClientRect().top));
      });
      expect(Math.abs(videoTops[0] - videoTops[1]), "side by side on desktop").toBeLessThan(30);
    }
  }
});

test("shorts and reels use a tall frame, other embeds stay wide", async ({ page }) => {
  await page.goto("/videos.html");
  const ratios = await page.evaluate(() => {
    function card(url) {
      const html = window.kosVideoFrameHtml(url);
      const holder = document.createElement("div");
      holder.innerHTML = html;
      document.body.appendChild(holder);
      const frame = holder.querySelector(".kos-video-frame");
      const w = frame.style.getPropertyValue("--kos-video-w");
      const h = frame.style.getPropertyValue("--kos-video-h");
      holder.remove();
      return w + "/" + h;
    }
    return {
      watch: card("https://www.youtube.com/watch?v=abcdefghijk"),
      shorts: card("https://www.youtube.com/shorts/abcdefghijk"),
      reel: card("https://www.facebook.com/reel/1234567890"),
      vimeo: card("https://vimeo.com/123456")
    };
  });
  expect(ratios.watch).toBe("16/9");
  expect(ratios.shorts).toBe("9/16");
  expect(ratios.reel).toBe("9/16");
  expect(ratios.vimeo).toBe("16/9");
});

test("officer approval previews a video in a fitted frame", async ({ page }) => {
  await page.goto("/videos.html");
  await page.evaluate((src) => {
    const host = document.createElement("div");
    host.id = "officerVid";
    host.innerHTML = window.kosVideoFrameHtml(src, "hub-media-preview");
    document.body.appendChild(host);
    window.kosFitVideoFrames(host);
  }, LANDSCAPE);
  await page.locator("#officerVid .is-fit video").waitFor();
  const box = await page.evaluate(() => {
    const video = document.querySelector("#officerVid video");
    const r = video.getBoundingClientRect();
    return {
      w: r.width,
      h: r.height,
      vw: video.videoWidth,
      vh: video.videoHeight,
      preload: video.getAttribute("preload")
    };
  });
  expect(box.preload).toBe("metadata");
  expect(box.w).toBeGreaterThan(box.h);
  expect(box.h).toBeLessThanOrEqual(284);
  expect(box.w).toBeLessThanOrEqual(224);
  expect(Math.abs(box.w / box.h - box.vw / box.vh)).toBeLessThan(0.08);
});
