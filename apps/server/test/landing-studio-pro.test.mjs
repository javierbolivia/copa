// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { validateJsonSchema } from "../src/integrations/structured-output.js";
import { MODULE_OUTPUT_SCHEMAS } from "../src/services/module-output-schema.js";
import { createApp } from "../src/app.js";
import { validateLandingOutput } from "../src/services/landing-output-validator.js";
import { fromLanding, toLanding } from "../../web/src/features/refinement/landing-adapter.ts";
import { LandingBuilder } from "../../web/src/features/refinement/LandingBuilder.tsx";
import {
  applyContextualPromptToLanding,
  autoFixLandingStudioPro,
  buildProjectResearchContext,
  enrichLandingSectionFromContext,
  evaluateLandingStudioPro,
  extractStructuredFaqItems,
  renderFigmaTokensJson,
  renderLandingFigmaSvg,
  renderLandingFramerCode,
} from "../../web/src/features/refinement/LandingStudioPro.tsx";
import { api } from "../../web/src/api/client.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const spies = [];
afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
  document.body.replaceChildren();
});

function sampleModuleResults() {
  return {
    problems: {
      moduleKey: "problems",
      artifactId: "art-prob",
      versionId: "ver-prob-7",
      versionNumber: 7,
      freshness: "fresh",
      status: "approved",
      createdAt: "2026-10-03T00:00:00Z",
      outputData: {
        items: [
          {
            id: "item-1",
            name: "Reacciones explosivas ante otros perros durante el paseo",
            summary: "Dueños describen tensión extrema en la correa al cruzarse con otros perros.",
          },
        ],
      },
    },
    avatar: {
      moduleKey: "avatar",
      artifactId: "art-ava",
      versionId: "ver-ava-7",
      versionNumber: 7,
      freshness: "fresh",
      status: "approved",
      createdAt: "2026-10-03T00:00:00Z",
      outputData: {
        name: "Tutor urbano agotado",
        currentSituation: [{ text: "Evita horas con más perros por tensión diaria.", provenance: "EVIDENCE_BACKED", evidenceIds: ["ev-1"] }],
        desiredOutcome: [{ text: "Paseos planificados con rutas claras de retirada.", provenance: "EVIDENCE_BACKED", evidenceIds: ["ev-1"] }],
        pains: [{ text: "Miedo a que el perro se desborde al doblar la esquina.", provenance: "EVIDENCE_BACKED", evidenceIds: ["ev-1"] }],
        frustrations: [{ text: "Probar consejos contradictorios sin orden.", provenance: "EVIDENCE_BACKED", evidenceIds: ["ev-1"] }],
        objections: [{ text: "No tengo tiempo para rutinas de dos horas.", provenance: "AI_INFERENCE", evidenceIds: [] }],
      },
    },
    mechanism: {
      moduleKey: "mechanism",
      artifactId: "art-mec",
      versionId: "ver-mec-6",
      versionNumber: 6,
      freshness: "fresh",
      status: "approved",
      createdAt: "2026-10-03T00:00:00Z",
      outputData: {
        mechanism: "Protocolo de distancia y lectura temprana",
        perceivedProblem: "Desborde repentino en calle",
        simpleExplanation: "Registrar señales previas y ajustar distancia antes del umbral.",
        solutionMechanism: "Tres pasos progresivos para preparar rutas y salidas.",
        differentiation: "Documentación observable paso a paso sin prometer milagros clínicos.",
        steps: [
          "Identificar la distancia crítica de reacción.",
          "Planificar rutas con zonas de escape.",
          "Registrar avances por sesión para consulta profesional.",
        ],
        limitations: ["No sustituye evaluación veterinaria."],
      },
    },
    beliefs: {
      moduleKey: "beliefs",
      artifactId: "art-bel",
      versionId: "ver-bel-6",
      versionNumber: 6,
      freshness: "fresh",
      status: "approved",
      createdAt: "2026-10-03T00:00:00Z",
      outputData: {
        centralThesis: "La observación previa reduce los imprevistos del paseo.",
        objections: ["¿Sirve si ya fui a un adiestrador?"],
        arguments: ["Ordena el registro diario para aprovechar mejor cualquier apoyo presencial."],
      },
    },
    product: {
      moduleKey: "product",
      artifactId: "art-prd",
      versionId: "ver-prd-13",
      versionNumber: 13,
      freshness: "fresh",
      status: "approved",
      createdAt: "2026-10-03T00:00:00Z",
      outputData: {
        selectedId: "prop-1",
        proposals: [
          {
            id: "prop-1",
            name: "Guía práctica de paseos preventivos",
            concept: "Manual paso a paso de observación y planificación.",
            promise: "Prepara paseos con criterio preventivo.",
            outcome: "Mayor claridad y registro ordenado.",
            format: "Ebook digital + bitácora",
            modules: ["Lectura de señales", "Planificación de rutas"],
            moduleOutcomes: ["Anticipar cruces críticos", "Elegir horarios y escapes"],
            deliverables: ["Guía principal en PDF"],
            checklists: ["Checklist pre-paseo"],
            templates: ["Bitácora de incidentes"],
            resources: [],
            bonuses: ["Mapa rápido de distancia"],
          },
        ],
      },
    },
    offer: {
      moduleKey: "offer",
      artifactId: "art-off",
      versionId: "ver-off-7",
      versionNumber: 7,
      freshness: "fresh",
      status: "approved",
      createdAt: "2026-10-03T00:00:00Z",
      outputData: {
        name: "Guía de observación y planificación de paseos",
        promise: "Planifica rutas seguras paso a paso.",
        benefits: ["Anticipar encuentros tensos", "Llevar un registro útil"],
        deliverables: ["Ebook de 9 capítulos", "Bitácora de paseo"],
        bonuses: ["Checklist de emergencia"],
        bonusDetails: [{ name: "Checklist de emergencia", description: "Pasos rápidos para salidas imprevistas." }],
        cta: "Explorar la guía",
        guaranteeSuggestion: "Alcance informativo transparente sin promesas clínicas.",
        pricingSuggestion: { amount: null, currency: "USD", terms: "Condiciones pendientes de definición comercial." },
      },
    },
  };
}

