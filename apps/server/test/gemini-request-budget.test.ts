import { describe, expect, it, vi } from "vitest";

import { GeminiOperationRequestBudget } from "../src/services/module-service.js";

describe("Gemini operation request budget", () => {
  it("allows Research requests one and two, then blocks request three before outbound emission", () => {
    const budget = new GeminiOperationRequestBudget(2);
    const outbound = vi.fn();
    const send = (retry = false) => {
      budget.reserve("research/direct", retry);
      outbound();
    };

    send();
    send(true);
    expect(() => send()).toThrow("REQUEST_BUDGET_EXCEEDED");
    expect(outbound).toHaveBeenCalledTimes(2);
    expect(budget.snapshot()).toEqual({
      totalProviderRequests: 2,
      requestsByStage: { "research/direct": 2 },
      retries: 1,
      blockedRequests: 1,
      failedRequests: 0,
    });
  });

  it("allows Problems requests one through six, then blocks request seven before outbound emission", () => {
    const budget = new GeminiOperationRequestBudget(6);
    const outbound = vi.fn();
    const send = (stage: "problems/map" | "problems/global_reduce" | "vocabulary_discovery", retry = false) => {
      budget.reserve(stage, retry);
      outbound(stage);
    };

    for (let index = 0; index < 5; index += 1) send("problems/map");
    send("problems/global_reduce", true);
    expect(() => send("vocabulary_discovery")).toThrow("REQUEST_BUDGET_EXCEEDED");
    expect(outbound).toHaveBeenCalledTimes(6);
    expect(budget.snapshot()).toEqual({
      totalProviderRequests: 6,
      requestsByStage: { "problems/map": 5, "problems/global_reduce": 1 },
      retries: 1,
      blockedRequests: 1,
      failedRequests: 0,
    });
  });
});
