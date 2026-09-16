import { describe, expect, it } from "vitest";
import { toContent } from "../../web/src/features/refinement/RefinedModuleOutput.tsx";

describe("content adapter", () => {
  it("adapts persisted calendar fields without manufacturing per-item timestamps", () => {
    const items = toContent({ calendar: [{ day: 1, type: "educational", hook: "Idea", body: "Texto", channel: "Facebook", cta: "Ver el Ebook" }] });
    expect(items).toEqual([{ id: "content-0", title: "Idea", format: "educational", channel: "Facebook", status: "READY", body: "Texto", cta: "Ver el Ebook" }]);
    expect(items[0]).not.toHaveProperty("updatedAt");
  });

  it("preserves absent legacy fields instead of inventing a destination", () => {
    expect(toContent({ calendar: [{ day: 1, type: "educational", hook: "Legacy", body: "Texto" }] })).toEqual([
      { id: "content-0", title: "Legacy", format: "educational", channel: "Canal no registrado", status: "READY", body: "Texto", cta: "" },
    ]);
  });
});
