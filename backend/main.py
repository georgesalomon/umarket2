#fast api for umarktet backend

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import re
from difflib import SequenceMatcher

from fastapi import Body, Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from fastapi.middleware.cors import CORSMiddleware

import database, schemas

MAX_REPORT_EVIDENCE = 5

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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_note(note: Optional[str]) -> Optional[str]:
    if note is None:
        return None
    text = note.strip()
    return text or None


def _order_or_404(order_id: str) -> Dict[str, Any]:
    order = database.get_order(order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


def _report_or_404(report_id: str) -> Dict[str, Any]:
    report = database.get_report(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return report


def _clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _sanitize_evidence_urls(
    values: Optional[List[str]], max_items: int = MAX_REPORT_EVIDENCE
) -> List[str]:
    if not values:
        return []
    cleaned: List[str] = []
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            cleaned.append(text)
        if len(cleaned) >= max_items:
            break
    if len(cleaned) > max_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You can attach at most {max_items} evidence items",
        )
    return cleaned


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

    user_id = payload.get("sub") or payload.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject")
    return user_id


@app.get("/listings", response_model=List[schemas.Listing])
def list_listings(
    seller_id: Optional[str] = None,
    sold: Optional[bool] = None,
    search: Optional[str] = None,
) -> List[schemas.Listing]:
    # return all listings, optional filtering by seller or sold flag

    filters: Dict[str, Any] = {}
    if seller_id:
        filters["seller_id"] = seller_id
    if sold is not None:
        filters["sold"] = sold
    listings = database.get_listings(filters if filters else None)
    if not search:
        return listings

    term = search.strip().lower()
    if not term:
        return listings

    def _tokenize(value: str) -> List[str]:
        return re.findall(r"[a-z0-9]+", value.lower())

    def _score_listing(item: Dict[str, Any]) -> float:
        fields = [
            str(item.get("name", "")),
            str(item.get("category", "")),
            str(item.get("description", "")),
        ]
        scores = []
        for field in fields:
            if not field:
                continue
            field_lower = field.lower()
            if term in field_lower:
                scores.append(1.0)
                continue
            scores.append(SequenceMatcher(None, term, field_lower).ratio())
            tokens = _tokenize(field)
            for token in tokens:
                if term in token:
                    scores.append(0.95)
                else:
                    scores.append(SequenceMatcher(None, term, token).ratio())
        return max(scores) if scores else 0.0

    scored = []
    for listing in listings:
        score = _score_listing(listing)
        if score >= 0.35:
            scored.append((score, listing))

    if not scored:
        return listings

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _, item in scored]


