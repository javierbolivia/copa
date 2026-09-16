import {describe,it,expect} from "vitest";
import {toBeliefs,fromBeliefs} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
describe("Belief distinctions",()=>{
  const output={centralThesis:"Tesis",currentBeliefs:["Actual"],limitingBeliefs:["Límite"],bridgeBeliefs:["Puente"],requiredBeliefs:["Necesaria"],objections:["Objeción"],arguments:["Argumento"],custom:"preserve"};
  it("opens bridge beliefs independently of supporting arguments",()=>{expect(toBeliefs(output).bridgeBeliefs).toEqual(["Puente"]);});
  it("edits limiting beliefs without replacing arguments",()=>{expect(fromBeliefs(output,{...toBeliefs(output),limitingBeliefs:["Límite revisado"]})).toEqual({...output,limitingBeliefs:["Límite revisado"]});});
});
