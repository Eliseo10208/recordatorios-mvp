"""Resolve a user's wall time to one unambiguous UTC instant."""

from __future__ import annotations

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.auth_service import AuthProblem
from app.reminder_schemas import Resolution


def resolve_schedule(
    day: date, clock: time, zone_name: str
) -> tuple[datetime, str, str, Resolution]:
    try:
        zone = ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise AuthProblem(422, "Invalid timezone") from exc
    local = datetime.combine(day, clock)
    candidates = [
        local.replace(tzinfo=zone, fold=fold).astimezone(UTC) for fold in (0, 1)
    ]
    valid = [
        value
        for value in candidates
        if value.astimezone(zone).replace(tzinfo=None) == local
    ]
    if valid:
        chosen = max(valid)
        resolution: Resolution = "overlap_later" if len(set(valid)) > 1 else "exact"
    else:
        # A forward transition creates a gap. Find its first valid UTC second.
        lower, upper = sorted(int(value.timestamp()) for value in candidates)
        while upper - lower > 1:
            middle = (lower + upper) // 2
            observed = (
                datetime.fromtimestamp(middle, UTC)
                .astimezone(zone)
                .replace(tzinfo=None)
            )
            if observed >= local:
                upper = middle
            else:
                lower = middle
        chosen = datetime.fromtimestamp(upper, UTC)
        resolution = "gap_forward"
    effective = chosen.astimezone(zone)
    return chosen, effective.date().isoformat(), effective.strftime("%H:%M"), resolution
