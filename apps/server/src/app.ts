import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

import { AppDatabase } from "./database/database.js";
import { ProjectRepository } from "./repositories/project-repository.js";
import { ProjectSettingsRepository } from "./repositories/project-settings-repository.js";
import { WorkflowRepository } from "./repositories/workflow-repository.js";
import { ArtifactRepository } from "./repositories/artifact-repository.js";
import { SourceRepository } from "./repositories/source-repository.js";
import { JobRepository } from "./repositories/job-repository.js";
import { BackupService } from "./services/backup-service.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerProjectSystemRoutes } from "./routes/project-system.js";
import { registerSourceRoutes } from "./routes/sources.js";
import { YouTubeImportService } from "./services/youtube-import-service.js";
import { FileExporterService } from "./services/file-exporter-service.js";
import { ModuleService } from "./services/module-service.js";
import { registerModuleRoutes } from "./routes/modules.js";
import { registerDemoRoutes } from "./routes/demo.js";
import { registerFileRoutes } from "./routes/files.js";
import {
  OpenAIProvider,
  type OpenAIProviderOptions,
} from "./integrations/openai-provider.js";
import type { ModuleServiceOptions } from "./services/module-service.js";
import { TraceabilityService } from "./services/traceability-service.js";
import { registerTraceabilityRoutes } from "./routes/traceability.js";
import { KnowledgeRepository } from "./repositories/knowledge-repository.js";
import { KnowledgeIngestionService } from "./services/knowledge-ingestion-service.js";
import { registerKnowledgeRoutes } from "./routes/knowledge.js";
import { ProductDocumentRepository } from "./repositories/product-document-repository.js";
import { ProductStudioService } from "./services/product-studio-service.js";
import { registerProductStudioRoutes } from "./routes/product-studio.js";
import { ProductExportService } from "./services/product-export-service.js";
import { registerProductExportRoutes } from "./routes/product-exports.js";

export interface CreateAppOptions {
  readonly databasePath: string;
  readonly logger?: boolean;
  readonly serveFrontend?: boolean;
  readonly openAI?: OpenAIProviderOptions;
  readonly llm?: Omit<ModuleServiceOptions, "openAI">;
}

export async function createApp(
  options: CreateAppOptions,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 75 * 1024 * 1024,
  });
  const database = new AppDatabase(options.databasePath);
  const projects = new ProjectRepository(database);
  const settings = new ProjectSettingsRepository(database);
  const workflow = new WorkflowRepository(database);
  const artifacts = new ArtifactRepository(database);
  const sources = new SourceRepository(database);
  const jobs = new JobRepository(database);
  const backups = new BackupService(database);
  const dataRoot =
    options.databasePath === ":memory:"
      ? resolve(tmpdir(), "our-platform-test-files")
      : resolve(options.databasePath, "..");
  const exporter = new FileExporterService(database, dataRoot);
  const openAI = new OpenAIProvider({
    ...(process.env.OPENAI_API_KEY
      ? { apiKey: process.env.OPENAI_API_KEY }
      : {}),
    ...options.openAI,
  });
  const knowledge = new KnowledgeRepository(database);
  const modules = new ModuleService(
    database,
    artifacts,
    workflow,
    exporter,
    settings,
    knowledge,
    {
      openAI,
      ...(process.env.OPENAI_ECONOMY_MODEL
        ? { economyModel: process.env.OPENAI_ECONOMY_MODEL }
        : {}),
      ...(process.env.OPENAI_POWERFUL_MODEL
        ? { powerfulModel: process.env.OPENAI_POWERFUL_MODEL }
        : {}),
      ...options.llm,
    },
  );
  const traceability = new TraceabilityService(database);
  const knowledgeIngestion = new KnowledgeIngestionService(
    database,
    knowledge,
    dataRoot,
  );
  const productDocuments = new ProductDocumentRepository(database);
  const productStudio = new ProductStudioService(
    database,
    productDocuments,
    artifacts,
    jobs,
    knowledge,
    settings,
    openAI,
  );
  const productExports = new ProductExportService(
    database,
    productDocuments,
    dataRoot,
  );

  app.addHook("onClose", async () => {
    database.close();
  });

  registerHealthRoute(app, database);
  registerProjectRoutes(app, projects);
  registerProjectSystemRoutes(app, settings, workflow, artifacts, backups);
  const youtubeImports = new YouTubeImportService(sources, jobs);
  registerSourceRoutes(app, sources, jobs, youtubeImports);
  registerModuleRoutes(app, projects, modules);
  registerDemoRoutes(app, projects, sources, modules);
  registerFileRoutes(app, projects, exporter);
  registerTraceabilityRoutes(app, traceability);
  registerKnowledgeRoutes(app, knowledge, knowledgeIngestion, openAI, settings);
  registerProductStudioRoutes(app, projects, productStudio);
  registerProductExportRoutes(app, productExports);
  youtubeImports.resumePending();

  if (options.serveFrontend ?? true) {
    const webDirectory = resolve(import.meta.dirname, "../../web/dist");
    if (existsSync(resolve(webDirectory, "index.html"))) {
      await app.register(fastifyStatic, { root: webDirectory });
      app.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith("/api/")) {
          return reply.code(404).send({ error: "Not found" });
        }
        return reply.sendFile("index.html");
      });
    }
  }

  return app;
}
