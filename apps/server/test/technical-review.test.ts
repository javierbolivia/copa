import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,it,expect} from "vitest";
import {TechnicalReviewService} from "../src/services/technical-review-service.js";
describe("persistent section technical reviews",()=>{
  let root:string;
  afterEach(()=>{if(root)rmSync(root,{recursive:true,force:true});});
  it("persists across service instances and changes only affected section contents",()=>{
    root=mkdtempSync(join(tmpdir(),"hallazia-review-test-"));
    writeFileSync(join(root,"a.ts"),"original");writeFileSync(join(root,"b.ts"),"unchanged");
    const path=join(root,"reviews.json"),files={avatar:["a.ts"],mechanism:["b.ts"]};
    const first=new TechnicalReviewService(path,root,files).read();
    expect(Number.isFinite(Date.parse(first.sections.avatar!.codeUpdatedAt))).toBe(true);
    expect(first.sections.avatar).not.toHaveProperty("reviewedAt");
    const saved=readFileSync(path,"utf8");
    expect(new TechnicalReviewService(path,root,files).read()).toEqual(first);
    expect(readFileSync(path,"utf8")).toBe(saved);
    writeFileSync(join(root,"a.ts"),"changed");
    const nextTime=new Date(Date.parse(first.sections.avatar!.codeUpdatedAt)+1000);
    const second=new TechnicalReviewService(path,root,files,()=>nextTime).read();
    expect(second.sections.avatar!.codeUpdatedAt).toBe(nextTime.toISOString());
    expect(second.sections.mechanism).toEqual(first.sections.mechanism);
  });
  it("does not replace a corrupt persisted review with a fabricated new date",()=>{
    root=mkdtempSync(join(tmpdir(),"hallazia-review-test-"));const path=join(root,"reviews.json");writeFileSync(path,"broken");
    expect(()=>new TechnicalReviewService(path,root,{}).read()).toThrow();expect(readFileSync(path,"utf8")).toBe("broken");
  });
});
