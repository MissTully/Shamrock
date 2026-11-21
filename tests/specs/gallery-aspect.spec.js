// Member photos keep the shape of the file, including a phone JPEG whose
// pixels are landscape but whose EXIF orientation says portrait.
const { test, expect } = require("@playwright/test");
const path = require("path");

const WIDE = "/tests/fixtures/gallery-wide.jpg";
const EXIF = "/tests/fixtures/gallery-exif-portrait.jpg";
const EXIF_FILE = path.join(__dirname, "../fixtures/gallery-exif-portrait.jpg");

function photoRows() {
  const origin = "http://127.0.0.1:4173";
  return [
    {
      title: "Phone portrait",
      url: origin + EXIF,
      caption: "Phone portrait stored sideways",
      created_at: "2026-11-19T22:00:04Z"
    },
    {
      title: "Wide photo",
      url: origin + WIDE,
      caption: "A wide parade photo",
      created_at: "2026-11-18T22:00:04Z"
    }
  ];
}

async function mockPhotos(page) {
  await page.route("**/rest/v1/content_items*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(photoRows())
  }));
}

function measureGallery() {
  const frames = Array.from(document.querySelectorAll("#memberGallery figure"));
  return {
    sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    vw: document.documentElement.clientWidth,
    frames: frames.map((fig) => {
      const img = fig.querySelector("img");
      const cap = fig.querySelector("figcaption");
      const ib = img.getBoundingClientRect();
      const cb = cap ? cap.getBoundingClientRect() : null;
      return {
        fit: getComputedStyle(img).objectFit,
        orient: getComputedStyle(img).imageOrientation,
        nw: img.naturalWidth,
        nh: img.naturalHeight,
        w: ib.width,
        h: ib.height,
        capTop: cb ? cb.top : null,
        imgBottom: ib.bottom,
        text: cap ? cap.textContent : "",
        fitted: fig.classList.contains("is-fit")
      };
    })
  };
}

test("member photo frames follow each image, including EXIF portrait", async ({ page }) => {
  await mockPhotos(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/gallery.html");
  await page.locator("#memberGallery figure.is-fit").nth(1).waitFor();

  for (const width of [1280, 390, 344]) {
    await page.setViewportSize({ width, height: 800 });
    const box = await page.evaluate(measureGallery);
    expect(box.frames, "two photos at " + width).toHaveLength(2);
    expect(box.sw, "no sideways scroll at " + width).toBeLessThanOrEqual(box.vw + 1);
    const portrait = box.frames.find((f) => f.nh > f.nw);
    const landscape = box.frames.find((f) => f.nw > f.nh);
    expect(portrait, "oriented portrait at " + width).toBeTruthy();
    expect(landscape, "landscape at " + width).toBeTruthy();
    for (const frame of box.frames) {
      expect(frame.fitted).toBe(true);
      expect(frame.fit).toBe("contain");
      expect(frame.text.length).toBeGreaterThan(0);
      expect(frame.capTop).toBeGreaterThanOrEqual(frame.imgBottom - 2);
      expect(frame.w).toBeGreaterThan(40);
      expect(frame.h).toBeGreaterThan(40);
      expect(frame.w).toBeLessThanOrEqual(box.vw + 1);
      const nat = frame.nw / frame.nh;
      const got = frame.w / frame.h;
      expect(Math.abs(got - nat), "frame ratio at " + width).toBeLessThan(0.08);
    }
    expect(portrait.h).toBeGreaterThan(portrait.w);
    expect(landscape.w).toBeGreaterThan(landscape.h);
    const maxH = width <= 420 ? 490 : 530;
    expect(portrait.h, "portrait max height at " + width).toBeLessThanOrEqual(maxH);
  }
});

test("officer approval thumbnail uses the same frame", async ({ page }) => {
  await page.goto("/gallery.html");
  await page.evaluate((src) => {
    const div = document.createElement("div");
    div.id = "officerProbe";
    div.innerHTML = '<div class="hub-media-preview kos-photo-frame"><a href="#"><img alt="Photo submitted for review" src="' + src + '"></a></div>';
    document.body.appendChild(div);
    window.kosFitPhotoFrames(div);
  }, EXIF);
  await page.waitForFunction(() => {
    const img = document.querySelector("#officerProbe img");
    const frame = document.querySelector("#officerProbe .kos-photo-frame");
    return img && frame && frame.classList.contains("is-fit") && img.naturalHeight > img.naturalWidth;
  });
  const box = await page.evaluate(() => {
    const img = document.querySelector("#officerProbe img");
    const r = img.getBoundingClientRect();
    return {
      w: r.width,
      h: r.height,
      fit: getComputedStyle(img).objectFit,
      nw: img.naturalWidth,
      nh: img.naturalHeight
    };
  });
  expect(box.fit).toBe("contain");
  expect(box.h).toBeGreaterThan(box.w);
  expect(box.h).toBeLessThanOrEqual(284);
  expect(box.w).toBeLessThanOrEqual(224);
  expect(Math.abs(box.w / box.h - box.nw / box.nh)).toBeLessThan(0.08);
});

test("share form turns a sideways phone JPEG upright before upload", async ({ page }) => {
  await page.goto("/share.html?type=photo");
  await page.evaluate(() => {
    const gate = document.getElementById("gate");
    if (gate) gate.style.display = "none";
    const main = document.getElementById("mainContent");
    if (main) main.style.display = "block";
  });
  await page.locator("#filePhoto").setInputFiles(EXIF_FILE);
  await page.locator("#photoPreviewWrap.is-fit img").waitFor();
  const info = await page.evaluate(async () => {
    const input = document.getElementById("filePhoto");
    const file = input.files[0];
    const buf = await file.arrayBuffer();
    const orient = window.kosReadJpegOrientation(buf);
    const bmp = await createImageBitmap(file, { imageOrientation: "none" });
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    const top = ctx.getImageData(Math.floor(bmp.width / 2), 2, 1, 1).data;
    const bottom = ctx.getImageData(Math.floor(bmp.width / 2), bmp.height - 3, 1, 1).data;
    const preview = document.getElementById("photoPreview");
    const pr = preview.getBoundingClientRect();
    const result = {
      orient,
      w: bmp.width,
      h: bmp.height,
      top: [top[0], top[1], top[2]],
      bottom: [bottom[0], bottom[1], bottom[2]],
      pw: pr.width,
      ph: pr.height,
      fit: getComputedStyle(preview).objectFit
    };
    bmp.close();
    return result;
  });
  expect(info.orient).toBe(1);
  expect(info.h).toBeGreaterThan(info.w);
  expect(info.top[0]).toBeGreaterThan(info.top[2] + 40);
  expect(info.bottom[2]).toBeGreaterThan(info.bottom[0] + 40);
  expect(info.ph).toBeGreaterThan(info.pw);
  expect(info.fit).toBe("contain");
  expect(Math.abs(info.pw / info.ph - info.w / info.h)).toBeLessThan(0.08);
});
