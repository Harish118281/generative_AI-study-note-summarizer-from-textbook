from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class SignUpRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class CurrentUserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    created_at: datetime
    custom_instructions: str | None = None

    model_config = {"from_attributes": True}


class CustomInstructionsRequest(BaseModel):
    custom_instructions: str = Field(max_length=4000)
