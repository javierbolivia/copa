export interface EditorCommonProps<T> {
  value: T;
  onSave: (value: T) => void | Promise<void>;
  saving?: boolean | undefined;
  readOnly?: boolean | undefined;
  onOpenTraceability?: ((field: string) => void) | undefined;
}

export interface ProductModule {
  id: string;
  name: string;
  outcome: string;
}

export interface ProductEditorValue {
  name: string;
  promise: string;
  format: string;
  modules: ProductModule[];
  deliverables: string[];
  bonuses: string[];
}

export interface AvatarEditorValue {
  situation: string;
  pains: string[];
  desires: string[];
  objections: string[];
  language: string[];
  evidence: string[];
}

export interface MechanismEditorValue {
  name: string;
  problem: string;
  oldWay: string;
  uniqueMechanism: string;
  whyItWorks: string;
  steps: string[];
  proof: string[];
}

export interface BeliefsEditorValue {
  bigIdea: string;
  currentBeliefs: string[];
  bridgeBeliefs: string[];
  requiredBeliefs: string[];
  objections: string[];
}

export interface OfferPrice {
  amount: string;
  currency: string;
  terms: string;
}

export interface OfferComponent {
  name: string;
  description: string;
}

export interface OfferEditorValue {
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
  pageName: string;
  hero: LandingSection;
  problem: LandingSection;
  solution: LandingSection;
  benefits: string[];
  offer: LandingSection;
  guarantee: string;
  ctaLabel: string;
  footerNote: string;
}

export interface LandingVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  value: LandingEditorValue;
  status?: string | undefined;
}

export type LandingPreviewMode = "desktop" | "mobile";
