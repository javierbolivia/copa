// Behavioral browser regressions. Uses an existing Playwright installation;
// PLAYWRIGHT_MODULE may point to its entry point. No backend or real data needed.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
let chromium;
try {
  ({ chromium } = require(playwrightModule));
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  console.error(
    `SKIP frontend-request-races: Playwright is unavailable at "${playwrightModule}". ` +
    'Set PLAYWRIGHT_MODULE to an existing local Playwright entry point; do not add a dependency solely for this optional diagnostic.'
  );
  process.exit(2);
}
const harness = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {ModuleView,ProblemQualityOutput} from '/src/features/modules/ModuleView.tsx';
import {App} from '/src/App.tsx';
import {RefinedModuleOutput} from '/src/features/refinement/RefinedModuleOutput.tsx';
import {api} from '/src/api/client.ts';
const pending=[],openedEvidenceIds=[];let changed=0,created=[];
const provider={openai:{configured:false},gemini:{configured:false},deepseek:{configured:false},defaultProvider:'mock'};
const projects=['A','B'].map(id=>({id,name:'Project '+id,niche:'Test',status:'active',workflowCompletedSteps:0,workflowTotalSteps:3,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
Object.assign(api,{marketResearchStatus:async()=>({providers:[],analyzers:{primary:{analyzer:'deepseek',model:'mock',state:'unconfigured'},fallback:{analyzer:'gemini',model:'mock',state:'unconfigured'}}}),latestMarketResearch:async()=>null,marketResearchHistory:async()=>({runs:[]}),comments:async()=>({comments:[]}),jobs:async()=>({jobs:[]}),youtubeStatus:async()=>({configured:false}),researchFocus:async()=>({value:'Current focus',source:'user'}),projects:async()=>({projects}),health:async()=>null,backups:async()=>({backups:[]}),settings:async()=>null,artifacts:async()=>({versions:[]}),providerStatus:async()=>provider,files:async()=>({files:[]}),generations:async()=>({generations:[]}),evidence:async()=>null});
for(const name of ['moduleResults','runModule','workflow','saveModuleDraft','approveModuleVersion','sources'])api[name]=(...args)=>new Promise((resolve,reject)=>pending.push({name,args,resolve,reject,done:false}));
let root=createRoot(document.getElementById('root'));
window.h={pending,created,openedEvidenceIds,defer(name){api[name]=(...args)=>new Promise((resolve,reject)=>pending.push({name,args,resolve,reject,done:false}));},get changed(){return changed},mount(kind,props={}){const module=<ModuleView projectId='A' moduleKey='research' evidenceFocus={null} onOpenEvidence={()=>{}} onChanged={()=>changed++} {...props}/>;flushSync(()=>root.render(kind==='app'?<App/>:kind==='strict'?<React.StrictMode>{module}</React.StrictMode>:kind==='problems'?<ProblemQualityOutput onOpenEvidence={id=>openedEvidenceIds.push(id)} {...props}/>:kind==='refined'?<RefinedModuleOutput projectId='A' moduleKey='product' versions={[]} files={[]} onVersionCreated={v=>created.push(v)} onSelectVersion={()=>{}} onRegenerate={async()=>{}} {...props}/>:module));},unmount(){root.unmount();root=createRoot(document.getElementById('root'));},resolve(i,value){pending[i].done=true;pending[i].resolve(value);},reject(i){pending[i].done=true;pending[i].reject(new Error('old failure'));}};
api.artifactSummaries=async()=>({versions:[]});
Object.assign(provider,{groq:{configured:false},openrouter:{configured:false},generationBlock:null});
Object.assign(api,{generationVersionMetadata:async()=>({generations:[]}),comments:async()=>({comments:[],total:0,eligibleIncluded:0}),technicalReviews:async()=>({sections:{}})});
window.h.prepareSettings=(overrides={})=>{api.settings=async projectId=>({projectId,language:'es',targetMarket:null,currency:'USD',generalNotes:null,preferredLlmProvider:'mock',economyModel:null,powerfulModel:null,maxBudget:null,contentLanguage:'es',knowledgeEnabled:true,updatedAt:'2026-01-01T00:00:00Z',...overrides});api.workflow=async projectId=>({steps:[{id:'s',projectId,stepKey:'research',label:'Research',position:1,state:'COMPLETED'}]});window.h.defer('saveSettings');};
`;
const server = await createServer({configFile:false,envFile:false,root:resolve('apps/web'),logLevel:'error',esbuild:{jsx:'automatic'},server:{host:'127.0.0.1',port:0},plugins:[{name:'race-fixture',resolveId(id){if(id==='/__race.tsx')return id;},load(id){if(id==='/__race.tsx')return harness;},configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/__race')return next();res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/__race.tsx"></script>');});}}]});
await server.listen();
const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
const result=(id,text)=>({versionId:id,artifactId:id,moduleKey:'research',versionNumber:1,status:'approved',freshness:'fresh',createdAt:'2026-01-01',outputData:{schemaVersion:1,summary:text}});
const productResult=(id)=>({...result(id,'Product'),moduleKey:'product',status:'draft',outputData:{selectedId:'proposal',proposals:[{id:'proposal',name:'Practical guide',concept:'Design',problem:'Observed problem',outcome:'Proposed outcome',promise:'Prudent promise',format:'Ebook',modules:[],deliverables:[],checklists:[],templates:[],resources:[],bonuses:[]}],productValidationAudit:{ok:true,errors:[]}}});
let failures=0;
async function test(name,body){const page=await browser.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>console.error(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});try{await page.route('**/api/**',route=>new URL(route.request().url()).pathname.startsWith('/api/')?route.abort():route.continue());await page.goto(server.resolvedUrls.local[0]+'__race');await page.waitForFunction(()=>!!window.h);await body(page);console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+': '+e.message);}finally{await page.close();}}
const mount=(p,props)=>p.evaluate(props=>window.h.mount('module',props),props);
const waitCalls=(p,n)=>p.waitForFunction(n=>window.h.pending.length>=n,n);
const settle=async(p,i,value)=>{await p.evaluate(({i,value})=>window.h.resolve(i,value),{i,value});await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
const has=async(p,text)=>assert.ok((await p.locator('body').innerText()).includes(text),'expected '+text);
const lacks=async(p,text)=>assert.ok(!(await p.locator('body').innerText()).includes(text),'unexpected '+text);
try{
await test('workflow becomes usable before slow artifact metadata without showing an empty history',async p=>{
  await p.evaluate(()=>{window.h.defer('artifactSummaries');window.h.mount('app');});
  await p.getByRole('button',{name:'Abrir workspace'}).first().click();await waitCalls(p,2);
  const workflowIndex=await p.evaluate(()=>window.h.pending.findIndex(x=>x.name==='workflow'));
  await settle(p,workflowIndex,{steps:[{id:'s',projectId:'A',stepKey:'research',label:'Research',position:1,state:'COMPLETED',updatedAt:'2026-01-01T00:00:00Z'}]});
  await has(p,'Recorrido del proyecto');await has(p,'Cargando documentos…');await lacks(p,'Aún no hay actividad registrada');
  const artifactsIndex=await p.evaluate(()=>window.h.pending.findIndex(x=>x.name==='artifactSummaries'));
  await settle(p,artifactsIndex,{versions:[]});await has(p,'Aún no hay actividad registrada');
});
for(const completion of ['success','failure'])await test('settings save '+completion+' cannot lock another project or finish its newer save',async p=>{
  await p.evaluate(()=>{window.h.prepareSettings();window.h.mount('app');});
  await p.getByRole('button',{name:'Abrir workspace'}).first().click();
  await p.locator('nav button[title="Configuración"]').click();
  await p.getByLabel('Notas generales').fill('A changes');
  await p.getByRole('button',{name:'Guardar configuración',exact:true}).click();
  await waitCalls(p,1);
  await p.getByRole('button',{name:'Mis Proyectos',exact:true}).click();
  await p.getByRole('button',{name:'Abrir workspace'}).nth(1).click();
  await p.locator('nav button[title="Configuración"]').click();
  await p.getByLabel('Notas generales').fill('B changes');
  const save=p.getByRole('button',{name:'Guardar configuración',exact:true});
  assert.equal(await save.isEnabled(),true,'A pending save must not block B');
  await save.click();await waitCalls(p,2);
  const response=async i=>p.evaluate(i=>({...window.h.pending[i].args[1],projectId:window.h.pending[i].args[0],updatedAt:'2026-01-02T00:00:00Z'}),i);
  if(completion==='success')await settle(p,0,await response(0));else {await p.evaluate(()=>window.h.reject(0));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));}
  assert.equal(await save.isEnabled(),false,'A completion must not release B save');
  assert.equal(await p.getByLabel('Notas generales').inputValue(),'B changes');
  await lacks(p,'old failure');
  await settle(p,1,await response(1));
  await p.getByLabel('Notas generales').fill('B next change');
  assert.equal(await save.isEnabled(),true,'B must be able to save again');
});
await test('settings blank text can be edited and reverted without enabling a no-op save',async p=>{
  await p.evaluate(()=>{window.h.prepareSettings({generalNotes:'',targetMarket:'',economyModel:'',powerfulModel:''});window.h.mount('app');});
  await p.getByRole('button',{name:'Abrir workspace'}).first().click();
  await p.locator('nav button[title="Configuración"]').click();
  const save=p.getByRole('button',{name:'Guardar configuración',exact:true});
  for(const label of ['Notas generales','Mercado objetivo']){
    const input=p.getByLabel(label);await input.fill('Temporary change');
    assert.equal(await save.isEnabled(),true);
    await input.fill('');
    assert.equal(await save.isEnabled(),false,'reverting '+label+' must not create a no-op save');
  }
  assert.equal(await p.evaluate(()=>window.h.pending.length),0,'visual edits must not send requests');
});
await test('settings edits made while saving survive the earlier response and remain dirty',async p=>{
  await p.evaluate(()=>{window.h.prepareSettings();window.h.mount('app');});
  await p.getByRole('button',{name:'Abrir workspace'}).first().click();
  await p.locator('nav button[title="Configuración"]').click();
  const notes=p.getByLabel('Notas generales'),save=p.getByRole('button',{name:'Guardar configuración',exact:true});
  await notes.fill('Submitted notes');await save.click();await waitCalls(p,1);
  await notes.fill('Newer unsaved notes');
  const response=await p.evaluate(()=>({...window.h.pending[0].args[1],projectId:'A',updatedAt:'2026-01-02T00:00:00Z'}));
  await settle(p,0,response);
  assert.equal(await notes.inputValue(),'Newer unsaved notes');
  assert.equal(await save.isEnabled(),true,'newer edits must remain available to save');
});
await test('compact problems retain every paginated quotation and original evidence destination',async p=>{
  const evidence=Array.from({length:12},(_,index)=>({evidenceId:`e${index+1}`,commentId:`c${index+1}`,quote:`Complete original quotation ${index+1} including its unabridged final sentence.`,author:'Original author',sourceTitle:'Original source',supportType:'DIRECT'}));
  const value={items:[{id:'p1',name:'First problem',summary:'Full interpretation',problemStrengthScore:86,strengthLevel:'STRONG_PATTERN',relevanceLevel:'TANGENTIAL',relevanceScore:52,evidenceCount:12,evidence},{id:'p2',name:'Second problem',evidenceCount:1,evidence:[evidence[0]]}]};
  await p.evaluate(value=>{window.h.problemFixture=value;window.h.mount('problems',{value});},value);
  const rows=p.locator('.problem-row');
  assert.equal(await rows.count(),2);
  assert.equal(await p.locator('.problem-row[open]').count(),0);
  assert.equal(await rows.first().getByRole('button',{name:'Ver evidencia original',exact:true}).first().isVisible(),false);
  await rows.first().locator(':scope > summary').click();
  await has(p,'Full interpretation');await has(p,'Solidez 86/100');await has(p,'Tangencial');
  await rows.first().locator('.problem-evidence-section > summary').click();
  const pageSelect=rows.first().getByRole('combobox',{name:'Página de evidencias de First problem'});
  const previous=rows.first().getByRole('button',{name:'Anterior',exact:true}),next=rows.first().getByRole('button',{name:'Siguiente',exact:true});
  assert.equal(await previous.isDisabled(),true);await has(p,'1–6 de 12');
  for(let page=0;page<2;page++){
    if(page)await next.click();
    const evidenceRows=rows.first().locator('.problem-evidence-row');
    assert.equal(await evidenceRows.count(),6);
    for(let index=0;index<6;index++){
      const row=evidenceRows.nth(index);
      await row.locator(':scope > summary').click();
      assert.equal(await row.locator('blockquote p').innerText(),`“${evidence[page*6+index].quote}”`);
      await row.getByRole('button',{name:'Ver evidencia original',exact:true}).click();
    }
  }
  await has(p,'7–12 de 12');assert.equal(await next.isDisabled(),true);
  assert.deepEqual(await p.evaluate(()=>window.h.openedEvidenceIds),evidence.map(entry=>entry.commentId));
  await previous.click();await has(p,'1–6 de 12');
  await pageSelect.selectOption('2');await has(p,'7–12 de 12');
  await rows.nth(1).locator(':scope > summary').click();
  assert.equal(await rows.first().getAttribute('open'),null,'opening a second problem must close the first');
  assert.equal(await p.locator('.problem-row[open]').count(),1);
  assert.deepEqual(await p.evaluate(()=>window.h.problemFixture),value,'presentation must not mutate evidence');
  assert.equal(await p.evaluate(()=>window.h.pending.length),0,'pagination must not make API requests');
});
await test('two same-module loads under StrictMode',async p=>{await p.evaluate(()=>window.h.mount('strict'));await waitCalls(p,2);await settle(p,1,{results:[result('b','LATEST B')]});await settle(p,0,{results:[result('a','OBSOLETE A')]});await has(p,'LATEST B');await lacks(p,'OBSOLETE A');});
await test('workflow project switch preserves B sidebar',async p=>{await p.evaluate(()=>window.h.mount('app'));await p.getByRole('button',{name:'Abrir workspace'}).first().click();await waitCalls(p,1);await p.getByRole('button',{name:'Mis Proyectos',exact:true}).click();await p.getByRole('button',{name:'Abrir workspace'}).nth(1).click();await waitCalls(p,2);const workflow=state=>({steps:[{id:'s',stepKey:'research',label:'Research',position:1,state}]});await settle(p,1,workflow('STALE'));await settle(p,0,workflow('COMPLETED'));assert.equal(await p.locator('.sidebar .nav-state.stale').count(),1);assert.equal(await p.locator('.sidebar .nav-state.completed').count(),0);});
await test('successive workflow refreshes after generation',async p=>{await p.evaluate(()=>window.h.mount('app'));await p.getByRole('button',{name:'Abrir workspace'}).first().click();await waitCalls(p,1);await p.locator('nav button[title="Investigación"]').click();await waitCalls(p,2);await settle(p,1,{results:[]});await p.getByRole('button',{name:'Generar con Demo',exact:true}).first().click();await waitCalls(p,3);await settle(p,2,result('b','GEN B'));await waitCalls(p,4);await p.getByRole('button',{name:'Regenerar con Demo',exact:true}).click();await waitCalls(p,5);await settle(p,4,result('c','GEN C'));await waitCalls(p,6);await settle(p,5,{steps:[{stepKey:'research',state:'STALE'}]});await settle(p,3,{steps:[{stepKey:'research',state:'COMPLETED'}]});await settle(p,0,{steps:[{stepKey:'research',state:'COMPLETED'}]});assert.equal(await p.locator('.sidebar .nav-state.stale').count(),1);await has(p,'GEN C');});
for(const action of ['save','approve'])await test(action+' ignores completion after version navigation',async p=>{const selected=productResult('a');await p.evaluate(selected=>window.h.mount('refined',{selected}),selected);if(action==='save')await p.getByRole('button',{name:'Editar',exact:true}).click();await p.getByRole('button',{name:action==='save'?'Guardar':'Aprobar versión',exact:action==='save'}).click();await waitCalls(p,1);await p.evaluate(selected=>window.h.mount('refined',{selected}),productResult('b'));await settle(p,0,productResult('old'));assert.equal(await p.evaluate(()=>window.h.created.length),0);});
await test('successive Sources loads retain newest data',async p=>{await p.evaluate(()=>window.h.mount('strict',{moduleKey:'sources'}));await waitCalls(p,2);const source=title=>({id:title,title,sourceType:'manual',status:'ready',includeInAnalysis:true,commentCount:0});await settle(p,1,{sources:[source('NEW SOURCE')]});await settle(p,0,{sources:[source('OLD SOURCE')]});await has(p,'NEW SOURCE');await lacks(p,'OLD SOURCE');});
await test('Focus save supersedes its pending hydration',async p=>{await p.evaluate(()=>{window.h.defer('researchFocus');window.h.defer('saveResearchFocus');});await mount(p,{moduleKey:'sources'});await p.locator('.research-focus-panel input').fill('New focus');await p.locator('.research-focus-panel button').click();const saveIndex=await p.evaluate(()=>window.h.pending.findIndex(x=>x.name==='saveResearchFocus'));await settle(p,saveIndex,{value:'New focus',source:'user'});const loadIndex=await p.evaluate(()=>window.h.pending.findIndex(x=>x.name==='researchFocus'));await settle(p,loadIndex,{value:'Old focus',source:'user'});assert.equal(await p.locator('.research-focus-panel input').inputValue(),'New focus');});
await test('module switch: B resolves before A',async p=>{await mount(p,{moduleKey:'research'});await waitCalls(p,1);await mount(p,{moduleKey:'problems'});await waitCalls(p,2);await settle(p,1,{results:[result('b','LATEST B')]});await settle(p,0,{results:[result('a','OBSOLETE A')]});await lacks(p,'OBSOLETE A');});
await test('project switch: same module',async p=>{await mount(p,{projectId:'A'});await waitCalls(p,1);await mount(p,{projectId:'B'});await waitCalls(p,2);await settle(p,1,{results:[result('b','LATEST B')]});await settle(p,0,{results:[result('a','OBSOLETE A')]});await has(p,'LATEST B');await lacks(p,'OBSOLETE A');});
await test('generation waits for initial hydration and becomes available after it finishes',async p=>{await mount(p,{});await waitCalls(p,1);const generate=p.getByRole('button',{name:'Generar con Demo',exact:true}).first();assert.equal(await generate.isEnabled(),false);await settle(p,0,{results:[]});await generate.click();await waitCalls(p,2);await settle(p,1,result('b','GENERATED B'));await has(p,'GENERATED B');});
await test('unmount/remount ignores old completion and callbacks',async p=>{await mount(p,{});await waitCalls(p,1);await settle(p,0,{results:[]});await p.getByRole('button',{name:'Generar con Demo',exact:true}).first().click();await waitCalls(p,2);await p.evaluate(()=>window.h.unmount());await mount(p,{});await waitCalls(p,3);await settle(p,2,{results:[result('b','REMOUNT B')]});await settle(p,1,result('a','OBSOLETE A'));await has(p,'REMOUNT B');assert.equal(await p.evaluate(()=>window.h.changed),0);});
await test('obsolete load failure cannot replace new success',async p=>{await mount(p,{projectId:'A'});await waitCalls(p,1);await mount(p,{projectId:'B'});await waitCalls(p,2);await settle(p,1,{results:[result('b','LATEST B')]});await p.evaluate(()=>window.h.reject(0));await lacks(p,'old failure');});
}finally{await browser.close();await server.close();}
if(failures)process.exitCode=1;
