import {describe,it,expect} from "vitest";
import {createDemoOutput} from "../src/domain/demo-outputs.js";
import {validateMechanismOutput} from "../src/services/mechanism-output-validator.js";
describe("Mechanism context and hypothesis validation",()=>{
  const output={...createDemoOutput("mechanism",[]),evidenceIds:["context"]};
  it("allows context citations on a proposed inference without pretending efficacy",()=>{
    expect(validateMechanismOutput(output,[{id:"context"}]).audit.ok).toBe(true);
  });
  it.each(["rootCauseHypothesis","differentiation","simpleExplanation","detailedExplanation"])("requires %s",field=>{
    expect(validateMechanismOutput({...output,[field]:" "},[{id:"context"}]).audit.ok).toBe(false);
  });
  it("rejects stale context, unsupported provenance and malformed optional lists",()=>{
    for(const patch of [{evidenceIds:["foreign"]},{provenance:"proven"},{steps:[{}]},{validationPlan:[""]},{evidenceIds:[],provenance:"EVIDENCE_BACKED"}])expect(validateMechanismOutput({...output,...patch},[{id:"context"}]).audit.ok).toBe(false);
  });
});
