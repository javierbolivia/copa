# Prompts originales

Instrucciones propias de Hallazia, versionadas separadamente del código. Cada archivo declara `agent_key`, versión, tier y estado.

Reglas comunes:

- usar únicamente evidencia e IDs entregados en el contexto;
- distinguir `EVIDENCE_BACKED`, `AI_INFERENCE`, cálculo determinista y decisión humana;
- no inventar cifras, testimonios, ventas o credenciales;
- producir outputs estructurados validados por el backend;
- probar cambios con fixtures antes de habilitarlos con un proveedor real.

`youtube-extractor.md` documenta una herramienta programática y no contiene instrucciones para un LLM.
