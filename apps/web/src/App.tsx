import type { ArtifactVersion, BackupInfo, CreateProjectInput, Health, Project, ProjectSettings, Workflow } from "@our-platform/shared";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api/client";
import { AppShell, ScreenState } from "./components/AppShell";
import { isModuleKey, type NavigationKey } from "./config/modules";
import { HistoryView, ModuleView } from "./features/modules/ModuleView";
import { OverviewView } from "./features/overview/OverviewView";
import { ProjectsView } from "./features/projects/ProjectsView";
import { SettingsView } from "./features/settings/SettingsView";

export function App() {
  const [projects,setProjects]=useState<Project[]>([]),[selected,setSelected]=useState<Project|null>(null),[active,setActive]=useState<NavigationKey>("overview");
  const [evidenceFocus,setEvidenceFocus]=useState<string|null>(null);
  const [health,setHealth]=useState<Health|null>(null),[workflow,setWorkflow]=useState<Workflow|null>(null),[settings,setSettings]=useState<ProjectSettings|null>(null);
  const [artifacts,setArtifacts]=useState<ArtifactVersion[]>([]),[backups,setBackups]=useState<BackupInfo[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);

  const loadProjects=async()=>setProjects((await api.projects()).projects);
  const loadProjectSystem=async(projectId:string)=>{const [nextWorkflow,nextSettings,nextArtifacts]=await Promise.all([api.workflow(projectId),api.settings(projectId),api.artifacts(projectId)]);setWorkflow(nextWorkflow);setSettings(nextSettings);setArtifacts(nextArtifacts.versions);};
  useEffect(()=>{Promise.all([loadProjects(),api.health().then(setHealth),api.backups().then((response)=>setBackups(response.backups))]).catch((reason)=>setError(messageOf(reason)));},[]);
  useEffect(()=>{if(!selected){setWorkflow(null);setSettings(null);setArtifacts([]);return;}void loadProjectSystem(selected.id).catch((reason)=>setError(messageOf(reason)));},[selected?.id]);

  const saveProject=async(input:CreateProjectInput,project?:Project)=>{setBusy(true);setError(null);try{const saved=project?await api.updateProject(project.id,input):await api.createProject(input);if(selected?.id===saved.id)setSelected(saved);await loadProjects();}catch(reason){setError(messageOf(reason));throw reason;}finally{setBusy(false);}};
  const createDemo=async()=>{setBusy(true);setError(null);try{const {project}=await api.createDemoProject();await loadProjects();setSelected(project);setActive("overview");}catch(reason){setError(messageOf(reason));}finally{setBusy(false);}};
  const archive=async(project:Project)=>{await api.archiveProject(project.id);if(selected?.id===project.id)setSelected(null);await loadProjects();};
  const restore=async(project:Project)=>{await api.restoreProject(project.id);await loadProjects();};
  const remove=async(project:Project)=>{await api.deleteProject(project.id,project.name);await loadProjects();};
  const saveSettings=async(event:FormEvent)=>{event.preventDefault();if(!selected||!settings)return;setBusy(true);try{const {projectId:_,updatedAt:__,...input}=settings;setSettings(await api.saveSettings(selected.id,input));}catch(reason){setError(messageOf(reason));}finally{setBusy(false);}};
  const createBackup=async()=>{try{await api.createBackup();setBackups((await api.backups()).backups);}catch(reason){setError(messageOf(reason));}};
  const restoreBackup=async(filename:string)=>{if(!window.confirm(`Se creará un backup de seguridad. ¿Restaurar ${filename}?`))return;try{await api.restoreBackup(filename);window.location.reload();}catch(reason){setError(messageOf(reason));}};
  const refresh=()=>{if(selected)void Promise.all([loadProjectSystem(selected.id),loadProjects()]).catch((reason)=>setError(messageOf(reason)));};

  return <AppShell project={selected} active={active} workflow={workflow} health={health} onNavigate={setActive} onProjects={()=>{setSelected(null);setActive("overview");}}>
    {error&&<div className="error-banner global" role="alert"><div><strong>La operación no se completó</strong><span>{error}</span></div><button aria-label="Cerrar error" onClick={()=>setError(null)}>×</button></div>}
    {!selected?<ProjectsView projects={projects} onOpen={(project)=>{setSelected(project);setActive("overview");}} onSave={saveProject} onArchive={archive} onRestore={restore} onDelete={remove} onCreateDemo={createDemo} busy={busy}/>
    :active==="overview"?<OverviewView project={selected} workflow={workflow} artifacts={artifacts} onEdit={()=>setActive("settings")} onNavigate={(key)=>{if(isNavigationKey(key))setActive(key);}}/>
    :active==="settings"?<SettingsView settings={settings} setSettings={setSettings} onSave={saveSettings} backups={backups} onBackup={()=>void createBackup()} onRestore={(filename)=>void restoreBackup(filename)}/>
    :active==="history"?<HistoryView projectId={selected.id}/>
    :isModuleKey(active)?<ModuleView projectId={selected.id} moduleKey={active} evidenceFocus={evidenceFocus} onOpenEvidence={(commentId)=>{setEvidenceFocus(commentId);setActive("sources");}} onChanged={refresh}/>
    :<ScreenState title="Módulo no disponible" message="La ruta solicitada no forma parte del workflow."/>}
  </AppShell>;
}

function messageOf(reason:unknown){return reason instanceof Error?reason.message:"Ocurrió un error inesperado.";}
function isNavigationKey(value:string):value is NavigationKey{return ["overview","research","sources","problems","opportunities","product","avatar","mechanism","beliefs","offer","landing","funnel","emails","content","final_product","history","settings"].includes(value);}
