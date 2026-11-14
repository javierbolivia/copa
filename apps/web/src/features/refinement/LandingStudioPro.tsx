import {
  auditLandingQuality,
  CANONICAL_LANDING_LABELS,
  LANDING_LAYOUT_LABELS,
  LANDING_SECTION_LAYOUTS,
  LANDING_THEME_PRESETS,
  landingCheckoutUrl,
  landingDesignTokens,
  landingImageUrl,
  landingStats,
  landingTextList,
  renderLandingHtml,
  resolveLandingLayout,
  type CanonicalLandingBlockType,
  type LandingContentSection,
  type LandingDesignTokens,
  type LandingQualityReport,
  type ModuleKey,
  type ModuleResult,
} from "@our-platform/shared";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  CopyPlus,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Globe,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Monitor,
  Palette,
  Plus,
  Printer,
  Redo2,
  RefreshCw,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  TrendingUp,
  Undo2,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type GenerationProvider, type LandingStudioAiMode, type ProductAsset, type ProviderStatus, type StudioVisualAsset } from "../../api/client";
import { toAvatar } from "./avatar-adapter";
import { toBeliefs } from "./beliefs-adapter";
import { createLandingSectionId, fromLanding, toLanding, withStableLandingSectionIds } from "./landing-adapter";
import { toMechanism } from "./mechanism-adapter";
import { toOffer } from "./offer-adapter";
import { toProduct } from "./product-adapter";
import type { LandingEditorValue, LandingPreviewMode } from "./types";

export interface ProblemContextItem {
  id: string;
  name: string;
  summary: string;
}

export interface ProjectResearchContext {
  loaded: boolean;
  versions: Partial<Record<ModuleKey, { versionNumber: number; status: string; freshness: string }>>;
  problems: ProblemContextItem[];
  opportunityHeadline?: string;
  product: {
    name: string;
    concept: string;
    promise: string;
    outcome: string;
    format: string;
    modules: Array<{ name: string; outcome: string }>;
    deliverables: string[];
    checklists: string[];
    templates: string[];
    resources: string[];
    bonuses: string[];
  };
  avatar: {
    name: string;
    currentSituation: string[];
    desiredOutcome: string[];
    pains: string[];
    frustrations: string[];
    desires: string[];
    objections: string[];
    language: string[];
  };
  mechanism: {
    name: string;
    perceivedProblem: string;
    apparentCause: string;
    rootCauseHypothesis: string;
    solutionMechanism: string;
    differentiation: string;
    simpleExplanation: string;
    steps: string[];
    limitations: string[];
  };
  beliefs: {
    bigIdea: string;
    limitingBeliefs: string[];
    bridgeBeliefs: string[];
    requiredBeliefs: string[];
    objections: string[];
    arguments: string[];
  };
  offer: {
    name: string;
    promise: string;
    benefits: string[];
    deliverables: string[];
    cta: string;
    guarantee: string;
    pricingAmount: string;
    pricingCurrency: string;
    pricingTerms: string;
    pricingRationale: string;
    bonuses: Array<{ name: string; description: string }>;
  };
}

export const EMPTY_PROJECT_RESEARCH_CONTEXT: ProjectResearchContext = {
  loaded: false,
  versions: {},
  problems: [],
  product: {
    name: "",
    concept: "",
    promise: "",
    outcome: "",
    format: "",
    modules: [],
    deliverables: [],
    checklists: [],
    templates: [],
    resources: [],
    bonuses: [],
  },
  avatar: {
    name: "",
    currentSituation: [],
    desiredOutcome: [],
    pains: [],
    frustrations: [],
    desires: [],
    objections: [],
    language: [],
  },
  mechanism: {
    name: "",
    perceivedProblem: "",
    apparentCause: "",
    rootCauseHypothesis: "",
    solutionMechanism: "",
    differentiation: "",
    simpleExplanation: "",
    steps: [],
    limitations: [],
  },
  beliefs: {
    bigIdea: "",
    limitingBeliefs: [],
    bridgeBeliefs: [],
    requiredBeliefs: [],
    objections: [],
    arguments: [],
  },
  offer: {
    name: "",
    promise: "",
    benefits: [],
    deliverables: [],
    cta: "",
    guarantee: "",
    pricingAmount: "",
    pricingCurrency: "",
    pricingTerms: "",
    pricingRationale: "",
    bonuses: [],
  },
};

type StudioViewport = LandingPreviewMode | "tablet";
type ContextTab = "problems" | "avatar" | "mechanism" | "offer" | "beliefs";

const CONTEXT_MODULE_KEYS: ModuleKey[] = [
  "problems",
  "opportunities",
  "product",
  "avatar",
  "mechanism",
  "beliefs",
  "offer",
];

const DEFAULT_SECTION_CONTENT: Record<
  CanonicalLandingBlockType,
  { eyebrow: string; headline: string; body: string; cta?: string }
