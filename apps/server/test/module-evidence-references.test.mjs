import {describe,expect,it} from "vitest";
import {collectEvidenceIds} from "../../web/src/features/modules/ModuleView.tsx";
const evidence="01900000-0000-7000-8000-000000000001",comment="01900000-0000-7000-8000-000000000002",problem="01900000-0000-7000-8000-000000000003",rejected="01900000-0000-7000-8000-000000000004";
describe("semantic evidence references",()=>{
  it("does not request arbitrary UUIDs, rejected audit candidates or comment IDs as evidence",()=>{
    expect(collectEvidenceIds({items:[{id:problem,evidenceIds:[evidence],evidence:[{evidenceId:evidence,commentId:comment}]}],analysisAudit:{postMergeClusters:[{evidenceIds:[rejected]}]}})).toEqual([evidence]);
  });
  it("accepts valid v4 references, deduplicates, and ignores malformed IDs",()=>{
    const v4="12345678-1234-4321-8123-123456789abc";
    expect(collectEvidenceIds({evidenceIds:[v4,v4,"not-an-id"],nested:{evidenceId:evidence}})).toEqual([v4,evidence]);
  });
});
