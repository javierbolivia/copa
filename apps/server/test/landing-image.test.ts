import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { LandingImageService } from "../src/services/landing-image-service.js";

describe("Landing image generation", () => {
  it("rejects unconfigured generation without a physical request", async () => {
    let calls = 0;
    const service = new LandingImageService({ fetch: (async () => { calls++; throw new Error("unexpected"); }) as typeof fetch });
    await expect(service.generate("Fotografía editorial de un producto digital")).rejects.toThrow("no está configurado");
    expect(calls).toBe(0);
  });

  it("uses one explicit Gemini request and persists a real image in the requested project", async () => {
    const root = mkdtempSync(join(tmpdir(), "hallazia-landing-image-"));
    mkdirSync(join(root, "data"));
    const png = await sharp({ create: { width: 32, height: 20, channels: 3, background: "#2f7064" } }).png().toBuffer();
    let calls = 0;
    const fetchImage: typeof fetch = async (_url, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      expect(request.generationConfig.responseModalities).toEqual(["IMAGE"]);
      expect(request.generationConfig.responseFormat.image.aspectRatio).toBe("16:9");
      expect(request.contents[0].parts[0].text).toContain("cuaderno digital");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] }), { status: 200 });
    };
    const app = await createApp({ databasePath: join(root, "data", "app.sqlite"), serveFrontend: false, gemini: { apiKey: "test-only", fetch: fetchImage } });
    try {
      const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Cuaderno", niche: "Educación" } })).json<{ id: string }>();
      const result = await app.inject({ method: "POST", url: `/api/projects/${project.id}/product-assets/image-generation`, payload: { title: "Hero original", prompt: "Fotografía editorial de un cuaderno digital sobre organización", aspectRatio: "16:9" } });
      expect(result.statusCode, result.body).toBe(201);
      const asset = result.json<{ projectId: string; url: string; mimeType: string }>();
      expect(asset.projectId).toBe(project.id);
      expect(asset.mimeType).toBe("image/webp");
      const content = await app.inject({ method: "GET", url: asset.url });
      expect(content.statusCode).toBe(200);
      expect(await sharp(content.rawPayload).metadata()).toMatchObject({ width: 32, height: 20, format: "webp" });
      expect(calls).toBe(1);
    } finally {
      await app.close();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not retry when Gemini returns no usable image", async () => {
    let calls = 0;
    const service = new LandingImageService({ apiKey: "test-only", fetch: (async () => { calls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "No image" }] } }] }), { status: 200 }); }) as typeof fetch });
    await expect(service.generate("Una fotografía editorial de una mesa de trabajo")).rejects.toThrow("sin una imagen utilizable");
    expect(calls).toBe(1);
  });

  it("returns 404 for a missing project without calling Gemini", async () => {
    let calls = 0;
    const app = await createApp({ databasePath: ":memory:", serveFrontend: false, gemini: { apiKey: "test-only", fetch: (async () => { calls++; throw new Error("unexpected external call"); }) as typeof fetch } });
    try {
      const result = await app.inject({ method: "POST", url: "/api/projects/00000000-0000-4000-8000-000000000000/product-assets/image-generation", payload: { title: "Hero", prompt: "Fotografía editorial de una guía", aspectRatio: "16:9" } });
      expect(result.statusCode).toBe(404);
      expect(calls).toBe(0);
    } finally {
      await app.close();
    }
  });
});