> = {
  hero: {
    eyebrow: "GUÍA DIGITAL",
    headline: "Claridad práctica basada en investigación real",
    body: "Estructura paso a paso los hallazgos del proyecto y presenta una propuesta clara y verificable.",
    cta: "Ver qué incluye",
  },
  problem: {
    eyebrow: "PROBLEMAS REALES",
    headline: "Lo que describen quienes viven este problema a diario",
    body: "Patrones recurrentes documentados en el análisis de evidencias del proyecto.",
  },
  agitation: {
    eyebrow: "DESGASTE COTIDIANO",
    headline: "Por qué las soluciones improvisadas terminan agotando",
    body: "Cuando falta una estructura clara, cada intento sin criterio aumenta la frustración.",
  },
  mechanism: {
    eyebrow: "MECANISMO DE TRABAJO",
    headline: "Un enfoque progresivo para ordenar cada situación",
    body: "Secuencia práctica diseñada a partir de las causas y límites observados.",
  },
  benefits: {
    eyebrow: "BENEFICIOS CLAVE",
    headline: "Qué ganas al aplicar esta guía con método",
    body: "Resultados tangibles y criterios claros para tomar mejores decisiones.",
  },
  product: {
    eyebrow: "EL PRODUCTO",
    headline: "Contenido y estructura del material",
    body: "Capítulos y recursos organizados para una consulta directa.",
  },
  deliverables: {
    eyebrow: "ENTREGABLES INCLUIDOS",
    headline: "Todo lo que recibes dentro del material",
    body: "Formatos digitales listos para consultar y aplicar paso a paso.",
  },
  bonuses: {
    eyebrow: "RECURSOS ADICIONALES",
    headline: "Complementos prácticos incluidos",
    body: "Herramientas de apoyo para facilitar la puesta en práctica.",
  },
  proof: {
    eyebrow: "RESPALDO Y ENFOQUE",
    headline: "Diferenciación y base de análisis",
    body: "Cada bloque de esta propuesta parte de evidencias revisadas y criterios transparentes.",
  },
  objections: {
    eyebrow: "OBJECIONES FRECUENTES",
    headline: "Dudas habituales antes de dar el primer paso",
    body: "Aclaraciones honestas sobre alcance, dedicación y límites del recurso.",
  },
  faq: {
    eyebrow: "PREGUNTAS FRECUENTES",
    headline: "Preguntas sobre el alcance del material",
    body: "Respuestas directas sobre cómo funciona el recurso y qué esperar de él.",
  },
  offer: {
    eyebrow: "PROPUESTA Y ACCESO",
    headline: "Resumen de la oferta",
    body: "Revisa los entregables, condiciones y alcance antes de acceder.",
    cta: "Revisar propuesta",
  },
  guarantee: {
    eyebrow: "TRANSPARENCIA Y ALCANCE",
    headline: "Límites claros y criterio responsable",
    body: "Este material orienta y estructura la práctica cotidiana sin sustituir criterio profesional individual.",
  },
  cta: {
    eyebrow: "SIGUIENTE PASO",
    headline: "Empieza con una ruta estructurada",
    body: "Consulta el detalle completo de la guía y sus recursos prácticos.",
    cta: "Explorar la propuesta",
  },
  footer: {
    eyebrow: "HALLAZIA",
    headline: "Material educativo basado en investigación",
    body: "Consulta el alcance completo y condiciones vigentes antes de distribuir.",
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const rawStr = (value: unknown): string => (typeof value === "string" ? value : "");

const escapeXml = (value: unknown): string =>
  String(value ?? "").replace(/[<>&'"]/g, (ch) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&#39;", '"': "&quot;" })[ch]!,
  );

function pickPreferredResult(results: readonly ModuleResult[]): ModuleResult | undefined {
  if (!results.length) return undefined;
  const sorted = [...results].sort((a, b) => b.versionNumber - a.versionNumber);
  return (
    sorted.find((r) => r.status === "approved" && r.freshness === "fresh") ??
    sorted.find((r) => r.status === "approved") ??
    sorted.find((r) => r.status === "draft" && r.freshness === "fresh") ??
    sorted[0]
  );
}

/** Builds normalized project research context from loaded Hallazia module histories. */
export function buildProjectResearchContext(
  byModule: Partial<Record<ModuleKey, ModuleResult | undefined>>,
): ProjectResearchContext {
  const versions: ProjectResearchContext["versions"] = {};
  for (const [key, res] of Object.entries(byModule) as Array<[ModuleKey, ModuleResult | undefined]>) {
    if (res) {
      versions[key] = { versionNumber: res.versionNumber, status: res.status, freshness: res.freshness };
    }
  }

  const problemsRaw = isRecord(byModule.problems?.outputData) ? byModule.problems!.outputData : {};
  const problemItems = (Array.isArray(problemsRaw.items) ? problemsRaw.items : [])
    .filter(isRecord)
    .map((item, idx) => ({
      id: asText(item.id) || `problem-${idx + 1}`,
      name: asText(item.name),
      summary: asText(item.summary),
    }))
    .filter((item) => item.name.length > 0)
    .slice(0, 12);

  const oppRaw = isRecord(byModule.opportunities?.outputData) ? byModule.opportunities!.outputData : {};
  const oppItems = (Array.isArray(oppRaw.items) ? oppRaw.items : []).filter(isRecord);
  const selectedOpp = oppItems.find((item) => item.id === oppRaw.selectedId) ?? oppItems[0];
  const opportunityHeadline = asText(selectedOpp?.name);

  const productAdapted = toProduct(isRecord(byModule.product?.outputData) ? byModule.product!.outputData : {});
  const avatarAdapted = toAvatar(isRecord(byModule.avatar?.outputData) ? byModule.avatar!.outputData : {});
  const mechanismAdapted = toMechanism(isRecord(byModule.mechanism?.outputData) ? byModule.mechanism!.outputData : {});
  const beliefsAdapted = toBeliefs(isRecord(byModule.beliefs?.outputData) ? byModule.beliefs!.outputData : {});
  const offerAdapted = toOffer(isRecord(byModule.offer?.outputData) ? byModule.offer!.outputData : {});

  return {
    loaded: Object.keys(versions).length > 0,
    versions,
    problems: problemItems,
    ...(opportunityHeadline ? { opportunityHeadline } : {}),
    product: {
      name: productAdapted.name,
      concept: productAdapted.concept,
      promise: productAdapted.promise,
      outcome: productAdapted.outcome,
      format: productAdapted.format,
      modules: productAdapted.modules.map((m) => ({ name: m.name, outcome: m.outcome })),
      deliverables: productAdapted.deliverables,
      checklists: productAdapted.checklists,
      templates: productAdapted.templates,
      resources: productAdapted.resources,
      bonuses: productAdapted.bonuses,
    },
    avatar: {
      name: avatarAdapted.name,
      currentSituation: avatarAdapted.currentSituation.map((c) => c.text).filter(Boolean),
      desiredOutcome: avatarAdapted.desiredOutcome.map((c) => c.text).filter(Boolean),
      pains: avatarAdapted.pains.map((c) => c.text).filter(Boolean),
      frustrations: avatarAdapted.frustrations.map((c) => c.text).filter(Boolean),
      desires: avatarAdapted.desires.map((c) => c.text).filter(Boolean),
      objections: avatarAdapted.objections.map((c) => c.text).filter(Boolean),
      language: avatarAdapted.language.map((c) => c.text).filter(Boolean),
    },
    mechanism: {
      name: mechanismAdapted.mechanism,
      perceivedProblem: mechanismAdapted.perceivedProblem,
      apparentCause: mechanismAdapted.apparentCause,
      rootCauseHypothesis: mechanismAdapted.rootCauseHypothesis,
      solutionMechanism: mechanismAdapted.solutionMechanism,
      differentiation: mechanismAdapted.differentiation,
      simpleExplanation: mechanismAdapted.simpleExplanation,
      steps: mechanismAdapted.steps,
      limitations: mechanismAdapted.limitations,
    },
    beliefs: {
      bigIdea: beliefsAdapted.bigIdea,
      limitingBeliefs: beliefsAdapted.limitingBeliefs,
      bridgeBeliefs: beliefsAdapted.bridgeBeliefs,
      requiredBeliefs: beliefsAdapted.requiredBeliefs,
      objections: beliefsAdapted.objections,
      arguments: beliefsAdapted.arguments,
    },
    offer: {
      name: offerAdapted.name,
      promise: offerAdapted.mainOffer,
      benefits: offerAdapted.benefits,
      deliverables: offerAdapted.deliverables,
      cta: offerAdapted.cta,
      guarantee: offerAdapted.guarantee,
      pricingAmount: offerAdapted.pricing.amount,
      pricingCurrency: offerAdapted.pricing.currency,
      pricingTerms: offerAdapted.pricing.terms,
      pricingRationale: offerAdapted.pricing.rationale,
      bonuses: offerAdapted.bonuses,
    },
  };
}

/**
 * Parses inline plain-text Q&A pairs (such as Landing v12's unparsed FAQ paragraph)
 * into structured `{ q, a }` items that satisfy `validateLandingOutput`.
 */
export function extractStructuredFaqItems(
  bodyText: string,
  existingItems: ReadonlyArray<string | Record<string, unknown>> = [],
  fallbackObjections: readonly string[] = [],
): Array<{ q: string; a: string }> {
  const result: Array<{ q: string; a: string }> = [];
  const seen = new Set<string>();
  const pushPair = (rawQ: string, rawA: string) => {
    const q = rawQ.trim();
    const a = rawA.trim() || "Consulta el alcance y condiciones en la sección de oferta.";
    if (!q) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ q: q.slice(0, 1200), a: a.slice(0, 4000) });
  };

  for (const raw of existingItems) {
    if (typeof raw === "string") {
      for (const parsed of parseQuestionsFromParagraph(raw)) {
        pushPair(parsed.q, parsed.a);
      }
      continue;
    }
    if (isRecord(raw)) {
      const q = asText(raw.q) || asText(raw.name) || asText(raw.title);
      const a = asText(raw.a) || asText(raw.description) || asText(raw.text);
      if (q && a) pushPair(q, a);
    }
  }

  for (const parsed of parseQuestionsFromParagraph(bodyText)) {
    pushPair(parsed.q, parsed.a);
  }

  if (result.length === 0) {
    for (const objection of fallbackObjections.slice(0, 4)) {
      const clean = objection.trim();
      if (!clean) continue;
      const question = clean.endsWith("?") ? clean : `¿Cómo aborda este material: ${clean.replace(/\.+$/, "")}?`;
      pushPair(question, "La guía aborda este punto con criterios paso a paso y límites explícitos de aplicación.");
    }
  }

  return result;
}

function parseQuestionsFromParagraph(paragraph: string): Array<{ q: string; a: string }> {
  const text = paragraph.trim();
  if (!text) return [];
  const matches = [...text.matchAll(/(?:¿([^?\n]{3,})\?|([^.\n!?¿]{6,}\?))/gu)];
  if (!matches.length) return [];

  const pairs: Array<{ q: string; a: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const start = current.index ?? 0;
    const qText = current[0].trim();
    const answerStart = start + current[0].length;
    const answerEnd = i + 1 < matches.length ? (matches[i + 1]!.index ?? text.length) : text.length;
    const rawAnswer = text.slice(answerStart, answerEnd).replace(/^[.:\-\s]+/, "").trim();
    pairs.push({
      q: qText,
      a: rawAnswer || "Consulta los detalles en la sección correspondiente de esta página.",
    });
  }
  return pairs;
}

const isPlaceholderText = (text: string | undefined): boolean => {
  const clean = (text ?? "").trim();
  return !clean || clean === "Nuevo bloque" || clean === "Describe aquí el contenido respaldado por el proyecto.";
};

const keepText = (current: string | undefined, fallback: string): string =>
  !isPlaceholderText(current) ? (current ?? fallback) : fallback;

type SectionEnricher = (
  section: LandingContentSection,
  context: ProjectResearchContext,
) => Partial<LandingContentSection>;

const SECTION_ENRICHERS: Record<string, SectionEnricher> = {
  hero: (section, ctx) => {
    const existingBullets = landingTextList(section.bullets, 4);
    const derivedBullets = (ctx.offer.benefits.length ? ctx.offer.benefits : ctx.avatar.desiredOutcome)
      .slice(0, 3)
      .map((item) => item.slice(0, 120));
    const existingStats = landingStats(section.stats);
    const derivedStats: Array<{ value: string; label: string }> = [
      ...(ctx.product.modules.length ? [{ value: String(ctx.product.modules.length), label: "Módulos prácticos" }] : []),
      ...(ctx.mechanism.steps.length ? [{ value: String(ctx.mechanism.steps.length), label: "Pasos del método" }] : []),
      ...(ctx.offer.deliverables.length || ctx.product.deliverables.length
        ? [{ value: String(Math.max(ctx.offer.deliverables.length, ctx.product.deliverables.length)), label: "Recursos incluidos" }]
        : []),
    ];
    return {
      layout: section.layout?.trim() || (section.imageUrl ? "split" : "centered"),
      badge: section.badge?.trim() || (ctx.product.format ? ctx.product.format.slice(0, 48) : "GUÍA DIGITAL"),
      eyebrow: section.eyebrow?.trim() || (ctx.product.format ? `GUÍA DIGITAL · ${ctx.product.format.toUpperCase().slice(0, 28)}` : "GUÍA PRÁCTICA"),
      headline: keepText(section.headline, ctx.offer.name || ctx.product.name || ctx.opportunityHeadline || (section.headline ?? "")),
      subheadline: section.subheadline?.trim() || ctx.offer.promise || ctx.product.promise,
      body: keepText(section.body, ctx.product.outcome || ctx.avatar.desiredOutcome[0] || (section.body ?? "")),
      cta: section.cta?.trim() || ctx.offer.cta || "Explorar la propuesta",
      ...((existingBullets.length ? existingBullets : derivedBullets).length
        ? { bullets: existingBullets.length ? existingBullets : derivedBullets }
        : {}),
      ...((existingStats.length ? existingStats : derivedStats).length
        ? { stats: existingStats.length ? existingStats : derivedStats }
        : {}),
    };
  },
  problem: (section, ctx) => {
    const items = ctx.problems.length
      ? ctx.problems.slice(0, 6).map((p) => ({ name: p.name, description: p.summary || p.name }))
      : ctx.avatar.pains.slice(0, 6).map((pain, idx) => ({ name: `Dolor observado ${idx + 1}`, description: pain }));
    return {
      layout: section.layout?.trim() || "cards",
      eyebrow: section.eyebrow?.trim() || "PROBLEMAS DOCUMENTADOS",
      headline: keepText(section.headline, ctx.mechanism.perceivedProblem || "Patrones reales observados en el análisis"),
      body: keepText(section.body, ctx.avatar.currentSituation[0] || "Principales dificultades reportadas por quienes enfrentan esta situación."),
      ...(items.length ? { items } : {}),
    };
  },
  agitation: (section, ctx) => {
    const items = (ctx.avatar.frustrations.length ? ctx.avatar.frustrations : ctx.beliefs.limitingBeliefs)
      .slice(0, 4)
      .map((entry, idx) => ({ name: `Fricción ${idx + 1}`, description: entry }));
    return {
      layout: section.layout?.trim() || "list",
      eyebrow: section.eyebrow?.trim() || "DESGASTE DIARIO",
      headline: keepText(section.headline, "Por qué los intentos aislados generan más frustración"),
      body: keepText(section.body, ctx.mechanism.apparentCause || "Sin un marco claro, las medidas improvisadas suelen agravar el desgaste."),
      ...(items.length ? { items } : {}),
    };
  },
  mechanism: (section, ctx) => {
    const steps = ctx.mechanism.steps.slice(0, 6).map((step, idx) => ({
      name: `Paso ${idx + 1}`,
      description: step,
    }));
    return {
      layout: section.layout?.trim() || "steps",
      eyebrow: section.eyebrow?.trim() || "MECANISMO DE RESOLUCIÓN",
      headline: keepText(section.headline, ctx.mechanism.name || "Cómo funciona el método paso a paso"),
      subheadline: section.subheadline?.trim() || ctx.mechanism.simpleExplanation,
      body: keepText(section.body, ctx.mechanism.solutionMechanism || ctx.mechanism.rootCauseHypothesis || (section.body ?? "")),
      ...(steps.length ? { items: steps } : {}),
    };
  },
  benefits: (section, ctx) => {
    const rawList = ctx.offer.benefits.length ? ctx.offer.benefits : ctx.avatar.desiredOutcome;
    const items = rawList.slice(0, 6).map((entry, idx) => ({
      name: entry.length <= 72 ? entry : `Beneficio ${idx + 1}`,
      description: entry,
    }));
    return {
      layout: section.layout?.trim() || "checklist",
      eyebrow: section.eyebrow?.trim() || "LO QUE LOGRAS",
      headline: keepText(section.headline, "Beneficios prácticos de seguir esta estructura"),
      body: keepText(section.body, ctx.product.outcome || (section.body ?? "")),
      ...(items.length ? { items } : {}),
    };
  },
  product: (section, ctx) => {
    const items = ctx.product.modules.slice(0, 8).map((mod) => ({
      name: mod.name,
      description: mod.outcome || "Módulo práctico incluido en el programa.",
    }));
    return {
      layout: section.layout?.trim() || (section.imageUrl ? "split" : "cards"),
      eyebrow: section.eyebrow?.trim() || "DENTRO DEL PRODUCTO",
      headline: keepText(section.headline, ctx.product.name || "Estructura del material"),
      subheadline: section.subheadline?.trim() || ctx.product.format,
      body: keepText(section.body, ctx.product.concept || ctx.product.promise || (section.body ?? "")),
      ...(items.length ? { items } : {}),
    };
  },
  deliverables: (section, ctx) => {
    const list = [
      ...ctx.offer.deliverables,
      ...ctx.product.deliverables,
      ...ctx.product.checklists,
      ...ctx.product.templates,
    ]
      .filter((entry, idx, arr) => Boolean(entry.trim()) && arr.indexOf(entry) === idx)
      .slice(0, 6);
    const items = list.map((entry, idx) => ({
      name: entry.length <= 68 ? entry : `Entregable ${idx + 1}`,
      description: entry,
    }));
    return {
      layout: section.layout?.trim() || "cards",
      eyebrow: section.eyebrow?.trim() || "ENTREGABLES",
      headline: keepText(section.headline, "Recursos incluidos desde el primer día"),
      body: keepText(section.body, "Material descargable y plantillas de trabajo paso a paso."),
      ...(items.length ? { items } : {}),
    };
  },
  bonuses: (section, ctx) => {
    const items = ctx.offer.bonuses.length
      ? ctx.offer.bonuses.slice(0, 5).map((b) => ({
          name: b.name || "Recurso adicional",
          description: b.description || b.name || "Material complementario incluido.",
        }))
      : ctx.product.bonuses.slice(0, 5).map((name, idx) => ({ name: `Bono ${idx + 1}`, description: name }));
    return {
      layout: section.layout?.trim() || "cards",
      eyebrow: section.eyebrow?.trim() || "BONOS Y COMPLEMENTOS",
      headline: keepText(section.headline, "Recursos adicionales incluidos"),
      ...(items.length ? { items } : {}),
    };
  },
  proof: (section, ctx) => {
    const items = ctx.beliefs.arguments.slice(0, 4).map((arg, idx) => ({
      name: `Criterio respaldado ${idx + 1}`,
      description: arg,
    }));
    return {
      layout: section.layout?.trim() || "testimonials",
      eyebrow: section.eyebrow?.trim() || "CRITERIO Y DIFERENCIACIÓN",
      headline: keepText(section.headline, "Por qué este enfoque se basa en evidencia observable"),
      body: keepText(section.body, ctx.mechanism.differentiation || ctx.beliefs.bigIdea || (section.body ?? "")),
      ...(items.length ? { items } : {}),
    };
  },
  objections: (section, ctx) => {
    const objList = ctx.beliefs.objections.length ? ctx.beliefs.objections : ctx.avatar.objections;
    const items = objList.slice(0, 5).map((obj, idx) => ({
      q: obj.endsWith("?") ? obj : `¿Qué ocurre si: ${obj}?`,
      a: ctx.beliefs.arguments[idx] || ctx.beliefs.bridgeBeliefs[idx] || "La guía incluye pautas claras y progresivas para este escenario.",
    }));
    return {
      layout: section.layout?.trim() || "accordion",
      eyebrow: section.eyebrow?.trim() || "RESPUESTA A OBJECIONES",
      headline: keepText(section.headline, "Dudas frecuentes antes de empezar"),
      ...(items.length ? { items } : {}),
    };
  },
  faq: (section, ctx) => {
    const objections = ctx.beliefs.objections.length ? ctx.beliefs.objections : ctx.avatar.objections;
    const parsedItems = extractStructuredFaqItems(section.body ?? "", section.items, objections);
    const firstQIdx = (section.body ?? "").indexOf("¿");
    const cleanIntro =
      parsedItems.length > 0 && firstQIdx === 0
        ? "Preguntas clave resueltas sobre el alcance y condiciones del material."
        : (section.body ?? "");
    return {
      layout: section.layout?.trim() || "accordion",
      eyebrow: section.eyebrow?.trim() || "PREGUNTAS FRECUENTES",
      headline: keepText(section.headline, "Preguntas sobre el alcance del material"),
      body: cleanIntro || "Respuestas directas sobre cómo aprovechar la guía.",
      ...(parsedItems.length ? { items: parsedItems } : {}),
    };
  },
  offer: (section, ctx) => {
    const priceText = ctx.offer.pricingAmount
      ? (ctx.offer.pricingCurrency.toUpperCase() === "USD"
          ? `$${ctx.offer.pricingAmount} USD`
          : `${ctx.offer.pricingAmount} ${ctx.offer.pricingCurrency}`.trim())
      : "";
    const items = [
      ...ctx.offer.deliverables.slice(0, 4).map((d, i) => ({ name: `Incluye ${i + 1}`, description: d })),
      ...ctx.offer.bonuses.slice(0, 2).map((b) => ({ name: b.name || "Bono adicional", description: b.description || b.name })),
    ];
    return {
      layout: section.layout?.trim() || "pricing",
      badge: section.badge?.trim() || "ACCESO COMPLETO",
      eyebrow: section.eyebrow?.trim() || "OFERTA COMPLETA",
      headline: keepText(section.headline, ctx.offer.name || "Accede a la guía completa"),
      subheadline: section.subheadline?.trim() || ctx.offer.promise,
      body: keepText(section.body, ctx.offer.pricingTerms || ctx.offer.pricingRationale || (section.body ?? "")),
      cta: section.cta?.trim() || ctx.offer.cta || "Consultar acceso",
      ...(section.price?.trim() || priceText ? { price: section.price?.trim() || priceText } : {}),
      ...(section.priceNote?.trim() || ctx.offer.pricingTerms
        ? { priceNote: section.priceNote?.trim() || ctx.offer.pricingTerms }
        : {}),
      ...(section.bullets?.length
        ? { bullets: section.bullets }
        : ctx.offer.guarantee
          ? { bullets: [ctx.offer.guarantee] }
          : {}),
      ...(items.length ? { items } : {}),
    };
  },
  guarantee: (section, ctx) => ({
    layout: section.layout?.trim() || "badge",
    badge: section.badge?.trim() || "GARANTÍA TRANSPARENTE",
    eyebrow: section.eyebrow?.trim() || "ALCANCE Y GARANTÍA",
    headline: keepText(section.headline, "Compromiso y límites transparentes"),
    body: keepText(section.body, ctx.offer.guarantee || ctx.mechanism.limitations.join(" ") || (section.body ?? "")),
  }),
  cta: (section, ctx) => ({
    layout: section.layout?.trim() || "centered",
    eyebrow: section.eyebrow?.trim() || "ÚLTIMO PASO",
    headline: keepText(section.headline, ctx.offer.name || "Comienza hoy con estructura clara"),
    body: keepText(section.body, ctx.offer.promise || ctx.product.promise || (section.body ?? "")),
    cta: section.cta?.trim() || ctx.offer.cta || "Ver oferta",
  }),
};

/** Enriches one landing section with approved/active project artifacts without inventing invalid evidenceIds. */
export function enrichLandingSectionFromContext(
  section: LandingContentSection,
  context: ProjectResearchContext,
): LandingContentSection {
  const handler = SECTION_ENRICHERS[section.type];
  if (!handler) return section;
  const patch = handler(section, context);
  const next: LandingContentSection = { ...section, ...patch };
  if (next.imageUrl && !asText(next.imageAlt)) {
    next.imageAlt = (asText(next.headline) || next.type || "Imagen de sección").slice(0, 240);
  }
  return next;
}

/**
 * Applies a natural-language user prompt deterministically against the live canvas + project context.
 * Updates visual tokens, structures FAQs, and enriches targeted or all sections while keeping validation green.
 */
export function applyContextualPromptToLanding(
  value: LandingEditorValue,
  prompt: string,
  context: ProjectResearchContext,
): { value: LandingEditorValue; summary: string[] } {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();
  const next = structuredClone(value);
  const summary: string[] = [];

  // 1. Theme detection
  const themeRules: Array<[RegExp, string, string]> = [
    [/oscuro|dark|noche|framer|cyber|tech|futurista/, "dark", "Tema Oscuro / Tech aplicado"],
    [/editorial|revista|clínic|clinica|libro|académic/, "editorial", "Tema Editorial aplicado"],
    [/cálido|calido|ámbar|ambar|warm|energía|energia/, "warm", "Tema Cálido aplicado"],
    [/minimal|blanco|limpio|suave/, "minimal", "Tema Minimal aplicado"],
    [/moderno|azul|cobalto|saas/, "modern", "Tema Moderno aplicado"],
  ];
  for (const [pattern, themeKey, label] of themeRules) {
    if (pattern.test(lower) && LANDING_THEME_PRESETS[themeKey]) {
      next.designTokens = { ...next.designTokens, ...LANDING_THEME_PRESETS[themeKey]!, theme: themeKey };
      summary.push(label);
      break;
    }
  }

  // Optional accent overrides
  if (/morado|violeta|purple/.test(lower)) {
    next.designTokens.accent = "#7c6cff";
    summary.push("Color de acento ajustado a violeta (#7c6cff)");
  } else if (/esmeralda|verde/.test(lower) && next.designTokens.theme !== "editorial") {
    next.designTokens.accent = "#10b981";
    summary.push("Color de acento ajustado a esmeralda (#10b981)");
  } else if (/dorado|oro|ámbar|amber/.test(lower)) {
    next.designTokens.accent = "#f59e0b";
    summary.push("Color de acento ajustado a dorado (#f59e0b)");
  }

  // Typography & width
  if (/serif|elegante|revista/.test(lower)) {
    next.designTokens.font = "serif";
    summary.push("Tipografía cambiada a Serif editorial");
  } else if (/sans|moderna|tech/.test(lower)) {
    next.designTokens.font = "sans";
    summary.push("Tipografía cambiada a Sans moderna");
  }
  if (/amplio|ancho|1160/.test(lower)) {
    next.designTokens.width = "wide";
    summary.push("Ancho ampliado a 1160px");
  } else if (/compacto|880/.test(lower)) {
    next.designTokens.width = "compact";
    summary.push("Ancho ajustado a lectura compacta (880px)");
  }

  // Explicit inline overrides via "título: ..." or "cta: ..."
  const titleOverride = cleanPrompt.match(/(?:t[ií]tulo|headline)\s*:\s*([^\n]+)/i);
  if (titleOverride?.[1] && next.sections[0]) {
    next.sections[0].headline = titleOverride[1].trim();
    summary.push("Headline del Hero actualizado desde tu prompt");
  }
  const ctaOverride = cleanPrompt.match(/(?:cta|bot[oó]n)\s*:\s*([^\n]+)/i);
  if (ctaOverride?.[1] && next.sections[0]) {
    next.sections[0].cta = ctaOverride[1].trim();
    summary.push("CTA del Hero actualizado desde tu prompt");
  }

  // Section-specific or full context enrichment
  const wantsFaq = /faq|pregunta|duda|estructur/.test(lower);
  const wantsProblems = /problema|dolor|frustraci|caso/.test(lower);
  const wantsMechanism = /mecanismo|paso|m[eé]todo|c[oó]mo funciona/.test(lower);
  const wantsOffer = /oferta|producto|bono|entregable|garant[ií]a|beneficio/.test(lower);
  const wantsObjections = /objeci[oó]n|objeciones/.test(lower);
  const wantsCenter = /centrad|centrar/.test(lower);

  if (wantsCenter) {
    next.sections = next.sections.map((s) => ({ ...s, variant: "centered" }));
    summary.push("Composición centrada aplicada a las secciones");
  }

  const targeted = wantsFaq || wantsProblems || wantsMechanism || wantsOffer || wantsObjections;
  const targetTypes = new Set<string>();
  if (wantsFaq) targetTypes.add("faq");
  if (wantsProblems) {
    targetTypes.add("problem");
    targetTypes.add("agitation");
  }
  if (wantsMechanism) targetTypes.add("mechanism");
  if (wantsOffer) {
    targetTypes.add("product");
    targetTypes.add("benefits");
    targetTypes.add("deliverables");
    targetTypes.add("bonuses");
    targetTypes.add("offer");
    targetTypes.add("guarantee");
    targetTypes.add("cta");
  }
  if (wantsObjections) targetTypes.add("objections");

  const hasOnlyStyleDirective = summary.length > 0 && !targeted && !/contexto|investig|mejor|enriquec|todo|toda|completa|copia|texto/.test(lower);

  if (!hasOnlyStyleDirective || !cleanPrompt) {
    next.sections = next.sections.map((section) => {
      if (targeted && !targetTypes.has(section.type)) return section;
      return enrichLandingSectionFromContext(section, context);
    });

    if (wantsFaq && !next.sections.some((s) => s.type === "faq")) {
      const created = enrichLandingSectionFromContext(
        { id: createLandingSectionId(next.sections.map((s) => s.id ?? "")), type: "faq", enabled: true, ...DEFAULT_SECTION_CONTENT.faq },
        context,
      );
      next.sections.push(created);
      summary.push("Bloque FAQ añadido y estructurado");
    } else if (wantsFaq || !targeted) {
      summary.push("FAQ y tarjetas sincronizadas desde el proyecto");
    }

    if (targeted) {
      summary.push(`Secciones enriquecidas con contexto real: ${[...targetTypes].join(", ")}`);
    } else if (context.loaded) {
      summary.push("Contenido de la landing enriquecido con los módulos del proyecto");
    }
  }

  if (summary.length === 0) {
    summary.push("Lienzo actualizado con la instrucción indicada");
  }

  return { value: next, summary };
}

export const STUDIO_PROMPT_PRESETS: ReadonlyArray<{ label: string; prompt: string }> = [
  {
    label: "⚡ Página completa Oscuro Framer",
    prompt: "Crea una página completa de alta conversión con estética oscura tipo Framer (14 bloques), tarjetas detalladas en dolores, pasos del mecanismo, entregables y FAQ en Q&A.",
  },
  {
    label: "🔥 Dolor + Mecanismo paso a paso",
    prompt: "Enfatiza los problemas reales observados en la investigación y detalla cómo funciona el mecanismo en pasos claros con lenguaje cercano del avatar.",
  },
  {
    label: "📦 Oferta, Bonos y FAQ claro",
    prompt: "Estructura el catálogo completo del producto, beneficios tangibles, bonos, garantía honesta y preguntas frecuentes claras en formato tarjeta Q&A.",
  },
  {
    label: "📰 Editorial limpio Serif",
    prompt: "Usa estilo editorial elegante serif con ritmo claro, tarjetas comparativas y llamados a la acción directos sin exageraciones.",
  },
];

const CORE_CONVERSION_TYPES: readonly CanonicalLandingBlockType[] = [
  "hero",
  "problem",
  "mechanism",
  "benefits",
  "product",
  "offer",
  "faq",
  "guarantee",
  "cta",
];

const CARD_SECTION_TYPES = new Set([
  "problem",
  "agitation",
  "mechanism",
  "benefits",
  "product",
  "deliverables",
  "bonuses",
  "objections",
  "faq",
]);

export interface StudioProDiagnostics {
  score: number;
  grade: LandingQualityReport["grade"];
  metrics: LandingQualityReport["metrics"];
  visibleCount: number;
  totalCount: number;
  missingCoreTypes: CanonicalLandingBlockType[];
  unparsedFaqCount: number;
  missingAltCount: number;
  issues: string[];
}

/** Evaluates structural completeness, layout diversity, FAQ shape, and conversion quality in real time. */
export function evaluateLandingStudioPro(value: LandingEditorValue): StudioProDiagnostics {
  const sections = value.sections;
  const visibleSections = sections.filter((s) => s.enabled !== false);
  const visibleTypes = new Set(visibleSections.map((s) => s.type));
  const missingCoreTypes = CORE_CONVERSION_TYPES.filter((type) => !visibleTypes.has(type));

  let unparsedFaqCount = 0;
  let missingAltCount = 0;
  let emptyCardsCount = 0;

  for (const sec of visibleSections) {
    const items = Array.isArray(sec.items) ? sec.items : [];
    if (sec.type === "faq") {
      const hasValidQa = items.some((it) => isRecord(it) && asText(it.q).length > 0 && asText(it.a).length > 0);
      const hasHalfQa = items.some((it) => isRecord(it) && (!asText(it.q) || !asText(it.a)));
      if (!hasValidQa || hasHalfQa) unparsedFaqCount++;
    }
    if (sec.imageUrl && landingImageUrl(sec.imageUrl) && !asText(sec.imageAlt)) {
      missingAltCount++;
    }
    if (CARD_SECTION_TYPES.has(sec.type) && items.length === 0) {
      emptyCardsCount++;
    }
  }

  const quality = auditLandingQuality(fromLanding({}, value));
  const issues: string[] = [];
  if (!asText(value.pageName)) issues.push("Falta el título general de la landing.");
  if (visibleSections.length === 0) issues.push("Debe haber al menos 1 sección visible.");
  if (unparsedFaqCount > 0) issues.push(`FAQ sin tarjetas { q, a } completas (${unparsedFaqCount}).`);
  if (missingAltCount > 0) issues.push(`${missingAltCount} imagen(es) sin texto alternativo (alt).`);
  for (const qIssue of quality.issues) {
    if (!issues.some((m) => m.slice(0, 22) === qIssue.message.slice(0, 22))) {
      issues.push(qIssue.message);
    }
  }

  const extraPenalty = (!asText(value.pageName) ? 8 : 0) + missingAltCount * 6;
  const score = Math.max(0, Math.min(100, quality.score - extraPenalty));
  const grade: LandingQualityReport["grade"] = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";

  return {
    score,
    grade,
    metrics: quality.metrics,
    visibleCount: visibleSections.length,
    totalCount: sections.length,
    missingCoreTypes,
    unparsedFaqCount,
    missingAltCount,
    issues,
  };
}

/** One-click Studio PRO repair: structures FAQs, adds missing core blocks from research, and fixes alt text. */
export function autoFixLandingStudioPro(
  value: LandingEditorValue,
  context: ProjectResearchContext,
): { value: LandingEditorValue; actions: string[] } {
  const next = structuredClone(value);
  const actions: string[] = [];
  const objections = context.beliefs.objections.length ? context.beliefs.objections : context.avatar.objections;

  if (!asText(next.pageName)) {
    next.pageName = context.offer.name || context.product.name || "Landing del proyecto";
    actions.push("Título general completado");
  }

  if (next.sections.length > 0 && !next.sections.some((s) => s.enabled !== false)) {
    next.sections[0] = { ...next.sections[0]!, enabled: true };
    actions.push("Reactivada la primera sección");
  }

  next.sections = next.sections.map((section) => {
    let updated: LandingContentSection = { ...section };

    if (updated.imageUrl && landingImageUrl(updated.imageUrl) && !asText(updated.imageAlt)) {
      updated.imageAlt = (asText(updated.headline) || CANONICAL_LANDING_LABELS[updated.type as CanonicalLandingBlockType] || "Imagen de sección").slice(0, 240);
      actions.push(`Alt agregado en bloque ${updated.type}`);
    }

    if (updated.type === "faq") {
      const parsed = extractStructuredFaqItems(updated.body ?? "", updated.items, objections);
      const validExisting = (Array.isArray(updated.items) ? updated.items : []).filter(
        (it) => isRecord(it) && asText(it.q).length > 0 && asText(it.a).length > 0,
      );
      if (parsed.length > 0 && (validExisting.length === 0 || parsed.length > validExisting.length)) {
        const firstQ = (updated.body ?? "").indexOf("¿");
        updated = {
          ...updated,
          ...(firstQ === 0 ? { body: "Preguntas clave sobre el alcance y condiciones del material." } : {}),
          items: parsed,
        };
        actions.push("FAQ convertido a tarjetas { q, a }");
      } else if (validExisting.length === 0) {
        updated.items = [
          { q: "¿Cómo accedo al material?", a: "Acceso digital inmediato según el formato indicado en la oferta." },
          { q: "¿Incluye pautas paso a paso?", a: "Sí, organizado de forma práctica desde los fundamentos hasta la aplicación." },
        ];
        actions.push("Tarjetas iniciales añadidas al FAQ");
      }
    } else if (context.loaded && (!Array.isArray(updated.items) || updated.items.length === 0 || isPlaceholderText(updated.headline))) {
      updated = enrichLandingSectionFromContext(updated, context);
      actions.push(`Sección ${updated.type} enriquecida con investigación`);
    }

    return updated;
  });

  const presentTypes = new Set(next.sections.filter((s) => s.enabled !== false).map((s) => s.type));
  const usedIds = next.sections.flatMap((s) => (typeof s.id === "string" ? [s.id] : []));
  for (const coreType of CORE_CONVERSION_TYPES) {
    if (presentTypes.has(coreType)) continue;
    const preset = DEFAULT_SECTION_CONTENT[coreType];
    const id = createLandingSectionId(usedIds);
    usedIds.push(id);
    const created = enrichLandingSectionFromContext(
      {
        id,
        type: coreType,
        enabled: true,
        eyebrow: preset.eyebrow,
        headline: preset.headline,
        body: preset.body,
        ...(preset.cta ? { cta: preset.cta } : {}),
      },
      context,
    );
    next.sections.push(created);
    actions.push(`Añadido bloque faltante: ${CANONICAL_LANDING_LABELS[coreType]}`);
  }

  next.sections = next.sections.map((section) => {
    const resolvedLayout = resolveLandingLayout(section);
    if (section.layout !== resolvedLayout) {
      actions.push(`Diseño aplicado en ${section.type}: ${LANDING_LAYOUT_LABELS[resolvedLayout] ?? resolvedLayout}`);
      return { ...section, layout: resolvedLayout };
    }
    return section;
  });

  return { value: withStableLandingSectionIds(next), actions: [...new Set(actions)] };
}

/** Generates a self-contained Framer Code Component (.tsx) with native Framer propertyControls. */
export function renderLandingFramerCode(value: LandingEditorValue): string {
  const tokens = landingDesignTokens(value.designTokens);
  const safeCheckout = value.externalCheckout?.platform !== "none" ? landingCheckoutUrl(value.externalCheckout?.checkoutUrl) : "";
  const safeSections = value.sections.filter((s) => s.enabled !== false).map((s) => ({
    ...s,
    imageUrl: s.imageUrl ? landingImageUrl(s.imageUrl) : undefined,
  }));

  const payloadJson = JSON.stringify(
    {
      title: value.pageName || "Hallazia Landing",
      footerNote: value.footerNote || "",
      sections: safeSections,
      checkoutUrl: safeCheckout,
    },
    null,
    2,
  );

  return `// LandingFramer.tsx
// Code Component generado desde Hallazia Studio PRO para Framer.
// Cópialo en Framer -> Assets -> Code -> New File y arrástralo al canvas.

import * as React from "react";
import { addPropertyControls, ControlType } from "framer";

export interface FramerLandingProps {
  title: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  fontStyle: "sans" | "serif";
  maxWidth: number;
  sectionPadding: number;
  checkoutUrl: string;
}

interface FramerSectionData {
  id?: string;
  type: string;
  enabled?: boolean;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  cta?: string;
  imageUrl?: string;
  imageAlt?: string;
  items?: Array<string | Record<string, unknown>>;
}

const DEFAULT_LANDING_DATA: {
  title: string;
  footerNote: string;
  sections: FramerSectionData[];
  checkoutUrl: string;
} = ${payloadJson};

export function HallaziaLanding(props: Partial<FramerLandingProps>) {
  const {
    title = DEFAULT_LANDING_DATA.title,
    accentColor = ${JSON.stringify(tokens.accent)},
    backgroundColor = ${JSON.stringify(tokens.background)},
    textColor = ${JSON.stringify(tokens.text)},
    fontStyle = ${JSON.stringify(tokens.font)},
    maxWidth = ${tokens.width === "wide" ? 1160 : 880},
    sectionPadding = ${tokens.spacing === "compact" ? 36 : 64},
    checkoutUrl = DEFAULT_LANDING_DATA.checkoutUrl,
  } = props;

  const fontFamily =
    fontStyle === "serif"
      ? "Georgia, Cambria, serif"
      : "Inter, system-ui, -apple-system, sans-serif";

  return (
    <div
      aria-label={title}
      style={{
        backgroundColor,
        color: textColor,
        fontFamily,
        width: "100%",
        minHeight: "100%",
        boxSizing: "border-box",
      }}
    >
      {DEFAULT_LANDING_DATA.sections.map((section, idx) => {
        const isHero = section.type === "hero";
        const items = Array.isArray(section.items) ? section.items : [];
        return (
          <section
            key={section.id || idx}
            style={{
              maxWidth: isHero ? "100%" : maxWidth,
              margin: "0 auto",
              padding: \`\${sectionPadding}px 28px\`,
              borderBottom: "1px solid rgba(148,163,184,0.18)",
              background: isHero ? \`linear-gradient(135deg, \${backgroundColor}, \${accentColor}22)\` : "transparent",
            }}
          >
            <div style={{ maxWidth, margin: "0 auto", display: section.imageUrl ? "grid" : "block", gridTemplateColumns: "1.1fr 0.9fr", gap: 36, alignItems: "center" }}>
              <div>
                {section.eyebrow && (
                  <p style={{ color: accentColor, fontSize: 12, fontWeight: 700, letterSpacing: 1.8, textTransform: "uppercase", margin: "0 0 10px" }}>
                    {section.eyebrow}
                  </p>
                )}
                {section.headline && (
                  isHero ? (
                    <h1 style={{ fontSize: 46, lineHeight: 1.08, margin: "0 0 14px", fontWeight: 800 }}>{section.headline}</h1>
                  ) : (
                    <h2 style={{ fontSize: 32, lineHeight: 1.18, margin: "0 0 12px", fontWeight: 750 }}>{section.headline}</h2>
                  )
                )}
                {section.subheadline && (
                  <p style={{ fontSize: 19, opacity: 0.9, lineHeight: 1.5, margin: "0 0 16px" }}>{section.subheadline}</p>
                )}
                {section.body && (
                  <p style={{ fontSize: 16, opacity: 0.85, lineHeight: 1.7, whiteSpace: "pre-wrap", margin: "0 0 20px" }}>{section.body}</p>
                )}
                {items.length > 0 && (
                  <div style={{ display: "grid", gap: 14, gridTemplateColumns: section.type === "faq" || section.type === "objections" ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", margin: "20px 0" }}>
                    {items.map((raw, itemIdx) => {
                      const item = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
                      const itemTitle = typeof raw === "string" ? "" : String(item.q ?? item.name ?? item.title ?? "");
                      const itemBody = typeof raw === "string" ? raw : String(item.a ?? item.description ?? item.text ?? "");
                      return (
                        <div key={itemIdx} style={{ padding: 18, borderRadius: 12, border: "1px solid rgba(148,163,184,0.22)", background: "rgba(148,163,184,0.06)" }}>
                          {itemTitle && <strong style={{ display: "block", marginBottom: 6, fontSize: 16 }}>{itemTitle}</strong>}
                          {itemBody && <p style={{ margin: 0, fontSize: 14, opacity: 0.86, lineHeight: 1.55 }}>{itemBody}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {section.cta && (
                  <a
                    href={checkoutUrl || "#offer"}
                    target={checkoutUrl ? "_blank" : undefined}
                    rel={checkoutUrl ? "noopener noreferrer" : undefined}
                    style={{
                      display: "inline-block",
                      marginTop: 10,
                      padding: "14px 28px",
                      borderRadius: 10,
                      backgroundColor: accentColor,
                      color: "#ffffff",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    {section.cta}
                  </a>
                )}
              </div>
              {section.imageUrl && (
                <img
                  src={section.imageUrl}
                  alt={section.imageAlt || section.headline || ""}
                  style={{ width: "100%", borderRadius: 18, objectFit: "cover", maxHeight: 440 }}
                />
              )}
            </div>
          </section>
        );
      })}
      {DEFAULT_LANDING_DATA.footerNote && (
        <footer style={{ maxWidth, margin: "0 auto", padding: "28px", textAlign: "center", opacity: 0.7, fontSize: 13 }}>
          {DEFAULT_LANDING_DATA.footerNote}
        </footer>
      )}
    </div>
  );
}

export default HallaziaLanding;

addPropertyControls(HallaziaLanding, {
  title: { type: ControlType.String, title: "Título", defaultValue: DEFAULT_LANDING_DATA.title },
  accentColor: { type: ControlType.Color, title: "Acento", defaultValue: ${JSON.stringify(tokens.accent)} },
  backgroundColor: { type: ControlType.Color, title: "Fondo", defaultValue: ${JSON.stringify(tokens.background)} },
  textColor: { type: ControlType.Color, title: "Texto", defaultValue: ${JSON.stringify(tokens.text)} },
  fontStyle: { type: ControlType.Enum, title: "Tipografía", options: ["sans", "serif"], defaultValue: ${JSON.stringify(tokens.font)} },
  maxWidth: { type: ControlType.Number, title: "Ancho máx.", min: 720, max: 1440, step: 20, defaultValue: ${tokens.width === "wide" ? 1160 : 880} },
  sectionPadding: { type: ControlType.Number, title: "Espaciado", min: 20, max: 110, step: 4, defaultValue: ${tokens.spacing === "compact" ? 36 : 64} },
  checkoutUrl: { type: ControlType.String, title: "URL Checkout", defaultValue: DEFAULT_LANDING_DATA.checkoutUrl },
});
`;
}

function wrapSvgLines(input: string, maxChars: number, maxLines: number): string[] {
  const words = input.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** Generates a 1440px vector SVG artboard with labeled section frames ready to drag into Figma. */
export function renderLandingFigmaSvg(value: LandingEditorValue): string {
  const tokens = landingDesignTokens(value.designTokens);
  const sections = value.sections.filter((s) => s.enabled !== false);
  const width = 1440;
  const contentWidth = tokens.width === "wide" ? 1160 : 880;
  const left = (width - contentWidth) / 2;
  const isDark = /^#0|^#1|^#2/i.test(tokens.background);
  const cardBg = isDark ? "#131c2e" : "#ffffff";
  const cardBorder = isDark ? "#2a3954" : "#dbe4ee";

  let cursorY = 48;
  const fragments: string[] = [];

  sections.forEach((section, index) => {
    const startY = cursorY;
    let innerY = startY + 42;
    const parts: string[] = [];

    if (section.eyebrow) {
      parts.push(`<text x="${left + 40}" y="${innerY}" fill="${escapeXml(tokens.accent)}" font-size="13" font-weight="700" letter-spacing="2">${escapeXml(section.eyebrow.toUpperCase())}</text>`);
      innerY += 32;
    }
    if (section.headline) {
      const hLines = wrapSvgLines(section.headline, 54, 3);
      for (const hl of hLines) {
        parts.push(`<text x="${left + 40}" y="${innerY}" fill="${escapeXml(tokens.text)}" font-size="${section.type === "hero" ? 40 : 28}" font-weight="800">${escapeXml(hl)}</text>`);
        innerY += section.type === "hero" ? 46 : 36;
      }
      innerY += 8;
    }
    if (section.subheadline) {
      for (const sl of wrapSvgLines(section.subheadline, 76, 3)) {
        parts.push(`<text x="${left + 40}" y="${innerY}" fill="${escapeXml(tokens.text)}" opacity="0.88" font-size="19">${escapeXml(sl)}</text>`);
        innerY += 26;
      }
      innerY += 10;
    }
    if (section.body) {
      for (const bl of wrapSvgLines(section.body, 88, 6)) {
        parts.push(`<text x="${left + 40}" y="${innerY}" fill="${escapeXml(tokens.text)}" opacity="0.78" font-size="16">${escapeXml(bl)}</text>`);
        innerY += 24;
      }
      innerY += 14;
    }

    const items = Array.isArray(section.items) ? section.items.slice(0, 6) : [];
    for (const raw of items) {
      const itemObj = isRecord(raw) ? raw : {};
      const itemTitle = typeof raw === "string" ? "" : asText(itemObj.q ?? itemObj.name ?? itemObj.title);
      const itemDesc = typeof raw === "string" ? raw : asText(itemObj.a ?? itemObj.description ?? itemObj.text);
      const descLines = wrapSvgLines(itemDesc, 82, 3);
      const itemHeight = 36 + (itemTitle ? 26 : 0) + Math.max(1, descLines.length) * 22;
      parts.push(`<rect x="${left + 40}" y="${innerY}" width="${contentWidth - 80}" height="${itemHeight}" rx="12" fill="${escapeXml(tokens.background)}" stroke="${cardBorder}" stroke-width="1"/>`);
      let lineY = innerY + 28;
      if (itemTitle) {
        parts.push(`<text x="${left + 58}" y="${lineY}" fill="${escapeXml(tokens.text)}" font-size="16" font-weight="700">${escapeXml(itemTitle.slice(0, 96))}</text>`);
        lineY += 24;
      }
      for (const dl of descLines) {
        parts.push(`<text x="${left + 58}" y="${lineY}" fill="${escapeXml(tokens.text)}" opacity="0.8" font-size="14">${escapeXml(dl)}</text>`);
        lineY += 22;
      }
      innerY += itemHeight + 12;
    }

    if (section.cta) {
      parts.push(`<rect x="${left + 40}" y="${innerY + 4}" width="260" height="46" rx="10" fill="${escapeXml(tokens.accent)}"/>`);
      parts.push(`<text x="${left + 170}" y="${innerY + 32}" text-anchor="middle" fill="#ffffff" font-size="15" font-weight="700">${escapeXml(section.cta.slice(0, 36))}</text>`);
      innerY += 66;
    }

    const boxHeight = Math.max(180, innerY - startY + 24);
    fragments.push(
      `<g id="section-${index}-${escapeXml(section.type)}">` +
        `<rect x="${left}" y="${startY}" width="${contentWidth}" height="${boxHeight}" rx="20" fill="${cardBg}" stroke="${cardBorder}" stroke-width="1.5"/>` +
        parts.join("") +
      `</g>`,
    );
    cursorY = startY + boxHeight + 28;
  });

  const totalHeight = Math.max(400, cursorY + 40);
  const fontStack = tokens.font === "serif" ? "Georgia, serif" : "Inter, system-ui, sans-serif";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" font-family="${fontStack}">
  <rect width="${width}" height="${totalHeight}" fill="${escapeXml(tokens.background)}"/>
  <g id="Hallazia-Landing-Artboard">
    ${fragments.join("\n    ")}
  </g>
</svg>`;
}

/** Generates Figma Variables / Tokens Studio compatible JSON for the current landing theme tokens. */
export function renderFigmaTokensJson(value: LandingEditorValue): string {
  const tokens = landingDesignTokens(value.designTokens);
  return JSON.stringify(
    {
      $metadata: { source: "Hallazia Studio PRO", pageName: value.pageName || "Landing" },
      color: {
        accent: { value: tokens.accent, type: "color" },
        background: { value: tokens.background, type: "color" },
        text: { value: tokens.text, type: "color" },
      },
      typography: {
        fontFamily: { value: tokens.font === "serif" ? "Georgia, Cambria, serif" : "Inter, system-ui, sans-serif", type: "fontFamilies" },
      },
      layout: {
        containerWidth: { value: tokens.width === "wide" ? "1160px" : "880px", type: "dimension" },
        sectionSpacing: { value: tokens.spacing === "compact" ? "36px" : "64px", type: "spacing" },
        themePreset: { value: tokens.theme || "modern", type: "other" },
      },
    },
    null,
    2,
  );
}

function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type StudioMode = "landing" | "ebook" | "funnel";
type StudioVariant = "A" | "B";
type StudioZoom = 1 | 0.85 | 0.7;
type CodeInspectTab = "tsx" | "html" | "csv" | "tokens" | "svg";
type CopilotActionKey = "persuasive" | "scientific" | "urgent" | "storytelling";
type SpecialBlockKind = "comparison" | "pricing_tiers" | "authority" | "urgency_cta";

export interface FinalProductContext {
  loaded: boolean;
  title: string;
  introduction: string;
  conclusion: string;
  chapters: Array<{ title: string; content: string }>;
  checklist: string[];
  workbook: string[];
}

export interface FunnelStageContext {
  id: string;
  stage: string;
  name: string;
  description: string;
  price?: string | undefined;
}

export interface FunnelContextData {
  loaded: boolean;
  nodes: FunnelStageContext[];
}

const STUDIO_THEME_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  tokens: LandingDesignTokens;
}> = [
  {
    id: "dark-elite",
    label: "🖤 Framer Dark Elite",
    tokens: {
      theme: "dark",
      accent: "#f59e0b",
      background: "#0a0a0c",
      text: "#f8fafc",
      font: "sans",
      width: "wide",
      spacing: "relaxed",
    },
  },
  {
    id: "direct-neon",
    label: "⚡ Direct Response Neon",
    tokens: {
      theme: "dark",
      accent: "#0284c7",
      background: "#0f172a",
      text: "#f8fafc",
      font: "sans",
      width: "wide",
      spacing: "relaxed",
    },
  },
  {
    id: "editorial-warm",
    label: "☀️ Editorial Warm",
    tokens: {
      theme: "warm",
      accent: "#b45309",
      background: "#faf8f5",
      text: "#1c1917",
      font: "serif",
      width: "compact",
      spacing: "relaxed",
    },
  },
  {
    id: "modern",
    label: "Moderno",
    tokens: LANDING_THEME_PRESETS.modern!,
  },
  {
    id: "editorial",
    label: "Editorial",
    tokens: LANDING_THEME_PRESETS.editorial!,
  },
  {
    id: "minimal",
    label: "Minimal",
    tokens: LANDING_THEME_PRESETS.minimal!,
  },
];

export function buildFinalProductContext(result?: ModuleResult): FinalProductContext {
  if (!result || !isRecord(result.outputData)) {
    return {
      loaded: false,
      title: "",
      introduction: "",
      conclusion: "",
      chapters: [],
      checklist: [],
      workbook: [],
    };
  }
  const output = result.outputData;
  const guide = isRecord(output.guide) ? output.guide : {};
  const rawChapters = Array.isArray(guide.chapters) ? guide.chapters : [];
  const chapters = rawChapters
    .map((item, idx) => {
      if (typeof item === "string") {
        return { title: item.trim() || `Capítulo ${idx + 1}`, content: "" };
      }
      if (isRecord(item)) {
        return {
          title: asText(item.title) || `Capítulo ${idx + 1}`,
          content: rawStr(item.content),
        };
      }
      return null;
    })
    .filter((entry): entry is { title: string; content: string } => entry !== null);

  const checklist = (Array.isArray(output.checklist) ? output.checklist : [])
    .map((v) => asText(v))
    .filter(Boolean);
  const workbook = (Array.isArray(output.workbook) ? output.workbook : [])
    .map((v) => asText(v))
    .filter(Boolean);

  return {
    loaded: chapters.length > 0 || checklist.length > 0 || asText(guide.title).length > 0,
    title: asText(guide.title),
    introduction: rawStr(guide.introduction),
    conclusion: rawStr(guide.conclusion),
    chapters,
    checklist,
    workbook,
  };
}

export function buildFunnelContext(result?: ModuleResult): FunnelContextData {
  if (!result || !isRecord(result.outputData)) {
    return { loaded: false, nodes: [] };
  }
  const rawNodes = Array.isArray(result.outputData.nodes) ? result.outputData.nodes : [];
  const nodes = rawNodes
    .filter(isRecord)
    .map((node, idx) => {
      const rawPrice = node.price ?? node.metricValue;
      const price = typeof rawPrice === "string" || typeof rawPrice === "number" ? String(rawPrice).trim() : "";
      return {
        id: asText(node.id) || `node-${idx + 1}`,
        stage: asText(node.type) || asText(node.stage) || "step",
        name: asText(node.label) || asText(node.name) || `Paso ${idx + 1}`,
        description: asText(node.description),
        ...(price ? { price } : {}),
      };
    });
  return { loaded: nodes.length > 0, nodes };
}

function csvCell(raw: unknown): string {
  return `"${String(raw ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
}

/** Exports Framer CMS compatible CSV dataset from the active landing & research context. */
export function renderFramerCmsCsv(value: LandingEditorValue, context?: ProjectResearchContext): string {
  const tokens = landingDesignTokens(value.designTokens);
  const hero = value.sections.find((s) => s.type === "hero") ?? value.sections[0];
  const offer = value.sections.find((s) => s.type === "offer");
  const slug = (value.pageName || "landing-hallazia")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "landing-hallazia";
  const priceText = context?.offer.pricingAmount
    ? `${context.offer.pricingAmount} ${context.offer.pricingCurrency}`.trim()
    : "";
  const heroImg = hero?.imageUrl ? landingImageUrl(hero.imageUrl) : "";
  const visibleSections = value.sections.filter((s) => s.enabled !== false);

  const header = [
    "Title",
    "Slug",
    "Theme",
    "Accent",
    "Headline",
    "Subheadline",
    "OfferHeadline",
    "OfferCta",
    "OfferPrice",
    "CheckoutUrl",
    "HeroImage",
    "SectionsCount",
    "SectionsList",
  ];
  const row = [
    value.pageName || "Landing Hallazia",
    slug,
    tokens.theme || "modern",
    tokens.accent,
    hero?.headline ?? "",
    hero?.subheadline ?? hero?.body ?? "",
    offer?.headline ?? "",
    offer?.cta ?? hero?.cta ?? "",
    priceText,
    value.externalCheckout?.platform !== "none" ? landingCheckoutUrl(value.externalCheckout?.checkoutUrl) : "",
    heroImg,
    visibleSections.length,
    visibleSections.map((s) => `${s.type}:${asText(s.headline)}`).join(" | "),
  ];
  return `${header.map(csvCell).join(",")}\n${row.map(csvCell).join(",")}`;
}

export function renderEbookEditorialHtml(ebook: {
  title: string;
  subtitle: string;
  coverImageUrl?: string | undefined;
  chapters: Array<{ title: string; content: string }>;
  checklist: string[];
  workbook: string[];
  conclusion?: string | undefined;
}): string {
  const safeImg = ebook.coverImageUrl ? landingImageUrl(ebook.coverImageUrl) : "";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeXml(ebook.title || "Ebook Editorial")}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;line-height:1.78;color:#1c1917;max-width:820px;margin:0 auto;padding:48px 28px;background:#fff}
  .cover{border:6px solid #0f172a;padding:48px 32px;text-align:center;background:linear-gradient(180deg,#f8fafc,#f1f5f9);margin-bottom:48px;page-break-after:always}
  .eyebrow{font-family:system-ui,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px;color:#b45309;text-transform:uppercase}
  h1{font-size:34px;line-height:1.2;color:#0f172a;margin:16px 0}
  .subtitle{font-size:17px;color:#475569;font-style:italic;margin:0 auto 28px;max-width:600px}
  .cover img{max-width:420px;width:100%;border-radius:10px;box-shadow:0 16px 36px rgba(0,0,0,.2)}
  h2{font-size:24px;color:#0f172a;border-bottom:2px solid #b45309;padding-bottom:8px;margin:36px 0 16px}
  .chapter{margin-top:42px;page-break-before:always}
  .chapter p{white-space:pre-wrap;text-align:justify}
  li{margin:8px 0}
  @media print{body{padding:20px}}
</style>
</head>
<body>
  <section class="cover">
    <div class="eyebrow">EDICIÓN EDITORIAL · HALLAZIA STUDIO PRO</div>
    <h1>${escapeXml(ebook.title || "Guía Digital Completa")}</h1>
    ${ebook.subtitle ? `<p class="subtitle">${escapeXml(ebook.subtitle)}</p>` : ""}
    ${safeImg ? `<img src="${escapeXml(safeImg)}" alt="${escapeXml(ebook.title)}" />` : ""}
  </section>
  <section>
    <h2>Índice de Capítulos</h2>
    <ol>
      ${ebook.chapters.map((ch) => `<li><strong>${escapeXml(ch.title)}</strong></li>`).join("\n      ")}
    </ol>
  </section>
  ${ebook.chapters
    .map(
      (ch, idx) => `<article class="chapter">
    <div class="eyebrow">CAPÍTULO ${idx + 1}</div>
    <h2>${escapeXml(ch.title)}</h2>
    <p>${escapeXml(ch.content || "Contenido desarrollado desde la investigación y estructura aprobada del proyecto.")}</p>
  </article>`,
    )
    .join("\n")}
  ${
    ebook.checklist.length > 0
      ? `<section class="chapter">
    <h2>Checklist de Aplicación Paso a Paso</h2>
    <ul>
      ${ebook.checklist.map((item) => `<li>☑ ${escapeXml(item)}</li>`).join("\n      ")}
    </ul>
  </section>`
      : ""
  }
  ${
    ebook.workbook.length > 0
      ? `<section class="chapter">
    <h2>Cuaderno de Trabajo (Workbook)</h2>
    <ul>
      ${ebook.workbook.map((item) => `<li>✎ ${escapeXml(item)}</li>`).join("\n      ")}
    </ul>
  </section>`
      : ""
  }
  ${
    ebook.conclusion
      ? `<section class="chapter">
    <h2>Conclusión</h2>
    <p>${escapeXml(ebook.conclusion)}</p>
  </section>`
      : ""
  }
</body>
</html>`;
}

function printHtmlViaIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.srcdoc = html;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1500);
    }
  };
  document.body.appendChild(iframe);
}

export function applyVariantToLanding(
  value: LandingEditorValue,
  variant: StudioVariant,
  context: ProjectResearchContext,
): LandingEditorValue {
  const next = structuredClone(value);
  next.sections = next.sections.map((section) => {
    if (section.type === "hero") {
      if (variant === "B") {
        const painAnchor = context.avatar.currentSituation[0] || context.problems[0]?.summary || "";
        return {
          ...section,
          eyebrow: "HISTORIA REAL Y ENFOQUE PRÁCTICO",
          headline:
            context.avatar.frustrations[0]
              ? `Cuando sientes que nada funciona: ${context.offer.name || context.product.name || section.headline || ""}`.slice(0, 180)
              : section.headline || "Cómo recuperar la calma sin improvisar cada intento",
          subheadline: painAnchor || context.offer.promise || section.subheadline || "",
          cta: section.cta || context.offer.cta || "Conocer la historia y el método",
        };
      }
      return {
        ...section,
        eyebrow: context.product.format ? `VENTA DIRECTA · ${context.product.format.toUpperCase().slice(0, 24)}` : "PROPUESTA DIRECTA",
        headline: context.offer.name || context.product.name || section.headline || "",
        subheadline: context.offer.promise || context.product.promise || section.subheadline || "",
        cta: context.offer.cta || section.cta || "Acceder ahora",
      };
    }
    if (section.type === "problem" && variant === "B" && context.avatar.pains.length) {
      return {
        ...section,
        eyebrow: "LO QUE SE VIVE EN PRIMERA PERSONA",
        items: context.avatar.pains.slice(0, 4).map((pain, idx) => ({
          name: context.problems[idx]?.name || `Escena cotidiana #${idx + 1}`,
          description: pain,
        })),
      };
    }
    if (section.type === "mechanism" && context.loaded) {
      return {
        ...section,
        eyebrow: variant === "B" ? "POR QUÉ CAMBIA TODO EL DÍA A DÍA" : "SISTEMA PASO A PASO",
        ...(variant === "B" && context.mechanism.simpleExplanation
          ? { body: context.mechanism.simpleExplanation }
          : variant === "A" && context.mechanism.solutionMechanism
            ? { body: context.mechanism.solutionMechanism }
            : {}),
      };
    }
    return section;
  });
  return next;
}

