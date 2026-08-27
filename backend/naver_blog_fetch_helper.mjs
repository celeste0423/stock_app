import fs from "fs";
import path from "path";
import { chromium } from "playwright";

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function launchBrowser() {
  const attempts = [
    { headless: true, channel: "msedge" },
    { headless: true },
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

async function gotoNeighborFeed(page) {
  const candidates = [
    "https://section.blog.naver.com/",
    "https://section.blog.naver.com/BlogHome.naver",
    "https://section.blog.naver.com/main/BuddyPostList.nhn",
    "https://section.blog.naver.com/NeighborPostList.naver",
  ];
  for (const url of candidates) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(2000);
      const buddyDropdown = page.locator("a.present_selected._buddy_dropdown_menu").first();
      if (await buddyDropdown.count()) {
        return page.url();
      }
      const feedCards = page.locator("a.desc_inner[href]");
      if ((await feedCards.count()) > 0) {
        return page.url();
      }
    } catch (error) {
    }
  }
  throw new Error("Failed to open NAVER blog neighbor feed.");
}

async function isLoggedOutPage(page) {
  try {
    const bodyText = await page.locator("body").innerText();
    return /로그아웃 상태입니다|로그인하여 이웃새글을 확인해보세요/.test(String(bodyText || ""));
  } catch (error) {
    return false;
  }
}

async function selectPreferredBuddyGroup(page) {
  const dropdown = page.locator("a.present_selected._buddy_dropdown_menu").first();
  if (!(await dropdown.count())) {
    return;
  }
  await dropdown.click().catch(() => {});
  await page.waitForTimeout(500);
  for (const label of ["주식투자", "증권", "투자", "전체이웃"]) {
    const option = page.locator("a.item", { hasText: label }).first();
    if (await option.count()) {
      await option.click().catch(() => {});
      await page.waitForTimeout(1500);
      return;
    }
  }
}

async function waitForNeighborCards(page) {
  const selectors = [
    "a.desc_inner[href]",
    "a.author[href]",
  ];
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 12000 });
      if (await page.locator(selector).count()) {
        return true;
      }
    } catch (error) {
    }
  }
  return false;
}

async function extractPosts(page, limit) {
  return await page.evaluate((maxItems) => {
    function clean(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function absoluteUrl(href) {
      try {
        return new URL(href, location.href).toString();
      } catch (error) {
        return "";
      }
    }

    function findCardRoot(anchor) {
      let node = anchor;
      for (let depth = 0; node && depth < 8; depth += 1) {
        if (typeof node.querySelector === "function" && node.querySelector("a.author[href]")) {
          return node;
        }
        node = node.parentElement;
      }
      return anchor.closest("li, article, section, div");
    }

    const rows = [];
    const cards = Array.from(document.querySelectorAll("a.desc_inner[href]"));
    for (const anchor of cards) {
      const href = absoluteUrl(anchor.getAttribute("href"));
      if (!href) continue;
      if (!/blog\.naver\.com|m\.blog\.naver\.com/i.test(href)) continue;
      if (!/\/\d{5,}|logNo=/i.test(href)) continue;

      const card = findCardRoot(anchor);
      if (!card) continue;

      const authorNode = card.querySelector("a.author[href]");
      if (!authorNode) continue;

      const title = clean(anchor.textContent || anchor.getAttribute("title") || "");
      if (title.length < 5) continue;

      const authorText = clean(authorNode.textContent || "");
      if (!authorText) continue;

      const authorParts = authorText.split(/\s+/).filter(Boolean);
      let blogName = authorText;
      let publishedText = "";
      if (authorParts.length >= 2) {
        const tail = authorParts.slice(-2).join(" ");
        if (/(\d+\s*분 전|\d+\s*시간 전|어제|오늘|\d{4}\.\d{1,2}\.\d{1,2})/.test(tail)) {
          blogName = authorParts.slice(0, -2).join(" ").trim() || authorText;
          publishedText = tail;
        }
      }

      const snippetNode = card.querySelector(".desc .text, a.text, .text");
      const snippet = clean(snippetNode ? snippetNode.textContent : "");
      const blockText = clean(card.innerText || "");
      if (!blockText || blockText.length < 20) continue;

      rows.push({
        title,
        url: href,
        blog_name: blogName,
        published_text: publishedText,
        snippet,
        context: blockText.slice(0, 800),
      });
    }

    return rows.slice(0, maxItems);
  }, limit);
}

async function main() {
  const statePath = process.argv[2];
  const outputPath = process.argv[3];
  const limit = Math.max(1, Math.min(Number(process.argv[4] || 40), 80));
  if (!statePath || !outputPath) {
    throw new Error("Storage state path and output path are required.");
  }
  if (!fs.existsSync(statePath)) {
    throw new Error("NAVER login state file does not exist.");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const browser = await launchBrowser();
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  try {
    const sourceUrl = await gotoNeighborFeed(page);
    if (await isLoggedOutPage(page)) {
      const payload = {
        ok: false,
        fetched_at: new Date().toISOString(),
        source_url: sourceUrl,
        login_required: true,
        item_count: 0,
        items: [],
      };
      fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
      console.log(JSON.stringify({ ok: false, login_required: true, output_path: outputPath, item_count: 0 }));
      return;
    }
    await selectPreferredBuddyGroup(page);
    await page.waitForTimeout(2500);
    await waitForNeighborCards(page);
    const items = uniqueBy(await extractPosts(page, limit * 3), (item) => item.url).slice(0, limit);
    const payload = {
      ok: true,
      fetched_at: new Date().toISOString(),
      source_url: sourceUrl,
      item_count: items.length,
      items,
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(JSON.stringify({ ok: true, output_path: outputPath, item_count: items.length }));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));
  process.exit(1);
});
