"""Public auth request and response contracts."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def trim_email(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class UserPublic(BaseModel):
    id: UUID
    email: str
    email_verified: bool


class TokenPair(BaseModel):
    user: UserPublic
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = 900


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=256)


class AccountTokenRequest(BaseModel):
    token: str = Field(min_length=40, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(AccountTokenRequest):
    new_password: str = Field(min_length=12, max_length=128)


class Problem(BaseModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str
    traceId: str
