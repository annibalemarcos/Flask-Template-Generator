import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Globe, History, AlertTriangle, Trash2, Download, Copy as CopyIcon, FileJson, FileText, FileCode2, X, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import Switch from "@/components/Switch";

const FORMATS = [
  { value: "tree", label: "UML / TREE" },
  { value: "uml", label: "UML (PlantUML)" },
  { value: "md", label: "MARKDOWN" },
  { value: "json", label: "JSON" },
  { value: "txt", label: "TXT PLAIN" },
];

const DEFAULT_FOLDER_PATTERNS = "node_modules, .git, __pycache__, .venv, vendor";
const DEFAULT_EXT_PATTERNS = ".log, .bak, .swp";

export default function DirMap() {
  const [url, setUrl] = useState("");
  const [hideFolders, setHideFolders] = useState(true);
  const [folderPatterns, setFolderPatterns] = useState(DEFAULT_FOLDER_PATTERNS);
  const [hideExt, setHideExt] = useState(false);
  const [extPatterns, setExtPatterns] = useState(DEFAULT_EXT_PATTERNS);
  const [hideAllFiles, setHideAllFiles] = useState(false);
  const [controlRecursion, setControlRecursion] = useState(false);
  const [maxDepth, setMaxDepth] = useState(3);
  const [maxItems, setMaxItems] = useState(100000);
  const [format, setFormat] = useState("tree");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [rendered, setRendered] = useState("");

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);

  const sensitives = result?.sensitive_findings || [];

  useEffect(() => {
    refreshHistory();
  }, []);

  // re-render output when format changes (locally)
  useEffect(() => {
    if (!result?.root) return;
    let active = true;
    (async () => {
      try {
        const { data } = await api.post("/render", {
          root: result.root,
          format,
        });
        if (active) setRendered(data.rendered || "");
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { active = false; };
  }, [format, result]);

  const refreshHistory = async () => {
    try {
      const { data } = await api.get("/history");
      setHistory(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleScan = async () => {
    if (!url.trim()) {
      toast.error("Cole uma URL antes de mapear");
      return;
    }
    if (!/^https?:\/\//i.test(url.trim())) {
      toast.error("URL precisa começar com http:// ou https://");
      return;
    }
    setLoading(true);
    setResult(null);
    setRendered("");
    try {
      const payload = {
        url: url.trim(),
        recursive: true,
        max_depth: controlRecursion ? Number(maxDepth) || 1 : 5,
        max_items: Number(maxItems) || 100000,
        hide_folders: hideFolders,
        folder_patterns: folderPatterns.split(",").map((s) => s.trim()).filter(Boolean),
        hide_extensions: hideExt,
        ext_patterns: extPatterns.split(",").map((s) => s.trim()).filter(Boolean),
        hide_all_files: hideAllFiles,
        output_format: format,
      };
      const { data } = await api.post("/scan", payload);
      setResult(data);
      setRendered(data.rendered || "");
      if (data.root?.error) {
        toast.error(data.root.error);
      } else {
        toast.success(`Mapeamento concluído: ${data.total_items} itens em ${data.duration_ms}ms`);
      }
      refreshHistory();
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Falha ao mapear a URL");
    } finally {
      setLoading(false);
    }
  };

  const handleBrowser = () => {
    if (url.trim()) {
      window.open(url, "_blank", "noopener");
    } else {
      toast.message("Cole uma URL primeiro, depois clique em BROWSER para abri-la");
    }
  };

  const exportFile = (ext) => {
    if (!rendered) {
      toast.error("Nada para exportar — execute um mapeamento primeiro");
      return;
    }
    const mime = ext === "json" ? "application/json" : "text/plain";
    const blob = new Blob([rendered], { type: `${mime};charset=utf-8` });
    const a = document.createElement("a");
    const safeName = (result?.url || "dirmap").replace(/[^a-z0-9]/gi, "_").slice(0, 60);
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportAs = async (ext) => {
    // map button → format
    const map = { md: "md", json: "json", txt: "txt" };
    const fmt = map[ext];
    if (!result?.root) {
      toast.error("Execute um mapeamento primeiro");
      return;
    }
    try {
      const { data } = await api.post("/render", { root: result.root, format: fmt });
      const blob = new Blob([data.rendered], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      const safeName = (result?.url || "dirmap").replace(/[^a-z0-9]/gi, "_").slice(0, 60);
      a.href = URL.createObjectURL(blob);
      a.download = `${safeName}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Exportado como .${ext.toUpperCase()}`);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao exportar");
    }
  };

  const copyResult = async () => {
    if (!rendered) {
      toast.error("Nada para copiar");
      return;
    }
    try {
      await navigator.clipboard.writeText(rendered);
      toast.success("Copiado para o clipboard");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const loadFromHistory = async (id) => {
    try {
      const { data } = await api.get(`/history/${id}`);
      setResult(data);
      setRendered(data.rendered || "");
      setUrl(data.url);
      setShowHistory(false);
      toast.success("Scan carregado do histórico");
    } catch {
      toast.error("Falha ao carregar histórico");
    }
  };

  const deleteHistory = async (id, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/history/${id}`);
      refreshHistory();
      toast.success("Removido");
    } catch {
      toast.error("Falha ao remover");
    }
  };

  const stats = useMemo(() => {
    if (!result) return null;
    return {
      items: result.total_items,
      dirs: result.total_dirs,
      files: result.total_files,
      sensitive: result.sensitive_count,
      ms: result.duration_ms,
    };
  }, [result]);

  return (
    <div className="min-h-screen w-full flex justify-center py-10 px-4">
      <div className="w-full max-w-[1180px] grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* MAIN CARD */}
        <main className="dm-panel p-8 sm:p-10 fade-up">
          <header className="flex items-start justify-between mb-8">
            <div>
              <h1 className="brand-font text-5xl sm:text-6xl font-bold leading-none">
                DIR <span style={{ color: "var(--dm-amber)" }}>MAP</span>
              </h1>
              <div className="mt-5 dm-section-label">MAPEADOR DE DIRETÓRIOS WEB</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="dm-btn !py-2 !px-3 flex items-center gap-2 text-sm"
                data-testid="open-history-btn"
                title="Histórico"
              >
                <History size={16} /> <span className="hidden sm:inline">Histórico</span>
              </button>
              <span className="text-[var(--dm-muted)] text-sm brand-font tracking-widest">V0.2</span>
            </div>
          </header>

          {/* URL + actions */}
          <section className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              data-testid="url-input"
              className="dm-input flex-1"
              placeholder="https://exemplo.com/wp-includes/ — cole a URL do Index Of"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
            />
            <button
              data-testid="browser-btn"
              className="dm-btn flex items-center justify-center gap-2"
              onClick={handleBrowser}
            >
              <Globe size={16} /> BROWSER
            </button>
            <button
              data-testid="map-btn"
              disabled={loading}
              className={`dm-btn dm-btn-primary flex items-center justify-center gap-2 min-w-[140px] ${loading ? "pulse-amber" : ""}`}
              onClick={handleScan}
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> MAPEANDO</> : "MAPEAR"}
            </button>
          </section>

          {/* Toggles row 1 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-2">
            <Switch checked={hideFolders} onChange={setHideFolders} label="Ocultar Pasta(s)" testId="toggle-hide-folders" />
            <Switch checked={hideExt} onChange={setHideExt} label="Ocultar Extensão(ões)" testId="toggle-hide-ext" />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 mb-6">
            <div>
              <input
                data-testid="folder-patterns-input"
                className="dm-input"
                placeholder="node_modules, .git, __pycache__"
                value={folderPatterns}
                onChange={(e) => setFolderPatterns(e.target.value)}
                disabled={!hideFolders}
                style={{ opacity: hideFolders ? 1 : 0.4 }}
              />
              <p className="text-[12px] text-[var(--dm-muted)] mt-2 ml-1">Padrões pesados pré-preenchidos (recomendado).</p>
            </div>
            <div>
              <input
                data-testid="ext-patterns-input"
                className="dm-input"
                placeholder=".log, .bak, .swp"
                value={extPatterns}
                onChange={(e) => setExtPatterns(e.target.value)}
                disabled={!hideExt}
                style={{ opacity: hideExt ? 1 : 0.4 }}
              />
              <p className="text-[12px] text-[var(--dm-muted)] mt-2 ml-1">Separe extensões por vírgula.</p>
            </div>
          </section>

          {/* Toggles row 2 */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 mb-8">
            <Switch checked={hideAllFiles} onChange={setHideAllFiles} label="Ocultar Todos os Arquivos" testId="toggle-hide-all-files" />
            <Switch checked={controlRecursion} onChange={setControlRecursion} label="Controlar Recursividade" testId="toggle-recursion" />
          </section>

          {/* Format + depth + limit */}
          <section className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-4 mb-8">
            <div>
              <select
                data-testid="format-select"
                className="dm-select"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div>
              <input
                data-testid="max-depth-input"
                type="number" min={1} max={10}
                className="dm-input text-center"
                value={maxDepth}
                onChange={(e) => setMaxDepth(e.target.value)}
                disabled={!controlRecursion}
                style={{ opacity: controlRecursion ? 1 : 0.4 }}
              />
              <p className="text-[11px] text-[var(--dm-muted)] mt-2 text-center">Profundidade</p>
            </div>
            <div>
              <input
                data-testid="max-items-input"
                type="number"
                className="dm-input text-center"
                value={maxItems}
                onChange={(e) => setMaxItems(e.target.value)}
              />
              <p className="text-[11px] text-[var(--dm-muted)] mt-2 text-center">Limite de itens</p>
            </div>
          </section>

          {/* Stats chips */}
          {stats && (
            <section className="flex flex-wrap gap-2 mb-4">
              <span className="dm-chip" data-testid="stat-items">{stats.items} itens</span>
              <span className="dm-chip" data-testid="stat-dirs">{stats.dirs} pastas</span>
              <span className="dm-chip" data-testid="stat-files">{stats.files} arquivos</span>
              <span className="dm-chip">{stats.ms} ms</span>
              {stats.sensitive > 0 && (
                <span className="dm-chip dm-chip-sens" data-testid="stat-sensitive">
                  <AlertTriangle size={12} /> {stats.sensitive} sensíveis
                </span>
              )}
            </section>
          )}

          {/* Sensitive findings */}
          {sensitives.length > 0 && (
            <section className="mb-4 fade-up">
              <div className="dm-section-label mb-2 flex items-center gap-2" style={{ color: "#ff9b9b" }}>
                <AlertTriangle size={14} /> ARQUIVOS / PASTAS SENSÍVEIS DETECTADOS
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-auto">
                {sensitives.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-xs px-3 py-2 rounded-lg border border-[#3a2e27] hover:border-[#f5a623] transition-colors text-[#ffd5a8] truncate"
                    title={s.url}
                    data-testid={`sensitive-link-${i}`}
                  >
                    {s.type === "dir" ? "📁 " : "📄 "} {s.name}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* RESULT */}
          <section className="mb-6">
            <div className="dm-section-label mb-3">RESULTADO</div>
            <textarea
              data-testid="result-textarea"
              className="dm-result"
              placeholder="O mapa aparecerá aqui ..."
              value={rendered}
              readOnly
            />
          </section>

          {/* EXPORT */}
          <section>
            <div className="dm-section-label mb-3">EXPORTAR COMO</div>
            <div className="flex flex-wrap gap-3">
              <button data-testid="export-md" className="dm-btn flex items-center gap-2" onClick={() => exportAs("md")}>
                <FileCode2 size={14} /> .MD
              </button>
              <button data-testid="export-json" className="dm-btn flex items-center gap-2" onClick={() => exportAs("json")}>
                <FileJson size={14} /> .JSON
              </button>
              <button data-testid="export-txt" className="dm-btn flex items-center gap-2" onClick={() => exportAs("txt")}>
                <FileText size={14} /> .TXT
              </button>
              <button data-testid="copy-btn" className="dm-btn dm-btn-primary flex items-center gap-2" onClick={copyResult}>
                <CopyIcon size={14} /> COPIAR
              </button>
            </div>
          </section>
        </main>

        {/* SIDE INFO */}
        <aside className="hidden lg:flex flex-col gap-4 fade-up">
          <div className="dm-panel p-6">
            <div className="dm-section-label mb-3">COMO USAR</div>
            <ol className="text-sm space-y-2 text-[var(--dm-text)] list-decimal list-inside">
              <li>Cole a URL de um <span className="mono text-[var(--dm-amber)]">Index Of /</span></li>
              <li>Ajuste filtros e profundidade</li>
              <li>Clique em <b style={{color:"var(--dm-amber)"}}>MAPEAR</b></li>
              <li>Exporte como <span className="mono">.MD</span>, <span className="mono">.JSON</span> ou <span className="mono">.TXT</span></li>
            </ol>
          </div>
          <div className="dm-panel p-6">
            <div className="dm-section-label mb-3">EXEMPLOS</div>
            <div className="flex flex-col gap-2">
              {[
                "https://gbm.org.br/wp-includes/rest-api/?SA",
                "https://gbm.org.br/wp-includes/",
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setUrl(ex)}
                  className="text-left mono text-xs px-3 py-2 rounded-lg border border-[var(--dm-border)] hover:border-[var(--dm-amber)] transition-colors truncate"
                  title={ex}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
          <div className="dm-panel p-6">
            <div className="dm-section-label mb-3">DETECÇÃO DE SENSÍVEIS</div>
            <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
              Marca automaticamente arquivos como <span className="mono">.env</span>, <span className="mono">.git</span>,
              <span className="mono"> error_log</span>, backups (<span className="mono">.bak/.sql</span>) e chaves.
            </p>
          </div>
        </aside>
      </div>

      {/* HISTORY DRAWER */}
      {showHistory && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex justify-end"
          onClick={() => setShowHistory(false)}
          data-testid="history-overlay"
        >
          <div
            className="dm-panel !rounded-none !rounded-l-2xl w-full max-w-md h-full p-6 overflow-y-auto fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="brand-font text-2xl font-bold">HISTÓRICO</h2>
              <button onClick={() => setShowHistory(false)} className="dm-btn !p-2" data-testid="close-history-btn">
                <X size={16} />
              </button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-[var(--dm-muted)]">Nenhum scan ainda. Execute um mapeamento.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    onClick={() => loadFromHistory(h.id)}
                    className="cursor-pointer group p-3 rounded-xl border border-[var(--dm-border)] hover:border-[var(--dm-amber)] transition-colors"
                    data-testid={`history-item-${h.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mono text-xs text-[var(--dm-amber)] truncate">{h.url}</div>
                        <div className="text-xs text-[var(--dm-muted)] mt-1">
                          {new Date(h.started_at).toLocaleString()} · {h.total_items} itens
                          {h.sensitive_count > 0 && <span className="text-[#ff9b9b]"> · {h.sensitive_count} sens.</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => deleteHistory(h.id, e)}
                          className="dm-btn !p-2 opacity-60 hover:opacity-100"
                          data-testid={`delete-history-${h.id}`}
                          title="Remover"
                        >
                          <Trash2 size={14} />
                        </button>
                        <ChevronRight size={16} className="text-[var(--dm-muted)] group-hover:text-[var(--dm-amber)] transition" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
