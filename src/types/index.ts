// ─── Agent Types ──────────────────────────────────────────────────────────────

export type AgentRole = "planner" | "executor" | "analyzer" | "orchestrator";

export interface AgentMessage {
  role: AgentRole | "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface AgentConfig {
  name: string;
  role: AgentRole;
  systemPrompt: string;
  maxIterations?: number;
  tools?: string[];
}

export interface AgentResult {
  agentName: string;
  role: AgentRole;
  output: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

// ─── QA Test Types ────────────────────────────────────────────────────────────

export type TestStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface TestCase {
  id: string;
  name: string;
  description: string;
  url: string;
  steps: TestStep[];
  expectedOutcome: string;
  tags?: string[];
}

export interface TestStep {
  action: PlaywrightAction;
  selector?: string;
  value?: string;
  description: string;
  timeout?: number;
}

export type PlaywrightAction =
  | "navigate"
  | "click"
  | "fill"
  | "type"
  | "select"
  | "hover"
  | "screenshot"
  | "waitForSelector"
  | "waitForNavigation"
  | "assertText"
  | "assertVisible"
  | "assertUrl"
  | "assertTitle"
  | "scroll"
  | "evaluate"
  | "getElements"
  | "checkAccessibility";

export interface TestResult {
  testCase: TestCase;
  status: TestStatus;
  steps: StepResult[];
  screenshot?: string;
  error?: string;
  durationMs: number;
  startedAt: Date;
  completedAt?: Date;
}

export interface StepResult {
  step: TestStep;
  status: TestStatus;
  output?: string;
  error?: string;
  screenshot?: string;
  durationMs: number;
}

// ─── QA Session Types ─────────────────────────────────────────────────────────

export interface QASession {
  id: string;
  targetUrl: string;
  objective: string;
  testCases: TestCase[];
  results: TestResult[];
  report?: QAReport;
  startedAt: Date;
  completedAt?: Date;
}

export interface QAReport {
  sessionId: string;
  summary: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  criticalIssues: Issue[];
  warnings: Issue[];
  recommendations: string[];
  generatedAt: Date;
}

export interface Issue {
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  location?: string;
  testCaseId?: string;
  suggestion?: string;
}

// ─── Tool Input / Output Types ────────────────────────────────────────────────

export interface BrowserNavigateInput {
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

export interface BrowserClickInput {
  selector: string;
  timeout?: number;
}

export interface BrowserFillInput {
  selector: string;
  value: string;
  timeout?: number;
}

export interface BrowserAssertInput {
  type: "text" | "visible" | "url" | "title" | "count";
  selector?: string;
  expected: string;
  timeout?: number;
}

export interface BrowserScreenshotInput {
  path?: string;
  fullPage?: boolean;
}

export interface BrowserEvaluateInput {
  script: string;
}

export interface ToolOutput {
  success: boolean;
  result?: unknown;
  error?: string;
}
