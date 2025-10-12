from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ListingBase(BaseModel):
    # base attributes for listing creation/update,d price is in dollars (converted to cents), category_id optional.

    title: str = Field(..., example="Microwave")
    description: str = Field(..., example="Lightly used microwave, works great.")
    price: float = Field(..., example=25.0, gt=0, description="Price in dollars")
    category_id: Optional[int] = Field(None, example=1, description="ID of the category")


class ListingCreate(ListingBase):
    # payload is required to create a new lsiting
    pass


class Listing(ListingBase):
    #full representation of a listing with including server generated fields

    id: int
    seller_id: str
    price_cents: int = Field(..., example=2500, description="Price in cents")
    status: str = Field("available", example="available")
    created_at: datetime

    class Config:
        orm_mode = True


class OrderCreate(BaseModel):
    #payload required to create a new purchase reques

    listing_id: int = Field(..., example=1)


class Order(BaseModel):
    # full representation for an order

    id: int
    listing_id: int
    buyer_id: str
    amount_cents: int
    status: str = Field(..., example="pending")
    stripe_pi: Optional[str] = Field(None, example="pi_123", description="Stripe payment intent identifier")
    created_at: datetime

    class Config:
        orm_mode = True
