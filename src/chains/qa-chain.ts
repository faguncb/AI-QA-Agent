import { ChatAnthropic } from "@langchain/anthropic";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables";
import type { QAReport, TestResult } from "../types/index.js";

// ─── LangChain Chains for QA Pipeline ────────────────────────────────────────
// These chains use LangChain's LCEL (LangChain Expression Language) to compose
// multi-step LLM workflows. Each chain is reusable and composable.

const model = new ChatAnthropic({
  model: "claude-opus-4-6",
  temperature: 0,
});

const outputParser = new StringOutputParser();

// ─── Test Plan Generation Chain ───────────────────────────────────────────────

const testPlanPrompt = PromptTemplate.fromTemplate(`
You are a QA expert. Generate a concise test plan summary for:

URL: {url}
Objective: {objective}
Number of Test Cases: {testCount}

List the key areas to test and any risks to watch for. Be concise (under 200 words).
`);

export const testPlanSummaryChain = RunnableSequence.from([
  testPlanPrompt,
  model,
  outputParser,
]);

// ─── Bug Report Chain ─────────────────────────────────────────────────────────

const bugReportPrompt = PromptTemplate.fromTemplate(`
Generate a detailed bug report for this test failure:

Test Case: {testName}
Description: {description}
Expected: {expected}
Actual Error: {error}
Failed Step: {failedStep}

Format as a professional bug report with:
1. Title (one line)
2. Severity (Critical/High/Medium/Low)
3. Steps to Reproduce
4. Expected Result
5. Actual Result
6. Suggested Fix
`);

export const bugReportChain = RunnableSequence.from([
  bugReportPrompt,
  model,
  outputParser,
]);

// ─── Test Coverage Analysis Chain ────────────────────────────────────────────

const coveragePrompt = PromptTemplate.fromTemplate(`
Analyze the test coverage for this QA session:

URL Tested: {url}
Test Cases: {testCaseNames}
Areas Tested: {areasTestedText}

Identify:
1. What was well covered
2. What was NOT tested (gaps)
3. Suggested additional test cases

Be specific and actionable. Under 300 words.
`);

export const testCoverageChain = RunnableSequence.from([
  coveragePrompt,
  model,
  outputParser,
]);

// ─── Executive Summary Chain ──────────────────────────────────────────────────

const executiveSummaryPrompt = PromptTemplate.fromTemplate(`
Write a professional executive QA summary for stakeholders:

Application: {url}
Testing Objective: {objective}
Pass Rate: {passRate}%
Tests Passed: {passed}/{total}
Critical Issues: {criticalCount}
Warnings: {warningCount}

Key Findings:
{keyFindings}

Write a 3-4 paragraph executive summary suitable for a project manager.
Include: overall quality assessment, risk level, key issues, and go/no-go recommendation.
`);

export const executiveSummaryChain = RunnableSequence.from([
  executiveSummaryPrompt,
  model,
  outputParser,
]);

// ─── Composite QA Report Enhancement Chain ────────────────────────────────────
// Takes a raw QA report and enhances it with LangChain chains

export async function enhanceQAReport(
  report: QAReport,
  url: string,
  objective: string,
  results: TestResult[]
): Promise<{
  executiveSummary: string;
  coverageAnalysis: string;
  bugReports: string[];
}> {
  const keyFindings = [
    ...report.criticalIssues.map((i) => `CRITICAL: ${i.description}`),
    ...report.warnings.map((w) => `WARNING: ${w.description}`),
  ]
    .slice(0, 5)
    .join("\n");

  const testCaseNames = results.map((r) => r.testCase.name).join(", ");
  const areasTestedText = results
    .map((r) => `${r.testCase.name}: ${r.status}`)
    .join("; ");

  // Run chains in parallel for efficiency
  const [executiveSummary, coverageAnalysis] = await Promise.all([
    executiveSummaryChain.invoke({
      url,
      objective,
      passRate: report.passRate,
      passed: report.passed,
      total: report.totalTests,
      criticalCount: report.criticalIssues.length,
      warningCount: report.warnings.length,
      keyFindings: keyFindings || "No major issues found",
    }),
    testCoverageChain.invoke({
      url,
      testCaseNames,
      areasTestedText,
    }),
  ]);

  // Generate bug reports for failed tests
  const failedResults = results.filter((r) => r.status === "failed");
  const bugReports = await Promise.all(
    failedResults.slice(0, 3).map(async (result) => {
      const failedStep = result.steps.find((s) => s.status === "failed");
      return bugReportChain.invoke({
        testName: result.testCase.name,
        description: result.testCase.description,
        expected: result.testCase.expectedOutcome,
        error: result.error ?? failedStep?.error ?? "Unknown error",
        failedStep: failedStep?.step.description ?? "Unknown step",
      });
    })
  );

  return { executiveSummary, coverageAnalysis, bugReports };
}
