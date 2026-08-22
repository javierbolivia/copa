import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const skillRoot = resolve(import.meta.dirname, "../../../.agents/skills/hallazia-engineering");

describe("Codex repository Skill", () => {
  it("usa la convención repo-local .agents/skills con disclosure progresivo", () => {
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1] ?? "";
    const name = frontmatter.match(/^name:\s*(.+)$/mu)?.[1]?.trim() ?? "";
    const description = frontmatter.match(/^description:\s*(.+)$/mu)?.[1]?.trim() ?? "";
    expect(name).toBe("hallazia-engineering");
    expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
    expect(description).not.toMatch(/[<>]/u);
    expect(skill).not.toContain("TODO");
    for (const reference of ["architecture", "testing", "providers", "research", "memory"]) {
      expect(existsSync(resolve(skillRoot, "references", `${reference}.md`))).toBe(true);
      expect(skill).toContain(`references/${reference}.md`);
    }
    for (const script of ["repo-baseline", "safe-diff", "targeted-verify", "runtime-health"]) {
      expect(existsSync(resolve(skillRoot, "scripts", `${script}.ps1`))).toBe(true);
    }
    expect(readFileSync(resolve(skillRoot, "../../../AGENTS.md"), "utf8"))
      .toContain(".agents/skills/hallazia-engineering/SKILL.md");
  });
});
