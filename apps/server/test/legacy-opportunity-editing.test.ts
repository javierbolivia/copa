import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import type {FastifyInstance} from 'fastify';
import {createApp} from '../src/app.js';
import {AppDatabase} from '../src/database/database.js';
import {ArtifactRepository} from '../src/repositories/artifact-repository.js';

let app:FastifyInstance|undefined, directory:string|undefined, db:AppDatabase|undefined;
afterEach(async()=>{db?.close();db=undefined;await app?.close();if(directory)rmSync(directory,{recursive:true,force:true});});
it('legacy read is immutable; missing scores require regeneration, complete scores normalize only the new draft',async()=>{
  directory=mkdtempSync(join(tmpdir(),'hallazia-legacy-edit-'));
  const databasePath=join(directory,'isolated.db');
  app=await createApp({databasePath,serveFrontend:false});
  const project=(await app.inject({method:'POST',url:'/api/projects',payload:{name:'Legacy',niche:'Test'}})).json<{id:string}>();
  db=new AppDatabase(databasePath);const repo=new ArtifactRepository(db);
  const parent=repo.createVersion({projectId:project.id,artifactType:'problems',name:'Problems',inputSnapshot:{},outputData:{schemaVersion:1,items:[{id:'problem-1',evidenceIds:[]}]}});
  const legacy={schemaVersion:1,items:[{id:'opp-1',name:'Historical',problemId:'problem-1',evidenceIds:[]}],selectedId:'opp-1'};
  const historical=repo.createVersion({projectId:project.id,artifactType:'opportunities',name:'Opportunities',inputSnapshot:{},outputData:legacy,parentVersionIds:[parent.id]});
  const before=db.connection.prepare('SELECT output_data FROM artifact_versions WHERE id=?').get(historical.id);
  const url=`/api/projects/${project.id}/modules/opportunities`;
  expect((await app.inject({method:'GET',url})).json().results[0].outputData).toEqual(legacy);
  const rejected=await app.inject({method:'POST',url:url+'/drafts',payload:{outputData:legacy}});
  expect(rejected.statusCode).toBe(409);
  expect(rejected.json().message).toMatch(/regenera/i);
  expect(rejected.json().message).toMatch(/scores/i);
  expect((await app.inject({method:'GET',url})).json().results).toHaveLength(1);
  const scores={frequency:80,urgency:70,emotionalIntensity:60,willingnessToPay:50,solutionFeasibility:90,competition:40,differentiation:55,commercialPotential:65,evidenceConfidence:75};
  const modern={...legacy,items:[{...legacy.items[0],scores,total:999,scoreFormula:{version:'forged'}}]};
  const withoutDerived={...legacy,items:[{...legacy.items[0],scores}]};
  const normalized=await app.inject({method:'POST',url:url+'/drafts',payload:{outputData:withoutDerived}});
  expect(normalized.statusCode).toBe(201);
  expect(normalized.json().outputData.items[0]).toMatchObject({total:68,scoreFormula:{version:'1.0'}});
  for(const outputData of [
    {...modern,selectedId:'missing'},
    {...modern,items:[{...modern.items[0],problemId:'other-parent'}]},
    {...modern,items:[{...modern.items[0],evidenceIds:['unrelated']}]},
    {...modern,items:[{...modern.items[0],scores:{...scores,frequency:101}}]},
  ])expect((await app.inject({method:'POST',url:url+'/drafts',payload:{outputData}})).statusCode).toBe(409);
  const saved=await app.inject({method:'POST',url:url+'/drafts',payload:{outputData:modern}});
  expect(saved.statusCode).toBe(201);
  expect(saved.json().outputData.items[0]).toMatchObject({total:68,scoreFormula:{version:'1.0'}});
  const approved=await app.inject({method:'POST',url:url+`/versions/${saved.json().versionId}/approve`});
  expect(approved.statusCode).toBe(200);
  expect(db.connection.prepare('SELECT output_data FROM artifact_versions WHERE id=?').get(historical.id)).toEqual(before);
  expect((await app.inject({method:'GET',url})).json().results.find((v:{versionId:string})=>v.versionId===historical.id).outputData).toEqual(legacy);
});
