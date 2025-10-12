#fast api for umarktet backend

from __future__ import annotations

from typing import List, Dict, Any

from fastapi import Depends, FastAPI, HTTPException, status

from . import database, schemas

app = FastAPI(title="UMarket API", version="0.1.0")


def get_current_user_id() -> str:
    # temporary stub: extract current user ID from supabase JWT (to be implemented)


    # TODO: Implement JWT validation and extraction of user_id
    return "stub-user-id"


@app.get("/listings", response_model=List[schemas.Listing])
def list_listings() -> List[schemas.Listing]:
    # return all listings, filtering (category/price/search) can be added later.

    listings = database.get_listings()
    return listings


@app.post("/listings", response_model=schemas.Listing, status_code=status.HTTP_201_CREATED)
def create_listing(listing: schemas.ListingCreate, user_id: str = Depends(get_current_user_id)):
    #create a new listing owned by the authenticaed user

    data = listing.dict()
    price_cents = int(data.pop("price") * 100)
    listing_data = {
        "seller_id": user_id,
        "title": data["title"],
        "description": data["description"],
        "price_cents": price_cents,
        # category_id can be None because supabase will accept null
        "category_id": data.get("category_id"),
        "status": "available",
    }
    created = database.create_listing(listing_data)
    return created


@app.get("/listings/{listing_id}", response_model=schemas.Listing)
def retrieve_listing(listing_id: int) -> schemas.Listing:
    #fetch a listing by ID
    listing = database.get_listing(listing_id)
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    return listing


@app.patch("/listings/{listing_id}", response_model=schemas.Listing)
def edit_listing(
    listing_id: int,
    listing: schemas.ListingCreate,
    user_id: str = Depends(get_current_user_id),
):
    # update a listing; only the owner should be allowed to edit (ownership check TODO).

    # TODO: Verify ownership before updating
    data = listing.dict()
    update_data: Dict[str, Any] = {}
    if "title" in data:
        update_data["title"] = data["title"]
    if "description" in data:
        update_data["description"] = data["description"]
    if "price" in data:
        update_data["price_cents"] = int(data["price"] * 100)
    if "category_id" in data:
        update_data["category_id"] = data["category_id"]
    updated = database.update_listing(listing_id, update_data)
    return updated


@app.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_listing(listing_id: int, user_id: str = Depends(get_current_user_id)):
    #delete a listing, only owner should be allowed to delete

    # TODO: verify ownership
    database.delete_listing(listing_id)
    return None


@app.get("/orders", response_model=List[schemas.Order])
def list_orders(user_id: str = Depends(get_current_user_id)) -> List[schemas.Order]:
    # return all orders for the current user as buyer
    orders = database.get_orders(user_id=user_id)
    return orders


@app.post("/orders", response_model=schemas.Order, status_code=status.HTTP_201_CREATED)
def create_order(order: schemas.OrderCreate, user_id: str = Depends(get_current_user_id)):
    #create a new buying requiest for a listing

    # retrieve the listing to determine the seller and price
    listing = database.get_listing(order.listing_id)
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    # dont allow users to buy their own listing
    if listing["seller_id"] == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot purchase your own listing",
        )
    order_data = {
        "listing_id": order.listing_id,
        "buyer_id": user_id,
        # use the listing price for the order amount
        "amount_cents": listing.get("price_cents"),
        "status": "pending",
    }
    created = database.create_order(order_data)
    return created


@app.patch("/orders/{order_id}", response_model=schemas.Order)
def update_order_status(order_id: int, status: str, user_id: str = Depends(get_current_user_id)):
    # Update order status, only the listing's seller can accept or decline an order.

    # fetch the order
    all_orders = database.get_orders()
    order = next((o for o in all_orders if o["id"] == order_id), None)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    # fetch the listing to determine the seller
    listing = database.get_listing(order["listing_id"])
    if not listing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated listing not found")
    if listing["seller_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update this order",
        )
    updated = database.update_order(order_id, {"status": status})
    return updated
