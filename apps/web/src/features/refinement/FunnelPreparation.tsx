import { useState } from "react";
import { GitBranch, ShieldCheck, Sparkles, ArrowRight, Zap, AlertCircle } from "lucide-react";

interface FunnelPreparationProps {
  onGenerate: (instructions?: string) => void;
  running: boolean;
  provider: "mock" | "openai" | "gemini" | "deepseek";
  onProviderChange: (provider: "mock" | "openai" | "gemini" | "deepseek") => void;
  openAiConfigured: boolean | null;
  geminiConfigured: boolean | null;
  deepSeekConfigured: boolean | null;
}

export function FunnelPreparation({
  onGenerate,
  running,
  provider,
  onProviderChange,
  openAiConfigured,
  geminiConfigured,
  deepSeekConfigured,
}: FunnelPreparationProps) {
  const [instructions, setInstructions] = useState("");

  return (
    <div className="landing-preparation">
      {/* Top Banner */}
      <div className="landing-prep-banner">
        <div className="landing-prep-badge">
          <GitBranch size={16} />
          <span>ARQUITECTURA COMERCIAL</span>
        </div>
        <h2>Embudo de Conversión (Funnel)</h2>
        <p>
          Diseña y estructura el recorrido completo del comprador: desde la página de captura y venta,
          pasando por el checkout simulado, ofertas de aumento (Order Bump, Upsell y Downsell),
          hasta la confirmación de compra (Thank You).
        </p>
      </div>

      {/* Main Generation Card */}
      <div className="landing-prep-card">
        <div className="landing-prep-card-header">
          <div className="landing-prep-card-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <h3>Generar Funnel Comercial con IA</h3>
            <p>
              Hallazia recopila automáticamente la <strong>Landing</strong> aprobada y los componentes de la{" "}
              <strong>Oferta</strong> (precio, bump, upsell, downsell) para calcular el grafo comercial acíclico óptimo.
            </p>
          </div>
        </div>

        <div className="landing-prompt-box">
          <label htmlFor="funnel-instruction">
            <span>Instrucción u orientación para el embudo (opcional):</span>
          </label>
          <textarea
            id="funnel-instruction"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Ej: Diseña un recorrido optimizado con un Order Bump accesible y una oferta superior (Upsell) irresistible con alternativa Downsell suave..."
            rows={3}
            maxLength={2000}
            disabled={running}
          />
          <div className="landing-prompt-hint">
            <span>💡 Si se deja vacío, la IA generará el recorrido comercial canónico completo basado en tu Landing y Oferta.</span>
          </div>
        </div>

        <div className="landing-prep-controls">
          <div className="landing-provider-select">
            <label htmlFor="funnel-provider">Proveedor IA:</label>
            <select
              id="funnel-provider"
              value={provider}
              onChange={(e) => onProviderChange(e.target.value as "mock" | "openai" | "gemini" | "deepseek")}
              disabled={running}
            >
              <option value="gemini" disabled={!geminiConfigured}>
                Gemini 3.5 Flash Lite {geminiConfigured ? "⚡ (Recomendado)" : "· No configurado"}
              </option>
              <option value="mock">Demo / Mock (Local determinista)</option>
              <option value="deepseek" disabled={!deepSeekConfigured}>
                DeepSeek {deepSeekConfigured ? "· Alternativo" : "· No configurado"}
              </option>
              <option value="openai" disabled={!openAiConfigured}>
                OpenAI {openAiConfigured ? "" : "· No configurado"}
              </option>
            </select>
          </div>

          <button
            type="button"
            className="button primary landing-generate-btn"
            disabled={
              running ||
              (provider === "gemini" && !geminiConfigured) ||
              (provider === "openai" && !openAiConfigured) ||
              (provider === "deepseek" && !deepSeekConfigured)
            }
            onClick={() => onGenerate(instructions.trim() || undefined)}
          >
            {running ? (
              <>
                <Zap size={16} className="spinning" />
                <span>Generando Embudo...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>🚀 Generar Funnel con IA</span>
              </>
            )}
          </button>
        </div>

        <div className="landing-prep-footer">
          <div className="landing-prep-guarantee">
            <ShieldCheck size={14} />
            <span>
              <strong>Simulación segura:</strong> 'paymentsEnabled' permanece inactivo. Sin pasarelas reales ni cargos ficticios.
            </span>
          </div>
        </div>
      </div>

      {/* Recorrido Canónico Info Cards */}
      <div className="landing-canonical-blocks-card">
        <h4>Recorrido del Funnel Comercial:</h4>
        <div className="landing-blocks-grid">
          <div className="landing-block-tag">
            <span className="landing-block-num">01</span>
            <div>
              <strong>Landing</strong>
              <small>Punto de entrada y ventas</small>
            </div>
          </div>
          <div className="landing-block-tag">
            <span className="landing-block-num">02</span>
            <div>
              <strong>Checkout Simulado</strong>
              <small>Captura de comprador y precio</small>
            </div>
          </div>
          <div className="landing-block-tag">
            <span className="landing-block-num">03</span>
            <div>
              <strong>Order Bump</strong>
              <small>Complemento en 1 clic</small>
            </div>
          </div>
          <div className="landing-block-tag">
            <span className="landing-block-num">04</span>
            <div>
              <strong>Upsell</strong>
              <small>Oferta superior post-pago</small>
            </div>
          </div>
          <div className="landing-block-tag">
            <span className="landing-block-num">05</span>
            <div>
              <strong>Downsell</strong>
              <small>Alternativa accesible si declina</small>
            </div>
          </div>
          <div className="landing-block-tag">
            <span className="landing-block-num">06</span>
            <div>
              <strong>Thank You</strong>
              <small>Confirmación y entrega digital</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
