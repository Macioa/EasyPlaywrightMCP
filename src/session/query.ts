import type { Page } from "playwright";
import { VIEWPORT } from "../paths.js";

export interface InteractiveControl {
  role: string;
  name: string;
  tag: string;
  selectorHint: string;
  href?: string;
}

export interface SessionPageData {
  sessionId: string;
  url: string;
  title: string;
  viewport: { width: number; height: number };
  ariaSnapshot: string;
  interactive: InteractiveControl[];
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

export async function querySessionPage(
  sessionId: string,
  page: Page
): Promise<SessionPageData> {
  const [url, title, snapshot, interactive] = await Promise.all([
    Promise.resolve(page.url()),
    page.title(),
    page
      .locator("body")
      .ariaSnapshot({ timeout: 5000 })
      .catch(async () => {
        const text = await page.locator("body").innerText().catch(() => "");
        return truncate(text.replace(/\s+/g, " ").trim(), 4000);
      }),
    page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll(
          "a[href], button, input, select, textarea, [role='button'], [role='link'], [role='tab'], [role='menuitem']"
        )
      ).slice(0, 80);
      return nodes.map((el) => {
        const html = el as HTMLElement;
        const tag = html.tagName.toLowerCase();
        const role =
          html.getAttribute("role") ||
          (tag === "a" ? "link" : tag === "button" ? "button" : tag);
        const name = (
          html.getAttribute("aria-label") ||
          html.getAttribute("name") ||
          html.getAttribute("placeholder") ||
          html.textContent ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        let selectorHint = tag;
        if (html.id) selectorHint = `#${html.id}`;
        else if (html.getAttribute("name"))
          selectorHint = `${tag}[name="${html.getAttribute("name")}"]`;
        else if (name) selectorHint = `${tag}:has-text(${JSON.stringify(name.slice(0, 40))})`;
        const href = tag === "a" ? (html as HTMLAnchorElement).href : undefined;
        return { role, name, tag, selectorHint, href };
      });
    }),
  ]);

  return {
    sessionId,
    url,
    title,
    viewport: { ...VIEWPORT },
    ariaSnapshot: truncate(
      typeof snapshot === "string" ? snapshot : String(snapshot),
      8000
    ),
    interactive: interactive as InteractiveControl[],
  };
}
