import type { QuickMixUploadSlot } from "../../domain/quickMix.ts";
import {
  createDefaultQuickMixSectionDraft,
  QUICK_MIX_SECTION_CUSTOM_START_LABEL,
  QUICK_MIX_SECTION_FIRST_180_LABEL,
  QUICK_MIX_SECTION_LABEL,
  QUICK_MIX_SECTION_WINDOW_NOTICE,
  type QuickMixSectionDraft,
} from "../../domain/quickMixSection.ts";

interface QuickMixSectionPickerProps {
  slot: QuickMixUploadSlot;
  draft: QuickMixSectionDraft;
  disabled: boolean;
  onChange: (draft: QuickMixSectionDraft) => void;
}

export function QuickMixSectionPicker({ slot, draft, disabled, onChange }: QuickMixSectionPickerProps) {
  const inputId = `quick-mix-section-${slot}`;

  function updateDraft(partial: Partial<QuickMixSectionDraft>) {
    onChange({ ...draft, ...partial });
  }

  return (
    <fieldset className="quick-mix-section-picker" disabled={disabled}>
      <legend>{QUICK_MIX_SECTION_LABEL}</legend>
      <label className="quick-mix-section-option">
        <input
          checked={draft.mode === "first_180"}
          name={`${inputId}-mode`}
          onChange={() => onChange(createDefaultQuickMixSectionDraft())}
          type="radio"
        />
        {QUICK_MIX_SECTION_FIRST_180_LABEL}
      </label>
      <label className="quick-mix-section-option">
        <input
          checked={draft.mode === "custom_start"}
          name={`${inputId}-mode`}
          onChange={() =>
            updateDraft({
              mode: "custom_start",
              customMinutes: "0",
              customSeconds: "0",
            })
          }
          type="radio"
        />
        {QUICK_MIX_SECTION_CUSTOM_START_LABEL}
      </label>
      {draft.mode === "custom_start" ? (
        <div className="quick-mix-section-custom">
          <label>
            Minutes
            <input
              inputMode="numeric"
              min={0}
              onChange={(event) => updateDraft({ customMinutes: event.target.value })}
              type="number"
              value={draft.customMinutes}
            />
          </label>
          <label>
            Seconds
            <input
              inputMode="numeric"
              max={59}
              min={0}
              onChange={(event) => updateDraft({ customSeconds: event.target.value })}
              type="number"
              value={draft.customSeconds}
            />
          </label>
          <p className="quick-mix-section-window-note">{QUICK_MIX_SECTION_WINDOW_NOTICE}</p>
        </div>
      ) : null}
    </fieldset>
  );
}
