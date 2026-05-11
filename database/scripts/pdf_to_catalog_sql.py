#!/usr/bin/env python3
"""
Gera SQL de INSERT para products + product_variants a partir de um PDF de stock
ou de um CSV (utf-8), com SKUs alinhados ao padrão já usado na evolution_db.

Regras de SKU (espelho da base actual):
  TIP-MOD-COR-TAM   na maioria dos casos (3 letras por segmento, ver excepções).
  Ex.: Vestido Bia + CASTANHO + U → VST-BIA-CAS-U
  Excepções:
    - Maio (só um nome de produto): MAI-{COR}-{TAM}
    - Calça Jeans / Calça Sarja: CAL-JEA-{TAM} ou CAL-SAR-{TAM} (sem segmento de cor no SKU)
    - Conjunto com duas palavras de modelo (ex. Tricô Siena): MOD = última palavra (SIE)
    - "... com Cinto" / "Body com Fivela": MOD = última palavra após "com"

Uso:
  pip install -r requirements-import.txt
  python3 pdf_to_catalog_sql.py estoque.pdf > import_estoque.sql
  python3 pdf_to_catalog_sql.py --csv stock.csv > import_estoque.sql

Depois:
  docker exec -i db_evolution psql -U evolution -d evolution_db < import_estoque.sql
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except ImportError:
    pdfplumber = None  # type: ignore


def norm_key(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.upper().strip()


def ascii_upper(s: str) -> str:
    """ASCII upper para comparar CALCA/JEANS etc. em nomes com acento."""
    k = norm_key(s)
    for src, dst in (
        ("Ç", "C"),
        ("Ã", "A"),
        ("Á", "A"),
        ("À", "A"),
        ("É", "E"),
        ("Ê", "E"),
        ("Í", "I"),
        ("Ó", "O"),
        ("Ô", "O"),
        ("Ú", "U"),
    ):
        k = k.replace(src, dst)
    return k


def sql_str(s: str) -> str:
    return "'" + (s or "").replace("'", "''") + "'"


def norm_display(s: str) -> str:
    return " ".join((s or "").split())


def three_letters(token: str) -> str:
    a = "".join(c for c in norm_key(token) if c.isalnum())
    if not a:
        return "XXX"
    if len(a) <= 3:
        return a.ljust(3, "X")[:3]
    return a[:3]


TIP_MAP = {
    "BIQUINI": "BIQ",
    "BLAZER": "BLA",
    "BODY": "BD",
    "BLUSA": "BLU",
    "CALCA": "CAL",
    "CAMISA": "CAM",
    "COLETE": "COL",
    "CONJUNTO": "CON",
    "LENCO": "LEN",
    "MACACAO": "MAC",
    "MAIO": "MAI",
    "SHORT": "SHO",
    "VESTIDO": "VST",
}


def tip_code(first_word: str) -> str:
    k = ascii_upper(first_word)
    if k in TIP_MAP:
        return TIP_MAP[k]
    # fallback: 3 primeiras letras alfanuméricas (ex.: capas raras)
    return three_letters(first_word)


COLOR_MAP = {
    "OFF WHITE": "OFF",
    "OFFWHITE": "OFF",
    "AZUL MARINHO": "MAR",
    "AZULMARINHO": "MAR",
    "ROSA": "ROS",
    "PRETA": "PRE",
    "PRETO": "PRE",
    "VERDE": "VER",
    "AMARELO": "AMA",
    "CASTANHO": "CAS",
    "CEREJA": "CER",
    "CAFE": "CAF",
    "BEGE": "BEG",
    "BORDO": "BOR",
    "AREIA": "ARE",
    "MARINHO": "MAR",
    "OLIVA": "OLI",
    "AZUL": "AZU",
    "CINZA": "CIN",
    "BRANCO": "BRA",
    "JEANS": "JEA",
    "SARJA": "SAR",
    "TERRACOTA": "TER",
    "AMBAR": "AMB",
    "VINHO": "VIN",
    "FUCSIA": "FUC",
    "SALMAO": "SAL",
    "LILAS": "LIL",
    "BRANCA": "BRA",
    "AMARELA": "AMA",
    "AZUL CLARO": "ACL",
    "MARFIM": "MRF",
}


def color_code(color: str) -> str:
    c = norm_key(color)
    c_spaced = norm_display(color).upper()
    if c_spaced in COLOR_MAP:
        return COLOR_MAP[c_spaced]
    if c in COLOR_MAP:
        return COLOR_MAP[c]
    return three_letters(color)


def size_sku_part(size: str) -> str:
    s = norm_key(size).replace(" ", "")
    return s.replace("/", "")


def mod_abbrev(product_name: str) -> str:
    words = product_name.split()
    j = ascii_upper(product_name)
    rest = words[1:]
    while rest and re.match(r"^[\d.]+$", rest[-1].replace(",", ".")):
        rest = rest[:-1]
    if not rest:
        return "XXX"
    tip = ascii_upper(words[0])
    if tip == "CONJUNTO" and "IBIZA" in j:
        if "1.0" in j or "1,0" in j:
            return "IB1"
        return "IB2"
    joined_tokens = ascii_upper(" ".join(words)).split()
    if "COM" in joined_tokens:
        return three_letters(rest[-1])
    if tip == "CONJUNTO" and len(rest) >= 2:
        return three_letters(rest[-1])
    if tip == "CALCA" and len(rest) >= 2:
        return three_letters(rest[-1])
    return three_letters(rest[0])


def build_sku(product_name: str, color: str, size: str) -> str:
    words = product_name.split()
    if not words:
        raise ValueError("nome de produto vazio")
    tip = tip_code(words[0])
    sz = size_sku_part(size)
    dc = norm_display(color)
    cor = color_code(color) if dc else ""
    joined = ascii_upper(product_name)

    if len(words) == 1:
        if not cor:
            cor = color_code("UNI")
        return f"{tip}-{cor}-{sz}"

    mod = mod_abbrev(product_name)

    if "CALCA" in joined:
        if "JEANS" in joined and "FLOR" in joined:
            return f"{tip}-JFL-{sz}"
        if "ONCA" in joined:
            return f"{tip}-ONC-{sz}"
        if "JEANS" in joined:
            return f"{tip}-JEA-{sz}"
        if "SARJA" in joined:
            return f"{tip}-SAR-{sz}"

    if not dc or dc in ("-", "—", "–"):
        cor = color_code("UNI")

    return f"{tip}-{mod}-{cor}-{sz}"


Row = dict[str, Any]


def parse_csv_rows(path: Path) -> list[Row]:
    rows: list[Row] = []
    with path.open(newline="", encoding="utf-8-sig") as f:
        r = csv.DictReader(f)
        if not r.fieldnames:
            raise SystemExit("CSV sem cabeçalho")
        fn = [x.strip().lower() if x else "" for x in r.fieldnames]
        # normalizar chaves esperadas
        alias = {
            "produto": "produto",
            "produtos": "produto",
            "modelo": "produto",
            "nome": "produto",
            "cor": "cor",
            "tamanho": "tamanho",
            "tam": "tamanho",
            "tamanhos": "tamanho",
            "qtd": "quantidade",
            "quantidade": "quantidade",
            "qty": "quantidade",
            "stock": "quantidade",
            "preco": "preco",
            "preço": "preco",
            "price": "preco",
            "preco_venda": "preco",
        }
        mapping: dict[str, str] = {}
        for h in r.fieldnames:
            if not h:
                continue
            low = h.strip().lower()
            key = alias.get(low, low)
            mapping[h] = key
        for raw in r:
            row: Row = {}
            for k_old, v in raw.items():
                if k_old is None:
                    continue
                nk = mapping.get(k_old, k_old.strip().lower())
                row[nk] = (v or "").strip()
            if not row.get("produto"):
                continue
            rows.append(row)
    return rows


def _cell_lower(cell: Any) -> str:
    if cell is None:
        return ""
    return str(cell).strip().lower()


def _find_header_row(table: list[list[Any]]) -> tuple[int, dict[str, int]] | None:
    """Devolve índice da linha de cabeçalho e mapa coluna->índice."""
    keywords_prod = ("produto", "produtos", "modelo", "peça", "peca", "descri")
    keywords_color = ("cor", "cores")
    keywords_size = ("tamanho", "tam", "tamanhos", "medida")
    keywords_qty = ("qtd", "quant", "stock", "uni", "nº", "n°")
    keywords_price = ("preço", "preco", "valor", "pvp", "€", "euro")

    for ri, row in enumerate(table):
        if not row:
            continue
        cells = [_cell_lower(c) for c in row]
        if not any(cells):
            continue
        colmap: dict[str, int] = {}
        for ci, c in enumerate(cells):
            if any(k in c for k in keywords_prod):
                colmap.setdefault("produto", ci)
            if any(k in c for k in keywords_color):
                colmap.setdefault("cor", ci)
            if any(k in c for k in keywords_size):
                colmap.setdefault("tamanho", ci)
            if any(k in c for k in keywords_qty):
                colmap.setdefault("quantidade", ci)
            if any(k in c for k in keywords_price):
                colmap.setdefault("preco", ci)
        if "produto" in colmap and ("quantidade" in colmap or "cor" in colmap):
            return ri, colmap
    return None


def parse_pdf_rows(path: Path) -> list[Row]:
    if pdfplumber is None:
        raise SystemExit("Instala pdfplumber: pip install -r requirements-import.txt")
    rows: list[Row] = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for table in tables:
                if not table:
                    continue
                found = _find_header_row(table)
                if not found:
                    continue
                hdr_i, colmap = found
                for row in table[hdr_i + 1 :]:
                    if not row:
                        continue
                    def get(key: str) -> str:
                        i = colmap.get(key)
                        if i is None or i >= len(row):
                            return ""
                        v = row[i]
                        return "" if v is None else str(v).strip()

                    prod = get("produto")
                    if not prod or norm_key(prod) in ("TOTAL", "SOMA"):
                        continue
                    rows.append(
                        {
                            "produto": prod,
                            "cor": get("cor"),
                            "tamanho": get("tamanho"),
                            "quantidade": get("quantidade"),
                            "preco": get("preco"),
                        }
                    )
    return rows


def _to_int_qty(s: str) -> int:
    s = (s or "").strip()
    if not s:
        return 0
    s = s.replace(",", ".").split(".")[0]
    m = re.search(r"-?\d+", s)
    return int(m.group(0)) if m else 0


def _to_decimal_price(s: str) -> Decimal | None:
    s = (s or "").strip().replace("€", "").replace("EUR", "").strip()
    if not s:
        return None
    s = s.replace(",", ".")
    try:
        return Decimal(s)
    except Exception:
        return None


def aggregate(
    raw_rows: list[Row],
) -> tuple[dict[str, Decimal], dict[tuple[str, str, str, str], int]]:
    """produto -> preço base (máximo não-nulo); chave (produto, cor, tamanho, sku) -> qty."""
    prices: dict[str, Decimal] = {}
    stock: dict[tuple[str, str, str, str], int] = defaultdict(int)

    for r in raw_rows:
        prod = norm_display(r.get("produto", ""))
        cor_raw = (r.get("cor") or "").strip()
        if norm_key(cor_raw) in ("TOTAL", "SOMA"):
            continue
        if cor_raw in ("-", "—", "–"):
            cor = ""
        else:
            cor = norm_display(cor_raw)
        if norm_key(cor) == "MARIFM":
            cor = "Marfim"
        tam = norm_display(r.get("tamanho", ""))
        if not prod or norm_key(prod) == "TOTAL":
            continue
        qty = _to_int_qty(str(r.get("quantidade", "0")))
        pr = _to_decimal_price(str(r.get("preco", "")))
        if pr is not None:
            prev = prices.get(prod, Decimal("0"))
            if pr > prev:
                prices[prod] = pr
        sku = build_sku(prod, cor, tam or "U")
        stock[(prod, cor, tam, sku)] += qty

    for prod, _, _, _ in stock:
        prices.setdefault(prod, Decimal("0"))

    return prices, stock


def emit_sql(
    prices: dict[str, Decimal],
    stock: dict[tuple[str, str, str, str], int],
    default_price: Decimal,
) -> str:
    lines: list[str] = [
        "BEGIN;",
        "",
        "-- Gerado por pdf_to_catalog_sql.py — rever SKUs duplicados se o PDF tiver leituras estranhas.",
        "",
    ]

    products_sorted = sorted(prices.keys(), key=lambda x: x.upper())
    for p in products_sorted:
        price = prices[p]
        if price <= 0:
            price = default_price
        lines.append(
            f"INSERT INTO products (name, base_price, is_active) VALUES ({sql_str(p)}, {price}, true);"
        )

    lines.append("")
    lines.append("INSERT INTO product_variants (product_id, sku, color, size, stock_quantity, is_active) VALUES")

    values: list[str] = []
    for (prod, cor, tam, sku), qty in sorted(
        stock.items(), key=lambda x: (x[0][0].upper(), x[0][3], x[0][1], x[0][2])
    ):
        cor_s = sql_str(cor) if cor else "NULL"
        tam_s = sql_str(tam) if tam else "NULL"
        sel = f"(SELECT id FROM products WHERE name = {sql_str(prod)} LIMIT 1)"
        values.append(
            f"  ({sel}, {sql_str(sku)}, {cor_s}, {tam_s}, {qty}, true)"
        )

    lines.append(",\n".join(values))
    lines.append(
        "ON CONFLICT (sku) DO UPDATE SET stock_quantity = EXCLUDED.stock_quantity, color = EXCLUDED.color, size = EXCLUDED.size, is_active = EXCLUDED.is_active;"
    )
    lines.append("")
    lines.append("COMMIT;")
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description="PDF/CSV → SQL catálogo HR Store")
    ap.add_argument("path", nargs="?", help="Ficheiro .pdf ou .csv")
    ap.add_argument("--csv", dest="csv", action="store_true", help="Forçar leitura CSV")
    ap.add_argument(
        "--default-price",
        type=str,
        default="0",
        help="Preço base se não vier no ficheiro (default 0)",
    )
    ap.add_argument("--dry-run", action="store_true", help="Só imprimir primeiras linhas agregadas")
    args = ap.parse_args()
    if not args.path:
        ap.print_help()
        sys.exit(1)
    path = Path(args.path)
    if not path.is_file():
        sys.exit(f"Ficheiro não encontrado: {path}")

    if args.csv or path.suffix.lower() == ".csv":
        raw = parse_csv_rows(path)
    else:
        raw = parse_pdf_rows(path)

    if not raw:
        sys.exit("Nenhuma linha extraída — verifica colunas do PDF ou exporta CSV.")

    prices, stock = aggregate(raw)
    default_price = Decimal(args.default_price)

    if args.dry_run:
        for i, (k, q) in enumerate(sorted(stock.items(), key=lambda x: x[0][3])[:25]):
            print(k, "->", q)
        print("...", "total keys", len(stock))
        return

    print(emit_sql(prices, stock, default_price))


if __name__ == "__main__":
    main()
