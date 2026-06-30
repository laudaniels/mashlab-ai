export const COMBINED_PREVIEW_DURATION_OPTIONS = [15, 30, 60] as const;
export const COMBINED_PREVIEW_DEFAULT_SECONDS = 30;
export const COMBINED_PREVIEW_MAX_SECONDS = 60;

export type CombinedPreviewDurationOption = (typeof COMBINED_PREVIEW_DURATION_OPTIONS)[number];
