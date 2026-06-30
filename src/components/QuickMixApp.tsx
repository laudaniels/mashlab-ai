import { LoaderCircle, ShieldCheck, SlidersHorizontal, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import {
  canStartQuickMix,
  createInitialQuickMixProgress,
  createInitialQuickMixUploadState,
  QUICK_MIX_ADVANCED_STUDIO_LABEL,
  QUICK_MIX_BEAT_DROP_HINT,
  QUICK_MIX_BEAT_DROP_LABEL,
  QUICK_MIX_LOCAL_ONLY_NOTICE,
  QUICK_MIX_PRIMARY_ACTION,
  QUICK_MIX_PROMISE,
  QUICK_MIX_VOCAL_DROP_HINT,
  QUICK_MIX_VOCAL_DROP_LABEL,
  type QuickMixFailureViewModel,
  type QuickMixOutputModel,
  type QuickMixProgressStep,
  type QuickMixUploadState,
} from "../domain/quickMix.ts";
import { buildQuickMixFailureView } from "../domain/quickMixErrors.ts";
import { buildQuickMixReadiness, isQuickMixReady } from "../domain/quickMixReadiness.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { validateAudioFile } from "../lib/audioMetadata.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import { runQuickMixPipeline } from "../lib/quickMix/runQuickMix.ts";
import { QuickMixDropCard } from "./quickMix/QuickMixDropCard.tsx";
import { QuickMixOutputPanel } from "./quickMix/QuickMixOutputPanel.tsx";
import { QuickMixProgressPanel } from "./quickMix/QuickMixProgressPanel.tsx";
import { QuickMixReadinessBanner } from "./quickMix/QuickMixReadinessBanner.tsx";

interface QuickMixAppProps {
  onOpenAdvancedStudio: () => void;
}

export function QuickMixApp({ onOpenAdvancedStudio }: QuickMixAppProps) {
  const { status } = useLocalEngineStatus();
  const [uploads, setUploads] = useState<QuickMixUploadState>(createInitialQuickMixUploadState);
  const [uploadErrors, setUploadErrors] = useState<{ vocal: string | null; instrumental: string | null }>({
    vocal: null,
    instrumental: null,
  });
  const [mixing, setMixing] = useState(false);
  const [progressSteps, setProgressSteps] = useState<QuickMixProgressStep[]>(createInitialQuickMixProgress);
  const [output, setOutput] = useState<QuickMixOutputModel | null>(null);
  const [mixFailure, setMixFailure] = useState<QuickMixFailureViewModel | null>(null);

  const readiness = useMemo(
    () =>
      buildQuickMixReadiness({
        sidecarOnline: status.online,
        capabilities: status.capabilities,
      }),
    [status.capabilities, status.online]
  );

  const readyToMix = isQuickMixReady(readiness);
  const canMix = canStartQuickMix(uploads, readyToMix) && !mixing;

  function setFile(kind: "vocal" | "instrumental", file: File) {
    const validation = validateAudioFile(file);
    if (!validation.ok) {
      setUploadErrors((current) => ({
        ...current,
        [kind]: validation.message,
      }));
      return;
    }

    setUploadErrors((current) => ({ ...current, [kind]: null }));
    setUploads((current) =>
      kind === "vocal"
        ? { ...current, vocalFile: file, vocalFileName: file.name }
        : { ...current, instrumentalFile: file, instrumentalFileName: file.name }
    );
    setOutput(null);
    setMixFailure(null);
  }

  function clearFile(kind: "vocal" | "instrumental") {
    setUploads((current) =>
      kind === "vocal"
        ? { ...current, vocalFile: null, vocalFileName: null }
        : { ...current, instrumentalFile: null, instrumentalFileName: null }
    );
    setUploadErrors((current) => ({ ...current, [kind]: null }));
    setOutput(null);
    setMixFailure(null);
  }

  async function handleMix() {
    if (!uploads.vocalFile || !uploads.instrumentalFile || !canMix) {
      return;
    }

    setMixing(true);
    setMixFailure(null);
    setOutput(null);
    setProgressSteps(createInitialQuickMixProgress());

    const result = await runQuickMixPipeline(
      { vocalFile: uploads.vocalFile, instrumentalFile: uploads.instrumentalFile },
      setProgressSteps
    );

    setMixing(false);

    if (!result.ok || !result.output) {
      setMixFailure(result.error ? buildQuickMixFailureView(result.error) : null);
      return;
    }

    setOutput(result.output);
  }

  function handleStartAnother() {
    setUploads(createInitialQuickMixUploadState());
    setUploadErrors({ vocal: null, instrumental: null });
    setOutput(null);
    setMixFailure(null);
    setProgressSteps(createInitialQuickMixProgress());
  }

  return (
    <div className="app-shell quick-mix-shell">
      <header className="topbar quick-mix-topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Waves aria-hidden="true" size={26} />
          </div>
          <div>
            <p className="eyebrow">MashLab AI / CyphaBlend AI</p>
            <h1>Quick Mix</h1>
          </div>
        </div>
        <button className="secondary-action" onClick={onOpenAdvancedStudio} type="button">
          <SlidersHorizontal aria-hidden="true" size={18} />
          {QUICK_MIX_ADVANCED_STUDIO_LABEL}
        </button>
      </header>

      <main className="quick-mix-main">
        {!output ? (
          <>
            <section className="quick-mix-hero">
              <p className="lead">{QUICK_MIX_PROMISE}</p>
              <p className="quick-mix-local-note">{QUICK_MIX_LOCAL_ONLY_NOTICE}</p>
            </section>

            <QuickMixReadinessBanner readiness={readiness} />

            <div className="quick-mix-drop-grid">
              <QuickMixDropCard
                error={uploadErrors.vocal}
                fileName={uploads.vocalFileName}
                hint={QUICK_MIX_VOCAL_DROP_HINT}
                kind="vocal"
                onClear={() => clearFile("vocal")}
                onFileSelected={(file) => setFile("vocal", file)}
                title={QUICK_MIX_VOCAL_DROP_LABEL}
              />
              <QuickMixDropCard
                error={uploadErrors.instrumental}
                fileName={uploads.instrumentalFileName}
                hint={QUICK_MIX_BEAT_DROP_HINT}
                kind="instrumental"
                onClear={() => clearFile("instrumental")}
                onFileSelected={(file) => setFile("instrumental", file)}
                title={QUICK_MIX_BEAT_DROP_LABEL}
              />
            </div>

            <div className="quick-mix-actions">
              <button className="primary-action quick-mix-primary" disabled={!canMix} onClick={() => void handleMix()} type="button">
                {mixing ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
                    Mixing…
                  </>
                ) : (
                  QUICK_MIX_PRIMARY_ACTION
                )}
              </button>
            </div>

            <QuickMixProgressPanel active={mixing || progressSteps.some((step) => step.status === "failed")} steps={progressSteps} />

            {mixFailure ? (
              <section className="quick-mix-error-panel" role="alert">
                <h2>{mixFailure.headline}</h2>
                <p>{mixFailure.detail}</p>
                <p className="quick-mix-error-recovery">{mixFailure.recovery}</p>
                {mixFailure.failedStepLabel ? (
                  <p className="quick-mix-error-meta">
                    Failed step: {mixFailure.failedStepLabel}
                    {mixFailure.failedSourceLabel ? ` · ${mixFailure.failedSourceLabel}` : ""}
                  </p>
                ) : null}
                {mixFailure.validationErrors.length > 0 ? (
                  <ul className="quick-mix-error-validation">
                    {mixFailure.validationErrors.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {mixFailure.statusCode || mixFailure.responseBody ? (
                  <details className="quick-mix-technical-details">
                    <summary>Technical details</summary>
                    {mixFailure.statusCode ? <p>Status: {mixFailure.statusCode}</p> : null}
                    {mixFailure.responseBody ? (
                      <pre>{mixFailure.responseBody}</pre>
                    ) : null}
                  </details>
                ) : null}
              </section>
            ) : null}

            <div className="quick-mix-rights-panel">
              <ShieldCheck aria-hidden="true" size={18} />
              <p>{requiredRightsNotice}</p>
            </div>
          </>
        ) : (
          <QuickMixOutputPanel
            onOpenAdvancedStudio={onOpenAdvancedStudio}
            onStartAnother={handleStartAnother}
            output={output}
          />
        )}
      </main>
    </div>
  );
}
