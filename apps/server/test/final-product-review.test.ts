import {describe,expect,it} from "vitest";
import {finalProductReviewStatus,manuscriptHash,recordFinalProductReview} from "../src/services/final-product-review.js";

const text="Afirmación de prueba con un contenido concreto para revisar. ".repeat(160)+"(R1, R2)";
const output={guide:{title:"Test",introduction:text,conclusion:text,chapters:[1,2,3].map(i=>({title:`Capítulo ${i}`,content:text})),references:[1,2].map(i=>({id:`R${i}`,title:`Fuente ${i}`,organization:"Fixture",url:`https://example.invalid/${i}`}))},checklist:[],workbook:[]};
const input={sourcesOpened:true as const,reviewedAllClaims:true as const,notes:"Revisión humana ficticia para una prueba local aislada.",checks:[1,2].map(i=>({referenceId:`R${i}`,sourceUrl:`https://example.invalid/${i}`,sourceExcerpt:"Extracto simulado de una fuente para probar la vinculación de esta revisión.",manuscriptClaim:"Afirmación de prueba con un contenido concreto para revisar."}))};
describe("version-bound factual review",()=>{
  it("does not trust a provider's or editable output's review stamp",()=>{
    const stamp=recordFinalProductReview(output,input);
    expect(finalProductReviewStatus({...output,finalProductFactualReview:stamp},{source:"provider",finalProductFactualReview:stamp}).status).toBe("PENDING");
    expect(finalProductReviewStatus({...output,finalProductFactualReview:stamp},{source:"user"}).status).toBe("PENDING");
  });
  it("invalidates a recorded review after any manuscript or deliverable edit",()=>{
    const snapshot={source:"user",finalProductFactualReview:recordFinalProductReview(output,input)};
    expect(finalProductReviewStatus(output,snapshot).status).toBe("RECORDED");
    expect(finalProductReviewStatus({...output,guide:{...output.guide,title:"Otro título"}},snapshot).status).toBe("PENDING");
    expect(finalProductReviewStatus({...output,checklist:["Nueva recomendación"]},snapshot).status).toBe("PENDING");
    expect(manuscriptHash({...output,finalProductValidationAudit:{ok:true}})).toBe(manuscriptHash(output));
  });
  it("records an assistant source audit without presenting it as human review",()=>{
    const snapshot={source:"user",finalProductFactualReview:recordFinalProductReview(output,input,"ASSISTANT_SOURCE_AUDIT")};
    expect(finalProductReviewStatus(output,snapshot)).toMatchObject({status:"RECORDED",kind:"ASSISTANT_SOURCE_AUDIT"});
    expect(finalProductReviewStatus({...output,guide:{...output.guide,title:"Versión nueva"}},snapshot).status).toBe("PENDING");
  });
  it("requires assistant coverage for each distinct cited passage",()=>{
    const distinct={...output,guide:{...output.guide,chapters:output.guide.chapters.map((chapter,index)=>index===0?{...chapter,content:"Afirmación distinta para otro capítulo. ".repeat(160)+"(R1, R2)"}:chapter)}};
    expect(()=>recordFinalProductReview(distinct,input,"ASSISTANT_SOURCE_AUDIT")).toThrow("cada pasaje citado");
  });
  it("rejects an unrelated source URL or a claim absent from the cited paragraph",()=>{
    expect(()=>recordFinalProductReview(output,{...input,checks:input.checks.map(check=>({...check,sourceUrl:"https://example.invalid/other"}))})).toThrow("URL");
    expect(()=>recordFinalProductReview(output,{...input,checks:input.checks.map(check=>({...check,manuscriptClaim:"Una afirmación que el manuscrito nunca hace."}))})).toThrow("párrafo");
  });
});
