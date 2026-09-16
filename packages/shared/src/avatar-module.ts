import {Type} from "@sinclair/typebox";

export const AVATAR_FIELDS=[
  ["currentSituation","Situación actual"],["desiredOutcome","Resultados deseados"],
  ["pains","Dolores"],["frustrations","Frustraciones"],["desires","Deseos"],
  ["objections","Objeciones"],["motivations","Motivaciones"],["language","Lenguaje textual"],
  ["purchaseConcerns","Preocupaciones de compra"],
] as const;
export type AvatarField=typeof AVATAR_FIELDS[number][0];
export interface AvatarClaim extends Record<string,unknown>{text:string;provenance:string;evidenceIds:string[]}
export type AvatarProfile={name:string}&Record<AvatarField,AvatarClaim[]>;
const claim=Type.Object({text:Type.String({minLength:1,maxLength:4000}),provenance:Type.Union([Type.Literal("EVIDENCE_BACKED"),Type.Literal("AI_INFERENCE")]),evidenceIds:Type.Array(Type.String({minLength:1}),{maxItems:20})},{additionalProperties:true});
export const AvatarModuleOutputSchema=Type.Object({schemaVersion:Type.Integer({minimum:1}),name:Type.String({minLength:1,maxLength:240}),...Object.fromEntries(AVATAR_FIELDS.map(([key])=>[key,Type.Array(claim,{minItems:key==="currentSituation"||key==="desiredOutcome"?1:0,maxItems:40})]))},{additionalProperties:true});
