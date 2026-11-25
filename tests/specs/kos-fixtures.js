// Shared Playwright test export. Every spec should import { test, expect }
// from this file, not from @playwright/test, so live Supabase storage is
// never downloaded in CI.
// Images under *.supabase.co/storage/ are fulfilled with a 1x1 PNG.
// Videos and audio are aborted. Local fixture media is left alone.
const { test: base, expect } = require("@playwright/test");

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const MEDIA_EXT = /\.(mp4|mov|m4v|webm|mkv|avi|m3u8|mp3|wav|ogg|aac|flac)(?:$|\?)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)(?:$|\?)/i;

function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function isStorageUrl(url) {
  try {
    const u = new URL(url);
    return /\.supabase\.co$/i.test(u.hostname) && /\/storage\//.test(u.pathname);
  } catch {
    return false;
  }
}

function isMediaUrl(url, resourceType) {
  if (resourceType === "media") return true;
  if (MEDIA_EXT.test(url)) return true;
  return /\/storage\/v1\/object\/(?:public|sign|authenticated)\/krewe-videos\//i.test(url);
}

function isImageUrl(url, resourceType) {
  if (resourceType === "image") return true;
  if (IMAGE_EXT.test(url)) return true;
  return /\/storage\/v1\/render\/image\//i.test(url);
}

function looksLikeLiveStorage(response) {
  if (!isStorageUrl(response.url())) return false;
  const headers = response.headers();
  if (headers["x-kos-test-stub"] === "1") return false;
  if (headers["sb-request-id"] || headers["x-amz-request-id"] || headers["cf-ray"]) return true;
  const length = parseInt(headers["content-length"] || "0", 10);
  return length > 50_000;
}

async function stubStorageRoute(route) {
  const request = route.request();
  const url = request.url();
  const type = request.resourceType();
  if (isMediaUrl(url, type)) {
    await route.abort();
    return;
  }
  if (isImageUrl(url, type) || isStorageUrl(url)) {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: {
        "X-KOS-Test-Stub": "1",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "x-kos-test-stub, content-type, content-length",
      },
      body: TINY_PNG,
    });
    return;
  }
  await route.fallback();
}

async function stubRemoteMediaRoute(route) {
  const url = route.request().url();
  if (isLocalUrl(url)) {
    await route.fallback();
    return;
  }
  if (isStorageUrl(url) && !isMediaUrl(url, route.request().resourceType())) {
    await route.fallback();
    return;
  }
  await route.abort();
}

const test = base.extend({
  blockLiveStorage: [
    async ({ context }, use) => {
      const leaked = [];
      await context.route((url) => isStorageUrl(url.href), stubStorageRoute);
      await context.route((url) => MEDIA_EXT.test(url.href), stubRemoteMediaRoute);
      context.on("response", (response) => {
        if (looksLikeLiveStorage(response)) {
          const length = response.headers()["content-length"] || "?";
          leaked.push(`${response.url()} (${length} bytes)`);
        }
      });
      await use();
      if (leaked.length) {
        throw new Error(
          "A test downloaded live Supabase storage media:\n" + leaked.join("\n")
        );
      }
    },
    { auto: true },
  ],
});

module.exports = {
  test,
  expect,
  TINY_PNG,
  isStorageUrl,
  isMediaUrl,
  isLocalUrl,
};
