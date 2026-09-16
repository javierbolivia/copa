export interface LandingContentSection extends Record<string, unknown> {
  id?: string;
  type: string;
  enabled?: boolean;
  variant?: "editorial" | "centered";
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  cta?: string;
  items?: Array<string | Record<string, unknown>>;
  evidenceIds?: string[];
}

export interface LandingDesignTokens {
  accent: string;
  background: string;
  text: string;
  font: "sans" | "serif";
  width: "compact" | "wide";
  spacing: "compact" | "relaxed";
  theme?: string | undefined;
}

export interface MetaPixelConfig {
  pixelId?: string | undefined;
  trackPageView?: boolean | undefined;
  trackViewContent?: boolean | undefined;
  trackInitiateCheckout?: boolean | undefined;
  trackLead?: boolean | undefined;
  trackPurchase?: boolean | undefined;
}

export interface ExternalCheckoutConfig {
  platform: "hotmart" | "skool" | "custom" | "none";
  checkoutUrl?: string | undefined;
  offerId?: string | undefined;
  productSku?: string | undefined;
}

export interface LandingDocument {
  schemaVersion?: number;
  title: string;
  sections: LandingContentSection[];
  designTokens?: LandingDesignTokens | undefined;
  footerNote?: string | undefined;
  evidenceIds?: string[] | undefined;
  tracking?: {
    metaPixel?: MetaPixelConfig | undefined;
  } | undefined;
  externalCheckout?: ExternalCheckoutConfig | undefined;
}

export const CANONICAL_LANDING_BLOCKS = [
  "hero",
  "problem",
  "agitation",
  "mechanism",
  "benefits",
  "product",
  "deliverables",
  "bonuses",
  "proof",
  "objections",
  "faq",
  "offer",
  "guarantee",
  "cta",
  "footer",
] as const;

export type CanonicalLandingBlockType = (typeof CANONICAL_LANDING_BLOCKS)[number];

export const CANONICAL_LANDING_LABELS: Record<CanonicalLandingBlockType, string> = {
  hero: "Hero (Apertura)",
  problem: "Problema",
  agitation: "Agitación",
  mechanism: "Solución / Mecanismo",
  benefits: "Beneficios",
  product: "Producto",
  deliverables: "Entregables",
  bonuses: "Bonos",
  proof: "Prueba y Evidencia",
  objections: "Objeciones",
  faq: "FAQ",
  offer: "Oferta",
  guarantee: "Garantía",
  cta: "Llamada a la Acción",
  footer: "Pie de Página",
};

export const DEFAULT_LANDING_TOKENS: LandingDesignTokens = {
  accent: "#2563eb",
  background: "#f8fafc",
  text: "#0f172a",
  font: "sans",
  width: "compact",
  spacing: "relaxed",
  theme: "modern",
};

export const LANDING_THEME_PRESETS: Record<string, LandingDesignTokens> = {
  modern: {
    accent: "#2563eb",
    background: "#f8fafc",
    text: "#0f172a",
    font: "sans",
    width: "compact",
    spacing: "relaxed",
    theme: "modern",
  },
  warm: {
    accent: "#d97706",
    background: "#fffbeb",
    text: "#1c1917",
    font: "serif",
    width: "compact",
    spacing: "relaxed",
    theme: "warm",
  },
  dark: {
    accent: "#06b6d4",
    background: "#0b0f19",
    text: "#f1f5f9",
    font: "sans",
    width: "wide",
    spacing: "relaxed",
    theme: "dark",
  },
  editorial: {
    accent: "#059669",
    background: "#fcfbf7",
    text: "#1a202c",
    font: "serif",
    width: "compact",
    spacing: "relaxed",
    theme: "editorial",
  },
  minimal: {
    accent: "#18181b",
    background: "#ffffff",
    text: "#27272a",
    font: "sans",
    width: "compact",
    spacing: "compact",
    theme: "minimal",
  },
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const escape = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );

