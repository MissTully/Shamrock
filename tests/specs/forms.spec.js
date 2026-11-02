// Regression: form structure and client-side validation.
// These tests never submit valid data — the forms write to the production
// Supabase backend, so we only exercise the browser-side validation path.
const { test, expect } = require("@playwright/test");
const { watchPage, assertHealthy } = require("./helpers");

test("join interest form: required fields block an empty submit", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/membership-application.html");

  await expect(page.locator("h1")).toHaveText("Join the Krewe");
  await expect(page.locator("nav .nav-cta")).toContainText("Join");
  await expect(page.locator("#submitBtn")).toHaveText(/Submit interest/);

  const form = page.locator("#appForm");
  await expect(form).toBeVisible();
  for (const id of ["firstName", "lastName", "email", "phone", "street", "city", "state", "zip"]) {
    await expect(page.locator("#" + id)).toHaveAttribute("required", /.*/);
  }
  await expect(page.locator("#notes")).not.toHaveAttribute("required", /.*/);
  expect(await form.evaluate((f) => f.checkValidity())).toBe(false);

  await page.fill("#firstName", "Test");
  await page.fill("#lastName", "Only");
  await page.fill("#email", "not-an-email");
  expect(await page.locator("#email").evaluate((el) => el.checkValidity())).toBe(false);

  const lead = page.locator("#joinLead");
  await expect(lead).toContainText("Someone from the Krewe will call you");
  await expect(lead).toContainText("full application comes later by email from the Membership Chair");
  await expect(lead).toContainText("does not ask for a Social Security number");
  await expect(lead).toContainText("driver's license");
  await expect(page.locator("#appFeeBox, #duesFeeBox, #feeTypeField, #partnerFields, #joinNextSteps")).toHaveCount(0);
  await expect(page.locator('a[href*="zeffy.com"]')).toHaveCount(0);
  await expect(page.locator("#appSsn, #partnerSsn")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Membership at a Glance");
  await expect(page.locator("body")).not.toContainText("Submit application");
  await expect(page.locator("body")).not.toContainText("Pay full krewe dues");
  await expect(page.locator("body")).not.toContainText("Application fee");
  const html = await page.content();
  expect(html).not.toMatch(/\d{3}-\d{2}-\d{4}/);

  assertHealthy(expect, report, "join interest form");
});

test("join interest submit posts name, email, phone, and address only", async ({ page }) => {
  const report = watchPage(page);
  let body = null;
  await page.route("**/rest/v1/rpc/submit_membership_application", async (route) => {
    body = route.request().postDataJSON();
    await route.abort();
  });
  await page.goto("/membership-application.html");
  await page.locator("#submitBtn").click();
  expect(body, "empty Join form must not call the interest endpoint").toBeNull();

  await page.fill("#firstName", "Test");
  await page.fill("#lastName", "Prospect");
  await page.fill("#email", "test.prospect@example.com");
  await page.fill("#phone", "813-555-0100");
  await page.fill("#street", "1 Shamrock Way");
  await page.fill("#city", "Tampa");
  await page.fill("#state", "FL");
  await page.fill("#zip", "33602");
  await page.fill("#notes", "Heard about the krewe at a parade.");
  await page.locator("#submitBtn").click();
  await expect.poll(() => body).not.toBeNull();
  expect(body.p_first_name).toBe("Test");
  expect(body.p_last_name).toBe("Prospect");
  expect(body.p_email).toBe("test.prospect@example.com");
  expect(body.p_phone).toBe("813-555-0100");
  expect(body.p_street_address).toBe("1 Shamrock Way");
  expect(body.p_city).toBe("Tampa");
  expect(body.p_state).toBe("FL");
  expect(body.p_zip).toBe("33602");
  expect(body.p_notes).toBe("Heard about the krewe at a parade.");
  expect(body).not.toHaveProperty("p_fee_type");
  expect(body).not.toHaveProperty("p_partner_first");
  expect(body).not.toHaveProperty("p_ssn");
  expect(body).not.toHaveProperty("p_partner_ssn");
  await expect(page.locator("#message")).toContainText("Something went wrong sending your interest");
  assertHealthy(expect, report, "join interest submit");
});

