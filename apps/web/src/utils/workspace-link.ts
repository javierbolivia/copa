import type { NavigationKey } from "../config/modules";

const navigationKeys: readonly NavigationKey[] = [
  "overview", "research", "sources", "problems", "opportunities", "product",
  "avatar", "mechanism", "beliefs", "offer", "landing", "funnel", "content",
  "final_product", "knowledge", "history", "settings",
];

export interface WorkspaceLink {
  projectId: string;
  section: NavigationKey;
}

export function isNavigationKey(value: string): value is NavigationKey {
  return navigationKeys.some((key) => key === value);
}

export function parseWorkspaceLink(search: string): WorkspaceLink | null {
  const params = new URLSearchParams(search);
  const projectId = params.get("projectId")?.trim();
  const section = params.get("section") ?? "overview";
  return projectId && isNavigationKey(section) ? { projectId, section } : null;
}

export function workspaceLinkUrl(href: string, projectId: string | null, section: NavigationKey): string {
  const url = new URL(href);
  if (projectId) {
    url.searchParams.set("projectId", projectId);
    url.searchParams.set("section", section);
  } else {
    url.searchParams.delete("projectId");
    url.searchParams.delete("section");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
