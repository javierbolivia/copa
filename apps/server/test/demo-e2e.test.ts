import type { ModuleResult, Project, Workflow } from "@our-platform/shared";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("recorrido E2E del proyecto Demo", () => {
  let app: FastifyInstance | undefined;
  const directories: string[] = [];

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("completa todos los módulos, exporta archivos y persiste tras reiniciar", async () => {
    const directory = mkdtempSync(join(tmpdir(), "our-platform-demo-"));
    directories.push(directory);
    const databasePath = join(directory, "demo.db");
    app = await createApp({ databasePath, serveFrontend: false });

    const created = await app.inject({ method: "POST", url: "/api/demo/projects" });
    expect(created.statusCode).toBe(201);
    const body = created.json<{ project: Project; results: ModuleResult[] }>();
    expect(body.project.name).toMatch(/^DEMO/);
    expect(body.results).toHaveLength(14);
    expect(body.results.at(-1)?.moduleKey).toBe("final_product");

    const workflow = (await app.inject({
      method: "GET",
      url: `/api/projects/${body.project.id}/workflow`,
    })).json<Workflow>();
    expect(workflow.steps.every((step) => step.state === "COMPLETED")).toBe(true);

    const generations = (await app.inject({
      method: "GET",
      url: `/api/projects/${body.project.id}/generations`,
    })).json<{ generations: unknown[] }>();
    expect(generations.generations).toHaveLength(14);
    expect(readdirSync(join(directory, "generated", body.project.id))).toHaveLength(2);
    const backup=(await app.inject({method:"POST",url:"/api/backups"})).json<{filename:string}>();
    const sidecar=join(directory,"backups",`${backup.filename}.files`);expect(existsSync(sidecar)).toBe(true);
    rmSync(sidecar,{recursive:true,force:true});
    const invalidRestore=await app.inject({method:"POST",url:"/api/backups/restore",payload:{filename:backup.filename,confirmed:true}});
    expect(invalidRestore.statusCode).toBe(500);

    await app.close();
    app = await createApp({ databasePath, serveFrontend: false });
    const persisted = await app.inject({
      method: "GET",
      url: `/api/projects/${body.project.id}/modules/final_product`,
    });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json<{ results: ModuleResult[] }>().results).toHaveLength(1);
  });

  it("bloquea un módulo cuando faltan sus dependencias", async () => {
    app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    const project = (await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Vacío", niche: "Prueba" },
    })).json<Project>();
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/modules/offer/run`,
      payload: { provider: "mock", demo: true },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: "module_blocked" });
  });

  it("materializa Sources automáticamente al continuar desde una fuente manual", async () => {
    app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    const project = (await app.inject({
      method: "POST", url: "/api/projects", payload: { name: "Manual", niche: "problema y frustración de los usuarios" },
    })).json<Project>();
    expect((await app.inject({
      method: "POST", url: `/api/projects/${project.id}/sources`,
      payload: { sourceType: "manual", title: "Notas", text: "Primer problema claro. Segunda frustración repetida." },
    })).statusCode).toBe(201);
    const problems = await app.inject({
      method: "POST", url: `/api/projects/${project.id}/modules/problems/run`,
      payload: { provider: "mock", demo: true },
    });
    expect(problems.statusCode).toBe(200);
    const sources = (await app.inject({
      method: "GET", url: `/api/projects/${project.id}/modules/sources`,
    })).json<{ results: ModuleResult[] }>();
    expect(sources.results[0]?.outputData).toMatchObject({ sourceCount: 1, commentCount: 1, isDemo: false });
    const output=problems.json<ModuleResult>().outputData as {items:Array<{quotes:string[];evidenceIds:string[]}>};
    expect(output.items[0]?.quotes[0]).toBe("Primer problema claro. Segunda frustración repetida.");
    const evidence=await app.inject({method:"GET",url:`/api/projects/${project.id}/evidence/${output.items[0]!.evidenceIds[0]}`});
    expect(evidence.statusCode).toBe(200);
    expect(evidence.json()).toMatchObject({quoteText:output.items[0]?.quotes[0],sourceTitle:"Notas"});

    const opportunity=(await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/opportunities/run`,payload:{provider:"mock",demo:true}})).json<ModuleResult>();
    const product=(await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/product/run`,payload:{provider:"mock",demo:true}})).json<ModuleResult>();
    const opportunityName=(opportunity.outputData as any).items[0].name;
    expect((product.outputData as any).proposals[0].concept).toContain(opportunityName);
    const generated:Record<string,ModuleResult>={};for(const key of ["avatar","mechanism","beliefs","offer","landing","funnel","content"]){generated[key]=(await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/${key}/run`,payload:{provider:"mock",demo:true}})).json<ModuleResult>();}
    expect((generated.beliefs!.outputData as any).avatar).toBe((generated.avatar!.outputData as any).name);
    expect((generated.funnel!.outputData as any).offerName).toBe((generated.offer!.outputData as any).name);
    expect((generated.content!.outputData as any).centralThesis).toBe((generated.beliefs!.outputData as any).centralThesis);

    await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",title:"Nueva evidencia",text:"Una observación posterior."}});
    const stale=(await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/problems`})).json<{results:ModuleResult[]}>();
    expect(stale.results[0]?.freshness).toBe("stale");
  });
});
