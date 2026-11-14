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
  imageUrl?: string;
  imageAlt?: string;
  items?: Array<string | Record<string, unknown>>;
  evidenceIds?: string[];
  /** Visual layout for the block (see LANDING_SECTION_LAYOUTS). */
  layout?: string;
  /** Small highlighted pill / seal text (e.g. "Más elegido", "Garantía 14 días"). */
  badge?: string;
  stats?: Array<{ value: string; label: string }>;
  bullets?: string[];
  price?: string;
  oldPrice?: string;
  priceNote?: string;
  beforeLabel?: string;
  afterLabel?: string;
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

export function landingImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (url.startsWith("/") && !url.startsWith("//") && !/[\\\x00-\x1f]/u.test(url)) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : "";
  } catch {
    return "";
  }
}

export function landingCheckoutUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim();
  if (!url || /[\\\x00-\x1f]/u.test(url)) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? url : "";
  } catch {
    return "";
  }
}

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

export interface LandingStat {
  value: string;
  label: string;
}

/** Allowed visual layouts per canonical block. The first entry is the default. */
export const LANDING_SECTION_LAYOUTS: Record<CanonicalLandingBlockType, readonly string[]> = {
  hero: ["split", "centered", "stats"],
  problem: ["cards", "list", "comparison"],
  agitation: ["list", "cards", "comparison"],
  mechanism: ["steps", "cards", "list"],
  benefits: ["checklist", "cards", "list"],
  product: ["cards", "split", "list"],
  deliverables: ["cards", "checklist", "list"],
  bonuses: ["cards", "list"],
  proof: ["testimonials", "stats", "cards"],
  objections: ["accordion", "cards"],
  faq: ["accordion", "cards"],
  offer: ["pricing", "cards"],
  guarantee: ["badge", "centered"],
  cta: ["centered", "split"],
  footer: ["centered"],
};

export const LANDING_LAYOUT_LABELS: Record<string, string> = {
  split: "Dividido con imagen",
  centered: "Centrado",
  stats: "Cifras destacadas",
  cards: "Tarjetas",
  list: "Lista con iconos",
  comparison: "Comparativa Antes / Después",
  steps: "Pasos numerados",
  checklist: "Checklist",
  testimonials: "Testimonios",
  accordion: "Acordeón desplegable",
  pricing: "Tarjeta de precio",
  badge: "Sello de garantía",
};

export function resolveLandingLayout(section: Record<string, unknown>): string {
  const type = String(section.type ?? "");
  const allowed = (LANDING_SECTION_LAYOUTS as Record<string, readonly string[] | undefined>)[type];
  const requested = typeof section.layout === "string" ? section.layout.trim() : "";
  if (allowed && allowed.includes(requested)) {
    if (type === "hero" && requested === "split" && !landingImageUrl(section.imageUrl)) return "centered";
    return requested;
  }
  if (!allowed && requested && LANDING_LAYOUT_LABELS[requested]) return requested;
  if (type === "hero") return landingImageUrl(section.imageUrl) ? "split" : "centered";
  return allowed?.[0] ?? "cards";
}

export function landingStats(value: unknown): LandingStat[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .map((stat) => ({ value: String(stat.value ?? "").trim().slice(0, 40), label: String(stat.label ?? "").trim().slice(0, 120) }))
    .filter((stat) => stat.value && stat.label)
    .slice(0, 6);
}

export function landingTextList(value: unknown, max = 10): string[] {
  return (Array.isArray(value) ? value : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 300))
    .slice(0, max);
}

function hexLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 1;
  const n = Number.parseInt(match[1]!, 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

const DEFAULT_ITEM_ICONS: Record<string, string> = {
  problem: "⚠️",
  agitation: "⏳",
  benefits: "✓",
  product: "📘",
  deliverables: "📦",
  bonuses: "🎁",
  proof: "★",
};

function itemIcon(type: string, item: Record<string, unknown>): string {
  const custom = typeof item.icon === "string" ? item.icon.trim() : "";
  return custom && custom.length <= 8 ? custom : (DEFAULT_ITEM_ICONS[type] ?? "•");
}

function renderItemsByLayout(type: string, layout: string, items: unknown[], section: Record<string, unknown>): string {
  if (!items.length) return "";
  const objects = items.map((raw) => (typeof raw === "string" ? { description: raw } : record(raw)));
  const isQa = objects.some((item) => item.q !== undefined);
  const title = (item: Record<string, unknown>) => escape(item.name ?? item.title ?? "");
  const desc = (item: Record<string, unknown>) => escape(item.description ?? item.text ?? "");

  if (isQa) {
    if (layout === "accordion") {
      return `<div class="hl-accordion hl-items--${escape(type)}">${objects
        .map(
          (item, idx) =>
            `<details class="hl-item hl-item--qa"${idx === 0 ? " open" : ""}><summary><h3>${escape(item.q)}</h3><span class="hl-acc-icon" aria-hidden="true">+</span></summary><p>${escape(item.a)}</p></details>`,
        )
        .join("")}</div>`;
    }
    return `<div class="hl-items hl-items--${escape(type)}">${objects
      .map((item) => `<article class="hl-item hl-item--qa"><div class="hl-q-badge">${type === "objections" ? "Objeción" : "Pregunta"}</div><h3>${escape(item.q)}</h3><p>${escape(item.a)}</p></article>`)
      .join("")}</div>`;
  }

  if (layout === "comparison" && objects.some((item) => item.before !== undefined || item.after !== undefined)) {
    const beforeLabel = escape(section.beforeLabel || "Sin un método claro");
    const afterLabel = escape(section.afterLabel || "Con este método");
    return `<div class="hl-compare" role="table"><div class="hl-compare__row hl-compare__head" role="row"><span role="columnheader"></span><span role="columnheader" class="is-before">✕ ${beforeLabel}</span><span role="columnheader" class="is-after">✓ ${afterLabel}</span></div>${objects
      .map(
        (item) =>
          `<div class="hl-compare__row" role="row"><strong role="cell">${title(item)}</strong><span role="cell" class="is-before">${escape(item.before ?? "")}</span><span role="cell" class="is-after">${escape(item.after ?? item.description ?? "")}</span></div>`,
      )
      .join("")}</div>`;
  }

  if (layout === "steps") {
    return `<ol class="hl-steps">${objects
      .map(
        (item, idx) =>
          `<li class="hl-step"><span class="hl-step-num">${String(idx + 1).padStart(2, "0")}</span><div>${title(item) ? `<h3>${title(item)}</h3>` : ""}${desc(item) ? `<p>${desc(item)}</p>` : ""}</div></li>`,
      )
      .join("")}</ol>`;
  }

  if (layout === "checklist") {
    return `<ul class="hl-checklist">${objects
      .map(
        (item) =>
          `<li><span class="hl-check" aria-hidden="true">✓</span><div>${title(item) ? `<strong>${title(item)}</strong>` : ""}${desc(item) ? `<span>${desc(item)}</span>` : ""}</div></li>`,
      )
      .join("")}</ul>`;
  }

  if (layout === "list") {
    return `<ul class="hl-list">${objects
      .map(
        (item) =>
          `<li><span class="hl-list-icon" aria-hidden="true">${escape(itemIcon(type, item))}</span><div>${title(item) ? `<strong>${title(item)}</strong>` : ""}${desc(item) ? `<p>${desc(item)}</p>` : ""}</div></li>`,
      )
      .join("")}</ul>`;
  }

  if (layout === "testimonials") {
    return `<div class="hl-quotes">${objects
      .map((item) => {
        const rating = typeof item.rating === "number" ? Math.max(1, Math.min(5, Math.round(item.rating))) : 0;
        return `<figure class="hl-quote">${rating ? `<div class="hl-stars" aria-label="${rating} de 5">${"★".repeat(rating)}</div>` : ""}<blockquote>“${desc(item)}”</blockquote><figcaption>${title(item) ? `<strong>${title(item)}</strong>` : ""}${item.role ? `<span>${escape(item.role)}</span>` : ""}</figcaption></figure>`;
      })
      .join("")}</div>`;
  }

  const badge = (item: Record<string, unknown>) =>
    type === "bonuses"
      ? `<div class="hl-bonus-badge">BONO</div>`
      : type === "deliverables"
        ? `<div class="hl-deliverable-badge">INCLUIDO</div>`
        : type === "mechanism"
          ? ""
          : `<span class="hl-icon" aria-hidden="true">${escape(itemIcon(type, item))}</span>`;
  return `<div class="hl-items hl-items--${escape(type)}">${objects
    .map(
      (item, idx) =>
        `<article class="hl-item">${type === "mechanism" ? `<div class="hl-step-num">${String(idx + 1).padStart(2, "0")}</div>` : badge(item)}${title(item) ? `<h3>${title(item)}</h3>` : ""}${desc(item) ? `<p>${desc(item)}</p>` : ""}</article>`,
    )
    .join("")}</div>`;
}

function renderStats(stats: LandingStat[]): string {
  return stats.length
    ? `<div class="hl-stats">${stats.map((stat) => `<div class="hl-stat"><strong>${escape(stat.value)}</strong><span>${escape(stat.label)}</span></div>`).join("")}</div>`
    : "";
}

function renderBullets(bullets: string[]): string {
  return bullets.length ? `<ul class="hl-bullets">${bullets.map((b) => `<li><span aria-hidden="true">✓</span>${escape(b)}</li>`).join("")}</ul>` : "";
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
  const isDarkBg = hexLuminance(tokens.background) < 0.18;
  const ctaText = hexLuminance(tokens.accent) > 0.45 ? "#0b1220" : "#ffffff";

  const externalCheckout = record(output.externalCheckout);
  const externalCheckoutUrl = externalCheckout.platform !== "none" ? landingCheckoutUrl(externalCheckout.checkoutUrl) : "";
  const tracking = record(output.tracking);
  const metaPixel = record(tracking.metaPixel);
  const pixelId = typeof metaPixel.pixelId === "string" && /^\d{5,30}$/u.test(metaPixel.pixelId.trim()) ? metaPixel.pixelId.trim() : "";
  const pixelClick = pixelId ? ` onclick="if(window.fbq)fbq('track','InitiateCheckout');"` : "";

  const content = sections
    .map((section, index) => {
      const type = String(section.type ?? "content");
      const hero = type === "hero";
      const tag = hero ? "h1" : "h2";
      const layout = resolveLandingLayout(section);
      const items = Array.isArray(section.items) ? section.items : [];
      const stats = landingStats(section.stats);
      const bullets = landingTextList(section.bullets, 8);
      const centered =
        layout === "centered" ||
        layout === "pricing" ||
        layout === "stats" ||
        (section.variant === "centered" && layout !== "split") ||
        ["offer", "cta", "footer"].includes(type);
      const imageUrl = landingImageUrl(section.imageUrl);
      const imageHtml = imageUrl
        ? `<figure class="hl-media"><img src="${escape(imageUrl)}" alt="${escape(section.imageAlt ?? "")}" loading="${hero ? "eager" : "lazy"}" decoding="async"></figure>`
        : "";

      const isDirectCheckout = Boolean(externalCheckoutUrl && (type === "offer" || type === "cta"));
      const ctaHref = isDirectCheckout ? escape(externalCheckoutUrl) : `#${target}`;
      const ctaTarget = isDirectCheckout ? ` target="_blank" rel="noopener noreferrer"` : "";
      const ctaOnClick = isDirectCheckout ? pixelClick : "";
      const showCta = Boolean(section.cta) && (isDirectCheckout || (type !== "offer" && offerIndex >= 0));
      const ctaHtml = showCta
        ? `<div class="hl-cta-wrap"><a class="hl-cta" href="${ctaHref}"${ctaTarget}${ctaOnClick}>${escape(section.cta)} <span aria-hidden="true">→</span></a></div>`
        : "";
      const pill = section.badge && type !== "guarantee" ? `<span class="hl-pill">${escape(section.badge)}</span>` : "";
      const head =
        pill +
        (section.eyebrow ? `<p class="hl-eyebrow">${escape(section.eyebrow)}</p>` : "") +
        (section.headline ? `<${tag}>${escape(section.headline)}</${tag}>` : "") +
        (section.subheadline ? `<p class="hl-lead">${escape(section.subheadline)}</p>` : "") +
        (section.body ? `<div class="hl-body"><p>${escape(section.body)}</p></div>` : "");
      const itemsHtml = renderItemsByLayout(type, layout, items, section);
      const classes = [
        "hl-block",
        `hl-block--${escape(type)}`,
        `hl-layout--${escape(layout)}`,
        centered ? "hl-block--centered" : "hl-block--editorial",
        imageUrl ? "hl-block--with-image" : "",
        !hero && index % 2 === 0 ? "hl-block--alt" : "",
        type === "proof" || type === "cta" ? "hl-block--inverse" : "",
      ]
        .filter(Boolean)
        .join(" ");

      let inner: string;
      if (hero) {
        const heroContent = `<div class="hl-block__content">${head}${renderBullets(bullets)}${ctaHtml}${renderStats(stats)}</div>`;
        inner = layout === "split" && imageHtml ? `<div class="hl-wrap hl-split">${heroContent}${imageHtml}</div>` : `<div class="hl-wrap">${heroContent}${imageHtml ? imageHtml.replace('class="hl-media"', 'class="hl-media hl-media--wide"') : ""}</div>`;
      } else if (layout === "pricing") {
        const price = typeof section.price === "string" ? section.price.trim() : "";
        const oldPrice = typeof section.oldPrice === "string" ? section.oldPrice.trim() : "";
        const priceNote = typeof section.priceNote === "string" ? section.priceNote.trim() : "";
        const included = items.length
          ? `<ul class="hl-included">${items
              .map((raw) => {
                const item = typeof raw === "string" ? { description: raw } : record(raw);
                const name = escape(item.name ?? item.title ?? "");
                const d = escape(item.description ?? item.text ?? "");
                return `<li><span class="hl-check" aria-hidden="true">✓</span><div>${name ? `<strong>${name}</strong>` : ""}${d ? `<span>${d}</span>` : ""}</div></li>`;
              })
              .join("")}</ul>`
          : "";
        const offerCta = section.cta
          ? isDirectCheckout
            ? `<a class="hl-cta hl-cta--block" href="${ctaHref}"${ctaTarget}${ctaOnClick}>${escape(section.cta)} <span aria-hidden="true">→</span></a>`
            : `<span class="hl-cta hl-cta--block hl-cta--static">${escape(section.cta)}</span>`
          : "";
        inner = `<div class="hl-wrap"><div class="hl-block__content hl-head">${head}</div><div class="hl-pricing">${
          section.badge ? `<span class="hl-pricing__badge">${escape(section.badge)}</span>` : ""
        }${imageHtml}${included}<div class="hl-price">${oldPrice ? `<s>${escape(oldPrice)}</s>` : ""}${price ? `<strong>${escape(price)}</strong>` : ""}${
          priceNote ? `<span>${escape(priceNote)}</span>` : ""
        }</div>${offerCta}${renderBullets(bullets)}</div></div>`;
      } else if (layout === "badge") {
        inner = `<div class="hl-wrap hl-guarantee"><div class="hl-seal" aria-hidden="true"><span>${escape(section.badge || "GARANTÍA")}</span></div><div class="hl-block__content">${head}${renderBullets(bullets)}${itemsHtml}${ctaHtml}</div>${imageHtml}</div>`;
      } else if (imageHtml && (layout === "split" || !items.length)) {
        inner = `<div class="hl-wrap hl-split"><div class="hl-block__content">${head}${renderBullets(bullets)}${renderStats(stats)}${itemsHtml}${ctaHtml}</div>${imageHtml}</div>`;
      } else if (imageHtml) {
        inner = `<div class="hl-wrap"><div class="hl-split hl-split--head"><div class="hl-block__content">${head}${renderBullets(bullets)}</div>${imageHtml}</div>${renderStats(stats)}${itemsHtml}${ctaHtml}</div>`;
      } else {
        inner = `<div class="hl-wrap"><div class="hl-block__content hl-head">${head}${renderBullets(bullets)}</div>${renderStats(stats)}${itemsHtml}${ctaHtml}</div>`;
      }

      return `<section id="section-${index}" class="${classes}">${inner}</section>`;
    })
    .join("");

  const stickySource = sections[offerIndex] ?? sections.find((s) => typeof s.cta === "string" && s.cta.trim());
  const stickyLabel = typeof stickySource?.cta === "string" ? stickySource.cta.trim() : "";
  const stickyHref = externalCheckoutUrl ? escape(externalCheckoutUrl) : offerIndex >= 0 ? `#${target}` : "";
  const stickyAttrs = externalCheckoutUrl ? ` target="_blank" rel="noopener noreferrer"${pixelClick}` : "";
  const topbar =
    stickyLabel && stickyHref
      ? `<header class="hl-topbar"><div class="hl-topbar__inner"><strong>${escape(output.title ?? "")}</strong><a class="hl-cta hl-cta--sm" href="${stickyHref}"${stickyAttrs}>${escape(stickyLabel)}</a></div></header>`
      : "";
  const stickyCta = stickyLabel && stickyHref ? `<a class="hl-sticky-cta" href="${stickyHref}"${stickyAttrs}>${escape(stickyLabel)} →</a>` : "";

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

  const surface = isDarkBg ? "color-mix(in srgb,var(--hl-text) 6%,var(--hl-bg))" : "#ffffff";
  const alt = isDarkBg ? "color-mix(in srgb,var(--hl-accent) 7%,var(--hl-bg))" : "color-mix(in srgb,var(--hl-accent) 5%,var(--hl-bg))";
  const line = isDarkBg ? "rgba(148,163,184,.18)" : "rgba(15,23,42,.09)";

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
  --hl-cta-text:${ctaText};
  --hl-surface:${surface};
  --hl-alt:${alt};
  --hl-line:${line};
  --hl-width:${tokens.width === "wide" ? "1160px" : "980px"};
  --hl-space:${tokens.spacing === "compact" ? "56px" : "96px"};
  --hl-radius:20px;
}
html{scroll-behavior:smooth}
body{margin:0;font:17px/1.7 ${tokens.font === "serif" ? "Georgia,Cambria,'Times New Roman',serif" : "Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"};color:var(--hl-text);background:var(--hl-bg);-webkit-font-smoothing:antialiased}
main{display:block}
.hl-wrap{max-width:var(--hl-width);margin:0 auto}
.hl-block{position:relative;padding:var(--hl-space) clamp(20px,5vw,48px)}
.hl-block--alt{background:var(--hl-alt)}
.hl-block--centered .hl-block__content,.hl-block--centered .hl-head{text-align:center;margin-left:auto;margin-right:auto}
.hl-head,.hl-block__content{max-width:760px}
.hl-block--centered .hl-head{max-width:820px}
h1,h2,h3{line-height:1.12;color:inherit;margin:0 0 16px;overflow-wrap:anywhere}
h1{font-size:clamp(2.4rem,5.4vw,4.4rem);letter-spacing:-.045em;font-weight:800}
h2{font-size:clamp(1.8rem,3.8vw,2.9rem);letter-spacing:-.03em;font-weight:800}
h3{font-size:1.12rem;font-weight:700;letter-spacing:-.01em}
.hl-eyebrow{color:var(--hl-accent);font-size:.8rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin:0 0 14px}
.hl-lead{font-size:clamp(1.12rem,2vw,1.4rem);line-height:1.55;opacity:.9;margin:0 0 22px}
.hl-body{font-size:1.04rem;line-height:1.8;white-space:pre-wrap;opacity:.88;margin:0 0 22px}
.hl-body p{margin:0}
.hl-pill{display:inline-flex;align-items:center;gap:6px;margin:0 0 16px;padding:6px 14px;border-radius:999px;background:color-mix(in srgb,var(--hl-accent) 14%,transparent);color:var(--hl-accent);border:1px solid color-mix(in srgb,var(--hl-accent) 35%,transparent);font-size:.8rem;font-weight:700}
.hl-topbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--hl-bg) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--hl-line)}
.hl-topbar__inner{max-width:var(--hl-width);margin:0 auto;padding:12px clamp(20px,5vw,48px);display:flex;align-items:center;justify-content:space-between;gap:16px}
.hl-topbar strong{font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hl-block--hero{padding-top:calc(var(--hl-space) * .9);padding-bottom:var(--hl-space);background:radial-gradient(1200px 520px at 85% -10%,color-mix(in srgb,var(--hl-accent) 26%,transparent),transparent 70%),linear-gradient(180deg,color-mix(in srgb,var(--hl-accent) 8%,var(--hl-bg)),var(--hl-bg));overflow:hidden}
.hl-block--hero.hl-layout--centered .hl-block__content,.hl-block--hero.hl-layout--stats .hl-block__content{text-align:center;margin:0 auto;max-width:880px}
.hl-block--hero.hl-layout--centered .hl-bullets,.hl-block--hero.hl-layout--stats .hl-bullets{justify-content:center}
.hl-block--hero h1{font-size:clamp(2.5rem,5.6vw,4.6rem)}
.hl-split{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(280px,.95fr);gap:clamp(28px,5vw,72px);align-items:center}
.hl-split--head{margin-bottom:12px}
.hl-media{margin:0;overflow:hidden;border-radius:calc(var(--hl-radius) + 6px);box-shadow:0 30px 70px -20px rgba(2,6,23,.45);border:1px solid var(--hl-line);background:var(--hl-surface)}
.hl-media img{display:block;width:100%;height:100%;min-height:260px;max-height:560px;object-fit:cover}
.hl-media--wide{margin-top:44px}
.hl-media--wide img{max-height:520px}
.hl-bullets{list-style:none;margin:0 0 26px;padding:0;display:flex;flex-wrap:wrap;gap:10px 22px}
.hl-bullets li{display:flex;align-items:flex-start;gap:8px;font-weight:600;font-size:.98rem}
.hl-bullets li span{color:var(--hl-accent);font-weight:900}
.hl-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin:32px 0 0}
.hl-stat{padding:18px 20px;border-radius:16px;background:var(--hl-surface);border:1px solid var(--hl-line);text-align:left}
.hl-stat strong{display:block;font-size:clamp(1.6rem,3vw,2.2rem);line-height:1.1;color:var(--hl-accent);letter-spacing:-.03em}
.hl-stat span{display:block;margin-top:6px;font-size:.88rem;opacity:.78}
.hl-cta-wrap{margin-top:30px}
.hl-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:17px 34px;background:var(--hl-accent);color:var(--hl-cta-text)!important;text-decoration:none;font-weight:800;font-size:1.06rem;border-radius:14px;box-shadow:0 14px 34px -10px color-mix(in srgb,var(--hl-accent) 70%,transparent);transition:transform .2s ease,box-shadow .2s ease}
.hl-cta:hover{transform:translateY(-2px);box-shadow:0 20px 40px -12px color-mix(in srgb,var(--hl-accent) 80%,transparent)}
.hl-cta:focus-visible{outline:3px solid var(--hl-text);outline-offset:4px}
.hl-cta--sm{padding:10px 18px;font-size:.88rem;border-radius:10px;box-shadow:none;white-space:nowrap}
.hl-cta--block{display:flex;width:100%;margin-top:22px}
.hl-cta--static{cursor:default}
.hl-items{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));margin:36px 0 0;text-align:left}
.hl-item{padding:26px;border:1px solid var(--hl-line);border-radius:var(--hl-radius);background:var(--hl-surface);box-shadow:0 12px 30px -18px rgba(2,6,23,.35);transition:transform .2s ease,box-shadow .2s ease}
.hl-item:hover{transform:translateY(-3px);box-shadow:0 22px 40px -20px rgba(2,6,23,.45)}
.hl-item h3{margin:0 0 8px}
.hl-item p{margin:0;line-height:1.65;font-size:.97rem;opacity:.85}
.hl-icon{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin-bottom:14px;border-radius:12px;background:color-mix(in srgb,var(--hl-accent) 14%,transparent);color:var(--hl-accent);font-size:1.25rem;font-weight:800}
.hl-step-num{display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:44px;padding:0 10px;margin-bottom:14px;border-radius:12px;background:var(--hl-accent);color:var(--hl-cta-text);font-weight:800;font-size:.95rem}
.hl-bonus-badge,.hl-deliverable-badge{display:inline-block;margin-bottom:12px;padding:4px 10px;border-radius:999px;font-size:.72rem;font-weight:800;letter-spacing:.08em;background:color-mix(in srgb,var(--hl-accent) 16%,transparent);color:var(--hl-accent)}
.hl-steps{list-style:none;margin:40px 0 0;padding:0;display:grid;gap:0;position:relative;text-align:left;max-width:820px}
.hl-block--centered .hl-steps{margin-left:auto;margin-right:auto}
.hl-step{display:grid;grid-template-columns:56px minmax(0,1fr);gap:20px;padding:0 0 30px;position:relative}
.hl-step:not(:last-child):before{content:"";position:absolute;left:21px;top:48px;bottom:4px;width:2px;background:color-mix(in srgb,var(--hl-accent) 30%,transparent)}
.hl-step .hl-step-num{margin:0}
.hl-step h3{margin:8px 0 6px}
.hl-step p{margin:0;opacity:.85}
.hl-checklist{list-style:none;margin:36px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:14px;text-align:left}
.hl-checklist li,.hl-included li{display:flex;gap:14px;align-items:flex-start;padding:18px 20px;border-radius:16px;background:var(--hl-surface);border:1px solid var(--hl-line)}
.hl-checklist strong,.hl-included strong{display:block;margin-bottom:2px}
.hl-checklist span:not(.hl-check),.hl-included span:not(.hl-check){display:block;opacity:.82;font-size:.95rem}
.hl-check{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--hl-accent);color:var(--hl-cta-text);font-weight:900;font-size:.85rem}
.hl-list{list-style:none;margin:32px 0 0;padding:0;display:grid;gap:14px;text-align:left;max-width:820px}
.hl-list li{display:flex;gap:16px;align-items:flex-start;padding:16px 0;border-bottom:1px solid var(--hl-line)}
.hl-list p{margin:4px 0 0;opacity:.85}
.hl-list-icon{flex:0 0 auto;font-size:1.3rem;line-height:1.4}
.hl-compare{margin:36px 0 0;border:1px solid var(--hl-line);border-radius:var(--hl-radius);overflow:hidden;background:var(--hl-surface);text-align:left}
.hl-compare__row{display:grid;grid-template-columns:minmax(120px,.8fr) 1fr 1fr;gap:0;border-top:1px solid var(--hl-line)}
.hl-compare__row>*{padding:16px 18px}
.hl-compare__head{border-top:0;font-weight:800;font-size:.9rem}
.hl-compare .is-before{background:rgba(239,68,68,.07)}
.hl-compare .is-after{background:color-mix(in srgb,var(--hl-accent) 10%,transparent)}
.hl-compare__head .is-before{color:#dc2626}
.hl-compare__head .is-after{color:var(--hl-accent)}
.hl-quotes{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));margin:36px 0 0;text-align:left}
.hl-quote{margin:0;padding:28px;border-radius:var(--hl-radius);background:var(--hl-surface);color:var(--hl-text);border:1px solid var(--hl-line)}
.hl-quote blockquote{margin:0 0 18px;font-size:1.05rem;line-height:1.65}
.hl-quote figcaption strong{display:block}
.hl-quote figcaption span{display:block;font-size:.86rem;opacity:.7}
.hl-stars{color:#f59e0b;letter-spacing:2px;margin-bottom:10px}
.hl-accordion{display:grid;gap:12px;margin:36px auto 0;max-width:860px;text-align:left}
.hl-accordion details{padding:0;border:1px solid var(--hl-line);border-radius:16px;background:var(--hl-surface);overflow:hidden}
.hl-accordion summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;cursor:pointer;list-style:none}
.hl-accordion summary::-webkit-details-marker{display:none}
.hl-accordion summary h3{margin:0;font-size:1.04rem}
.hl-acc-icon{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:color-mix(in srgb,var(--hl-accent) 14%,transparent);color:var(--hl-accent);font-weight:800;transition:transform .2s ease}
.hl-accordion details[open] .hl-acc-icon{transform:rotate(45deg)}
.hl-accordion details p{margin:0;padding:0 22px 20px;opacity:.85;line-height:1.7}
.hl-q-badge{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--hl-accent);margin-bottom:6px}
.hl-pricing{position:relative;max-width:560px;margin:40px auto 0;padding:clamp(28px,4vw,44px);border-radius:28px;background:var(--hl-surface);border:2px solid var(--hl-accent);box-shadow:0 40px 90px -30px color-mix(in srgb,var(--hl-accent) 55%,transparent);text-align:left}
.hl-pricing__badge{position:absolute;top:-15px;left:50%;transform:translateX(-50%);padding:6px 16px;border-radius:999px;background:var(--hl-accent);color:var(--hl-cta-text);font-size:.78rem;font-weight:800;letter-spacing:.06em;white-space:nowrap}
.hl-pricing .hl-media{margin-bottom:22px}
.hl-pricing .hl-media img{min-height:180px;max-height:280px}
.hl-included{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.hl-included li{padding:12px 14px}
.hl-price{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:center;gap:6px 14px;margin:26px 0 0;text-align:center}
.hl-price s{opacity:.55;font-size:1.2rem}
.hl-price strong{font-size:clamp(2.4rem,5vw,3.4rem);letter-spacing:-.04em;line-height:1}
.hl-price span{flex-basis:100%;font-size:.9rem;opacity:.75}
.hl-pricing .hl-bullets{justify-content:center;margin:18px 0 0;font-size:.88rem}
.hl-guarantee{display:grid;grid-template-columns:auto minmax(0,1fr);gap:clamp(24px,4vw,48px);align-items:center;padding:clamp(28px,4vw,48px);border-radius:28px;background:var(--hl-surface);border:1px solid var(--hl-line)}
.hl-guarantee>.hl-media{grid-column:1/-1}
.hl-seal{display:flex;align-items:center;justify-content:center;width:148px;height:148px;border-radius:50%;background:conic-gradient(from 0deg,var(--hl-accent),color-mix(in srgb,var(--hl-accent) 60%,#fff),var(--hl-accent));padding:8px}
.hl-seal span{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;background:var(--hl-surface);border:2px dashed var(--hl-accent);color:var(--hl-accent);font-weight:900;font-size:.9rem;text-align:center;line-height:1.2;padding:12px;text-transform:uppercase}
.hl-block--inverse{background:color-mix(in srgb,var(--hl-accent) 22%,#0b1220);color:#f8fafc}
.hl-block--inverse .hl-eyebrow{color:color-mix(in srgb,var(--hl-accent) 55%,#fff)}
.hl-block--inverse .hl-item,.hl-block--inverse .hl-stat,.hl-block--inverse .hl-checklist li,.hl-block--inverse .hl-accordion details{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#f8fafc}
.hl-block--inverse .hl-stat strong{color:#fff}
.hl-block--inverse .hl-cta{background:#fff;color:#0b1220!important}
.hl-block--cta{text-align:center}
.hl-block--cta .hl-block__content,.hl-block--cta .hl-head{margin:0 auto}
.hl-sticky-cta{display:none}
footer{padding:36px 20px 96px;font-size:.85rem;opacity:.7;text-align:center;border-top:1px solid var(--hl-line)}
@media(max-width:820px){
  .hl-split,.hl-guarantee{grid-template-columns:1fr}
  .hl-seal{width:120px;height:120px;margin:0 auto}
  .hl-compare__row{grid-template-columns:1fr}
  .hl-compare__head span:first-child{display:none}
  .hl-topbar strong{display:none}
  .hl-topbar__inner{justify-content:center}
  .hl-sticky-cta{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:30;justify-content:center;padding:15px 18px;border-radius:14px;background:var(--hl-accent);color:var(--hl-cta-text)!important;font-weight:800;text-decoration:none;box-shadow:0 18px 40px -10px rgba(2,6,23,.55)}
}
@media(max-width:640px){
  body{font-size:16px}
  .hl-block{padding:56px 18px}
  .hl-items,.hl-quotes,.hl-checklist{grid-template-columns:1fr}
  .hl-cta{display:flex;width:100%}
  .hl-cta--sm{width:auto}
}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.hl-cta,.hl-item,.hl-acc-icon{transition:none}}
</style>
</head>
<body>
${topbar}
<main>
${content}
</main>
${output.footerNote ? `<footer>${escape(output.footerNote)}</footer>` : ""}
${stickyCta}
</body>
</html>`;
}

export interface LandingQualityIssue {
  sectionIndex?: number | undefined;
  type?: string | undefined;
  severity: "high" | "medium" | "low";
  message: string;
}

export interface LandingQualityReport {
  score: number;
  grade: "A" | "B" | "C" | "D";
  issues: LandingQualityIssue[];
  metrics: { sections: number; layouts: number; images: number; ctas: number; words: number };
}

const PLACEHOLDER_PATTERN = /bloque de contenido|contenido generado para este bloque|lorem ipsum|sin completar|nuevo punto clave|descripción breve respaldada/i;

const wordCount = (value: unknown) => (typeof value === "string" ? value.trim().split(/\s+/u).filter(Boolean).length : 0);

/** Deterministic conversion + design quality audit for a landing document (0-100). */
export function auditLandingQuality(input: unknown): LandingQualityReport {
  const output = record(input);
  const all = (Array.isArray(output.sections) ? output.sections : []).map(record);
  const visible = all.map((section, index) => ({ section, index })).filter(({ section }) => section.enabled !== false);
  const issues: LandingQualityIssue[] = [];
  const push = (severity: LandingQualityIssue["severity"], message: string, index?: number, type?: string) =>
    issues.push({ severity, message, ...(index !== undefined ? { sectionIndex: index } : {}), ...(type ? { type } : {}) });

  if (visible.length < 9) push("high", `Solo hay ${visible.length} bloques visibles; una landing PRO necesita entre 10 y 15.`);
  const types = new Set(visible.map(({ section }) => String(section.type ?? "")));
  for (const [type, severity] of [
    ["hero", "high"],
    ["offer", "high"],
    ["problem", "medium"],
    ["mechanism", "medium"],
    ["benefits", "medium"],
    ["faq", "medium"],
    ["guarantee", "medium"],
    ["cta", "medium"],
    ["proof", "low"],
  ] as const) {
    if (!types.has(type)) push(severity, `Falta el bloque «${CANONICAL_LANDING_LABELS[type]}».`, undefined, type);
  }

  const headlines = new Map<string, number>();
  let images = 0;
  let ctas = 0;
  let words = 0;
  const layouts = new Set<string>();

  for (const { section, index } of visible) {
    const type = String(section.type ?? "");
    const items = Array.isArray(section.items) ? section.items : [];
    const itemObjects = items.map((raw) => (typeof raw === "string" ? { description: raw } : record(raw)));
    const label = `Bloque ${index + 1} (${CANONICAL_LANDING_LABELS[type as CanonicalLandingBlockType] ?? type})`;
    layouts.add(resolveLandingLayout(section));
    if (landingImageUrl(section.imageUrl)) images++;
    if (typeof section.cta === "string" && section.cta.trim()) ctas++;
    const sectionWords =
      wordCount(section.headline) + wordCount(section.subheadline) + wordCount(section.body) +
      itemObjects.reduce((sum, item) => sum + wordCount(item.name ?? item.title ?? item.q) + wordCount(item.description ?? item.text ?? item.a), 0);
    words += sectionWords;

    const allText = [section.headline, section.subheadline, section.body, ...itemObjects.flatMap((item) => [item.name, item.description, item.q, item.a])]
      .filter((v): v is string => typeof v === "string")
      .join(" ");
    if (PLACEHOLDER_PATTERN.test(allText)) push("high", `${label}: contiene texto de relleno genérico.`, index, type);

    const headline = typeof section.headline === "string" ? section.headline.trim().toLowerCase() : "";
    if (headline) headlines.set(headline, (headlines.get(headline) ?? 0) + 1);

    if (type === "hero") {
      if (!headline) push("high", `${label}: falta el titular principal.`, index, type);
      else if (wordCount(section.headline) > 16) push("medium", `${label}: el titular tiene ${wordCount(section.headline)} palabras; apunta a 6–14 con un beneficio claro.`, index, type);
      if (!section.subheadline) push("medium", `${label}: añade un subtítulo que concrete la promesa.`, index, type);
      if (!section.cta) push("high", `${label}: falta el botón de llamada a la acción.`, index, type);
      if (!landingImageUrl(section.imageUrl)) push("low", `${label}: sin imagen principal.`, index, type);
      if (!landingTextList(section.bullets).length && !landingStats(section.stats).length) push("low", `${label}: añade 3 viñetas de beneficio o cifras del producto.`, index, type);
    } else if (sectionWords < 14 && type !== "footer" && type !== "cta") {
      push("low", `${label}: contenido demasiado escaso.`, index, type);
    }
    if ((type === "problem" || type === "agitation") && items.length < 3) push("medium", `${label}: necesita al menos 3 escenas o dolores concretos.`, index, type);
    if (type === "mechanism" && items.length < 3) push("medium", `${label}: explica el método en al menos 3 pasos.`, index, type);
    if (type === "benefits" && items.length < 4) push("medium", `${label}: lista al menos 4 beneficios tangibles.`, index, type);
    if (type === "faq" || type === "objections") {
      if (items.length < (type === "faq" ? 4 : 3)) push("medium", `${label}: incluye al menos ${type === "faq" ? 4 : 3} preguntas con respuesta.`, index, type);
      if (itemObjects.some((item) => item.q === undefined)) push("medium", `${label}: usa formato pregunta/respuesta.`, index, type);
    }
    if (type === "offer") {
      if (!(typeof section.price === "string" && section.price.trim())) push("medium", `${label}: muestra el precio de forma visible.`, index, type);
      if (items.length < 3) push("medium", `${label}: detalla qué incluye la oferta (mínimo 3 elementos).`, index, type);
      if (!section.cta) push("high", `${label}: la oferta necesita un botón de compra.`, index, type);
    }
    if (type === "guarantee" && wordCount(section.body) < 15) push("low", `${label}: explica las condiciones de la garantía.`, index, type);
    if (type === "proof" && !items.length && !landingStats(section.stats).length) push("low", `${label}: añade evidencia, casos o cifras verificables.`, index, type);
  }

  for (const [headline, count] of headlines) if (count > 1) push("low", `Titular repetido ${count} veces: «${headline.slice(0, 60)}».`);
  if (layouts.size < 4 && visible.length >= 6) push("medium", `Diseño monótono: solo ${layouts.size} estilos de bloque distintos; varía los layouts.`);
  if (images < 3) push("medium", `Solo ${images} bloques con imagen; usa al menos 3–5 imágenes.`);
  if (ctas < 3) push("medium", `Solo ${ctas} llamadas a la acción; repítela al menos 3 veces a lo largo de la página.`);

  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "high" ? 10 : issue.severity === "medium" ? 5 : 2), 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  return { score, grade, issues, metrics: { sections: visible.length, layouts: layouts.size, images, ctas, words } };
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
      sections: rawSections.map((raw) => {
        const section = record(raw);
        return section.imageUrl === undefined ? raw : { ...section, imageUrl: landingImageUrl(section.imageUrl) };
      }),
      externalCheckout: (() => {
        const checkout = record(output.externalCheckout);
        return output.externalCheckout === undefined
          ? undefined
          : { ...checkout, checkoutUrl: landingCheckoutUrl(checkout.checkoutUrl) };
      })(),
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
  imageUrl?: string;
  imageAlt?: string;
  items?: Array<string | Record<string, unknown>>;
  evidenceIds?: string[];
  /** Visual layout for the block (see LANDING_SECTION_LAYOUTS). */
  layout?: string;
  /** Small highlighted pill / seal text (e.g. "Más elegido", "Garantía 14 días"). */
  badge?: string;
  stats?: Array<{ value: string; label: string }>;
  bullets?: string[];
  price?: string;
  oldPrice?: string;
  priceNote?: string;
  beforeLabel?: string;
  afterLabel?: string;
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
  const offerTarget = offerIndex < 0 ? null : \`#section-\${offerIndex}\`;
  const checkoutUrl = (() => {
    if (!externalCheckout || externalCheckout.platform === "none" || !externalCheckout.checkoutUrl) return undefined;
    const value = externalCheckout.checkoutUrl.trim();
    if (/[\\\x00-\x1f]/u.test(value)) return undefined;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password ? value : undefined;
    } catch {
      return undefined;
    }
  })();

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
      <main>
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
  offerTarget: string | null;
  checkoutUrl?: string;
}) {
  const isHero = section.type === "hero";
  const isCentered = section.variant === "centered" || ["hero", "offer", "guarantee", "cta", "footer"].includes(section.type);
  const isDirectCheckout = Boolean(checkoutUrl && (section.type === "offer" || section.type === "cta"));
  const imageUrl = (() => {
    const value = section.imageUrl?.trim();
    if (!value || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 92)) return undefined;
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password ? value : undefined;
    } catch {
      return undefined;
    }
  })();

  const sectionStyle: React.CSSProperties = {
    padding: \`\${spacing === "compact" ? "36px" : "64px"} 24px\`,
    maxWidth: isHero ? "none" : "1160px",
    margin: isHero ? 0 : "18px auto",
    textAlign: isCentered ? "center" : "left",
    ...(imageUrl ? {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,320px),1fr))",gap:"40px",alignItems:"center"} : {}),
    ...(isHero ? {background:"linear-gradient(115deg,#092a31,#0c5557 58%,#0d7768)",color:"#fff",minHeight:"520px",padding:"70px max(24px,calc((100vw - 1120px)/2))"} : {}),
    ...(["problem","agitation"].includes(section.type) ? {background:"#f3f6f1",borderRadius:"28px"} : {}),
    ...(["mechanism","product"].includes(section.type) ? {background:"#e9f3ee",borderRadius:"28px"} : {}),
    ...(["proof","cta"].includes(section.type) ? {background:"#103b40",color:"#fff",borderRadius:"28px"} : {}),
    ...(section.type === "offer" ? { backgroundColor: "#f6ead6", border: "1px solid #cc9a55", borderRadius: "20px" } : {}),
  };

  const ctaStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "16px 36px",
    backgroundColor: "#efb84d",
    color: "#17252a",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "1.1rem",
    borderRadius: "12px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
    marginTop: "24px",
  };

  return (
    <section id={\`section-\${index}\`} style={sectionStyle}>
      <div>
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
                    {section.type === "bonuses" && <span style={{ color: "#b45309", fontWeight: 700, fontSize: "0.75rem" }}>RECURSO ADICIONAL</span>}
                    {section.type === "deliverables" && <span style={{ color: "#0e7880", fontWeight: 700, fontSize: "0.75rem" }}>FORMATO DIGITAL</span>}
                    <h3 style={{ margin: "4px 0 8px", fontSize: "1.1rem" }}>{String(item?.name ?? item?.title ?? "")}</h3>
                    <p style={{ margin: 0 }}>{String(item?.description ?? item?.text ?? "")}</p>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {section.cta && (isDirectCheckout || (section.type !== "offer" && offerTarget)) && (
        <div>
          <a
            href={isDirectCheckout ? checkoutUrl : (offerTarget ?? undefined)}
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
      </div>
      {imageUrl && <figure style={{margin:0,overflow:"hidden",borderRadius:"26px",boxShadow:"0 28px 65px #071e2440"}}><img src={imageUrl} alt={section.imageAlt || ""} loading={isHero ? "eager" : "lazy"} style={{width:"100%",height:"100%",minHeight:"280px",maxHeight:"520px",objectFit:"cover",display:"block"}} /></figure>}
    </section>
  );
}
`;
}
