export type MetaConversionEvent = "ViewContent" | "Lead" | "InitiateCheckout" | "Purchase";
export type ExternalCheckoutPlatform = "hotmart" | "skool" | "custom" | "none";

export interface FunnelNode {
  id: string;
  type: string;
  label: string;
  description?: string | undefined;
  active?: boolean | undefined;
  linkedArtifact?: string | undefined;
  price?: string | null | undefined;
  metricLabel?: string | undefined;
  metricValue?: string | undefined;
  externalPlatform?: ExternalCheckoutPlatform | undefined;
  externalCheckoutUrl?: string | undefined;
  trackingEvent?: MetaConversionEvent | string | undefined;
}

export interface FunnelEdge {
  from: string;
  to: string;
  event: "continue" | "accept" | "decline" | "complete" | string;
  label?: string | undefined;
}

export interface FunnelValidationAudit {
  ok: boolean;
  errors: string[];
}

export interface FunnelDocument {
  [key: string]: unknown;
  schemaVersion: number;
  landingVersion?: string | undefined;
  offerName?: string | undefined;
  strategyRationale?: string | undefined;
  nodes: FunnelNode[];
  edges: FunnelEdge[];
  paymentsEnabled: false;
  evidenceIds?: string[] | undefined;
  funnelValidationAudit?: FunnelValidationAudit | undefined;
  tracking?: {
    metaPixelId?: string | undefined;
    events?: Array<{
      stepId: string;
      event: MetaConversionEvent | string;
    }> | undefined;
  } | undefined;
  externalCheckout?: {
    platform?: ExternalCheckoutPlatform | undefined;
    url?: string | undefined;
  } | undefined;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Generates clean Markdown documentation of the Funnel flow and conversion logic. */
export function renderFunnelMarkdown(input: unknown): string {
  const doc = record(input);
  const nodes = (Array.isArray(doc.nodes) ? doc.nodes : []).map(record);
  const edges = (Array.isArray(doc.edges) ? doc.edges : []).map(record);
  const landingVersion = typeof doc.landingVersion === "string" ? doc.landingVersion : "Landing principal";
  const offerName = typeof doc.offerName === "string" ? doc.offerName : "Oferta comercial";
  const externalCheckout = record(doc.externalCheckout);
  const platform = typeof externalCheckout.platform === "string" ? externalCheckout.platform : "hotmart";
  const tracking = record(doc.tracking);
  const pixelId = typeof tracking.metaPixelId === "string" ? tracking.metaPixelId : undefined;

  const lines: string[] = [
    `# Embudo Comercial (Funnel)`,
    ``,
    `> **Landing asociada:** ${landingVersion}  `,
    `> **Oferta base:** ${offerName}  `,
    `> **Plataforma de checkout:** ${platform.toUpperCase()} (externa, sin pagos propios en Hallazia)  `,
    ...(pixelId ? [`> **Meta Pixel ID:** \`${pixelId}\` (Eventos: ViewContent, Lead, InitiateCheckout, Purchase)  `] : []),
    ``,
    `## Estructura del Recorrido (${nodes.length} pasos)`,
    ``,
  ];

  nodes.forEach((node, index) => {
    const active = node.active !== false;
    const status = active ? "🟢 Activo" : "⚪ Desactivado";
    const label = String(node.label || node.id);
    const type = String(node.type || "paso");
    const desc = typeof node.description === "string" ? node.description : "";
    const price = typeof node.price === "string" && node.price ? ` · **Precio:** ${node.price}` : "";
    const artifact = typeof node.linkedArtifact === "string" && node.linkedArtifact ? ` · [${node.linkedArtifact}]` : "";
    const extPlatform = typeof node.externalPlatform === "string" && node.externalPlatform !== "none" ? ` · **Checkout:** ${node.externalPlatform.toUpperCase()}` : "";
    const trackingEvent = typeof node.trackingEvent === "string" && node.trackingEvent ? ` · **Meta Event:** \`${node.trackingEvent}\`` : "";

    lines.push(`### ${index + 1}. ${label} (${type})`);
    lines.push(`- **Estado:** ${status}${price}${artifact}${extPlatform}${trackingEvent}`);
    if (desc) lines.push(`- **Descripción:** ${desc}`);
    if (typeof node.externalCheckoutUrl === "string" && node.externalCheckoutUrl) {
      lines.push(`- **URL Checkout externo:** \`${node.externalCheckoutUrl}\``);
    }
    lines.push(``);
  });

  lines.push(`## Conexiones y Transiciones (${edges.length} aristas)`);
  lines.push(``);
  lines.push(`| Origen | Evento | Destino | Etiqueta |`);
  lines.push(`|---|---|---|---|`);

  edges.forEach((edge) => {
    const from = String(edge.from || "");
    const to = String(edge.to || "");
    const event = String(edge.event || "continue");
    const edgeLabel = typeof edge.label === "string" ? edge.label : "";
    const eventBadge = event === "accept" ? "✅ Acepta" : event === "decline" ? "❌ Declina" : "➡️ Continúa";
    lines.push(`| \`${from}\` | ${eventBadge} | \`${to}\` | ${edgeLabel} |`);
  });

  lines.push(``);
  lines.push(`---`);
  lines.push(`*Generado automáticamente por Hallazia Funnel Engine.*`);

  return lines.join("\n");
}
