import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OverviewView } from "../../web/src/features/overview/OverviewView";

const project = { id:"p", name:"Proyecto de prueba", niche:"Prueba", description:null, status:"active", language:"es", region:null, currency:"USD", createdAt:"2026-01-01T00:00:00Z", updatedAt:"2026-01-01T00:00:00Z", archivedAt:null, workflowStage:"Investigación", workflowCompletedSteps:14, workflowTotalSteps:14 };
const workflow = { steps:[{ id:"s", projectId:"p", stepKey:"research", label:"Investigación", position:1, state:"STALE", staleReason:"Cambió la evidencia original.", updatedAt:"2026-02-01T00:00:00Z" }] };
const render = (overrides = {}) => renderToStaticMarkup(createElement(OverviewView, {project,workflow,artifacts:[],onEdit:()=>{},onNavigate:()=>{},...overrides}));

describe("Overview truthful project state",()=>{
  it("does not present an unloaded workflow as completed or empty activity",()=>{
    const html=render({workflow:null});
    expect(html).toContain("Cargando el resumen");
    expect(html).not.toContain("Las 14 etapas tienen ejecución registrada");
    expect(html).not.toContain("Aún no hay actividad registrada");
  });
  it("uses current workflow progress instead of an older project-list snapshot",()=>{
    const html=render();
    expect(html).toContain("0/1");
    expect(html).not.toContain("100%");
  });
  it("explains the current blocker outside a tooltip",()=>{
    const html=render();
    expect(html).toContain("<p>Cambió la evidencia original.</p>");
  });
  it("shows a retry instead of completion when loading failed",()=>{
    const html=render({workflow:null,loadError:"Servidor no disponible",onRetry:()=>{}});
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reintentar resumen");
    expect(html).not.toContain("ejecución registrada");
  });
  it("points a completed workflow to its final deliverable",()=>{
    const completed={steps:[{...workflow.steps[0],state:"COMPLETED",staleReason:null},{...workflow.steps[0],id:"final",position:14,stepKey:"final_product",label:"Producto final",state:"COMPLETED",staleReason:null}]};
    const html=render({workflow:completed});
    expect(html).toContain("Revisar Producto final");
    expect(html).toContain("Las 2 etapas tienen ejecución registrada");
  });
  it("does not call an empty workflow complete",()=>{
    const html=render({workflow:{steps:[]}});
    expect(html).toContain("No hay etapas disponibles");
    expect(html).not.toContain("Las 14 etapas tienen ejecución registrada");
  });
  it("shows the newest artifact as activity regardless of input order",()=>{
    const artifact=(id,createdAt)=>({id,projectId:"p",artifactId:id,artifactType:"research",versionNumber:Number(id),status:"approved",freshness:"fresh",createdAt,inputSnapshot:{},outputData:{},supersedesVersionId:null,staleReason:null});
    const html=render({artifacts:[artifact("1","2026-02-01T00:00:00Z"),artifact("2","2026-03-01T00:00:00Z")]});
    expect(html).toContain("Investigación · v2");
    expect(html).toContain("Investigación · v1");
    expect(html.indexOf("Investigación · v2")).toBeLessThan(html.indexOf("Investigación · v1"));
    expect(html).toContain(`Última actividad ${new Date("2026-03-01T00:00:00Z").toLocaleString("es")}`);
  });
});
