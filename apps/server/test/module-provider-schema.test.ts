import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { RunModuleSchema } from "@our-platform/shared";

describe("module generation provider contract", () => {
  it.each(["groq", "openrouter"])("accepts %s as an explicit provider", (provider) => {
    expect(Value.Check(RunModuleSchema, { provider })).toBe(true);
  });
});
