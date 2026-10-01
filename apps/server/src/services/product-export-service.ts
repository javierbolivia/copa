import type {
  ProductBlock,
  ProductDocument,
  ProductTheme,
} from "@our-platform/shared";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { v7 as uuidv7 } from "uuid";
import type { AppDatabase } from "../database/database.js";
import type { ProductDocumentRepository } from "../repositories/product-document-repository.js";

export interface ProductAssetDto {
  id: string;
  projectId: string;
  kind: "image" | "diagram";
  title: string;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  url: string;
}
export interface ProductExportDto {
  id: string;
  documentVersionId: string;
  format: "html" | "docx" | "pdf";
  filename: string;
  bytes: number;
  checksum: string;
  createdAt: string;
  downloadUrl: string;
}
interface AssetRow {
  id: string;
  project_id: string;
  asset_type: "IMAGE" | "DIAGRAM" | "COVER";
  original_name: string;
  mime_type: string;
  relative_path: string;
  checksum: string;
  bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
}
interface ExportRow {
  id: string;
  document_version_id: string;
  format: "html" | "docx" | "pdf";
  relative_path: string;
  checksum: string;
  bytes: number;
  created_at: string;
  generated_file_id: string | null;
}
interface ProductExportProfile {
  kind: "ebook" | "checklist";
  label: string;
  accentColor: string;
}

export interface ExportProfileInput {
  documentType: ProductDocument["documentType"];
  outline: ProductDocument["version"]["outline"];
  blocks: ProductDocument["version"]["blocks"];
  theme: ProductTheme;
}

export function projectExportProfileInput(
  document: ProductDocument,
): ExportProfileInput {
  return {
    documentType: document.documentType,
    outline: document.version.outline,
    blocks: document.version.blocks,
    theme: document.version.theme,
  };
}

function resolveExportProfile(
  input: ExportProfileInput,
): ProductExportProfile | undefined {
  const { documentType, outline, blocks, theme } = input;
  const outlineCount = outline.length;
  const blockCount = blocks.length;
  const accentColor = theme.accentColor;
  if (documentType === "ebook")
    return {
      kind: "ebook",
      label: `Ebook · ${outlineCount} secciones · ${blockCount} bloques`,
      accentColor,
    };
  if (documentType === "checklist") {
    const itemCount = blocks.reduce(
      (count, block) =>
        count +
        (block.type === "checklist"
          ? Array.isArray(block.content)
            ? block.content.length
            : flatten(block.content).split("\n").filter(Boolean).length
          : 0),
      0,
    );
    return {
      kind: "checklist",
      label: `Checklist · ${outlineCount} secciones · ${itemCount} tareas`,
      accentColor,
    };
  }
}

export class ProductExportService {
  private readonly root: string;
  constructor(
    private readonly db: AppDatabase,
    private readonly documents: ProductDocumentRepository,
    dataRoot: string,
  ) {
    this.root = resolve(dataRoot);
  }

