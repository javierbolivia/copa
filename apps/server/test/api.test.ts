import type { Project, ProjectList } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

describe("API local", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createApp({
      databasePath: ":memory:",
      logger: false,
      serveFrontend: false,
    });
  });

  afterEach(async () => app.close());

  it("responde health con SQLite operativo", async () => {
    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      version: "0.1.0",
      sqlite: {
        status: "ok",
        implementation: "node:sqlite",
        schemaVersion: 5,
      },
    });
  });

  it("completa create/list/get/update/archive de Projects", async () => {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        name: "Organización de fotografías",
        niche: "Productividad personal",
        description: "Una prueba inocua del flujo completo.",
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<Project>();

    const listResponse = await app.inject({ method: "GET", url: "/api/projects" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json<ProjectList>().projects.map((project) => project.id)).toEqual([
      created.id,
    ]);

    const getResponse = await app.inject({
      method: "GET",
      url: `/api/projects/${created.id}`,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json<Project>().niche).toBe("Productividad personal");

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/projects/${created.id}`,
      payload: { name: "Fototeca organizada" },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json<Project>().name).toBe("Fototeca organizada");

    const archiveResponse = await app.inject({
      method: "DELETE",
      url: `/api/projects/${created.id}`,
    });
    expect(archiveResponse.statusCode).toBe(200);
    expect(archiveResponse.json<Project>().status).toBe("archived");

    const activeList = await app.inject({ method: "GET", url: "/api/projects" });
    expect(activeList.json<ProjectList>().projects).toEqual([]);

    const allList = await app.inject({
      method: "GET",
      url: "/api/projects?includeArchived=true",
    });
    expect(allList.json<ProjectList>().projects).toHaveLength(1);
  });

  it("valida payloads y devuelve 404 para IDs válidos inexistentes", async () => {
    const invalid = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "", niche: "" },
    });
    expect(invalid.statusCode).toBe(400);

    const missing = await app.inject({
      method: "GET",
      url: "/api/projects/01912345-6789-7abc-8def-0123456789ab",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("expone settings, workflow, restore y eliminación confirmada", async()=>{
    const created=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Gestionable",niche:"Nicho"}})).json<Project>();
    const settings=await app.inject({method:"PUT",url:`/api/projects/${created.id}/settings`,payload:{language:"es",targetMarket:"Bolivia",currency:"BOB",generalNotes:"Notas",preferredLlmProvider:null,economyModel:null,powerfulModel:null,maxBudget:10,contentLanguage:"es"}});expect(settings.statusCode).toBe(200);expect(settings.json()).toMatchObject({currency:"BOB",targetMarket:"Bolivia"});
    const workflow=await app.inject({method:"GET",url:`/api/projects/${created.id}/workflow`});expect(workflow.json().steps).toHaveLength(14);
    expect((await app.inject({method:"DELETE",url:`/api/projects/${created.id}`})).json<Project>().status).toBe("archived");
    expect((await app.inject({method:"POST",url:`/api/projects/${created.id}/restore`})).json<Project>().status).toBe("active");
    expect((await app.inject({method:"DELETE",url:`/api/projects/${created.id}/permanent`,payload:{confirmProjectName:"incorrecto"}})).statusCode).toBe(409);
    expect((await app.inject({method:"DELETE",url:`/api/projects/${created.id}/permanent`,payload:{confirmProjectName:"Gestionable"}})).json()).toEqual({deleted:true});
  });
});
