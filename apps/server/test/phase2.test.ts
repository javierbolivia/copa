import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { ProjectSettingsRepository } from "../src/repositories/project-settings-repository.js";
import { WorkflowRepository } from "../src/repositories/workflow-repository.js";
import { BackupService } from "../src/services/backup-service.js";

const dirs:string[]=[];
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
const diskDb=()=>{const d=mkdtempSync(join(tmpdir(),"our-platform-f2-"));dirs.push(d);return join(d,"app.db");};

describe("Fase 2",()=>{
  it("migra una base Fase 1, conserva proyectos y crea settings/workflow",()=>{
    const path=diskDb(), old=new DatabaseSync(path);const now=new Date().toISOString();
    old.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,applied_at TEXT NOT NULL) STRICT;
      INSERT INTO schema_migrations VALUES(1,'001_initial','${now}');
      CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,niche TEXT NOT NULL,description TEXT,status TEXT NOT NULL DEFAULT 'active',language TEXT NOT NULL DEFAULT 'es',region TEXT,currency TEXT NOT NULL DEFAULT 'USD',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,archived_at TEXT) STRICT;
      INSERT INTO projects VALUES('01912345-6789-7abc-8def-0123456789ab','Legado','Nicho',NULL,'active','es',NULL,'USD','${now}','${now}',NULL);`);old.close();
    const db=new AppDatabase(path);expect(db.getSchemaVersion()).toBe(11);expect(db.connection.prepare("SELECT name FROM projects").get()).toMatchObject({name:"Legado"});
    expect(db.connection.prepare("SELECT count(*) count FROM workflow_steps").get()).toMatchObject({count:14});expect(db.connection.prepare("SELECT count(*) count FROM project_settings").get()).toMatchObject({count:1});db.close();
  });

  it("persiste settings y estados de workflow después de reabrir",()=>{
    const path=diskDb();let db=new AppDatabase(path);const project=new ProjectRepository(db).create({name:"P",niche:"N"});
    const settings=new ProjectSettingsRepository(db);settings.update(project.id,{language:"es",targetMarket:"Bolivia",currency:"BOB",generalNotes:"Notas",preferredLlmProvider:"future",economyModel:"eco",powerfulModel:"power",maxBudget:25,contentLanguage:"es"});
    new WorkflowRepository(db).update(project.id,"research","COMPLETED");new WorkflowRepository(db).update(project.id,"sources","READY");db.close();
    db=new AppDatabase(path);expect(new ProjectSettingsRepository(db).get(project.id)).toMatchObject({targetMarket:"Bolivia",currency:"BOB",maxBudget:25});expect(new WorkflowRepository(db).list(project.id).slice(0,2).map(s=>s.state)).toEqual(["COMPLETED","READY"]);db.close();
  });

  it("archiva, restaura y elimina definitivamente sólo cuando está archivado",()=>{
    const db=new AppDatabase(":memory:"), repo=new ProjectRepository(db);const p=repo.create({name:"Borrar",niche:"N"});expect(repo.deletePermanently(p.id)).toBe(false);expect(repo.archive(p.id)?.status).toBe("archived");expect(repo.restore(p.id)?.status).toBe("active");expect(repo.deletePermanently(p.id)).toBe(false);expect(repo.archive(p.id)?.status).toBe("archived");expect(repo.deletePermanently(p.id)).toBe(true);expect(repo.get(p.id)).toBeUndefined();db.close();
  });

  it("acepta múltiples padres y propaga stale a varios niveles sin borrar versiones",()=>{
    const db=new AppDatabase(":memory:"), projects=new ProjectRepository(db), artifacts=new ArtifactRepository(db);const p=projects.create({name:"Lineage",niche:"N"});
    const product1=artifacts.createVersion({projectId:p.id,artifactType:"product",name:"Producto",inputSnapshot:{},outputData:{name:"v1"}});
    const avatar1=artifacts.createVersion({projectId:p.id,artifactType:"avatar",name:"Avatar",inputSnapshot:{},outputData:{},parentVersionIds:[product1.id]});
    const offer1=artifacts.createVersion({projectId:p.id,artifactType:"offer",name:"Oferta",inputSnapshot:{},outputData:{},parentVersionIds:[product1.id,avatar1.id]});
    const landing1=artifacts.createVersion({projectId:p.id,artifactType:"landing",name:"Landing",inputSnapshot:{},outputData:{},parentVersionIds:[offer1.id]});
    const product2=artifacts.createVersion({projectId:p.id,artifactType:"product",name:"Producto",artifactId:product1.artifactId,inputSnapshot:{},outputData:{name:"v2"}});
    expect(product2.versionNumber).toBe(2);for(const id of [avatar1.id,offer1.id,landing1.id])expect(artifacts.getVersion(id)?.freshness).toBe("stale");expect(artifacts.list(p.id)).toHaveLength(5);
    expect(new WorkflowRepository(db).list(p.id).find(s=>s.stepKey==="offer")?.state).toBe("STALE");
    expect(db.connection.prepare("SELECT count(*) count FROM lineage_edges WHERE child_version_id=?").get(offer1.id)).toMatchObject({count:2});expect(db.connection.prepare("SELECT count(*) count FROM staleness_events").get()).toMatchObject({count:3});db.close();
  });

  it("guarda links de evidencia genéricos con unicidad",()=>{
    const db=new AppDatabase(":memory:"),p=new ProjectRepository(db).create({name:"E",niche:"N"});const stmt=db.connection.prepare("INSERT INTO evidence_links(id,project_id,target_type,target_id,source_type,source_id,relation,created_at) VALUES(?,?,?,?,?,?,?,?)");stmt.run("01911111-1111-7111-8111-111111111111",p.id,"problem","problem-1","comment","14","supports",new Date().toISOString());expect(db.connection.prepare("SELECT source_id FROM evidence_links WHERE target_id='problem-1'").get()).toMatchObject({source_id:"14"});db.close();
  });

  it("rechaza artifacts y lineage cruzados entre proyectos",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),artifacts=new ArtifactRepository(db);const a=projects.create({name:"A",niche:"N"}),b=projects.create({name:"B",niche:"N"});const parent=artifacts.createVersion({projectId:a.id,artifactType:"product",name:"P",inputSnapshot:{},outputData:{}});
    expect(()=>artifacts.createVersion({projectId:b.id,artifactType:"product",name:"P",artifactId:parent.artifactId,inputSnapshot:{},outputData:{}})).toThrow(/no pertenece/);
    expect(()=>artifacts.createVersion({projectId:b.id,artifactType:"offer",name:"O",inputSnapshot:{},outputData:{},parentVersionIds:[parent.id]})).toThrow(/padre no pertenece/);const foreign=artifacts.createVersion({projectId:b.id,artifactType:"product",name:"P",inputSnapshot:{},outputData:{}});expect(()=>db.connection.prepare("UPDATE artifacts SET active_version_id=? WHERE id=?").run(foreign.id,parent.artifactId)).toThrow(/active_version_mismatch/);db.close();
  });

  it("crea backup, restaura y genera safety backup",async()=>{
    const path=diskDb(),db=new AppDatabase(path),repo=new ProjectRepository(db),service=new BackupService(db);repo.create({name:"Antes",niche:"N"});const backup=await service.create();repo.create({name:"Después",niche:"N"});expect(repo.list()).toHaveLength(2);const result=await service.restore(backup.filename);expect(result.safetyBackup.filename).toMatch(/^pre-restore-/);expect(new ProjectRepository(db).list().map(p=>p.name)).toEqual(["Antes"]);db.close();
  });
});
