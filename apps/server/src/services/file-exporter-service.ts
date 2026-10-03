import {renderLandingHtml, renderLandingReactCode, renderFunnelMarkdown} from "@our-platform/shared";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { v7 as uuidv7 } from "uuid";
import type { AppDatabase } from "../database/database.js";

const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const markdownText=(value:unknown)=>String(value??"").replace(/[\r\n]+/gu," ").replace(/[\\`*_{}\[\]()#+.!|>]/gu,"\\$&");
const httpsUrl=(value:unknown)=>{try{const url=new URL(String(value??""));return url.protocol==="https:"?url.href:"";}catch{return "";}};
export class FileExporterService{
 constructor(private readonly database:AppDatabase,private readonly dataRoot:string){}
 exportLanding(projectId:string,versionId:string,output:any):string[]{
  const html=renderLandingHtml(output);
  const react=renderLandingReactCode(output);
  return [
    this.write(projectId,versionId,"landing","landing.html",html),
    this.write(projectId,versionId,"landing_react","landing.tsx",react),
  ];
 }
 exportFunnel(projectId:string,versionId:string,output:any):string[]{
  const md=renderFunnelMarkdown(output);
  return [
    this.write(projectId,versionId,"funnel","funnel.md",md),
  ];
 }
 exportFinalProduct(projectId:string,versionId:string,output:any):string[]{
  const chapters=Array.isArray(output.guide?.chapters)?output.guide.chapters:[];
  const references=Array.isArray(output.guide?.references)?output.guide.references:[];
  const referenceSection=references.length?`\n\n## Referencias\n\n${references.map((reference:any)=>`- ${markdownText(reference?.id)}. ${markdownText(reference?.organization)}. ${markdownText(reference?.title)}. ${httpsUrl(reference?.url)}`).join("\n")}`:"";
  const guide=`# ${output.guide?.title??"Producto final"}\n\n${output.guide?.introduction??""}\n\n${chapters.map((chapter:any,i:number)=>`## ${i+1}. ${chapter?.title??chapter}\n\n${chapter?.content??""}`).join("\n\n")}\n\n${output.guide?.conclusion??""}${referenceSection}`;
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
 private write(projectId:string,versionId:string,role:string,filename:string,content:string):string{const dir=resolve(this.dataRoot,"generated",projectId,`v-${versionId}`);mkdirSync(dir,{recursive:true});const path=resolve(dir,filename);if(!path.startsWith(resolve(this.dataRoot,"generated")))throw new Error("Ruta de exportación inválida.");writeFileSync(path,content,"utf8");const bytes=Buffer.byteLength(content);const checksum=createHash("sha256").update(content).digest("hex");const id=uuidv7();const format=filename.includes(".")?filename.slice(filename.lastIndexOf(".")+1):"file",relativePath=relative(this.dataRoot,path).replaceAll("\\","/");const saved=this.database.connection.prepare(`INSERT INTO generated_files(id,project_id,artifact_version_id,file_role,format,relative_path,checksum,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,relative_path) DO UPDATE SET artifact_version_id=excluded.artifact_version_id,file_role=excluded.file_role,format=excluded.format,checksum=excluded.checksum,bytes=excluded.bytes,created_at=excluded.created_at RETURNING id`).get(id,projectId,versionId,role,format,relativePath,checksum,bytes,new Date().toISOString()) as {id:string};return saved.id;}
}
