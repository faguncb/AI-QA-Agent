import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentResult, QASession, QAReport, TestResult } from "../types/index.js";
import { PlannerAgent } from "./planner-agent.js";
import { ExecutorAgent } from "./executor-agent.js";
import { AnalyzerAgent } from "./analyzer-agent.js";
import { BrowserSession, createBrowserTools } from "../tools/browser-tools.js";

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the QA Orchestrator Agent. You coordinate a multi-agent QA testing system.

Your team:
- TestPlanner: Creates structured test plans from objectives
- TestExecutor: Runs tests using Playwright browser automation
- TestAnalyzer: Analyzes results and generates reports

You manage the overall QA workflow, ensure agents complete their tasks, and synthesize the final report.
When asked to coordinate, describe what each agent did and summarize the overall outcome.`;

// ─── Orchestrator (AutoGen GroupChat equivalent) ──────────────────────────────
// The orchestrator drives the multi-agent conversation:
//   User → Orchestrator → Planner → Orchestrator → Executor(s) → Orchestrator → Analyzer → Report

export class OrchestratorAgent {
  private model: ChatAnthropic;
  private planner: PlannerAgent;
  private analyzer: AnalyzerAgent;
  private session: BrowserSession;
  readonly name = "Orchestrator";
  readonly role = "orchestrator" as const;

  constructor() {
    this.model = new ChatAnthropic({ model: "claude-opus-4-6", temperature: 0 });
    this.planner = new PlannerAgent();
    this.analyzer = new AnalyzerAgent();
    this.session = new BrowserSession("./screenshots");
  }

  // ─── Main entry point: run a full QA session ──────────────────────────────
  async runQASession(targetUrl: string, objective: string): Promise<QASession> {
    const sessionId = `qa-${Date.now()}`;
    const startedAt = new Date();

    console.log("\n╔════════════════════════════════════════════╗");
    console.log(`║  AI-Powered QA Agent — Session ${sessionId}  ║`);
    console.log("╚════════════════════════════════════════════╝\n");
    console.log(`Target: ${targetUrl}`);
    console.log(`Objective: ${objective}\n`);

    const qaSession: QASession = {
      id: sessionId,
      targetUrl,
      objective,
      testCases: [],
      results: [],
      startedAt,
    };

    try {
      // ── Phase 1: Planning ────────────────────────────────────────────────────
      console.log("📋 Phase 1: Test Planning (PlannerAgent)");
      const planResult = await this.planner.process(objective, { url: targetUrl });
      this.logAgentResult(planResult);

      if (!planResult.success) {
        throw new Error(`Planning failed: ${planResult.error}`);
      }

      qaSession.testCases = JSON.parse(planResult.output);
      console.log(`✓ Generated ${qaSession.testCases.length} test cases\n`);

      // ── Phase 2: Execution ───────────────────────────────────────────────────
      console.log("🚀 Phase 2: Test Execution (ExecutorAgent + Playwright)");
      await this.session.launch(true); // headless=true

      const tools = createBrowserTools(this.session);
      const executor = new ExecutorAgent(tools, this.session);

      for (let i = 0; i < qaSession.testCases.length; i++) {
        const tc = qaSession.testCases[i];
        console.log(`\n  [${i + 1}/${qaSession.testCases.length}] ${tc.name}`);

        const execResult = await executor.process("execute", { testCase: tc });
        this.logAgentResult(execResult);

        if (execResult.success && execResult.output) {
          const testResult: TestResult = JSON.parse(execResult.output);
          qaSession.results.push(testResult);
          const icon = testResult.status === "passed" ? "✅" : "❌";
          console.log(`  ${icon} ${testResult.status.toUpperCase()} (${testResult.durationMs}ms)`);
        }
      }

      await this.session.close();
      console.log(`\n✓ Executed ${qaSession.results.length} tests\n`);

      // ── Phase 3: Analysis ────────────────────────────────────────────────────
      console.log("🔍 Phase 3: Result Analysis (AnalyzerAgent)");
      const analysisResult = await this.analyzer.process("analyze", {
        results: qaSession.results,
      });
      this.logAgentResult(analysisResult);

      if (analysisResult.success && analysisResult.output) {
        qaSession.report = JSON.parse(analysisResult.output);
        qaSession.report!.sessionId = sessionId;
      }

      qaSession.completedAt = new Date();
      console.log("\n✓ Analysis complete\n");

      // ── Phase 4: Orchestrator synthesis ──────────────────────────────────────
      await this.synthesize(qaSession);

      return qaSession;
    } catch (error) {
      // Always close the browser on error
      if (this.session.isActive()) {
        await this.session.close().catch(() => {});
      }
      qaSession.completedAt = new Date();
      throw error;
    }
  }

  // ─── Let the orchestrator LLM synthesize a high-level summary ──────────────
  private async synthesize(session: QASession): Promise<void> {
    const report = session.report;
    if (!report) return;

    const prompt = `
QA Session Complete. Here is what happened:

URL Tested: ${session.targetUrl}
Objective: ${session.objective}
Tests Run: ${report.totalTests} (${report.passed} passed, ${report.failed} failed)
Pass Rate: ${report.passRate}%

Critical Issues: ${report.criticalIssues.length}
Warnings: ${report.warnings.length}

Provide a 2-3 sentence executive summary of the QA findings and overall readiness.
`.trim();

    const response = await this.model.invoke([
      new SystemMessage(ORCHESTRATOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    const summary =
      typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    console.log("📊 Orchestrator Summary:");
    console.log("─".repeat(50));
    console.log(summary);
    console.log("─".repeat(50));

    // Prepend orchestrator summary to the report summary
    if (session.report) {
      session.report.summary = `${summary}\n\n${session.report.summary}`;
    }
  }

  private logAgentResult(result: AgentResult): void {
    const icon = result.success ? "✓" : "✗";
    const status = result.success ? "SUCCESS" : "FAILED";
    console.log(
      `  [${result.agentName}] ${icon} ${status} (${result.durationMs}ms)${
        result.error ? ` — ${result.error}` : ""
      }`
    );
  }
}
