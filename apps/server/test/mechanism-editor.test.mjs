import {describe,expect,it} from "vitest";
import {toMechanism,fromMechanism} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
const output={schemaVersion:1,perceivedProblem:"Problema",apparentCause:"Explicación aparente",rootCauseHypothesis:"Hipótesis de causa",mechanism:"Secuencia",solutionMechanism:"Proceso propuesto",differentiation:"Diferencia",simpleExplanation:"Breve",detailedExplanation:"Explicación detallada",steps:["Paso"],alternatives:["Alternativa"],limitations:["Alcance"],validationPlan:["Contrastar"],evidenceIds:["e"],provenance:"AI_INFERENCE",custom:"preserve"};
describe("Mechanism editor contract",()=>{
  it("preserves distinct explanations, hypothesis, alternatives and steps",()=>{expect(fromMechanism(output,toMechanism(output))).toEqual(output);});
  it("edits actual steps without replacing alternatives or evidence",()=>{
    const result=fromMechanism(output,{...toMechanism(output),steps:["Nuevo paso"]});
    expect(result.steps).toEqual(["Nuevo paso"]);expect(result.alternatives).toEqual(["Alternativa"]);expect(result.evidenceIds).toEqual(["e"]);
  });
});