@app.post("/listings", response_model=schemas.Listing, status_code=status.HTTP_201_CREATED)
def create_listing(listing: schemas.ListingCreate, user_id: str = Depends(get_current_user_id)):
    #create a new listing owned by the authenticaed user

    data = listing.dict(exclude_unset=True)
    details_payload = data.pop("details", None)
    description = data.get("description")
    if isinstance(description, str):
        description = description.strip()
        if description == "":
            description = None
    listing_data = {
        "seller_id": user_id,
        "name": data["name"],
        "description": description,
        "price": data["price"],
        "quantity": data.get("quantity", 1),
        "sold": False,
        "category": data["category"],
    }
    created = database.create_listing(listing_data, details=details_payload)
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
    # update a listing, only the owner should be allowed to edit

    existing = database.get_listing(listing_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if existing.get("seller_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to edit this listing",
        )

    data = listing.dict(exclude_unset=True)
    details_payload = data.pop("details", None)
    existing_details = existing.get("details")
    final_category = data.get("category") or existing.get("category")
    details_changed = (
        details_payload is not None and details_payload != (existing_details or None)
    )
    if details_payload is None and final_category == existing.get("category"):
        details_to_persist = existing_details
    else:
        details_to_persist = details_payload
    update_data: Dict[str, Any] = {}
    if data.get("name") is not None:
        update_data["name"] = data["name"]
    if "description" in data:
        description_value = data["description"]
        if isinstance(description_value, str):
            description_value = description_value.strip()
            if description_value == "":
                description_value = None
        update_data["description"] = description_value
    if data.get("price") is not None:
        update_data["price"] = data["price"]
    if data.get("quantity") is not None:
        update_data["quantity"] = data["quantity"]
    if data.get("sold") is not None:
        update_data["sold"] = data["sold"]
    if data.get("category") is not None:
        update_data["category"] = data["category"]
    if not update_data and not details_changed:
        return existing
    if isinstance(details_to_persist, dict):
        details_to_persist = dict(details_to_persist)
    updated = database.update_listing(
        listing_id,
        update_data,
        category=update_data.get("category"),
        details=details_to_persist,
    )
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
        order_payload["payment_method"] = order.payment_method.upper()

    # make sure transactions capture when they were placed so the dashboard can show the ordered timestamp
    order_payload.setdefault("created_at", _now_iso())

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
        database.update_listing(
            order.listing_id,
            update_fields,
            details=listing.get("details"),
        )

    return created


@app.patch("/orders/{order_id}", response_model=schemas.Order)
def update_order(
    order_id: str,
    payload: schemas.OrderUpdate,
    user_id: str = Depends(get_current_user_id),
):
    order = _order_or_404(order_id)
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


@app.post("/orders/{order_id}/confirm-item", response_model=schemas.Order)
def confirm_item_received(
    order_id: str,
    payload: schemas.OrderConfirmation = Body(default_factory=schemas.OrderConfirmation),
    user_id: str = Depends(get_current_user_id),
):
    order = _order_or_404(order_id)
    if order.get("buyer_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the buyer can confirm receiving the item",
        )
    if order.get("buyer_confirmed"):
        return order
    update_fields: Dict[str, Any] = {
        "buyer_confirmed": True,
        "buyer_confirmed_at": _now_iso(),
    }
    note = _normalize_note(payload.notes) if payload else None
    if note is not None:
        update_fields["buyer_confirmation_notes"] = note
    updated = database.update_order(order_id, update_fields)
    return updated


@app.post("/orders/{order_id}/confirm-payment", response_model=schemas.Order)
def confirm_payment_received(
    order_id: str,
    payload: schemas.OrderConfirmation = Body(default_factory=schemas.OrderConfirmation),
    user_id: str = Depends(get_current_user_id),
):
    order = _order_or_404(order_id)
    seller_id = order.get("seller_id") or order.get("product", {}).get("seller_id")
    if seller_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the seller can confirm receiving payment",
        )
    if order.get("seller_confirmed"):
        return order
    update_fields: Dict[str, Any] = {
        "seller_confirmed": True,
        "seller_confirmed_at": _now_iso(),
    }
    note = _normalize_note(payload.notes) if payload else None
    if note is not None:
        update_fields["seller_confirmation_notes"] = note
    updated = database.update_order(order_id, update_fields)
    return updated


@app.get("/reports", response_model=schemas.MyReports)
def list_my_reports(user_id: str = Depends(get_current_user_id)):
    filed = database.get_reports({"reporter_id": user_id})
    against = database.get_reports({"reported_user_id": user_id})
    return {"filed": filed, "against": against}


@app.post("/reports", response_model=schemas.Report, status_code=status.HTTP_201_CREATED)
def create_report(
    report: schemas.ReportCreate,
    user_id: str = Depends(get_current_user_id),
):
    if report.reported_user_id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot report yourself",
        )
    target_profile = database.get_user_profile(report.reported_user_id)
    if not target_profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reported user not found")
    report_data = report.dict()
    report_data["reporter_id"] = user_id
    report_data["description"] = report.description.strip()
    report_data["evidence_urls"] = _sanitize_evidence_urls(report.evidence_urls)
    report_data["updated_at"] = _now_iso()
    if report.transaction_id:
        order = _order_or_404(report.transaction_id)
        seller_id = order.get("seller_id") or order.get("product", {}).get("seller_id")
        buyer_id = order.get("buyer_id")
        participants = {buyer_id, seller_id}
        if user_id not in participants:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not part of this transaction",
            )
        counterpart = buyer_id if user_id == seller_id else seller_id
        if counterpart and counterpart != report.reported_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reported user must be part of the provided transaction",
            )
    created = database.create_report(report_data)
    return created


@app.patch("/reports/{report_id}", response_model=schemas.Report)
def update_report(
    report_id: str,
    payload: schemas.ReportUpdate,
    user_id: str = Depends(get_current_user_id),
):
    existing = _report_or_404(report_id)
    if existing.get("reporter_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update this report",
        )
    if existing.get("status") not in {"OPEN", "UNDER_REVIEW"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Closed reports cannot be updated",
        )
    update_fields: Dict[str, Any] = {}
    if payload.description is not None:
        text = _clean_text(payload.description)
        if not text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Description cannot be empty",
            )
        update_fields["description"] = text
    if payload.evidence_urls is not None:
        update_fields["evidence_urls"] = _sanitize_evidence_urls(payload.evidence_urls)
    if payload.status is not None or payload.resolution_notes is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only moderators can update status or resolution notes",
        )
    if not update_fields:
        return existing
    update_fields["updated_at"] = _now_iso()
    updated = database.update_report(report_id, update_fields)
    return updated


@app.get("/users/{user_id}", response_model=schemas.UserProfile)
def retrieve_user_profile(user_id: str):
    profile = database.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return profile
