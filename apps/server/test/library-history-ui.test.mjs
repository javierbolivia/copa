import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KnowledgeView } from "../../web/src/features/knowledge/KnowledgeView";
import { HistoryView } from "../../web/src/features/modules/ModuleView";

describe("Library and history loading states",()=>{
  it("does not mislabel an unloaded library list as empty",()=>{
    const html=renderToStaticMarkup(createElement(KnowledgeView,{projectId:"project-a"}));
    expect(html).toContain("Cargando bibliotecas");
    expect(html).not.toContain("Aún no hay bibliotecas.");
  });

  it("keeps mutation refreshes and search answers inside the originating project scope",()=>{
    const source=readFileSync(resolve(import.meta.dirname,"../../web/src/features/knowledge/KnowledgeView.tsx"),"utf8");
    expect(source).toContain('useRequestGuard(`${projectId}:libraries`)');
    expect(source).toContain('useRequestGuard(`${projectId}:documents`)');
    expect(source).toContain('useRequestGuard(`${projectId}:interactions`)');
    expect(source).toContain('if(!current())return false;setLibraries(next);');
    expect(source).toContain('if(!current())return false;setDocuments(next);');
    expect(source).toContain('const current=libraryRequests.begin();');
    expect(source).toContain('const current=documentRequests.begin();');
    expect(source).toContain('if(current())setResults(response.results);');
    expect(source).toContain('if(!current())return;setAnswer(response.answer);');
  });

  it("keeps history in its loading state until project-scoped requests resolve",()=>{
    const html=renderToStaticMarkup(createElement(HistoryView,{projectId:"project-b"}));
    expect(html).toContain("loading-grid");
    expect(html).not.toContain("Proyecto actual");
  });
});
