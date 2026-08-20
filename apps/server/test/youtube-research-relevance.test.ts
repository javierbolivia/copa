import { MARKET_RESEARCH_BUDGETS } from "@our-platform/shared";
import { describe, expect, it, vi } from "vitest";

import { createYouTubeRelevanceReviewer } from "../src/services/youtube-relevance-reviewer.js";
import {
  assessYouTubeCommentRelevance,
  assessYouTubeVideoRelevance,
  durationSeconds,
  resolveYouTubeMinimumDurationSeconds,
  topicTerms,
} from "../src/services/youtube-research-relevance.js";

const TOPIC = "huerto de balcón";
const TERMS = topicTerms(TOPIC);

function video(overrides: Partial<Parameters<typeof assessYouTubeVideoRelevance>[0]> = {}) {
  return {
    topic: TOPIC,
    title: "Guía de huerto de balcón",
    description: "Cómo cuidar el huerto de balcón",
    tags: ["huerto", "balcón"],
    channelTitle: "Cultivo urbano",
    duration: "PT8M",
    ...overrides,
  };
}

function candidate(videoId: string) {
  return {
    videoId,
    title: "Huerto de balcón",
    description: "Riego y sustrato",
    tags: ["huerto", "balcón"],
    channelTitle: "Cultivo urbano",
    declaredLanguage: "es",
  };
}

function binding(analyzer: "deepseek" | "gemini", generate: ReturnType<typeof vi.fn>) {
  return {
    analyzer,
    model: analyzer === "deepseek" ? "deepseek-v4-flash" : "gemini-2.5-flash",
    client: { configured: true, generate },
  };
}

