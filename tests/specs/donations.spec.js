// Give to the Krewe. Fixture people only. This file does not write gifts.
const { test, expect } = require("./kos-fixtures");
const { watchPage, assertHealthy, unlockMemberHub } = require("./helpers");

const GIFT_URL = "https://www.zeffy.com/en-US/donation-form/give-to-the-krewe-of-shamrock";

const GIFTS = [
  {
    id: "gift-paid",
    created_at: "2026-11-01T15:00:00.000Z",
    amount_cents: 2500,
    note: "For the kids",
    status: "paid",
    matched: true,
  },
  {
    id: "gift-pending",
    created_at: "2026-11-20T15:00:00.000Z",
    amount_cents: 1000,
    note: "",
    status: "pending",
    matched: false,
  },
];

const LEDGER = [
  {
    created_at: "2026-11-24T18:00:00.000Z",
    amount_cents: 5000,
    donor_name: "Alex Example",
    member_name: "Alex Example",
    note: "For the toy drive",
    payer_email: "alex@example.com",
  },
];

test("volunteer page offers Give to the Krewe in gold", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/volunteer.html");
  const give = page.locator("#giveToTheKrewe");
  await expect(give).toBeVisible();
  await expect(give).toHaveClass(/btn-primary/);
  await expect(give).not.toHaveClass(/btn-outline/);
  await expect(give).toHaveAttribute("href", new RegExp("donation-form/give-to-the-krewe-of-shamrock"));
  await expect(page.locator("#lendAHand")).toContainText("Give to the Krewe");
  await expect(page.locator("footer.krewe-foot")).toContainText("Donate");
  assertHealthy(expect, report, "volunteer give");
});

test("the public footer Donate link is on the home page", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/index.html");
  const donate = page.locator("footer.krewe-foot a[data-kos-donate='1']");
  await expect(donate).toHaveText("Donate");
  await expect(donate).toHaveAttribute("href", new RegExp(GIFT_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assertHealthy(expect, report, "home donate footer");
});

test("Member Desk donations card takes a gift and lists past gifts", async ({ page }) => {
  const report = watchPage(page);
  await page.addInitScript((gifts) => {
    window.__kosDonationPreview = { gifts: gifts };
  }, GIFTS);
  await unlockMemberHub(page);
  await page.locator("[data-hub-tab='parade']").click();
  const card = page.locator("#hubDonations");
  await expect(card).toBeVisible();
  await expect(card.locator("[data-give-amount='10']")).toHaveText("$10");
  await expect(card.locator("[data-give-amount='25']")).toHaveText("$25");
  await expect(card.locator("[data-give-amount='50']")).toHaveText("$50");
  await expect(card.locator("[data-give-amount='100']")).toHaveText("$100");
  await expect(card.locator("#hubDonationNote")).toHaveAttribute("maxlength", "500");
  await expect(card.locator("#hubDonationGifts")).toContainText("For the kids");
  await expect(card.locator("#hubDonationGifts")).toContainText("Matched");
  await expect(card.locator("#hubDonationGifts")).toContainText("Pending");
  await expect(card.locator("#hubDonationGifts")).toContainText("$25.00");

  await page.evaluate(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(url);
      return { closed: false };
    };
  });
  await card.locator("[data-give-amount='25']").click();
  await expect(card.locator("#hubDonationAmount")).toHaveValue("25");
  await card.locator("#hubDonationNote").fill("A note from the Hub");
  await card.locator("#hubDonationSubmit").click();
  await expect.poll(() => page.evaluate(() => window.__opened)).toEqual([
    GIFT_URL + "?amount=25",
  ]);
  assertHealthy(expect, report, "member donations card");
});

