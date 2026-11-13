"""Products and prices in Stripe, made from content/products/*.yaml (docs/stripe.md).

Every product for sale gets a Stripe product with the same id (plus-de) and one price per entry in `prices`, found by a
lookup key: <slug>-month, <slug>-year, <slug>-once. The app asks Stripe for the price by that key at checkout, so no
Stripe id is ever stored in the code or the database. Prices are fixed in Stripe: a changed amount becomes a new price
that takes over the lookup key, and the old one is archived (subscribers keep paying what they signed up for).

Test mode and live mode are separate worlds in Stripe, each with its own products: run this once per mode. A live key
is refused unless `live` is given, so testing never touches real money by accident.
"""

import os

import httpx

import products

API = "https://api.stripe.com/v1"


def _client(live: bool) -> httpx.Client:
    # Both keys can sit in pipeline/.env: the test key is used by default, the live one only with `stripe live`.
    name = "STRIPE_SECRET_KEY" if live else "STRIPE_SECRET_TESTKEY"
    key = os.environ.get(name, "")
    if not key.startswith(("sk_", "rk_")):
        raise SystemExit(f"{name} is not set in pipeline/.env (Stripe > Developers > API keys).")
    if live != ("_live_" in key):
        raise SystemExit(f"{name} should be a {'live (sk_live_...)' if live else 'test (sk_test_...)'} key.")
    return httpx.Client(base_url=API, auth=(key, ""), timeout=30)


def _check(r: httpx.Response) -> dict:
    if r.status_code >= 400:
        raise SystemExit(f"Stripe: {r.json().get('error', {}).get('message', r.text)}")
    return r.json()


def lookup_key(slug: str, interval: str | None) -> str:
    return f"{slug}-{interval or 'once'}"


def sync(live: bool = False) -> list[str]:
    """Make Stripe's products and prices match the product files; returns what changed."""
    changes: list[str] = []
    with _client(live) as s:
        for slug, p in products.all_products().items():
            if p.status != "live" or not p.prices:
                continue
            text = p.texts.get("en") or next(iter(p.texts.values()))
            fields = {"name": text.title, "description": text.text, "metadata[product]": slug}
            got = s.get(f"/products/{slug}")
            if got.status_code == 404:
                _check(s.post("/products", data={"id": slug, **fields}))
                changes.append(f"product {slug}: made")
            else:
                current = _check(got)
                if current["name"] != text.title or current.get("description") != text.text or not current["active"]:
                    _check(s.post(f"/products/{slug}", data={**fields, "active": "true"}))
                    changes.append(f"product {slug}: updated")
            for price in p.prices:
                key = lookup_key(slug, price.interval)
                found = _check(s.get("/prices", params={"lookup_keys[]": key, "active": "true"}))["data"]
                old = found[0] if found else None
                same = old and old["unit_amount"] == price.amount and old["currency"] == price.currency \
                    and (old.get("recurring") or {}).get("interval") == price.interval \
                    and old.get("tax_behavior") == "inclusive"
                if same:
                    continue
                data = {
                    "product": slug,
                    "unit_amount": str(price.amount),
                    "currency": price.currency,
                    "lookup_key": key,
                    "transfer_lookup_key": "true",
                    # The price the learner sees is what they pay: VAT is inside it (docs/stripe.md).
                    "tax_behavior": "inclusive",
                    "metadata[product]": slug,
                }
                if price.interval:
                    data["recurring[interval]"] = price.interval
                _check(s.post("/prices", data=data))
                if old:
                    _check(s.post(f"/prices/{old['id']}", data={"active": "false"}))
                changes.append(f"price {key}: {price.amount / 100:.2f} {price.currency}"
                               + (" (old price archived)" if old else ""))
    return changes
