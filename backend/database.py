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
AVATAR_BUCKET: str = os.environ.get("SUPABASE_AVATAR_BUCKET", "avatars")
CLOTHING_TABLE: str = os.environ.get("SUPABASE_CLOTHING_TABLE", "Clothing")
CLOTHING_ID_FIELD: str = os.environ.get("SUPABASE_CLOTHING_ID_FIELD", "clothing_id")
DECOR_TABLE: str = os.environ.get("SUPABASE_DECOR_TABLE", "Decor")
DECOR_ID_FIELD: str = os.environ.get("SUPABASE_DECOR_ID_FIELD", "decor_id")
TICKETS_TABLE: str = os.environ.get("SUPABASE_TICKETS_TABLE", "Tickets")
TICKETS_ID_FIELD: str = os.environ.get("SUPABASE_TICKETS_ID_FIELD", "tickets_id")
MISC_TABLE: str = os.environ.get("SUPABASE_MISC_TABLE", "Miscellaneous")
MISC_ID_FIELD: str = os.environ.get("SUPABASE_MISC_ID_FIELD", "misc_id")


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


def _normalize_clothing_details(record: Dict[str, Any]) -> Dict[str, Any]:
    details = dict(record)
    used = details.get("used")
    if isinstance(used, str):
        details["used"] = used.lower() in {"true", "1"}
    elif used is None:
        details["used"] = False
    gender = details.get("gender")
    if isinstance(gender, str):
        details["gender"] = gender.upper()
    size = details.get("size")
    if isinstance(size, str):
        details["size"] = size.upper()
    clothing_type = details.get("type")
    if isinstance(clothing_type, str):
        details["type"] = clothing_type.upper()
    color = details.get("color")
    if isinstance(color, str):
        details["color"] = color.upper()
    details["category"] = "clothing"
    details.pop(CLOTHING_ID_FIELD, None)
    return details


def _normalize_decor_details(record: Dict[str, Any]) -> Dict[str, Any]:
    details = dict(record)
    used = details.get("used")
    if isinstance(used, str):
        details["used"] = used.lower() in {"true", "1"}
    elif used is None:
        details["used"] = False
    decor_type = details.get("type")
    if isinstance(decor_type, str):
        details["type"] = decor_type.upper()
    color = details.get("color")
    if isinstance(color, str):
        details["color"] = color.upper()
    for key in ("length", "width", "height"):
        value = details.get(key)
        if isinstance(value, str):
            try:
                details[key] = int(value)
            except ValueError:
                details[key] = None
    details["category"] = "decor"
    details.pop(DECOR_ID_FIELD, None)
    return details


def _normalize_ticket_details(record: Dict[str, Any]) -> Dict[str, Any]:
    details = dict(record)
    ticket_type = details.get("type")
    if isinstance(ticket_type, str):
        details["type"] = ticket_type.upper()
    details["category"] = "tickets"
    details.pop(TICKETS_ID_FIELD, None)
    return details


def _build_clothing_payload(listing_id: str, details: Dict[str, Any]) -> Dict[str, Any]:
    payload = {
        CLOTHING_ID_FIELD: listing_id,
        "gender": details.get("gender"),
        "size": details.get("size"),
        "type": details.get("type"),
        "color": details.get("color"),
        "used": bool(details.get("used", False)),
    }
    return payload


def _build_decor_payload(listing_id: str, details: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        DECOR_ID_FIELD: listing_id,
        "type": details.get("type"),
        "color": details.get("color"),
        "used": bool(details.get("used", False)),
    }
    for dimension in ("length", "width", "height"):
        value = details.get(dimension)
        if value is None or value == "":
            payload[dimension] = None
            continue
        try:
            payload[dimension] = int(value)
        except (TypeError, ValueError):
            payload[dimension] = None
    return payload


def _build_ticket_payload(listing_id: str, details: Dict[str, Any]) -> Dict[str, Any]:
    return {
        TICKETS_ID_FIELD: listing_id,
        "type": details.get("type"),
    }


_CATEGORY_DETAIL_CONFIG: Dict[str, Dict[str, Any]] = {
    "clothing": {
        "table": CLOTHING_TABLE,
        "id_field": CLOTHING_ID_FIELD,
        "normalizer": _normalize_clothing_details,
        "builder": _build_clothing_payload,
    },
    "decor": {
        "table": DECOR_TABLE,
        "id_field": DECOR_ID_FIELD,
        "normalizer": _normalize_decor_details,
        "builder": _build_decor_payload,
    },
    "tickets": {
        "table": TICKETS_TABLE,
        "id_field": TICKETS_ID_FIELD,
        "normalizer": _normalize_ticket_details,
        "builder": _build_ticket_payload,
    },
}


def _select_clause_with_details() -> str:
    relations = []
    for config in _CATEGORY_DETAIL_CONFIG.values():
        table = config.get("table")
        if not table:
            continue
        relations.append(f'{table}(*)')
    if not relations:
        return "*"
    return f"*,{','.join(relations)}"


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
    description = normalized.get("description")
    if description is None:
        normalized["description"] = None
    elif not isinstance(description, str):
        normalized["description"] = str(description)
    for config in _CATEGORY_DETAIL_CONFIG.values():
        table = config.get("table")
        if not table:
            continue
        raw_details = normalized.pop(table, None)
        if not raw_details:
            continue
        if isinstance(raw_details, list):
            raw_details = raw_details[0] if raw_details else None
        if not raw_details:
            continue
        normalized["details"] = config["normalizer"](raw_details)
        break
    return normalized


