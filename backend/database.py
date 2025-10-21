# supabase REST helpers: CRUD for items/orders via PostgREST, requires SUPABASE_URL and SUPABASE_API_KEY env vars (use a service role key in production)

from __future__ import annotations

import os
import requests
from typing import Any, Dict, List, Optional

SUPABASE_URL: Optional[str] = os.environ.get("SUPABASE_URL")
SUPABASE_API_KEY: Optional[str] = os.environ.get("SUPABASE_API_KEY")
PRODUCTS_TABLE: str = os.environ.get("SUPABASE_PRODUCTS_TABLE", "Product")
PRODUCT_ID_FIELD: str = os.environ.get("SUPABASE_PRODUCT_ID_FIELD", "prod_id")
TRANSACTIONS_TABLE: str = os.environ.get("SUPABASE_TRANSACTIONS_TABLE", "Transactions")
TRANSACTION_ID_FIELD: str = os.environ.get("SUPABASE_TRANSACTION_ID_FIELD", "id")


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


def _normalize_product(record: Dict[str, Any]) -> Dict[str, Any]:
    if not record:
        return record
    normalized = dict(record)
    product_id = normalized.get(PRODUCT_ID_FIELD) or normalized.get("id")
    if product_id:
        normalized["id"] = product_id
    price = normalized.get("price")
    if isinstance(price, str):
        try:
            normalized["price"] = float(price)
        except ValueError:
            pass
    quantity = normalized.get("quantity")
    if isinstance(quantity, str):
        try:
            normalized["quantity"] = int(quantity)
        except ValueError:
            pass
    category = normalized.get("category")
    if not category:
        normalized["category"] = "miscellaneous"
    elif isinstance(category, str):
        normalized["category"] = category
    else:
        normalized["category"] = str(category)
    return normalized


def _normalize_order(record: Dict[str, Any]) -> Dict[str, Any]:
    if not record:
        return record
    normalized = dict(record)
    order_id = normalized.get(TRANSACTION_ID_FIELD) or normalized.get("id")
    if order_id:
        normalized["id"] = order_id
    product = normalized.get("product")
    if product:
        product_normalized = _normalize_product(product)
        normalized["product"] = product_normalized
        if "seller_id" in product_normalized and not normalized.get("seller_id"):
            normalized["seller_id"] = product_normalized["seller_id"]
    prod_id = normalized.get("prod_id")
    if prod_id:
        normalized["listing_id"] = prod_id
    return normalized


def get_listings(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    #return a list of all products

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{PRODUCTS_TABLE}"
    params: Dict[str, Any] = {"select": "*"}
    if filters:
        for key, value in filters.items():
            if value is None:
                continue
            if isinstance(value, bool):
                params[key] = f"eq.{str(value).lower()}"
            else:
                params[key] = f"eq.{value}"
    resp = requests.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    data = resp.json()
    return [_normalize_product(product) for product in data]


def get_listing(listing_id: str) -> Optional[Dict[str, Any]]:
    # return a single product by its id or none if it is not found

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{PRODUCTS_TABLE}"
    params = {PRODUCT_ID_FIELD: f"eq.{listing_id}", "select": "*"}
    resp = requests.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    products = resp.json()
    return _normalize_product(products[0]) if products else None


def create_listing(listing_data: Dict[str, Any]) -> Dict[str, Any]:
    # insert a new product and return the created record

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{PRODUCTS_TABLE}"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    resp = requests.post(url, headers=headers, json=listing_data)
    if not resp.ok:
        print("SUPABASE INSERT ERROR:", resp.status_code, resp.text)
        resp.raise_for_status()
    created = resp.json()
    return _normalize_product(created[0])


def update_listing(listing_id: str, listing_data: Dict[str, Any]) -> Dict[str, Any]:
    # update an existing product and return the updated record

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{PRODUCTS_TABLE}"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    resp = requests.patch(
        url,
        headers=headers,
        params={PRODUCT_ID_FIELD: f"eq.{listing_id}"},
        json=listing_data,
    )
    resp.raise_for_status()
    updated = resp.json()
    return _normalize_product(updated[0])


def delete_listing(listing_id: str) -> bool:
    #delete a listing, and returns True on success

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{PRODUCTS_TABLE}"
    resp = requests.delete(
        url, headers=_headers(), params={PRODUCT_ID_FIELD: f"eq.{listing_id}"}
    )
    resp.raise_for_status()
    return True


def get_orders(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    # return transactions for products

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{TRANSACTIONS_TABLE}"
    params: Dict[str, Any] = {"select": f"*,product:{PRODUCT_ID_FIELD}(*)"}
    if filters:
        for key, value in filters.items():
            if value is None:
                continue
            if isinstance(value, bool):
                params[key] = f"eq.{str(value).lower()}"
            else:
                params[key] = f"eq.{value}"
    resp = requests.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    data = resp.json()
    return [_normalize_order(order) for order in data]


def create_order(order_data: Dict[str, Any]) -> Dict[str, Any]:
    # insert a new transaction and return the created record
    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{TRANSACTIONS_TABLE}"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    params = {"select": f"*,product:{PRODUCT_ID_FIELD}(*)"}
    resp = requests.post(url, headers=headers, params=params, json=order_data)
    resp.raise_for_status()
    created = resp.json()
    return _normalize_order(created[0])


def get_order(order_id: str) -> Optional[Dict[str, Any]]:
    # return a single transaction by its id or None if it is not found
    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{TRANSACTIONS_TABLE}"
    params = {
        TRANSACTION_ID_FIELD: f"eq.{order_id}",
        "select": f"*,product:{PRODUCT_ID_FIELD}(*)",
    }
    resp = requests.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    orders = resp.json()
    return _normalize_order(orders[0]) if orders else None


def update_order(order_id: str, order_data: Dict[str, Any]) -> Dict[str, Any]:
    #update a transaction and return the updated record
    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{TRANSACTIONS_TABLE}"
    headers = _headers()
    headers["Prefer"] = "return=representation"
    params = {
        TRANSACTION_ID_FIELD: f"eq.{order_id}",
        "select": f"*,product:{PRODUCT_ID_FIELD}(*)",
    }
    resp = requests.patch(
        url,
        headers=headers,
        params=params,
        json=order_data,
    )
    resp.raise_for_status()
    updated = resp.json()
    return _normalize_order(updated[0])
