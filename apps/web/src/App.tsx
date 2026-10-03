import {TechnicalReviewStamp} from "./components/TechnicalReviewStamp";
import type { ArtifactVersion, BackupInfo, CreateProjectInput, Health, Project, ProjectSettings, Workflow } from "@our-platform/shared";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { api, type ProviderStatus } from "./api/client";
import { useRequestGuard } from "./api/useRequestGuard";
import { AppShell, ScreenState } from "./components/AppShell";
import { isModuleKey, type NavigationKey } from "./config/modules";
import { isNavigationKey, parseWorkspaceLink, workspaceLinkUrl } from "./utils/workspace-link";
import { OverviewView } from "./features/overview/OverviewView";
import { ProjectsView } from "./features/projects/ProjectsView";
const ModuleWorkspace = lazy(() => import("./features/modules/ModuleView").then(({ ModuleView }) => ({ default: ModuleView })));
const HistoryWorkspace = lazy(() => import("./features/modules/ModuleView").then(({ HistoryView }) => ({ default: HistoryView })));
const SettingsWorkspace = lazy(() => import("./features/settings/SettingsView").then(({ SettingsView }) => ({ default: SettingsView })));
const KnowledgeWorkspace = lazy(() => import("./features/knowledge/KnowledgeView").then(({ KnowledgeView }) => ({ default: KnowledgeView })));