def _normalize_order(record: Dict[str, Any]) -> Dict[str, Any]:
    if not record:
        return record
    normalized = dict(record)
    order_id = (
        normalized.get(TRANSACTION_ID_FIELD)
        or normalized.get("id")
        or normalized.get("prod_id")
    )
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


def _upsert_category_detail(table: str, id_field: str, payload: Dict[str, Any]) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = _headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=representation"
    params = {"on_conflict": id_field}
    resp = requests.post(url, headers=headers, params=params, json=payload)
    if not resp.ok:
        print(f"SUPABASE UPSERT ERROR ({table}):", resp.status_code, resp.text)
        resp.raise_for_status()


def _delete_category_detail(table: str, id_field: str, listing_id: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.delete(url, headers=_headers(), params={id_field: f"eq.{listing_id}"})
    # 204 / 200 both acceptable, raise on actual error
    if resp.status_code not in (200, 204):
        resp.raise_for_status()


def _sync_category_details(
    listing_id: str, category: Optional[str], details: Optional[Dict[str, Any]]
) -> None:
    # make sure additional category tables stay in sync with the main Product row
    target_category = category or ""
    for slug, config in _CATEGORY_DETAIL_CONFIG.items():
        table = config.get("table")
        id_field = config.get("id_field")
        builder = config.get("builder")
        if not table or not id_field:
            continue
        if slug == target_category and details:
            payload = builder(listing_id, details)
            _upsert_category_detail(table, id_field, payload)
        else:
            _delete_category_detail(table, id_field, listing_id)


def _delete_all_category_details(listing_id: str) -> None:
    for config in _CATEGORY_DETAIL_CONFIG.values():
        table = config.get("table")
        id_field = config.get("id_field")
        if not table or not id_field:
            continue
        _delete_category_detail(table, id_field, listing_id)


def get_listings(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    #return a list of all products

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{PRODUCTS_TABLE}"
    params: Dict[str, Any] = {"select": _select_clause_with_details()}
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
    params = {
        PRODUCT_ID_FIELD: f"eq.{listing_id}",
        "select": _select_clause_with_details(),
    }
    resp = requests.get(url, headers=_headers(), params=params)
    resp.raise_for_status()
    products = resp.json()
    return _normalize_product(products[0]) if products else None


def create_listing(
    listing_data: Dict[str, Any],
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
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
    product = _normalize_product(created[0])
    listing_id = product.get("id")
    category = product.get("category")
    if listing_id and (details is not None or category in _CATEGORY_DETAIL_CONFIG):
        _sync_category_details(listing_id, category, details)
        refreshed = get_listing(listing_id)
        if refreshed:
            return refreshed
    return product


def update_listing(
    listing_id: str,
    listing_data: Dict[str, Any],
    category: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
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
    product = _normalize_product(updated[0])
    final_category = category or product.get("category")
    if details is not None or category is not None:
        _sync_category_details(listing_id, final_category, details)
    refreshed = get_listing(listing_id)
    return refreshed or product


def delete_listing(listing_id: str) -> bool:
    #delete a listing, and returns True on success

    _ensure_config()
    _delete_all_category_details(listing_id)
    url = f"{SUPABASE_URL}/rest/v1/{PRODUCTS_TABLE}"
    resp = requests.delete(
        url, headers=_headers(), params={PRODUCT_ID_FIELD: f"eq.{listing_id}"}
    )
    resp.raise_for_status()
    return True


def _public_storage_url(path: str) -> Optional[str]:
    if not path:
        return None
    if isinstance(path, str) and path.startswith(("http://", "https://")):
        return path
    normalized = path.lstrip("/")
    if not SUPABASE_URL:
        return None
    return f"{SUPABASE_URL}/storage/v1/object/public/{AVATAR_BUCKET}/{normalized}"


def get_user_profile(user_id: str) -> Optional[Dict[str, Any]]:
    # fetch a supabase user record including public metadata usable across the app

    _ensure_config()
    url = f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    resp = requests.get(url, headers=_headers())
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    metadata = data.get("user_metadata") or {}
    avatar_path = metadata.get("avatar_path")
    profile = {
        "id": data.get("id"),
        "email": data.get("email"),
        "full_name": metadata.get("full_name") or data.get("email"),
        "profile_description": metadata.get("profile_description") or "",
        "avatar_path": avatar_path,
        "avatar_url": _public_storage_url(avatar_path),
    }
    return profile


def get_orders(filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    # return transactions for products

    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{TRANSACTIONS_TABLE}"
    product_select = _select_clause_with_details()
    params: Dict[str, Any] = {"select": f"*,product:{PRODUCT_ID_FIELD}({product_select})"}
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
    product_select = _select_clause_with_details()
    params = {"select": f"*,product:{PRODUCT_ID_FIELD}({product_select})"}
    resp = requests.post(url, headers=headers, params=params, json=order_data)
    resp.raise_for_status()
    created = resp.json()
    return _normalize_order(created[0])


def get_order(order_id: str) -> Optional[Dict[str, Any]]:
    # return a single transaction by its id or None if it is not found
    _ensure_config()
    url = f"{SUPABASE_URL}/rest/v1/{TRANSACTIONS_TABLE}"
    product_select = _select_clause_with_details()
    params = {
        TRANSACTION_ID_FIELD: f"eq.{order_id}",
        "select": f"*,product:{PRODUCT_ID_FIELD}({product_select})",
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
    product_select = _select_clause_with_details()
    params = {
        TRANSACTION_ID_FIELD: f"eq.{order_id}",
        "select": f"*,product:{PRODUCT_ID_FIELD}({product_select})",
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
