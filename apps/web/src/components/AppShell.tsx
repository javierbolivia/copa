import type { Health, Project, Workflow } from "@our-platform/shared";
import type { ReactNode } from "react";
import {
  BadgeDollarSign, CircleAlert, Cog, Database, FileText, Filter, FolderKanban,
  History, LayoutDashboard, Library, Lightbulb, Mail, Package, PackageCheck,
  PanelsTopLeft, Rocket, Search, Settings, UserRound, type LucideIcon,
} from "lucide-react";
import { moduleInfo, modules, type NavigationKey } from "../config/modules";

const NAV_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard, research: Search, sources: Database, problems: CircleAlert,
  opportunities: Rocket, product: Package, avatar: UserRound, mechanism: Cog, beliefs: Lightbulb,
  offer: BadgeDollarSign, landing: PanelsTopLeft, funnel: Filter, emails: Mail, content: FileText,
  final_product: PackageCheck, knowledge: Library, history: History, settings: Settings,
};

const GROUPS: { label: string; keys: NavigationKey[] }[] = [
  { label: "Proyecto", keys: ["overview", "research", "sources", "problems", "opportunities"] },
  { label: "Estrategia", keys: ["product", "avatar", "mechanism", "beliefs", "offer"] },
  { label: "Creación", keys: ["landing", "funnel", "emails", "content", "final_product"] },
  { label: "Conocimiento", keys: ["knowledge", "history"] },
  { label: "Configuración", keys: ["settings"] },
];

export function AppShell({ project, active, workflow, health, onNavigate, onProjects, children }:{
  project: Project | null; active: NavigationKey; workflow: Workflow | null; health: Health | null;
  onNavigate:(key:NavigationKey)=>void; onProjects:()=>void; children:ReactNode;
}) {
  const states = new Map(workflow?.steps.map((step) => [step.stepKey, step]));
  const info = moduleInfo(active);
  const Icon = NAV_ICONS[active] ?? LayoutDashboard;
  const progress = project?.workflowTotalSteps ? Math.round(project.workflowCompletedSteps / project.workflowTotalSteps * 100) : 0;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark" aria-hidden="true"><svg viewBox="0 0 36 36" focusable="false"><path d="M10 9v18M26 9v18M10 18h16"/><circle cx="10" cy="9" r="2.4"/><circle cx="26" cy="9" r="2.4"/><circle cx="10" cy="27" r="2.4"/><circle cx="26" cy="27" r="2.4"/><circle cx="18" cy="18" r="2.1"/></svg></div><div><strong>Hallazia</strong><span>Research intelligence</span></div></div>
      {project&&<div className="sidebar-project"><span>Proyecto activo</span><strong>{project.name}</strong><small>{project.niche}</small><div className="sidebar-progress" aria-label={`${project.workflowCompletedSteps} de ${project.workflowTotalSteps} etapas ejecutadas`}><span style={{width:`${progress}%`}}/></div><small>{project.workflowCompletedSteps}/{project.workflowTotalSteps} etapas ejecutadas</small></div>}
      <nav aria-label="Módulos de la plataforma">
        <button title="Mis Proyectos" className={!project ? "nav-item active" : "nav-item"} onClick={onProjects}><span className="nav-icon"><FolderKanban size={18} strokeWidth={1.8}/></span><span>Mis Proyectos</span></button>
        {project && GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-label">{group.label}</p>
            {group.keys.map((key) => {
              const item = modules.find((m) => m.key === key);
              if (!item) return null;
              const state = states.get(key);
              const GIcon = NAV_ICONS[key] ?? LayoutDashboard;
              return <button key={key} title={item.label} aria-current={active===key?"page":undefined} className={active===key?"nav-item active":"nav-item"} onClick={()=>onNavigate(key)}>
                <span className="nav-icon"><GIcon size={18} strokeWidth={1.8}/></span><span>{item.label}</span>{state&&<span className={`nav-state ${state.state.toLowerCase()}`} title={state.staleReason??state.state}/>}
              </button>;
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-status"><span className={`status-dot ${health?.status==="ok"?"ok":""}`}/><div><strong>Sistema local</strong><span>SQLite {health?.sqlite.status??"…"} · schema {health?.sqlite.schemaVersion??"…"}</span></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-context">
          <span className="topbar-context-icon" aria-hidden="true"><Icon size={16} strokeWidth={1.8}/></span>
          <div className="topbar-copy"><span className="topbar-breadcrumb"><span className="topbar-project">{project ? project.name : "Workspace"}</span><span className="topbar-sep">/</span><span className="topbar-module">{project ? info.label : "Mis Proyectos"}</span></span><span className="topbar-description">{project ? info.description : "Organiza y abre tus espacios de trabajo"}</span></div>
        </div>
        <div className="topbar-actions"><span className={`topbar-system ${health?.status==="ok"?"online":""}`}><i/>Local</span>{project && <button className="button secondary topbar-back" onClick={onProjects}>Todos los proyectos</button>}</div>
      </header>
      {children}
    </main>
  </div>;
}

export function ScreenState({ title, message, action }:{title:string;message:string;action?:ReactNode}) {
  return <section className="content-section"><div className="empty-state large"><div className="empty-icon"><LayoutDashboard size={20} strokeWidth={1.8}/></div><h2>{title}</h2><p>{message}</p>{action}</div></section>;
}
