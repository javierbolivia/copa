import { withIntegrationTimeout } from "../integrations/request-timeout.js";

const MODEL = "gemini-3.1-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1/models/${MODEL}:generateContent`;
const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;

type ImagePart = { inlineData?: { mimeType?: unknown; data?: unknown }; inline_data?: { mime_type?: unknown; data?: unknown }; thought?: boolean };

export class LandingImageService {
  constructor(private readonly options: { apiKey?: string; fetch?: typeof fetch } = {}) {}

  get configured(): boolean { return Boolean(this.options.apiKey?.trim()); }
  get model(): string { return MODEL; }

  async generate(prompt: string, aspectRatio: "16:9" | "4:3" | "1:1" = "16:9") {
    if (!this.configured) throw new Error("Gemini no está configurado para generar imágenes.");
    const description = prompt.trim();
    if (description.length < 12 || description.length > 1200) throw new Error("Describe la imagen en 12 a 1200 caracteres.");
    const body = JSON.stringify({
      contents: [{ parts: [{ text: `${description}\n\nCreate one original, polished editorial image for a digital-product landing page. No typography, logos, watermarks, prices, badges, testimonials or claims embedded in the image.` }] }],
      generationConfig: { responseModalities: ["IMAGE"], responseFormat: { image: { aspectRatio } } },
    });
    const response = await withIntegrationTimeout("Gemini imagen", 90_000, async signal => {
      const result = await (this.options.fetch ?? globalThis.fetch)(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.options.apiKey! },
        body,
        signal,
        redirect: "error",
      });
      if (!result.ok) throw new Error(`Gemini no generó la imagen (HTTP ${result.status}). Revisa la cuota y la facturación del modelo de imágenes.`);
      if (Number(result.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES) throw new Error("La respuesta de imagen excedió el límite permitido.");
      const bytes = await result.arrayBuffer();
      if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("La respuesta de imagen excedió el límite permitido.");
      return JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
    });
    const candidates = response && typeof response === "object" && "candidates" in response ? (response as { candidates?: unknown }).candidates : undefined;
    const first = Array.isArray(candidates) ? candidates[0] as { content?: { parts?: ImagePart[] } } | undefined : undefined;
    const part = first?.content?.parts?.find(item => !item.thought && Boolean(item.inlineData?.data ?? item.inline_data?.data));
    const inline = part?.inlineData ?? part?.inline_data;
    const mimeType = inline && ("mimeType" in inline ? inline.mimeType : "mime_type" in inline ? inline.mime_type : undefined);
    if (!inline || typeof inline.data !== "string" || !["image/png", "image/jpeg", "image/webp"].includes(String(mimeType))) {
      throw new Error("Gemini respondió sin una imagen utilizable. No se creó ningún asset.");
    }
    const imageBytes = Buffer.from(inline.data, "base64");
    if (!imageBytes.length || imageBytes.length > 12 * 1024 * 1024 || imageBytes.toString("base64").replace(/=+$/u, "") !== inline.data.replace(/=+$/u, "")) {
      throw new Error("Gemini devolvió una imagen inválida o demasiado grande.");
    }
    return { mimeType: String(mimeType), contentBase64: inline.data, model: MODEL };
  }
}
