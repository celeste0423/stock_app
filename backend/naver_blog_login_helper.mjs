import fs from "fs";
import path from "path";
import { chromium } from "playwright";

async function launchBrowser() {
  const attempts = [
    { headless: false, channel: "msedge" },
    { headless: false },
  ];
  let lastError = null;
  for (const options of attempts) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Failed to launch browser.");
}

async function main() {
  const statePath = process.argv[2];
  if (!statePath) {
    throw new Error("Storage state path is required.");
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("https://nid.naver.com/nidlogin.login?mode=form&url=https://section.blog.naver.com/", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const cookies = await context.cookies();
      const hasSession = cookies.some((item) => item.name === "NID_SES") && cookies.some((item) => item.name === "NID_AUT");
      if (hasSession) {
        await context.storageState({ path: statePath });
        console.log(JSON.stringify({ ok: true, state_path: statePath }));
        await browser.close();
        return;
      }
      await page.waitForTimeout(1000);
    }
    throw new Error("Timed out waiting for NAVER login.");
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));
  process.exit(1);
});
