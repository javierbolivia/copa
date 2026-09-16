import {describe,expect,it} from "vitest";
import {toAvatar,fromAvatar} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
import {reviseAvatarClaim} from "../../web/src/features/refinement/avatar-adapter.ts";
const claim=text=>({text,provenance:"EVIDENCE_BACKED",evidenceIds:["e"],note:"preserve"});
const output={schemaVersion:1,name:"Perfil",currentSituation:[claim("Situación A"),claim("Situación B")],desiredOutcome:[claim("Resultado")],pains:[claim("Dolor")],frustrations:[claim("Frustración")],desires:[claim("Deseo")],objections:[claim("Objeción")],motivations:[claim("Motivación")],language:[claim("Cita")],purchaseConcerns:[claim("Preocupación")],custom:"keep"};
describe("Avatar editor roundtrip",()=>{
  it("preserves every situation, distinct desires/results and field-level evidence",()=>{
    const edited=fromAvatar(output,toAvatar(output));
    expect(edited).toEqual(output);
  });
  it("does not reuse a quote as evidence for a rewritten assertion",()=>{
    const original=claim("Cita original");
    expect(reviseAvatarClaim(original,"Nueva interpretación")).toMatchObject({text:"Nueva interpretación",provenance:"AI_INFERENCE",evidenceIds:[]});
    expect(reviseAvatarClaim(original,original.text)).toEqual(original);
    expect(original.evidenceIds).toEqual(["e"]);
  });
});
