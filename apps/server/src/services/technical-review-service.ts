import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,renameSync,writeFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const sharedUi=["apps/web/src/styles.css","apps/web/src/components/TechnicalReviewStamp.tsx","apps/web/src/components/AppShell.tsx","apps/web/src/features/modules/ModuleReviewSummary.tsx"];
const moduleUi=["apps/web/src/features/modules/ModuleView.tsx","apps/server/src/services/module-service.ts","apps/server/src/services/module-output-schema.ts","apps/server/src/routes/modules.ts"];
const editorUi=[...moduleUi,"apps/web/src/features/refinement/RefinedModuleOutput.tsx","apps/web/src/features/refinement/EditorScaffold.tsx","apps/web/src/features/refinement/refinement.css","apps/web/src/features/refinement/types.ts"];
// Only sections whose technical review is complete. This never changes artifact dates.
export const REVIEW_FILES={
  overview:[...sharedUi,"apps/web/src/features/overview/OverviewView.tsx"],
  research:[...sharedUi,...moduleUi,"prompts/research.md","apps/server/src/services/research-output-validator.ts"],
  sources:[...sharedUi,...moduleUi,"apps/web/src/features/modules/source-import-selection.ts","apps/server/src/services/youtube-import-service.ts","apps/server/src/repositories/source-repository.ts"],
  problems:[...sharedUi,...moduleUi,"prompts/problem-analyzer.md"],
  opportunities:[...sharedUi,...moduleUi,"apps/web/src/features/modules/OpportunityWorkspace.tsx","prompts/opportunity-scorer.md"],
  product:[...sharedUi,...editorUi,"apps/web/src/features/refinement/ProductWorkspace.tsx","apps/web/src/features/refinement/ProductEditor.tsx","apps/web/src/features/refinement/product-adapter.ts"],
  avatar:[...sharedUi,...moduleUi,...editorUi,"apps/web/src/features/refinement/AvatarEditor.tsx","apps/web/src/features/refinement/avatar-adapter.ts","apps/server/src/services/avatar-output-validator.ts","packages/shared/src/avatar-module.ts","prompts/avatar-builder.md"],
  mechanism:[...sharedUi,...moduleUi,...editorUi,"apps/web/src/features/refinement/MechanismEditor.tsx","apps/web/src/features/refinement/mechanism-adapter.ts","apps/server/src/services/mechanism-output-validator.ts","prompts/mechanism-builder.md"],
} as const;
type ReviewEntry={reviewedAt:string;fingerprint:string};
type ReviewStore={schemaVersion:1;sections:Record<string,ReviewEntry>};
export class TechnicalReviewService {
  constructor(private readonly filename:string,private readonly repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../../../.."),private readonly files:Readonly<Record<string,readonly string[]>>=REVIEW_FILES,private readonly now=()=>new Date()){}
  read(){
    const store:ReviewStore=existsSync(this.filename)?JSON.parse(readFileSync(this.filename,"utf8")) as ReviewStore:{schemaVersion:1,sections:{}};
    if(store.schemaVersion!==1||!store.sections||typeof store.sections!=="object")throw new Error("Registro de revisión técnica no válido; se conserva para recuperación.");
    let changed=false;
    for(const [section,paths] of Object.entries(this.files)){
      // A build/source tree without these files must retain its saved review, never invent one.
      if(paths.some(path=>!existsSync(resolve(this.repoRoot,path))))continue;
      const hash=createHash("sha256");
      for(const path of paths){hash.update(path);hash.update(readFileSync(resolve(this.repoRoot,path)));}
      const fingerprint=hash.digest("hex");
      if(store.sections[section]?.fingerprint!==fingerprint){store.sections[section]={reviewedAt:this.now().toISOString(),fingerprint};changed=true;}
    }
    if(changed){mkdirSync(dirname(this.filename),{recursive:true});const temporary=`${this.filename}.tmp`;writeFileSync(temporary,JSON.stringify(store,null,2)+"\n","utf8");renameSync(temporary,this.filename);}
    return {sections:Object.fromEntries(Object.entries(store.sections).filter(([key])=>key in this.files).map(([key,value])=>[key,{reviewedAt:value.reviewedAt}]))};
  }
}
