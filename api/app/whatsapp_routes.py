"""Authenticated destination settings endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.current_user import current_user
from app.db import User, get_db
from app.settings import Settings, get_settings
from app.whatsapp_schemas import DestinationInput, DestinationPublic
from app.whatsapp_settings_service import (
    destination,
    disable_destination,
    public_destination,
    save_destination,
)

router = APIRouter(prefix="/api/v1/notification-settings/whatsapp")
Db = Annotated[Session, Depends(get_db)]
Owner = Annotated[User, Depends(current_user)]
Config = Annotated[Settings, Depends(get_settings)]


@router.get("", response_model=DestinationPublic)
def get_destination(db: Db, user: Owner) -> DestinationPublic:
    return public_destination(destination(db, user.id))


@router.put("", response_model=DestinationPublic)
def put_destination(
    body: DestinationInput, db: Db, user: Owner, config: Config
) -> DestinationPublic:
    return save_destination(db, user, config, body)


@router.delete("", status_code=204)
def delete_destination(db: Db, user: Owner, config: Config) -> Response:
    disable_destination(db, user, config)
    return Response(status_code=204)
