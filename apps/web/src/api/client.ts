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
} from "@our-platform/shared";

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ProviderStatus { openai:{configured:boolean;economyModel:string;powerfulModel:string};defaultProvider:"mock"|"openai" }
export interface TraceabilityNode { id:string;kind:"artifact"|"evidence"|"source";label:string;subtitle:string|null;artifactType:string|null;versionNumber:number|null;status:string|null;freshness:string|null;provenance:string|null }
export interface TraceabilityGraph { rootId:string;nodes:TraceabilityNode[];edges:Array<{from:string;to:string;relation:string}>;evidenceCount:number;sourceCount:number }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new ApiClientError(body.message ?? `Error HTTP ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => body === undefined
  ? { method }
  : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };

export const api = {
  health: () => request<Health>("/api/health"),
  projects: () => request<ProjectList>("/api/projects?includeArchived=true"),
  createProject: (input: CreateProjectInput) => request<Project>("/api/projects", json("POST", input)),
  createDemoProject: () => request<{ project: Project; results: ModuleResult[] }>("/api/demo/projects", json("POST")),
  updateProject: (id: string, input: CreateProjectInput) => request<Project>(`/api/projects/${id}`, json("PATCH", input)),
  archiveProject: (id: string) => request<Project>(`/api/projects/${id}`, json("DELETE")),
  restoreProject: (id: string) => request<Project>(`/api/projects/${id}/restore`, json("POST")),
  deleteProject: (id: string, confirmProjectName: string) => request<{ deleted: true }>(`/api/projects/${id}/permanent`, json("DELETE", { confirmProjectName })),
  workflow: (id: string) => request<Workflow>(`/api/projects/${id}/workflow`),
  settings: (id: string) => request<ProjectSettings>(`/api/projects/${id}/settings`),
  saveSettings: (id: string, settings: Omit<ProjectSettings, "projectId" | "updatedAt">) => request<ProjectSettings>(`/api/projects/${id}/settings`, json("PUT", settings)),
  artifacts: (id: string) => request<{ versions: ArtifactVersion[] }>(`/api/projects/${id}/artifacts`),
  backups: () => request<{ backups: BackupInfo[] }>("/api/backups"),
  createBackup: () => request<BackupInfo>("/api/backups", json("POST")),
  restoreBackup: (filename: string) => request("/api/backups/restore", json("POST", { filename, confirmed: true })),
  sources: (id: string) => request<{ sources: import("@our-platform/shared").Source[] }>(`/api/projects/${id}/sources`),
  comments: (id: string, offset=0) => request<{ comments: import("@our-platform/shared").Comment[] }>(`/api/projects/${id}/comments?limit=1000&offset=${offset}`),
  createSource: (id: string, input: CreateSourceInput) => request<import("@our-platform/shared").SourceBundle | { source: import("@our-platform/shared").Source; job: Job }>(`/api/projects/${id}/sources`, json("POST", input)),
  jobs: (id: string) => request<{ jobs: Job[] }>(`/api/projects/${id}/jobs`),
  cancelJob: (id:string,jobId:string)=>request<Job>(`/api/projects/${id}/jobs/${jobId}/cancel`,json("POST")),
  retryJob: (id:string,jobId:string)=>request<Job>(`/api/projects/${id}/jobs/${jobId}/retry`,json("POST")),
  generations: (id: string) => request<{ generations: Generation[] }>(`/api/projects/${id}/generations`),
  files: (id: string) => request<{ files: GeneratedFile[] }>(`/api/projects/${id}/files`),
  evidence: (id: string, evidenceId: string) => request<EvidenceSnippet>(`/api/projects/${id}/evidence/${evidenceId}`),
  moduleResults: (id: string, key: ModuleKey) => request<{ results: ModuleResult[] }>(`/api/projects/${id}/modules/${key}`),
  runModule: (id: string, key: ModuleKey, input: RunModuleInput) => request<ModuleResult>(`/api/projects/${id}/modules/${key}/run`, json("POST", input)),
  providerStatus:(id:string)=>request<ProviderStatus>(`/api/projects/${id}/providers/status`),
  saveModuleDraft:(id:string,key:ModuleKey,outputData:unknown)=>request<ModuleResult>(`/api/projects/${id}/modules/${key}/drafts`,json("POST",{outputData})),
  approveModuleVersion:(id:string,key:ModuleKey,versionId:string)=>request<ModuleResult>(`/api/projects/${id}/modules/${key}/versions/${versionId}/approve`,json("POST")),
  traceability:(id:string,versionId:string)=>request<TraceabilityGraph>(`/api/projects/${id}/versions/${versionId}/traceability`),
  youtubeStatus:()=>request<{configured:boolean}>("/api/integrations/youtube/status"),
};