describe("Hallazia Creative Studio PRO", () => {
  it("parses Landing v12 plain-text FAQ into structured Q&A items that pass server validation", () => {
    const v12FaqBody =
      "¿Diagnostica o garantiza cambios de conducta? No. ¿Sustituye una evaluación veterinaria o conductual individual? No. El formato de entrega, el precio y las condiciones de compra todavía requieren una decisión comercial explícita.";

    const items = extractStructuredFaqItems(v12FaqBody);
    expect(items).toEqual([
      { q: "¿Diagnostica o garantiza cambios de conducta?", a: "No." },
      {
        q: "¿Sustituye una evaluación veterinaria o conductual individual?",
        a: "No. El formato de entrega, el precio y las condiciones de compra todavía requieren una decisión comercial explícita.",
      },
    ]);

    const doc = {
      title: "Guía de paseos",
      sections: [
        { id: "hero-1", type: "hero", headline: "Prepara paseos con más claridad", body: "Enfoque preventivo", evidenceIds: ["ev-1"] },
        { id: "faq-1", type: "faq", headline: "Preguntas sobre el alcance del material", body: v12FaqBody, items },
      ],
    };
    const validation = validateLandingOutput(doc, [{ id: "ev-1" }]);
    expect(validation.audit.ok).toBe(true);
    expect(validation.audit.errors).toEqual([]);
  });

  it("enriches sections with real project context and applies Spanish prompts without invalidating evidenceIds", () => {
    const ctx = buildProjectResearchContext(sampleModuleResults());
    expect(ctx.loaded).toBe(true);
    expect(ctx.problems[0]?.name).toContain("Reacciones explosivas");

    const baseLanding = toLanding({
      title: "Landing v12",
      sections: [
        { id: "sec-hero", type: "hero", headline: "Nuevo bloque", body: "Describe aquí el contenido respaldado por el proyecto.", evidenceIds: ["ev-1"] },
        { id: "sec-prob", type: "problem", headline: "Nuevo bloque", body: "Describe aquí el contenido respaldado por el proyecto.", evidenceIds: ["ev-1"] },
        { id: "sec-mec", type: "mechanism", headline: "Mecanismo", body: "Cómo funciona" },
        { id: "sec-faq", type: "faq", headline: "FAQ", body: "¿Incluye guía? Sí, en 9 capítulos." },
      ],
    });

    const enrichedProb = enrichLandingSectionFromContext(baseLanding.sections[1], ctx);
    expect(enrichedProb.id).toBe("sec-prob");
    expect(enrichedProb.evidenceIds).toEqual(["ev-1"]);
    expect(enrichedProb.items?.length).toBeGreaterThan(0);

    const { value: prompted, summary } = applyContextualPromptToLanding(
      baseLanding,
      "Usa estilo oscuro tipo Framer, estructura las preguntas del FAQ y sincroniza el mecanismo y problemas",
      ctx,
    );
    expect(prompted.designTokens.theme).toBe("dark");
    expect(prompted.designTokens.background).toBe("#0b0f19");
    expect(summary.length).toBeGreaterThan(0);
    expect(prompted.sections.find((s) => s.type === "faq")?.items).toEqual([{ q: "¿Incluye guía?", a: "Sí, en 9 capítulos." }]);
    expect(prompted.sections.find((s) => s.type === "mechanism")?.items).toHaveLength(3);

    const serverValidation = validateLandingOutput(fromLanding({}, prompted), [{ id: "ev-1" }]);
    expect(serverValidation.audit.ok).toBe(true);
  });

  it("exports genuine Framer Code Component TSX, Figma SVG Artboard, and Design Tokens JSON", () => {
    const landing = toLanding({
      title: "Proyecto <Seguro>",
      designTokens: { theme: "dark", accent: "#06b6d4", background: "#0b0f19", text: "#f1f5f9", width: "wide" },
      externalCheckout: { platform: "hotmart", checkoutUrl: "https://pay.hotmart.com/demo" },
      sections: [
        { id: "hero-1", type: "hero", eyebrow: "GUÍA", headline: "Hero Framer & Figma", cta: "Comprar ahora" },
        { id: "faq-1", type: "faq", headline: "Dudas", items: [{ q: "¿Tiene acceso inmediato?", a: "Sí." }] },
      ],
    });

    const framerCode = renderLandingFramerCode(landing);
    expect(framerCode).toContain('import { addPropertyControls, ControlType } from "framer";');
    expect(framerCode).toContain("addPropertyControls(HallaziaLanding");
    expect(framerCode).toContain("Hero Framer & Figma");
    expect(framerCode).toContain("https://pay.hotmart.com/demo");

    const figmaSvg = renderLandingFigmaSvg(landing);
    expect(figmaSvg).toContain("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1440\"");
    expect(figmaSvg).toContain('id="section-0-hero"');
    expect(figmaSvg).toContain("Hero Framer &amp; Figma");
    expect(figmaSvg).not.toContain("<Seguro>");

    const tokensJson = JSON.parse(renderFigmaTokensJson(landing));
    expect(tokensJson.color.accent.value).toBe("#06b6d4");
    expect(tokensJson.layout.containerWidth.value).toBe("1160px");
  });

  it("opens Studio PRO from LandingBuilder, structures FAQ with loaded context, and saves a valid draft", async () => {
    const modulesMap = sampleModuleResults();
    spies.push(vi.spyOn(api, "productAssets").mockResolvedValue({ assets: [] }));
    spies.push(vi.spyOn(api, "landingImageStatus").mockResolvedValue({ configured: false, model: "test", paidModel: false }));
    spies.push(
      vi.spyOn(api, "moduleResults").mockImplementation(async (_projectId, key) => ({
        results: modulesMap[key] ? [modulesMap[key]] : [],
      })),
    );

    const savedPayloads = [];
    const initialValue = toLanding({
      title: "Landing Real",
      sections: [
        { id: "h1", type: "hero", headline: "Paseos seguros", body: "Planifica cada salida", evidenceIds: ["ev-1"] },
        {
          id: "f1",
          type: "faq",
          headline: "Preguntas sobre el alcance",
          body: "¿Diagnostica conducta? No. ¿Incluye rutas? Sí, paso a paso.",
        },
      ],
    });

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () =>
      root.render(
        React.createElement(LandingBuilder, {
          projectId: "01a0289f-9377-70b0-b9ac-a0eb5a9dd35a",
          selectedVersionId: "v12",
          value: initialValue,
          versions: [],
          onExportHtml: () => {},
          onSave: async (nextVal) => {
            savedPayloads.push(nextVal);
            return true;
          },
        }),
      ),
    );

    const openBtn = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Abrir Studio PRO"));
    expect(openBtn).toBeTruthy();

    await act(async () => openBtn.click());
    const dialog = document.body.querySelector('[role="dialog"][aria-label="Hallazia Creative Studio PRO"]');
    expect(dialog).toBeTruthy();

    const structureFaqBtn = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Estructurar FAQ"));
    expect(structureFaqBtn).toBeTruthy();
    await act(async () => structureFaqBtn.click());

    const saveStudioBtn = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Guardar borrador en Hallazia"));
    expect(saveStudioBtn).toBeTruthy();
    await act(async () => saveStudioBtn.click());

    expect(savedPayloads).toHaveLength(1);
    const savedDoc = fromLanding({}, savedPayloads[0]);
    expect(savedDoc.sections[1].items).toEqual([
      { q: "¿Diagnostica conducta?", a: "No." },
      { q: "¿Incluye rutas?", a: "Sí, paso a paso." },
    ]);
    expect(validateLandingOutput(savedDoc, [{ id: "ev-1" }]).audit.ok).toBe(true);

    await act(async () => root.unmount());
  });

  it("validates rich STUDIO PRO structured schema, auto-fixes diagnostics, and supports live DeepSeek/AI generation + Undo + Duplicate", async () => {
    const schema = MODULE_OUTPUT_SCHEMAS.landing;
    expect(validateJsonSchema(schema, { schemaVersion: 1, title: "X", sections: [{ type: "hero" }], evidenceIds: [] }).length).toBeGreaterThan(0);
    expect(
      validateJsonSchema(schema, {
        schemaVersion: 1,
        title: "Guía PRO",
        designTokens: { theme: "dark", accent: "#06b6d4", background: "#0b0f19", text: "#f1f5f9" },
        sections: [
          {
            id: "hero-1",
            type: "hero",
            eyebrow: "PRO",
            headline: "Titular completo",
            subheadline: "Subtítulo claro",
            body: "Cuerpo detallado",
            cta: "Empezar",
            items: [{ name: "Beneficio 1", description: "Detalle real" }],
          },
          {
            id: "faq-1",
            type: "faq",
            headline: "FAQ",
            body: "Dudas clave",
            items: [{ q: "¿Es editable?", a: "Sí, totalmente." }],
          },
        ],
        evidenceIds: [],
      }),
    ).toEqual([]);

    const ctx = buildProjectResearchContext(sampleModuleResults());
    const broken = toLanding({
      title: "",
      sections: [
        { id: "h1", type: "hero", headline: "Nuevo bloque", body: "Paseos reales", imageUrl: "https://cdn.example.com/hero.jpg" },
        { id: "f1", type: "faq", headline: "Dudas", body: "¿Funciona en ciudad? Sí." },
      ],
    });
    const diagBefore = evaluateLandingStudioPro(broken);
    expect(diagBefore.score).toBeLessThan(70);
    expect(diagBefore.unparsedFaqCount).toBe(1);
    expect(diagBefore.missingAltCount).toBe(1);

    const { value: fixed, actions } = autoFixLandingStudioPro(broken, ctx);
    expect(actions.length).toBeGreaterThan(2);
    const diagAfter = evaluateLandingStudioPro(fixed);
    expect(diagAfter.score).toBeGreaterThanOrEqual(90);
    expect(diagAfter.unparsedFaqCount).toBe(0);
    expect(diagAfter.missingAltCount).toBe(0);

    const modulesMap = sampleModuleResults();
    spies.push(vi.spyOn(api, "productAssets").mockResolvedValue({ assets: [] }));
    spies.push(vi.spyOn(api, "landingImageStatus").mockResolvedValue({ configured: false, model: "test", paidModel: false }));
    spies.push(
      vi.spyOn(api, "providerStatus").mockResolvedValue({
        generationBlock: null,
        openai: { configured: false, economyModel: "gpt-5-mini", powerfulModel: "gpt-5" },
        gemini: { configured: true, economyModel: "gemini-3.5-flash-lite", powerfulModel: "gemini-3.5-flash-lite" },
        deepseek: { configured: true, model: "deepseek-flash" },
        groq: { configured: false, model: "qwen" },
        openrouter: { configured: false, model: "openrouter/free" },
        defaultProvider: "gemini",
      }),
    );
    spies.push(
      vi.spyOn(api, "moduleResults").mockImplementation(async (_projectId, key) => ({
        results: modulesMap[key] ? [modulesMap[key]] : [],
      })),
    );
    const studioAiSpy = vi.spyOn(api, "runLandingStudioAi").mockResolvedValue({
      provider: "deepseek",
      model: "deepseek-flash",
      audit: { ok: true, errors: [] },
      outputData: {
        schemaVersion: 1,
        title: "Landing Completa DeepSeek PRO",
        designTokens: { theme: "dark", accent: "#06b6d4", background: "#0b0f19", text: "#f1f5f9", font: "sans", width: "wide", spacing: "relaxed" },
        sections: [
          { id: "ai-hero", type: "hero", eyebrow: "DEEPSEEK PRO", headline: "Domina cada paseo con método", body: "Ruta práctica", cta: "Acceder", evidenceIds: ["ev-1"] },
          { id: "ai-faq", type: "faq", headline: "Preguntas", body: "Claridad total", items: [{ q: "¿Incluye bitácora?", a: "Sí, incluida." }] },
        ],
      },
    });
    spies.push(studioAiSpy);

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    await act(async () =>
      root.render(
        React.createElement(LandingBuilder, {
          projectId: "01a0289f-9377-70b0-b9ac-a0eb5a9dd35a",
          selectedVersionId: "01a0289f-9377-70b0-b9ac-a0eb5a9dd999",
          value: broken,
          versions: [],
          onExportHtml: () => {},
          onSave: () => true,
        }),
      ),
    );

    const openBtn = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Abrir Studio PRO"));
    await act(async () => openBtn.click());
    const dialog = document.body.querySelector('[role="dialog"][aria-label="Hallazia Creative Studio PRO"]');
    expect(dialog).toBeTruthy();

    const genBtn = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Generar Página Completa"));
    expect(genBtn).toBeTruthy();
    await act(async () => genBtn.click());

    expect(studioAiSpy).toHaveBeenCalledTimes(1);
    expect(studioAiSpy.mock.calls[0][1].provider).toBe("deepseek");
    expect(studioAiSpy.mock.calls[0][1].mode).toBe("full_page");
    expect(dialog.querySelector('input[aria-label="Nombre de la Landing en Studio PRO"]').value).toBe("Landing Completa DeepSeek PRO");

    const dupBtn = dialog.querySelector('button[title="Duplicar sección"]');
    await act(async () => dupBtn.click());
    expect(dialog.querySelectorAll(".hl-studio-section")).toHaveLength(3);

    const undoBtn = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Deshacer"));
    await act(async () => undoBtn.click());
    expect(dialog.querySelectorAll(".hl-studio-section")).toHaveLength(2);

    await act(async () => root.unmount());
  });

  it("serves non-destructive POST /api/projects/:id/modules/landing/studio-ai without invalidating approved artifacts", async () => {
    const app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    try {
      const { project } = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json();
      const beforeHistory = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/landing` })).json().results;

      const aiRes = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/modules/landing/studio-ai`,
        payload: {
          mode: "full_page",
          provider: "mock",
          prompt: "Usa estilo oscuro tipo Framer con máxima claridad",
        },
      });
      expect(aiRes.statusCode).toBe(200);
      const body = aiRes.json();
      expect(body.provider).toBe("mock");
      expect(body.audit.ok).toBe(true);
      expect(body.outputData.designTokens.theme).toBe("dark");
      expect(body.outputData.sections.length).toBeGreaterThanOrEqual(10);

      const afterHistory = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/landing` })).json().results;
      expect(afterHistory).toHaveLength(beforeHistory.length);

      const missingKeyRes = await app.inject({
        method: "POST",
        url: `/api/projects/${project.id}/modules/landing/studio-ai`,
        payload: { mode: "full_page", provider: "deepseek" },
      });
      expect(missingKeyRes.statusCode).toBe(409);
      expect(missingKeyRes.json().message).toContain("DeepSeek");
    } finally {
      await app.close();
    }
  });
});
