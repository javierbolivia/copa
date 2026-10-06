// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../web/src/api/client.ts";
import { App } from "../../web/src/App.tsx";

afterEach(() => vi.restoreAllMocks());

describe("Project Hub initial loading state", () => {
  it("does not announce an empty project list before the first request finishes", async () => {
    let finishProjects;
    vi.spyOn(api, "projects").mockImplementation(() => new Promise(resolve => { finishProjects = resolve; }));
    vi.spyOn(api, "health").mockResolvedValue(null);
    vi.spyOn(api, "backups").mockResolvedValue({ backups: [] });

    const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(createElement(App)));

      expect(container.textContent).toContain("Cargando proyectos");
      expect(container.textContent).not.toContain("Empieza con tu primer proyecto");

      await act(async () => finishProjects({ projects: [] }));

      expect(container.textContent).not.toContain("Cargando proyectos");
      expect(container.textContent).toContain("Empieza con tu primer proyecto");
    } finally {
      if (finishProjects) await act(async () => finishProjects({ projects: [] }));
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
  });

  it("shows a retryable error instead of the first-project empty state when loading fails", async () => {
    vi.spyOn(api, "projects")
      .mockRejectedValueOnce(new Error("Conexión local interrumpida"))
      .mockResolvedValueOnce({ projects: [] });
    vi.spyOn(api, "health").mockResolvedValue(null);
    vi.spyOn(api, "backups").mockResolvedValue({ backups: [] });

    const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    try {
      await act(async () => root.render(createElement(App)));

      expect(container.textContent).toContain("No se pudieron cargar tus proyectos");
      expect(container.textContent).toContain("Conexión local interrumpida");
      expect(container.textContent).not.toContain("Empieza con tu primer proyecto");

      const retry = [...container.querySelectorAll("button")].find(button => button.textContent.includes("Reintentar"));
      await act(async () => retry.click());

      expect(api.projects).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain("Empieza con tu primer proyecto");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
  });
});
