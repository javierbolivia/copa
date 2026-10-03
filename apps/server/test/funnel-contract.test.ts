import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("Funnel review contract", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  async function setup() {
    app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    const { project } = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json();
    const base = `/api/projects/${project.id}/modules/funnel`;
    return {
      base,
      result: (await app.inject({ method: "GET", url: base })).json().results[0],
      projectId: project.id,
    };
  }

  it("rejects invalid funnels: self-loops, cycles, missing nodes, and paymentsEnabled: true", async () => {
    const { base, result } = await setup();

    // 1. Self-loop
    const selfLoopRes = await app.inject({
      method: "POST",
      url: `${base}/drafts`,
      payload: {
        outputData: {
          ...result.outputData,
          edges: [{ from: "landing", to: "landing", event: "continue" }],
        },
      },
    });
    expect(selfLoopRes.statusCode).toBe(409);

    // 2. Cycle graph (a -> b -> c -> a)
    const cycleRes = await app.inject({
      method: "POST",
      url: `${base}/drafts`,
      payload: {
        outputData: {
          ...result.outputData,
          nodes: [
            { id: "node-1", type: "landing", label: "Paso 1" },
            { id: "node-2", type: "checkout", label: "Paso 2" },
            { id: "node-3", type: "thank_you", label: "Paso 3" },
          ],
          edges: [
            { from: "node-1", to: "node-2", event: "continue" },
            { from: "node-2", to: "node-3", event: "continue" },
            { from: "node-3", to: "node-1", event: "continue" }, // creates cycle!
          ],
        },
      },
    });
    expect(cycleRes.statusCode).toBe(409);

    // 3. paymentsEnabled === true
    const paymentViolationRes = await app.inject({
      method: "POST",
      url: `${base}/drafts`,
      payload: {
        outputData: {
          ...result.outputData,
          paymentsEnabled: true,
        },
      },
    });
    expect(paymentViolationRes.statusCode).toBe(409);

    // 4. Fewer than 2 nodes
    const singleNodeRes = await app.inject({
      method: "POST",
      url: `${base}/drafts`,
      payload: {
        outputData: {
          ...result.outputData,
          nodes: [{ id: "solo", type: "landing", label: "Solo uno" }],
          edges: [],
        },
      },
    });
    expect(singleNodeRes.statusCode).toBe(409);
  });

  it("does not approve a draft based on a superseded funnel version", async () => {
    const { base, result } = await setup();
    const draft = (
      await app.inject({
        method: "POST",
        url: `${base}/drafts`,
        payload: { outputData: result.outputData },
      })
    ).json();

    // Run new version which supersedes the base
    const generated = (await app.inject({ method: "POST", url: `${base}/run`, payload: { provider: "mock" } })).json();
    expect(generated.status).toBe("draft");
    expect((await app.inject({ method: "POST", url: `${base}/versions/${generated.versionId}/approve` })).statusCode).toBe(200);

    // Attempting to approve draft should fail with 409
    expect((await app.inject({ method: "POST", url: `${base}/versions/${draft.versionId}/approve` })).statusCode).toBe(409);
  });

  it("keeps generated funnels in review and blocks optional dependents until approval", async () => {
    const { base, projectId } = await setup();
    const generated = (await app.inject({ method: "POST", url: `${base}/run`, payload: { provider: "mock" } })).json();
    expect(generated).toMatchObject({ status: "draft", outputData: { paymentsEnabled: false, funnelValidationAudit: { ok: true } } });
    const blocked = await app.inject({ method: "POST", url: `/api/projects/${projectId}/modules/content/run`, payload: { provider: "mock" } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: "module_blocked", message: expect.stringContaining("Funnel tiene un borrador vigente pendiente de aprobación") });
  });

  it("runs contextual funnel, validates 6-node DAG with grounded prices, and exports funnel.md", async () => {
    const { base, projectId } = await setup();
    const runRes = await app.inject({
      method: "POST",
      url: `${base}/run`,
      payload: { provider: "mock", instructions: "Añadir order bump y upsell de mentoría" },
    });
    expect(runRes.statusCode).toBe(200);
    const newVersion = runRes.json();
    expect(newVersion.status).toBe("draft");

    expect(newVersion.outputData.paymentsEnabled).toBe(false);
    expect(newVersion.outputData.funnelValidationAudit.ok).toBe(true);

    const nodeTypes = newVersion.outputData.nodes.map((n: any) => n.type);
    expect(nodeTypes).toContain("landing");
    expect(nodeTypes.some((t: string) => t === "checkout" || t === "checkout_placeholder")).toBe(true);
    expect(nodeTypes).toContain("order_bump");
    expect(nodeTypes).toContain("upsell");
    expect(nodeTypes).toContain("downsell");
    expect(nodeTypes).toContain("thank_you");

    // Verify edges exist and connect the journey
    expect(newVersion.outputData.edges.length).toBeGreaterThanOrEqual(5);

    expect((await app.inject({ method: "POST", url: `${base}/versions/${newVersion.versionId}/approve` })).statusCode).toBe(200);

    // Verify exported funnel.md file
    const filesRes = await app.inject({ method: "GET", url: `/api/projects/${projectId}/files` });
    expect(filesRes.statusCode).toBe(200);
    const files = filesRes.json().files;
    const funnelFile = files.find((f: any) => f.fileRole === "funnel");
    expect(funnelFile).toBeDefined();
    expect(funnelFile.format).toBe("md");

    // Draft edit and approval lifecycle
    const draftRes = await app.inject({
      method: "POST",
      url: `${base}/drafts`,
      payload: {
        outputData: {
          ...newVersion.outputData,
          strategyRationale: "Estrategia editada por el usuario en borrador",
        },
        expectedBaseVersionId: newVersion.versionId,
        sourceVersionId: newVersion.versionId,
      },
    });
    expect(draftRes.statusCode).toBe(201);
    const draft = draftRes.json();
    expect(draft.status).toBe("draft");

    const approveRes = await app.inject({
      method: "POST",
      url: `${base}/versions/${draft.versionId}/approve`,
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().status).toBe("approved");
  });

  it("keeps contextual funnel integrations, prices, and payment steps unconfigured", async () => {
    const { projectId } = await setup();
    // Keep the complete in-memory parent lineage, but exercise the non-demo contextual generator.
    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${projectId}`,
      payload: { name: "Contextual QA" },
    });
    expect(renameResponse.statusCode).toBe(200);

    const runResponse = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/modules/funnel/run`,
      payload: { provider: "mock" },
    });
    expect(runResponse.statusCode, JSON.stringify(runResponse.json())).toBe(200);
    const output = runResponse.json().outputData;

    expect(output.paymentsEnabled).toBe(false);
    expect(output.funnelValidationAudit.ok).toBe(true);
    expect(output.externalCheckout).toEqual({ platform: "none" });
    expect(output.tracking).toEqual({ events: [] });
    expect(JSON.stringify(output)).not.toMatch(/982341058201|pay\.hotmart\.com/i);
    expect(JSON.stringify(output)).not.toMatch(/clic en botón de compra|transacción inicial aprobada|upsell aceptado/i);
    for (const id of ["checkout", "bump", "upsell", "downsell", "thanks"]) {
      expect(output.nodes.find((node: any) => node.id === id).active).toBe(false);
    }
    expect(output.nodes.find((node: any) => node.id === "checkout")).toMatchObject({
      price: null,
      externalPlatform: "none",
    });
  });
});
