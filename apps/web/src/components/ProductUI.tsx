import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({eyebrow,title,description,icon:Icon,actions}:{eyebrow:string;title:string;description:string;icon:LucideIcon;actions?:ReactNode}) {
  return <header className="page-header"><div className="page-header-main"><span className="page-header-icon"><Icon size={20} strokeWidth={1.8}/></span><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>{actions&&<div className="page-header-actions">{actions}</div>}</header>;
}

export function MetricCard({label,value,detail,icon:Icon,tone="violet"}:{label:string;value:string|number;detail?:string;icon:LucideIcon;tone?:"violet"|"cyan"|"green"|"amber"}) {
  return <article className={`metric-card tone-${tone}`}><span className="metric-card-icon"><Icon size={17} strokeWidth={1.8}/></span><div><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</div></article>;
}

export function StatusBadge({children,tone="neutral"}:{children:ReactNode;tone?:"neutral"|"success"|"warning"|"danger"|"accent"|"cyan"}) {
  return <span className={`status-badge tone-${tone}`}><i/>{children}</span>;
}

export function StrengthMeter({value}:{value:number}) {
  const normalized=Math.min(100,Math.max(0,Number.isFinite(value)?value:0));
  return <span className="strength-meter" role="img" aria-label={`Strength ${normalized} de 100`}><i style={{width:`${normalized}%`}}/></span>;
}

export function SectionHeader({eyebrow,title,description,aside}:{eyebrow:string;title:string;description?:string;aside?:ReactNode}) {
  return <header className="section-header"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description&&<p>{description}</p>}</div>{aside&&<div className="section-header-aside">{aside}</div>}</header>;
}
