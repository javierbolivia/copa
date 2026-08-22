import type {
  ArtifactVersion,
  BackupInfo,
  CreateProjectInput,
  CreateSourceInput,
  Generation,
  GeneratedFile,
  EvidenceSnippet,
  Health,
  Job,
  ModuleKey,
  ModuleResult,
  Project,
  ProjectList,
  ProjectSettings,
  RunModuleInput,
  Workflow,
  KnowledgeLibrary,
  KnowledgeDocument,
  KnowledgeChunkResult,
  CreateKnowledgeLibraryInput,
  ImportKnowledgeDocumentInput,
  ProductDocument,
  ProductOutlineOperation,
  CreateProductDocumentInput,
  ProductAutosaveInput,
  ProductDocumentVersion,
  MarketResearchRun,
  MarketResearchStatus,
  RunMarketResearchInput,
} from "@our-platform/shared";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ProviderStatus {
  openai: { configured: boolean; economyModel: string; powerfulModel: string };
  gemini:{configured:boolean;economyModel:string;powerfulModel:string};
  deepseek: { configured: boolean; model: string };
  defaultProvider: "mock" | "openai" | "gemini" | "deepseek";
}
export interface YouTubeResearchVideo {videoId:string;title:string;description?:string;channelId:string;channelTitle:string;publishedAt:string;thumbnailUrl?:string;duration?:string;viewCount?:number;likeCount?:number;commentCount?:number;researchScore:number;scoreExplanation:string;alreadyImported:boolean}
export interface TraceabilityNode {
  id: string;
  kind: "artifact" | "evidence" | "source" | "knowledge" | "memory";
  label: string;
  subtitle: string | null;
  artifactType: string | null;
  versionNumber: number | null;
  status: string | null;
  freshness: string | null;
  provenance: string | null;
}
export interface TraceabilityGraph {
  rootId: string;
  nodes: TraceabilityNode[];
  edges: Array<{ from: string; to: string; relation: string }>;
  evidenceCount: number;
  sourceCount: number;
  knowledgeCount: number;
  memoryCount: number;
}
export interface KnowledgeUsed {
  id: string;
  query: string;
  agentKey: string;
  contextTokenEstimate: number;
  createdAt: string;
  items: Array<{
    kind: "PROJECT_KNOWLEDGE" | "GLOBAL_KNOWLEDGE" | "APPROVED_MEMORY";
    rank: number;
    rawScore: number;
    content: string | null;
    title: string | null;
    libraryName: string | null;
    heading: string | null;
    pageNumber: number | null;
  }>;
}
export interface ProductAsset {
  id: string;
  projectId: string;
  kind: "image" | "diagram";
  title: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  url: string;
}
export interface ProductExport {
  id: string;
  documentVersionId: string;
  format: "html" | "docx" | "pdf";
  filename: string;
  bytes: number;
  checksum: string;
  createdAt: string;
  downloadUrl: string;
}
export interface ProductValidation {
  errors: string[];
  warnings: string[];
  claimWarnings: Array<{ blockId: string; message: string }>;
  canExport: boolean;
}
export interface ProductGenerationEstimate {
  provider: "mock" | "openai";
  model: string;
  chapters: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  currency: "USD";
  maxBudget: number | null;
  remainingBudget: number | null;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new ApiClientError(
      body.message ?? `Error HTTP ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit =>
  body === undefined
    ? { method }
    : {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      };

export const api = {
  health: () => request<Health>("/api/health"),
  projects: () => request<ProjectList>("/api/projects?includeArchived=true"),
  createProject: (input: CreateProjectInput) =>
    request<Project>("/api/projects", json("POST", input)),
  createDemoProject: () =>
    request<{ project: Project; results: ModuleResult[] }>(
      "/api/demo/projects",
      json("POST"),
    ),
  updateProject: (id: string, input: CreateProjectInput) =>
    request<Project>(`/api/projects/${id}`, json("PATCH", input)),
  archiveProject: (id: string) =>
    request<Project>(`/api/projects/${id}`, json("DELETE")),
  restoreProject: (id: string) =>
    request<Project>(`/api/projects/${id}/restore`, json("POST")),
  deleteProject: (id: string) =>
    request<{ deleted: true }>(`/api/projects/${id}/permanent`, { method: "DELETE" }),
  workflow: (id: string) => request<Workflow>(`/api/projects/${id}/workflow`),
  settings: (id: string) =>
    request<ProjectSettings>(`/api/projects/${id}/settings`),
  saveSettings: (
    id: string,
    settings: Omit<ProjectSettings, "projectId" | "updatedAt">,
  ) =>
    request<ProjectSettings>(
      `/api/projects/${id}/settings`,
      json("PUT", settings),
    ),
  artifacts: (id: string) =>
    request<{ versions: ArtifactVersion[] }>(`/api/projects/${id}/artifacts`),
  backups: () => request<{ backups: BackupInfo[] }>("/api/backups"),
  createBackup: () => request<BackupInfo>("/api/backups", json("POST")),
  restoreBackup: (filename: string) =>
    request(
      "/api/backups/restore",
      json("POST", { filename, confirmed: true }),
    ),
  sources: (id: string) =>
    request<{ sources: import("@our-platform/shared").Source[] }>(
      `/api/projects/${id}/sources`,
    ),
  comments: (id: string, offset = 0) =>
    request<{ comments: import("@our-platform/shared").Comment[] }>(
      `/api/projects/${id}/comments?limit=1000&offset=${offset}`,
    ),
  createSource: (id: string, input: CreateSourceInput) =>
    request<
      | import("@our-platform/shared").SourceBundle
      | { source: import("@our-platform/shared").Source; job: Job }
    >(`/api/projects/${id}/sources`, json("POST", input)),
  deleteSource: (id: string, sourceId: string) =>
    request<{ deleted: true }>(`/api/projects/${id}/sources/${sourceId}`, { method: "DELETE" }),
  jobs: (id: string) => request<{ jobs: Job[] }>(`/api/projects/${id}/jobs`),
  cancelJob: (id: string, jobId: string) =>
    request<Job>(`/api/projects/${id}/jobs/${jobId}/cancel`, json("POST")),
  retryJob: (id: string, jobId: string) =>
    request<Job>(`/api/projects/${id}/jobs/${jobId}/retry`, json("POST")),
  generations: (id: string) =>
    request<{ generations: Generation[] }>(`/api/projects/${id}/generations`),
  files: (id: string) =>
    request<{ files: GeneratedFile[] }>(`/api/projects/${id}/files`),
  evidence: (id: string, evidenceId: string) =>
    request<EvidenceSnippet>(`/api/projects/${id}/evidence/${evidenceId}`),
  moduleResults: (id: string, key: ModuleKey) =>
    request<{ results: ModuleResult[] }>(`/api/projects/${id}/modules/${key}`),
  runModule: (id: string, key: ModuleKey, input: RunModuleInput) =>
    request<ModuleResult>(
      `/api/projects/${id}/modules/${key}/run`,
      json("POST", input),
    ),
  providerStatus: (id: string) =>
    request<ProviderStatus>(`/api/projects/${id}/providers/status`),
  saveModuleDraft: (id: string, key: ModuleKey, outputData: unknown) =>
    request<ModuleResult>(
      `/api/projects/${id}/modules/${key}/drafts`,
      json("POST", { outputData }),
    ),
  approveModuleVersion: (id: string, key: ModuleKey, versionId: string) =>
    request<ModuleResult>(
      `/api/projects/${id}/modules/${key}/versions/${versionId}/approve`,
      json("POST"),
    ),
  traceability: (id: string, versionId: string) =>
    request<TraceabilityGraph>(
      `/api/projects/${id}/versions/${versionId}/traceability`,
    ),
  youtubeStatus: () =>
    request<{ configured: boolean }>("/api/integrations/youtube/status"),
  youtubeSearch: (id:string, query:string, pageToken?:string) => request<{items:YouTubeResearchVideo[];nextPageToken?:string}>(`/api/projects/${id}/youtube/search?q=${encodeURIComponent(query)}${pageToken?`&pageToken=${encodeURIComponent(pageToken)}`:""}`),
  importYouTubeResearch: (id:string,input:{videoId:string;title:string;topLevelLimit:number}) => request<{source:import("@our-platform/shared").Source;job:Job}>(`/api/projects/${id}/youtube/import`,json("POST",input)),
  setSourceAnalysis: (id:string,sourceId:string,included:boolean) => request<import("@our-platform/shared").Source>(`/api/projects/${id}/sources/${sourceId}/analysis`,json("PUT",{included})),
  marketResearchStatus: (id: string) =>
    request<MarketResearchStatus>(`/api/projects/${id}/market-research/status`),
  latestMarketResearch: (id: string) =>
    request<MarketResearchRun | null>(`/api/projects/${id}/market-research/latest`),
  marketResearchHistory: (id: string) =>
    request<import("@our-platform/shared").MarketResearchHistory>(`/api/projects/${id}/market-research/history`),
  runMarketResearch: (id: string, input: RunMarketResearchInput) =>
    request<MarketResearchRun>(`/api/projects/${id}/market-research`, json("POST", input)),
  researchFocus: (id:string) => request<{value:string|null;source:"user"|"youtube_query"|null}>(`/api/projects/${id}/research-focus`),
  saveResearchFocus: (id:string,value:string,source:"user"|"youtube_query"="user") => request<{value:string;source:"user"|"youtube_query"}>(`/api/projects/${id}/research-focus`,json("PUT",{value,source})),
  analysisSet: (id:string) => request<{comments:import("@our-platform/shared").Comment[]}>(`/api/projects/${id}/analysis-set`),
  knowledgeLibraries: (id: string) =>
    request<{ libraries: KnowledgeLibrary[] }>(
      `/api/projects/${id}/knowledge/libraries`,
    ),
  createKnowledgeLibrary: (id: string, input: CreateKnowledgeLibraryInput) =>
    request<KnowledgeLibrary>(
      `/api/projects/${id}/knowledge/libraries`,
      json("POST", input),
    ),
  selectKnowledgeLibrary: (id: string, libraryId: string, enabled: boolean) =>
    request<KnowledgeLibrary>(
      `/api/projects/${id}/knowledge/libraries/${libraryId}/selection`,
      json("PUT", { enabled }),
    ),
  knowledgeDocuments: (id: string, libraryId: string) =>
    request<{ documents: KnowledgeDocument[] }>(
      `/api/projects/${id}/knowledge/libraries/${libraryId}/documents`,
    ),
  importKnowledgeDocument: (
    id: string,
    libraryId: string,
    input: ImportKnowledgeDocumentInput,
  ) =>
    request<KnowledgeDocument>(
      `/api/projects/${id}/knowledge/libraries/${libraryId}/documents`,
      json("POST", input),
    ),
  deleteKnowledgeDocument: (id: string, documentId: string) =>
    request<{ deleted: true }>(
      `/api/projects/${id}/knowledge/documents/${documentId}`,
      json("DELETE"),
    ),
  searchKnowledge: (
    id: string,
    q: string,
    filters: {
      libraryId?: string;
      scope?: "GLOBAL" | "PROJECT";
      category?: string;
      tags?: string;
      fileType?: string;
    } = {},
  ) =>
    request<{ results: KnowledgeChunkResult[]; total: number }>(
      `/api/projects/${id}/knowledge/search?${new URLSearchParams({ q, ...filters })}`,
    ),
  saveMemoryDecision: (
    id: string,
    versionId: string,
    input: {
      decision: "APPROVED" | "REJECTED";
      reusable?: boolean;
      preferred?: boolean;
      visibility?: "PROJECT" | "GLOBAL";
      notes?: string;
      editedOutput?: unknown;
    },
  ) =>
    request<{ memoryId: string }>(
      `/api/projects/${id}/knowledge/memory/${versionId}`,
      json("PUT", input),
    ),
  askKnowledge: (id: string, question: string) =>
    request<{
      answer: string;
      citations: KnowledgeChunkResult[];
      grounded: boolean;
      mode: "extractive" | "openai";
    }>(`/api/projects/${id}/knowledge/ask`, json("POST", { question })),
  knowledgeUsed: (id: string, generationId: string) =>
    request<KnowledgeUsed>(
      `/api/projects/${id}/generations/${generationId}/knowledge`,
    ),
  productDocuments: (id: string) =>
    request<{ documents: ProductDocument[] }>(
      `/api/projects/${id}/product-documents`,
    ),
  productDocument: (id: string, documentId: string) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}`,
    ),
  productDocumentVersions: (id: string, documentId: string) =>
    request<{ versions: ProductDocumentVersion[] }>(
      `/api/projects/${id}/product-documents/${documentId}/versions`,
    ),
  productGenerationEstimate: (id: string, documentId: string) =>
    request<ProductGenerationEstimate>(
      `/api/projects/${id}/product-documents/${documentId}/generation-estimate`,
    ),
  createProductDocument: (id: string, input: CreateProductDocumentInput) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents`,
      json("POST", input),
    ),
  generateProductOutline: (id: string, documentId: string) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}/outline/generate`,
      json("POST", {}),
    ),
  updateProductOutline: (
    id: string,
    documentId: string,
    input: ProductOutlineOperation,
  ) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}/outline`,
      json("PATCH", input),
    ),
  approveProductOutline: (id: string, documentId: string) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}/outline/approve`,
      json("POST", {}),
    ),
  generateProductChapter: (id: string, documentId: string, chapterId: string) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}/chapters/${chapterId}/generate`,
      json("POST", {}),
    ),
  approveProductChapter: (id: string, documentId: string, chapterId: string) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}/chapters/${chapterId}/approve`,
      json("POST", {}),
    ),
  generatePendingProductChapters: (id: string, documentId: string) =>
    request<ProductDocument | { job: Job }>(
      `/api/projects/${id}/product-documents/${documentId}/chapters/generate-pending`,
      json("POST", {}),
    ),
  autosaveProductDocument: (
    id: string,
    documentId: string,
    input: ProductAutosaveInput,
  ) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}/autosave`,
      json("PUT", input),
    ),
  approveProductDocument: (id: string, documentId: string) =>
    request<ProductDocument>(
      `/api/projects/${id}/product-documents/${documentId}/approve`,
      json("POST", {}),
    ),
  validateProductDocument: (id: string, documentId: string) =>
    request<ProductValidation>(
      `/api/projects/${id}/product-documents/${documentId}/validate`,
      json("POST", {}),
    ),
  productAssets: (id: string) =>
    request<{ assets: ProductAsset[] }>(`/api/projects/${id}/product-assets`),
  uploadProductAsset: (
    id: string,
    input: {
      title: string;
      filename: string;
      mimeType: string;
      contentBase64: string;
    },
  ) =>
    request<ProductAsset>(
      `/api/projects/${id}/product-assets`,
      json("POST", input),
    ),
  createProductDiagram: (
    id: string,
    input: {
      title: string;
      diagramType: "flowchart" | "timeline" | "mindmap" | "process";
      description: string;
      advancedSource?: string;
    },
  ) =>
    request<ProductAsset>(
      `/api/projects/${id}/product-assets/diagrams`,
      json("POST", input),
    ),
  productExports: (id: string, documentId: string) =>
    request<{ exports: ProductExport[] }>(
      `/api/projects/${id}/product-documents/${documentId}/exports`,
    ),
  exportProductDocument: (
    id: string,
    documentId: string,
    format: "html" | "docx" | "pdf",
  ) =>
    request<ProductExport>(
      `/api/projects/${id}/product-documents/${documentId}/exports`,
      json("POST", { format }),
    ),
};
