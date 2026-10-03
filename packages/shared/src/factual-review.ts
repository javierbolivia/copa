import {Type,type Static} from "@sinclair/typebox";

/** An explicit human attestation, never a provider-generated verification. */
export const FinalProductReviewInputSchema=Type.Object({
  sourcesOpened:Type.Literal(true),
  reviewedAllClaims:Type.Literal(true),
  notes:Type.String({minLength:20,maxLength:4000}),
  checks:Type.Array(Type.Object({
    referenceId:Type.String({pattern:"^R[1-9][0-9]*$"}),
    sourceUrl:Type.String({minLength:8,maxLength:2048}),
    sourceExcerpt:Type.String({minLength:40,maxLength:12000}),
    manuscriptClaim:Type.String({minLength:20,maxLength:4000}),
  },{additionalProperties:false}),{minItems:2,maxItems:100}),
},{additionalProperties:false});
export type FinalProductReviewInput=Static<typeof FinalProductReviewInputSchema>;
