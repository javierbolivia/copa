import {AVATAR_FIELDS} from "@our-platform/shared";
import {describe,expect,it} from "vitest";
import {validateAvatarOutput} from "../src/services/avatar-output-validator.js";
const claim={text:"No encuentro mis fotos",provenance:"EVIDENCE_BACKED",evidenceIds:["e"]};
const output={name:"Organización personal",schemaVersion:2,...Object.fromEntries(AVATAR_FIELDS.map(([key])=>[key,key==="currentSituation"||key==="desiredOutcome"||key==="language"?[claim]:[]]))};
const evidence=[{id:"e",quoteText:"No encuentro mis fotos en estas carpetas"}];
describe("Avatar deterministic validation",()=>{
  it("accepts a bounded profile with literal language and unknown optional sections",()=>{expect(validateAvatarOutput(output,evidence).audit).toMatchObject({ok:true,citedEvidenceCount:1});});
  it.each([
    {provenance:"UNKNOWN"},
    {provenance:"AI_INFERENCE"},
    {evidenceIds:[]},
    {evidenceIds:["other"]},
    {text:""},
    {text:"x".repeat(4001)},
  ])("rejects malformed or unsupported claims %j",patch=>{expect(validateAvatarOutput({...output,currentSituation:[{...claim,...patch}]},evidence).audit.ok).toBe(false);});
  it("does not turn normalization into approval after an invalid reference",()=>{
    const first=validateAvatarOutput({...output,currentSituation:[{...claim,evidenceIds:["invalid"]}]},evidence);
    expect(first.audit.ok).toBe(false);
    expect(validateAvatarOutput(first.output,evidence).audit.ok).toBe(false);
  });
  it("does not claim language is literal when only a paraphrase is supplied",()=>{expect(validateAvatarOutput({...output,language:[{...claim,text:"Mis archivos son difíciles de encontrar"}]},evidence).audit.ok).toBe(false);});
  it("accepts language quote matching with case insensitivity and boundary punctuation",()=>{
    const res = validateAvatarOutput({
      ...output,
      language: [{...claim, text: "no encuentro mis fotos."}]
    }, evidence);
    expect(res.audit.ok).toBe(true);
  });
});