export function applyCopilotSuperpowerToLanding(
  value: LandingEditorValue,
  action: CopilotActionKey,
  context: ProjectResearchContext,
): { value: LandingEditorValue; label: string } {
  if (action === "storytelling") {
    return {
      value: applyVariantToLanding(value, "B", context),
      label: "Storytelling emocional aplicado desde el perfil del avatar",
    };
  }
  const next = structuredClone(value);
  if (action === "persuasive") {
    next.sections = next.sections.map((section) => {
      if (section.type === "hero") {
        return {
          ...section,
          eyebrow: "BENEFICIO Y TRANSFORMACIÓN CLARA",
          headline: context.offer.name || context.product.name || section.headline || "",
          subheadline: context.offer.promise || context.product.outcome || section.subheadline || "",
          cta: context.offer.cta || section.cta || "Ver oferta completa",
        };
      }
      if (section.type === "benefits" || section.type === "offer") {
        return enrichLandingSectionFromContext(section, context);
      }
      return section;
    });
    return { value: next, label: "Enfoque de persuasión y beneficios concretos aplicado" };
  }
  if (action === "scientific") {
    next.sections = next.sections.map((section) => {
      if (section.type === "mechanism" || section.type === "proof" || section.type === "guarantee") {
        return enrichLandingSectionFromContext(section, context);
      }
      if (section.type === "hero") {
        return {
          ...section,
          eyebrow: "MÉTODO RESPALDADO POR EVIDENCIA",
          ...(context.mechanism.differentiation ? { body: context.mechanism.differentiation } : {}),
        };
      }
      return section;
    });
    return { value: next, label: "Rigor metodológico y argumentos con evidencia sincronizados" };
  }
  // action === "urgent"
  next.sections = next.sections.map((section) => {
    if (section.type === "offer" || section.type === "cta") {
      return {
        ...enrichLandingSectionFromContext(section, context),
        eyebrow: "ACCESO INMEDIATO",
        cta: context.offer.cta || section.cta || "Acceder hoy al material",
      };
    }
    return section;
  });
  return { value: next, label: "Claridad de oferta y llamados a la acción reforzados" };
}

