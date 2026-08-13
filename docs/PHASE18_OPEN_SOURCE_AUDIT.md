# Fase 18 — auditoría open source

Auditoría puntual realizada el 2026-08-13 sobre repositorios oficiales; no se clonó, vendorizó ni fusionó código externo dentro de `copa`.

| Componente | Versión evaluada/adoptada | Licencia core | Decisión |
|---|---:|---|---|
| [TypeCellOS/BlockNote](https://github.com/TypeCellOS/BlockNote) | 0.52.1 evaluada | MPL-2.0 | Diferido. Su API 0.x y árbol ProseMirror/Tiptap no compensan una migración del block model propio. Se excluyen todos los paquetes `@blocknote/xl-*` GPL/comerciales. |
| [dolanmiu/docx](https://github.com/dolanmiu/docx) | 9.7.1 | MIT | Adoptado con versión exacta, sólo servidor, para OpenXML/DOCX nativo. |
| [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) | 11.16.1 | MIT | Adoptado con versión exacta y carga aislada para validar/renderizar SVG. |
| [lovell/sharp](https://github.com/lovell/sharp) | 0.35.3 | Apache-2.0 | Adoptado con versión exacta, sólo servidor, para validar, orientar, limitar, redimensionar y comprimir imágenes. |

Controles aplicados: Mermaid `securityLevel: strict`, sin HTML labels/directivas/callbacks/enlaces externos, timeout y sanitización posterior; Sharp limita bytes, píxeles, dimensiones y frames; DOCX se construye desde nuestro AST validado, sin automatizar Word ni aceptar macros/relaciones externas. PDF usa Edge/Chromium local con HTML y print CSS. No se incorporaron Puck, GrapesJS, React Flow, Satori, servicios SaaS ni paquetes XL.
