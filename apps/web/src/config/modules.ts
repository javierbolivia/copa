import type { ModuleKey } from "@our-platform/shared";

export type NavigationKey = "overview" | ModuleKey | "history" | "settings";

export const modules: readonly { key: NavigationKey; label: string; short: string; description: string }[] = [
  { key: "overview", label: "Overview", short: "O", description: "Resumen, workflow y versiones" },
  { key: "research", label: "Investigación", short: "I", description: "Subnichos, hipótesis, preguntas y hallazgos" },
  { key: "sources", label: "Fuentes", short: "F", description: "Fuentes manuales, Demo y comentarios de YouTube" },
  { key: "problems", label: "Problemas", short: "P", description: "Patrones, frustraciones y evidencia" },
  { key: "opportunities", label: "Oportunidades", short: "OP", description: "Scoring auditable y selección" },
  { key: "product", label: "Producto", short: "PR", description: "Concepto, promesa, módulos y recursos" },
  { key: "avatar", label: "Avatar", short: "A", description: "Perfil basado en evidencia" },
  { key: "mechanism", label: "Mecanismo", short: "M", description: "Causa propuesta y mecanismo de solución" },
  { key: "beliefs", label: "Creencias", short: "C", description: "Transiciones y tesis central" },
  { key: "offer", label: "Oferta", short: "OF", description: "Entregables, precio y ascensiones" },
  { key: "landing", label: "Landing", short: "L", description: "Copy, preview y exportación" },
  { key: "funnel", label: "Funnel", short: "FU", description: "Flujo comercial local" },
  { key: "emails", label: "Emails", short: "E", description: "Secuencias y mensajes" },
  { key: "content", label: "Contenido", short: "CO", description: "Piezas, hooks y calendario" },
  { key: "final_product", label: "Producto final", short: "PF", description: "Archivos generados y lineage" },
  { key: "history", label: "Historial", short: "H", description: "Generaciones, jobs, uso y coste" },
  { key: "settings", label: "Configuración", short: "⚙", description: "Preferencias y backups" },
] as const;

export const moduleInfo = (key: NavigationKey) => modules.find((item) => item.key === key) ?? modules[0]!;
export const isModuleKey = (key: NavigationKey): key is ModuleKey => key !== "overview" && key !== "history" && key !== "settings";

