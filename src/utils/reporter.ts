import * as fs from "fs";
import * as path from "path";
import type { QASession, QAReport } from "../types/index.js";

// ─── Report Formatter / Writer ────────────────────────────────────────────────

export function printReport(session: QASession): void {
  const report = session.report;
  if (!report) {
    console.log("No report available.");
    return;
  }

  const durationSec = session.completedAt
    ? ((session.completedAt.getTime() - session.startedAt.getTime()) / 1000).toFixed(1)
    : "?";

  console.log("\n");
  console.log("═".repeat(60));
  console.log("  QA SESSION REPORT");
  console.log("═".repeat(60));
  console.log(`  Session ID  : ${session.id}`);
  console.log(`  Target URL  : ${session.targetUrl}`);
  console.log(`  Objective   : ${session.objective}`);
  console.log(`  Duration    : ${durationSec}s`);
  console.log(`  Generated   : ${new Date(report.generatedAt).toISOString()}`);
  console.log("─".repeat(60));
  console.log("  TEST RESULTS");
  console.log("─".repeat(60));
  console.log(`  Total Tests : ${report.totalTests}`);
  console.log(`  Passed      : ${report.passed} ✅`);
  console.log(`  Failed      : ${report.failed} ❌`);
  console.log(`  Skipped     : ${report.skipped} ⏭️`);
  console.log(`  Pass Rate   : ${report.passRate}%`);
  console.log("─".repeat(60));

  if (session.results.length > 0) {
    console.log("  INDIVIDUAL TESTS");
    console.log("─".repeat(60));
    for (const result of session.results) {
      const icon = result.status === "passed" ? "✅" : result.status === "failed" ? "❌" : "⏭️";
      console.log(`  ${icon} ${result.testCase.name}`);
      console.log(`     Status: ${result.status} | Duration: ${result.durationMs}ms`);
      const failedSteps = result.steps.filter((s) => s.status === "failed");
      if (failedSteps.length > 0) {
        for (const step of failedSteps) {
          console.log(`     ↳ FAILED: ${step.step.description}`);
          if (step.error) console.log(`       Error: ${step.error}`);
        }
      }
    }
    console.log("─".repeat(60));
  }

  if (report.criticalIssues.length > 0) {
    console.log("  CRITICAL ISSUES");
    console.log("─".repeat(60));
    for (const issue of report.criticalIssues) {
      console.log(`  [${issue.severity.toUpperCase()}] ${issue.description}`);
      if (issue.suggestion) console.log(`  → Fix: ${issue.suggestion}`);
    }
    console.log("─".repeat(60));
  }

  if (report.warnings.length > 0) {
    console.log("  WARNINGS");
    console.log("─".repeat(60));
    for (const warning of report.warnings) {
      console.log(`  [${warning.severity.toUpperCase()}] ${warning.description}`);
    }
    console.log("─".repeat(60));
  }

  if (report.recommendations.length > 0) {
    console.log("  RECOMMENDATIONS");
    console.log("─".repeat(60));
    for (let i = 0; i < report.recommendations.length; i++) {
      console.log(`  ${i + 1}. ${report.recommendations[i]}`);
    }
    console.log("─".repeat(60));
  }

  console.log("  SUMMARY");
  console.log("─".repeat(60));
  console.log(
    report.summary
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")
  );
  console.log("═".repeat(60));
  console.log();
}

export function saveReportToFile(
  session: QASession,
  outputDir = "./reports"
): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const filename = `qa-report-${session.id}.json`;
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(session, null, 2), "utf-8");
  console.log(`\n📄 Full report saved to: ${filepath}`);
  return filepath;
}

export function saveMarkdownReport(
  session: QASession,
  enhancedSummary?: string,
  coverageAnalysis?: string,
  bugReports?: string[],
  outputDir = "./reports"
): string {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const report = session.report;
  const filename = `qa-report-${session.id}.md`;
  const filepath = path.join(outputDir, filename);

  const lines: string[] = [
    `# QA Test Report`,
    ``,
    `**Session ID:** ${session.id}`,
    `**Target:** ${session.targetUrl}`,
    `**Objective:** ${session.objective}`,
    `**Generated:** ${new Date().toISOString()}`,
    ``,
    `---`,
    ``,
    `## Test Results Summary`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Tests | ${report?.totalTests ?? 0} |`,
    `| Passed | ${report?.passed ?? 0} ✅ |`,
    `| Failed | ${report?.failed ?? 0} ❌ |`,
    `| Pass Rate | ${report?.passRate ?? 0}% |`,
    ``,
  ];

  if (enhancedSummary) {
    lines.push(`## Executive Summary`, ``, enhancedSummary, ``);
  }

  lines.push(`## Test Cases`, ``);
  for (const result of session.results) {
    const icon = result.status === "passed" ? "✅" : "❌";
    lines.push(`### ${icon} ${result.testCase.name}`);
    lines.push(`- **Status:** ${result.status}`);
    lines.push(`- **Duration:** ${result.durationMs}ms`);
    lines.push(`- **Description:** ${result.testCase.description}`);
    const failedSteps = result.steps.filter((s) => s.status === "failed");
    if (failedSteps.length > 0) {
      lines.push(`- **Failed Steps:**`);
      for (const step of failedSteps) {
        lines.push(`  - ${step.step.description}: \`${step.error ?? "error"}\``);
      }
    }
    lines.push(``);
  }

  if (report?.criticalIssues.length) {
    lines.push(`## Critical Issues`, ``);
    for (const issue of report.criticalIssues) {
      lines.push(`### [${issue.severity.toUpperCase()}] ${issue.description}`);
      if (issue.suggestion) lines.push(`**Fix:** ${issue.suggestion}`, ``);
    }
  }

  if (bugReports?.length) {
    lines.push(`## Bug Reports`, ``);
    for (let i = 0; i < bugReports.length; i++) {
      lines.push(`### Bug ${i + 1}`, ``, bugReports[i], ``);
    }
  }

  if (coverageAnalysis) {
    lines.push(`## Test Coverage Analysis`, ``, coverageAnalysis, ``);
  }

  if (report?.recommendations.length) {
    lines.push(`## Recommendations`, ``);
    for (let i = 0; i < report.recommendations.length; i++) {
      lines.push(`${i + 1}. ${report.recommendations[i]}`);
    }
  }

  fs.writeFileSync(filepath, lines.join("\n"), "utf-8");
  console.log(`📝 Markdown report saved to: ${filepath}`);
  return filepath;
}