export function landingDesignTokens(input: unknown, fallbackTheme?: string): LandingDesignTokens {
  const value = record(input);
  const themeName = (typeof value.theme === "string" && value.theme) ? value.theme : (fallbackTheme ?? "");
  const preset = LANDING_THEME_PRESETS[themeName] ?? DEFAULT_LANDING_TOKENS;
  const color = (key: "accent" | "background" | "text") =>
    typeof value[key] === "string" && /^#[0-9a-f]{6}$/i.test(value[key])
      ? (value[key] as string)
      : preset[key];

  return {
    accent: color("accent"),
    background: color("background"),
    text: color("text"),
    font: value.font === "serif" || (preset.font === "serif" && value.font === undefined) ? "serif" : "sans",
    width: value.width === "wide" || (preset.width === "wide" && value.width === undefined) ? "wide" : "compact",
    spacing: value.spacing === "compact" || (preset.spacing === "compact" && value.spacing === undefined) ? "compact" : "relaxed",
    theme: themeName || preset.theme,
  };
}

/** Static, escaped HTML used by preview and server export with full professional styling. */
export function renderLandingHtml(input: unknown): string {
  const output = record(input);
  const themeFallback = typeof output.theme === "string" ? output.theme : undefined;
  const tokens = landingDesignTokens(output.designTokens, themeFallback);
  const sections = (Array.isArray(output.sections) ? output.sections : [])
    .map(record)
    .filter((section) => section.enabled !== false);
  const offerIndex = sections.findIndex((item) => item.type === "offer");
  const target = `section-${offerIndex < 0 ? 0 : offerIndex}`;

  const externalCheckout = record(output.externalCheckout);
  const externalCheckoutUrl = typeof externalCheckout.checkoutUrl === "string" && externalCheckout.checkoutUrl.trim() ? externalCheckout.checkoutUrl.trim() : "";
  const tracking = record(output.tracking);
  const metaPixel = record(tracking.metaPixel);
  const pixelId = typeof metaPixel.pixelId === "string" && metaPixel.pixelId.trim() ? metaPixel.pixelId.trim() : "";

  const content = sections
    .map((section, index) => {
      const type = String(section.type ?? "content");
      const hero = type === "hero";
      const tag = hero ? "h1" : "h2";
      const items = Array.isArray(section.items) ? section.items : [];
      const centered = section.variant === "centered" || ["hero", "offer", "guarantee", "cta", "footer"].includes(type);

      let itemsHtml = "";
      if (items.length > 0) {
        const itemCards = items.map((raw, itemIdx) => {
          const item = record(raw);
          if (typeof raw === "string") {
            return `<article class="hl-item"><p>${escape(raw)}</p></article>`;
          }
          if (item.q !== undefined) {
            return `<article class="hl-item hl-item--qa"><div class="hl-q-badge">${type === "objections" ? "Objeción" : "Pregunta"}</div><h3>${escape(item.q)}</h3><p>${escape(item.a)}</p></article>`;
          }
          const itemTitle = escape(item.name ?? item.title ?? "");
          const itemDesc = escape(item.description ?? item.text ?? "");
          const badge = type === "mechanism" ? `<div class="hl-step-num">${String(itemIdx + 1).padStart(2, "0")}</div>` :
            type === "bonuses" ? `<div class="hl-bonus-badge">BONO EXCLUSIVO</div>` :
            type === "benefits" ? `<div class="hl-check-badge">✓</div>` : "";
          return `<article class="hl-item">${badge}${itemTitle ? `<h3>${itemTitle}</h3>` : ""}${itemDesc ? `<p>${itemDesc}</p>` : ""}</article>`;
        }).join("");
        itemsHtml = `<div class="hl-items hl-items--${type}">${itemCards}</div>`;
      }

      const isDirectCheckout = Boolean(externalCheckoutUrl && (type === "offer" || type === "cta"));
      const ctaHref = isDirectCheckout ? escape(externalCheckoutUrl) : `#${target}`;
      const ctaTarget = isDirectCheckout ? ` target="_blank" rel="noopener noreferrer"` : "";
      const ctaOnClick = isDirectCheckout && pixelId ? ` onclick="if(window.fbq)fbq('track','InitiateCheckout');"` : "";

      return `<section id="section-${index}" class="hl-block hl-block--${escape(type)}${centered ? " hl-block--centered" : " hl-block--editorial"}">` +
        (section.eyebrow ? `<p class="hl-eyebrow">${escape(section.eyebrow)}</p>` : "") +
        (section.headline ? `<${tag}>${escape(section.headline)}</${tag}>` : "") +
        (section.subheadline ? `<p class="hl-lead">${escape(section.subheadline)}</p>` : "") +
        (section.body ? `<div class="hl-body"><p>${escape(section.body)}</p></div>` : "") +
        itemsHtml +
        (section.cta ? `<div class="hl-cta-wrap"><a class="hl-cta" href="${ctaHref}"${ctaTarget}${ctaOnClick}>${escape(section.cta)}</a></div>` : "") +
        `</section>`;
    })
    .join("");

  const pixelSnippet = pixelId ? `
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${escape(pixelId)}');
fbq('track', 'PageView');
${metaPixel.trackViewContent !== false ? "fbq('track', 'ViewContent');" : ""}
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${escape(pixelId)}&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->
` : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(output.title ?? "Landing Page")}</title>
${pixelSnippet}
<style>
*{box-sizing:border-box}
:root{
  --hl-accent:${tokens.accent};
  --hl-bg:${tokens.background};
  --hl-text:${tokens.text};
  --hl-width:${tokens.width === "wide" ? "1160px" : "880px"};
  --hl-space:${tokens.spacing === "compact" ? "36px" : "64px"};
}
body{
  margin:0;
  font:16px/1.75 ${tokens.font === "serif" ? "Georgia,Cambria,serif" : "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"};
  color:var(--hl-text);
  background:var(--hl-bg);
  -webkit-font-smoothing:antialiased;
}
main,footer{max-width:var(--hl-width);margin:auto}
.hl-block{
  padding:var(--hl-space) clamp(20px,5vw,56px);
  border-bottom:1px solid #94a3b833;
}
.hl-block--hero{
  border-top:6px solid var(--hl-accent);
  padding-top:calc(var(--hl-space) * 1.25);
  padding-bottom:calc(var(--hl-space) * 1.25);
}
.hl-block--centered{text-align:center}
.hl-block--editorial{text-align:left}
h1,h2,h3{line-height:1.15;color:inherit;margin:0 0 16px;overflow-wrap:anywhere}
h1{font-size:clamp(2.2rem,5.5vw,3.8rem);letter-spacing:-.04em}
h2{font-size:clamp(1.6rem,3.8vw,2.5rem);letter-spacing:-.025em}
h3{font-size:1.15rem;font-weight:700}
.hl-eyebrow{
  color:var(--hl-accent);
  font-size:.82rem;
  font-weight:700;
  letter-spacing:.12em;
  text-transform:uppercase;
  margin:0 0 12px;
}
.hl-lead{font-size:clamp(1.1rem,2vw,1.35rem);line-height:1.6;opacity:.92;margin:0 0 24px}
.hl-body{font-size:1.05rem;line-height:1.8;white-space:pre-wrap;margin:0 0 24px}
.hl-body p{margin:0 0 12px}
.hl-items{
  display:grid;
  gap:18px;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));
  margin:28px 0;
  text-align:left;
}
.hl-items--faq,.hl-items--objections{grid-template-columns:1fr}
.hl-item{
  padding:22px;
  border:1px solid #94a3b833;
  border-radius:14px;
  background:rgba(255,255,255,0.6);
  backdrop-filter:blur(4px);
  transition:transform .15s ease;
}
.hl-item p{margin:0;line-height:1.65;font-size:.97rem}
.hl-item h3{margin:0 0 8px;font-size:1.1rem}
.hl-step-num{
  display:inline-block;
  font-size:.85rem;
  font-weight:800;
  color:var(--hl-accent);
  background:rgba(37,99,235,0.08);
  border-radius:6px;
  padding:2px 8px;
  margin-bottom:10px;
}
.hl-bonus-badge{
  display:inline-block;
  font-size:.72rem;
  font-weight:800;
  letter-spacing:.08em;
  color:#b45309;
  background:#fef3c7;
  border-radius:6px;
  padding:3px 8px;
  margin-bottom:10px;
}
.hl-check-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:24px;
  height:24px;
  border-radius:50%;
  background:var(--hl-accent);
  color:#fff;
  font-weight:bold;
  font-size:14px;
  margin-bottom:10px;
}
.hl-q-badge{
  font-size:.75rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.06em;
  opacity:.7;
  margin-bottom:6px;
}
.hl-block--offer{
  background:rgba(37,99,235,0.03);
  border:2px solid var(--hl-accent);
  border-radius:20px;
  margin:32px auto;
}
.hl-block--guarantee{
  border-left:4px solid var(--hl-accent);
  background:rgba(16,185,129,0.04);
}
.hl-cta-wrap{margin-top:28px}
.hl-cta{
  display:inline-block;
  padding:16px 36px;
  background:var(--hl-accent);
  color:#fff !important;
  text-decoration:none;
  font-weight:700;
  font-size:1.1rem;
  border-radius:36px;
  box-shadow:0 4px 14px rgba(0,0,0,0.12);
  transition:transform .15s ease,box-shadow .15s ease;
}
.hl-cta:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(0,0,0,0.16)}
footer{padding:32px 20px;font-size:.85rem;opacity:.75;text-align:center}
@media(max-width:640px){
  .hl-block{padding:36px 18px}
  .hl-items{grid-template-columns:1fr}
  .hl-cta{display:block;width:100%;text-align:center;padding:16px 20px}
}
</style>
</head>
<body>
<main>
${content}
</main>
${output.footerNote ? `<footer>${escape(output.footerNote)}</footer>` : ""}
</body>
</html>`;
}

/** Generates a self-contained, production-ready React component without Puck or dependencies. */
export function renderLandingReactCode(input: unknown): string {
  const output = record(input);
  const themeFallback = typeof output.theme === "string" ? output.theme : undefined;
  const tokens = landingDesignTokens(output.designTokens, themeFallback);
  const rawSections = Array.isArray(output.sections) ? output.sections : [];
  const safeData = JSON.stringify(
    {
      title: output.title ?? "Landing",
      footerNote: output.footerNote ?? "",
      designTokens: tokens,
      sections: rawSections,
      externalCheckout: output.externalCheckout,
      tracking: output.tracking,
    },
    null,
    2,
  );

  return `// LandingPage.tsx
