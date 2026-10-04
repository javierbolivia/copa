export interface EditorCommonProps<T> {
  value: T;
  onSave: (value: T) => void | boolean | Promise<void | boolean>;
  saving?: boolean | undefined;
  readOnly?: boolean | undefined;
  onEditingChange?: ((editing:boolean)=>void) | undefined;
  onOpenTraceability?: ((field: string) => void) | undefined;
}

export interface ProductModule {
  id: string;
  name: string;
  outcome: string;
}

export interface ProductEditorValue {
  proposalId: string;
  name: string;
  concept: string;
  problem: string;
  outcome: string;
  promise: string;
  format: string;
  modules: ProductModule[];
  deliverables: string[];
  checklists: string[];
  templates: string[];
  resources: string[];
  bonuses: string[];
}

export type AvatarEditorValue=import("@our-platform/shared").AvatarProfile;

export interface MechanismEditorValue {
  perceivedProblem:string; apparentCause:string; rootCauseHypothesis:string;
  mechanism:string; solutionMechanism:string; differentiation:string;
  simpleExplanation:string; detailedExplanation:string;
  steps:string[]; alternatives:string[]; limitations:string[]; validationPlan:string[]; evidenceIds:string[];
}

export interface BeliefsEditorValue {
  bigIdea: string;
  limitingBeliefs: string[];
  arguments: string[];
  currentBeliefs: string[];
  bridgeBeliefs: string[];
  requiredBeliefs: string[];
  objections: string[];
}

export interface OfferPrice {
  rationale: string;
  amount: string;
  currency: string;
  terms: string;
}

export interface OfferComponent {
  name: string;
  description: string;
}

export interface OfferEditorValue {
  name:string; benefits:string[]; deliverables:string[]; cta:string;
  mainOffer: string;
  pricing: OfferPrice;
  bonuses: OfferComponent[];
  guarantee: string;
  orderBump: OfferComponent;
  upsell: OfferComponent;
  downsell: OfferComponent;
}

export interface LandingSection {
  eyebrow: string;
  headline: string;
  body: string;
}

export interface LandingEditorValue {
  pageName:string;
  footerNote:string;
  sections:import("@our-platform/shared").LandingContentSection[];
  designTokens:import("@our-platform/shared").LandingDesignTokens;
  externalCheckout?:import("@our-platform/shared").ExternalCheckoutConfig|undefined;
}

export interface LandingVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  value: LandingEditorValue;
  status?: string | undefined;
}

export type LandingPreviewMode = "desktop" | "mobile";
