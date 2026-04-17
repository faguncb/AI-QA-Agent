import { Tool } from "@langchain/core/tools";
import { Browser, BrowserContext, Page, chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";
import type {
  BrowserNavigateInput,
  BrowserClickInput,
  BrowserFillInput,
  BrowserAssertInput,
  BrowserScreenshotInput,
  BrowserEvaluateInput,
  ToolOutput,
} from "../types/index.js";

// ─── Browser Session Manager ──────────────────────────────────────────────────

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  public page: Page | null = null;
  private screenshotDir: string;

  constructor(screenshotDir = "./screenshots") {
    this.screenshotDir = screenshotDir;
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  }

  async launch(headless = true): Promise<void> {
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    });
    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  async screenshot(name?: string, fullPage = false): Promise<string> {
    if (!this.page) throw new Error("No active browser page");
    const filename = name ?? `screenshot-${Date.now()}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    await this.page.screenshot({ path: filepath, fullPage });
    return filepath;
  }

  isActive(): boolean {
    return this.page !== null;
  }
}

// ─── Navigate Tool ────────────────────────────────────────────────────────────

export class NavigateTool extends Tool {
  name = "browser_navigate";
  description =
    "Navigate the browser to a URL. Input must be JSON with 'url' (required) and optional 'waitUntil' ('load' | 'domcontentloaded' | 'networkidle').";

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    const parsed: BrowserNavigateInput = JSON.parse(input);
    const { url, waitUntil = "domcontentloaded" } = parsed;

    if (!this.session.page) {
      await this.session.launch();
    }

    await this.session.page!.goto(url, { waitUntil, timeout: 30_000 });
    const title = await this.session.page!.title();
    const currentUrl = this.session.page!.url();

    const output: ToolOutput = {
      success: true,
      result: { title, url: currentUrl },
    };
    return JSON.stringify(output);
  }
}

// ─── Click Tool ───────────────────────────────────────────────────────────────

export class ClickTool extends Tool {
  name = "browser_click";
  description =
    "Click an element on the page. Input must be JSON with 'selector' (CSS or text selector) and optional 'timeout' in ms.";

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");
    const parsed: BrowserClickInput = JSON.parse(input);
    const { selector, timeout = 10_000 } = parsed;

    await this.session.page.click(selector, { timeout });

    const output: ToolOutput = { success: true, result: `Clicked: ${selector}` };
    return JSON.stringify(output);
  }
}

// ─── Fill Tool ────────────────────────────────────────────────────────────────

export class FillTool extends Tool {
  name = "browser_fill";
  description =
    "Fill an input field with text. Input must be JSON with 'selector', 'value', and optional 'timeout'.";

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");
    const parsed: BrowserFillInput = JSON.parse(input);
    const { selector, value, timeout = 10_000 } = parsed;

    await this.session.page.fill(selector, value, { timeout });

    const output: ToolOutput = {
      success: true,
      result: `Filled "${selector}" with "${value}"`,
    };
    return JSON.stringify(output);
  }
}

// ─── Assert Tool ──────────────────────────────────────────────────────────────

export class AssertTool extends Tool {
  name = "browser_assert";
  description =
    'Verify page state. Input must be JSON with "type" (text|visible|url|title|count), optional "selector", "expected" value, and optional "timeout".';

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");
    const parsed: BrowserAssertInput = JSON.parse(input);
    const { type, selector, expected, timeout = 10_000 } = parsed;

    let actual: string;
    let passed: boolean;

    switch (type) {
      case "url":
        actual = this.session.page.url();
        passed = actual.includes(expected);
        break;
      case "title":
        actual = await this.session.page.title();
        passed = actual.includes(expected);
        break;
      case "text":
        if (!selector) throw new Error("selector required for text assertion");
        actual = await this.session.page.innerText(selector, { timeout });
        passed = actual.includes(expected);
        break;
      case "visible":
        if (!selector)
          throw new Error("selector required for visible assertion");
        const element = await this.session.page.$(selector);
        passed = element !== null && (await element.isVisible());
        actual = passed ? "visible" : "not visible";
        break;
      case "count":
        if (!selector) throw new Error("selector required for count assertion");
        const count = await this.session.page.locator(selector).count();
        actual = String(count);
        passed = actual === expected;
        break;
      default:
        throw new Error(`Unknown assertion type: ${type}`);
    }

    const output: ToolOutput = {
      success: passed,
      result: { type, expected, actual, passed },
      error: passed ? undefined : `Assertion failed: expected "${expected}", got "${actual}"`,
    };
    return JSON.stringify(output);
  }
}

// ─── Screenshot Tool ──────────────────────────────────────────────────────────

export class ScreenshotTool extends Tool {
  name = "browser_screenshot";
  description =
    "Take a screenshot of the current page. Input must be JSON with optional 'path' and 'fullPage' (boolean).";

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");
    const parsed: BrowserScreenshotInput = input ? JSON.parse(input) : {};
    const { path: name, fullPage = false } = parsed;

    const filepath = await this.session.screenshot(name, fullPage);

    const output: ToolOutput = { success: true, result: { filepath } };
    return JSON.stringify(output);
  }
}

// ─── Get Page Content Tool ────────────────────────────────────────────────────

export class GetPageContentTool extends Tool {
  name = "browser_get_content";
  description =
    'Get the current page text content, title, and URL. Input can be "{}" or empty string.';

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(_input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");

    const title = await this.session.page.title();
    const url = this.session.page.url();
    // Limit content to 3000 chars to keep context manageable
    const content = (await this.session.page.innerText("body")).slice(0, 3_000);

    const output: ToolOutput = {
      success: true,
      result: { title, url, content },
    };
    return JSON.stringify(output);
  }
}

// ─── Evaluate Tool ────────────────────────────────────────────────────────────

export class EvaluateTool extends Tool {
  name = "browser_evaluate";
  description =
    'Run JavaScript in the browser page context. Input must be JSON with "script" (JS expression string). Returns the result.';

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");
    const parsed: BrowserEvaluateInput = JSON.parse(input);

    const result = await this.session.page.evaluate(parsed.script);

    const output: ToolOutput = { success: true, result };
    return JSON.stringify(output);
  }
}

// ─── Get Elements Tool ────────────────────────────────────────────────────────

export class GetElementsTool extends Tool {
  name = "browser_get_elements";
  description =
    'Get info about elements matching a CSS selector. Input must be JSON with "selector". Returns array of {text, tag, href, id, class}.';

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");
    const { selector } = JSON.parse(input) as { selector: string };

    const elements = await this.session.page.locator(selector).all();
    const data = await Promise.all(
      elements.slice(0, 20).map(async (el) => ({
        text: (await el.innerText().catch(() => "")).slice(0, 100),
        tag: await el.evaluate((e) => e.tagName.toLowerCase()),
        href: await el.getAttribute("href").catch(() => null),
        id: await el.getAttribute("id").catch(() => null),
        class: await el.getAttribute("class").catch(() => null),
      }))
    );

    const output: ToolOutput = { success: true, result: { count: elements.length, elements: data } };
    return JSON.stringify(output);
  }
}

// ─── Wait For Selector Tool ───────────────────────────────────────────────────

export class WaitForSelectorTool extends Tool {
  name = "browser_wait_for_selector";
  description =
    'Wait for a CSS selector to appear. Input must be JSON with "selector" and optional "timeout" (ms).';

  constructor(private session: BrowserSession) {
    super();
  }

  async _call(input: string): Promise<string> {
    if (!this.session.page) throw new Error("Browser not initialized");
    const { selector, timeout = 15_000 } = JSON.parse(input) as {
      selector: string;
      timeout?: number;
    };

    await this.session.page.waitForSelector(selector, { timeout });

    const output: ToolOutput = { success: true, result: `Selector "${selector}" appeared` };
    return JSON.stringify(output);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createBrowserTools(session: BrowserSession): Tool[] {
  return [
    new NavigateTool(session),
    new ClickTool(session),
    new FillTool(session),
    new AssertTool(session),
    new ScreenshotTool(session),
    new GetPageContentTool(session),
    new EvaluateTool(session),
    new GetElementsTool(session),
    new WaitForSelectorTool(session),
  ];
}
