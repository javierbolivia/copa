import { describe, expect, it } from "vitest";
import {
  KnowledgeExtractionError,
  chunkExtractedDocument,
  extractKnowledgeDocument,
  extractPdf,
  type ExtractedDocument,
} from "../src/services/knowledge/index.js";

const DOCX_FIXTURE = Buffer.from(
  "UEsDBBQAAAAIAGoADV2HLr2iAQEAALkBAAARAAAAd29yZC9kb2N1bWVudC54bWx1UMtOwzAQ/BXLd+KUQ4WiJD0AFZyIRJG4mnibRrK90dpJyOfwAXxFf4w4j3KAXna9ntnZ0aS7T6NZB+RqtBnfRDFnYEtUta0y/nbY39xx5ry0Smq0kPEBHN/laZ8oLFsD1rNRwLqkz/jJ+yYRwpUnMNJF2IAdsSOSkX4cqRI9kmoIS3Bu1Dda3MbxVhhZWx4kP1ANoTdTKWhqr37QwPqkkzrjTyCDsw0XeSounKn4/HD+9q1G9vBy/x5QP3FoZl50F3JBtQFizfmLSB6ROahawuj63nLLtmZ+1LrTq604+JmwZ7X+rR6XhT9uHzWE+JC1Fv+96qD0Bc0iczLiN/X8B1BLAwQUAAAACABrAA1deW4z1+gAAACtAQAAEwAAAFtDb250ZW50X1R5cGVzXS54bWx9UMlOwzAQ/RVrrihx4IAQitMDyxE4lA8Y2ZPEqjd53NL+PU5bekCF48xb9frV3juxo8w2BgW3bQeCgo7GhknB5/q1eQDBBYNBFwMpOBDDaujXh0QsqjawgrmU9Cgl65k8chsThYqMMXss9cyTTKg3OJG867p7qWMoFEpTFg8Y+mcaceuKeNnX96lHJscgnk7EJUsBpuSsxlJxuQvmV0pzTmir8sjh2Sa+qQSQVxMW5O+As+69DpOtIfGBubyhryz5FbORJuqtr8r2f5srPeM4Wk0X/eKWctTEXBf3rr0gHm346S+Pcw/fUEsDBBQAAAAIAGsADV2b/TfqrQAAACkBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCrRN5pWgaEUNMuCKkrKgewEjetaB5KwqO3JwMDRQyMtn9/luv2aWZ2pxAnZwVURQmMrHRqslrApT9t9sBiQqtwdpYELBShbeozzZjyShwnH1k2bBQwpuQPnEc5ksFYOE82TwYXDKZcBs09yitq4tuy3PHwacDaZJ0SEDpVAesXT//YbhgmSUcnb4Zs+nHiK5FlDJqSgIcLiqt3u8gs8KbmqxebF1BLAQIUABQAAAAIAGoADV2HLr2iAQEAALkBAAARAAAAAAAAAAAAAAAAAAAAAAB3b3JkL2RvY3VtZW50LnhtbFBLAQIUABQAAAAIAGsADV15bjPX6AAAAK0BAAATAAAAAAAAAAAAAAAAADABAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQAFAAAAAgAawANXZv9N+qtAAAAKQEAAAsAAAAAAAAAAAAAAAAASQIAAF9yZWxzLy5yZWxzUEsFBgAAAAADAAMAuQAAAB8DAAAAAA==",
  "base64",
);

function pdfFixture(contentStream: string): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(contentStream, "ascii")} >>\nstream\n${contentStream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(source, "ascii"));
    source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source, "ascii");
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  source += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source, "ascii");
}

