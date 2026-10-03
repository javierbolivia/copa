export interface FinalProductValidationAudit {
  ok: boolean;
  complete: boolean;
  chapterCount: number;
  referenceCount: number;
  totalWords: number;
  citationCount: number;
  citedReferenceIds: string[];
  errors: string[];
}

export interface FinalProductValidationResult {
  output: Record<string, unknown>;
  audit: FinalProductValidationAudit;
}

const MIN_CHAPTERS = 3;
const MIN_CHAPTER_WORDS = 150;
const MIN_INTRODUCTION_WORDS = 60;
const MIN_CONCLUSION_WORDS = 60;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function words(value: unknown): number {
  return typeof value === "string" ? value.trim().split(/\s+/u).filter(Boolean).length : 0;
}

export function validateFinalProductOutput(input: unknown): FinalProductValidationResult {
  const output = record(input) ?? {};
  const guide = record(output.guide);
  const chapters = Array.isArray(guide?.chapters) ? guide.chapters : [];
  const references = Array.isArray(guide?.references) ? guide.references : [];
  const errors: string[] = [];
  const introductionWords = words(guide?.introduction);
  const conclusionWords = words(guide?.conclusion);
  let totalWords = introductionWords + conclusionWords;

  if (introductionWords < MIN_INTRODUCTION_WORDS) errors.push(`La introducción requiere al menos ${MIN_INTRODUCTION_WORDS} palabras desarrolladas.`);
  if (chapters.length < MIN_CHAPTERS) errors.push(`El manuscrito requiere al menos ${MIN_CHAPTERS} capítulos.`);
  chapters.forEach((value, index) => {
    const chapter = record(value);
    const title = words(chapter?.title);
    const contentWords = words(chapter?.content);
    totalWords += contentWords;
    if (title === 0) errors.push(`El capítulo ${index + 1} necesita un título.`);
    if (contentWords < MIN_CHAPTER_WORDS) errors.push(`El capítulo ${index + 1} requiere al menos ${MIN_CHAPTER_WORDS} palabras de contenido; un título o esquema no cuenta como manuscrito.`);
  });
  if (conclusionWords < MIN_CONCLUSION_WORDS) errors.push(`La conclusión requiere al menos ${MIN_CONCLUSION_WORDS} palabras desarrolladas.`);
  if (references.length < 2) errors.push("El manuscrito requiere al menos dos referencias bibliográficas explícitas.");
  const referenceIds = new Set<string>();
  references.forEach((value, index) => {
    const reference = record(value);
    const id = typeof reference?.id === "string" ? reference.id.trim() : "";
    const url = typeof reference?.url === "string" ? reference.url.trim() : "";
    let validUrl = false;
    try { validUrl = new URL(url).protocol === "https:"; } catch { /* invalid source URL */ }
    if (!id || !reference?.title || typeof reference.title !== "string" || !reference.title.trim()
      || !reference.organization || typeof reference.organization !== "string" || !reference.organization.trim()
      || !validUrl) errors.push(`La referencia ${index + 1} necesita ID, título, organización y URL HTTPS válida.`);
    if (id && !/^R[1-9]\d*$/u.test(id)) errors.push(`La referencia ${index + 1} debe usar un ID de cita como R1 o R2.`);
    if (id && referenceIds.has(id)) errors.push(`La referencia ${index + 1} repite el ID ${id}.`);
    if (id) referenceIds.add(id);
  });

  const manuscriptText = [
    guide?.introduction,
    ...chapters.map((value) => {
      const chapter = record(value);
      return chapter?.content ?? (typeof value === "string" ? value : undefined);
    }),
    guide?.conclusion,
  ].filter((value): value is string => typeof value === "string");
  const citedReferenceIds = new Set<string>();
  const invalidCitationIds = new Set<string>();
  let citationCount = 0;
  const citationPattern = /\((R[^()\r\n]*)\)/gu;
  for (const text of manuscriptText) {
    for (const match of text.matchAll(citationPattern)) {
      const ids = match[1]!.split(",").map((id) => id.trim());
      if (ids.some((id) => !/^R[1-9]\d*$/u.test(id))) {
        errors.push(`La cita (${match[1]}) debe usar IDs separados por coma, como (R1, R2).`);
        continue;
      }
      citationCount += 1;
      for (const id of ids) {
        if (!referenceIds.has(id)) invalidCitationIds.add(id);
        else citedReferenceIds.add(id);
      }
    }
  }
  if (citationCount === 0) errors.push("El manuscrito requiere citas en línea con IDs de referencias listadas, por ejemplo (R1, R2).");
  for (const id of invalidCitationIds) errors.push(`La cita ${id} no corresponde a ninguna referencia del manuscrito.`);
  for (const id of referenceIds) {
    if (!citedReferenceIds.has(id)) errors.push(`La referencia ${id} está listada pero no se cita en el manuscrito.`);
  }

  const audit: FinalProductValidationAudit = {
    ok: errors.length === 0,
    complete: errors.length === 0,
    chapterCount: chapters.length,
    referenceCount: references.length,
    totalWords,
    citationCount,
    citedReferenceIds: [...citedReferenceIds].sort((left, right) => left.localeCompare(right)),
    errors,
  };
  return { output: { ...output, finalProductValidationAudit: audit }, audit };
}
