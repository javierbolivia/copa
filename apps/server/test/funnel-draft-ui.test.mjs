// @vitest-environment happy-dom
import {act,createElement} from "react";
import {createRoot} from "react-dom/client";
import {describe,expect,it,vi} from "vitest";
import {RefinedModuleOutput} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
import {api} from "../../web/src/api/client.ts";

describe("Funnel draft editor",()=>{
  it("blocks unchanged saves and preserves checkout and tracking fields after an edit",async()=>{
    const previous=globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const selected={
      versionId:"approved-funnel-1",
      versionNumber:1,
      status:"approved",
      freshness:"fresh",
      createdAt:"2026-10-03T00:00:00Z",
      outputData:{
        schemaVersion:1,
        paymentsEnabled:false,
        nodes:[
          {id:"landing",type:"landing",label:"Landing",description:"Entrada",active:true,linkedArtifact:"landing-v11",price:null,externalPlatform:"none"},
          {id:"checkout",type:"checkout",label:"Checkout",description:"Pago externo",active:false,linkedArtifact:"offer-v7",price:"29",metricValue:"29",externalPlatform:"hotmart",externalCheckoutUrl:"https://checkout.example.invalid/p/1",trackingEvent:"Purchase"},
        ],
        edges:[{from:"landing",to:"checkout",event:"continue"}],
        externalCheckout:{platform:"none"},
        tracking:{events:[]},
      },
    };
    const saved={...selected,versionId:"funnel-draft-2",versionNumber:2,status:"draft"};
    const save=vi.spyOn(api,"saveModuleDraft").mockResolvedValue(saved);
    const created=vi.fn();
    const container=document.createElement("div");document.body.append(container);
    const root=createRoot(container);
    try{
      await act(async()=>root.render(createElement(RefinedModuleOutput,{projectId:"project-a",moduleKey:"funnel",selected,versions:[selected],files:[],onVersionCreated:created,onSelectVersion:()=>{},onRegenerate:async()=>{}})));
      const button=[...container.querySelectorAll("button")].find(item=>item.textContent==="Guardar cambios");
      expect(button).toBeDefined();
      expect(button.disabled).toBe(true);
      await act(async()=>button.click());
      expect(save).not.toHaveBeenCalled();

      const name=container.querySelector('input[aria-label="Nombre del paso 1"]');
      const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set;
      await act(async()=>{setValue.call(name,"Landing revisada");name.dispatchEvent(new Event("input",{bubbles:true}));});
      expect(button.disabled).toBe(false);
      await act(async()=>button.click());

      expect(save).toHaveBeenCalledOnce();
      const outputData=save.mock.calls[0][2];
      expect(outputData.nodes.find(node=>node.id==="landing").label).toBe("Landing revisada");
      expect(outputData.nodes.find(node=>node.id==="checkout")).toMatchObject({
        price:"29",
        metricValue:"29",
        externalPlatform:"hotmart",
        externalCheckoutUrl:"https://checkout.example.invalid/p/1",
        trackingEvent:"Purchase",
      });
      expect(created).toHaveBeenCalledWith(saved);
    }finally{await act(async()=>root.unmount());container.remove();save.mockRestore();globalThis.IS_REACT_ACT_ENVIRONMENT=previous;}
  });
});