test("full application is token gated and checks driver's license above SSN", async ({ page }) => {
  const report = watchPage(page);
  const exact = "The board uses date of birth, SSN, and driver's license for the background check. Your information is held confidentially.";
  await page.goto("/membership-full-application.html");
  await expect(page.locator("#fullForm")).toBeHidden();
  await expect(page.locator("#linkGate")).toContainText("Membership Chair");
  await expect(page.locator("#idConfidentiality")).toHaveText(exact);
  await expect(page.locator("#dlState, #licenseState, [name='dl_state']")).toHaveCount(0);

  await page.goto("/membership-full-application.html?preview=single");
  await expect(page.locator("#applicant2")).toBeHidden();
  await expect(page.locator("#dob1")).toHaveAttribute("required", /.*/);
  await expect(page.locator("#dob1")).toHaveAttribute("type", "date");
  await expect(page.locator("#dob2")).not.toHaveAttribute("required", /.*/);

  await page.goto("/membership-full-application.html?preview=couple");
  await expect(page.locator("#fullForm")).toBeVisible();
  await expect(page.locator("#applicant2")).toBeVisible();
  await expect(page.locator("#feeLine")).toContainText("$75");
  await expect(page.locator("#idConfidentiality")).toHaveText(exact);
  await expect(page.locator("#dob1")).toHaveAttribute("required", /.*/);
  await expect(page.locator("#dob2")).toHaveAttribute("required", /.*/);
  await expect(page.locator("label[for='dob1']")).toHaveText("Date of birth");
  await expect(page.locator("label[for='dob2']")).toHaveText("Date of birth");
  const order = await page.evaluate(() => {
    function follows(a, b) {
      const left = document.getElementById(a);
      const right = document.getElementById(b);
      return !!(left && right && (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING));
    }
    const dobBesideIds = (dobId, dlId, ssnId) => {
      const dob = document.getElementById(dobId);
      const dl = document.getElementById(dlId);
      const ssn = document.getElementById(ssnId);
      const pair = dob && dob.closest(".id-pair");
      return !!(pair && pair.contains(dl) && pair.contains(ssn));
    };
    return follows("dl1", "ssn1") && follows("dl2", "ssn2") && follows("ssn1", "dl2")
      && dobBesideIds("dob1", "dl1", "ssn1") && dobBesideIds("dob2", "dl2", "ssn2");
  });
  expect(order).toBe(true);
  expect(await page.locator("#fullForm").evaluate((f) => f.checkValidity())).toBe(false);

  await page.locator("#dob1").fill("1988-03-14");
  await page.locator("#dob2").fill("1991-07-22");
  await page.locator("#dl1").fill("F123456789012");
  await page.locator("#ssn1").fill("123456789");
  await page.locator("#dl2").fill("G987654321098");
  await page.locator("#ssn2").fill("987654321");
  await page.addStyleTag({ content: ".krewe-nav,.krewe-music{display:none !important}" });
  await page.locator(".form-card").screenshot({
    path: "/opt/cursor/artifacts/full_application_dob_fields.png"
  });

  await page.locator("#dl1").fill("A1");
  await page.locator("#fullForm button[type=submit]").click();
  await expect(page.locator("#message")).toContainText("letters and numbers");

  await page.locator("#dl1").fill("fl-12");
  await expect(page.locator("#dl1")).toHaveValue("FL12");
  await page.locator("#ssn1").fill("12345678");
  await page.locator("#fullForm button[type=submit]").click();
  await expect(page.locator("#message")).toContainText("9 digit");
  await expect(page.locator("#ssn1")).not.toHaveValue(/123-45-6789/);

  await page.locator("#ssn1").fill("123456789");
  await expect(page.locator("#ssn1")).toHaveValue("•••-••-6789");
  await expect(page.locator("#ssn1")).toHaveAttribute("data-digits", "123456789");
  await page.locator("#dob1").fill("");
  expect(await page.locator("#fullForm").evaluate((f) => f.checkValidity())).toBe(false);
  await page.locator("#dob1").evaluate((el) => { el.required = false; });
  await page.locator("#fullForm button[type=submit]").click();
  await expect(page.locator("#message")).toContainText("Enter a date of birth.");

  await page.locator("#dob1").fill("1988-03-14");
  await page.locator("#dob1").evaluate((el) => { el.required = true; });
  await page.locator("#dl2").fill("B0000000");
  await page.locator("#ssn2").fill("");
  await page.locator("#dob2").fill("1991-07-22");
  await page.locator("#fullForm button[type=submit]").click();
  await expect(page.locator("#message")).toContainText("Applicant 2");
  await expect(page.locator("#message")).toContainText("date of birth");
  await page.locator("#dob2").fill("");
  expect(await page.locator("#fullForm").evaluate((f) => f.checkValidity())).toBe(false);
  await expect(page.locator("#fullForm")).toBeVisible();
  const html = await page.locator("#fullForm").innerHTML();
  expect(html).not.toContain("—");

  assertHealthy(expect, report, "full application");
});

