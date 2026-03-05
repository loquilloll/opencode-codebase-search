from dataclasses import dataclass
from typing import List


@dataclass
class Product:
    sku: str
    title: str
    price_cents: int


def build_catalog() -> List[Product]:
    return [
        Product("book-001", "Practical Service Design", 2599),
        Product("book-002", "Semantic Search Handbook", 3199),
        Product("cable-002", "USB-C Cable", 899),
    ]


def make_search_index_rows(products: List[Product]) -> List[str]:
    rows = []
    for product in products:
        rows.append(f"{product.sku}|{product.title}|{product.price_cents}")
    return rows


if __name__ == "__main__":
    catalog = build_catalog()
    for row in make_search_index_rows(catalog):
        print(row)
