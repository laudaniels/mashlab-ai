import {
  ARRANGEMENT_STYLE_OPTIONS,
  type ArrangementStyle,
} from "../../domain/arrangementBrain.ts";

interface QuickMixStylePickerProps {
  value: ArrangementStyle;
  onChange: (style: ArrangementStyle) => void;
  disabled?: boolean;
}

export function QuickMixStylePicker({ value, onChange, disabled = false }: QuickMixStylePickerProps) {
  return (
    <fieldset className="quick-mix-style-picker" disabled={disabled}>
      <legend>Style</legend>
      <div className="quick-mix-style-options">
        {ARRANGEMENT_STYLE_OPTIONS.map((option) => (
          <label key={option.id} className="quick-mix-style-option">
            <input
              checked={value === option.id}
              name="quick-mix-style"
              onChange={() => onChange(option.id)}
              type="radio"
              value={option.id}
            />
            <span className="quick-mix-style-option-label">{option.label}</span>
            <span className="quick-mix-style-option-desc">{option.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
