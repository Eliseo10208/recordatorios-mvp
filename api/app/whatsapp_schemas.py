"""Public WhatsApp destination request and response types."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

CONSENT_TEXT = (
    "Acepto recibir por WhatsApp recordatorios de esta aplicación en el número "
    "indicado. Puedo desactivarlos cuando quiera."
)
CONSENT_VERSION = "v1"


class DestinationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    phone: str
    consent: Literal[True]


class DestinationPublic(BaseModel):
    available: bool
    active: bool
    masked_number: str | None
    opted_in_at: datetime | None
    consent_text_version: str | None
    consent_text: str
