import os
import stripe

from . import database  

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
print("DEBUG Stripe key loaded:", bool(stripe.api_key))

def create_checkout_session_for_listing(
    *,
    listing_id: str,
    buyer_id: str,
    frontend_domain: str = "http://localhost:3000",
) -> str:
    listing = database.get_listing(listing_id)
    if not listing:
        raise ValueError("Listing not found")

    if listing["seller_id"] == buyer_id:
        raise ValueError("You cannot purchase your own listing")

    if listing.get("sold"):
        raise ValueError("Listing already sold")

    quantity = listing.get("quantity", 1)
    if isinstance(quantity, int) and quantity <= 0:
        raise ValueError("Listing is out of stock")

    unit_amount = int(round(float(listing["price"]) * 100))

    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[
            {
                "price_data": {
                    "currency": "usd",
                    "product_data": {"name": listing["name"]},
                    "unit_amount": unit_amount,
                },
                "quantity": 1,
            }
        ],
        metadata={
            "listing_id": listing["id"],
            "buyer_id": buyer_id,
        },
        success_url=f"{frontend_domain}/dashboard/orders?status=success",
        cancel_url=f"{frontend_domain}/items/{listing['id']}?canceled=1",
    )

    return session.url