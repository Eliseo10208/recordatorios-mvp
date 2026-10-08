"""Civil time edge cases mandated by the product specification."""

from datetime import UTC, date, datetime, time

import pytest

from app.auth_service import AuthProblem
from app.reminder_time import resolve_schedule


def test_spring_gap_uses_first_valid_instant() -> None:
    result = resolve_schedule(date(2025, 3, 9), time(2, 30), "America/New_York")
    assert result == (
        datetime(2025, 3, 9, 7, tzinfo=UTC),
        "2025-03-09",
        "03:00",
        "gap_forward",
    )


def test_fall_overlap_uses_second_occurrence() -> None:
    result = resolve_schedule(date(2025, 11, 2), time(1, 30), "America/New_York")
    assert result == (
        datetime(2025, 11, 2, 6, 30, tzinfo=UTC),
        "2025-11-02",
        "01:30",
        "overlap_later",
    )


def test_invalid_zone_rejected() -> None:
    with pytest.raises(AuthProblem) as error:
        resolve_schedule(date(2026, 12, 1), time(9), "Not/A_Zone")
    assert error.value.status == 422
