import {copyFileSync,cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename,join,resolve,sep} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {AppDatabase} from "../src/database/database.js";
import {ProjectRepository} from "../src/repositories/project-repository.js";
import {BackupService} from "../src/services/backup-service.js";

const fault=vi.hoisted(()=>({copyFrom:"",renameTo:""}));
vi.mock("node:fs",async(importOriginal)=>{
  const fs=await importOriginal<typeof import("node:fs")>();
  return {...fs,cpSync:(source: string,target: string,options: Parameters<typeof fs.cpSync>[2])=>{
    if(fault.copyFrom&&String(source)===fault.copyFrom)throw new Error("SIMULATED_COPY_FAILURE");
    return fs.cpSync(source,target,options);
  },renameSync:(source:string,target:string)=>{
    if(fault.renameTo&&String(target)===fault.renameTo){fault.renameTo="";throw new Error("SIMULATED_RENAME_FAILURE");}
    return fs.renameSync(source,target);
  }};
});

describe("restore preserves the whole previous state on failure",()=>{
  let root:string|undefined,db:AppDatabase|undefined;
  afterEach(()=>{fault.copyFrom="";fault.renameTo="";db?.close();db=undefined;if(root){const path=resolve(root);if(!path.startsWith(resolve(tmpdir())+sep)||!path.includes("hallazia-restore-test-"))throw new Error("Unsafe test cleanup");rmSync(path,{recursive:true,force:true});root=undefined;}vi.restoreAllMocks();});
  async function fixture(){
    root=mkdtempSync(join(tmpdir(),"hallazia-restore-test-"));db=new AppDatabase(join(root,"test.sqlite"));
    const projects=new ProjectRepository(db),project=projects.create({name:"Before backup",niche:"Test"});
    for(const dir of ["generated","knowledge","assets"]){mkdirSync(join(root,dir));writeFileSync(join(root,dir,"test.txt"),"backup");}
    const service=new BackupService(db),saved=await service.create();
    db.connection.prepare("UPDATE projects SET name='Current state' WHERE id=?").run(project.id);
    for(const dir of ["generated","knowledge","assets"])writeFileSync(join(root,dir,"test.txt"),"current");
    return {service,saved,project};
  }
  function expectCurrent(){
    expect(db!.connection.prepare("SELECT name FROM projects").get()).toEqual({name:"Current state"});
    for(const dir of ["generated","knowledge","assets"])expect(readFileSync(join(root!,dir,"test.txt"),"utf8")).toBe("current");
    expect(db!.connection.prepare("PRAGMA integrity_check").get()).toEqual({integrity_check:"ok"});
    expect(db!.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  }
  it("preserves DB and every directory when preparing a sidecar fails",async()=>{
    const {service,saved}=await fixture();fault.copyFrom=join(service.directory,saved.filename)+".knowledge";
    await expect(service.restore(saved.filename)).rejects.toThrow("SIMULATED_COPY_FAILURE");expectCurrent();
  });
  it("rolls back already swapped directories if a later rename fails",async()=>{
    const {service,saved}=await fixture();fault.renameTo=join(root!,"knowledge");
    await expect(service.restore(saved.filename)).rejects.toThrow("SIMULATED_RENAME_FAILURE");expectCurrent();
  });
  it("rolls back directories when database replacement fails",async()=>{
    const {service,saved}=await fixture();vi.spyOn(db!,"restoreFrom").mockImplementation(()=>{throw new Error("SIMULATED_DB_FAILURE");});
    await expect(service.restore(saved.filename)).rejects.toThrow("SIMULATED_DB_FAILURE");expectCurrent();
  });
  it("preserves committed WAL data when installing the replacement DB fails",async()=>{
    const {service,saved}=await fixture();fault.renameTo=db!.path;
    await expect(service.restore(saved.filename)).rejects.toThrow("SIMULATED_RENAME_FAILURE");expectCurrent();
  });
  it("recovers the prior snapshot before opening after an interrupted restore",async()=>{
    const {service}=await fixture();
    const path=db!.path,snapshot=await service.create("recovery");
    const snapshotPath=join(service.directory,snapshot.filename);
    const stage=mkdtempSync(join(root!,".restore-stage-crash-"));
    const rollbackRoot=join(stage,"rollback");mkdirSync(rollbackRoot);
    copyFileSync(snapshotPath,join(rollbackRoot,"rollback.sqlite"));
    for(const [name,suffix] of [["generated",".files"],["knowledge",".knowledge"],["assets",".assets"]] as const){
      const target=join(rollbackRoot,name),source=`${snapshotPath}${suffix}`;
      if(readdirSync(service.directory).includes(`${snapshot.filename}${suffix}`))cpSync(source,target,{recursive:true});
      else mkdirSync(target);
    }
    writeFileSync(join(stage,"restore-manifest.json"),JSON.stringify({version:1,databaseFile:basename(path)}));

    db!.close();db=undefined;
    for(const suffix of ["","-wal","-shm"])rmSync(`${path}${suffix}`,{force:true});
    for(const name of ["generated","knowledge","assets"])rmSync(join(root!,name),{recursive:true,force:true});
    fault.renameTo=path;
    expect(()=>new AppDatabase(path)).toThrow("SIMULATED_RENAME_FAILURE");
    expect(existsSync(path)).toBe(false);
    fault.renameTo="";
    db=new AppDatabase(path);

    expectCurrent();
    expect(readdirSync(root!).some(name=>name.startsWith(".restore-stage-"))).toBe(false);
  });
  it("fails closed when an interrupted restore has a damaged manifest",async()=>{
    await fixture();const path=db!.path;
    const stage=mkdtempSync(join(root!,".restore-stage-damaged-"));
    writeFileSync(join(stage,"restore-manifest.json"),"{");
    db!.close();db=undefined;
    for(const suffix of ["","-wal","-shm"])rmSync(`${path}${suffix}`,{force:true});

    expect(()=>new AppDatabase(path)).toThrow("manifiesto de recuperación está dañado");
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(root!).some(name=>name===basename(stage))).toBe(true);
  });
  it("fails closed on a non-empty restore stage without a journal",async()=>{
    await fixture();const path=db!.path;
    const stage=mkdtempSync(join(root!,".restore-stage-untracked-"));
    writeFileSync(join(stage,"candidate.sqlite"),"partial stage");
    db!.close();db=undefined;
    for(const suffix of ["","-wal","-shm"])rmSync(`${path}${suffix}`,{force:true});

    expect(()=>new AppDatabase(path)).toThrow("restauración sin manifiesto");
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(root!).some(name=>name===basename(stage))).toBe(true);
  });
  it("keeps a completed restore when cleaning its journal on restart",async()=>{
    await fixture();const path=db!.path;
    const stage=mkdtempSync(join(root!,".restore-stage-committed-"));
    writeFileSync(join(stage,"restore-manifest.json"),JSON.stringify({version:1,databaseFile:basename(path)}));
    writeFileSync(join(stage,"restore-committed"),"");
    db!.close();db=undefined;
    db=new AppDatabase(path);

    expectCurrent();
    expect(readdirSync(root!).some(name=>name.startsWith(".restore-stage-"))).toBe(false);
  });
  it("restores DB and files together and retains the safety backup",async()=>{
    const {service,saved}=await fixture();const result=await service.restore(saved.filename);
    expect(db!.connection.prepare("SELECT name FROM projects").get()).toEqual({name:"Before backup"});
    for(const dir of ["generated","knowledge","assets"])expect(readFileSync(join(root!,dir,"test.txt"),"utf8")).toBe("backup");
    expect(service.list().some(item=>item.filename===result.safetyBackup.filename)).toBe(true);
    expect(readdirSync(root!).some(name=>name.startsWith(".restore-stage-"))).toBe(false);
  });
});