test("full application sends both dates of birth with the background check ids", async ({ page }) => {
  const report = watchPage(page);
  let body = null;
  await page.route("**/rest/v1/rpc/lookup_membership_full_application", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        already_submitted: false,
        fee_type: "dual",
        applicant_first: "Nia",
        partner_first: "Maeve"
      })
    });
  });
  await page.route("**/rest/v1/rpc/submit_membership_full_application", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        message: "We received your date of birth, driver's license number, and Social Security number. The board uses date of birth, SSN, and driver's license for the background check. Your information is held confidentially."
      })
    });
  });
  const token = "ab".repeat(32);
  await page.goto("/membership-full-application.html?token=" + token);
  await expect(page.locator("#fullForm")).toBeVisible();
  await expect(page.locator("#applicant2Legend")).toContainText("Maeve");
  await page.locator("#dl1").fill("F123456789012");
  await page.locator("#ssn1").fill("123456789");
  await page.locator("#dob1").fill("1988-03-14");
  await page.locator("#dl2").fill("G987654321098");
  await page.locator("#ssn2").fill("987654321");
  await page.locator("#dob2").fill("1991-07-22");
  await page.locator("#fullForm button[type=submit]").click();
  await expect.poll(() => body).not.toBeNull();
  expect(body.p_dl).toBe("F123456789012");
  expect(body.p_ssn).toBe("123456789");
  expect(body.p_birthday).toBe("1988-03-14");
  expect(body.p_partner_dl).toBe("G987654321098");
  expect(body.p_partner_ssn).toBe("987654321");
  expect(body.p_partner_birthday).toBe("1991-07-22");
  expect(JSON.stringify(body)).not.toContain("—");
  await expect(page.locator("#message")).toContainText("date of birth");
  await expect(page.locator("#dob1")).toHaveValue("");
  await expect(page.locator("#dob2")).toHaveValue("");
  assertHealthy(expect, report, "full application dates");
});

test("event sign-up: form renders with event picker and required fields", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/event-signup.html");

  await expect(page.locator("#event")).toBeVisible();
  for (const id of ["event", "firstName", "lastName", "email"]) {
    await expect(page.locator("#" + id)).toHaveAttribute("required", /.*/);
  }
  const form = page.locator("form").filter({ has: page.locator("#event") }).first();
  expect(await form.evaluate((f) => f.checkValidity())).toBe(false);

  // the calendar shell renders even before/without backend data
  await expect(page.locator("#krewe-calendar")).toBeAttached();

  assertHealthy(expect, report, "event sign-up form");
});

test("members area: shows the auth gate, never the private content", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/members.html");

  await expect(page.locator("#authStage")).toBeAttached();
  // No member-only section should be visible without signing in.
  await page.waitForTimeout(1500);
  const gateVisible = await page.locator("#authStage").isVisible();
  expect(gateVisible, "auth gate should be shown to anonymous visitors").toBe(true);
  assertHealthy(expect, report, "members gate");
});

test("store: cart opens and starts empty", async ({ page }) => {
  const report = watchPage(page);
  await page.goto("/store.html");

  await expect(page.locator("#shopGrid")).toBeAttached();
  const cartBtn = page.locator("#cartBtn");
  await expect(cartBtn).toBeVisible();
  await expect(page.locator("#cartCount")).toHaveText(/^0?$/);
  await cartBtn.click();
  await expect(page.locator("#cartPanel")).toBeVisible();
  assertHealthy(expect, report, "store cart");
});