describe("knowledge extractors", () => {
  it("normaliza TXT y manual sin controles", async () => {
    const document = await extractKnowledgeDocument({
      sourceKind: "manual",
      title: " Entrevista ",
      content: "Primer\u0000 hallazgo.\r\n\r\nSegundo\t hallazgo.",
    });
    expect(document).toMatchObject({ sourceKind: "manual", status: "READY", title: "Entrevista" });
    expect(document.text).toBe("Primer hallazgo.\n\nSegundo hallazgo.");
    expect(document.blocks.map((block) => block.id)).toEqual(["block-000001", "block-000002"]);
  });

  it("preserva estructura Markdown sin conservar HTML activo", async () => {
    const document = await extractKnowledgeDocument({
      sourceKind: "md",
      content: "# Guía\n\nTexto **seguro** <script>alert(1)</script>.\n\n- Uno\n- Dos\n\n```js\nconst ok = true;\n```",
    });
    expect(document.title).toBe("Guía");
    expect(document.blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "list_item", "list_item", "code"]);
    expect(document.text).not.toContain("alert(1)");
    expect(document.text).not.toContain("<script");
  });

  it("elimina elementos activos y decodifica entidades HTML sin ejecutar markup", async () => {
    const document = await extractKnowledgeDocument({
      sourceKind: "html",
      content: "<title>Artículo &amp; prueba</title><h1>Encabezado</h1><script>steal()</script><p onclick='x()'>A &lt; B</p><iframe src='evil'>secreto</iframe><ul><li>Uno</li></ul>",
    });
    expect(document.title).toBe("Artículo & prueba");
    expect(document.text).toBe("Encabezado\n\nA < B\n\nUno");
    expect(document.text).not.toMatch(/steal|secreto|onclick|iframe/);
    expect(document.metadata).toMatchObject({ activeContentRemoved: true });
  });

  it("extrae headings y párrafos DOCX con acceso externo deshabilitado", async () => {
    const document = await extractKnowledgeDocument({ sourceKind: "docx", content: DOCX_FIXTURE });
    expect(document.sourceKind).toBe("docx");
    expect(document.blocks[0]).toMatchObject({ kind: "heading", headingLevel: 1, text: "Título DOCX" });
    expect(document.text).toContain("Primer párrafo seguro.");
    expect(document.metadata).toMatchObject({ externalFileAccess: false, activeContentRemoved: true });
  });

  it("extrae PDF por página y marca NEEDS_OCR cuando no existe texto", async () => {
    const withText = await extractPdf(pdfFixture("BT /F1 12 Tf 72 720 Td (Texto PDF) Tj ET"), { maxPages: 10 });
    expect(withText).toMatchObject({ sourceKind: "pdf", status: "READY" });
    expect(withText.pages?.[0]).toMatchObject({ pageNumber: 1, status: "READY", text: "Texto PDF" });
    expect(withText.blocks[0]).toMatchObject({ pageNumber: 1 });

    const imageOnly = await extractPdf(pdfFixture("q Q"), { maxPages: 10 });
    expect(imageOnly.status).toBe("NEEDS_OCR");
    expect(imageOnly.pages?.[0]).toMatchObject({ status: "NEEDS_OCR", characterCount: 0 });
    expect(imageOnly.metadata.needsOcrPages).toBe(1);
  });

  it("rechaza entradas fuera de límite y binarios inválidos", async () => {
    await expect(extractKnowledgeDocument({ sourceKind: "txt", content: "12345" }, { maxTextBytes: 4 }))
      .rejects.toMatchObject({ code: "source_too_large" });
    await expect(extractKnowledgeDocument({ sourceKind: "pdf", content: "no binario" }))
      .rejects.toBeInstanceOf(KnowledgeExtractionError);
  });
});

describe("structural deterministic chunker", () => {
  const document: ExtractedDocument = {
    sourceKind: "md",
    status: "READY",
    title: "Manual",
    text: "",
    blocks: [
      { id: "block-000001", order: 0, kind: "heading", headingLevel: 1, text: "Sección A" },
      { id: "block-000002", order: 1, kind: "paragraph", text: "Alpha ".repeat(30).trim() },
      { id: "block-000003", order: 2, kind: "heading", headingLevel: 2, text: "Detalle" },
      { id: "block-000004", order: 3, kind: "paragraph", text: "Beta ".repeat(30).trim() },
    ],
    metadata: {},
    warnings: [],
  };

  it("produce IDs, orden y rutas de heading reproducibles respetando el límite", () => {
    const first = chunkExtractedDocument(document, { maxCharacters: 220, minCharactersBeforeBoundary: 100 });
    const second = chunkExtractedDocument(document, { maxCharacters: 220, minCharactersBeforeBoundary: 100 });
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(1);
    expect(first.map((chunk) => chunk.ordinal)).toEqual(first.map((_, index) => index));
    expect(first.every((chunk) => chunk.characterCount <= 220)).toBe(true);
    expect(first.at(-1)?.headingPath).toEqual(["Sección A", "Detalle"]);
  });
});
