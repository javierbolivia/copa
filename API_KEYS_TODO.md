# API keys pendientes

| Variable | Servicio | Función | Configuración | Estado |
|---|---|---|---|---|
| `YOUTUBE_API_KEY` | YouTube Data API v3 | Importar vídeos, comentarios, threads y replies | Crear `.env` desde `.env.example` y asignar la clave localmente | `IMPLEMENTED_NOT_LIVE_VERIFIED` |
| `OPENAI_API_KEY` | OpenAI Responses API | Proveedor LLM real detrás de la abstracción `LlmProvider` | Crear `.env` desde `.env.example` y asignar la clave localmente | `IMPLEMENTED_NOT_LIVE_VERIFIED` |

No se necesita ninguna clave para el flujo Demo completo. `.env` está ignorado por Git y no debe compartirse ni incluirse en backups.

Los perfiles opcionales `OPENAI_ECONOMY_MODEL` y `OPENAI_POWERFUL_MODEL` permiten declarar nombres de modelos sin fijarlos en el frontend. También pueden configurarse por proyecto. La UI permite elegir Demo/OpenAI; sin clave, OpenAI aparece deshabilitado y no se inicia ninguna generación.
