from datetime import datetime
from typing import Optional, Literal

from pydantic import BaseModel, Field

CategorySlug = Literal["decor", "clothing", "school-supplies", "tickets", "miscellaneous"]


class ListingBase(BaseModel):
    # base attributes for product creation/update

    name: str = Field(..., example="Microwave")
    price: float = Field(..., example=25.0, gt=0, description="Price in dollars")
    quantity: int = Field(1, ge=0, description="Quantity available")
    category: CategorySlug = Field(
        ...,
        description="Category slug used for homepage grouping",
        example="decor",
    )


class ListingCreate(ListingBase):
    # payload is required to create a new product listing
    pass


class ListingUpdate(BaseModel):
    # partial update payload for product listings

    name: Optional[str] = Field(None, example="Microwave")
    price: Optional[float] = Field(None, gt=0, description="Price in dollars")
    quantity: Optional[int] = Field(None, ge=0, description="Quantity available")
    sold: Optional[bool] = Field(None, description="Whether the item is sold")
    category: Optional[CategorySlug] = Field(
        None,
        description="Category slug used for homepage grouping",
        example="decor",
    )


class Listing(ListingBase):
    # full representation of a product listing including server-managed fields

    id: str
    seller_id: str
    sold: bool = Field(False, description="Whether the item has been sold")
    created_at: datetime

    class Config:
        orm_mode = True


class OrderCreate(BaseModel):
    # payload required to create a new transaction

    listing_id: str = Field(..., example="6c73f63a-4f0f-4a84-9620-3aafc4a5d1b5")
    payment_method: Optional[str] = Field(None, example="cash")


class Order(BaseModel):
    # full representation for a transaction

    id: str
    listing_id: str
    buyer_id: str
    seller_id: Optional[str] = Field(None, description="Seller for the associated product")
    payment_method: Optional[str] = Field(None, example="cash")
    created_at: Optional[datetime] = None
    product: Optional[Listing] = None

    class Config:
        orm_mode = True


class OrderUpdate(BaseModel):
    payment_method: Optional[str] = Field(None, example="cash")
