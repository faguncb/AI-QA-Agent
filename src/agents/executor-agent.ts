import { Tool } from "@langchain/core/tools";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage, ToolMessage, AIMessage } from "@langchain/core/messages";
import type {
  AgentResult,
  TestCase,
  TestResult,
  StepResult,
  TestStep,
} from "../types/index.js";
import type { BrowserSession } from "../tools/browser-tools.js";

const EXECUTOR_SYSTEM_PROMPT = `You are a QA Test Executor Agent. You execute test steps using browser automation tools.

For each test step, you will use the appropriate browser tool:
- browser_navigate: Navigate to a URL
- browser_click: Click an element (provide exact CSS selector)
- browser_fill: Fill an input field
- browser_assert: Verify page state (text, visible, url, title, count)
- browser_screenshot: Take a screenshot
- browser_get_content: Get current page text/title/URL
- browser_get_elements: List elements matching a selector
- browser_wait_for_selector: Wait for an element to appear
- browser_evaluate: Run JavaScript in the page

Always call browser_screenshot after important interactions to capture evidence.
If a step fails, report the error clearly and continue to the next step.
Report each step result as JSON: {"step": "description", "status": "passed"|"failed"|"skipped", "output": "...", "error": "..."}.`;

export class ExecutorAgent {
  private model: ChatAnthropic;
  readonly name = "TestExecutor";
  readonly role = "executor" as const;

  constructor(
    private tools: Tool[],
    private session: BrowserSession
  ) {
    this.model = new ChatAnthropic({
      model: "claude-opus-4-6",
      temperature: 0,
    }).bindTools(tools) as ChatAnthropic;
  }

  async process(
    _input: string,
    context?: Record<string, unknown>
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const testCase = context?.testCase as TestCase | undefined;

    if (!testCase) {
      return {
        agentName: this.name,
        role: this.role,
        output: "",
        success: false,
        error: "No test case provided in context",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const result = await this.executeTestCase(testCase);
      return {
        agentName: this.name,
        role: this.role,
        output: JSON.stringify(result, null, 2),
        success: result.status !== "failed",
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

  async executeTestCase(testCase: TestCase): Promise<TestResult> {
    const startedAt = new Date();
    const stepResults: StepResult[] = [];

    console.log(`  [Executor] Running: "${testCase.name}"`);

    // Ensure browser is initialized with navigation to starting URL
    if (!this.session.isActive()) {
      await this.session.launch();
    }

    for (const step of testCase.steps) {
      const stepResult = await this.executeStep(step);
      stepResults.push(stepResult);

      if (stepResult.status === "failed") {
        // Capture failure screenshot
        try {
          const screenshotPath = await this.session.screenshot(
            `failure-${testCase.id}-${Date.now()}.png`
          );
          stepResult.screenshot = screenshotPath;
        } catch {
          // screenshot capture failure is non-fatal
        }
      }
    }

    const allPassed = stepResults.every((s) => s.status !== "failed");
    const anyFailed = stepResults.some((s) => s.status === "failed");

    return {
      testCase,
      status: anyFailed ? "failed" : "passed",
      steps: stepResults,
      durationMs: Date.now() - startedAt.getTime(),
      startedAt,
      completedAt: new Date(),
    };
  }

  private async executeStep(step: TestStep): Promise<StepResult> {
    const startTime = Date.now();
    const tool = this.findTool(step.action);

    if (!tool) {
      return {
        step,
        status: "skipped",
        output: `No tool available for action: ${step.action}`,
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const toolInput = this.buildToolInput(step);
      console.log(`    [Step] ${step.description} (${step.action})`);
      const result = await tool.invoke(toolInput);
      const parsed = JSON.parse(result) as { success: boolean; result?: unknown; error?: string };

      return {
        step,
        status: parsed.success ? "passed" : "failed",
        output: JSON.stringify(parsed.result),
        error: parsed.error,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        step,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      };
    }
  }

  private findTool(action: string): Tool | undefined {
    const actionToTool: Record<string, string> = {
      navigate: "browser_navigate",
      click: "browser_click",
      fill: "browser_fill",
      type: "browser_fill",
      assertText: "browser_assert",
      assertVisible: "browser_assert",
      assertUrl: "browser_assert",
      assertTitle: "browser_assert",
      screenshot: "browser_screenshot",
      waitForSelector: "browser_wait_for_selector",
      getElements: "browser_get_elements",
      evaluate: "browser_evaluate",
    };

    const toolName = actionToTool[action];
    return this.tools.find((t) => t.name === toolName);
  }

  private buildToolInput(step: TestStep): string {
    switch (step.action) {
      case "navigate":
        return JSON.stringify({ url: step.selector ?? step.value ?? "" });
      case "click":
        return JSON.stringify({ selector: step.selector, timeout: step.timeout });
      case "fill":
      case "type":
        return JSON.stringify({
          selector: step.selector,
          value: step.value ?? "",
          timeout: step.timeout,
        });
      case "assertText":
        return JSON.stringify({
          type: "text",
          selector: step.selector,
          expected: step.value ?? "",
          timeout: step.timeout,
        });
      case "assertVisible":
        return JSON.stringify({
          type: "visible",
          selector: step.selector,
          expected: "true",
          timeout: step.timeout,
        });
      case "assertUrl":
        return JSON.stringify({ type: "url", expected: step.value ?? "" });
      case "assertTitle":
        return JSON.stringify({ type: "title", expected: step.value ?? "" });
      case "screenshot":
        return JSON.stringify({ fullPage: false });
      case "waitForSelector":
        return JSON.stringify({ selector: step.selector, timeout: step.timeout });
      case "getElements":
        return JSON.stringify({ selector: step.selector });
      case "evaluate":
        return JSON.stringify({ script: step.value ?? "" });
      default:
        return JSON.stringify({});
    }
  }

  // ─── AI-driven execution: let Claude decide tool calls autonomously ──────────
  async executeWithAI(testCase: TestCase): Promise<string> {
    const prompt = `Execute this test case step by step:

Test: ${testCase.name}
Description: ${testCase.description}
Expected Outcome: ${testCase.expectedOutcome}

Steps:
${testCase.steps.map((s, i) => `${i + 1}. [${s.action}] ${s.description}${s.selector ? ` (selector: "${s.selector}")` : ""}${s.value ? ` (value: "${s.value}")` : ""}`).join("\n")}

Execute each step using the browser tools. Take screenshots at key points. Report if each step passed or failed.`;

    const messages: (HumanMessage | SystemMessage | AIMessage | ToolMessage)[] = [
      new SystemMessage(EXECUTOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ];

    const toolMap = new Map(this.tools.map((t) => [t.name, t]));
    let iterations = 0;
    const maxIterations = 20;

    while (iterations < maxIterations) {
      iterations++;
      const response = await this.model.invoke(messages);
      messages.push(new AIMessage({ content: response.content, tool_calls: response.tool_calls }));

      if (!response.tool_calls || response.tool_calls.length === 0) {
        // Claude is done — no more tool calls
        return typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      }

      // Execute each tool call and collect results
      for (const toolCall of response.tool_calls) {
        const tool = toolMap.get(toolCall.name);
        if (!tool) {
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id ?? "",
              content: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
            })
          );
          continue;
        }

        try {
          const result = await tool.invoke(JSON.stringify(toolCall.args));
          messages.push(
            new ToolMessage({ tool_call_id: toolCall.id ?? "", content: result })
          );
        } catch (error) {
          messages.push(
            new ToolMessage({
              tool_call_id: toolCall.id ?? "",
              content: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            })
          );
        }
      }
    }

    return "Max iterations reached";
  }
}
