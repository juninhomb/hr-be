#!/usr/bin/env python3
"""Gera SQL completo: upsert produtos/variantes + desativa fora da planilha."""
from __future__ import annotations

import re
from pathlib import Path

from pdf_to_catalog_sql import aggregate, emit_sql, parse_csv_rows, sql_str

CSV = Path(__file__).with_name("estoque_planilha_2026-05-22.csv")
OUT = Path(__file__).with_name("import_estoque_planilha_2026-05-22.sql")

# Produtos que saíram do inventário (removidos da planilha)
REMOVED_PRODUCTS = [
    "Calça Alfaiataria com Cinto",
    "Calça Alfaiataria Pregas",
    "Calça Algodão",
    "Conjunto Ísis",
    "Conjunto Lia",
    "Conjunto Trico Siena",
    "Vestido Mavie",
]


def main() -> None:
    raw = parse_csv_rows(CSV)
    prices, stock = aggregate(raw)
    skus = sorted({k[3] for k in stock})
    product_names = sorted(prices.keys())

    lines = [
        "-- HR Store — sincronizar estoque com planilha 2026-05-22",
        "-- docker exec -i db_evolution psql -U evolution -d evolution_db -v ON_ERROR_STOP=1 < import_estoque_planilha_2026-05-22.sql",
        "",
        "BEGIN;",
        "",
        "-- 1) Produtos: atualizar preço/ativo ou criar",
    ]

    price_rows = ",\n  ".join(
        f"({sql_str(n)}, {prices[n]})" for n in product_names
    )
    lines.append("CREATE TEMP TABLE _planilha_produtos (name text, base_price numeric) ON COMMIT DROP;")
    lines.append(f"INSERT INTO _planilha_produtos (name, base_price) VALUES\n  {price_rows};")
    lines.append("")
    lines.append(
        "UPDATE products p SET base_price = h.base_price, is_active = true\n"
        "FROM _planilha_produtos h\n"
        "WHERE upper(trim(p.name)) = upper(trim(h.name));"
    )
    lines.append("")
    lines.append(
        "INSERT INTO products (name, base_price, is_active)\n"
        "SELECT h.name, h.base_price, true FROM _planilha_produtos h\n"
        "WHERE NOT EXISTS (\n"
        "  SELECT 1 FROM products p WHERE upper(trim(p.name)) = upper(trim(h.name))\n"
        ");"
    )
    lines.append("")

    base = emit_sql(prices, stock, prices.get(product_names[0] if product_names else "0"))
    # extrair só o bloco INSERT variants do emit_sql
    m = re.search(
        r"(INSERT INTO product_variants.*?ON CONFLICT.*?;)",
        base,
        re.DOTALL,
    )
    if not m:
        raise SystemExit("emit_sql não devolveu bloco de variantes")
    lines.append("-- 2) Variantes + stock (UPSERT por SKU)")
    lines.append(m.group(1))
    lines.append("")

    sku_list = ",\n  ".join(sql_str(s) for s in skus)
    removed_list = ",\n  ".join(sql_str(n) for n in REMOVED_PRODUCTS)

    lines.extend(
        [
            "-- 3) Cores em catalog_colors + color_id",
            "INSERT INTO catalog_colors (name, sort_order)",
            "SELECT dedup.canon, 100",
            "FROM (",
            "  SELECT upper(trim(v.color)) AS u, min(trim(v.color)) AS canon",
            "  FROM product_variants v",
            "  WHERE v.color IS NOT NULL AND trim(v.color) <> ''",
            "  GROUP BY upper(trim(v.color))",
            ") dedup",
            "WHERE NOT EXISTS (",
            "  SELECT 1 FROM catalog_colors c WHERE upper(trim(c.name)) = dedup.u",
            ");",
            "",
            "UPDATE product_variants v",
            "SET color_id = c.id",
            "FROM catalog_colors c",
            "WHERE v.color IS NOT NULL AND trim(v.color) <> ''",
            "  AND upper(trim(v.color)) = upper(trim(c.name))",
            "  AND (v.color_id IS NULL OR v.color_id <> c.id);",
            "",
            "-- 4) Desativar produtos removidos do inventário",
            f"UPDATE products SET is_active = false",
            f"WHERE name IN ({removed_list});",
            "",
            "UPDATE product_variants pv",
            "SET is_active = false, stock_quantity = 0",
            "FROM products p",
            "WHERE pv.product_id = p.id AND p.is_active = false;",
            "",
            "-- 5) Variantes antigas (SKU fora da planilha) — stock 0, inativo",
            "UPDATE product_variants SET is_active = false, stock_quantity = 0",
            f"WHERE sku NOT IN ({sku_list});",
            "",
            "-- 6) Recategorizar (migration inline)",
        ]
    )

    cat_sql = Path(__file__).parents[1] / "migrations" / "2026-04-30_categorize_products.sql"
    cat_body = cat_sql.read_text(encoding="utf-8")
    # só o bloco UPDATE/DELETE entre BEGIN e COMMIT (sem segundo BEGIN)
    cat_body = cat_body.split("BEGIN;", 1)[1].rsplit("COMMIT;", 1)[0].strip()
    lines.append(cat_body)
    lines.append("")
    lines.append("COMMIT;")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT} ({len(skus)} SKUs, {len(product_names)} products)")


if __name__ == "__main__":
    main()
