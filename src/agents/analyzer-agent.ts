import { BaseAgent } from "./base-agent.js";
import type {
  AgentResult,
  TestResult,
  QAReport,
  Issue,
} from "../types/index.js";

const ANALYZER_SYSTEM_PROMPT = `You are a QA Test Analyzer Agent. You analyze test execution results and produce
a comprehensive QA report with actionable insights.

Given test results, you will:
1. Summarize overall test execution (pass rate, failures, patterns)
2. Identify critical issues that block core user flows
3. Flag warnings and non-critical failures
4. Provide specific, actionable recommendations to fix each issue
5. Assess the overall quality and risk level of the application

Respond ONLY with a valid JSON object matching this schema:
{
  "summary": "Executive summary of overall QA findings",
  "criticalIssues": [
    {
      "severity": "critical|high|medium|low",
      "description": "Clear description of the issue",
      "location": "Page URL or component where issue was found",
      "testCaseId": "ID of the test case that found this",
      "suggestion": "Specific fix recommendation"
    }
  ],
  "warnings": [...same schema as criticalIssues...],
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ]
}

Be precise and actionable. Focus on what matters most for the user experience.`;

export class AnalyzerAgent extends BaseAgent {
  constructor() {
    super({
      name: "TestAnalyzer",
      role: "analyzer",
      systemPrompt: ANALYZER_SYSTEM_PROMPT,
      maxIterations: 2,
    });
  }

  async process(
    _input: string,
    context?: Record<string, unknown>
  ): Promise<AgentResult> {
    const startTime = Date.now();
    const results = context?.results as TestResult[] | undefined;

    if (!results || results.length === 0) {
      return {
        agentName: this.name,
        role: this.role,
        output: "",
        success: false,
        error: "No test results provided for analysis",
        durationMs: Date.now() - startTime,
      };
    }

    try {
      const report = await this.analyzeResults(results);
      return {
        agentName: this.name,
        role: this.role,
        output: JSON.stringify(report, null, 2),
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

  async analyzeResults(results: TestResult[]): Promise<QAReport> {
    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const skipped = results.filter((r) => r.status === "skipped").length;
    const total = results.length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    const resultsText = results
      .map((r) => {
        const failedSteps = r.steps
          .filter((s) => s.status === "failed")
          .map((s) => `  - [FAILED] ${s.step.description}: ${s.error ?? "unknown error"}`)
          .join("\n");

        const passedSteps = r.steps
          .filter((s) => s.status === "passed")
          .map((s) => `  - [PASSED] ${s.step.description}`)
          .join("\n");

        return `
=== Test: ${r.testCase.name} (${r.status.toUpperCase()}) ===
Description: ${r.testCase.description}
Expected: ${r.testCase.expectedOutcome}
Duration: ${r.durationMs}ms

Passed Steps:
${passedSteps || "  (none)"}

Failed Steps:
${failedSteps || "  (none)"}
${r.error ? `\nTest Error: ${r.error}` : ""}`.trim();
      })
      .join("\n\n");

    const prompt = `
Analyze the following QA test results and produce a JSON report:

Summary Statistics:
- Total Tests: ${total}
- Passed: ${passed} (${passRate}%)
- Failed: ${failed}
- Skipped: ${skipped}

Detailed Results:
${resultsText}

Provide your analysis as JSON following the schema in your system prompt.
`.trim();

    this.addToHistory("user", prompt);
    const response = await this.chat(prompt);
    this.addToHistory("assistant", response);

    const analysis = this.parseAnalysis(response);

    return {
      sessionId: `session-${Date.now()}`,
      summary: analysis.summary,
      totalTests: total,
      passed,
      failed,
      skipped,
      passRate,
      criticalIssues: analysis.criticalIssues ?? [],
      warnings: analysis.warnings ?? [],
      recommendations: analysis.recommendations ?? [],
      generatedAt: new Date(),
    };
  }

  private parseAnalysis(response: string): {
    summary: string;
    criticalIssues: Issue[];
    warnings: Issue[];
    recommendations: string[];
  } {
    const cleaned = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error("Could not parse analyzer response as JSON");
    }
  }
}
