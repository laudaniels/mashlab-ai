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
import { QUICK_MIX_PROCESSING_PATIENCE_NOTICE } from "../domain/quickMixListening.ts";
import { buildQuickMixFailureView } from "../domain/quickMixErrors.ts";
import { buildQuickMixReadiness, isQuickMixReady } from "../domain/quickMixReadiness.ts";
import {
  createDefaultQuickMixSectionDraft,
  QUICK_MIX_SAME_START_TOGGLE_LABEL,
  resolveQuickMixSectionSelection,
  validateQuickMixSectionAgainstDuration,
  type QuickMixSectionDraft,
} from "../domain/quickMixSection.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";
import { readLocalAudioDurationSeconds, validateAudioFile } from "../lib/audioMetadata.ts";
import { requiredRightsNotice } from "../lib/legal.ts";
import { runQuickMixPipeline } from "../lib/quickMix/runQuickMix.ts";
import { QuickMixDropCard } from "./quickMix/QuickMixDropCard.tsx";
import { QuickMixOutputPanel } from "./quickMix/QuickMixOutputPanel.tsx";
import { QuickMixProgressPanel } from "./quickMix/QuickMixProgressPanel.tsx";
import { QuickMixReadinessBanner } from "./quickMix/QuickMixReadinessBanner.tsx";
import { QuickMixSectionPicker } from "./quickMix/QuickMixSectionPicker.tsx";

interface QuickMixAppProps {
  onOpenAdvancedStudio: () => void;
}

function createInitialSectionDrafts(): { vocal: QuickMixSectionDraft; instrumental: QuickMixSectionDraft } {
  return {
    vocal: createDefaultQuickMixSectionDraft(),
    instrumental: createDefaultQuickMixSectionDraft(),
  };
}

