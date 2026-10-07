// @vitest-environment happy-dom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it,vi} from "vitest";
import {RefinedModuleOutput} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
import {api} from "../../web/src/api/client.ts";

describe("Content draft save",()=>{
  it.each([false,true])("saves the selected draft with its origin (existing approved: %s)",async(hasApproved)=>{
    const previous=globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const selected={versionId:"draft-2",versionNumber:2,status:"draft",freshness:"fresh",createdAt:"2026-10-03T00:00:00Z",outputData:{calendar:[{day:1,type:"post",hook:"Idea",body:"Texto",channel:"Blog",cta:"Leer"}]}};
    const saved={...selected,versionId:"draft-3",versionNumber:3};
    const save=vi.spyOn(api,"saveModuleDraft").mockResolvedValue(saved);
    const created=vi.fn();
    const container=document.createElement("div");document.body.append(container);
    const root=createRoot(container);
    try{
      await act(async()=>root.render(createElement(RefinedModuleOutput,{projectId:"project-a",moduleKey:"content",selected,versions:hasApproved?[selected,{...selected,versionId:"approved-1",status:"approved",freshness:"stale"}]:[selected],files:[],onVersionCreated:created,onSelectVersion:()=>{},onRegenerate:async()=>{}})));
      const button=[...container.querySelectorAll("button")].find(item=>item.textContent==="Guardar cambios");
      expect(button).toBeDefined();
      expect(button.disabled).toBe(true);
      await act(async()=>button.click());
      expect(save).not.toHaveBeenCalled();
      const edit=[...container.querySelectorAll("button")].find(item=>item.textContent==="Editar");
      await act(async()=>edit.click());
      const textarea=container.querySelector("textarea");
      const setValue=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set;
      await act(async()=>{setValue.call(textarea,"Texto actualizado");textarea.dispatchEvent(new Event("input",{bubbles:true}));});
      expect(button.disabled).toBe(false);
      await act(async()=>button.click());
      expect(save).toHaveBeenCalledWith("project-a","content",expect.objectContaining({calendar:expect.any(Array)}),hasApproved?"approved-1":undefined,"draft-2");
      expect(save.mock.calls[0][2].calendar[0].body).toBe("Texto actualizado");
      expect(created).toHaveBeenCalledWith(saved);
    }finally{await act(async()=>root.unmount());container.remove();save.mockRestore();globalThis.IS_REACT_ACT_ENVIRONMENT=previous;}
  });
});

describe("Content draft approval",()=>{
  it("warns before replacing a fresh approved version and preserves it when canceled",async()=>{
    const previous=globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const selected={versionId:"draft-2",versionNumber:2,status:"draft",freshness:"fresh",createdAt:"2026-10-03T00:00:00Z",outputData:{calendar:[]}};
    const confirm=vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm",confirm);
    const approve=vi.spyOn(api,"approveModuleVersion").mockResolvedValue({...selected,status:"approved"});
    const container=document.createElement("div");document.body.append(container);
    const root=createRoot(container);
    try{
      await act(async()=>root.render(createElement(RefinedModuleOutput,{projectId:"project-a",moduleKey:"content",selected,versions:[selected,{...selected,versionId:"approved-1",status:"approved",freshness:"fresh"}],files:[],onVersionCreated:()=>{},onSelectVersion:()=>{},onRegenerate:async()=>{}})));
      const button=[...container.querySelectorAll("button")].find(item=>item.textContent.includes("Aprobar versión"));
      expect(button.textContent).toContain("Puede obsoletar dependientes");
      await act(async()=>button.click());
      expect(confirm).toHaveBeenCalledOnce();
      expect(approve).not.toHaveBeenCalled();
      confirm.mockReturnValue(true);
      await act(async()=>button.click());
      expect(approve).toHaveBeenCalledWith("project-a","content","draft-2");
    }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();approve.mockRestore();globalThis.IS_REACT_ACT_ENVIRONMENT=previous;}
  });
});
