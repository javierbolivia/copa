import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Project delete UI wiring", () => {
  const projectsView = readFileSync(
    resolve(import.meta.dirname, "../../web/src/features/projects/ProjectsView.tsx"),
    "utf8",
  );
  const app = readFileSync(resolve(import.meta.dirname, "../../web/src/App.tsx"), "utf8");
  const client = readFileSync(resolve(import.meta.dirname, "../../web/src/api/client.ts"), "utf8");

  it("mantiene Archivar para activos y Eliminar para archivados", () => {
    expect(projectsView).toContain('project.status==="active"');
    expect(projectsView).toContain("onArchive(project)");
    expect(projectsView).toContain("openDeleteDialog(project)");
    expect(projectsView).toContain("Restaurar");
  });

  it("confirma sin escribir el nombre y permite cancelar sin borrar", () => {
    expect(projectsView).not.toContain("deleteConfirmation");
    expect(projectsView).not.toContain("Escribe exactamente");
    expect(projectsView).toContain("¿Eliminar definitivamente");
    expect(projectsView).toContain("onClick={closeDeleteDialog}>Cancelar");
  });

  it("bloquea doble submit, conserva errores y sólo cierra tras éxito", () => {
    expect(projectsView).toContain("if(!deleteCandidate||deleteInFlight.current)return");
    expect(projectsView).toContain("disabled={deletingProjectId!==null}");
    expect(projectsView).toContain('deletingProjectId!==null?"Eliminando…"');
    expect(projectsView).toContain("catch(reason){setDeleteError(messageOf(reason));}");
    expect(projectsView).toContain("await onDelete(deleteCandidate);setDeleteCandidate(null)");
  });

  it("envía el ID real y refresca la lista tras eliminar", () => {
    expect(client).toContain("deleteProject: (id: string)");
    expect(client).toContain("`/api/projects/${id}/permanent`");
    expect(client).not.toContain("json(\"DELETE\", { confirmProjectName })");
    expect(app).toContain("await api.deleteProject(project.id)");
    expect(app).toContain("if(selected?.id===project.id)setSelected(null);await loadProjects()");
  });
});
