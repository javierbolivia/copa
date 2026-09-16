import type { FunnelDocument, FunnelValidationAudit } from "@our-platform/shared";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const nonempty = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 4000;

export function validateFunnelOutput(
  input: unknown,
  evidence: readonly { id: string }[] = [],
): { output: FunnelDocument; audit: FunnelValidationAudit } {
  const source = record(input);
  const errors: string[] = [];

  // Validate nodes
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  if (rawNodes.length < 2 || rawNodes.length > 30) {
    errors.push("El funnel requiere entre 2 y 30 pasos (nodos).");
  }

  const nodeIds = new Set<string>();
  const nodes = rawNodes.map((raw, index) => {
    const node = record(raw);
    const prefix = `Paso ${index + 1}`;
    const id = typeof node.id === "string" && node.id.trim() ? node.id.trim() : `step-${index + 1}`;
    if (nodeIds.has(id)) {
      errors.push(`${prefix}: identificador '${id}' duplicado.`);
    }
    nodeIds.add(id);

    if (!nonempty(node.label)) {
      errors.push(`${prefix}: indica un nombre o etiqueta para el paso.`);
    }
    if (!nonempty(node.type)) {
      errors.push(`${prefix}: indica el tipo de etapa.`);
    }
    if (node.description !== undefined && typeof node.description !== "string") {
      errors.push(`${prefix}: la descripción debe ser texto.`);
    }

    const externalPlatform = typeof node.externalPlatform === "string" && ["hotmart", "skool", "custom", "none"].includes(node.externalPlatform)
      ? (node.externalPlatform as "hotmart" | "skool" | "custom" | "none")
      : undefined;
    const externalCheckoutUrl = typeof node.externalCheckoutUrl === "string" && node.externalCheckoutUrl.trim()
      ? node.externalCheckoutUrl.trim()
      : undefined;
    const trackingEvent = typeof node.trackingEvent === "string" && node.trackingEvent.trim()
      ? node.trackingEvent.trim()
      : undefined;

    return {
      id,
      type: typeof node.type === "string" ? node.type : "step",
      label: typeof node.label === "string" ? node.label : id,
      description: typeof node.description === "string" ? node.description : "",
      active: node.active !== false,
      linkedArtifact: typeof node.linkedArtifact === "string" ? node.linkedArtifact : undefined,
      price: typeof node.price === "string" ? node.price : null,
      metricLabel: typeof node.metricLabel === "string" ? node.metricLabel : undefined,
      metricValue: typeof node.metricValue === "string" ? node.metricValue : undefined,
      externalPlatform,
      externalCheckoutUrl,
      trackingEvent,
    };
  });

  // Validate edges
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];
  if (rawEdges.length < 1 || rawEdges.length > 50) {
    errors.push("El funnel requiere al menos una conexión (arista) entre pasos.");
  }

  // Graph adjacency map for cycle detection
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);

  const edges = rawEdges.map((raw, index) => {
    const edge = record(raw);
    const prefix = `Conexión ${index + 1}`;
    const from = typeof edge.from === "string" ? edge.from.trim() : "";
    const to = typeof edge.to === "string" ? edge.to.trim() : "";
    const event = typeof edge.event === "string" && edge.event.trim() ? edge.event.trim() : "continue";

    if (!from || !nodeIds.has(from)) {
      errors.push(`${prefix}: el paso de origen '${from}' no existe en los nodos.`);
    }
    if (!to || !nodeIds.has(to)) {
      errors.push(`${prefix}: el paso de destino '${to}' no existe en los nodos.`);
    }
    if (from && to && from === to) {
      errors.push(`${prefix}: un paso no puede conectarse consigo mismo (bucle '${from}').`);
    }

    if (from && to && from !== to && nodeIds.has(from) && nodeIds.has(to)) {
      adj.get(from)!.push(to);
    }

    return {
      from,
      to,
      event,
      label: typeof edge.label === "string" ? edge.label : undefined,
    };
  });

  // Cycle detection (DAG check) via DFS
  const visited = new Map<string, "visiting" | "visited">();
  let hasCycle = false;

  function dfs(nodeId: string): boolean {
    visited.set(nodeId, "visiting");
    for (const neighbor of adj.get(nodeId) || []) {
      const state = visited.get(neighbor);
      if (state === "visiting") return true; // Cycle detected
      if (!state && dfs(neighbor)) return true;
    }
    visited.set(nodeId, "visited");
    return false;
  }

  for (const nodeId of nodeIds) {
    if (!visited.has(nodeId)) {
      if (dfs(nodeId)) {
        hasCycle = true;
        break;
      }
    }
  }

  if (hasCycle) {
    errors.push("El recorrido comercial no debe contener bucles cerrados (ciclos). Debe avanzar hacia una salida válida.");
  }

  // Payments policy: paymentsEnabled must be false
  if (source.paymentsEnabled === true) {
    errors.push("Los pagos reales no están autorizados. 'paymentsEnabled' debe ser false.");
  }

  // Evidence validation
  const allowed = new Set(evidence.map((item) => item.id));
  if (
    source.evidenceIds !== undefined &&
    (!Array.isArray(source.evidenceIds) ||
      source.evidenceIds.length > 20 ||
      source.evidenceIds.some((id) => typeof id !== "string" || !allowed.has(id)))
  ) {
    errors.push("Las referencias deben pertenecer al contexto disponible al generar.");
  }

  const audit: FunnelValidationAudit = {
    ok: errors.length === 0,
    errors,
  };

  const output: FunnelDocument = {
    schemaVersion: 1,
    landingVersion: typeof source.landingVersion === "string" ? source.landingVersion : undefined,
    offerName: typeof source.offerName === "string" ? source.offerName : undefined,
    strategyRationale: typeof source.strategyRationale === "string" ? source.strategyRationale : undefined,
    nodes,
    edges,
    paymentsEnabled: false,
    evidenceIds: Array.isArray(source.evidenceIds) ? source.evidenceIds.filter((id): id is string => typeof id === "string") : [],
    funnelValidationAudit: audit,
    tracking: typeof source.tracking === "object" && source.tracking !== null ? (source.tracking as any) : undefined,
    externalCheckout: typeof source.externalCheckout === "object" && source.externalCheckout !== null ? (source.externalCheckout as any) : undefined,
  };

  return { output, audit };
}