// Componente React independiente exportado desde Hallazia.
// Cero dependencias externas. Listo para producción con Next.js, Vite o Remix.

import React from "react";

export interface LandingContentSection {
  id?: string;
  type: string;
  enabled?: boolean;
  variant?: "editorial" | "centered";
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  cta?: string;
  items?: Array<string | Record<string, unknown>>;
  evidenceIds?: string[];
}

export interface LandingData {
  title: string;
  footerNote?: string;
  designTokens: {
    accent: string;
    background: string;
    text: string;
    font: "sans" | "serif";
    width: "compact" | "wide";
    spacing: "compact" | "relaxed";
    theme?: string;
  };
  sections: LandingContentSection[];
  externalCheckout?: {
    platform?: "hotmart" | "skool" | "custom" | "none";
    checkoutUrl?: string;
  };
  tracking?: {
    metaPixel?: {
      pixelId?: string;
    };
  };
}

export const LANDING_DATA: LandingData = ${safeData};

export default function LandingPage({ data = LANDING_DATA }: { data?: LandingData }) {
  const { designTokens: t, sections, footerNote, externalCheckout } = data;
  const activeSections = sections.filter((s) => s.enabled !== false);
  const offerIndex = activeSections.findIndex((s) => s.type === "offer");
  const offerTarget = \`#section-\${offerIndex < 0 ? 0 : offerIndex}\`;
  const checkoutUrl = externalCheckout?.checkoutUrl;

  const rootStyle: React.CSSProperties = {
    fontFamily: t.font === "serif" ? "Georgia, Cambria, serif" : "system-ui, -apple-system, sans-serif",
    backgroundColor: t.background,
    color: t.text,
    minHeight: "100vh",
    margin: 0,
    lineHeight: 1.75,
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: t.width === "wide" ? "1160px" : "880px",
    margin: "0 auto",
  };

  return (
    <div style={rootStyle}>
      <main style={containerStyle}>
        {activeSections.map((section, idx) => (
          <LandingSectionComponent
            key={section.id || idx}
            index={idx}
            section={section}
            accent={t.accent}
            spacing={t.spacing}
            offerTarget={offerTarget}
            checkoutUrl={checkoutUrl}
          />
        ))}
      </main>
      {footerNote && (
        <footer style={{ ...containerStyle, padding: "32px 20px", textAlign: "center", fontSize: "0.85rem", opacity: 0.75 }}>
          {footerNote}
        </footer>
      )}
    </div>
  );
}

function LandingSectionComponent({
  section,
  index,
  accent,
  spacing,
  offerTarget,
  checkoutUrl,
}: {
  section: LandingContentSection;
  index: number;
  accent: string;
  spacing: "compact" | "relaxed";
  offerTarget: string;
  checkoutUrl?: string;
}) {
  const isHero = section.type === "hero";
  const isCentered = section.variant === "centered" || ["hero", "offer", "guarantee", "cta", "footer"].includes(section.type);
  const isDirectCheckout = Boolean(checkoutUrl && (section.type === "offer" || section.type === "cta"));

  const sectionStyle: React.CSSProperties = {
    padding: \`\${spacing === "compact" ? "36px" : "64px"} 24px\`,
    borderBottom: "1px solid rgba(148, 163, 184, 0.2)",
    textAlign: isCentered ? "center" : "left",
    ...(isHero ? { borderTop: \`6px solid \${accent}\`, paddingTop: "80px" } : {}),
    ...(section.type === "offer" ? { backgroundColor: "rgba(37,99,235,0.03)", border: \`2px solid \${accent}\`, borderRadius: "20px", margin: "32px auto" } : {}),
  };

  const ctaStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "16px 36px",
    backgroundColor: accent,
    color: "#fff",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "1.1rem",
    borderRadius: "36px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
    marginTop: "24px",
  };

  return (
    <section id={\`section-\${index}\`} style={sectionStyle}>
      {section.eyebrow && (
        <p style={{ color: accent, fontSize: "0.82rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 12px" }}>
          {section.eyebrow}
        </p>
      )}
      {section.headline && (
        isHero ? (
          <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", lineHeight: 1.15, margin: "0 0 16px" }}>{section.headline}</h1>
        ) : (
          <h2 style={{ fontSize: "clamp(1.6rem, 3.8vw, 2.4rem)", lineHeight: 1.2, margin: "0 0 16px" }}>{section.headline}</h2>
        )
      )}
      {section.subheadline && (
        <p style={{ fontSize: "1.2rem", lineHeight: 1.6, opacity: 0.9, margin: "0 0 20px" }}>{section.subheadline}</p>
      )}
      {section.body && (
        <p style={{ fontSize: "1.05rem", lineHeight: 1.8, whiteSpace: "pre-wrap", margin: "0 0 24px" }}>{section.body}</p>
      )}
      {section.items && section.items.length > 0 && (
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: ["faq", "objections"].includes(section.type) ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))", margin: "24px 0", textAlign: "left" }}>
          {section.items.map((rawItem, i) => {
            const item = typeof rawItem === "object" && rawItem !== null ? (rawItem as Record<string, unknown>) : null;
            return (
              <article key={i} style={{ padding: "20px", borderRadius: "14px", border: "1px solid rgba(148, 163, 184, 0.25)", background: "rgba(255,255,255,0.6)" }}>
                {typeof rawItem === "string" ? (
                  <p style={{ margin: 0 }}>{rawItem}</p>
                ) : item?.q !== undefined ? (
                  <>
                    <small style={{ fontWeight: 700, textTransform: "uppercase", opacity: 0.7 }}>{section.type === "objections" ? "Objeción" : "Pregunta"}</small>
                    <h3 style={{ margin: "4px 0 8px", fontSize: "1.1rem" }}>{String(item.q)}</h3>
                    <p style={{ margin: 0 }}>{String(item.a ?? "")}</p>
                  </>
                ) : (
                  <>
                    {section.type === "mechanism" && <span style={{ color: accent, fontWeight: 800, fontSize: "0.85rem" }}>PASO {i + 1}</span>}
                    {section.type === "bonuses" && <span style={{ color: "#b45309", fontWeight: 700, fontSize: "0.75rem" }}>BONO EXCLUSIVO</span>}
                    <h3 style={{ margin: "4px 0 8px", fontSize: "1.1rem" }}>{String(item?.name ?? item?.title ?? "")}</h3>
                    <p style={{ margin: 0 }}>{String(item?.description ?? item?.text ?? "")}</p>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {section.cta && (
        <div>
          <a
            href={isDirectCheckout ? (checkoutUrl || offerTarget) : offerTarget}
            target={isDirectCheckout ? "_blank" : undefined}
            rel={isDirectCheckout ? "noopener noreferrer" : undefined}
            onClick={() => {
              if (isDirectCheckout && typeof window !== "undefined" && (window as any).fbq) {
                (window as any).fbq("track", "InitiateCheckout");
              }
            }}
            style={ctaStyle}
          >
            {section.cta}
          </a>
        </div>
      )}
    </section>
  );
}
`;
}
