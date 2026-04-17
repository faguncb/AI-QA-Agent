import { BaseAgent } from "./base-agent.js";
import type { AgentResult, TestCase, TestStep } from "../types/index.js";

const PLANNER_SYSTEM_PROMPT = `You are a QA Test Planner Agent. Your sole responsibility is to analyze a web application
testing objective and produce a structured, executable test plan.

Given a target URL and testing objective, you will:
1. Identify the key user flows and features to test
2. Break each flow into concrete, step-by-step test cases
3. Specify exact Playwright actions for each step (navigate, click, fill, assertText, assertVisible, assertUrl, screenshot, etc.)
4. Define clear expected outcomes

You MUST respond ONLY with a valid JSON array of TestCase objects. No explanations, no markdown — pure JSON.

TestCase schema:
{
  "id": "tc-001",
  "name": "Short test name",
  "description": "What this test verifies",
  "url": "starting URL",
  "expectedOutcome": "What should happen if the test passes",
  "tags": ["smoke", "auth", "navigation"],
  "steps": [
    {
      "action": "navigate|click|fill|assertText|assertVisible|assertUrl|screenshot|waitForSelector|getElements",
      "selector": "CSS selector or text (optional)",
      "value": "input value or expected text (optional)",
      "description": "Human-readable description of this step",
      "timeout": 10000
    }
  ]
}

Available actions:
- navigate: Go to a URL (selector = URL)
- click: Click an element (selector = CSS selector)
- fill: Type in an input (selector = CSS selector, value = text to type)
- assertText: Check element text (selector = CSS selector, value = expected text)
- assertVisible: Check element is visible (selector = CSS selector)
- assertUrl: Check current URL contains (value = expected URL fragment)
- assertTitle: Check page title contains (value = expected title fragment)
- screenshot: Take a screenshot
- waitForSelector: Wait for element to appear (selector = CSS selector)
- getElements: List elements matching selector

Keep test cases focused and independent. Generate 3-6 test cases covering happy paths and key validations.`;

export class PlannerAgent extends BaseAgent {
  constructor() {
    super({
      name: "TestPlanner",
      role: "planner",
      systemPrompt: PLANNER_SYSTEM_PROMPT,
      maxIterations: 3,
    });
  }

  async process(
    input: string,
    context?: Record<string, unknown>
  ): Promise<AgentResult> {
    const startTime = Date.now();

    const prompt = `
Target URL: ${context?.url ?? "unknown"}
Testing Objective: ${input}

Generate a comprehensive test plan as a JSON array of TestCase objects.
`.trim();

    try {
      this.addToHistory("user", prompt);
      const response = await this.chat(prompt);
      this.addToHistory("assistant", response);

      // Parse and validate the JSON test plan
      const testCases = this.parseTestPlan(response);

      return {
        agentName: this.name,
        role: this.role,
        output: JSON.stringify(testCases, null, 2),
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        agentName: this.name,
        role: this.role,
        output: "",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private parseTestPlan(response: string): TestCase[] {
    // Strip potential markdown code fences
    const cleaned = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON array from the response
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("No valid JSON array found in planner response");
      parsed = JSON.parse(match[0]);
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Planner response is not a JSON array");
    }

    return parsed.map((tc, i) => this.normalizeTestCase(tc, i));
  }

  private normalizeTestCase(raw: Record<string, unknown>, index: number): TestCase {
    return {
      id: String(raw.id ?? `tc-${String(index + 1).padStart(3, "0")}`),
      name: String(raw.name ?? `Test Case ${index + 1}`),
      description: String(raw.description ?? ""),
      url: String(raw.url ?? ""),
      expectedOutcome: String(raw.expectedOutcome ?? ""),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
      steps: Array.isArray(raw.steps)
        ? raw.steps.map((s) => this.normalizeStep(s as Record<string, unknown>))
        : [],
    };
  }

  private normalizeStep(raw: Record<string, unknown>): TestStep {
    return {
      action: String(raw.action ?? "screenshot") as TestStep["action"],
      selector: raw.selector ? String(raw.selector) : undefined,
      value: raw.value ? String(raw.value) : undefined,
      description: String(raw.description ?? ""),
      timeout: typeof raw.timeout === "number" ? raw.timeout : 10_000,
    };
  }
}
