# AI-QA-Agent

An AI-powered automated quality assurance testing system that uses Claude (Anthropic), LangChain, and Playwright to autonomously generate test plans, execute browser-based tests, analyze results, and produce comprehensive QA reports — all from a single natural language objective.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Agents](#agents)
- [Browser Tools](#browser-tools)
- [LangChain Chains](#langchain-chains)
- [Output & Reports](#output--reports)
- [Type System](#type-system)
- [Development](#development)

---

## Overview

AI-QA-Agent is a multi-agent QA automation system built on top of:

- **Claude** (via Anthropic API) — AI backbone for test planning, execution decisions, result analysis, and report synthesis
- **LangChain** — Agent orchestration and LCEL (LangChain Expression Language) chain composition
- **Playwright** — Headless Chromium browser automation for real test execution
- **TypeScript** — Type-safe implementation throughout

The system runs a full QA lifecycle in four phases:

1. **Planning** — Claude generates a structured test plan from a natural language objective
2. **Execution** — Playwright executes each test case using browser automation tools
3. **Analysis** — Claude analyzes execution results and produces a structured JSON report
4. **Synthesis** — Orchestrator and LangChain chains enrich the report with executive summaries, coverage analysis, and professional bug reports

No test scripts need to be written by hand. Provide a URL and an objective; the agents handle the rest.

---

## Features

- **Natural language test generation** — Describe what you want to test; Claude creates the test plan
- **Real browser automation** — Tests run in actual Chromium via Playwright (not mocks)
- **Multi-agent orchestration** — Five specialized agents collaborate in a defined workflow
- **AI-driven execution** — The executor agent uses an agentic tool-call loop to adapt mid-test
- **Intelligent analysis** — Issues, warnings, and recommendations are AI-generated from raw results
- **LangChain report enhancement** — Parallel LCEL chains produce executive summaries, bug reports, and coverage analysis
- **Multiple report formats** — Console output, structured JSON, and formatted Markdown
- **Failure screenshots** — Automatic screenshot capture on test failure for debugging
- **Fully typed** — Strict TypeScript with comprehensive type definitions
- **Zero-config test authoring** — Configuration entirely via environment variables

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│               Environment Variables                 │
│      TARGET_URL  |  QA_OBJECTIVE  |  API_KEY        │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
          ┌─────────────────────────┐
          │    OrchestratorAgent    │
          │  (Master Coordinator)   │
          └──────────┬──────────────┘
                     │
     ┌───────────────┼───────────────┬───────────────┐
     ▼               ▼               ▼               ▼
 ┌────────┐    ┌──────────┐   ┌──────────┐   ┌──────────┐
 │Phase 1 │    │ Phase 2  │   │ Phase 3  │   │ Phase 4  │
 │Planning│    │Execution │   │Analysis  │   │Synthesis │
 └───┬────┘    └────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │               │
     ▼              ▼              ▼               ▼
 PlannerAgent  ExecutorAgent  AnalyzerAgent  Orchestrator
                    +                         LLM Call
              BrowserTools
              (9 Playwright
                 tools)
                     │
                     ▼
          ┌──────────────────────┐
          │  LangChain Chains    │
          │  (Report Enhancement)│
          └──────┬───────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
Executive     Coverage      Bug
Summary       Analysis      Reports
                 │
    ┌────────────┴────────────┐
    ▼                         ▼
JSON Report             Markdown Report
(./reports/)            (./reports/)
```

### Data Flow

1. User provides `TARGET_URL`, `QA_OBJECTIVE`, and `ANTHROPIC_API_KEY`
2. `OrchestratorAgent` initializes all child agents and a shared Playwright browser session
3. `PlannerAgent` (Claude) generates an array of structured `TestCase` objects as JSON
4. `ExecutorAgent` iterates through each test case:
   - Invokes Playwright-backed browser tools per step
   - Uses an agentic loop (up to 20 iterations) for AI-driven steps
   - Collects `TestResult` objects with pass/fail status and error details
   - Captures screenshots on failures
5. `AnalyzerAgent` (Claude) processes all results and produces a structured `QAReport`
6. `OrchestratorAgent` calls Claude again for a plain-language synthesis summary
7. LangChain LCEL chains run in parallel to enhance the report
8. `Reporter` writes output to console, JSON file, and Markdown file

---

## Project Structure

```
AI-QA-Agent/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── agents/
│   │   ├── base-agent.ts           # Abstract base class for all agents
│   │   ├── planner-agent.ts        # Generates test plans from objectives
│   │   ├── executor-agent.ts       # Executes tests using browser tools
│   │   ├── analyzer-agent.ts       # Analyzes results, generates reports
│   │   └── orchestrator-agent.ts   # Coordinates the full QA workflow
│   ├── tools/
│   │   └── browser-tools.ts        # 9 Playwright-backed browser tools
│   ├── chains/
│   │   └── qa-chain.ts             # LangChain LCEL chains for report enhancement
│   ├── types/
│   │   └── index.ts                # All TypeScript type definitions
│   └── utils/
│       └── reporter.ts             # Console, JSON, and Markdown report output
├── dist/                           # Compiled JavaScript output (generated)
├── reports/                        # QA report output directory (generated)
├── screenshots/                    # Test screenshot output (generated)
├── .env.example                    # Environment variable template
├── tsconfig.json                   # TypeScript compiler configuration
└── package.json                    # Dependencies and npm scripts
```

---

## Prerequisites

- **Node.js** v18 or higher
- **npm** v8 or higher
- An **Anthropic API key** with access to Claude models

---

## Installation

```bash
# 1. Clone the repository
git clone <repository-url>
cd AI-QA-Agent

# 2. Install dependencies
npm install

# 3. Install Playwright browsers
npx playwright install chromium

# 4. Copy the environment template
cp .env.example .env
```

---

## Configuration

Edit `.env` with your values:

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
TARGET_URL=https://example.com
QA_OBJECTIVE=Test the website's main navigation, page load, content visibility, and verify all major links work correctly.
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key for Claude access |
| `TARGET_URL` | No | `https://example.com` | The URL of the web application to test |
| `QA_OBJECTIVE` | No | Navigation and content test | Natural language description of what to test |

### Writing a Good Objective

The `QA_OBJECTIVE` is passed directly to Claude as a natural language instruction. Be specific about what you want tested:

```
# Broad (will produce general navigation/content tests)
QA_OBJECTIVE=Test the homepage

# Specific (will produce targeted, actionable test cases)
QA_OBJECTIVE=Test the user login flow including valid credentials, invalid credentials, and the forgot password link. Verify form validation messages appear correctly.
```

---

## Usage

### Development (runs TypeScript directly)

```bash
npm run dev
```

### Production (compiles then runs)

```bash
npm run build
npm start
```

### One-shot with inline env vars

```bash
ANTHROPIC_API_KEY="sk-ant-..." \
TARGET_URL="https://myapp.com" \
QA_OBJECTIVE="Test the checkout flow" \
npm start
```

### Clean generated artifacts

```bash
npm run clean
```

---

## Agents

The system uses five specialized agents, all extending `BaseAgent`.

### BaseAgent (`src/agents/base-agent.ts`)

Abstract base class shared by all agents. Manages:

- `ChatAnthropic` LangChain model instance
- Conversation history for multi-turn interactions
- `chat(message)` — sends a message to Claude and returns the response
- `addToHistory(role, content)` — appends to conversation history
- `clearHistory()` — resets conversation state

All agents implement the abstract `process()` method.

### PlannerAgent (`src/agents/planner-agent.ts`)

Generates a structured test plan from the target URL and objective.

- **Input**: URL string + QA objective string
- **Output**: Array of `TestCase` objects (JSON)
- Generates 3–6 independent test cases
- Each test case includes: `id`, `name`, `description`, `url`, `steps`, `expectedOutcome`, `tags`
- System prompt enforces strict JSON output — no markdown, no prose

### ExecutorAgent (`src/agents/executor-agent.ts`)

Executes each test case step by step using browser tools.

- **Input**: `TestCase` + active `BrowserSession`
- **Output**: `TestResult` with step-by-step results and pass/fail status
- Two execution modes:
  - **Direct mode**: Maps test steps to specific browser tool calls
  - **AI-driven mode** (`executeWithAI()`): Lets Claude autonomously choose and call tools in an agentic loop (up to 20 iterations)
- Captures failure screenshots automatically

### AnalyzerAgent (`src/agents/analyzer-agent.ts`)

Analyzes all execution results and produces a structured QA report.

- **Input**: Array of `TestResult` objects + session metadata
- **Output**: `QAReport` JSON with summary, pass rate, issues, warnings, recommendations
- Classifies issues by severity (`critical`, `high`, `medium`, `low`)
- Handles JSON parsing from Claude's response (strips markdown fences)

### OrchestratorAgent (`src/agents/orchestrator-agent.ts`)

Master coordinator that drives the full four-phase workflow.

- Initializes the shared Playwright browser (headless Chromium, 1280×720)
- Instantiates and calls PlannerAgent → ExecutorAgent → AnalyzerAgent in sequence
- Performs a final synthesis call to Claude for a plain-language summary
- Manages browser lifecycle (launch and close)
- Assembles the final `QASession` object

---

## Browser Tools

Nine Playwright-backed tools are available to the ExecutorAgent (`src/tools/browser-tools.ts`).

| Tool | Name | Description |
|---|---|---|
| `NavigateTool` | `browser_navigate` | Navigate to a URL with configurable wait strategy |
| `ClickTool` | `browser_click` | Click an element by CSS selector |
| `FillTool` | `browser_fill` | Type text into an input field |
| `AssertTool` | `browser_assert` | Assert page state: text content, visibility, URL, title, or element count |
| `ScreenshotTool` | `browser_screenshot` | Capture a screenshot of the current page |
| `GetPageContentTool` | `browser_get_content` | Get page title, URL, and text content (truncated to 3000 chars) |
| `EvaluateTool` | `browser_evaluate` | Execute arbitrary JavaScript in the page context |
| `GetElementsTool` | `browser_get_elements` | Query elements by selector, return metadata (text, tag, href, id, class) |
| `WaitForSelectorTool` | `browser_wait_for_selector` | Wait for an element to appear in the DOM |

All tools share a single `BrowserSession` instance that wraps a Playwright browser context with a 1280×720 viewport and a realistic user agent string. Screenshots are saved to `./screenshots/`.

---

## LangChain Chains

`src/chains/qa-chain.ts` defines four LCEL-based chains that enhance the base QA report:

| Chain | Purpose |
|---|---|
| `testPlanSummaryChain` | Generates a high-level overview of the test plan |
| `bugReportChain` | Creates structured, professional bug reports for each failure |
| `testCoverageChain` | Identifies coverage gaps and untested areas |
| `executiveSummaryChain` | Writes a stakeholder-friendly executive summary |

The `enhanceQAReport()` function runs all chains and merges their outputs back into the report. Chain calls that produce structured content are composed using LangChain's `|` pipe syntax (LCEL).

---

## Output & Reports

Each QA run produces three outputs:

### 1. Console Output

A formatted summary printed to stdout:

```
════════════════════════════════════════════════════════════
  QA SESSION REPORT
════════════════════════════════════════════════════════════
  Session ID  : qa-1776411776195
  Target URL  : https://example.com
  Objective   : Test the main navigation...
  Duration    : 42s
  Generated   : 2025-07-01T10:00:00.000Z
────────────────────────────────────────────────────────────
  TEST RESULTS
────────────────────────────────────────────────────────────
  Total Tests : 5
  Passed      : 4 ✅
  Failed      : 1 ❌
  Skipped     : 0 ⏭️
  Pass Rate   : 80%
```

### 2. JSON Report (`./reports/qa-report-{sessionId}.json`)

The complete `QASession` object serialized to JSON, including all test cases, step-by-step results, the full report, and session metadata. Useful for programmatic processing or integration with other tools.

### 3. Markdown Report (`./reports/qa-report-{sessionId}.md`)

A human-readable Markdown document containing:
- Test results summary table
- Individual test case details with pass/fail per step
- Critical issues and warnings with severity classification
- AI-generated recommendations
- Professional bug reports (from LangChain chain)
- Test coverage analysis

### Screenshots (`./screenshots/`)

Failure screenshots are saved as `failure-{testId}-{timestamp}.png` and referenced in the Markdown report.

---

## Type System

All core types are defined in `src/types/index.ts`.

### Key Types

```typescript
// A single test case generated by the PlannerAgent
interface TestCase {
  id: string;
  name: string;
  description: string;
  url: string;
  steps: TestStep[];
  expectedOutcome: string;
  tags: string[];
}

// The result of executing one TestCase
interface TestResult {
  testCaseId: string;
  testName: string;
  status: "passed" | "failed" | "skipped" | "error";
  steps: StepResult[];
  duration: number;
  error?: string;
  screenshotPath?: string;
}

// The full QA report produced by the AnalyzerAgent
interface QAReport {
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

// A single issue or warning
interface Issue {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  affectedComponent?: string;
  stepsToReproduce?: string[];
}

// The top-level session container
interface QASession {
  id: string;
  targetUrl: string;
  objective: string;
  testCases: TestCase[];
  results: TestResult[];
  report?: QAReport;
  startedAt: Date;
  completedAt?: Date;
}
```

---

## Development

### Build

```bash
npm run build      # Compile TypeScript to ./dist
```

### Run without compiling

```bash
npm run dev        # Run src/index.ts directly via ts-node
```

### Clean

```bash
npm run clean      # Remove ./dist, ./screenshots, ./reports
```

### TypeScript configuration

The project uses strict TypeScript (`"strict": true`) targeting ES2022 with CommonJS module output. Key settings in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "outDir": "./dist",
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true
  }
}
```

### Extending the system

**Add a new browser tool**: Create a class extending `DynamicStructuredTool` in `src/tools/browser-tools.ts`, define the Zod input schema, implement the `_call()` method using the shared `BrowserSession`, and register it in `ExecutorAgent`.

**Add a new agent**: Extend `BaseAgent`, implement the `process()` method, and call it from `OrchestratorAgent` in the appropriate phase.

**Add a new LangChain chain**: Define a new `PromptTemplate` + model + output parser pipeline in `src/chains/qa-chain.ts` and include it in `enhanceQAReport()`.

---

## Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@anthropic-ai/sdk` | ^0.89.0 | Claude API client |
| `@langchain/anthropic` | ^1.3.26 | LangChain integration for Claude |
| `@langchain/core` | ^1.1.40 | Core LangChain types and LCEL primitives |
| `langchain` | ^1.3.3 | LangChain framework |
| `playwright` | ^1.59.1 | Browser automation |
| `@playwright/test` | ^1.59.1 | Playwright test runner |
| `dotenv` | ^17.4.2 | Environment variable loading |
| `typescript` | ^6.0.2 | TypeScript compiler |
| `ts-node` | ^10.9.2 | Run TypeScript without pre-compiling |
| `zod` | ^4.3.6 | Schema validation for tool inputs |
