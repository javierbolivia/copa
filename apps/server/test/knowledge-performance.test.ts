import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { KnowledgeRepository } from "../src/repositories/knowledge-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";

describe("Knowledge corpus performance",()=>{
  const databases:AppDatabase[]=[];
  afterEach(()=>{for(const db of databases.splice(0))db.close();});

  it("indexa 100 documentos / 10k chunks y mantiene búsqueda paginada usable",()=>{
    const db=new AppDatabase(":memory:");databases.push(db);
    const project=new ProjectRepository(db).create({name:"Corpus",niche:"Benchmark local"});
    const repository=new KnowledgeRepository(db);
    const library=repository.createLibrary({scope:"PROJECT",projectId:project.id,name:"Corpus 10k"});
    const started=performance.now();
    for(let documentIndex=0;documentIndex<100;documentIndex++){
      const document=repository.createDocument({libraryId:library.id,title:`Documento ${documentIndex}`,documentType:"manual"});
      repository.replaceChunks(document.id,Array.from({length:100},(_,chunkIndex)=>({content:`Principio verificable de marketing responsable documento ${documentIndex} fragmento ${chunkIndex}. La propuesta conserva evidencia local y claridad estratégica.`,heading:`Sección ${Math.floor(chunkIndex/10)+1}`})));
    }
    const indexingMs=performance.now()-started;
    const searchStarted=performance.now();
    const first=repository.search({projectId:project.id,query:'"marketing" "responsable"',limit:20,offset:0});
    const second=repository.search({projectId:project.id,query:'"marketing" "responsable"',limit:20,offset:20});
    const searchMs=performance.now()-searchStarted;
    expect((db.connection.prepare("SELECT COUNT(*) total FROM knowledge_chunks").get() as {total:number}).total).toBe(10_000);
    expect(first).toHaveLength(20);expect(second).toHaveLength(20);
    expect(new Set([...first,...second].map(item=>item.chunkId)).size).toBe(40);
    expect(indexingMs).toBeLessThan(10_000);
    expect(searchMs).toBeLessThan(2_000);
  },20_000);
});
