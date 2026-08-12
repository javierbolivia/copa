import type { Health, Project, Workflow } from "@our-platform/shared";
import type { ReactNode } from "react";
import { moduleInfo, modules, type NavigationKey } from "../config/modules";

export function AppShell({ project, active, workflow, health, onNavigate, onProjects, children }:{
  project: Project | null; active: NavigationKey; workflow: Workflow | null; health: Health | null;
  onNavigate:(key:NavigationKey)=>void; onProjects:()=>void; children:ReactNode;
}) {
  const states = new Map(workflow?.steps.map((step) => [step.stepKey, step]));
  const info = moduleInfo(active);
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">OR</div><div><strong>Our Platform</strong><span>Local workspace</span></div></div>
      <nav aria-label="Módulos de la plataforma">
        <p className="nav-label">{project ? "PROYECTO" : "ESPACIO PERSONAL"}</p>
        <button className={!project ? "nav-item active" : "nav-item"} onClick={onProjects}><span className="nav-icon">P</span><span>Mis Proyectos</span></button>
        {project && modules.map((item) => {
          const state = states.get(item.key);
          return <button key={item.key} title={item.label} aria-current={active===item.key?"page":undefined} className={active===item.key?"nav-item active":"nav-item"} onClick={()=>onNavigate(item.key)}>
            <span className="nav-icon">{item.short}</span><span>{item.label}</span>{state&&<span className={`nav-state ${state.state.toLowerCase()}`} title={state.staleReason??state.state}/>} 
          </button>;
        })}
      </nav>
      <div className="sidebar-status"><span className={`status-dot ${health?.status==="ok"?"ok":""}`}/><div><strong>Sistema local</strong><span>SQLite {health?.sqlite.status??"…"} · schema {health?.sqlite.schemaVersion??"…"}</span></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">{project?project.niche:"ESPACIO PERSONAL"}</span><h1>{project?(active==="overview"?project.name:info.label):"Mis Proyectos"}</h1>{project&&active!=="overview"&&<p className="topbar-description">{info.description}</p>}</div>{project&&<button className="button secondary" onClick={onProjects}>← Proyectos</button>}</header>
      {children}
    </main>
  </div>;
}

export function ScreenState({ title, message, action }:{title:string;message:string;action?:ReactNode}) {
  return <section className="content-section"><div className="empty-state large"><div className="empty-icon">◇</div><h2>{title}</h2><p>{message}</p>{action}</div></section>;
}