test("a blocked popup keeps a link to the giving form", async ({ page }) => {
  const report = watchPage(page);
  await page.addInitScript(() => {
    window.__kosDonationPreview = { gifts: [] };
  });
  await unlockMemberHub(page);
  await page.locator("[data-hub-tab='parade']").click();
  await page.evaluate(() => {
    window.open = () => null;
  });
  const card = page.locator("#hubDonations");
  await card.locator("[data-give-amount='10']").click();
  await card.locator("#hubDonationSubmit").click();
  const link = card.locator("#hubDonationFallback");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", GIFT_URL + "?amount=10");
  await expect(card.locator("#hubDonationMsg")).toContainText("open the giving form");
  await expect(card.locator("#hubDonationMsg")).not.toContainText("open in a new tab");
  assertHealthy(expect, report, "blocked donation popup");
});

test("Charity chair sees a read-only donations list and the Vice President does not", async ({ page }) => {
  const report = watchPage(page);
  await page.addInitScript((rows) => {
    window.__kosDonationLedger = rows;
  }, LEDGER);
  await unlockMemberHub(page, {
    role: {
      officer: true,
      canReviewVolunteerInquiries: true,
      canReviewCharityHours: true,
      canViewCharityDonations: true,
      toolKeys: ["volunteer_inquiries"],
    },
  });
  await page.locator("[data-hub-tab='officer']").click();
  await page.locator("[data-tool='tool:hubCharityDonations']").click();
  const list = page.locator("#hubCharityDonations");
  await expect(list).toContainText("Alex Example");
  await expect(list).toContainText("For the toy drive");
  await expect(list).toContainText("$50.00");
  await expect(list).toContainText("read only");
  await expect(list.locator("textarea, button.btn-primary")).toHaveCount(0);

  await unlockMemberHub(page, {
    role: {
      officer: true,
      canViewPayments: false,
      canViewCharityDonations: false,
      toolKeys: ["event_studio", "volunteer_inquiries"],
    },
  });
  await page.locator("[data-hub-tab='officer']").click();
  await expect(page.locator("[data-tool='tool:hubCharityDonations']")).toHaveCount(0);
  await expect(page.locator("[data-tool='tool:hubPayments']")).toHaveCount(0);
  assertHealthy(expect, report, "charity donations access");
});

test("payments desk has a Donations tab with a note column", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/raffle-qr-sheet.html");
  await page.evaluate(() => {
    document.body.replaceChildren();
    const panel = document.createElement("div");
    panel.id = "hubOfficer";
    document.body.appendChild(panel);
    window.__kosDonationLedger = [{
      created_at: "2026-11-24T18:00:00.000Z",
      amount_cents: 2500,
      donor_name: "Blair Example",
      member_name: "Blair Example",
      note: "Happy to help",
      payer_email: "blair@example.com",
    }];
    const empty = {
      select() { return empty; },
      eq() { return empty; },
      is() { return empty; },
      in() { return empty; },
      order() { return empty; },
      range() { return Promise.resolve({ data: [], error: null }); },
    };
    window.__kosSb = {
      rpc: async (name) => {
        if (name === "can_view_payments") return { data: true };
        if (name === "kos_list_donations") return { data: { ok: true, rows: window.__kosDonationLedger } };
        return { data: null };
      },
      from() { return empty; },
    };
  });
  await page.addScriptTag({ url: "/assets/kos-dues-reporting.js?v=20261125give1" });
  await page.evaluate(() => window.kosRenderDuesPayments(window.__kosSb));
  await page.waitForFunction(() => window.__kosDuesReportingReady === "shown");
  await page.getByRole("tab", { name: "Donations", exact: true }).click();
  const panel = page.locator("#hubPayPanel_donations");
  await expect(panel.locator("#hubDonationLedger")).toContainText("Blair Example");
  await expect(panel.locator("#hubDonationLedger")).toContainText("Happy to help");
  await expect(panel.locator("#hubDonationLedger")).toContainText("$25.00");
  await expect(panel.locator("th")).toContainText(["When", "Amount", "Donor", "Member", "Note"]);
  assertHealthy(expect, report, "payments donations tab");
});
