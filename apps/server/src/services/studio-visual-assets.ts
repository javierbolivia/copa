/** Curated visual bank served from creative-studio-pro/app/assets/images and offered to Studio PRO AI. */
export const STUDIO_VISUAL_ASSETS: ReadonlyArray<{
  id: string;
  filename: string;
  title: string;
  category: string;
}> = [
  { id: "bundle", filename: "bundle.jpg", title: "Mockup 3D Ebook + Bonos", category: "Producto" },
  { id: "hero", filename: "hero.jpg", title: "Paseo en calma (Hero)", category: "Principal" },
  { id: "guide", filename: "guide.jpg", title: "Portada oficial de la Guía", category: "Producto" },
  { id: "expert", filename: "expert.jpg", title: "Especialista & Enfoque Ético", category: "Autoridad" },
  { id: "problem", filename: "problem.jpg", title: "Escena crítica de tensión", category: "Problema" },
  { id: "testimonial", filename: "testimonial.jpg", title: "Tutor y perro en progreso", category: "Prueba" },
  { id: "foto_master_01_paseo_nocturno", filename: "foto_master_01_paseo_nocturno.jpg", title: "Paseo nocturno relajado", category: "Mecanismo" },
  { id: "foto_master_02_consulta_etologia", filename: "foto_master_02_consulta_etologia.jpg", title: "Consulta etológica profesional", category: "Autoridad" },
  { id: "foto_master_03_terraza_cafe", filename: "foto_master_03_terraza_cafe.jpg", title: "Calma en terraza y café", category: "Beneficios" },
  { id: "foto_master_04_cambio_arnes", filename: "foto_master_04_cambio_arnes.jpg", title: "Ajuste correcto de arnés", category: "Mecanismo" },
  { id: "foto_conexion_tutor_perro", filename: "foto_conexion_tutor_perro.jpg", title: "Conexión tutor y perro", category: "Autoridad" },
  { id: "foto_perro_tension_urbana", filename: "foto_perro_tension_urbana.jpg", title: "Perro en tensión urbana", category: "Problema" },
  { id: "foto_ladrido_ventana", filename: "foto_ladrido_ventana.jpg", title: "Reactividad desde ventana", category: "Problema" },
  { id: "foto_perro_suelto_bloqueo", filename: "foto_perro_suelto_bloqueo.jpg", title: "Encuentro inesperado en parque", category: "Problema" },
  { id: "foto_estallido_reactivo", filename: "foto_estallido_reactivo.jpg", title: "Detonante reactivo en calle", category: "Problema" },
  { id: "foto_whale_eye_estres", filename: "foto_whale_eye_estres.jpg", title: "Señal de estrés (ojo de ballena)", category: "Problema" },
  { id: "foto_olfateo_calma", filename: "foto_olfateo_calma.jpg", title: "Olfateo de descompresión", category: "Mecanismo" },
  { id: "foto_descompresion_sniffari", filename: "foto_descompresion_sniffari.jpg", title: "Sniffari en entorno tranquilo", category: "Mecanismo" },
  { id: "foto_masticacion_descompresion", filename: "foto_masticacion_descompresion.jpg", title: "Descompresión en casa", category: "Bonos" },
  { id: "foto_giro_u_maniobra", filename: "foto_giro_u_maniobra.jpg", title: "Maniobra de giro en U", category: "Mecanismo" },
  { id: "foto_siembra_premios", filename: "foto_siembra_premios.jpg", title: "Siembra de premios para calmar", category: "Mecanismo" },
  { id: "foto_equipo_arnes_correa", filename: "foto_equipo_arnes_correa.jpg", title: "Equipo de paseo (arnés y correa)", category: "Mecanismo" },
  { id: "foto_paseo_paralelo", filename: "foto_paseo_paralelo.jpg", title: "Paseo paralelo con distancia", category: "Mecanismo" },
  { id: "foto_paseo_nocturno_calmado", filename: "foto_paseo_nocturno_calmado.jpg", title: "Salida nocturna sin sobresaltos", category: "Beneficios" },
  { id: "foto_perro_bicicleta_calma", filename: "foto_perro_bicicleta_calma.jpg", title: "Calma ante estímulos en movimiento", category: "Beneficios" },
  { id: "foto_perro_paseo_calmado", filename: "foto_perro_paseo_calmado.jpg", title: "Paseo con correa floja", category: "Beneficios" },
  { id: "foto_perro_grande_pastor", filename: "foto_perro_grande_pastor.jpg", title: "Manejo de perro grande", category: "Prueba" },
  { id: "foto_vinculo_afecto", filename: "foto_vinculo_afecto.jpg", title: "Vínculo de confianza mutua", category: "Beneficios" },
  { id: "foto_banco_parque_atardecer", filename: "foto_banco_parque_atardecer.jpg", title: "Descanso en parque al atardecer", category: "Beneficios" },
  { id: "foto_mockup_tarjetas_sos", filename: "foto_mockup_tarjetas_sos.jpg", title: "Tarjetas SOS en teléfono", category: "Entregables" },
  { id: "foto_cuaderno_escritorio", filename: "foto_cuaderno_escritorio.jpg", title: "Bitácora y cuaderno de campo", category: "Entregables" },
  { id: "illustration_signals", filename: "illustration_signals.jpg", title: "Ilustración de micro-señales", category: "Ilustración" },
  { id: "illustration_walk", filename: "illustration_walk.jpg", title: "Ilustración de distancia segura", category: "Ilustración" },
];

export function studioAssetUrl(filename: string): string {
  return `/api/studio-assets/${encodeURIComponent(filename)}`;
}