export function App() {
  const [projects,setProjects]=useState<Project[]>([]),[selected,setSelected]=useState<Project|null>(null),[active,setActive]=useState<NavigationKey>("overview");
  const [workspaceLinkReady,setWorkspaceLinkReady]=useState(false);
  const workspaceLinkInitialized=useRef(false);
  const [evidenceFocus,setEvidenceFocus]=useState<string|null>(null);
  const [health,setHealth]=useState<Health|null>(null),[workflow,setWorkflow]=useState<Workflow|null>(null),[settings,setSettings]=useState<ProjectSettings|null>(null);
  const [providerStatus,setProviderStatus]=useState<ProviderStatus|null>(null);
  const [artifacts,setArtifacts]=useState<ArtifactVersion[]>([]),[backups,setBackups]=useState<BackupInfo[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);

  const systemRequests=useRequestGuard(selected?.id??""),projectRequests=useRequestGuard("projects");
  const loadProjects=async()=>{const current=projectRequests.begin();const response=await api.projects();if(current()){setProjects(response.projects);if(!workspaceLinkInitialized.current){workspaceLinkInitialized.current=true;const link=parseWorkspaceLink(window.location.search);const linkedProject=link&&response.projects.find(project=>project.id===link.projectId&&project.status==="active");if(link&&linkedProject){setSelected(linkedProject);setActive(link.section);}setWorkspaceLinkReady(true);}return response.projects;}return null;};
  const loadProjectSystem=async(projectId:string)=>{const alive=systemRequests.capture();if(!alive())return;const current=systemRequests.begin();setError(null);try{const [nextWorkflow,nextSettings,nextArtifacts,nextProviderStatus]=await Promise.all([api.workflow(projectId),api.settings(projectId),api.artifacts(projectId),api.providerStatus(projectId)]);if(!current())return;setWorkflow(nextWorkflow);setSettings(nextSettings);setArtifacts(nextArtifacts.versions);setProviderStatus(nextProviderStatus);}catch(reason){if(current())setError(messageOf(reason));}};
  useEffect(()=>{let alive=true;void loadProjects().catch((reason)=>{if(alive)setError(messageOf(reason));});void api.health().then(setHealth).catch((reason)=>{if(alive)setError(messageOf(reason));});void api.backups().then((response)=>setBackups(response.backups)).catch((reason)=>{if(alive)setError(messageOf(reason));});return()=>{alive=false;};},[]);
  useEffect(()=>{setWorkflow(null);setSettings(null);setArtifacts([]);setProviderStatus(null);setError(null);if(selected)void loadProjectSystem(selected.id);},[selected?.id]);
  useEffect(()=>{if(!workspaceLinkReady)return;const href=workspaceLinkUrl(window.location.href,selected?.id??null,active);window.history.replaceState(window.history.state,"",href);},[workspaceLinkReady,selected?.id,active]);

  const saveProject=async(input:CreateProjectInput,project?:Project)=>{setBusy(true);setError(null);try{const saved=project?await api.updateProject(project.id,input):await api.createProject(input);if(selected?.id===saved.id)setSelected(saved);await loadProjects();}catch(reason){setError(messageOf(reason));throw reason;}finally{setBusy(false);}};
  const createDemo=async()=>{setBusy(true);setError(null);try{const {project}=await api.createDemoProject();await loadProjects();setSelected(project);setActive("overview");}catch(reason){setError(messageOf(reason));}finally{setBusy(false);}};
  const archive=async(project:Project)=>{await api.archiveProject(project.id);if(selected?.id===project.id)setSelected(null);await loadProjects();};
  const restore=async(project:Project)=>{await api.restoreProject(project.id);await loadProjects();};
  const remove=async(project:Project)=>{await api.deleteProject(project.id);if(selected?.id===project.id)setSelected(null);await loadProjects();};
  const saveSettings=async(event:FormEvent)=>{event.preventDefault();if(!selected||!settings)return;const current=systemRequests.capture();setBusy(true);try{const {projectId:_,updatedAt:__,...input}=settings;const saved=await api.saveSettings(selected.id,input);if(current())setSettings(saved);}catch(reason){if(current())setError(messageOf(reason));}finally{if(current())setBusy(false);}};
  const createBackup=async()=>{try{await api.createBackup();setBackups((await api.backups()).backups);}catch(reason){setError(messageOf(reason));}};
  const restoreBackup=async(filename:string)=>{if(!window.confirm(`Se creará un backup de seguridad. ¿Restaurar ${filename}?`))return;try{await api.restoreBackup(filename);window.location.reload();}catch(reason){setError(messageOf(reason));}};
  const refresh=()=>{if(selected&&systemRequests.capture()())void Promise.all([loadProjectSystem(selected.id),loadProjects()]).catch((reason)=>setError(messageOf(reason)));};

  return <AppShell project={selected} active={active} workflow={workflow} health={health} onNavigate={setActive} onProjects={()=>{setSelected(null);setActive("overview");}}>
    {selected&&<TechnicalReviewStamp key={active} section={active}/>}
    {error&&<div className="error-banner global" role="alert"><div><strong>La operación no se completó</strong><span>{error}</span></div><button aria-label="Cerrar error" onClick={()=>setError(null)}>×</button></div>}
    {!selected?<ProjectsView projects={projects} onOpen={(project)=>{setSelected(project);setActive("overview");}} onSave={saveProject} onArchive={archive} onRestore={restore} onDelete={remove} onCreateDemo={createDemo} busy={busy}/>
    :active==="overview"?<OverviewView project={selected} workflow={workflow?.steps.some(step=>step.projectId!==selected.id)?null:workflow} artifacts={artifacts} loadError={error} onRetry={()=>void loadProjectSystem(selected.id)} onEdit={()=>setActive("settings")} onNavigate={(key)=>{if(isNavigationKey(key))setActive(key);}}/>
    :active==="settings"?<Suspense fallback={<ScreenState title="Cargando configuración" message="Preparando los ajustes del proyecto…"/>}><SettingsWorkspace settings={settings} providerStatus={providerStatus} setSettings={setSettings} onSave={saveSettings} backups={backups} onBackup={()=>void createBackup()} onRestore={(filename)=>void restoreBackup(filename)}/></Suspense>
    :active==="history"?<Suspense fallback={<ScreenState title="Cargando historial" message="Preparando las generaciones guardadas…"/>}><HistoryWorkspace projectId={selected.id}/></Suspense>
    :active==="knowledge"?<Suspense fallback={<ScreenState title="Cargando biblioteca" message="Preparando los documentos de conocimiento…"/>}><KnowledgeWorkspace projectId={selected.id}/></Suspense>
    :isModuleKey(active)?<Suspense fallback={<ScreenState title="Cargando módulo" message="Preparando la vista y sus datos…"/>}><ModuleWorkspace key={`${selected.id}:${active}`} projectId={selected.id} moduleKey={active} evidenceFocus={evidenceFocus} onOpenEvidence={(commentId)=>{setEvidenceFocus(commentId);setActive("sources");}} onChanged={refresh}/></Suspense>
    :<ScreenState title="Módulo no disponible" message="La ruta solicitada no forma parte del workflow."/>}
  </AppShell>;
}

function messageOf(reason:unknown){return reason instanceof Error?reason.message:"Ocurrió un error inesperado.";}
