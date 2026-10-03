import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";
describe("Landing review contract",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  async function setup(){app=await createApp({databasePath:":memory:",serveFrontend:false});const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();const base=`/api/projects/${project.id}/modules/landing`;return {base,result:(await app.inject({method:"GET",url:base})).json().results[0],projectId:project.id};}
  it("rejects an empty document and incomplete FAQ",async()=>{const {base,result}=await setup();for(const sections of [[],[{type:"faq",items:[{q:"Pregunta",a:""}]}]])expect((await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...result.outputData,sections}}})).statusCode).toBe(409);});
  it("keeps generated landing copy in review and blocks dependent Funnel generation",async()=>{const {base,projectId}=await setup();const generated=(await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).json();expect(generated).toMatchObject({status:"draft",outputData:{landingValidationAudit:{ok:true}}});const blocked=await app.inject({method:"POST",url:`/api/projects/${projectId}/modules/funnel/run`,payload:{provider:"mock"}});expect(blocked.statusCode).toBe(409);expect(blocked.json()).toMatchObject({error:"module_blocked",message:expect.stringContaining("Landing tiene un borrador vigente pendiente de aprobación")});});
  it("does not approve a draft based on a superseded landing",async()=>{const {base,result}=await setup();const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json();const generated=(await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).json();expect(generated.status).toBe("draft");expect((await app.inject({method:"POST",url:`${base}/versions/${generated.versionId}/approve`})).statusCode).toBe(200);expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);});
  it("generates all 15 canonical blocks in contextual landing output and exports HTML and React",async()=>{
    const {base,result,projectId}=await setup();
    const runRes=await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock",instructions:"Crea una landing de alta conversión"}});
    expect(runRes.statusCode).toBe(200);
    const newVersion=runRes.json();
    expect(newVersion.status).toBe("draft");
    const types=newVersion.outputData.sections.map((s:any)=>s.type);
    const canonical=[
      "hero","problem","agitation","mechanism","benefits",
      "product","deliverables","bonuses","proof","objections",
      "faq","offer","guarantee","cta","footer"
    ];
    for(const block of canonical){
      expect(types).toContain(block);
    }
    expect((await app.inject({method:"POST",url:`${base}/versions/${newVersion.versionId}/approve`})).statusCode).toBe(200);

    // Verify files are created only after the draft is explicitly approved.
    const filesRes=await app.inject({method:"GET",url:`/api/projects/${projectId}/files`});
    expect(filesRes.statusCode).toBe(200);
    const files=filesRes.json().files;
    const landingHtml=files.find((f:any)=>f.fileRole==="landing");
    const landingReact=files.find((f:any)=>f.fileRole==="landing_react");
    expect(landingHtml).toBeDefined();
    expect(landingReact).toBeDefined();
    expect(landingHtml.format).toBe("html");
    expect(landingReact.format).toBe("tsx");

    // Also verify draft editing and approval lifecycle with theme update
    const draftRes=await app.inject({
      method:"POST",
      url:`${base}/drafts`,
      payload:{
        outputData:{
          ...newVersion.outputData,
          designTokens:{theme:"editorial"},
          title:"Landing Editada en Borrador"
        },
        expectedBaseVersionId:newVersion.versionId
      }
    });
    expect(draftRes.statusCode).toBe(201);
    const draft=draftRes.json();
    expect(draft.status).toBe("draft");

    const approveRes=await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`});
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().status).toBe("approved");
  });
});
