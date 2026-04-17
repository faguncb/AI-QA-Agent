import "dotenv/config";
import { OrchestratorAgent } from "./agents/orchestrator-agent.js";
import { enhanceQAReport } from "./chains/qa-chain.js";
import { printReport, saveReportToFile, saveMarkdownReport } from "./utils/reporter.js";

// ─── Main Entry Point ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY is not set. Please create a .env file.");
    process.exit(1);
  }

  // ── Configuration ────────────────────────────────────────────────────────────
  const targetUrl = process.env.TARGET_URL ?? "https://example.com";
  const objective =
    process.env.QA_OBJECTIVE ??
    "Test the website's main navigation, page load, and content visibility. Verify all major links work and key content is displayed correctly.";

  console.log("🤖 AI-Powered QA Agent");
  console.log("   LangChain + AutoGen-style Multi-Agent + Playwright + Claude Opus 4.6");
  console.log();

  // ── Run QA Session ───────────────────────────────────────────────────────────
  const orchestrator = new OrchestratorAgent();

  let session;
  try {
    session = await orchestrator.runQASession(targetUrl, objective);
  } catch (error) {
    console.error("\n❌ QA Session failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // ── Enhance report with LangChain chains ─────────────────────────────────────
  let enhanced: { executiveSummary: string; coverageAnalysis: string; bugReports: string[] } | undefined;
  if (session.report && session.results.length > 0) {
    console.log("✨ Enhancing report with LangChain chains...");
    try {
      enhanced = await enhanceQAReport(
        session.report,
        session.targetUrl,
        session.objective,
        session.results
      );
      console.log("✓ Report enhancement complete\n");
    } catch (err) {
      console.warn("⚠️  Report enhancement failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  }

  // ── Print and Save Reports ────────────────────────────────────────────────────
  printReport(session);
  saveReportToFile(session);

  saveMarkdownReport(
    session,
    enhanced?.executiveSummary,
    enhanced?.coverageAnalysis,
    enhanced?.bugReports
  );

  const passRate = session.report?.passRate ?? 0;
  const failed = session.report?.failed ?? 0;

  if (failed === 0) {
    console.log("\n🎉 All tests passed!");
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed (${passRate}% pass rate)`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