export function buildSpecialConversionSection(
  kind: SpecialBlockKind,
  existingIds: string[],
  context: ProjectResearchContext,
): LandingContentSection {
  const id = createLandingSectionId(existingIds);
  if (kind === "comparison") {
    const trad = context.problems.slice(0, 3).map((p) => p.name);
    const sol = context.mechanism.steps.slice(0, 3);
    return {
      id,
      type: "problem",
      enabled: true,
      variant: "editorial",
      layout: "comparison",
      beforeLabel: "Improvisación habitual",
      afterLabel: "Protocolo estructurado",
      eyebrow: "COMPARATIVA DIRECTA",
      headline: "Improvisación habitual vs. Protocolo estructurado",
      body: context.mechanism.differentiation || "Contraste claro entre intentar consejos sueltos y seguir criterios ordenados.",
      items: [
        {
          name: "Diagnóstico",
          before: trad[0] || "Reacciones sin plan previo ni lectura de señales tempranas.",
          after: sol[0] || context.mechanism.solutionMechanism || "Identificación temprana de umbral y distancia segura.",
          description: sol[0] || context.mechanism.solutionMechanism || "Identificación temprana de umbral y distancia segura.",
        },
        {
          name: "Durante el paseo",
          before: trad[1] || "Ensayo y error sin medir ritmo ni entorno.",
          after: sol[1] || "Maniobras prácticas de descompresión y redirección calmada.",
          description: sol[1] || "Maniobras prácticas de descompresión y redirección calmada.",
        },
        {
          name: "Seguimiento",
          before: trad[2] || "Frustración acumulada al repetir el mismo patrón.",
          after: sol[2] || "Registro progresivo con checklists y bitácora diaria.",
          description: sol[2] || "Registro progresivo con checklists y bitácora diaria.",
        },
      ],
    };
  }
  if (kind === "pricing_tiers") {
    const priceText = context.offer.pricingAmount
      ? `${context.offer.pricingAmount} ${context.offer.pricingCurrency}`.trim()
      : "Según oferta vigente";
    return {
      id,
      type: "offer",
      enabled: true,
      variant: "centered",
      layout: "pricing",
      badge: "ACCESO COMPLETO",
      price: priceText,
      priceNote: context.offer.pricingTerms || "Acceso digital inmediato",
      eyebrow: "OPCIONES DE ACCESO Y VALOR",
      headline: context.offer.name || "Lo que incluye tu acceso completo",
      body: context.offer.pricingTerms || context.offer.pricingRationale || "Consulta las condiciones, formatos incluidos y garantía transparente.",
      cta: context.offer.cta || "Revisar acceso completo",
      items: [
        {
          name: `Edición Base · ${priceText}`,
          description: context.product.deliverables[0] || context.offer.deliverables[0] || "Guía digital completa paso a paso.",
        },
        {
          name: "Sistema Completo + Complementos",
          description:
            context.offer.bonuses.slice(0, 2).map((b) => b.name).filter(Boolean).join(" + ") ||
            context.offer.deliverables.slice(0, 3).join(" · ") ||
            "Incluye checklists, bitácora y recursos de apoyo.",
        },
        {
          name: "Garantía y Límites Claros",
          description: context.offer.guarantee || "Alcance transparente sin promesas mágicas ni afirmaciones médicas.",
        },
      ],
    };
  }
  if (kind === "authority") {
    return enrichLandingSectionFromContext(
      {
        id,
        type: "proof",
        enabled: true,
        variant: "editorial",
        eyebrow: "AUTORIDAD Y BASE DE EVIDENCIA",
        headline: "Metodología construida desde casos y criterios verificables",
        body: context.mechanism.differentiation || context.beliefs.bigIdea || "Cada pauta está sustentada en observación práctica y límites transparentes.",
      },
      context,
    );
  }
  return {
    id,
    type: "cta",
    enabled: true,
    variant: "centered",
    eyebrow: "SIGUIENTE PASO",
    headline: context.offer.name ? `Empieza hoy con ${context.offer.name}` : "Da el primer paso con una guía clara y accionable",
    body: context.offer.promise || context.product.promise || "Accede a todos los capítulos, checklists y herramientas prácticas en formato digital.",
    cta: context.offer.cta || "Acceder a la guía ahora",
  };
}

export function injectRealPhotosIntoLanding(
  value: LandingEditorValue,
  studioAssets: readonly StudioVisualAsset[],
): { value: LandingEditorValue; count: number } {
  if (!studioAssets.length) return { value, count: 0 };
  const findById = (ids: string[]): StudioVisualAsset | undefined =>
    ids.map((id) => studioAssets.find((asset) => asset.id === id)).find(Boolean) ?? studioAssets[0];

  const roleMap: Record<string, string[]> = {
    hero: ["bundle", "hero", "guide"],
    problem: ["problem", "foto_perro_tension_urbana", "foto_estallido_reactivo"],
    agitation: ["foto_estallido_reactivo", "foto_whale_eye_estres", "foto_ladrido_ventana"],
    mechanism: ["foto_master_01_paseo_nocturno", "foto_olfateo_calma", "illustration_signals"],
    product: ["guide", "bundle", "foto_cuaderno_escritorio"],
    deliverables: ["foto_mockup_tarjetas_sos", "foto_cuaderno_escritorio"],
    bonuses: ["foto_masticacion_descompresion", "foto_descompresion_sniffari"],
    benefits: ["foto_banco_parque_atardecer", "foto_vinculo_afecto", "foto_perro_paseo_calmado"],
    proof: ["testimonial", "expert", "foto_conexion_tutor_perro"],
    offer: ["bundle", "foto_mockup_tarjetas_sos"],
    guarantee: ["expert", "foto_master_02_consulta_etologia"],
    cta: ["hero", "foto_paseo_nocturno_calmado"],
  };

  let count = 0;
  const next = structuredClone(value);
  next.sections = next.sections.map((section) => {
    const existing = section.imageUrl?.trim() ?? "";
    if (existing.startsWith("/api/projects/")) return section;
    const preferredIds = roleMap[section.type];
    if (!preferredIds) return section;
    const chosen = findById(preferredIds);
    if (!chosen) return section;
    count++;
    return {
      ...section,
      imageUrl: chosen.url,
      imageAlt: section.imageAlt?.trim() || chosen.title.slice(0, 240),
    };
  });
  return { value: next, count };
}

export interface LandingStudioProProps {
  projectId: string;
  selectedVersionId?: string | undefined;
  value: LandingEditorValue;
  readOnly?: boolean | undefined;
  saving?: boolean | undefined;
  assets?: ProductAsset[] | undefined;
  imageConfigured?: boolean | null | undefined;
  onSave: (value: LandingEditorValue) => void | boolean | Promise<void | boolean>;
  onApplyToEditor?: ((value: LandingEditorValue) => void) | undefined;
  onExportHtml: (value: LandingEditorValue) => void | Promise<void>;
  onExportReact: (value: LandingEditorValue) => void;
  onRegenerate?: ((instructions?: string) => void | Promise<void>) | undefined;
  onClose: () => void;
}