describe("20.7D deterministic YouTube relevance", () => {
  it.each([
    [null, null],
    ["PT0S", 0],
    ["PT59S", 59],
    ["PT4M", 240],
    ["PT8M20S", 500],
    ["PT1H2M3S", 3723],
    ["bad", null],
    ["PT10000H", null],
  ])("parses bounded ISO duration %s", (input, expected) => {
    expect(durationSeconds(input)).toBe(expected);
  });

  it.each([
    [undefined, 240],
    [240, 240],
    [86400, 86400],
  ])("resolves allowed minimum duration %s", (input, expected) => {
    expect(resolveYouTubeMinimumDurationSeconds(input)).toBe(expected);
  });

  it.each([0, 239, 86401, 1.5])("rejects unsupported minimum duration %s", (input) => {
    expect(() => resolveYouTubeMinimumDurationSeconds(input)).toThrow(RangeError);
  });

  it.each([
    [video({ metadataAvailable: false }), "irrelevant", "video_metadata_unavailable"],
    [video({ duration: null }), "irrelevant", "duration_unavailable"],
    [video({ duration: "PT3M59S" }), "irrelevant", "duration_below_minimum"],
    [video({ topic: "problemas" }), "irrelevant", "no_meaningful_topic_terms"],
    [video({ title: "Receta de sopa", description: "Cocina", tags: ["cocina"] }), "irrelevant", "no_topic_overlap"],
    [video({ title: "Huerto de balcón: errores", description: "", tags: [] }), "relevant", "strong_title_topic_overlap"],
    [video({ title: "Guía", description: "", tags: ["huerto", "balcón"] }), "relevant", "strong_metadata_topic_overlap"],
    [video({ title: "Huerto urbano", description: "", tags: [] }), "borderline", "limited_topic_overlap"],
  ] as const)("returns inspectable decision %s", (input, decision, reason) => {
    expect(assessYouTubeVideoRelevance(input)).toMatchObject({ decision, reason });
  });

  it("does not let decorated discovery queries move a metadata-only borderline video across eligibility", () => {
    const metadata = video({ title: "Huerto urbano", description: "", tags: [] });
    expect(assessYouTubeVideoRelevance(metadata)).toMatchObject({ decision: "borderline", reason: "limited_topic_overlap" });
    expect(assessYouTubeVideoRelevance({ ...metadata, query: "huerto de balcón problemas no funciona" }))
      .toMatchObject({ decision: "borderline", reason: "limited_topic_overlap" });
  });

  it("does not inspect popularity fields when scoring video metadata", () => {
    const input = video({ title: "Receta de sopa", description: "", tags: ["cocina"] });
    expect(assessYouTubeVideoRelevance({ ...input, viewCount: 999_999_999 } as typeof input)).toMatchObject({
      decision: "irrelevant",
      reason: "no_topic_overlap",
    });
  });

  it.each([
    ["El riego no funciona en mi huerto de balcón", undefined, undefined, "research_relevant"],
    ["En mi huerto de balcón es demasiado caro", undefined, undefined, "research_relevant"],
    ["Probé este riego para mi huerto de balcón y no funcionó", undefined, undefined, "research_relevant"],
    ["Busco un sustrato para mi huerto de balcón", undefined, undefined, "research_relevant"],
    ["El huerto de balcón es bonito", undefined, undefined, "borderline"],
    ["No funciona y es caro", undefined, undefined, "research_irrelevant"],
    ["Saludos desde Madrid, mi huerto de balcón", undefined, undefined, "research_irrelevant"],
    ["Amén por mi huerto de balcón", undefined, undefined, "research_irrelevant"],
    ["Mi viaje al huerto de balcón fue genial", undefined, undefined, "research_irrelevant"],
    ["Suscríbete a mi curso de huerto de balcón", "Cliente", "Canal", "creator_promotion"],
    ["Código de descuento para huerto de balcón", "Canal", "Canal", "creator_promotion"],
    ["El descuento para el huerto de balcón no me funciona", "Cliente", "Canal", "research_relevant"],
  ] as const)("keeps comment decisions local and topic-linked", (text, author, channelTitle, expected) => {
    expect(assessYouTubeCommentRelevance({
      text,
      topicTerms: TERMS,
      ...(author === undefined ? {} : { author }),
      ...(channelTitle === undefined ? {} : { channelTitle }),
    })).toBe(expected);
  });

  it("requires an explicit Focus relation before generic pain can qualify a rich Focus", () => {
    const relationTerms = topicTerms(
      "problemas y necesidades de dueños de perros que ladran, lloran, destruyen objetos o muestran ansiedad cuando se quedan solos: causas, errores, entrenamiento y soluciones que no funcionan",
    );
    const assess = (text: string, author?: string, channelTitle?: string) => assessYouTubeCommentRelevance({
      text,
      topicTerms: relationTerms,
      ...(author === undefined ? {} : { author }),
      ...(channelTitle === undefined ? {} : { channelTitle }),
    });
    const fireworks = "Le estoy poniendo esta música a mis perritas, sufren muchísimo x la pirotecnia en estás épocas de navidad y se ponen demasiado ansiosas, tiemblan, corren, lloran, ladran, se esconden bajo la cama, etc. Este audio les está ayudando a tranquilizarse y poder dormir, recordemos siempre q los perritos son seres de amor, ellos no le hacen daño a nadie, solo quieren ser amados, antes de lanzar fuegos artificiales piensen en todos los pobres animalitos indefensos q están en la calle, esos ruidos los alteran mucho, los asustan y les hacen doler sus oídos, por favor consienticence de todo el daño que causa un fuego artificial, tanto para el ambiente como para los animales, las personas con autismo o alguna discapacidad, por favor, NO A LA PIROTECNIA. ❤";
    const grief = "Se que no vale de mucho,pero a nuestra Lisa,le detectaron cáncer de páncreas, el veterinario me dijo que no había solución,.pero que nos podían derivar a un centro,para quimio.Obviamente le dimos quimio,en dicho centro,ya nos comentaron que únicamente una transfusión de sangre a la segunda se cortaría el tratamiento . El veterinario de toda la vida nos comentó textualmente “Si fuese mi perra no le daria quimio xq estaréis dia si día también de hospital en hospital y sufrirá ella y vosotros “ diria que me sento hasta mal,pero hoy desde la distancia que te da perspectiva no lo volvería a hacer”.Fuimos egoístas ya que la queríamos tener unos días ,semanas,meses más,pero …sabíamos que no saldría. A los 15 días del tratamiento,y con ingreso y transfusiones de por medio.Me la lleve a sacrificar,la música fue rock de platero y Rosendo .Fui todo el camino hablándole de lo bien que lo habíamos pasado. Cuando llego el momento,nos miramos ,la abrace ,llore ,le di un beso.Min sensación es que sabia donde la llevaba,pero en su mirada como siempre ,solo había amor y nobleza. Cuando la veterinaria me dijo que ya se había ido.Llore aún más,me dejo estar con ella,lo que quise ,solo quise estar 10’ mas ,la volví a besar. Espero reencontrarme con ella algun dia Hiciste lo correcto,lo primero es el perro y su bien estar,hiciste lo correcto Es duro,pero ..siempre me quedarán los recuerdos y sus cenizas que después de casi 7 años ,aún no puedo mirarlas sin dolor.No hay perra que la pueda /podrá su";
    const petLoss = "Estaba leyendo comentarios y vi varios donde dicen que sus perros ya no están aquí 😢 comencé a llorar el sólo pensar, el día que los míos me falten, los quiero mucho y ellos a mi también. Cuando estoy enferma nunca me dejan sola, ni a mi menos a mi hijo, sólo quieren estar acostados al lado de nosotros. Quieran a sus mascotas ❤";

    expect(assess(fireworks)).toBe("research_irrelevant");
    expect(assess(grief)).toBe("research_irrelevant");
    expect(assess(petLoss)).toBe("research_irrelevant");
    expect(assess("Mi perro tiene miedo y no funcionó.")).toBe("research_irrelevant");
    expect(assess("Mi perro llora cuando me voy.")).toBe("research_relevant");
    expect(assess("Cuando lo dejo solo ladra bastante.")).toBe("research_relevant");
    expect(assess("Salimos y destroza todo.")).toBe("research_relevant");
    expect(assess("Suscríbete a mi curso para perros que se quedan solos.", "Canal", "Canal")).toBe("creator_promotion");
  });
});

