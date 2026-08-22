import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { KnowledgeRepository } from "../src/repositories/knowledge-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { BackupService } from "../src/services/backup-service.js";

describe("Knowledge backup and restore",()=>{
  const directories:string[]=[];
  afterEach(()=>directories.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true})));
  it("restaura DB, chunks y originales con checksum",async()=>{
    const root=mkdtempSync(join(tmpdir(),"knowledge-backup-"));directories.push(root);
    const db=new AppDatabase(join(root,"platform.sqlite")),repository=new KnowledgeRepository(db);
    const project=new ProjectRepository(db).create({name:"Backup KB",niche:"Prueba"});
    const library=repository.createLibrary({scope:"PROJECT",projectId:project.id,name:"Privada"});
    const content=Buffer.from("Contenido local que debe sobrevivir al restore.","utf8"),hash=createHash("sha256").update(content).digest("hex");
    const relative=`knowledge/${library.id}/${hash}.txt`,absolute=join(root,relative);mkdirSync(join(root,"knowledge",library.id),{recursive:true});writeFileSync(absolute,content);
    const document=repository.createDocument({libraryId:library.id,title:"Original",documentType:"txt",storedRelativePath:relative,fileSha256:hash,bytes:content.length});repository.replaceChunks(document.id,[{content:content.toString("utf8")}]);
    const backups=new BackupService(db),created=await backups.create();
    repository.deleteDocument(document.id);rmSync(absolute,{force:true});expect(existsSync(absolute)).toBe(false);
    await backups.restore(created.filename);
    const restored=new KnowledgeRepository(db).getDocument(document.id);
    expect(restored).toMatchObject({title:"Original",status:"READY",chunkCount:1});expect(existsSync(absolute)).toBe(true);
    db.close();
  });
  it("el borrado permanente del proyecto elimina originales privados",()=>{
    const root=mkdtempSync(join(tmpdir(),"knowledge-delete-"));directories.push(root);
    const db=new AppDatabase(join(root,"platform.sqlite")),repository=new KnowledgeRepository(db),projects=new ProjectRepository(db);
    const project=projects.create({name:"Eliminar KB",niche:"Prueba"}),library=repository.createLibrary({scope:"PROJECT",projectId:project.id,name:"Privada"});
    const content=Buffer.from("privado"),hash=createHash("sha256").update(content).digest("hex"),relative=`knowledge/${library.id}/${hash}.txt`,absolute=join(root,relative);mkdirSync(join(root,"knowledge",library.id),{recursive:true});writeFileSync(absolute,content);
    repository.createDocument({libraryId:library.id,title:"Privado",documentType:"txt",storedRelativePath:relative,fileSha256:hash,bytes:content.length});
    projects.archive(project.id);expect(projects.deletePermanently(project.id)).toBe(true);expect(existsSync(absolute)).toBe(false);db.close();
  });
});