export function LandingStudioPro({
  projectId,
  selectedVersionId,
  value,
  readOnly = false,
  saving = false,
  assets: initialAssets = [],
  imageConfigured: initialImageConfigured = null,
  onSave,
  onApplyToEditor,
  onExportHtml,
  onExportReact,
  onRegenerate,
  onClose,
}: LandingStudioProProps) {
  const [draft, setDraft] = useState<LandingEditorValue>(() => withStableLandingSectionIds(structuredClone(value)));
  const [historyPast, setHistoryPast] = useState<LandingEditorValue[]>([]);
  const [historyFuture, setHistoryFuture] = useState<LandingEditorValue[]>([]);
  const [viewport, setViewport] = useState<StudioViewport>("desktop");
  const [studioMode, setStudioMode] = useState<StudioMode>("landing");
  const [variant, setVariant] = useState<StudioVariant>("A");
  const [zoom, setZoom] = useState<StudioZoom>(1);
  const [presentationMode, setPresentationMode] = useState(false);
  const [context, setContext] = useState<ProjectResearchContext>(EMPTY_PROJECT_RESEARCH_CONTEXT);
  const [finalProductContext, setFinalProductContext] = useState<FinalProductContext>(() => buildFinalProductContext());
  const [funnelContext, setFunnelContext] = useState<FunnelContextData>(() => buildFunnelContext());
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextTab, setContextTab] = useState<ContextTab>("problems");
  const [activeIndex, setActiveIndex] = useState(0);
  const [promptInput, setPromptInput] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [promptChanges, setPromptChanges] = useState<string[]>([]);
  const [newBlockType, setNewBlockType] = useState<CanonicalLandingBlockType>("faq");
  const [imagePanelIndex, setImagePanelIndex] = useState<number | null>(null);
  const [assets, setAssets] = useState<ProductAsset[]>(initialAssets);
  const [studioAssets, setStudioAssets] = useState<StudioVisualAsset[]>([]);
  const [galleryCategory, setGalleryCategory] = useState<string>("all");
  const [imageConfigured, setImageConfigured] = useState<boolean | null>(initialImageConfigured);
  const [imagePrompt, setImagePrompt] = useState("");
  const [busyImage, setBusyImage] = useState(false);
  const [copiedFramer, setCopiedFramer] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<GenerationProvider>("deepseek");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [lastAiMeta, setLastAiMeta] = useState<{
    provider: string;
    model: string;
    grade?: string | undefined;
    score?: number | undefined;
    passes?: number | undefined;
  } | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeTab, setCodeTab] = useState<CodeInspectTab>("tsx");
  const [copiedCodeModal, setCopiedCodeModal] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotLiveAi, setCopilotLiveAi] = useState(false);
  const [copilotInput, setCopilotInput] = useState("");
  const copyTimer = useRef<number | null>(null);

  const commitDraft = (nextOrUpdater: LandingEditorValue | ((prev: LandingEditorValue) => LandingEditorValue)) => {
    setDraft((prev) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      setHistoryPast((past) => [...past.slice(-29), structuredClone(prev)]);
      setHistoryFuture([]);
      return next;
    });
  };

  const handleUndo = () => {
    setHistoryPast((past) => {
      if (!past.length) return past;
      const previous = past[past.length - 1]!;
      setHistoryFuture((future) => [structuredClone(draft), ...future.slice(0, 29)]);
      setDraft(previous);
      setStatusMessage("Cambio revertido (Deshacer).");
      return past.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setHistoryFuture((future) => {
      if (!future.length) return future;
      const next = future[0]!;
      setHistoryPast((past) => [...past.slice(-29), structuredClone(draft)]);
      setDraft(next);
      setStatusMessage("Cambio restaurado (Rehacer).");
      return future.slice(1);
    });
  };

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      const [entries, fpRes, fnRes] = await Promise.allSettled([
        Promise.allSettled(
          CONTEXT_MODULE_KEYS.map(async (key) => {
            const res = await api.moduleResults?.(projectId, key);
            return [key, pickPreferredResult(res?.results ?? [])] as const;
          }),
        ),
        api.moduleResults?.(projectId, "final_product"),
        api.moduleResults?.(projectId, "funnel"),
      ]);
      const mapped: Partial<Record<ModuleKey, ModuleResult | undefined>> = {};
      if (entries.status === "fulfilled") {
        for (const item of entries.value) {
          if (item.status === "fulfilled") mapped[item.value[0]] = item.value[1];
        }
      }
      setContext(buildProjectResearchContext(mapped));
      if (fpRes.status === "fulfilled") {
        setFinalProductContext(buildFinalProductContext(pickPreferredResult(fpRes.value?.results ?? [])));
      }
      if (fnRes.status === "fulfilled") {
        setFunnelContext(buildFunnelContext(pickPreferredResult(fnRes.value?.results ?? [])));
      }
    } catch {
      // Offline or unmocked test run cleanly keeps empty context without crashing
    } finally {
      setLoadingContext(false);
    }
  };

  useEffect(() => {
    void loadContext();
    if (typeof api.providerStatus === "function") {
      void api
        .providerStatus(projectId)
        .then((status) => {
          setProviderStatus(status);
          const preferred: GenerationProvider = status.deepseek?.configured
            ? "deepseek"
            : status.gemini?.configured
              ? "gemini"
              : status.defaultProvider;
          setSelectedProvider(preferred);
        })
        .catch(() => {});
    }
    if (typeof api.studioAssets === "function") {
      void api
        .studioAssets()
        .then((res) => setStudioAssets(res.assets ?? []))
        .catch(() => {});
    }
    if (!initialAssets.length && typeof api.productAssets === "function") {
      void api.productAssets(projectId).then((res) => setAssets(res.assets.filter((a) => a.kind === "image"))).catch(() => {});
    }
    if (initialImageConfigured === null && typeof api.landingImageStatus === "function") {
      void api.landingImageStatus(projectId).then((res) => setImageConfigured(res.configured)).catch(() => setImageConfigured(false));
    }
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, [projectId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showCodeModal) {
          setShowCodeModal(false);
          return;
        }
        if (presentationMode) {
          setPresentationMode(false);
          return;
        }
        if (copilotOpen) {
          setCopilotOpen(false);
          return;
        }
      }
      const target = event.target as HTMLElement | null;
      const isEditable = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (isEditable || !(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const tokens = useMemo(() => landingDesignTokens(draft.designTokens), [draft.designTokens]);
  const diagnostics = useMemo(() => evaluateLandingStudioPro(draft), [draft]);
  const activeSection = draft.sections[activeIndex] ?? draft.sections[0];
  const visibleCount = draft.sections.filter((s) => s.enabled !== false).length;

  const updateSection = (idx: number, patch: Partial<LandingContentSection>) => {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  };

  const moveSection = (idx: number, delta: number) => {
    const target = idx + delta;
    if (target < 0 || target >= draft.sections.length) return;
    commitDraft((prev) => {
      const next = [...prev.sections];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return { ...prev, sections: next };
    });
    setActiveIndex(target);
  };

  const duplicateSection = (idx: number) => {
    const source = draft.sections[idx];
    if (!source) return;
    const usedIds = draft.sections.flatMap((s) => (typeof s.id === "string" ? [s.id] : []));
    const clone: LandingContentSection = {
      ...structuredClone(source),
      id: createLandingSectionId(usedIds),
      headline: source.headline ? `${source.headline} (copia)` : "Sección duplicada",
    };
    commitDraft((prev) => ({
      ...prev,
      sections: [...prev.sections.slice(0, idx + 1), clone, ...prev.sections.slice(idx + 1)],
    }));
    setActiveIndex(idx + 1);
    setStatusMessage(`Sección #${idx + 1} duplicada.`);
  };

  const deleteSection = (idx: number) => {
    const target = draft.sections[idx];
    if (!target) return;
    if (draft.sections.length <= 1 || (target.enabled !== false && visibleCount <= 1)) {
      setStatusError("Debe permanecer al menos una sección visible en la Landing.");
      return;
    }
    setStatusError(null);
    commitDraft((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== idx),
    }));
    setActiveIndex((prev) => Math.max(0, Math.min(prev, draft.sections.length - 2)));
  };

  const toggleSectionEnabled = (idx: number) => {
    const target = draft.sections[idx];
    if (!target) return;
    if (target.enabled !== false && visibleCount <= 1) {
      setStatusError("No puedes ocultar la última sección visible de la Landing.");
      return;
    }
    setStatusError(null);
    commitDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === idx ? { ...s, enabled: target.enabled === false } : s)),
    }));
  };

  const addNewSection = (type: CanonicalLandingBlockType) => {
    const preset = DEFAULT_SECTION_CONTENT[type];
    const base: LandingContentSection = {
      id: createLandingSectionId(draft.sections.flatMap((s) => (typeof s.id === "string" ? [s.id] : []))),
      type,
      enabled: true,
      eyebrow: preset.eyebrow,
      headline: preset.headline,
      body: preset.body,
      ...(preset.cta ? { cta: preset.cta } : {}),
    };
    const enriched = enrichLandingSectionFromContext(base, context);
    const nextSections = [...draft.sections, enriched];
    commitDraft((prev) => ({ ...prev, sections: nextSections }));
    setActiveIndex(nextSections.length - 1);
    setStatusMessage(`Bloque «${CANONICAL_LANDING_LABELS[type]}» añadido${context.loaded ? " con datos de tu proyecto" : ""}.`);
  };

  const addItemToSection = (idx: number) => {
    const sec = draft.sections[idx];
    if (!sec) return;
    const isQa = sec.type === "faq" || sec.type === "objections";
    const newItem = isQa
      ? { q: "Nueva pregunta sobre el material", a: "Respuesta clara basada en el alcance del proyecto." }
      : { name: "Nuevo punto clave", description: "Descripción breve respaldada por la investigación." };
    commitDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === idx ? { ...s, items: [...(s.items ?? []), newItem] } : s)),
    }));
  };

  const updateItemField = (secIdx: number, itemIdx: number, field: string, textValue: string) => {
    const sec = draft.sections[secIdx];
    if (!sec) return;
    const items = [...(sec.items ?? [])];
    const current = items[itemIdx];
    if (typeof current === "string") {
      items[itemIdx] = textValue;
    } else if (isRecord(current)) {
      items[itemIdx] = { ...current, [field]: textValue };
    }
    updateSection(secIdx, { items });
  };

  const removeItem = (secIdx: number, itemIdx: number) => {
    const sec = draft.sections[secIdx];
    if (!sec) return;
    commitDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === secIdx ? { ...s, items: (s.items ?? []).filter((_, j) => j !== itemIdx) } : s)),
    }));
  };

  const handleApplyPrompt = () => {
    setStatusError(null);
    const { value: updated, summary } = applyContextualPromptToLanding(draft, promptInput, context);
    commitDraft(updated);
    setPromptChanges(summary);
    setStatusMessage("Reglas rápidas aplicadas al lienzo interactivo.");
  };

  const handleRunStudioAi = async (mode: LandingStudioAiMode, targetSectionIndex?: number) => {
    if (generatingAi || typeof api.runLandingStudioAi !== "function") return;
    const trimmedPrompt = promptInput.trim();
    const resolvedIdx = typeof targetSectionIndex === "number" ? targetSectionIndex : activeIndex;
    setGeneratingAi(true);
    setStatusError(null);
    setStatusMessage(`Generando con ${selectedProvider.toUpperCase()} sin alterar tu versión aprobada…`);
    try {
      const response = await api.runLandingStudioAi(projectId, {
        provider: selectedProvider,
        mode,
        ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
        ...(mode === "section" ? { sectionIndex: resolvedIdx } : {}),
        currentDraft: fromLanding({}, draft),
        ...(selectedVersionId ? { sourceVersionId: selectedVersionId } : {}),
      });
      const nextValue = withStableLandingSectionIds(toLanding(response.outputData));
      commitDraft(nextValue);
      setLastAiMeta({
        provider: response.provider,
        model: response.model,
        grade: response.quality?.grade,
        score: response.quality?.score,
        passes: response.passes,
      });
      setPromptChanges([
        `Motor usado: ${response.provider} (${response.model})`,
        `Modo: ${mode === "full_page" ? "Página completa PRO" : mode === "section" ? `Reescritura sección #${resolvedIdx + 1}` : "Pulido global de copy"}${response.passes ? ` · ${response.passes} pasada(s)` : ""}`,
        `Auditoría PRO: ${response.quality ? `Grado ${response.quality.grade} (${response.quality.score}/100) · ${response.quality.metrics.layouts} diseños · ${response.quality.metrics.images} fotos` : `${nextValue.sections.length} secciones`}`,
        `Validación: ${response.audit.ok ? "OK" : response.audit.errors.join(", ")}`,
      ]);
      if (!response.audit.ok) {
        setStatusError(`IA generó con avisos de validación: ${response.audit.errors.join("; ")}. Pulsa Auto-Corregir Todo o revisa antes de guardar.`);
      } else {
        setStatusMessage(
          `✨ ${mode === "full_page" ? "Página completa generada" : mode === "section" ? `Sección #${resolvedIdx + 1} reescrita` : "Copy pulido"} con ${response.provider} (${response.model})${response.quality ? ` · Calidad ${response.quality.score}/100 (Grado ${response.quality.grade})` : ""}.`,
        );
      }
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "No se pudo generar la Landing con el proveedor IA.");
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleAutoFixAll = () => {
    setStatusError(null);
    const { value: repaired, actions } = autoFixLandingStudioPro(draft, context);
    if (!actions.length) {
      setStatusMessage("Tu Landing ya cumple todas las comprobaciones PRO (100%).");
      return;
    }
    commitDraft(repaired);
    setPromptChanges(actions);
    setStatusMessage(`Auto-corrección aplicada (${actions.length} ajustes).`);
  };

  const handleStructureFaq = () => {
    setStatusError(null);
    const objections = context.beliefs.objections.length ? context.beliefs.objections : context.avatar.objections;
    let updatedCount = 0;
    const nextSections = draft.sections.map((sec) => {
      if (sec.type !== "faq") return sec;
      updatedCount++;
      const parsed = extractStructuredFaqItems(sec.body ?? "", sec.items, objections);
      const firstQ = (sec.body ?? "").indexOf("¿");
      return {
        ...sec,
        ...(firstQ === 0 && parsed.length
          ? { body: "Preguntas clave sobre el alcance y condiciones del material." }
          : {}),
        ...(parsed.length ? { items: parsed } : {}),
      };
    });
    if (updatedCount === 0) {
      addNewSection("faq");
      return;
    }
    commitDraft((prev) => ({ ...prev, sections: nextSections }));
    setStatusMessage("Preguntas FAQ convertidas en tarjetas estructuradas { q, a } listas para validar.");
  };

  const handleSyncGroup = (types: readonly string[], label: string) => {
    setStatusError(null);
    let touched = 0;
    const nextSections = draft.sections.map((sec) => {
      if (!types.includes(sec.type)) return sec;
      touched++;
      return enrichLandingSectionFromContext(sec, context);
    });
    if (touched === 0) {
      setStatusError(`No hay bloques de tipo (${types.join(", ")}) en la landing actual; añádelo abajo si lo necesitas.`);
      return;
    }
    commitDraft((prev) => ({ ...prev, sections: nextSections }));
    setStatusMessage(`${label} sincronizado en ${touched} ${touched === 1 ? "sección" : "secciones"}.`);
  };

  const handleInsertContextCard = (title: string, description: string, preferQa = false) => {
    if (!activeSection) return;
    setStatusError(null);
    const isQaSection = activeSection.type === "faq" || activeSection.type === "objections";
    const entry = isQaSection || preferQa
      ? {
          q: title.endsWith("?") ? title : `¿${title}?`,
          a: description || "Respuesta respaldada por el análisis del proyecto.",
        }
      : {
          name: title || "Punto del proyecto",
          description: description || title,
        };
    commitDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) => (i === activeIndex ? { ...s, items: [...(activeSection.items ?? []), entry] } : s)),
    }));
    setStatusMessage(`Insertado en la sección #${activeIndex + 1} (${CANONICAL_LANDING_LABELS[activeSection.type as CanonicalLandingBlockType] ?? activeSection.type}).`);
  };

  const handleSaveDraft = async () => {
    if (readOnly) return;
    setStatusError(null);
    setStatusMessage(null);
    if (!draft.pageName.trim()) {
      setStatusError("Define el nombre de la página antes de guardar.");
      return;
    }
    setLocalSaving(true);
    try {
      const ok = await onSave(structuredClone(draft));
      if (ok === false) {
        setStatusError("El servidor no aceptó el borrador. Revisa que todas las preguntas y secciones estén completas.");
      } else {
        onApplyToEditor?.(structuredClone(draft));
        setStatusMessage("Borrador guardado en Hallazia correctamente (tu versión aprobada vigente sigue protegida).");
        onClose();
      }
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "No se pudo guardar el borrador en Hallazia.");
    } finally {
      setLocalSaving(false);
    }
  };

  const handleUploadSectionImage = (idx: number, file: File) => {
    const sec = draft.sections[idx];
    if (!sec) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setStatusError("Usa PNG, JPEG o WebP para subir imágenes.");
      return;
    }
    setBusyImage(true);
    setStatusError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setBusyImage(false);
      setStatusError("No se pudo leer el archivo seleccionado.");
    };
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] ?? "";
      void api
        .uploadProductAsset(projectId, {
          title: file.name.replace(/\.[^.]+$/, ""),
          filename: file.name,
          mimeType: file.type,
          contentBase64: base64,
        })
        .then((asset) => {
          setAssets((prev) => [asset, ...prev]);
          updateSection(idx, {
            imageUrl: asset.url,
            imageAlt: sec.imageAlt?.trim() || asset.title.slice(0, 240),
          });
          setStatusMessage("Imagen subida y asignada a la sección.");
        })
        .catch((err) => setStatusError(err instanceof Error ? err.message : "Error al subir imagen."))
        .finally(() => setBusyImage(false));
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateSectionImage = async (idx: number) => {
    const sec = draft.sections[idx];
    if (!sec || imagePrompt.trim().length < 12) return;
    setBusyImage(true);
    setStatusError(null);
    try {
      const asset = await api.generateLandingImage(projectId, {
        title: `Studio · ${sec.headline || sec.type}`.slice(0, 160),
        prompt: imagePrompt.trim(),
        aspectRatio: "16:9",
      });
      setAssets((prev) => [asset, ...prev]);
      updateSection(idx, {
        imageUrl: asset.url,
        imageAlt: sec.imageAlt?.trim() || imagePrompt.trim().slice(0, 240),
      });
      setImagePrompt("");
      setStatusMessage("Imagen generada con Gemini y aplicada al bloque.");
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : "Gemini no pudo generar la imagen.");
    } finally {
      setBusyImage(false);
    }
  };

  const handleCopyFramer = async () => {
    const code = renderLandingFramerCode(draft);
    try {
      await navigator.clipboard.writeText(code);
      setCopiedFramer(true);
      setStatusMessage("Código Framer (.tsx) copiado al portapapeles.");
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedFramer(false), 2200);
    } catch {
      triggerFileDownload("LandingFramer.tsx", code, "text/typescript;charset=utf-8");
      setStatusMessage("Portapapeles no disponible; se descargó LandingFramer.tsx.");
    }
  };

  const applyThemePreset = (themeKey: string) => {
    const foundPreset = STUDIO_THEME_PRESETS.find((p) => p.id === themeKey);
    const preset = foundPreset?.tokens ?? LANDING_THEME_PRESETS[themeKey];
    if (!preset) return;
    commitDraft((prev) => ({
      ...prev,
      designTokens: { ...prev.designTokens, ...preset },
    }));
    setStatusMessage(`Paleta «${foundPreset?.label ?? themeKey}» aplicada.`);
  };

  const handleToggleVariant = (nextVariant: StudioVariant) => {
    setVariant(nextVariant);
    commitDraft((prev) => applyVariantToLanding(prev, nextVariant, context));
    setStatusMessage(
      nextVariant === "A"
        ? "Variante A activada: Venta Directa orientada a oferta y conversión."
        : "Variante B activada: Storytelling Emocional conectado al avatar.",
    );
  };

  const handleInjectRealPhotos = async () => {
    setStatusError(null);
    let available = studioAssets;
    if (!available.length && typeof api.studioAssets === "function") {
      try {
        const res = await api.studioAssets();
        available = res.assets ?? [];
        setStudioAssets(available);
      } catch {
        available = [];
      }
    }
    if (!available.length) {
      setStatusError("No se encontraron fotografías en /api/studio-assets. Verifica que el backend esté activo.");
      return;
    }
    const { value: updated, count } = injectRealPhotosIntoLanding(draft, available);
    if (count === 0) {
      setStatusMessage("Las secciones ya conservan imágenes subidas del proyecto o no requieren reemplazo.");
      return;
    }
    commitDraft(updated);
    setStatusMessage(`🖼️ ${count} fotografías reales inyectadas automáticamente según el rol de cada sección.`);
  };

  const handleInsertSpecialBlock = (kind: SpecialBlockKind) => {
    setStatusError(null);
    const usedIds = draft.sections.flatMap((s) => (typeof s.id === "string" ? [s.id] : []));
    const created = buildSpecialConversionSection(kind, usedIds, context);
    const footerIndex = draft.sections.findIndex((s) => s.type === "footer");
    const insertAt = footerIndex >= 0 ? footerIndex : draft.sections.length;
    commitDraft((prev) => ({
      ...prev,
      sections: [...prev.sections.slice(0, insertAt), created, ...prev.sections.slice(insertAt)],
    }));
    setStudioMode("landing");
    setActiveIndex(insertAt);
    setStatusMessage(`Bloque especial «${created.headline || created.type}» insertado en la posición #${insertAt + 1}.`);
  };

  const copilotDirectives: Record<CopilotActionKey, string> = {
    persuasive: "Reescribe con máxima persuasión, beneficios tangibles, urgencia ética y CTAs claros sin inventar garantías falsas.",
    scientific: "Refuerza el rigor metodológico, pasos verificables y diferenciación con tono experto y límites claros.",
    urgent: "Enfoca la oferta, entregables, bonos y llamados a la acción con máxima claridad de valor y decisión inmediata.",
    storytelling: "Aplica narrativa empática en primera/segunda persona conectando los dolores cotidianos del avatar con la transformación.",
  };

  const handleCopilotAction = async (action: CopilotActionKey) => {
    setStatusError(null);
    if (copilotLiveAi && typeof api.runLandingStudioAi === "function") {
      if (generatingAi) return;
      setGeneratingAi(true);
      setStatusMessage(`Ejecutando Copiloto con ${selectedProvider.toUpperCase()}…`);
      try {
        const response = await api.runLandingStudioAi(projectId, {
          provider: selectedProvider,
          mode: "polish_copy",
          prompt: copilotDirectives[action],
          currentDraft: fromLanding({}, draft),
          ...(selectedVersionId ? { sourceVersionId: selectedVersionId } : {}),
        });
        const nextValue = withStableLandingSectionIds(toLanding(response.outputData));
        commitDraft(nextValue);
        setLastAiMeta({
          provider: response.provider,
          model: response.model,
          grade: response.quality?.grade,
          score: response.quality?.score,
          passes: response.passes,
        });
        setStatusMessage(`🪄 Copiloto (${response.provider}) aplicó «${action}» manteniendo el lienzo editable.`);
        return;
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "No se pudo ejecutar Copiloto con el proveedor IA.");
        return;
      } finally {
        setGeneratingAi(false);
      }
    }
    const { value: updated, label } = applyCopilotSuperpowerToLanding(draft, action, context);
    commitDraft(updated);
    setStatusMessage(`🪄 Copiloto PRO: ${label}.`);
  };

  const handleCopilotCustomSubmit = async () => {
    const trimmed = copilotInput.trim();
    if (!trimmed) return;
    setStatusError(null);
    if (copilotLiveAi && typeof api.runLandingStudioAi === "function") {
      if (generatingAi) return;
      setGeneratingAi(true);
      setStatusMessage(`Aplicando instrucción de Copiloto con ${selectedProvider.toUpperCase()}…`);
      try {
        const response = await api.runLandingStudioAi(projectId, {
          provider: selectedProvider,
          mode: "polish_copy",
          prompt: trimmed,
          currentDraft: fromLanding({}, draft),
          ...(selectedVersionId ? { sourceVersionId: selectedVersionId } : {}),
        });
        const nextValue = withStableLandingSectionIds(toLanding(response.outputData));
        commitDraft(nextValue);
        setLastAiMeta({
          provider: response.provider,
          model: response.model,
          grade: response.quality?.grade,
          score: response.quality?.score,
          passes: response.passes,
        });
        setCopilotInput("");
        setStatusMessage(`🪄 Instrucción aplicada con ${response.provider} (${response.model}).`);
        return;
      } catch (error) {
        setStatusError(error instanceof Error ? error.message : "El proveedor IA no pudo aplicar la instrucción.");
        return;
      } finally {
        setGeneratingAi(false);
      }
    }
    const { value: updated, summary } = applyContextualPromptToLanding(draft, trimmed, context);
    commitDraft(updated);
    setPromptChanges(summary);
    setCopilotInput("");
    setStatusMessage("🪄 Instrucción aplicada localmente al lienzo y guardada en Deshacer.");
  };

  const handleSyncFunnelToLanding = () => {
    setStatusError(null);
    const checkoutStep = funnelContext.nodes.find((n) => /checkout|offer|venta|oferta|upsell/i.test(n.stage) || /checkout|oferta/i.test(n.name));
    commitDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) => {
        if (sec.type === "offer" || sec.type === "cta") {
          const enriched = enrichLandingSectionFromContext(sec, context);
          return {
            ...enriched,
            ...(checkoutStep?.name ? { eyebrow: `FUNNEL · ${checkoutStep.name.slice(0, 36).toUpperCase()}` } : {}),
            ...(context.offer.cta ? { cta: context.offer.cta } : {}),
          };
        }
        return sec;
      }),
    }));
    setStudioMode("landing");
    setStatusMessage("Embudo sincronizado: Oferta y botones CTA actualizados en la Landing.");
  };

  const galleryCategories = useMemo(() => {
    const cats = Array.from(new Set(studioAssets.map((a) => a.category)));
    return ["all", ...cats];
  }, [studioAssets]);

  const filteredGalleryAssets = useMemo(
    () => (galleryCategory === "all" ? studioAssets : studioAssets.filter((a) => a.category === galleryCategory)),
    [studioAssets, galleryCategory],
  );

  const ebookData = useMemo(() => {
    const hero = draft.sections.find((s) => s.type === "hero") ?? draft.sections[0];
    const title = finalProductContext.title || context.product.name || draft.pageName || "Guía Digital Hallazia";
    const subtitle = context.product.promise || context.offer.promise || hero?.subheadline || "";
    const coverImageUrl = hero?.imageUrl || studioAssets.find((a) => a.id === "guide" || a.id === "bundle")?.url || "";
    const chapters = finalProductContext.chapters.length
      ? finalProductContext.chapters
      : context.product.modules.map((mod) => ({
          title: mod.name,
          content: mod.outcome || "Capítulo estructurado desde la arquitectura del producto en Hallazia.",
        }));
    const checklist = finalProductContext.checklist.length
      ? finalProductContext.checklist
      : context.product.checklists;
    const workbook = finalProductContext.workbook.length
      ? finalProductContext.workbook
      : context.product.templates;
    return {
      title,
      subtitle,
      ...(coverImageUrl ? { coverImageUrl } : {}),
      chapters,
      checklist,
      workbook,
      ...(finalProductContext.conclusion ? { conclusion: finalProductContext.conclusion } : {}),
    };
  }, [finalProductContext, context, draft, studioAssets]);

  const inspectedCodeSpec = useMemo(() => {
    if (!showCodeModal) return null;
    if (codeTab === "tsx") {
      return {
        filename: "LandingFramer.tsx",
        mime: "text/typescript;charset=utf-8",
        code: renderLandingFramerCode(draft),
      };
    }
    if (codeTab === "html") {
      return {
        filename: `${(draft.pageName || "landing-hallazia").toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "landing"}.html`,
        mime: "text/html;charset=utf-8",
        code: renderLandingHtml(fromLanding({}, draft)),
      };
    }
    if (codeTab === "csv") {
      return {
        filename: "framer-cms-import.csv",
        mime: "text/csv;charset=utf-8",
        code: renderFramerCmsCsv(draft, context),
      };
    }
    if (codeTab === "tokens") {
      return {
        filename: "landing-figma-tokens.json",
        mime: "application/json;charset=utf-8",
        code: renderFigmaTokensJson(draft),
      };
    }
    return {
      filename: "landing-figma-artboard.svg",
      mime: "image/svg+xml;charset=utf-8",
      code: renderLandingFigmaSvg(draft),
    };
  }, [showCodeModal, codeTab, draft, context]);

  const handleCopyInspectedCode = async () => {
    if (!inspectedCodeSpec) return;
    try {
      await navigator.clipboard.writeText(inspectedCodeSpec.code);
      setCopiedCodeModal(true);
      setStatusMessage(`Código (${inspectedCodeSpec.filename}) copiado al portapapeles.`);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopiedCodeModal(false), 2200);
    } catch {
      triggerFileDownload(inspectedCodeSpec.filename, inspectedCodeSpec.code, inspectedCodeSpec.mime);
      setStatusMessage(`Portapapeles no disponible; se descargó ${inspectedCodeSpec.filename}.`);
    }
  };

  const loadedModulesCount = Object.keys(context.versions).length;
  const isBusy = saving || localSaving || generatingAi;

  return createPortal(
    <div className={`hl-studio-overlay ${presentationMode ? "is-presentation" : ""}`} role="dialog" aria-modal="true" aria-label="Hallazia Creative Studio PRO">
      {presentationMode && (
        <button
          type="button"
          className="hl-studio-presentation-exit"
          onClick={() => setPresentationMode(false)}
          aria-label="Salir de Modo Presentación"
        >
          <X size={15} /> Salir de Presentación (Esc)
        </button>
      )}
      <header className="hl-studio-topbar">
        <div className="hl-studio-topbar__brand">
          <span className="hl-studio-badge">
            <Sparkles size={13} aria-hidden="true" /> STUDIO PRO · {lastAiMeta ? lastAiMeta.provider.toUpperCase() : "IA + CONTEXTO"}
          </span>
          <input
            aria-label="Nombre de la Landing en Studio PRO"
            className="hl-studio-title-input"
            value={draft.pageName}
            onChange={(e) => setDraft((prev) => ({ ...prev, pageName: e.target.value }))}
            placeholder="Título de la Landing..."
          />
          <span
            className={`hl-studio-health-chip ${diagnostics.score >= 85 ? "is-good" : "is-warn"}`}
            title="Puntuación estructural y de conversión"
          >
            {diagnostics.score}% Salud
          </span>
          <div className="hl-studio-segmented" role="group" aria-label="Modo de estudio">
            <button type="button" className={studioMode === "landing" ? "is-active" : ""} onClick={() => setStudioMode("landing")} title="Editor visual de Landing">
              <Globe size={14} /> <span>Landing Page</span>
            </button>
            <button type="button" className={studioMode === "ebook" ? "is-active" : ""} onClick={() => setStudioMode("ebook")} title="Vista Editorial del Ebook e Impresión PDF">
              <BookOpen size={14} /> <span>Ebook Editorial</span>
            </button>
            <button type="button" className={studioMode === "funnel" ? "is-active" : ""} onClick={() => setStudioMode("funnel")} title="Embudo comercial conectado al proyecto">
              <TrendingUp size={14} /> <span>Funnel 1-Click</span>
            </button>
          </div>
        </div>

        <div className="hl-studio-topbar__controls">
          <div className="hl-studio-segmented" role="group" aria-label="Historial">
            <button type="button" disabled={!historyPast.length || isBusy} onClick={handleUndo} title="Deshacer (Ctrl+Z)">
              <Undo2 size={14} /> <span>Deshacer</span>
            </button>
            <button type="button" disabled={!historyFuture.length || isBusy} onClick={handleRedo} title="Rehacer (Ctrl+Y)">
              <Redo2 size={14} /> <span>Rehacer</span>
            </button>
          </div>
          {studioMode === "landing" && (
            <>
              <div className="hl-studio-segmented" role="group" aria-label="Vista responsive">
                <button type="button" className={viewport === "desktop" ? "is-active" : ""} onClick={() => setViewport("desktop")} title="Escritorio">
                  <Monitor size={14} /> <span>Desktop</span>
                </button>
                <button type="button" className={viewport === "tablet" ? "is-active" : ""} onClick={() => setViewport("tablet")} title="Tablet">
                  <Tablet size={14} /> <span>Tablet</span>
                </button>
                <button type="button" className={viewport === "mobile" ? "is-active" : ""} onClick={() => setViewport("mobile")} title="Móvil">
                  <Smartphone size={14} /> <span>Móvil</span>
                </button>
              </div>
              <div className="hl-studio-segmented" role="group" aria-label="Variante A/B">
                <button type="button" className={variant === "A" ? "is-active" : ""} onClick={() => handleToggleVariant("A")} title="Orientado a oferta y conversión directa">
                  <span>⚡ Directa (A)</span>
                </button>
                <button type="button" className={variant === "B" ? "is-active" : ""} onClick={() => handleToggleVariant("B")} title="Narrativa empática conectada al avatar">
                  <span>📖 Storytelling (B)</span>
                </button>
              </div>
            </>
          )}

          <div className="hl-studio-exporters" role="group" aria-label="Exportadores">
            <button
              type="button"
              className="hl-studio-btn"
              onClick={() => setShowCodeModal(true)}
              title="Inspeccionar TSX, HTML5, CSV, Design Tokens y Figma SVG en vivo"
            >
              <Eye size={14} /> Código
            </button>
            <button
              type="button"
              className="hl-studio-btn"
              onClick={() => {
                triggerFileDownload("LandingFramer.tsx", renderLandingFramerCode(draft), "text/typescript;charset=utf-8");
                setStatusMessage("Exportado LandingFramer.tsx con PropertyControls para Framer.");
              }}
              title="Descargar componente editable para Framer"
            >
              <Code2 size={14} /> Framer .tsx
            </button>
            <button type="button" className="hl-studio-btn" onClick={() => void handleCopyFramer()} title="Copiar código para pegar en Framer">
              {copiedFramer ? <Check size={14} /> : <Copy size={14} />} {copiedFramer ? "Copiado" : "Copiar Framer"}
            </button>
            <button
              type="button"
              className="hl-studio-btn"
              onClick={() => {
                triggerFileDownload("landing-figma-artboard.svg", renderLandingFigmaSvg(draft), "image/svg+xml;charset=utf-8");
                setStatusMessage("Exportado artboard vectorial .svg para arrastrar a Figma.");
              }}
              title="Descargar Artboard SVG editable en Figma"
            >
              <Layers size={14} /> Figma .svg
            </button>
            <button
              type="button"
              className="hl-studio-btn"
              onClick={() => {
                triggerFileDownload("landing-figma-tokens.json", renderFigmaTokensJson(draft), "application/json;charset=utf-8");
                setStatusMessage("Exportados Design Tokens JSON para Figma.");
              }}
              title="Descargar variables de diseño JSON"
            >
              <Palette size={14} /> Tokens
            </button>
            <button
              type="button"
              className="hl-studio-btn"
              onClick={() => {
                triggerFileDownload("framer-cms-import.csv", renderFramerCmsCsv(draft, context), "text/csv;charset=utf-8");
                setStatusMessage("Exportado dataset framer-cms-import.csv para Framer CMS.");
              }}
              title="Descargar archivo CSV listo para importar en Framer CMS"
            >
              📊 CMS .csv
            </button>
            <button type="button" className="hl-studio-btn" onClick={() => void onExportHtml(draft)}>
              <Download size={14} /> HTML
            </button>
            <button type="button" className="hl-studio-btn" onClick={() => onExportReact(draft)}>
              <FileCode2 size={14} /> React
            </button>
          </div>

          <div className="hl-studio-actions">
            {onApplyToEditor && (
              <button
                type="button"
                className="hl-studio-btn"
                disabled={readOnly || isBusy}
                onClick={() => {
                  onApplyToEditor(structuredClone(draft));
                  onClose();
                }}
                title="Pasa los cambios al editor de Hallazia sin guardar aún en SQLite"
              >
                Aplicar al editor
              </button>
            )}
            <button
              type="button"
              className="hl-studio-btn hl-studio-btn--primary"
              disabled={readOnly || isBusy}
              onClick={() => void handleSaveDraft()}
            >
              <Save size={14} /> {isBusy ? "Guardando…" : "Guardar borrador en Hallazia"}
            </button>
            <button type="button" className="hl-studio-btn hl-studio-btn--close" onClick={onClose} aria-label="Cerrar Studio PRO">
              <X size={16} /> Cerrar
            </button>
          </div>
        </div>
      </header>

      {(statusMessage || statusError || readOnly) && (
        <div className={`hl-studio-banner ${statusError ? "is-error" : "is-info"}`} role={statusError ? "alert" : "status"}>
          <span>
            {statusError ||
              statusMessage ||
              "Vista de solo lectura (versión histórica u obsoleta). Puedes diseñar y exportar, pero para guardar selecciona una versión vigente."}
          </span>
          {(statusError || statusMessage) && (
            <button type="button" onClick={() => { setStatusMessage(null); setStatusError(null); }} aria-label="Ocultar aviso">
              ×
            </button>
          )}
        </div>
      )}

      <div className="hl-studio-workspace">
        <aside className="hl-studio-sidebar" aria-label="Cerebro Contextual y Prompt">
          <section className="hl-studio-card">
            <div className="hl-studio-card__head">
              <strong>
                <Database size={14} aria-hidden="true" /> Contexto conectado a Hallazia
              </strong>
              <button type="button" className="hl-studio-mini-btn" disabled={loadingContext} onClick={() => void loadContext()} title="Recargar datos reales del proyecto">
                <RefreshCw size={12} /> {loadingContext ? "…" : `${loadedModulesCount}/7`}
              </button>
            </div>
            <div className="hl-studio-context-pills">
              {([
                ["problems", "Problemas"],
                ["avatar", "Avatar"],
                ["mechanism", "Mecanismo"],
                ["beliefs", "Creencias"],
                ["product", "Producto"],
                ["offer", "Oferta"],
              ] as const).map(([key, label]) => {
                const ver = context.versions[key];
                return (
                  <span key={key} className={`hl-studio-pill ${ver ? "is-ready" : ""}`} title={ver ? `v${ver.versionNumber} · ${ver.status}` : "Sin versión cargada"}>
                    {label} {ver ? `v${ver.versionNumber}` : "—"}
                  </span>
                );
              })}
            </div>
          </section>

          <section className="hl-studio-card">
            <div className="hl-studio-card__head">
              <strong className="hl-studio-label">
                <Cpu size={14} aria-hidden="true" /> Motor IA + Prompt PRO
              </strong>
              <span className="hl-studio-mini-tag">
                {generatingAi
                  ? "Generando…"
                  : lastAiMeta
                    ? `${lastAiMeta.provider}${lastAiMeta.grade ? ` · ${lastAiMeta.grade} (${lastAiMeta.score ?? "—"})` : ""}${lastAiMeta.passes ? ` · ${lastAiMeta.passes}p` : ""}`
                    : "No rompe v11"}
              </span>
            </div>

            <label className="hl-studio-field-label">
              Proveedor LLM activo
              <select
                aria-label="Proveedor IA en Studio PRO"
                value={selectedProvider}
                disabled={isBusy}
                onChange={(e) => setSelectedProvider(e.target.value as GenerationProvider)}
              >
                <option value="deepseek" disabled={providerStatus !== null && !providerStatus.deepseek?.configured}>
                  DeepSeek ({providerStatus?.deepseek?.model ?? "deepseek-flash"}){providerStatus?.deepseek?.configured ? " · Listo" : ""}
                </option>
                <option value="gemini" disabled={providerStatus !== null && !providerStatus.gemini?.configured}>
                  Gemini ({providerStatus?.gemini?.powerfulModel ?? "gemini-3.5-flash-lite"}){providerStatus?.gemini?.configured ? " · Listo" : ""}
                </option>
                <option value="groq" disabled={!providerStatus?.groq?.configured}>
                  Groq ({providerStatus?.groq?.model ?? "qwen3"}){providerStatus?.groq?.configured ? " · Listo" : " · Sin clave"}
                </option>
                <option value="openrouter" disabled={!providerStatus?.openrouter?.configured}>
                  OpenRouter ({providerStatus?.openrouter?.model ?? "free"}){providerStatus?.openrouter?.configured ? " · Listo" : " · Sin clave"}
                </option>
                <option value="openai" disabled={!providerStatus?.openai?.configured}>
                  OpenAI ({providerStatus?.openai?.powerfulModel ?? "gpt-5"}){providerStatus?.openai?.configured ? " · Listo" : " · Sin clave"}
                </option>
                <option value="mock">Motor Contextual Local (Sin API)</option>
              </select>
            </label>

            <div className="hl-studio-presets-row" aria-label="Plantillas rápidas de prompt">
              {STUDIO_PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="hl-studio-pill-btn"
                  onClick={() => setPromptInput(preset.prompt)}
                  title={preset.prompt}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <label className="hl-studio-label" htmlFor="hl-studio-prompt-input">
              <Wand2 size={14} aria-hidden="true" /> Instrucción para crear o editar la página
            </label>
            <textarea
              id="hl-studio-prompt-input"
              rows={4}
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ej.: Crea una landing completa oscura tipo Framer con 6 dolores reales, pasos del mecanismo, oferta detallada y FAQ en tarjetas Q&A..."
            />
            <div className="hl-studio-stack-btns">
              <button
                type="button"
                className="hl-studio-btn hl-studio-btn--accent"
                disabled={isBusy}
                onClick={() => void handleRunStudioAi("full_page")}
              >
                <Sparkles size={14} /> {generatingAi ? "Creando Landing Completa…" : `Generar Página Completa (${selectedProvider.toUpperCase()})`}
              </button>
              <div className="hl-studio-two-col">
                <button
                  type="button"
                  className="hl-studio-btn"
                  disabled={isBusy || !activeSection}
                  onClick={() => void handleRunStudioAi("section", activeIndex)}
                  title="Reescribe con IA solamente la sección seleccionada"
                >
                  🎯 Reescribir #{activeIndex + 1}
                </button>
                <button
                  type="button"
                  className="hl-studio-btn"
                  disabled={isBusy}
                  onClick={() => void handleRunStudioAi("polish_copy")}
                  title="Mejora titulares, cuerpo y tarjetas de toda la landing"
                >
                  🪄 Pulir Copy IA
                </button>
              </div>
              <button type="button" className="hl-studio-btn" disabled={isBusy} onClick={handleApplyPrompt}>
                ⚡ Reglas Rápidas Instantáneas
              </button>
              {onRegenerate && (
                <button
                  type="button"
                  className="hl-studio-btn"
                  disabled={readOnly || isBusy}
                  onClick={() => {
                    onClose();
                    void onRegenerate(promptInput.trim() || undefined);
                  }}
                  title="Ejecuta el módulo oficial del workflow (afecta árbol de versiones)"
                >
                  🚀 Regenerar módulo oficial
                </button>
              )}
            </div>
            {promptChanges.length > 0 && (
              <ul className="hl-studio-changelog">
                {promptChanges.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="hl-studio-card">
            <div className="hl-studio-card__head">
              <strong className="hl-studio-label">
                {diagnostics.issues.length ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />} Calidad PRO ({diagnostics.score}% · Grado {diagnostics.grade})
              </strong>
              <span className="hl-studio-mini-tag">{diagnostics.visibleCount}/{diagnostics.totalCount} visibles</span>
            </div>
            <p className="hl-studio-muted">
              {diagnostics.metrics.layouts} diseños · {diagnostics.metrics.images} fotos · {diagnostics.metrics.ctas} CTAs · {diagnostics.metrics.words} palabras
            </p>
            {diagnostics.issues.length === 0 ? (
              <p className="hl-studio-muted">✓ Estructura completa, FAQ validable y textos alternativos listos para Hallazia.</p>
            ) : (
              <ul className="hl-studio-issues-list">
                {diagnostics.issues.slice(0, 4).map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="hl-studio-btn hl-studio-btn--primary"
              disabled={isBusy || diagnostics.issues.length === 0}
              onClick={handleAutoFixAll}
            >
              <Wrench size={14} /> Auto-Corregir Todo
            </button>
          </section>

          <section className="hl-studio-card">
            <strong className="hl-studio-label">Acciones de 1 clic con tu investigación</strong>
            <div className="hl-studio-quick-actions">
              <button type="button" onClick={handleStructureFaq}>
                🧩 Estructurar FAQ en tarjetas Q&amp;A
              </button>
              <button type="button" disabled={!context.loaded} onClick={() => handleSyncGroup(["problem", "agitation"], "Problemas reales")}>
                🔥 Inyectar Problemas y Dolores
              </button>
              <button type="button" disabled={!context.loaded} onClick={() => handleSyncGroup(["mechanism"], "Mecanismo")}>
                ⚙️ Sincronizar Pasos del Mecanismo
              </button>
              <button
                type="button"
                disabled={!context.loaded}
                onClick={() => handleSyncGroup(["product", "deliverables", "bonuses", "offer", "guarantee"], "Producto y Oferta")}
              >
                📦 Sincronizar Producto y Oferta
              </button>
              <button
                type="button"
                disabled={!context.loaded}
                onClick={() => {
                  commitDraft((prev) => ({
                    ...prev,
                    sections: prev.sections.map((s) => enrichLandingSectionFromContext(s, context)),
                  }));
                  setStatusMessage("Todas las secciones se enriquecieron con las versiones activas del proyecto.");
                }}
              >
                ✨ Enriquecer toda la Landing
              </button>
              <button
                type="button"
                onClick={() => void handleInjectRealPhotos()}
                title="Asigna fotografías reales del estudio a cada bloque según su función"
              >
                🖼️ Inyectar Fotos Reales ({studioAssets.length})
              </button>
            </div>
          </section>

          <section className="hl-studio-card">
            <strong className="hl-studio-label">Bloques de Alta Conversión (1 Clic)</strong>
            <div className="hl-studio-quick-actions">
              <button type="button" onClick={() => handleInsertSpecialBlock("comparison")}>
                📊 Comparativa Antes vs Después
              </button>
              <button type="button" onClick={() => handleInsertSpecialBlock("pricing_tiers")}>
                💎 3 Niveles de Valor
              </button>
              <button type="button" onClick={() => handleInsertSpecialBlock("authority")}>
                👨‍🏫 Autoridad y Evidencia
              </button>
              <button type="button" onClick={() => handleInsertSpecialBlock("urgency_cta")}>
                ⏰ Cierre y Llamado a la Acción
              </button>
            </div>
          </section>

          <section className="hl-studio-card">
            <strong className="hl-studio-label">Estética, Tokens y Checkout en vivo</strong>
            <div className="hl-studio-theme-grid">
              {STUDIO_THEME_PRESETS.map((preset) => {
                const isActive =
                  tokens.theme === preset.tokens.theme &&
                  tokens.accent.toLowerCase() === preset.tokens.accent.toLowerCase() &&
                  tokens.background.toLowerCase() === preset.tokens.background.toLowerCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`hl-studio-pill-btn ${isActive ? "is-active" : ""}`}
                    onClick={() => applyThemePreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="hl-studio-colors-row">
              <label>
                Acento
                <input
                  type="color"
                  value={tokens.accent}
                  onChange={(e) => setDraft((p) => ({ ...p, designTokens: { ...tokens, accent: e.target.value } }))}
                />
              </label>
              <label>
                Fondo
                <input
                  type="color"
                  value={tokens.background}
                  onChange={(e) => setDraft((p) => ({ ...p, designTokens: { ...tokens, background: e.target.value } }))}
                />
              </label>
              <label>
                Texto
                <input
                  type="color"
                  value={tokens.text}
                  onChange={(e) => setDraft((p) => ({ ...p, designTokens: { ...tokens, text: e.target.value } }))}
                />
              </label>
            </div>
            <div className="hl-studio-tokens-selects">
              <label>
                Fuente
                <select
                  value={tokens.font}
                  onChange={(e) => setDraft((p) => ({ ...p, designTokens: { ...tokens, font: e.target.value === "serif" ? "serif" : "sans" } }))}
                >
                  <option value="sans">Sans</option>
                  <option value="serif">Serif</option>
                </select>
              </label>
              <label>
                Ancho
                <select
                  value={tokens.width}
                  onChange={(e) => setDraft((p) => ({ ...p, designTokens: { ...tokens, width: e.target.value === "wide" ? "wide" : "compact" } }))}
                >
                  <option value="compact">Compacto</option>
                  <option value="wide">Amplio</option>
                </select>
              </label>
              <label>
                Espaciado
                <select
                  value={tokens.spacing}
                  onChange={(e) => setDraft((p) => ({ ...p, designTokens: { ...tokens, spacing: e.target.value === "compact" ? "compact" : "relaxed" } }))}
                >
                  <option value="relaxed">Amplio</option>
                  <option value="compact">Compacto</option>
                </select>
              </label>
            </div>
            <div className="hl-studio-checkout-fields">
              <label className="hl-studio-field-label">
                Plataforma de Checkout
                <select
                  aria-label="Plataforma de Checkout"
                  value={draft.externalCheckout?.platform ?? "none"}
                  onChange={(e) => {
                    const platform = e.target.value as "none" | "hotmart" | "skool" | "custom";
                    const existingUrl = draft.externalCheckout?.checkoutUrl ?? "";
                    setDraft((p) => ({
                      ...p,
                      externalCheckout: platform === "none" ? { platform } : { platform, checkoutUrl: existingUrl },
                    }));
                  }}
                >
                  <option value="none">Sin checkout externo</option>
                  <option value="hotmart">Hotmart</option>
                  <option value="skool">Skool</option>
                  <option value="custom">URL HTTPS personalizada</option>
                </select>
              </label>
              {(draft.externalCheckout?.platform ?? "none") !== "none" && (
                <label className="hl-studio-field-label">
                  URL HTTPS del Checkout
                  <input
                    type="url"
                    aria-label="URL del Checkout"
                    placeholder="https://pay.hotmart.com/..."
                    value={draft.externalCheckout?.checkoutUrl ?? ""}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        externalCheckout: { platform: p.externalCheckout?.platform ?? "custom", checkoutUrl: e.target.value },
                      }))
                    }
                  />
                </label>
              )}
              <label className="hl-studio-field-label">
                Nota legal / Pie institucional
                <input
                  type="text"
                  aria-label="Nota al pie de la Landing"
                  placeholder="© Todos los derechos reservados…"
                  value={draft.footerNote}
                  onChange={(e) => setDraft((p) => ({ ...p, footerNote: e.target.value }))}
                />
              </label>
            </div>
          </section>

          <section className="hl-studio-card hl-studio-context-browser">
            <strong className="hl-studio-label">Explorador de Evidencias e Ideas del Proyecto</strong>
            <div className="hl-studio-tabs" role="tablist">
              {([
                ["problems", "Problemas"],
                ["avatar", "Avatar"],
                ["mechanism", "Mecanismo"],
                ["offer", "Oferta"],
                ["beliefs", "Objeciones"],
              ] as const).map(([tabKey, tabLabel]) => (
                <button key={tabKey} type="button" role="tab" aria-selected={contextTab === tabKey} onClick={() => setContextTab(tabKey)}>
                  {tabLabel}
                </button>
              ))}
            </div>
            <div className="hl-studio-context-list">
              {!context.loaded ? (
                <p className="hl-studio-muted">Carga o aprueba módulos previos (Problemas, Avatar, Mecanismo, Oferta) para insertarlos aquí.</p>
              ) : (
                <>
                  {contextTab === "problems" &&
                    context.problems.map((p) => (
                      <article key={p.id} className="hl-studio-context-item">
                        <strong>{p.name}</strong>
                        <p>{p.summary}</p>
                        <button type="button" onClick={() => handleInsertContextCard(p.name, p.summary)}>
                          + Insertar en sección #{activeIndex + 1}
                        </button>
                      </article>
                    ))}
                  {contextTab === "avatar" &&
                    [...context.avatar.pains, ...context.avatar.desires, ...context.avatar.language].slice(0, 10).map((entry, idx) => (
                      <article key={idx} className="hl-studio-context-item">
                        <p>{entry}</p>
                        <button type="button" onClick={() => handleInsertContextCard(`Voz del avatar #${idx + 1}`, entry)}>
                          + Insertar en sección #{activeIndex + 1}
                        </button>
                      </article>
                    ))}
                  {contextTab === "mechanism" &&
                    context.mechanism.steps.map((step, idx) => (
                      <article key={idx} className="hl-studio-context-item">
                        <strong>Paso {idx + 1}</strong>
                        <p>{step}</p>
                        <button type="button" onClick={() => handleInsertContextCard(`Paso ${idx + 1}`, step)}>
                          + Insertar en sección #{activeIndex + 1}
                        </button>
                      </article>
                    ))}
                  {contextTab === "offer" &&
                    [
                      ...context.offer.benefits.map((b, i) => ({ title: `Beneficio ${i + 1}`, desc: b })),
                      ...context.offer.deliverables.map((d, i) => ({ title: `Entregable ${i + 1}`, desc: d })),
                      ...context.offer.bonuses.map((b) => ({ title: b.name || "Bono", desc: b.description || b.name })),
                    ].map((item, idx) => (
                      <article key={idx} className="hl-studio-context-item">
                        <strong>{item.title}</strong>
                        <p>{item.desc}</p>
                        <button type="button" onClick={() => handleInsertContextCard(item.title, item.desc)}>
                          + Insertar en sección #{activeIndex + 1}
                        </button>
                      </article>
                    ))}
                  {contextTab === "beliefs" &&
                    (context.beliefs.objections.length ? context.beliefs.objections : context.avatar.objections).map((obj, idx) => {
                      const arg = context.beliefs.arguments[idx] || context.beliefs.bridgeBeliefs[idx] || "Criterio explicado dentro de la guía.";
                      return (
                        <article key={idx} className="hl-studio-context-item">
                          <strong>{obj}</strong>
                          <p>{arg}</p>
                          <button type="button" onClick={() => handleInsertContextCard(obj, arg, true)}>
                            + Insertar Q&amp;A en sección #{activeIndex + 1}
                          </button>
                        </article>
                      );
                    })}
                </>
              )}
            </div>
          </section>
        </aside>

        <main className="hl-studio-canvas-stage" aria-label="Lienzo visual editable de la Landing">
          <div className="hl-studio-canvas-toolbar">
            <div className="hl-studio-canvas-toolbar__left">
              {studioMode === "landing" ? (
                <>
                  <div className="hl-studio-segmented" role="group" aria-label="Zoom del lienzo">
                    {([1, 0.85, 0.7] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        className={zoom === level ? "is-active" : ""}
                        onClick={() => setZoom(level)}
                      >
                        {Math.round(level * 100)}%
                      </button>
                    ))}
                  </div>
                  <span className="hl-studio-variant-chip">
                    {variant === "A" ? "⚡ Variante A · Directa" : "📖 Variante B · Storytelling"}
                  </span>
                </>
              ) : (
                <button type="button" className="hl-studio-btn" onClick={() => setStudioMode("landing")}>
                  ← Volver al Lienzo Landing
                </button>
              )}
            </div>
            <div className="hl-studio-canvas-toolbar__right">
              <button
                type="button"
                className="hl-studio-btn"
                onClick={() => setPresentationMode((prev) => !prev)}
                title="Ocultar barras y presentar a pantalla completa (Esc para salir)"
              >
                <Maximize2 size={14} /> Modo Presentación
              </button>
            </div>
          </div>

          {studioMode === "ebook" ? (
            <div className="hl-studio-ebook-view">
              <div className="hl-studio-ebook-actions">
                <button
                  type="button"
                  className="hl-studio-btn hl-studio-btn--primary"
                  onClick={() => {
                    triggerFileDownload("ebook-editorial.html", renderEbookEditorialHtml(ebookData), "text/html;charset=utf-8");
                    setStatusMessage("Ebook editorial exportado como HTML imprimible.");
                  }}
                >
                  <Download size={14} /> Descargar Ebook (.html)
                </button>
                <button
                  type="button"
                  className="hl-studio-btn"
                  onClick={() => printHtmlViaIframe(renderEbookEditorialHtml(ebookData))}
                >
                  <Printer size={14} /> Imprimir / Guardar PDF
                </button>
              </div>
              <article className="hl-studio-ebook-sheet">
                <header className="hl-studio-ebook-cover">
                  <span className="hl-studio-ebook-eyebrow">EDICIÓN EDITORIAL · HALLAZIA STUDIO PRO</span>
                  <h1>{ebookData.title}</h1>
                  {ebookData.subtitle && <p className="hl-studio-ebook-subtitle">{ebookData.subtitle}</p>}
                  {ebookData.coverImageUrl && (
                    <img src={landingImageUrl(ebookData.coverImageUrl)} alt={ebookData.title} className="hl-studio-ebook-cover-img" />
                  )}
                </header>

                {!ebookData.chapters.length && !ebookData.checklist.length ? (
                  <p className="hl-studio-empty">
                    Este proyecto aún no tiene capítulos guardados en Producto o Producto Final. Genera esos módulos primero para previsualizar el libro editorial aquí.
                  </p>
                ) : (
                  <>
                    {ebookData.chapters.length > 0 && (
                      <section className="hl-studio-ebook-section">
                        <h2>Índice de Capítulos ({ebookData.chapters.length})</h2>
                        <ol className="hl-studio-ebook-toc">
                          {ebookData.chapters.map((ch, i) => (
                            <li key={`${ch.title}-${i}`}>
                              <strong>{ch.title}</strong>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}

                    {ebookData.chapters.map((ch, i) => (
                      <section key={`${ch.title}-${i}`} className="hl-studio-ebook-section hl-studio-ebook-chapter">
                        <span className="hl-studio-ebook-eyebrow">CAPÍTULO {i + 1}</span>
                        <h3>{ch.title}</h3>
                        <p>{ch.content || "Capítulo estructurado desde la arquitectura del producto en Hallazia."}</p>
                      </section>
                    ))}

                    {ebookData.checklist.length > 0 && (
                      <section className="hl-studio-ebook-section">
                        <h2>Checklist Práctico</h2>
                        <ul>
                          {ebookData.checklist.map((item, i) => (
                            <li key={i}>☑ {item}</li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {ebookData.workbook.length > 0 && (
                      <section className="hl-studio-ebook-section">
                        <h2>Cuaderno de Trabajo (Workbook)</h2>
                        <ul>
                          {ebookData.workbook.map((item, i) => (
                            <li key={i}>✎ {item}</li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {ebookData.conclusion && (
                      <section className="hl-studio-ebook-section">
                        <h2>Conclusión</h2>
                        <p>{ebookData.conclusion}</p>
                      </section>
                    )}
                  </>
                )}
              </article>
            </div>
          ) : studioMode === "funnel" ? (
            <div className="hl-studio-funnel-view">
              <div className="hl-studio-funnel-header">
                <div>
                  <span className="hl-studio-ebook-eyebrow">ARQUITECTURA DE CONVERSIÓN CONECTADA</span>
                  <h2>Funnel 1-Click de Hallazia</h2>
                  <p>Visualiza el recorrido comercial de este proyecto y sincroniza CTA y oferta directo con la Landing.</p>
                </div>
                <button type="button" className="hl-studio-btn hl-studio-btn--primary" onClick={handleSyncFunnelToLanding}>
                  <RefreshCw size={14} /> Sincronizar Oferta y CTA con la Landing
                </button>
              </div>

              <div className="hl-studio-funnel-grid">
                {(funnelContext.loaded
                  ? funnelContext.nodes
                  : [
                      {
                        id: "stage-traffic",
                        stage: "Captación",
                        name: context.avatar.pains[0] ? `Ángulo de dolor: ${context.avatar.pains[0].slice(0, 72)}` : "Anuncio / Tráfico orgánico",
                        description: "Atrae al lector ideal conectando con un síntoma real detectado en la investigación.",
                      },
                      {
                        id: "stage-landing",
                        stage: "Landing Page",
                        name: draft.pageName || context.product.name || "Página de Ventas Studio PRO",
                        description: context.offer.promise || context.product.promise || "Presenta el mecanismo y los beneficios sin promesas exageradas.",
                      },
                      {
                        id: "stage-checkout",
                        stage: "Checkout Externo",
                        name: draft.externalCheckout?.platform && draft.externalCheckout.platform !== "none"
                          ? `Checkout en ${draft.externalCheckout.platform.toUpperCase()}`
                          : "Oferta y Acceso Digital",
                        description: draft.externalCheckout?.checkoutUrl || context.offer.guarantee || "Configura tu enlace Hotmart, Skool o HTTPS en la barra lateral.",
                        ...(context.offer.pricingAmount
                          ? { price: `${context.offer.pricingAmount} ${context.offer.pricingCurrency}`.trim() }
                          : {}),
                      },
                      {
                        id: "stage-delivery",
                        stage: "Entrega Ebook",
                        name: ebookData.title,
                        description: `${ebookData.chapters.length} capítulos y ${ebookData.checklist.length} checklists listos para el cliente.`,
                      },
                    ]
                ).map((node, index, list) => (
                  <div key={node.id} className="hl-studio-funnel-step-wrap">
                    <article className="hl-studio-funnel-card">
                      <div className="hl-studio-funnel-card__top">
                        <span className="hl-studio-sec-tag">PASO {index + 1} · {node.stage.toUpperCase()}</span>
                        {node.price && <strong className="hl-studio-funnel-price">{node.price}</strong>}
                      </div>
                      <h3>{node.name}</h3>
                      <p>{node.description || "Etapa configurada dentro del embudo del proyecto."}</p>
                    </article>
                    {index < list.length - 1 && <span className="hl-studio-funnel-arrow" aria-hidden="true">→</span>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className={`hl-studio-canvas hl-studio-canvas--${viewport}`}
              style={{
                backgroundColor: tokens.background,
                color: tokens.text,
                fontFamily: tokens.font === "serif" ? "Georgia, Cambria, serif" : "system-ui, -apple-system, sans-serif",
                ["--hl-studio-accent" as string]: tokens.accent,
                ...(zoom === 1 ? {} : { transform: `scale(${zoom})`, transformOrigin: "top center" }),
              }}
            >
            {draft.sections.map((section, idx) => {
              const isHero = section.type === "hero";
              const sectionLayout = resolveLandingLayout(section);
              const allowedLayouts =
                (LANDING_SECTION_LAYOUTS as Record<string, readonly string[] | undefined>)[section.type] ??
                Object.keys(LANDING_LAYOUT_LABELS);
              const sectionBullets = landingTextList(section.bullets, 8);
              const sectionStats = landingStats(section.stats);
              const isCentered =
                sectionLayout === "centered" ||
                sectionLayout === "pricing" ||
                sectionLayout === "stats" ||
                (section.variant === "centered" && sectionLayout !== "split") ||
                ["offer", "cta", "footer"].includes(section.type);
              const isActive = idx === activeIndex;
              const isDarkBg = /^#0|^#1|^#2/i.test(tokens.background);
              const safeImg = section.imageUrl ? landingImageUrl(section.imageUrl) : "";
              const items = Array.isArray(section.items) ? section.items : [];
              const blockLabel = CANONICAL_LANDING_LABELS[section.type as CanonicalLandingBlockType] ?? section.type;

              return (
                <section
                  key={section.id || `${section.type}-${idx}`}
                  onClick={() => setActiveIndex(idx)}
                  className={`hl-studio-section ${isActive ? "is-selected" : ""} ${section.enabled === false ? "is-hidden-block" : ""}`}
                  style={{
                    padding: `${tokens.spacing === "compact" ? 32 : 52}px clamp(20px, 4vw, 48px)`,
                    textAlign: isCentered ? "center" : "left",
                    background: isHero
                      ? `linear-gradient(125deg, ${tokens.background}, ${tokens.accent}22)`
                      : section.type === "offer"
                        ? `${tokens.accent}12`
                        : "transparent",
                    borderBottom: `1px solid ${isDarkBg ? "rgba(148,163,184,0.18)" : "rgba(15,23,42,0.1)"}`,
                  }}
                >
                  <div className="hl-studio-floating-bar" onClick={(e) => e.stopPropagation()} aria-label={`Herramientas de sección ${idx + 1}`}>
                    <span className="hl-studio-sec-tag">
                      #{idx + 1} · {blockLabel}
                    </span>
                    <select
                      className="hl-studio-layout-select"
                      aria-label={`Diseño visual sección ${idx + 1}`}
                      value={sectionLayout}
                      onChange={(e) => updateSection(idx, { layout: e.target.value })}
                      title="Elegir diseño visual del bloque"
                    >
                      {allowedLayouts.map((layoutKey) => (
                        <option key={layoutKey} value={layoutKey}>
                          {LANDING_LAYOUT_LABELS[layoutKey] ?? layoutKey}
                        </option>
                      ))}
                    </select>
                    <button type="button" disabled={idx === 0} onClick={() => moveSection(idx, -1)} title="Subir bloque">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" disabled={idx === draft.sections.length - 1} onClick={() => moveSection(idx, 1)} title="Bajar bloque">
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={!context.loaded && section.type !== "faq"}
                      onClick={() => {
                        setDraft((prev) => ({
                          ...prev,
                          sections: prev.sections.map((s, i) => (i === idx ? enrichLandingSectionFromContext(s, context) : s)),
                        }));
                        setStatusMessage(`Sección #${idx + 1} (${blockLabel}) enriquecida.`);
                      }}
                      title="Sincronizar este bloque con el contexto de Hallazia"
                    >
                      <Sparkles size={13} /> Sincronizar
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSection(idx, { variant: isCentered ? "editorial" : "centered" })}
                      title="Alternar alineación Centrada / Editorial"
                    >
                      {isCentered ? "Editorial" : "Centrar"}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleRunStudioAi("section", idx)}
                      title="Reescribir este bloque con el proveedor IA elegido"
                    >
                      <Wand2 size={13} /> IA Bloque
                    </button>
                    <button type="button" onClick={() => addItemToSection(idx)} title="Añadir tarjeta o pregunta a esta sección">
                      <Plus size={13} /> Elemento
                    </button>
                    <button type="button" onClick={() => setImagePanelIndex(imagePanelIndex === idx ? null : idx)} title="Imagen del bloque">
                      <ImageIcon size={13} /> Imagen
                    </button>
                    <button type="button" onClick={() => duplicateSection(idx)} title="Duplicar sección">
                      <CopyPlus size={13} />
                    </button>
                    <button type="button" onClick={() => toggleSectionEnabled(idx)} title={section.enabled === false ? "Mostrar" : "Ocultar"}>
                      {section.enabled === false ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button type="button" onClick={() => deleteSection(idx)} title="Eliminar sección">
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {imagePanelIndex === idx && (
                    <div className="hl-studio-image-drawer" onClick={(e) => e.stopPropagation()}>
                      <strong>Imagen de sección #{idx + 1}</strong>
                      <div className="hl-studio-image-drawer__grid">
                        <input
                          type="url"
                          aria-label={`URL de imagen sección ${idx + 1}`}
                          placeholder="https://... o /api/projects/..."
                          value={section.imageUrl ?? ""}
                          onChange={(e) =>
                            updateSection(idx, {
                              imageUrl: e.target.value,
                              imageAlt: section.imageAlt?.trim() || (section.headline || section.type || "Imagen").slice(0, 240),
                            })
                          }
                        />
                        <input
                          type="text"
                          aria-label={`Texto alternativo sección ${idx + 1}`}
                          placeholder="Descripción accesible (alt)..."
                          value={section.imageAlt ?? ""}
                          onChange={(e) => updateSection(idx, { imageAlt: e.target.value })}
                        />
                        {assets.length > 0 && (
                          <select
                            aria-label={`Biblioteca sección ${idx + 1}`}
                            value=""
                            onChange={(e) => {
                              const found = assets.find((a) => a.id === e.target.value);
                              if (found) {
                                updateSection(idx, { imageUrl: found.url, imageAlt: section.imageAlt?.trim() || found.title.slice(0, 240) });
                              }
                            }}
                          >
                            <option value="">Elegir de biblioteca del proyecto…</option>
                            {assets.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.title}
                              </option>
                            ))}
                          </select>
                        )}
                        <label className="hl-studio-upload-btn">
                          Subir PNG/JPEG/WebP
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={busyImage}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadSectionImage(idx, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      </div>
                      {imageConfigured && (
                        <div className="hl-studio-image-gen-row">
                          <input
                            type="text"
                            placeholder="Describe una escena para generar con Gemini (mín. 12 caracteres)..."
                            value={imagePrompt}
                            onChange={(e) => setImagePrompt(e.target.value)}
                          />
                          <button type="button" disabled={busyImage || imagePrompt.trim().length < 12} onClick={() => void handleGenerateSectionImage(idx)}>
                            {busyImage ? "Generando…" : "✨ Generar con Gemini"}
                          </button>
                        </div>
                      )}
                      {studioAssets.length > 0 && (
                        <div className="hl-studio-gallery">
                          <div className="hl-studio-gallery__head">
                            <strong>Banco Visual Studio PRO ({filteredGalleryAssets.length})</strong>
                            <div className="hl-studio-gallery__cats">
                              {galleryCategories.map((cat) => (
                                <button
                                  key={cat}
                                  type="button"
                                  className={galleryCategory === cat ? "is-active" : ""}
                                  onClick={() => setGalleryCategory(cat)}
                                >
                                  {cat === "all" ? "Todas" : cat}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="hl-studio-gallery__grid">
                            {filteredGalleryAssets.map((asset) => {
                              const isCurrent = section.imageUrl === asset.url;
                              return (
                                <button
                                  key={asset.id}
                                  type="button"
                                  className={`hl-studio-gallery__item ${isCurrent ? "is-selected" : ""}`}
                                  onClick={() => {
                                    updateSection(idx, {
                                      imageUrl: asset.url,
                                      imageAlt: section.imageAlt?.trim() || asset.title.slice(0, 240),
                                    });
                                    setStatusMessage(`Imagen «${asset.title}» aplicada a la sección #${idx + 1}.`);
                                  }}
                                  title={asset.title}
                                >
                                  <img src={asset.url} alt={asset.title} loading="lazy" />
                                  <span>{asset.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`hl-studio-section__inner ${safeImg ? "has-media" : ""}`} style={{ maxWidth: tokens.width === "wide" ? 1120 : 860, margin: "0 auto" }}>
                    <div className="hl-studio-section__copy">
                      {(section.badge || sectionLayout === "badge" || isHero || section.type === "offer") && (
                        <div className="hl-studio-pill-wrap" style={{ justifyContent: isCentered ? "center" : "flex-start" }}>
                          {sectionLayout === "badge" && (
                            <span className="hl-studio-seal-badge" style={{ borderColor: tokens.accent, color: tokens.accent }}>
                              {rawStr(section.badge) || "GARANTÍA"}
                            </span>
                          )}
                          <input
                            className="hl-studio-pill-input"
                            style={{ borderColor: `${tokens.accent}55`, color: tokens.accent }}
                            aria-label={`Insignia sección ${idx + 1}`}
                            placeholder="+ Insignia / sello destacado..."
                            value={rawStr(section.badge)}
                            onChange={(e) => updateSection(idx, { badge: e.target.value })}
                          />
                        </div>
                      )}
                      <input
                        className="hl-studio-inline hl-studio-inline--eyebrow"
                        style={{ color: tokens.accent, textAlign: isCentered ? "center" : "left" }}
                        aria-label={`Antetítulo sección ${idx + 1}`}
                        placeholder="+ Antetítulo"
                        value={section.eyebrow ?? ""}
                        onChange={(e) => updateSection(idx, { eyebrow: e.target.value })}
                      />
                      <textarea
                        className={`hl-studio-inline ${isHero ? "hl-studio-inline--h1" : "hl-studio-inline--h2"}`}
                        style={{ color: tokens.text, textAlign: isCentered ? "center" : "left" }}
                        rows={isHero ? 2 : 1}
                        aria-label={`Título sección ${idx + 1}`}
                        placeholder="Escribe el titular principal..."
                        value={section.headline ?? ""}
                        onChange={(e) => updateSection(idx, { headline: e.target.value })}
                      />
                      <textarea
                        className="hl-studio-inline hl-studio-inline--lead"
                        style={{ color: tokens.text, textAlign: isCentered ? "center" : "left" }}
                        rows={2}
                        aria-label={`Subtítulo sección ${idx + 1}`}
                        placeholder="+ Subtítulo de apoyo..."
                        value={section.subheadline ?? ""}
                        onChange={(e) => updateSection(idx, { subheadline: e.target.value })}
                      />
                      <textarea
                        className="hl-studio-inline hl-studio-inline--body"
                        style={{ color: tokens.text, textAlign: isCentered ? "center" : "left" }}
                        rows={3}
                        aria-label={`Cuerpo sección ${idx + 1}`}
                        placeholder="+ Cuerpo del bloque..."
                        value={section.body ?? ""}
                        onChange={(e) => updateSection(idx, { body: e.target.value })}
                      />

                      {(sectionBullets.length > 0 || isHero || section.type === "offer") && (
                        <div className="hl-studio-bullets-row" style={{ justifyContent: isCentered ? "center" : "flex-start" }}>
                          {sectionBullets.map((bullet, bIdx) => (
                            <div key={bIdx} className="hl-studio-bullet-pill">
                              <span style={{ color: tokens.accent }} aria-hidden="true">✓</span>
                              <input
                                className="hl-studio-inline"
                                style={{ color: tokens.text }}
                                aria-label={`Viñeta ${bIdx + 1} sección ${idx + 1}`}
                                value={bullet}
                                onChange={(e) => {
                                  const next = sectionBullets.map((item, j) => (j === bIdx ? e.target.value : item));
                                  updateSection(idx, { bullets: next });
                                }}
                              />
                              <button
                                type="button"
                                aria-label={`Quitar viñeta ${bIdx + 1}`}
                                onClick={() => updateSection(idx, { bullets: sectionBullets.filter((_, j) => j !== bIdx) })}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                          {sectionBullets.length < 6 && (
                            <button
                              type="button"
                              className="hl-studio-mini-btn"
                              onClick={() => updateSection(idx, { bullets: [...sectionBullets, "Beneficio o garantía concreta"] })}
                            >
                              + Viñeta
                            </button>
                          )}
                        </div>
                      )}

                      {sectionStats.length > 0 && (
                        <div className="hl-studio-stats-row">
                          {sectionStats.map((stat, statIdx) => (
                            <div
                              key={statIdx}
                              className="hl-studio-stat-card"
                              style={{
                                backgroundColor: isDarkBg ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.75)",
                                borderColor: isDarkBg ? "rgba(148,163,184,0.22)" : "rgba(15,23,42,0.12)",
                              }}
                            >
                              <input
                                className="hl-studio-inline hl-studio-stat-val"
                                style={{ color: tokens.accent }}
                                aria-label={`Valor cifra ${statIdx + 1} sección ${idx + 1}`}
                                value={stat.value}
                                onChange={(e) => {
                                  const next = sectionStats.map((st, sIdx) => (sIdx === statIdx ? { ...st, value: e.target.value } : st));
                                  updateSection(idx, { stats: next });
                                }}
                              />
                              <input
                                className="hl-studio-inline hl-studio-stat-lbl"
                                style={{ color: tokens.text }}
                                aria-label={`Etiqueta cifra ${statIdx + 1} sección ${idx + 1}`}
                                value={stat.label}
                                onChange={(e) => {
                                  const next = sectionStats.map((st, sIdx) => (sIdx === statIdx ? { ...st, label: e.target.value } : st));
                                  updateSection(idx, { stats: next });
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {(section.type === "offer" || sectionLayout === "pricing") && (
                        <div
                          className="hl-studio-pricing-box"
                          style={{
                            borderColor: tokens.accent,
                            backgroundColor: isDarkBg ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.8)",
                          }}
                        >
                          <label>
                            <span>Precio</span>
                            <input
                              className="hl-studio-inline hl-studio-pricing-main"
                              style={{ color: tokens.accent }}
                              aria-label={`Precio sección ${idx + 1}`}
                              placeholder="$29 USD"
                              value={rawStr(section.price)}
                              onChange={(e) => updateSection(idx, { price: e.target.value })}
                            />
                          </label>
                          <label>
                            <span>Precio anterior (opcional)</span>
                            <input
                              className="hl-studio-inline hl-studio-pricing-old"
                              style={{ color: tokens.text }}
                              aria-label={`Precio anterior sección ${idx + 1}`}
                              placeholder="$49 USD"
                              value={rawStr(section.oldPrice)}
                              onChange={(e) => updateSection(idx, { oldPrice: e.target.value })}
                            />
                          </label>
                          <label className="is-full">
                            <span>Nota de precio / entrega</span>
                            <input
                              className="hl-studio-inline"
                              style={{ color: tokens.text }}
                              aria-label={`Nota de precio sección ${idx + 1}`}
                              placeholder="Pago único · Acceso digital inmediato"
                              value={rawStr(section.priceNote)}
                              onChange={(e) => updateSection(idx, { priceNote: e.target.value })}
                            />
                          </label>
                        </div>
                      )}

                      {items.length > 0 && sectionLayout === "comparison" && items.some((raw) => isRecord(raw) && (raw.before !== undefined || raw.after !== undefined)) ? (
                        <div className="hl-studio-compare-row">
                          <div className="hl-studio-compare-head">
                            <span>Criterio</span>
                            <input
                              className="hl-studio-inline"
                              aria-label={`Etiqueta Antes sección ${idx + 1}`}
                              placeholder="Antes / Sin método"
                              value={rawStr(section.beforeLabel) || "Sin un método claro"}
                              onChange={(e) => updateSection(idx, { beforeLabel: e.target.value })}
                            />
                            <input
                              className="hl-studio-inline"
                              style={{ color: tokens.accent }}
                              aria-label={`Etiqueta Después sección ${idx + 1}`}
                              placeholder="Con el método"
                              value={rawStr(section.afterLabel) || "Con este método"}
                              onChange={(e) => updateSection(idx, { afterLabel: e.target.value })}
                            />
                          </div>
                          {items.map((raw, itemIdx) => {
                            const obj = isRecord(raw) ? raw : {};
                            return (
                              <div key={itemIdx} className="hl-studio-compare-item">
                                <input
                                  className="hl-studio-inline hl-studio-inline--item-title"
                                  style={{ color: tokens.text }}
                                  aria-label={`Criterio ${itemIdx + 1} sección ${idx + 1}`}
                                  value={rawStr(obj.name ?? obj.title)}
                                  onChange={(e) => updateItemField(idx, itemIdx, "name", e.target.value)}
                                />
                                <textarea
                                  className="hl-studio-inline hl-studio-inline--item-body"
                                  style={{ color: tokens.text }}
                                  rows={2}
                                  aria-label={`Antes ${itemIdx + 1} sección ${idx + 1}`}
                                  value={rawStr(obj.before)}
                                  onChange={(e) => updateItemField(idx, itemIdx, "before", e.target.value)}
                                />
                                <textarea
                                  className="hl-studio-inline hl-studio-inline--item-body"
                                  style={{ color: tokens.text }}
                                  rows={2}
                                  aria-label={`Después ${itemIdx + 1} sección ${idx + 1}`}
                                  value={rawStr(obj.after ?? obj.description)}
                                  onChange={(e) => updateItemField(idx, itemIdx, "after", e.target.value)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : items.length > 0 && (
                        <div className={`hl-studio-items-grid ${section.type === "faq" || section.type === "objections" || sectionLayout === "steps" || sectionLayout === "list" || sectionLayout === "accordion" ? "is-single-col" : ""}`}>
                          {items.map((raw, itemIdx) => {
                            const obj = isRecord(raw) ? raw : {};
                            const isQa = typeof raw !== "string" && (obj.q !== undefined || section.type === "faq" || section.type === "objections");
                            const badgeText =
                              sectionLayout === "steps"
                                ? `PASO ${String(itemIdx + 1).padStart(2, "0")}`
                                : sectionLayout === "checklist"
                                  ? "✓ CHECKLIST"
                                  : sectionLayout === "testimonials"
                                    ? (typeof obj.rating === "number" ? "★".repeat(Math.max(1, Math.min(5, Math.round(obj.rating)))) : "★ EVIDENCIA")
                                    : rawStr(obj.icon);
                            return (
                              <article
                                key={itemIdx}
                                className="hl-studio-item-card"
                                style={{
                                  backgroundColor: isDarkBg ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.75)",
                                  borderColor: isDarkBg ? "rgba(148,163,184,0.22)" : "rgba(15,23,42,0.12)",
                                }}
                              >
                                <button
                                  type="button"
                                  className="hl-studio-item-remove"
                                  aria-label={`Quitar elemento ${itemIdx + 1} de sección ${idx + 1}`}
                                  onClick={() => removeItem(idx, itemIdx)}
                                >
                                  ×
                                </button>
                                {typeof raw === "string" ? (
                                  <textarea
                                    className="hl-studio-inline"
                                    rows={2}
                                    value={raw}
                                    onChange={(e) => updateItemField(idx, itemIdx, "text", e.target.value)}
                                  />
                                ) : isQa ? (
                                  <>
                                    <span className="hl-studio-item-badge">{section.type === "objections" ? "OBJECIÓN" : "PREGUNTA"}</span>
                                    <input
                                      className="hl-studio-inline hl-studio-inline--item-title"
                                      style={{ color: tokens.text }}
                                      aria-label={`Pregunta ${itemIdx + 1} sección ${idx + 1}`}
                                      value={rawStr(obj.q)}
                                      onChange={(e) => updateItemField(idx, itemIdx, "q", e.target.value)}
                                    />
                                    <textarea
                                      className="hl-studio-inline hl-studio-inline--item-body"
                                      style={{ color: tokens.text }}
                                      rows={2}
                                      aria-label={`Respuesta ${itemIdx + 1} sección ${idx + 1}`}
                                      value={rawStr(obj.a)}
                                      onChange={(e) => updateItemField(idx, itemIdx, "a", e.target.value)}
                                    />
                                  </>
                                ) : (
                                  <>
                                    {badgeText && <span className="hl-studio-item-badge" style={{ color: tokens.accent }}>{badgeText}</span>}
                                    <input
                                      className="hl-studio-inline hl-studio-inline--item-title"
                                      style={{ color: tokens.text }}
                                      aria-label={`Título elemento ${itemIdx + 1} sección ${idx + 1}`}
                                      value={rawStr(obj.name ?? obj.title)}
                                      onChange={(e) => updateItemField(idx, itemIdx, obj.title !== undefined && obj.name === undefined ? "title" : "name", e.target.value)}
                                    />
                                    {rawStr(obj.role) && <span className="hl-studio-item-badge">{rawStr(obj.role)}</span>}
                                    <textarea
                                      className="hl-studio-inline hl-studio-inline--item-body"
                                      style={{ color: tokens.text }}
                                      rows={2}
                                      aria-label={`Descripción elemento ${itemIdx + 1} sección ${idx + 1}`}
                                      value={rawStr(obj.description ?? obj.text)}
                                      onChange={(e) => updateItemField(idx, itemIdx, obj.text !== undefined && obj.description === undefined ? "text" : "description", e.target.value)}
                                    />
                                  </>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      )}

                      {(section.cta || isHero || section.type === "offer" || section.type === "cta") && (
                        <div className="hl-studio-cta-box" style={{ justifyContent: isCentered ? "center" : "flex-start" }}>
                          <input
                            className="hl-studio-cta-input"
                            style={{ backgroundColor: tokens.accent }}
                            aria-label={`CTA sección ${idx + 1}`}
                            placeholder="+ Botón CTA..."
                            value={section.cta ?? ""}
                            onChange={(e) => updateSection(idx, { cta: e.target.value })}
                          />
                        </div>
                      )}
                    </div>

                    {safeImg && (
                      <figure className="hl-studio-media">
                        <img src={safeImg} alt={section.imageAlt || section.headline || ""} />
                      </figure>
                    )}
                  </div>
                </section>
              );
            })}

            <div className="hl-studio-add-bar">
              <label>
                Añadir nuevo bloque al lienzo:
                <select value={newBlockType} onChange={(e) => setNewBlockType(e.target.value as CanonicalLandingBlockType)}>
                  {Object.entries(CANONICAL_LANDING_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="hl-studio-btn hl-studio-btn--primary" onClick={() => addNewSection(newBlockType)}>
                <Plus size={14} /> Añadir bloque con contexto
              </button>
            </div>
            </div>
          )}
        </main>
      </div>

      {showCodeModal && inspectedCodeSpec && (
        <div
          className="hl-studio-code-modal-backdrop"
          role="presentation"
          onClick={() => setShowCodeModal(false)}
        >
          <section
            className="hl-studio-code-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Inspeccionar código en vivo"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="hl-studio-code-modal__head">
              <div>
                <strong>Inspector y Exportador en Vivo</strong>
                <span>{inspectedCodeSpec.filename}</span>
              </div>
              <div className="hl-studio-segmented" role="tablist" aria-label="Formato de código">
                {([
                  ["tsx", "Framer .tsx"],
                  ["html", "HTML5"],
                  ["csv", "CMS .csv"],
                  ["tokens", "Tokens .json"],
                  ["svg", "Figma .svg"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={codeTab === key}
                    className={codeTab === key ? "is-active" : ""}
                    onClick={() => setCodeTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="hl-studio-code-modal__actions">
                <button type="button" className="hl-studio-btn" onClick={() => void handleCopyInspectedCode()}>
                  {copiedCodeModal ? <Check size={14} /> : <Copy size={14} />} {copiedCodeModal ? "Copiado" : "Copiar"}
                </button>
                <button
                  type="button"
                  className="hl-studio-btn hl-studio-btn--primary"
                  onClick={() => triggerFileDownload(inspectedCodeSpec.filename, inspectedCodeSpec.code, inspectedCodeSpec.mime)}
                >
                  <Download size={14} /> Descargar
                </button>
                <button type="button" className="hl-studio-btn" onClick={() => setShowCodeModal(false)} aria-label="Cerrar inspector">
                  <X size={15} />
                </button>
              </div>
            </header>
            <pre className="hl-studio-code-pre">
              <code>{inspectedCodeSpec.code}</code>
            </pre>
          </section>
        </div>
      )}

      {!presentationMode && (
        <div className="hl-studio-copilot-dock">
          {copilotOpen && (
            <section className="hl-studio-copilot-panel" aria-label="Copiloto Creativo PRO">
              <header className="hl-studio-copilot-panel__head">
                <strong>
                  <Wand2 size={14} /> Copiloto Creativo PRO
                </strong>
                <button type="button" onClick={() => setCopilotOpen(false)} aria-label="Cerrar copiloto">
                  <X size={14} />
                </button>
              </header>
              <label className="hl-studio-copilot-toggle">
                <input
                  type="checkbox"
                  checked={copilotLiveAi}
                  disabled={typeof api.runLandingStudioAi !== "function" || generatingAi}
                  onChange={(e) => setCopilotLiveAi(e.target.checked)}
                />
                <span>
                  {copilotLiveAi
                    ? `Usar IA en vivo (${selectedProvider.toUpperCase()})`
                    : "Superpoderes locales instantáneos (con contexto SQLite)"}
                </span>
              </label>
              <div className="hl-studio-copilot-actions">
                <button type="button" disabled={isBusy} onClick={() => void handleCopilotAction("persuasive")}>
                  🔥 Máxima Persuasión
                </button>
                <button type="button" disabled={isBusy} onClick={() => void handleCopilotAction("scientific")}>
                  🔬 Rigor y Evidencia
                </button>
                <button type="button" disabled={isBusy} onClick={() => void handleCopilotAction("urgent")}>
                  ⚡ Claridad de Oferta
                </button>
                <button type="button" disabled={isBusy} onClick={() => void handleCopilotAction("storytelling")}>
                  📖 Storytelling Emocional
                </button>
              </div>
              <div className="hl-studio-copilot-form">
                <textarea
                  rows={2}
                  aria-label="Instrucción rápida para Copiloto PRO"
                  placeholder="Ej.: Enfoca el hero en seguridad y tono cálido..."
                  value={copilotInput}
                  onChange={(e) => setCopilotInput(e.target.value)}
                />
                <button
                  type="button"
                  className="hl-studio-btn hl-studio-btn--primary"
                  disabled={isBusy || !copilotInput.trim()}
                  onClick={() => void handleCopilotCustomSubmit()}
                >
                  {generatingAi ? "Procesando…" : copilotLiveAi ? `✨ Aplicar con ${selectedProvider.toUpperCase()}` : "🪄 Aplicar al Lienzo"}
                </button>
              </div>
            </section>
          )}
          <button
            type="button"
            className="hl-studio-copilot-launcher"
            onClick={() => setCopilotOpen((prev) => !prev)}
          >
            <Wand2 size={15} /> {copilotOpen ? "Ocultar Copiloto" : "Copiloto IA"}
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
