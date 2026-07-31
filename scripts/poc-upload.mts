/**
 * Disposable POC: prove Playwright file-upload APIs against the-internet.
 * Run: npx tsx scripts/poc-upload.mts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "fixtures", "sample-upload.txt");
const UPLOAD_URL = "https://the-internet.herokuapp.com/upload";
const BACKUP_URL = "https://practice.expandtesting.com/upload";

async function assertUploaded(page: import("playwright").Page, expectedName: string) {
  await page.waitForSelector("#uploaded-files", { timeout: 15000 });
  const text = (await page.locator("#uploaded-files").innerText()).trim();
  if (!text.includes(expectedName)) {
    throw new Error(`Expected uploaded name "${expectedName}", got "${text}"`);
  }
}

async function runPath(baseUrl: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("#file-upload").setInputFiles(FIXTURE);
    await page.locator("#file-submit").click();
    await assertUploaded(page, "sample-upload.txt");
  } finally {
    await browser.close();
  }
}

async function runBuffer(baseUrl: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.locator("#file-upload").setInputFiles({
      name: "buffer-upload.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("buffer payload POC"),
    });
    await page.locator("#file-submit").click();
    await assertUploaded(page, "buffer-upload.txt");
  } finally {
    await browser.close();
  }
}

async function runFileChooser(baseUrl: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const chooserP = page.waitForEvent("filechooser");
    await page.locator("#file-upload").click();
    const chooser = await chooserP;
    await chooser.setFiles(FIXTURE);
    await page.locator("#file-submit").click();
    await assertUploaded(page, "sample-upload.txt");
  } finally {
    await browser.close();
  }
}

async function withFallback(
  name: string,
  fn: (baseUrl: string) => Promise<void>
): Promise<boolean> {
  for (const url of [UPLOAD_URL, BACKUP_URL]) {
    try {
      await fn(url);
      console.log(`PASS  ${name}  (${url})`);
      return true;
    } catch (err) {
      console.warn(`RETRY ${name} failed on ${url}: ${(err as Error).message}`);
    }
  }
  console.error(`FAIL  ${name}`);
  return false;
}

async function main() {
  const results = await Promise.all([
    withFallback("setInputFiles(path)", runPath),
    withFallback("setInputFiles(buffer)", runBuffer),
    withFallback("filechooser.setFiles", runFileChooser),
  ]);
  const ok = results.every(Boolean);
  console.log(ok ? "\nAll POC paths passed." : "\nPOC had failures.");
  process.exit(ok ? 0 : 1);
}

main();
