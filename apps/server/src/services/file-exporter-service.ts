import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { v7 as uuidv7 } from "uuid";
import type { AppDatabase } from "../database/database.js";

const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export class FileExporterService{
 constructor(private readonly database:AppDatabase,private readonly dataRoot:string){}
 exportLanding(projectId:string,versionId:string,output:any):string{
  const sections=(output.sections??[]).map((s:any)=>`<section class="${escapeHtml(s.type)}"><h2>${escapeHtml(s.headline??"")}</h2>${s.subheadline?`<p class="lead">${escapeHtml(s.subheadline)}</p>`:""}${s.body?`<p>${escapeHtml(s.body)}</p>`:""}${Array.isArray(s.items)?`<ul>${s.items.map((i:any)=>typeof i==="string"?`<li>${escapeHtml(i)}</li>`:`<li><strong>${escapeHtml(i.q)}</strong><br>${escapeHtml(i.a)}</li>`).join("")}</ul>`:""}${s.cta?`<a href="#offer" class="cta">${escapeHtml(s.cta)}</a>`:""}</section>`).join("");
  const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(output.title)}</title><style>body{margin:0;font:16px system-ui;color:#17221e;background:#f7f9f5}main{max-width:900px;margin:auto}section{padding:64px 28px;border-bottom:1px solid #dfe6dc}h1,h2{line-height:1.1}h2{font-size:clamp(2rem,5vw,4rem)}.hero{background:#14231c;color:white}.lead{font-size:1.25rem}.cta{display:inline-block;padding:14px 20px;border-radius:9px;background:#b7ee68;color:#17221e;text-decoration:none;font-weight:700}li{margin:10px 0}@media(max-width:600px){section{padding:40px 20px}}</style></head><body><main>${sections}</main></body></html>`;
  return this.write(projectId,versionId,"landing","landing.html",html);
 }
 exportFinalProduct(projectId:string,versionId:string,output:any):string[]{
  const guide=`# ${output.guide?.title??"Producto final"}\n\n${(output.guide?.chapters??[]).map((c:string,i:number)=>`## ${i+1}. ${c}\n\nContenido de trabajo para completar y editar.`).join("\n\n")}`;
  const checklist=`# Checklist\n\n${(output.checklist??[]).map((x:string)=>`- [ ] ${x}`).join("\n")}`;
  const workbook=`# Workbook\n\n${(output.workbook??[]).map((x:string)=>`## ${x}\n\nNotas: ______________________________`).join("\n\n")}`;
  const tool=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(output.miniTool?.title)}</title><style>body{font:16px system-ui;max-width:700px;margin:40px auto;padding:20px}label{display:block;margin:18px 0}input{display:block;width:100%;padding:10px}</style><h1>${escapeHtml(output.miniTool?.title)}</h1>${(output.miniTool?.fields??[]).map((f:string)=>`<label>${escapeHtml(f)}<input></label>`).join("")}<button onclick="window.print()">Guardar plan</button></html>`;
  return [this.write(projectId,versionId,"guide","guide.md",guide),this.write(projectId,versionId,"checklist","checklist.md",checklist),this.write(projectId,versionId,"workbook","workbook.md",workbook),this.write(projectId,versionId,"mini_html_tool","mini-tool.html",tool)];
 }
 list(projectId:string):Array<{id:string;projectId:string;artifactVersionId:string|null;fileRole:string;format:string;relativePath:string;checksum:string;bytes:number;createdAt:string;downloadUrl:string}>{
  const rows=this.database.connection.prepare("SELECT * FROM generated_files WHERE project_id=? ORDER BY created_at DESC,file_role").all(projectId) as unknown as Array<{id:string;project_id:string;artifact_version_id:string|null;file_role:string;format:string;relative_path:string;checksum:string;bytes:number;created_at:string}>;
  return rows.map(row=>({id:row.id,projectId:row.project_id,artifactVersionId:row.artifact_version_id,fileRole:row.file_role,format:row.format,relativePath:row.relative_path,checksum:row.checksum,bytes:row.bytes,createdAt:row.created_at,downloadUrl:`/api/projects/${projectId}/files/${row.id}/download`}));
 }
 resolveDownload(projectId:string,fileId:string):{path:string;filename:string}|undefined{
  const row=this.database.connection.prepare("SELECT relative_path FROM generated_files WHERE project_id=? AND id=?").get(projectId,fileId) as {relative_path:string}|undefined;
  if(!row)return undefined;
  const root=resolve(this.dataRoot),path=resolve(root,row.relative_path);
  if(!path.startsWith(`${root}\\`)&&!path.startsWith(`${root}/`))return undefined;
  if(!existsSync(path))return undefined;
  return {path,filename:path.split(/[\\/]/).at(-1)??"download"};
 }
 cleanupVersion(projectId:string,versionId:string):void{const target=resolve(this.dataRoot,"generated",projectId,`v-${versionId}`),root=resolve(this.dataRoot,"generated");if(target.startsWith(`${root}\\`)||target.startsWith(`${root}/`))rmSync(target,{recursive:true,force:true});}
 private write(projectId:string,versionId:string,role:string,filename:string,content:string):string{const dir=resolve(this.dataRoot,"generated",projectId,`v-${versionId}`);mkdirSync(dir,{recursive:true});const path=resolve(dir,filename);if(!path.startsWith(resolve(this.dataRoot,"generated")))throw new Error("Ruta de exportación inválida.");writeFileSync(path,content,"utf8");const bytes=Buffer.byteLength(content);const checksum=createHash("sha256").update(content).digest("hex");const id=uuidv7();const format=filename.includes(".")?filename.slice(filename.lastIndexOf(".")+1):"file";this.database.connection.prepare(`INSERT INTO generated_files(id,project_id,artifact_version_id,file_role,format,relative_path,checksum,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)`).run(id,projectId,versionId,role,format,relative(this.dataRoot,path).replaceAll("\\","/"),checksum,bytes,new Date().toISOString());return id;}
}
