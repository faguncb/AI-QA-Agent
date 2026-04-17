import { ChatAnthropic } from "@langchain/anthropic";
import { Tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import type { AgentConfig, AgentMessage, AgentResult } from "../types/index.js";

// ─── Base Agent ───────────────────────────────────────────────────────────────
// AutoGen-style agent: each agent has a role, system prompt, and can use tools.
// Agents communicate via message passing — the orchestrator routes messages
// between agents (similar to AutoGen's GroupChat pattern).

export abstract class BaseAgent {
  protected model: ChatAnthropic;
  protected conversationHistory: AgentMessage[] = [];
  public readonly config: AgentConfig;

  constructor(config: AgentConfig, tools: Tool[] = []) {
    this.config = config;
    this.model = new ChatAnthropic({
      model: "claude-opus-4-6",
      temperature: 0,
      // Bind tools if provided (LangChain tool binding)
      ...(tools.length > 0 ? {} : {}),
    });

    if (tools.length > 0) {
      this.model = this.model.bindTools(tools) as ChatAnthropic;
    }
  }

  // ─── Core method every agent must implement ─────────────────────────────────
  abstract process(input: string, context?: Record<string, unknown>): Promise<AgentResult>;

  // ─── Send a message to the LLM and get a response ───────────────────────────
  protected async chat(userMessage: string): Promise<string> {
    const messages = [
      new SystemMessage(this.config.systemPrompt),
      ...this.conversationHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) =>
          m.role === "user"
            ? new HumanMessage(m.content)
            : new AIMessage(m.content)
        ),
      new HumanMessage(userMessage),
    ];

    const response = await this.model.invoke(messages);
    return typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  }

  // ─── Add a message to conversation history ──────────────────────────────────
  protected addToHistory(role: AgentMessage["role"], content: string): void {
    this.conversationHistory.push({ role, content, timestamp: new Date() });
  }

  // ─── Clear conversation history ──────────────────────────────────────────────
  clearHistory(): void {
    this.conversationHistory = [];
  }

  // ─── Get the last N messages from history ────────────────────────────────────
  getRecentHistory(n = 10): AgentMessage[] {
    return this.conversationHistory.slice(-n);
  }

  get name(): string {
    return this.config.name;
  }

  get role() {
    return this.config.role;
  }
}
