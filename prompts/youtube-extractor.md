---
agent_key: youtube_extractor
version: 1.0.0
model_tier: none
status: programmatic
---

# YouTube Extractor

Este módulo no usa un LLM. El adaptador oficial obtiene vídeo, commentThreads y replies mediante YouTube Data API v3; pagina hasta agotar `nextPageToken`, deduplica por ID de plataforma, conserva autor/likes/fecha/thread/parent y registra progreso. No hace scraping, no evade cuotas y no realiza análisis durante la extracción.
