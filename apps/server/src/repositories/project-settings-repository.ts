import type { ProjectSettings, UpdateProjectSettingsInput } from "@our-platform/shared";
import type { AppDatabase } from "../database/database.js";

export class ProjectSettingsRepository {
  constructor(private readonly database: AppDatabase) {}
  get(projectId: string): ProjectSettings | undefined {
    const row = this.database.connection.prepare("SELECT * FROM project_settings WHERE project_id=?").get(projectId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return { projectId: row.project_id as string, language: row.language as string, targetMarket: row.target_market as string|null,
      currency: row.currency as string, generalNotes: row.general_notes as string|null, preferredLlmProvider: row.preferred_llm_provider as string|null,
      economyModel: row.economy_model as string|null, powerfulModel: row.powerful_model as string|null, maxBudget: row.max_budget as number|null,
      contentLanguage: row.content_language as string, knowledgeEnabled: row.knowledge_enabled === 1, updatedAt: row.updated_at as string };
  }
  update(projectId: string, input: UpdateProjectSettingsInput): ProjectSettings | undefined {
    if (!this.get(projectId)) return undefined;
    const now = new Date().toISOString();
    this.database.connection.exec("BEGIN IMMEDIATE");
    try {
    this.database.connection.prepare(`UPDATE project_settings SET language=?, target_market=?, currency=?, general_notes=?, preferred_llm_provider=?, economy_model=?, powerful_model=?, max_budget=?, content_language=?, knowledge_enabled=?, updated_at=? WHERE project_id=?`)
      .run(input.language, input.targetMarket, input.currency.toUpperCase(), input.generalNotes, input.preferredLlmProvider, input.economyModel, input.powerfulModel, input.maxBudget, input.contentLanguage, input.knowledgeEnabled===false?0:1, now, projectId);
    this.database.connection.prepare("UPDATE projects SET language=?, currency=?, region=?, updated_at=? WHERE id=?").run(input.language, input.currency.toUpperCase(), input.targetMarket, now, projectId);
    this.database.connection.exec("COMMIT");
    return this.get(projectId);
    }catch(error){if(this.database.connection.isTransaction)this.database.connection.exec("ROLLBACK");throw error;}
  }

  researchFocus(projectId:string):{value:string|null;source:"user"|"youtube_query"|null}|undefined {
    const row=this.database.connection.prepare("SELECT research_focus,research_focus_source FROM project_settings WHERE project_id=?").get(projectId) as {research_focus:string|null;research_focus_source:"user"|"youtube_query"|null}|undefined;
    return row?{value:row.research_focus,source:row.research_focus_source}:undefined;
  }

  setResearchFocus(projectId:string,value:string,source:"user"|"youtube_query"):{value:string;source:"user"|"youtube_query"}|undefined {
    const current=this.researchFocus(projectId);if(!current)return undefined;
    const normalized=value.trim().replace(/\s+/gu," ");
    if(normalized.length<3||normalized.length>240)throw new Error("El Research Focus debe tener entre 3 y 240 caracteres.");
    if(source==="youtube_query"&&current.source==="user"&&current.value)return {value:current.value,source:"user"};
    if(current.value===normalized&&current.source===source)return {value:normalized,source};
    this.database.connection.prepare("UPDATE project_settings SET research_focus=?,research_focus_source=?,updated_at=? WHERE project_id=?").run(normalized,source,new Date().toISOString(),projectId);
    return {value:normalized,source};
  }
}
