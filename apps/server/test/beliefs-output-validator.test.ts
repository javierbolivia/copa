import { describe, expect, it } from "vitest";
import { validateBeliefsOutput } from "../src/services/beliefs-output-validator.js";

const evidence = [{ id: "ev-1" }, { id: "ev-2" }];

describe("Beliefs output validator", () => {
  const baseValidBeliefs = {
    centralThesis: "Un perro reactivo no es un perro agresivo sin solución; responde a un umbral de estrés que puede ampliarse mediante exposición progresiva y refuerzo positivo.",
    currentBeliefs: [
      "Mi perro ladra por dominancia",
      "Necesito tirones de correa más fuertes para controlarlo",
    ],
    limitingBeliefs: [
      "Nunca podré pasear tranquilo con mi perro",
      "Es demasiado tarde para cambiar su conducta",
    ],
    bridgeBeliefs: [
      "El ladrido es una señal de estrés acumulado, no de mal comportamiento intencional",
      "Trabajar a mayor distancia reduce la reactividad de forma medible",
    ],
    requiredBeliefs: [
      "Controlar la distancia al estímulo permite desensibilizar al perro de forma predecible",
      "Una rutina estructurada de 15 minutos diarios es suficiente para observar progresos",
    ],
    objections: [
      "¿Y si vivo en una ciudad y no puedo evitar cruzarme con otros perros?",
      "No tengo tiempo para sesiones largas de entrenamiento",
    ],
    arguments: [
      "El método incluye protocolos de gestión de emergencia para giros en U y bloqueos visuales en esquinas",
      "Las micro-sesiones se integran directamente en los paseos habituales de necesidades",
    ],
    evidenceIds: ["ev-1"],
  };

  it("accepts a complete, rich beliefs map with bridgeBeliefs and schemaVersion", () => {
    const result = validateBeliefsOutput(baseValidBeliefs, evidence);
    expect(result.audit.ok).toBe(true);
    expect(result.audit.errors).toHaveLength(0);
    expect(result.output.schemaVersion).toBe(1);
    expect(result.output.centralThesis).toBe(baseValidBeliefs.centralThesis);
  });

  it("accepts beliefs map when bridgeBeliefs and evidenceIds are omitted", () => {
    const { bridgeBeliefs, evidenceIds, ...minimalBeliefs } = baseValidBeliefs;
    const result = validateBeliefsOutput(minimalBeliefs, evidence);
    expect(result.audit.ok).toBe(true);
    expect(result.output.schemaVersion).toBe(1);
  });

  it("rejects an empty central thesis", () => {
    const result = validateBeliefsOutput({ ...baseValidBeliefs, centralThesis: "   " }, evidence);
    expect(result.audit.ok).toBe(false);
    expect(result.audit.errors.some((e) => e.includes("tesis central"))).toBe(true);
  });

  it("rejects empty requiredBeliefs list", () => {
    const result = validateBeliefsOutput({ ...baseValidBeliefs, requiredBeliefs: [] }, evidence);
    expect(result.audit.ok).toBe(false);
    expect(result.audit.errors.some((e) => e.includes("creencia propuesta"))).toBe(true);
  });

  it("rejects references outside allowed evidence snapshot", () => {
    const result = validateBeliefsOutput({ ...baseValidBeliefs, evidenceIds: ["ev-unauthorized"] }, evidence);
    expect(result.audit.ok).toBe(false);
    expect(result.audit.errors.some((e) => e.includes("referencias"))).toBe(true);
  });
});
