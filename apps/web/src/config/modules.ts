import type { ModuleKey } from "@our-platform/shared";

export type NavigationKey = "overview" | ModuleKey | "knowledge" | "history" | "settings";

export const modules: readonly { key: NavigationKey; label: string; short: string; description: string }[] = [
  { key: "overview", label: "Overview", short: "O", description: "Resumen, workflow y versiones" },
  { key: "research", label: "Investigación", short: "I", description: "Subnichos, hipótesis, preguntas y hallazgos" },
  { key: "sources", label: "Fuentes", short: "F", description: "Fuentes manuales, Demo y comentarios de YouTube" },
  { key: "problems", label: "Problemas", short: "P", description: "Patrones, frustraciones y evidencia" },
  { key: "opportunities", label: "Oportunidades", short: "OP", description: "Scoring auditable y selección" },
  { key: "product", label: "Producto", short: "PR", description: "Concepto, promesa, capítulos y recursos del Ebook" },
  { key: "avatar", label: "Avatar", short: "A", description: "Perfil del lector basado en evidencia" },
  { key: "mechanism", label: "Mecanismo", short: "M", description: "Metodología y framework del libro" },
  { key: "beliefs", label: "Creencias", short: "C", description: "Mitos que derriba y tesis central" },
  { key: "offer", label: "Oferta", short: "OF", description: "Oferta del Ebook, precio y complementos" },
  { key: "landing", label: "Landing", short: "L", description: "Página de ventas de alta conversión para el Ebook" },
  { key: "funnel", label: "Funnel", short: "FU", description: "Embudo comercial y checkout externo" },
  { key: "content", label: "Contenido", short: "CO", description: "Anuncios y hooks para atraer lectores" },
  { key: "final_product", label: "Producto final", short: "PF", description: "Ebook completo estructurado y exportable" },
  { key: "knowledge", label: "Biblioteca", short: "KB", description: "Documentos locales, búsqueda, citas y memoria aprobada" },
  { key: "history", label: "Historial", short: "H", description: "Generaciones, jobs, uso y coste" },
  { key: "settings", label: "Configuración", short: "⚙", description: "Preferencias y backups" },
] as const;

export const moduleInfo = (key: NavigationKey) => modules.find((item) => item.key === key) ?? modules[0]!;
export const isModuleKey = (key: NavigationKey): key is ModuleKey => key !== "overview" && key !== "knowledge" && key !== "history" && key !== "settings";