export function QuickMixApp({ onOpenAdvancedStudio }: QuickMixAppProps) {
  const [uploads, setUploads] = useState<QuickMixUploadState>(createInitialQuickMixUploadState);
  const [uploadErrors, setUploadErrors] = useState<{ vocal: string | null; instrumental: string | null }>({
    vocal: null,
    instrumental: null,
  });
  const [sectionDrafts, setSectionDrafts] = useState(createInitialSectionDrafts);
  const [useSameStart, setUseSameStart] = useState(false);
  const [sourceDurations, setSourceDurations] = useState<{ vocal: number | null; instrumental: number | null }>({
    vocal: null,
    instrumental: null,
  });
  const [mixing, setMixing] = useState(false);
  const { status } = useLocalEngineStatus(15000, !mixing);
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
  const sectionNeedsDuration =
    sectionDrafts.vocal.mode === "custom_start" ||
    (!useSameStart && sectionDrafts.instrumental.mode === "custom_start");
  const sectionDurationsReady =
    !sectionNeedsDuration ||
    (sourceDurations.vocal !== null &&
      (useSameStart || sourceDurations.instrumental !== null));
  const canMix =
    canStartQuickMix(uploads, readyToMix) && sectionDurationsReady && !mixing;

  function updateSectionDraft(slot: "vocal" | "instrumental", draft: QuickMixSectionDraft) {
    setSectionDrafts((current) => {
      const next = { ...current, [slot]: draft };
      if (useSameStart && slot === "vocal") {
        next.instrumental = { ...draft };
      }
      return next;
    });
    setOutput(null);
    setMixFailure(null);
  }

  async function assignFile(kind: "vocal" | "instrumental", file: File) {
    const validation = validateAudioFile(file);
    if (!validation.ok) {
      setUploadErrors((current) => ({
        ...current,
        [kind]: validation.message,
      }));
      return;
    }

    setUploadErrors((current) => ({ ...current, [kind]: null }));
    setOutput(null);
    setMixFailure(null);
    setUploads((current) =>
      kind === "vocal"
        ? { ...current, vocalFile: file, vocalFileName: file.name, vocalPreparing: false }
        : { ...current, instrumentalFile: file, instrumentalFileName: file.name, instrumentalPreparing: false }
    );

    const duration = await readLocalAudioDurationSeconds(file);
    setSourceDurations((current) => ({ ...current, [kind]: duration }));
  }

  function setFile(kind: "vocal" | "instrumental", file: File) {
    void assignFile(kind, file);
  }

  function clearFile(kind: "vocal" | "instrumental") {
    setUploads((current) =>
      kind === "vocal"
        ? { ...current, vocalFile: null, vocalFileName: null, vocalPreparing: false }
        : { ...current, instrumentalFile: null, instrumentalFileName: null, instrumentalPreparing: false }
    );
    setUploadErrors((current) => ({ ...current, [kind]: null }));
    setSourceDurations((current) => ({ ...current, [kind]: null }));
    setSectionDrafts((current) => ({
      ...current,
      [kind]: createDefaultQuickMixSectionDraft(),
    }));
    setOutput(null);
    setMixFailure(null);
  }

  function resolveSectionsForMix(): {
    ok: boolean;
    vocalSection: ReturnType<typeof resolveQuickMixSectionSelection>["selection"];
    instrumentalSection: ReturnType<typeof resolveQuickMixSectionSelection>["selection"];
    errors: { vocal: string | null; instrumental: string | null };
  } {
    const vocalResolved = resolveQuickMixSectionSelection(sectionDrafts.vocal);
    const instrumentalDraft = useSameStart ? sectionDrafts.vocal : sectionDrafts.instrumental;
    const instrumentalResolved = resolveQuickMixSectionSelection(instrumentalDraft);

    const errors = {
      vocal: vocalResolved.errors[0] ?? null,
      instrumental: useSameStart ? null : instrumentalResolved.errors[0] ?? null,
    };

    if (errors.vocal || errors.instrumental || !vocalResolved.selection || !instrumentalResolved.selection) {
      return { ok: false, vocalSection: null, instrumentalSection: null, errors };
    }

    const vocalDurationErrors = validateQuickMixSectionAgainstDuration(
      vocalResolved.selection,
      sourceDurations.vocal
    );
    const instrumentalDurationErrors = validateQuickMixSectionAgainstDuration(
      instrumentalResolved.selection,
      sourceDurations.instrumental
    );

    if (vocalDurationErrors.length > 0) {
      errors.vocal = vocalDurationErrors[0] ?? null;
    }
    if (!useSameStart && instrumentalDurationErrors.length > 0) {
      errors.instrumental = instrumentalDurationErrors[0] ?? null;
    }

    if (errors.vocal || errors.instrumental) {
      return { ok: false, vocalSection: null, instrumentalSection: null, errors };
    }

    return {
      ok: true,
      vocalSection: vocalResolved.selection,
      instrumentalSection: instrumentalResolved.selection,
      errors,
    };
  }

  async function handleMix() {
    if (!uploads.vocalFile || !uploads.instrumentalFile || !canMix) {
      return;
    }

    const sections = resolveSectionsForMix();
    if (!sections.ok || !sections.vocalSection || !sections.instrumentalSection) {
      setUploadErrors(sections.errors);
      return;
    }

    setMixing(true);
    setMixFailure(null);
    setOutput(null);
    setProgressSteps(createInitialQuickMixProgress());

    const result = await runQuickMixPipeline(
      {
        vocalFile: uploads.vocalFile,
        instrumentalFile: uploads.instrumentalFile,
        vocalSection: sections.vocalSection,
        instrumentalSection: sections.instrumentalSection,
        vocalDurationSeconds: sourceDurations.vocal,
        instrumentalDurationSeconds: sourceDurations.instrumental,
      },
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
    setSectionDrafts(createInitialSectionDrafts());
    setUseSameStart(false);
    setSourceDurations({ vocal: null, instrumental: null });
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
              <div className="quick-mix-source-column">
                <QuickMixDropCard
                  error={uploadErrors.vocal}
                  fileName={uploads.vocalFileName}
                  hint={QUICK_MIX_VOCAL_DROP_HINT}
                  kind="vocal"
                  onClear={() => clearFile("vocal")}
                  onFileSelected={(file) => setFile("vocal", file)}
                  preparing={false}
                  preparingLabel=""
                  title={QUICK_MIX_VOCAL_DROP_LABEL}
                />
                {uploads.vocalFile ? (
                  <QuickMixSectionPicker
                    disabled={mixing}
                    draft={sectionDrafts.vocal}
                    onChange={(draft) => updateSectionDraft("vocal", draft)}
                    slot="vocal"
                  />
                ) : null}
              </div>
              <div className="quick-mix-source-column">
                <QuickMixDropCard
                  error={uploadErrors.instrumental}
                  fileName={uploads.instrumentalFileName}
                  hint={QUICK_MIX_BEAT_DROP_HINT}
                  kind="instrumental"
                  onClear={() => clearFile("instrumental")}
                  onFileSelected={(file) => setFile("instrumental", file)}
                  preparing={false}
                  preparingLabel=""
                  title={QUICK_MIX_BEAT_DROP_LABEL}
                />
                {uploads.instrumentalFile && !useSameStart ? (
                  <QuickMixSectionPicker
                    disabled={mixing}
                    draft={sectionDrafts.instrumental}
                    onChange={(draft) => updateSectionDraft("instrumental", draft)}
                    slot="instrumental"
                  />
                ) : null}
              </div>
            </div>

            {uploads.vocalFile && uploads.instrumentalFile ? (
              <label className="quick-mix-same-start-toggle">
                <input
                  checked={useSameStart}
                  disabled={mixing}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setUseSameStart(enabled);
                    if (enabled) {
                      setSectionDrafts((current) => ({
                        ...current,
                        instrumental: { ...current.vocal },
                      }));
                    }
                    setOutput(null);
                    setMixFailure(null);
                  }}
                  type="checkbox"
                />
                {QUICK_MIX_SAME_START_TOGGLE_LABEL}
              </label>
            ) : null}

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

            {mixing ? (
              <p className="quick-mix-processing-patience" role="status">
                {QUICK_MIX_PROCESSING_PATIENCE_NOTICE}
              </p>
            ) : null}

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
