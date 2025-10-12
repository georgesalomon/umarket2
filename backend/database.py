# supabase REST helpers: CRUD for items/orders via PostgREST; requires SUPABASE_URL and SUPABASE_API_KEY env vars (use a service role key in production)

from __future__ import annotations

import os
import requests
from typing import Any, Dict, List, Optional

SUPABASE_URL: Optional[str] = os.environ.get("SUPABASE_URL")


SUPABASE_API_KEY: Optional[str] = os.environ.get("SUPABASE_API_KEY")


def _ensure_config():
# make sure SUPABASE_URL and SUPABASE_API_KEY are set and raise RuntimeError if missing.
    if not SUPABASE_URL or not SUPABASE_API_KEY:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_API_KEY environment variables must be set"
        )


def _headers() -> Dict[str, str]:
    #construct headers for supabase REST requests

    return {
        "apikey": SUPABASE_API_KEY or "",
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def get_listings() -> List[Dict[str, Any]]:
    #return a list of all listings from the 'listing's table

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/listings"
    resp = requests.get(url, headers=_headers(), params={"select": "*"})
    resp.raise_for_status()
    return resp.json()


def get_listing(listing_id: int) -> Optional[Dict[str, Any]]:
    # return a single listing by its id or none if it is not found

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/listings"
    params = {"id": f"eq.{listing_id}", "select": "*"}
    resp = requests.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    listings = resp.json()
    return listings[0] if listings else None


def create_listing(listing_data: Dict[str, Any]) -> Dict[str, Any]:
    # insert a new listing and return the created record (expects seller_id, title, description, price_cents, category_id, status)
    
    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/listings"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    resp = requests.post(url, headers=headers, json=listing_data)
    resp.raise_for_status()
    return resp.json()[0]


def update_listing(listing_id: int, listing_data: Dict[str, Any]) -> Dict[str, Any]:
    # update an existing listing and return the updated record

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/listings"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    resp = requests.patch(
        url,
        headers=headers,
        params={"id": f"eq.{listing_id}"},
        json=listing_data,
    )
    resp.raise_for_status()
    return resp.json()[0]


def delete_listing(listing_id: int) -> bool:
    #delete a listing, and returns True on success

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/listings"
    resp = requests.delete(url, headers=_headers(), params={"id": f"eq.{listing_id}"})
    resp.raise_for_status()
    return True


def get_orders(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    # return orders, if user_id is provided, filter to orders where the user is the buyer

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/orders"
    params = {"select": "*"}
    if user_id:
        params["buyer_id"] = f"eq.{user_id}"
    resp = requests.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    return resp.json()


def create_order(order_data: Dict[str, Any]) -> Dict[str, Any]:
    # insert a new order and return the created record
    # the payload should be "listing_id", "buyer_id", "amount_cents"
    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/orders"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    resp = requests.post(url, headers=headers, json=order_data)
    resp.raise_for_status()
    return resp.json()[0]


def update_order(order_id: int, order_data: Dict[str, Any]) -> Dict[str, Any]:
    #update an order and return the updated record
    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/orders"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    resp = requests.patch(
        url,
        headers=headers,
        params={"id": f"eq.{order_id}"},
        json=order_data,
    )
    resp.raise_for_status()
    return resp.json()[0]
