// Confirms the shared fixture stubs Supabase storage so CI never
// downloads live videos or images from the production project.
const { test, expect, TINY_PNG } = require("./kos-fixtures");

const VIDEO =
  "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/krewe-videos/20231202_123228.mp4";
const IMAGE =
  "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/object/public/event-flyers/social.png";
const RENDER =
  "https://oazwkwflgbthojvnclfc.supabase.co/storage/v1/render/image/public/event-flyers/social.png?width=1200&height=2400&resize=contain&quality=75&format=webp";

test("fulfills storage images with a 1x1 PNG and aborts storage videos", async ({ page }) => {
  const seen = [];
  const failed = [];
  page.on("response", (res) => {
    if (/supabase\.co\/storage\//i.test(res.url())) {
      seen.push({
        url: res.url(),
        status: res.status(),
        stub: res.headers()["x-kos-test-stub"] || "",
        type: res.headers()["content-type"] || "",
        length: res.headers()["content-length"] || "",
      });
    }
  });
  page.on("requestfailed", (req) => {
    if (/supabase\.co\/storage\//i.test(req.url())) {
      failed.push({ url: req.url(), error: req.failure() && req.failure().errorText });
    }
  });

  await page.goto("about:blank");
  const image = await page.evaluate(async (url) => {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    return {
      status: res.status,
      type: res.headers.get("content-type"),
      stub: res.headers.get("x-kos-test-stub"),
      size: buf.byteLength,
    };
  }, IMAGE);
  expect(image.status).toBe(200);
  expect(image.stub).toBe("1");
  expect(image.type).toMatch(/image\/png/);
  expect(image.size).toBe(TINY_PNG.length);

  const render = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return {
      status: res.status,
      stub: res.headers.get("x-kos-test-stub"),
      size: (await res.arrayBuffer()).byteLength,
    };
  }, RENDER);
  expect(render.status).toBe(200);
  expect(render.stub).toBe("1");
  expect(render.size).toBe(TINY_PNG.length);

  const video = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url);
      return { ok: true, status: res.status, size: (await res.arrayBuffer()).byteLength };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }, VIDEO);
  expect(video.ok, "live storage video must not download").toBe(false);
  expect(failed.some((item) => item.url === VIDEO), "storage video request must be aborted").toBe(true);

  expect(seen.length, "image and render should produce stubbed responses").toBeGreaterThanOrEqual(2);
  for (const res of seen) {
    expect(res.stub, `unstubbed storage response: ${res.url}`).toBe("1");
    expect(Number(res.length || 0), `storage response too large: ${res.url}`).toBeLessThanOrEqual(TINY_PNG.length);
  }
});
