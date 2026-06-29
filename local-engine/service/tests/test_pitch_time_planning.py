import unittest

from capabilities import detect_capabilities, get_capability
from pitch_time_planning import (
    PitchTimePlanRequest,
    TrackPlanInput,
    build_pitch_time_plan,
    build_safe_range_warning,
    compute_tempo_stretch_percent,
    compute_tempo_stretch_ratio,
    resolve_tempo_direction,
)


class PitchTimePlanningTests(unittest.TestCase):
    def test_tempo_stretch_ratio_and_direction(self) -> None:
        ratio = compute_tempo_stretch_ratio(120, 128)
        self.assertEqual(ratio, 1.067)
        self.assertEqual(compute_tempo_stretch_percent(ratio), 6.7)
        self.assertEqual(resolve_tempo_direction(ratio), "speed_up")

        slow_ratio = compute_tempo_stretch_ratio(128, 120)
        self.assertEqual(resolve_tempo_direction(slow_ratio), "slow_down")

    def test_safe_range_warning_thresholds(self) -> None:
        self.assertIsNone(build_safe_range_warning(3))
        self.assertIn("comfort zone", build_safe_range_warning(5) or "")
        self.assertIn("vocal-safe range", build_safe_range_warning(7) or "")

    def test_plan_is_planning_only(self) -> None:
        plan = build_pitch_time_plan(
            PitchTimePlanRequest(
                intent="vocal_a_over_beat_b",
                track_a=TrackPlanInput(label="Track A", bpm=120, key="A", mode="minor", camelot="8A"),
                track_b=TrackPlanInput(label="Track B", bpm=128, key="C", mode="major", camelot="8B"),
            )
        )
        self.assertFalse(plan.audio_processed)
        self.assertTrue(plan.dj_review_required)
        self.assertEqual(len(plan.directions), 1)
        self.assertIn("Planning only", plan.planning_only_notice)

    def test_compare_both_intent_returns_two_directions(self) -> None:
        plan = build_pitch_time_plan(
            PitchTimePlanRequest(
                intent="compare_both",
                track_a=TrackPlanInput(label="Track A", bpm=120, key="A", mode="minor", camelot="8A"),
                track_b=TrackPlanInput(label="Track B", bpm=128, key="C", mode="major", camelot="8B"),
            )
        )
        self.assertEqual(len(plan.directions), 2)


class RubberBandCapabilityTests(unittest.TestCase):
    def test_rubberband_capability_is_reported(self) -> None:
        capability = get_capability("rubberband")
        self.assertIsNotNone(capability)
        assert capability is not None
        self.assertIn(capability.status, {"available", "missing"})

    def test_detect_capabilities_includes_rubberband(self) -> None:
        capability_ids = {item.id for item in detect_capabilities()}
        self.assertIn("rubberband", capability_ids)


if __name__ == "__main__":
    unittest.main()
