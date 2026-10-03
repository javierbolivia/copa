import {describe,expect,it} from "vitest";
import {isNavigationKey,parseWorkspaceLink,workspaceLinkUrl} from "../../web/src/utils/workspace-link.ts";

describe("workspace deep links",()=>{
  it("opens a specific project section and defaults a project-only link to overview",()=>{
    expect(parseWorkspaceLink("?projectId=project-123&section=final_product&refresh=20261003")).toEqual({projectId:"project-123",section:"final_product"});
    expect(parseWorkspaceLink("?projectId=project-123")).toEqual({projectId:"project-123",section:"overview"});
  });

  it("rejects an unknown section instead of interpreting it as a route",()=>{
    expect(parseWorkspaceLink("?projectId=project-123&section=delete-project")).toBeNull();
    expect(isNavigationKey("delete-project")).toBe(false);
  });

  it("keeps unrelated URL parameters and hash when syncing workspace navigation",()=>{
    expect(workspaceLinkUrl("http://localhost:4310/?refresh=20261003#top","project-123","final_product"))
      .toBe("/?refresh=20261003&projectId=project-123&section=final_product#top");
    expect(workspaceLinkUrl("http://localhost:4310/?refresh=20261003&projectId=project-123&section=final_product#top",null,"overview"))
      .toBe("/?refresh=20261003#top");
  });
});