  listAssets(projectId: string): ProductAssetDto[] {
    return (
      this.db.connection
        .prepare(
          "SELECT * FROM product_assets WHERE project_id=? ORDER BY created_at DESC",
        )
        .all(projectId) as unknown as AssetRow[]
    ).map((row) => this.assetDto(row));
  }
  async addImage(
    projectId: string,
    input: {
      title: string;
      filename: string;
      mimeType: string;
      contentBase64: string;
    },
  ): Promise<ProductAssetDto> {
    const declared = input.mimeType.toLowerCase(),
      extension = extname(input.filename).toLowerCase();
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(declared) ||
      ![".png", ".jpg", ".jpeg", ".webp"].includes(extension)
    )
      throw new Error("Sólo se permiten PNG, JPEG o WebP.");
    const source = Buffer.from(input.contentBase64, "base64");
    if (!source.length || source.length > 12 * 1024 * 1024)
      throw new Error("La imagen debe pesar entre 1 byte y 12 MB.");
    const image = sharp(source, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 10_000 ||
      metadata.height > 10_000
    )
      throw new Error("Dimensiones de imagen inválidas.");
    const { data: bytes, info } = await image
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 86 })
      .toBuffer({ resolveWithObject: true });
    return this.storeAsset(
      projectId,
      "IMAGE",
      safeTitle(input.title),
      "image/webp",
      "webp",
      bytes,
      info.width,
      info.height,
      { sourceMime: declared },
    );
  }
  async addDiagram(
    projectId: string,
    input: {
      title: string;
      diagramType: "flowchart" | "timeline" | "mindmap" | "process";
      description: string;
      advancedSource?: string;
    },
  ): Promise<ProductAssetDto> {
    if (
      input.description.length > 4000 ||
      (input.advancedSource?.length ?? 0) > 8000
    )
      throw new Error("El diagrama excede el límite permitido.");
    const source =
      input.advancedSource?.trim() ||
      planMermaid(input.diagramType, input.description);
    rejectUnsafeMermaid(source);
    const svg = await renderMermaid(source);
    const sanitized = sanitizeSvg(svg);
    if (!sanitized.includes("<svg"))
      throw new Error("Mermaid no produjo un SVG válido.");
    return this.storeAsset(
      projectId,
      "DIAGRAM",
      safeTitle(input.title),
      "image/svg+xml",
      "svg",
      Buffer.from(sanitized, "utf8"),
      null,
      null,
      { diagramType: input.diagramType, source },
    );
  }
  resolveAsset(
    projectId: string,
    id: string,
  ): { path: string; mimeType: string } | undefined {
    const row = this.db.connection
      .prepare(
        "SELECT relative_path,mime_type FROM product_assets WHERE project_id=? AND id=?",
      )
      .get(projectId, id) as
      { relative_path: string; mime_type: string } | undefined;
    if (!row) return;
    const path = this.safePath(row.relative_path, "assets");
    return existsSync(path) ? { path, mimeType: row.mime_type } : undefined;
  }

  validate(
    projectId: string,
    documentId: string,
  ): {
    errors: string[];
    warnings: string[];
    claimWarnings: Array<{ blockId: string; message: string }>;
    canExport: boolean;
  } {
    const document = this.documents.get(projectId, documentId);
    if (!document) throw new Error("El documento no existe.");
    const errors: string[] = [],
      warnings: string[] = [],
      claimWarnings: Array<{ blockId: string; message: string }> = [];
    if (!document.title.trim()) errors.push("Falta el título.");
    if (!document.version.outline.length) errors.push("El outline está vacío.");
    const chapterIds = new Set(document.version.outline.map((item) => item.id));
    for (const chapter of document.version.outline) {
      if (
        !document.version.blocks.some(
          (block) => block.metadata.chapterId === chapter.id,
        )
      )
        warnings.push(`El capítulo “${chapter.title}” está vacío.`);
    }
    for (const block of document.version.blocks) {
      const text = flatten(block.content);
      if (
        /(?<![\p{L}\p{N}_])(?:TODO\s*:|LOREM(?:\s+IPSUM)?|PLACEHOLDER|COMPLETAR\s+AQU[IÍ])(?![\p{L}\p{N}_])/iu.test(
          text,
        )
      )
        warnings.push(
          `El bloque ${block.id.slice(0, 8)} contiene un placeholder.`,
        );
      if (
        (block.type === "image" || block.type === "diagram") &&
        !this.assetExists(projectId, assetId(block))
      )
        errors.push(`Falta el asset del bloque ${block.id.slice(0, 8)}.`);
      if (
        block.metadata.chapterId &&
        !chapterIds.has(String(block.metadata.chapterId))
      )
        warnings.push(
          `El bloque ${block.id.slice(0, 8)} referencia un capítulo inexistente.`,
        );
      if (
        /\b\d+(?:[.,]\d+)?\s*%|garantizad[oa]s?|cura[rs]?|sin riesgo|rentabilidad|estudio demuestra/i.test(
          text,
        ) &&
        block.metadata.provenance !== "EVIDENCE_BACKED"
      )
        claimWarnings.push({
          blockId: block.id,
          message:
            "Afirmación sensible o cuantificada sin respaldo explícito; revisar antes de publicar.",
        });
    }
    if (document.freshness === "stale")
      warnings.push(
        `Documento desactualizado: ${document.staleReason ?? "cambió un artefacto padre"}.`,
      );
    return { errors, warnings, claimWarnings, canExport: errors.length === 0 };
  }
  listExports(projectId: string, documentId: string): ProductExportDto[] {
    return (
      this.db.connection
        .prepare(
          "SELECT * FROM product_exports WHERE project_id=? AND document_id=? ORDER BY created_at DESC",
        )
        .all(projectId, documentId) as unknown as ExportRow[]
    ).map((row) => this.exportDto(projectId, row));
  }
  async export(
    projectId: string,
    documentId: string,
    format: "html" | "docx" | "pdf",
  ): Promise<ProductExportDto> {
    const document = this.documents.get(projectId, documentId);
    if (!document) throw new Error("El documento no existe.");
    const validation = this.validate(projectId, documentId);
    if (!validation.canExport) throw new Error(validation.errors.join(" "));
    const html = this.renderHtml(projectId, document),
      stamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 17),
      slug = slugify(document.title),
      filename = `${slug}-v${document.version.versionNumber}-${stamp}-${uuidv7().slice(-6)}.${format}`;
    let bytes: Buffer;
    if (format === "html") bytes = Buffer.from(html, "utf8");
    else if (format === "docx")
      bytes = await this.renderDocx(projectId, document);
    else bytes = this.renderPdf(html, filename);
    if (!bytes.length) throw new Error("El export resultó vacío.");
    const path = this.safePath(
      `generated/${projectId}/product-studio/${filename}`,
      "generated",
    );
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: "wx" });
    const checksum = createHash("sha256").update(bytes).digest("hex"),
      fileId = uuidv7(),
      id = uuidv7(),
      createdAt = new Date().toISOString(),
      relativePath = relative(this.root, path).replaceAll("\\", "/");
    this.db.connection.exec("BEGIN IMMEDIATE");
    try {
      this.db.connection
        .prepare(
          `INSERT INTO generated_files(id,project_id,artifact_version_id,file_role,format,relative_path,checksum,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          fileId,
          projectId,
          document.artifactVersionId,
          "product_document",
          format,
          relativePath,
          checksum,
          bytes.length,
          createdAt,
        );
      this.db.connection
        .prepare(
          `INSERT INTO product_exports(id,project_id,document_id,document_version_id,generated_file_id,format,relative_path,checksum,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          projectId,
          document.id,
          document.version.id,
          fileId,
          format,
          relativePath,
          checksum,
          bytes.length,
          createdAt,
        );
      this.db.connection.exec("COMMIT");
    } catch (error) {
      if (this.db.connection.isTransaction) this.db.connection.exec("ROLLBACK");
      rmSync(path, { force: true });
      throw error;
    }
    return this.exportDto(projectId, {
      id,
      document_version_id: document.version.id,
      format,
      relative_path: relativePath,
      checksum,
      bytes: bytes.length,
      created_at: createdAt,
      generated_file_id: fileId,
    });
  }

  private storeAsset(
    projectId: string,
    type: "IMAGE" | "DIAGRAM",
    title: string,
    mime: string,
    extension: string,
    bytes: Buffer,
    width: number | null,
    height: number | null,
    metadata: Record<string, unknown>,
  ): ProductAssetDto {
    const id = uuidv7(),
      relativePath = `assets/${projectId}/${id}.${extension}`,
      path = this.safePath(relativePath, "assets"),
      createdAt = new Date().toISOString(),
      checksum = createHash("sha256").update(bytes).digest("hex");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: "wx" });
    try {
      this.db.connection
        .prepare(
          `INSERT INTO product_assets(id,project_id,document_id,asset_type,original_name,mime_type,relative_path,checksum,bytes,width,height,metadata_json,created_at) VALUES(?,?,NULL,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          projectId,
          type,
          title,
          mime,
          relativePath,
          checksum,
          bytes.length,
          width,
          height,
          JSON.stringify(metadata),
          createdAt,
        );
    } catch (error) {
      rmSync(path, { force: true });
      throw error;
    }
    return this.assetDto({
      id,
      project_id: projectId,
      asset_type: type,
      original_name: title,
      mime_type: mime,
      relative_path: relativePath,
      checksum,
      bytes: bytes.length,
      width,
      height,
      created_at: createdAt,
    });
  }
  private assetDto(row: AssetRow): ProductAssetDto {
    return {
      id: row.id,
      projectId: row.project_id,
      kind: row.asset_type === "DIAGRAM" ? "diagram" : "image",
      title: row.original_name,
      mimeType: row.mime_type,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      createdAt: row.created_at,
      url: `/api/projects/${row.project_id}/product-assets/${row.id}/content`,
    };
  }
  private exportDto(projectId: string, row: ExportRow): ProductExportDto {
    return {
      id: row.id,
      documentVersionId: row.document_version_id,
      format: row.format,
      filename: basename(row.relative_path),
      bytes: row.bytes,
      checksum: row.checksum,
      createdAt: row.created_at,
      downloadUrl: row.generated_file_id
        ? `/api/projects/${projectId}/files/${row.generated_file_id}/download`
        : "",
    };
  }
  private assetExists(projectId: string, id: string | null) {
    return id
      ? Boolean(
          this.db.connection
            .prepare("SELECT 1 FROM product_assets WHERE project_id=? AND id=?")
            .get(projectId, id),
        )
      : false;
  }
  private safePath(relativePath: string, prefix: "assets" | "generated") {
    const normalized = relativePath.replaceAll("\\", "/");
    if (
      !normalized.startsWith(`${prefix}/`) ||
      normalized.includes("..") ||
      normalized.startsWith("/")
    )
      throw new Error("Ruta de Product Studio inválida.");
    const path = resolve(this.root, normalized);
    if (!path.startsWith(`${this.root}\\`) && !path.startsWith(`${this.root}/`))
      throw new Error("Ruta fuera del directorio de datos.");
    return path;
  }
  private ebookPresentation(document: ProductDocument) {
    const outline = [...document.version.outline].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    );
    const blocksByChapter = new Map<string, ProductBlock[]>();
    for (const item of outline) blocksByChapter.set(item.id, []);
    const unassignedBlocks: ProductBlock[] = [];
    for (const block of [...document.version.blocks].sort(
      (a, b) => a.order - b.order || a.id.localeCompare(b.id),
    )) {
      const chapterId =
        typeof block.metadata.chapterId === "string"
          ? block.metadata.chapterId
          : undefined;
      const chapterBlocks = chapterId ? blocksByChapter.get(chapterId) : undefined;
      if (chapterBlocks) chapterBlocks.push(block);
      else unassignedBlocks.push(block);
    }
    return {
      title: document.title,
      theme: document.version.theme,
      chapters: outline.map((item, index) => ({
        anchor: `chapter-${item.id.replace(/[^a-z0-9]/gi, "").toLowerCase()}`,
        blocks: blocksByChapter.get(item.id) ?? [],
        number: index + 1,
        title: item.title,
      })),
      unassignedBlocks,
    };
  }
  private renderHtml(projectId: string, document: ProductDocument): string {
    if (document.documentType === "ebook")
      return this.renderEbookHtml(projectId, document);
    const theme = document.version.theme,
      meta = document.version.metadata,
      profile = resolveExportProfile(projectExportProfileInput(document)),
      title = escapeHtml(meta.coverTitle ?? document.title),
      subtitle = escapeHtml(meta.coverSubtitle ?? document.subtitle ?? ""),
      author = escapeHtml(meta.author ?? "");
    const blocks = [...document.version.blocks]
      .sort((a, b) => a.order - b.order)
      .map((block) => this.blockHtml(projectId, block))
      .join("\n");
    const profileBanner = profile
      ? `<p class="no-print" data-export-profile="${profile.kind}" style="margin:0 0 24px;padding:12px;border-left:5px solid ${profile.accentColor}">${escapeHtml(profile.label)}</p>`
      : "";
    return `<!doctype html><html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{--accent:${theme.accentColor};--scale:${theme.typographyScale};--space:${theme.spacing}}*{box-sizing:border-box}body{margin:0;color:#17221e;background:#eef1ed;font:calc(16px * var(--scale))/1.65 system-ui,sans-serif}.page{max-width:820px;margin:auto;background:#fff;min-height:100vh;padding:${theme.margins}px}.cover{display:flex;min-height:85vh;flex-direction:column;justify-content:center;padding:8%;color:#fff;background:linear-gradient(145deg,#14251c,var(--accent));page-break-after:always}.cover h1{font-size:3.4em;line-height:1.05}.cover .type{letter-spacing:.18em;text-transform:uppercase}.cover .author{margin-top:auto}.block{margin:calc(18px * var(--space)) 0}.callout,.exercise,.keyTakeaway{padding:16px;border-left:5px solid var(--accent);background:#f3f7ef}.checklist{list-style:none;padding:0}.checklist input{margin-right:9px}.page-break{break-after:page}.diagram,.image{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ccd4ce}blockquote{padding-left:16px;border-left:4px solid var(--accent)}@media(max-width:600px){.page{padding:20px}.cover h1{font-size:2.3em}}@media print{body{background:#fff}.page{max-width:none}.no-print{display:none}@page{size:${theme.pageSize};margin:${theme.margins}mm}}</style></head><body><section class="cover"><span class="type">${escapeHtml(profile?.label ?? document.documentType)}</span><h1>${title}</h1><p>${subtitle}</p><strong class="author">${author}</strong></section><main class="page">${profileBanner}${blocks}</main></body></html>`;
  }
  private renderEbookHtml(projectId: string, document: ProductDocument): string {
    const ebook = this.ebookPresentation(document);
    const profile = resolveExportProfile(projectExportProfileInput(document));
    const meta = document.version.metadata;
    const title = escapeHtml(ebook.title);
    const subtitle = escapeHtml(meta.coverSubtitle ?? document.subtitle ?? "");
    const author = escapeHtml(meta.author ?? "");
    const toc = ebook.chapters
      .map(
        (chapter) =>
          `<li><a href="#${chapter.anchor}">${chapter.number}. ${escapeHtml(chapter.title)}</a></li>`,
      )
      .join("");
    const chapters = ebook.chapters
      .map(
        (chapter, index) =>
          `<section class="ebook-chapter" id="${chapter.anchor}"><h2>${chapter.number}. ${escapeHtml(chapter.title)}</h2>${chapter.blocks.map((block) => this.blockHtml(projectId, block)).join("\n")}</section>${index < ebook.chapters.length - 1 ? '<div class="page-break ebook-page-break" aria-hidden="true"></div>' : ""}`,
      )
      .join("\n");
    const unassigned = ebook.unassignedBlocks.length
      ? `<section class="ebook-unassigned"><h2>Contenido adicional</h2>${ebook.unassignedBlocks.map((block) => this.blockHtml(projectId, block)).join("\n")}</section>`
      : "";
    return `<!doctype html><html lang="${escapeHtml(document.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{--accent:${ebook.theme.accentColor};--scale:${ebook.theme.typographyScale};--space:${ebook.theme.spacing}}*{box-sizing:border-box}body{margin:0;color:#17221e;background:#eef1ed;font:calc(16px * var(--scale))/1.65 system-ui,sans-serif}.page{max-width:820px;margin:auto;background:#fff;min-height:100vh;padding:${ebook.theme.margins}px}.cover{display:flex;min-height:85vh;flex-direction:column;justify-content:center;padding:8%;color:#fff;background:linear-gradient(145deg,#14251c,var(--accent));page-break-after:always}.cover h1{font-size:3.4em;line-height:1.05}.cover .type{letter-spacing:.18em;text-transform:uppercase}.cover .author{margin-top:auto}.cover .theme{opacity:.85}.block{margin:calc(18px * var(--space)) 0}.callout,.exercise,.keyTakeaway{padding:16px;border-left:5px solid var(--accent);background:#f3f7ef}.checklist{list-style:none;padding:0}.checklist input{margin-right:9px}.page-break{break-after:page}.diagram,.image{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #ccd4ce}blockquote{padding-left:16px;border-left:4px solid var(--accent)}.ebook-toc{margin-bottom:36px}.ebook-toc li{margin:.45em 0}.ebook-toc a{color:inherit}.ebook-chapter h2,.ebook-unassigned h2{border-bottom:2px solid var(--accent);padding-bottom:.35em}@media(max-width:600px){.page{padding:20px}.cover h1{font-size:2.3em}}@media print{body{background:#fff}.page{max-width:none}@page{size:${ebook.theme.pageSize};margin:${ebook.theme.margins}mm}}</style></head><body><section class="cover ebook-cover" data-ebook-theme="${escapeHtml(ebook.theme.template)}"><span class="type" data-export-profile="ebook">${escapeHtml(profile?.label ?? "Ebook")}</span><h1>${title}</h1><p>${subtitle}</p><p class="theme">Tema: ${escapeHtml(ebook.theme.template)}</p><strong class="author">${author}</strong></section><main class="page ebook"><nav class="ebook-toc" aria-label="Tabla de contenidos"><h2>Contenido</h2><ol>${toc}</ol></nav>${chapters}${unassigned}</main></body></html>`;
  }
  private blockHtml(projectId: string, block: ProductBlock): string {
    const text = escapeHtml(flatten(block.content)),
      items = Array.isArray(block.content)
        ? block.content.map((item) => escapeHtml(item))
        : text.split("\n").filter(Boolean);
    switch (block.type) {
      case "heading":
        return `<h2 class="block">${text}</h2>`;
      case "paragraph":
        return `<p class="block">${text.replaceAll("\n", "<br>")}</p>`;
      case "bulletList":
        return `<ul class="block">${items.map((x) => `<li>${x}</li>`).join("")}</ul>`;
      case "numberedList":
        return `<ol class="block">${items.map((x) => `<li>${x}</li>`).join("")}</ol>`;
      case "checklist":
        return `<ul class="block checklist">${items.map((x) => `<li><label><input type="checkbox">${x}</label></li>`).join("")}</ul>`;
      case "quote":
        return `<blockquote class="block">${text}</blockquote>`;
      case "divider":
        return '<hr class="block">';
      case "pageBreak":
        return '<div class="page-break"></div>';
      case "table":
        return tableHtml(block.content);
      case "image":
      case "diagram": {
        const asset = this.resolveAsset(projectId, assetId(block) ?? "");
        if (!asset) return `<p class="block">[Asset faltante]</p>`;
        const data = readFileSync(asset.path).toString("base64");
        return `<figure class="block"><img class="${block.type}" src="data:${asset.mimeType};base64,${data}" alt="${text}"><figcaption>${text}</figcaption></figure>`;
      }
      case "sourceReference":
        return `<p class="block"><small>Fuente: ${sourceReferenceHtml(block.content)}</small></p>`;
      case "CTA":
        return `<p class="block"><strong>${text}</strong></p>`;
      default:
        return `<section class="block ${block.type}"><strong>${escapeHtml(labelFor(block.type))}</strong><p>${text.replaceAll("\n", "<br>")}</p></section>`;
    }
  }
  private async renderDocx(
    projectId: string,
    document: ProductDocument,
  ): Promise<Buffer> {
    if (document.documentType === "ebook")
      return this.renderEbookDocx(projectId, document);
    const profile = resolveExportProfile(projectExportProfileInput(document));
    const children: Array<Paragraph | Table> = [
      new Paragraph({
        text: document.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
      ...(profile
        ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: profile.label,
                  bold: true,
                  color: profile.accentColor.slice(1),
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ]
        : []),
      new Paragraph({
        children: [
          new TextRun({ text: document.subtitle ?? "", italics: true }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ children: [new PageBreak()] }),
    ];
    for (const block of [...document.version.blocks].sort(
      (a, b) => a.order - b.order,
    )) {
      children.push(...(await this.docxBlock(projectId, block)));
    }
    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({ children: [new Paragraph(document.title)] }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  text: "Product Studio",
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          },
          children,
        },
      ],
    });
    return Packer.toBuffer(doc);
  }
  private async renderEbookDocx(
    projectId: string,
    document: ProductDocument,
  ): Promise<Buffer> {
    const ebook = this.ebookPresentation(document);
    const profile = resolveExportProfile(projectExportProfileInput(document));
    const children: Array<Paragraph | Table> = [
      new Paragraph({
        text: ebook.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Ebook · ${ebook.theme.template}`,
            bold: true,
            color: ebook.theme.accentColor.slice(1),
          }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      ...(profile
        ? [
            new Paragraph({
              text: profile.label,
              alignment: AlignmentType.CENTER,
            }),
          ]
        : []),
      new Paragraph({
        children: [
          new TextRun({ text: document.subtitle ?? "", italics: true }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: "Contenido", heading: HeadingLevel.HEADING_1 }),
      ...ebook.chapters.map(
        (chapter) => new Paragraph(`${chapter.number}. ${chapter.title}`),
      ),
      new Paragraph({ children: [new PageBreak()] }),
    ];
    for (const [index, chapter] of ebook.chapters.entries()) {
      children.push(
        new Paragraph({
          text: `${chapter.number}. ${chapter.title}`,
          heading: HeadingLevel.HEADING_1,
        }),
      );
      for (const block of chapter.blocks)
        children.push(...(await this.docxBlock(projectId, block)));
      if (index < ebook.chapters.length - 1)
        children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    if (ebook.unassignedBlocks.length) {
      children.push(
        new Paragraph({
          text: "Contenido adicional",
          heading: HeadingLevel.HEADING_1,
        }),
      );
      for (const block of ebook.unassignedBlocks)
        children.push(...(await this.docxBlock(projectId, block)));
    }
    const doc = new Document({
      sections: [
        {
          headers: {
            default: new Header({ children: [new Paragraph(document.title)] }),
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  text: "Product Studio",
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }),
          },
          children,
        },
      ],
    });
    return Packer.toBuffer(doc);
  }
  private async docxBlock(
    projectId: string,
    block: ProductBlock,
  ): Promise<Array<Paragraph | Table>> {
    const text = flatten(block.content);
    if (block.type === "heading")
      return [new Paragraph({ text, heading: HeadingLevel.HEADING_1 })];
    if (block.type === "sourceReference")
      return [
        new Paragraph({
          children: sourceReferenceSegments(block.content).map((segment) =>
            segment.href
              ? new ExternalHyperlink({
                  link: segment.href,
                  children: [new TextRun({ text: segment.text })],
                })
              : new TextRun({ text: segment.text }),
          ),
        }),
      ];
    if (
      block.type === "bulletList" ||
      block.type === "numberedList" ||
      block.type === "checklist"
    )
      return (
        Array.isArray(block.content) ? block.content : text.split("\n")
      ).map(
        (item, index) =>
          new Paragraph(
            block.type === "bulletList"
              ? { text: String(item), bullet: { level: 0 } }
              : {
                  text: `${block.type === "numberedList" ? `${index + 1}. ` : "☐ "}${String(item)}`,
                },
          ),
      );
    if (block.type === "pageBreak")
      return [new Paragraph({ children: [new PageBreak()] })];
    if (block.type === "divider")
      return [new Paragraph("────────────────────────")];
    if (block.type === "table") return [docxTable(block.content)];
    if (block.type === "image" || block.type === "diagram") {
      const asset = this.resolveAsset(projectId, assetId(block) ?? "");
      if (asset) {
        const data = await sharp(readFileSync(asset.path), { density: 160 })
          .png()
          .toBuffer();
        return [
          new Paragraph({
            children: [
              new ImageRun({
                data,
                type: "png",
                transformation: {
                  width: 560,
                  height: Math.max(120, Math.round(560 * 0.62)),
                },
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ];
      }
    }
    if (
      ["callout", "exercise", "question", "keyTakeaway", "CTA"].includes(
        block.type,
      )
    )
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: `${labelFor(block.type)}\n`,
              bold: true,
              color: "315EFB",
            }),
            new TextRun(text),
          ],
        }),
      ];
    return [new Paragraph({ text })];
  }
  private renderPdf(html: string, filename: string): Buffer {
    const tempDir = resolve(this.root, "generated", ".print");
    mkdirSync(tempDir, { recursive: true });
    const htmlPath = resolve(tempDir, `${uuidv7()}.html`),
      pdfPath = resolve(tempDir, `${uuidv7()}.pdf`);
    const profile = mkdtempSync(resolve(tmpdir(), "hallazia-pdf-profile-"));
    try {
      writeFileSync(htmlPath, html, "utf8");
      const edge = edgePath();
      const result = spawnSync(
        edge,
        [
          "--headless=new",
          // Keep CLI output attached to this process instead of Edge's compat relaunch.
          "--edge-skip-compat-layer-relaunch",
          `--user-data-dir=${profile}`,
          "--no-first-run",
          "--disable-gpu",
          `--print-to-pdf=${pdfPath}`,
          "--no-pdf-header-footer",
          pathToFileURL(htmlPath).href,
        ],
        { encoding: "utf8", timeout: 60_000, windowsHide: true },
      );
      if (result.status !== 0 || !existsSync(pdfPath))
        throw new Error(`No se pudo crear ${filename} con Chromium local.`);
      const bytes = readFileSync(pdfPath);
      if (bytes.subarray(0, 5).toString() !== "%PDF-")
        throw new Error("Chromium produjo un PDF inválido.");
      return bytes;
    } finally {
      rmSync(htmlPath, { force: true });
      rmSync(pdfPath, { force: true });
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
}

function safeTitle(value: string) {
  const title = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ")
    .trim()
    .slice(0, 160);
  return title || "asset";
}
function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "producto"
  );
}
function flatten(value: ProductBlock["content"]): string {
  return value == null
    ? ""
    : typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : Array.isArray(value)
          ? value.map(String).join("\n")
          : Object.values(value).flat().map(String).join("\n");
}
function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
function sourceReferenceHtml(value: ProductBlock["content"]): string {
  return sourceReferenceSegments(value)
    .map((segment) =>
      segment.href
        ? `<a href="${escapeHtml(segment.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment.text)}</a>`
        : escapeHtml(segment.text),
    )
    .join("");
}
function sourceReferenceSegments(
  value: ProductBlock["content"],
): Array<{ text: string; href?: string }> {
  const source = flatten(value);
  const pattern = /https?:\/\/[^\s<>"']+/gi;
  let cursor = 0;
  const segments: Array<{ text: string; href?: string }> = [];
  for (const match of source.matchAll(pattern)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const trailing = rawUrl.match(/[.,;:!?]+$/)?.[0] ?? "";
    const candidate = rawUrl.slice(0, rawUrl.length - trailing.length);
    const prefix = source.slice(cursor, start);
    if (prefix) segments.push({ text: prefix });
    let href: string | undefined;
    try {
      const url = new URL(candidate);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password
      ) {
        href = url.href;
      }
    } catch {
      // Keep malformed URLs as escaped text rather than emitting an unsafe link.
    }
    segments.push(href ? { text: candidate, href } : { text: candidate });
    if (trailing) segments.push({ text: trailing });
    cursor = start + rawUrl.length;
  }
  const remainder = source.slice(cursor);
  if (remainder) segments.push({ text: remainder });
  return segments;
}
function assetId(block: ProductBlock): string | null {
  const candidate =
    block.metadata.assetId ??
    (block.content !== null &&
    typeof block.content === "object" &&
    !Array.isArray(block.content)
      ? block.content.assetId
      : null) ??
    (typeof block.content === "string" ? block.content : null);
  return typeof candidate === "string" && /^[0-9a-f-]{36}$/i.test(candidate)
    ? candidate
    : null;
}
function tableRows(value: ProductBlock["content"]): string[] {
  const rawRows =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value
        : value !== null && typeof value === "object"
          ? value.rows
          : null;
  const rows =
    typeof rawRows === "string"
      ? rawRows.split(/\r?\n/)
      : Array.isArray(rawRows)
        ? rawRows
        : [];
  return rows.map(String).map((row) => row.trim()).filter(Boolean);
}
function tableHtml(value: ProductBlock["content"]) {
  const rows = tableRows(value);
  return `<table class="block">${rows
    .map(
      (row) =>
        `<tr>${row
          .split("|")
          .map((cell) => `<td>${escapeHtml(cell.trim())}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</table>`;
}
function docxTable(value: ProductBlock["content"]): Table | Paragraph {
  const rows = tableRows(value);
  if (!rows.length) return new Paragraph("");
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row) =>
        new TableRow({
          children: row
            .split("|")
            .map(
              (cell) =>
                new TableCell({ children: [new Paragraph(cell.trim())] }),
            ),
        }),
    ),
  });
}
function labelFor(type: string) {
  return (
    (
      {
        callout: "IMPORTANTE",
        exercise: "EJERCICIO",
        question: "PREGUNTA",
        keyTakeaway: "IDEA CLAVE",
        CTA: "SIGUIENTE PASO",
      } as Record<string, string>
    )[type] ?? type.toUpperCase()
  );
}
function rejectUnsafeMermaid(source: string) {
  if (
    /%%\{|click\s|href|javascript:|<\/?[a-z][^>]*>|classDef|style\s|linkStyle|securityLevel|\bscript\b/i.test(
      source,
    )
  )
    throw new Error("El diagrama contiene directivas no permitidas.");
  if (source.split(/\r?\n/).length > 120)
    throw new Error("El diagrama es demasiado complejo.");
}
function planMermaid(
  type: "flowchart" | "timeline" | "mindmap" | "process",
  description: string,
) {
  const steps = description
    .split(/[\r\n.;]+/)
    .map((item) => item.trim().replace(/[^\p{L}\p{N}\s,()¿?¡!:-]/gu, ""))
    .filter(Boolean)
    .slice(0, 12);
  if (!steps.length) throw new Error("Describe al menos un paso.");
  if (type === "timeline")
    return `timeline\n  title Proceso\n${steps.map((step, index) => `  ${index + 1} : ${step}`).join("\n")}`;
  if (type === "mindmap")
    return `mindmap\n  root((Idea central))\n${steps.map((step) => `    ${step}`).join("\n")}`;
  return `flowchart TD\n${steps.map((step, index) => `  N${index}[${step}]${index < steps.length - 1 ? ` --> N${index + 1}` : ""}`).join("\n")}`;
}
const MAX_MERMAID_RENDER_ATTEMPTS = 3;
const MERMAID_RENDER_RE = /<body\b[^>]*data-render="(ready|error)"/i;
function mermaidPageBody(stdout: string): string {
  const body = stdout.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return body?.[1]?.trim() ?? "";
}
async function renderMermaid(source: string): Promise<string> {
  const edge = edgePath(),
    mermaidModule = pathToFileURL(
      createRequire(import.meta.url).resolve(
        "mermaid/dist/mermaid.esm.min.mjs",
      ),
    ).href,
    temp = resolve(process.cwd(), "data", "generated", ".diagram"),
    htmlPath = resolve(temp, `${uuidv7()}.html`);
  mkdirSync(temp, { recursive: true });
  writeFileSync(
    htmlPath,
    `<!doctype html><meta charset="utf-8"><div id="out"></div><script type="module">import mermaid from ${JSON.stringify(mermaidModule)};mermaid.initialize({startOnLoad:false,securityLevel:'strict',htmlLabels:false});try{await mermaid.parse(${JSON.stringify(source)});const {svg}=await mermaid.render('graph',${JSON.stringify(source)});document.getElementById('out').innerHTML=svg;document.body.dataset.render='ready'}catch(e){document.body.dataset.render='error';document.body.textContent=String(e)}</script>`,
    "utf8",
  );
  const profile = mkdtempSync(resolve(tmpdir(), "hallazia-mermaid-profile-"));
  try {
    for (let attempt = 1; attempt <= MAX_MERMAID_RENDER_ATTEMPTS; attempt++) {
      const result = spawnSync(
        edge,
        [
          "--headless=new",
          "--edge-skip-compat-layer-relaunch",
          `--user-data-dir=${profile}`,
          "--no-first-run",
          "--disable-gpu",
          "--allow-file-access-from-files",
          "--virtual-time-budget=10000",
          "--dump-dom",
          pathToFileURL(htmlPath).href,
        ],
        {
          encoding: "utf8",
          timeout: 30_000,
          windowsHide: true,
          maxBuffer: 5_000_000,
        },
      );
      const stdout = result.stdout ?? "";
      if (result.status !== 0)
        throw new Error(
          `Mermaid rechazó el diagrama (${result.status ?? "timeout"}): ${result.stderr.slice(0, 180) || stdout.slice(0, 240)}`,
        );
      if (stdout.match(MERMAID_RENDER_RE)?.[1] === "error") {
        const detail = mermaidPageBody(stdout) || stdout.slice(0, 240);
        throw new Error(`Mermaid rechazó el diagrama: ${detail.slice(0, 240)}`);
      }
      const match = stdout.match(/<svg[\s\S]*<\/svg>/i);
      if (match) return match[0];
      // Sin <svg> y sin marcador de error: el dump ocurrió antes de que
      // terminara el render async (carrera). La página es determinista, así
      // que reintentamos de forma acotada en lugar de usar sleeps arbitrarios.
    }
    throw new Error(
      `Mermaid no completó el render tras ${MAX_MERMAID_RENDER_ATTEMPTS} intentos.`,
    );
  } finally {
    rmSync(htmlPath, { force: true });
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
function sanitizeSvg(svg: string) {
  const sanitized = svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(
      /\s(?:href|xlink:href)\s*=\s*("(?:javascript:|https?:\/\/)[^"]*"|'(?:javascript:|https?:\/\/)[^']*')/gi,
      "",
    )
    .replace(/url\(\s*['"]?(?:javascript:|https?:\/\/)[^)]+\)/gi, "none")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[^>]*>/gi, "");
  const viewBox = sanitized.match(
    /\bviewBox\s*=\s*["']\s*[-.\d]+\s+[-.\d]+\s+([.\d]+)\s+([.\d]+)\s*["']/i,
  );
  const width = viewBox
    ? Math.max(1, Math.min(4096, Math.round(Number(viewBox[1]))))
    : 1200;
  const height = viewBox
    ? Math.max(1, Math.min(4096, Math.round(Number(viewBox[2]))))
    : 800;
  return sanitized.replace(/<svg\b([^>]*)>/i, (_whole, attributes: string) => {
    const clean = attributes
      .replace(/\swidth\s*=\s*("[^"]*"|'[^']*')/gi, "")
      .replace(/\sheight\s*=\s*("[^"]*"|'[^']*')/gi, "");
    return `<svg${clean} width="${width}" height="${height}">`;
  });
}
function edgePath() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const found = candidates.find(existsSync);
  if (!found)
    throw new Error(
      "Chromium/Edge local no está disponible para PDF o Mermaid.",
    );
  return found;
}
