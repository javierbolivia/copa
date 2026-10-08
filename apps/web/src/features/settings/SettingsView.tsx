import type { BackupInfo, ProjectSettings } from "@our-platform/shared";
import type { FormEvent } from "react";
import type { ProviderStatus } from "../../api/client";
import { hasUnsavedProjectSettings } from "./settings-dirty";

export function SettingsView({settings,savedSettings,providerStatus,setSettings,onSave,saving,backups,onBackup,onRestore}:{settings:ProjectSettings|null;savedSettings:ProjectSettings|null;providerStatus:ProviderStatus|null;setSettings:(settings:ProjectSettings)=>void;onSave:(event:FormEvent)=>void;saving:boolean;backups:BackupInfo[];onBackup:()=>void;onRestore:(filename:string)=>void}) {
  if(!settings)return <section className="content-section"><div className="skeleton-card">Cargando configuración…</div></section>;
  const hasChanges=hasUnsavedProjectSettings(settings,savedSettings);
  const field=(key:keyof ProjectSettings,value:string|number|boolean|null)=>setSettings({...settings,[key]:value});
  const providerChecking=providerStatus===null;
  const selectedProvider=settings.preferredLlmProvider??"mock";
  const customModelsApply=selectedProvider==="openai";
  const selectedProviderLabel=selectedProvider==="openai"?"OpenAI":selectedProvider==="gemini"?"Gemini":selectedProvider==="deepseek"?"DeepSeek":"Demo / Mock";
  const providers=providerStatus?[{name:"OpenAI",configured:providerStatus.openai.configured,models:`${providerStatus.openai.economyModel} / ${providerStatus.openai.powerfulModel}`},{name:"Gemini",configured:providerStatus.gemini.configured,models:`${providerStatus.gemini.economyModel} / ${providerStatus.gemini.powerfulModel}`},{name:"DeepSeek",configured:providerStatus.deepseek.configured,models:providerStatus.deepseek.model}]:[];
  return <section className="content-section settings-grid">
    <form className="detail-card settings-form" onSubmit={onSave}>
      <span className="eyebrow">PREFERENCIAS DEL PROYECTO</span><h2>Configuración</h2>
      <div className="provider-status-card">{providerChecking?<><span className="status-pill">Verificando proveedores configurados…</span><small>Las credenciales se consultan solo en el entorno y nunca se guardan en el proyecto.</small></>:providers.map((provider)=><div key={provider.name}><span className={`status-pill ${provider.configured?"fresh":"stale"}`}>{provider.name} {provider.configured?"configurado":"no configurado"}</span><small>{provider.configured?`Modelo disponible: ${provider.models}`:"No se usará hasta que se configure en el entorno."}</small></div>)}</div>
      <label>Idioma<input value={settings.language} onChange={(event)=>field("language",event.target.value)}/></label>
      <label>Mercado objetivo<input value={settings.targetMarket??""} onChange={(event)=>field("targetMarket",event.target.value||null)}/></label>
      <label>Moneda<input maxLength={3} value={settings.currency} onChange={(event)=>field("currency",event.target.value.toUpperCase())}/></label>
      <label>Idioma de contenido<input value={settings.contentLanguage} onChange={(event)=>field("contentLanguage",event.target.value)}/></label>
      <label>Proveedor LLM<select value={selectedProvider} onChange={(event)=>field("preferredLlmProvider",event.target.value)}><option value="mock">Demo / Mock (sin coste)</option><option value="openai" disabled={!providerStatus?.openai.configured}>OpenAI{providerStatus?.openai.configured?"":" (no configurado)"}</option><option value="gemini" disabled={!providerStatus?.gemini.configured}>Gemini{providerStatus?.gemini.configured?"":" (no configurado)"}</option><option value="deepseek" disabled={!providerStatus?.deepseek.configured}>DeepSeek{providerStatus?.deepseek.configured?"":" (no configurado)"}</option></select></label>
      {customModelsApply?<><label>Modelo económico<input placeholder={providerStatus?.openai.economyModel} value={settings.economyModel??""} onChange={(event)=>field("economyModel",event.target.value||null)}/></label><label>Modelo potente<input placeholder={providerStatus?.openai.powerfulModel} value={settings.powerfulModel??""} onChange={(event)=>field("powerfulModel",event.target.value||null)}/></label></>:<div className="settings-model-note"><strong>Modelos personalizados (solo OpenAI)</strong><small>{selectedProvider==="mock"?"Demo / Mock no usa un proveedor ni modelos externos.":`${selectedProviderLabel} usa el modelo configurado en el entorno. Los valores personalizados existentes se conservan, pero solo se aplican al elegir OpenAI.`}</small></div>}
      <label>Presupuesto máximo<input type="number" min="0" value={settings.maxBudget??""} onChange={(event)=>field("maxBudget",event.target.value?Number(event.target.value):null)}/></label>
      <label className="settings-toggle"><input type="checkbox" checked={settings.knowledgeEnabled} onChange={(event)=>field("knowledgeEnabled",event.target.checked)}/> Usar Knowledge Engine en generaciones</label>
      <label>Notas generales<textarea rows={5} value={settings.generalNotes??""} onChange={(event)=>field("generalNotes",event.target.value||null)}/></label>
      <button className="button primary" disabled={!hasChanges||saving}>Guardar configuración</button>
    </form>
    <article className="detail-card"><span className="eyebrow">SEGURIDAD LOCAL</span><h2>Backups</h2><p>Incluyen SQLite, archivos generados y documentos de Knowledge. Nunca incluyen `.env` ni claves.</p><button className="button primary" type="button" onClick={onBackup}>Crear backup</button><div className="backup-list">{backups.length===0?<p>No hay backups todavía.</p>:backups.map((backup)=><div key={backup.filename}><div><strong>{backup.filename}</strong><small>{(backup.bytes/1024).toFixed(1)} KB · schema {backup.schemaVersion}</small></div><button onClick={()=>onRestore(backup.filename)}>Restaurar</button></div>)}</div></article>
  </section>;
}
