import { useEffect, useState } from "react";
import type { MarketResearchSupplement } from "@our-platform/shared";
import { api } from "../../api/client";

function inlineMarkdown(text: string) {
  return text.split(/(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

function ReportMarkdown({ markdown }: { markdown: string }) {
  return markdown.trim().split(/\r?\n(?:\s*\r?\n)+/).map((block, index) => {
    if (block.startsWith("# ")) return <h3 key={index}>{block.slice(2)}</h3>;
    if (block.startsWith("## ")) return <h4 key={index}>{block.slice(3)}</h4>;
    if (block.startsWith("|") && block.includes("\n| ---")) {
      const [headers, , ...rows] = block.split(/\r?\n/).map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
      return <div key={index} className="research-supplement-table">
        <table>
          <thead><tr>{headers?.map((cell, column) => <th key={column} scope="col">{inlineMarkdown(cell)}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>
            {row.map((cell, column) => <td key={column}>{inlineMarkdown(cell)}</td>)}
          </tr>)}</tbody>
        </table>
      </div>;
    }
    return <p key={index}>{inlineMarkdown(block)}</p>;
  });
}

export function MarketResearchSupplementPanel({ projectId, runId }: { projectId: string; runId: string }) {
  const [report, setReport] = useState<MarketResearchSupplement | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void api.marketResearchSupplement(projectId, runId)
      .then((loaded) => { if (active) setReport(loaded); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [projectId, runId]);

  if (failed) return <p className="form-hint" role="status">No se pudo comprobar el informe complementario.</p>;
  if (!report) return null;
  return <details className="analysis-details market-research-supplement">
    <summary>Informe complementario · consumo, resultados y fuentes</summary>
    <article aria-label={report.title}>
      <ReportMarkdown markdown={report.markdown}/>
    </article>
  </details>;
}