describe("20.7D bounded borderline reviewer", () => {
  it("reviews no more than eight unique candidates in one DeepSeek batch", async () => {
    const primary = vi.fn(async () => ({ output: { reviews: [] }, usage: { inputTokens: 3, outputTokens: 2 } }));
    const fallback = vi.fn();
    const reviewer = createYouTubeRelevanceReviewer(binding("deepseek", primary) as never, binding("gemini", fallback) as never);

    await reviewer.review(TOPIC, Array.from({ length: 10 }, (_, index) => candidate(`video-${index}`)));

    expect(primary).toHaveBeenCalledTimes(1);
    const request = (primary.mock.calls as unknown as readonly [readonly [{ input: string; maxOutputTokens: number }]])[0]?.[0];
    expect(request).toBeDefined();
    expect(JSON.parse(request!.input).candidates).toHaveLength(MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxBorderlineVideos);
    expect(request!.maxOutputTokens).toBe(MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxOutputTokens);
  });

  it("uses Gemini only for the unresolved same candidate", async () => {
    const primary = vi.fn(async () => ({
      output: { reviews: [{ videoId: "one", decision: "relevant", reason: "topic", matchedAspects: ["title"] }] },
      usage: { inputTokens: 4, outputTokens: 3 },
    }));
    const fallback = vi.fn(async () => ({
      output: { reviews: [{ videoId: "two", decision: "irrelevant", reason: "other", matchedAspects: ["tag"] }] },
      usage: { inputTokens: 2, outputTokens: 1 },
    }));
    const reviewer = createYouTubeRelevanceReviewer(binding("deepseek", primary) as never, binding("gemini", fallback) as never);

    const result = await reviewer.review(TOPIC, [candidate("one"), candidate("two")]);

    expect(fallback).toHaveBeenCalledTimes(1);
    const fallbackRequest = (fallback.mock.calls as unknown as readonly [readonly [{ input: string }]])[0]?.[0];
    expect(fallbackRequest).toBeDefined();
    expect(JSON.parse(fallbackRequest!.input).candidates.map((item: { videoId: string }) => item.videoId)).toEqual(["two"]);
    expect(result).toMatchObject({ attempts: 2, fallbackAttempts: 1, successes: 2, failures: 0, inputTokens: 6, outputTokens: 4 });
    expect(result.results.get("one")).toMatchObject({ provider: "deepseek", fallback: false, decision: "relevant" });
    expect(result.results.get("two")).toMatchObject({ provider: "gemini", fallback: true, decision: "irrelevant" });
  });

  it("fails closed for malformed, duplicate, and unknown reviewer output", async () => {
    const primary = vi.fn(async () => ({
      output: { reviews: [
        { videoId: "one", decision: "relevant", reason: "topic", matchedAspects: ["title"] },
        { videoId: "one", decision: "relevant", reason: "again", matchedAspects: ["title"] },
        { videoId: "unknown", decision: "relevant", reason: "unknown", matchedAspects: ["title"] },
      ] },
      usage: {},
    }));
    const fallback = vi.fn(async () => ({ output: { reviews: [] }, usage: {} }));
    const reviewer = createYouTubeRelevanceReviewer(binding("deepseek", primary) as never, binding("gemini", fallback) as never);

    const result = await reviewer.review(TOPIC, [candidate("one")]);

    expect(result).toMatchObject({ attempts: 2, fallbackAttempts: 1, successes: 0, failures: 1 });
    expect(result.results.get("one")).toMatchObject({ decision: null, failure: expect.stringContaining("primary_result_duplicate") });
  });
});
