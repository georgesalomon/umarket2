#fast api for umarktet backend

from __future__ import annotations

import os
from typing import List, Dict, Any, Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from fastapi.middleware.cors import CORSMiddleware

from . import database, schemas

app = FastAPI(title="UMarket API", version="0.1.0")

frontend_origin_env = os.getenv("FRONTEND_URLS") or os.getenv("FRONTEND_URL", "http://localhost:3000")
frontend_origins = [origin.strip() for origin in frontend_origin_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_http_bearer = HTTPBearer(auto_error=False)


def get_current_user_id(credential: HTTPAuthorizationCredentials = Depends(_http_bearer)) -> str:
    # validate the Supabase JWT sent via the Authorization header and return the user's UUID
    if credential is None or not credential.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = credential.credentials
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET environment variable must be set")

    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc

    user_id = payload.get("sub") or payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")
    return user_id


@app.get("/listings", response_model=List[schemas.Listing])
def list_listings(
    seller_id: Optional[str] = None,
    sold: Optional[bool] = None,
) -> List[schemas.Listing]:
    # return all listings, optional filtering by seller or sold flag

    filters: Dict[str, Any] = {}
    if seller_id:
        filters["seller_id"] = seller_id
    if sold is not None:
        filters["sold"] = sold
    listings = database.get_listings(filters if filters else None)
    return listings


@app.post("/listings", response_model=schemas.Listing, status_code=status.HTTP_201_CREATED)
def create_listing(listing: schemas.ListingCreate, user_id: str = Depends(get_current_user_id)):
    #create a new listing owned by the authenticaed user

    data = listing.dict(exclude_unset=True)
    listing_data = {
        "seller_id": user_id,
        "name": data["name"],
        "price": data["price"],
        "quantity": data.get("quantity", 1),
        "sold": False,
    }
    created = database.create_listing(listing_data)
    return created


@app.get("/listings/{listing_id}", response_model=schemas.Listing)
def retrieve_listing(listing_id: str) -> schemas.Listing:
    #fetch a listing by ID
    listing = database.get_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    return listing


@app.patch("/listings/{listing_id}", response_model=schemas.Listing)
def edit_listing(
    listing_id: str,
    listing: schemas.ListingUpdate,
    user_id: str = Depends(get_current_user_id),
):
    # update a listing; only the owner should be allowed to edit

    existing = database.get_listing(listing_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if existing.get("seller_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to edit this listing",
        )

    data = listing.dict(exclude_unset=True)
    update_data: Dict[str, Any] = {}
    if data.get("name") is not None:
        update_data["name"] = data["name"]
    if data.get("price") is not None:
        update_data["price"] = data["price"]
    if data.get("quantity") is not None:
        update_data["quantity"] = data["quantity"]
    if data.get("sold") is not None:
        update_data["sold"] = data["sold"]
    if not update_data:
        return existing
    updated = database.update_listing(listing_id, update_data)
    return updated


@app.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_listing(listing_id: str, user_id: str = Depends(get_current_user_id)):
    # delete a listing, only owner should be allowed to delete

    existing = database.get_listing(listing_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if existing.get("seller_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to delete this listing",
        )
    database.delete_listing(listing_id)
    return None


@app.get("/orders", response_model=List[schemas.Order])
def list_orders(
    role: str = "buyer",
    user_id: str = Depends(get_current_user_id),
) -> List[schemas.Order]:
    # return transactions for the current user as buyer or seller
    if role not in {"buyer", "seller"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="role must be 'buyer' or 'seller'",
        )
    filters: Dict[str, Any] = {}
    if role == "buyer":
        filters["buyer_id"] = user_id
    else:
        filters["product.seller_id"] = user_id
    orders = database.get_orders(filters)
    return orders


@app.post("/orders", response_model=schemas.Order, status_code=status.HTTP_201_CREATED)
def create_order(order: schemas.OrderCreate, user_id: str = Depends(get_current_user_id)):
    # create a new transaction for a product listing

    listing = database.get_listing(order.listing_id)
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if listing["seller_id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot purchase your own listing",
        )
    if listing.get("sold"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Listing has already been sold",
        )
    quantity = listing.get("quantity", 1)
    if isinstance(quantity, int) and quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Listing is out of stock",
        )

    order_payload: Dict[str, Any] = {
        "prod_id": order.listing_id,
        "buyer_id": user_id,
    }
    if order.payment_method:
        order_payload["payment_method"] = order.payment_method

    created = database.create_order(order_payload)

    update_fields: Dict[str, Any] = {}
    if isinstance(quantity, int):
        new_quantity = max(quantity - 1, 0)
        update_fields["quantity"] = new_quantity
        if new_quantity == 0:
            update_fields["sold"] = True
    else:
        update_fields["sold"] = True
    if update_fields:
        database.update_listing(order.listing_id, update_fields)

    return created


@app.patch("/orders/{order_id}", response_model=schemas.Order)
def update_order(
    order_id: str,
    payload: schemas.OrderUpdate,
    user_id: str = Depends(get_current_user_id),
):
    order = database.get_order(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    product = order.get("product")
    if not product:
        product = database.get_listing(order.get("listing_id"))
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated listing not found")
    if product.get("seller_id") != user_id and order.get("buyer_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update this order",
        )
    update_fields = payload.dict(exclude_unset=True)
    if not update_fields:
        return order
    updated = database.update_order(order_id, update_fields)
    return updated
