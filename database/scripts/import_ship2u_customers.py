#!/usr/bin/env python3
"""
Import Ship2u address-book JSON into PostgreSQL evolution_db.customers.

Mapeamento JSON → BD:
  nome → full_name (capitalização PT, até 255 chars)
  morada → address (linha da rua) + postal_code + city + country
           PT: código XXXX-XXX. ES/MC: código de 5 dígitos antes da localidade.
           Sem código reconhecível: morada inteira em address e country PT (legado BD).
  telemovel → whatsapp_number (dígitos; PT 9→351… ; UNIQUE + CHECK 10–15)
  email → email (opcional, válido ou NULL)

Uso:
  python3 import_ship2u_customers.py /caminho/ship2u-address-book-output.json --dry-run
  python3 import_ship2u_customers.py /caminho/ship2u-address-book-output.sql --execute
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


PARTICLES = frozenset(
    {
        "de",
        "da",
        "das",
        "do",
        "dos",
        "e",
        "a",
        "o",
        "em",
        "com",
        "por",
        "para",
        "no",
        "na",
        "nos",
        "nas",
        # nomes próprios frequentes quando colados ao apelido sem partícula
        "del",
        "la",
        "los",
        "y",
        "von",
        "jr",
        "jr.",
        "filho",
    }
)


def digits_only(raw: str | None) -> str:
    return re.sub(r"\D", "", (raw or ""))


def normalize_whatsapp(raw: str | None) -> str | None:
    w = digits_only(raw)
    if not w:
        return None
    # PT: 9 dígitos típicos (móvel 9…… ou fixo 2………) → prefixo país
    if len(w) == 9:
        return "351" + w
    if len(w) < 10 or len(w) > 15:
        return None
    return w


def _title_word_like(w: str) -> str:
    low = w.lower()
    # tokens só com dígitos/traços (códigos postais, fracções)
    if re.fullmatch(r"[\d\-/]+(?:º|ª)?", w, re.I):
        return low if w.isdigit() else w  # números puros já ok
    # pisos fracção (moradas PT)
    mrc = re.fullmatch(r"(?i)(r)/([cde])(?:\.(\d+))?$", w)
    if mrc:
        return f"{mrc.group(1).upper()}/{mrc.group(2).upper()}" + (
            f".{mrc.group(3)}" if mrc.group(3) else ""
        )
    if low in PARTICLES:
        return low
    return low.capitalize()


def title_pt_name(name: str) -> str:
    s = " ".join((name or "").strip().split())
    if not s:
        return s
    # Siglas curtas tipo S2U, CRM (sem espaços)
    if len(s) <= 12 and " " not in s and re.fullmatch(r"[A-Z0-9]{2,12}", s):
        return s
    words = s.replace(",", " ,").split()
    out = []
    for i, w in enumerate(words):
        if w == ",":
            out.append(", ")
            continue
        ow = w
        wl = ow.lower().rstrip(",")
        if i > 0 and wl in PARTICLES:
            capped = wl + ("," if ow.endswith(",") else "")
        else:
            base = wl.rstrip(",")
            hyphen_parts = []
            for hp in base.split("-") or [base]:
                if not hp:
                    continue
                hyphen_parts.append(_title_word_like(hp))
            capped = "-".join(hyphen_parts) + ("," if ow.endswith(",") else "")
        out.append(capped)
    return " ".join(out).replace(" , ", ", ").strip()


def _title_paren_fragment(inner: str) -> str:
    inner = inner.strip()
    if inner.lower() == "portugal":
        return inner.capitalize()
    return title_pt_words(inner)


def title_pt_words(phrase: str) -> str:
    """Titula por espaços, tratando '(Portugal)' no fim."""
    s = " ".join((phrase or "").strip().split())
    if not s:
        return s

    # separar último '(…)'
    def repl(m: re.Match[str]) -> str:
        return "(" + _title_paren_fragment(m.group(1)) + ")"

    s = re.sub(r"\(([^)]*)\)\s*$", repl, s.rstrip())

    words = []
    for w in s.split():
        if w.startswith("(") and w.endswith(")") and len(w) > 2:
            words.append(
                "(" + _title_paren_fragment(w[1:-1]) + ")"
            )
            continue
        words.append(_title_word_like(w))
    return " ".join(words)


def clean_email(raw: str | None) -> tuple[str | None, str | None]:
    """Returns (normalized_email_or_none, rejection_reason_or_none)."""
    e = (raw or "").strip().lower()
    if not e:
        return None, None
    if len(e) > 254:
        return None, "email too long"
    if not re.fullmatch(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", e):
        return None, "invalid format"
    return e, None


def sql_quote(s: str | None) -> str:
    if s is None:
        return "NULL"
    # escape para literal SQL em Postgres
    t = str(s).replace("\\", "\\\\").replace("'", "''")
    return "'" + t + "'"


def split_ship2u_address(morada_raw: str) -> tuple[str, str | None, str | None, str]:
    """
    Extrai morada estruturada e país (ISO2).
    1) Código postal PT \\d{4}-\\d{3} → country PT
    2) Sem PT: último código de 5 dígitos → ES ou MC (Mónaco em "Monaco"/98000)
    3) Caso contrário → texto completo titulado, sem CP, country PT
    """
    s = " ".join((morada_raw or "").strip().split())
    if not s:
        return "", None, None, "PT"
    ms = list(re.finditer(r"\b(\d{4}-\d{3})\b", s))
    if ms:
        last = ms[-1]
        cp = last.group(1)
        street = s[: last.start()].rstrip(",").strip()
        tail = s[last.end() :].strip().lstrip(",").strip()
        tail = re.sub(r"\s*\([^)]*[Pp]ortugal[^)]*\)\s*$", "", tail).strip()
        tail = re.sub(r"\s*\(PT\)\s*$", "", tail, flags=re.I).strip()
        tail = tail.rstrip(",").strip()
        city = tail if tail else None
        if not street:
            return title_pt_words(s), None, None, "PT"
        return (
            title_pt_words(street),
            cp,
            title_pt_words(city) if city else None,
            "PT",
        )
    ms5 = list(re.finditer(r"\b(\d{5})\b", s))
    if ms5:
        last = ms5[-1]
        cp = last.group(1)
        street = s[: last.start()].rstrip(",").strip()
        tail = s[last.end() :].strip().lstrip(",").strip()
        tail = re.sub(r"\s*\([^)]*[Pp]ortugal[^)]*\)\s*$", "", tail).strip()
        tail = re.sub(r"\s*\(PT\)\s*$", "", tail, flags=re.I).strip().rstrip(",").strip()
        city = tail if tail else None
        if street and city:
            cl = city.lower()
            cc = "MC" if ("monaco" in cl) or cp == "98000" else "ES"
            return (
                title_pt_words(street),
                cp,
                title_pt_words(city) if city else None,
                cc,
            )
    return title_pt_words(s), None, None, "PT"


def row_from_json_item(item: dict[str, Any]) -> dict[str, Any]:
    nome_raw = item.get("nome") or ""
    morada_raw = item.get("morada") or ""
    tel_raw = item.get("telemovel") or ""
    wa = normalize_whatsapp(tel_raw)
    mail, mail_warn = clean_email(item.get("email"))

    fname = title_pt_name(nome_raw)
    addr_line, postal_code, city, country = split_ship2u_address(morada_raw)
    # limite BD
    if len(fname) > 255:
        fname = fname[:255]

    return {
        "ship2uRecipientId": item.get("ship2uRecipientId"),
        "full_name": fname,
        "whatsapp_number": wa,
        "email": mail,
        "address": addr_line,
        "postal_code": postal_code,
        "city": city,
        "country": country,
        "_mail_warn": mail_warn,
        "_nome_raw": nome_raw,
        "_tel_raw": tel_raw,
        "_morada_raw": morada_raw,
    }


def merge_dupes(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge vários destinatários com o mesmo WA: nome/morada mais longos, email preenchido."""
    base = dict(rows[0])
    emails = []
    reasons: list[tuple[Any, Any]] = []
    for r in rows:
        if r.get("_mail_warn"):
            reasons.append((r["ship2uRecipientId"], r["_mail_warn"]))
        if r.get("email"):
            emails.append(r["email"])
    longest_name = max(rows, key=lambda x: len((x["full_name"] or "")))["full_name"]
    longest_morada = max(rows, key=lambda x: len((x.get("_morada_raw") or ""))).get("_morada_raw") or ""
    addr_line, postal_code, city, country = split_ship2u_address(longest_morada)
    base["full_name"] = longest_name
    base["address"] = addr_line
    base["postal_code"] = postal_code
    base["city"] = city
    base["country"] = country
    base["email"] = emails[0] if emails else None
    ids = ",".join(str(r["ship2uRecipientId"]) for r in rows)
    base["_merged_from"] = ids
    base["_merged_mail_issues"] = reasons
    return base


def bundle_by_whatsapp(parsed: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, list]]:
    by_wa: dict[str, list[dict[str, Any]]] = defaultdict(list)
    bad_no_wa = []
    for r in parsed:
        wa = r["whatsapp_number"]
        if wa is None:
            bad_no_wa.append(r)
        else:
            by_wa[wa].append(r)
    merged: list[dict[str, Any]] = []
    dup_groups = {k: v for k, v in by_wa.items() if len(v) > 1}
    for wa, grp in sorted(by_wa.items(), key=lambda x: x[0]):
        if len(grp) == 1:
            merged.append(grp[0])
        else:
            merged.append(merge_dupes(sorted(grp, key=lambda x: str(x["ship2uRecipientId"]))))
    return merged, {"bad_no_wa": bad_no_wa, "dup_groups": dup_groups}


def build_sql(rows: list[dict[str, Any]]) -> str:
    lines = [
        "BEGIN;",
        "-- Import Ship2u → customers (full_name, address, whatsapp_number, email, postal_code, city, country)",
    ]
    for r in rows:
        fname = sql_quote(r["full_name"]) if r.get("full_name") else sql_quote("")
        wa = sql_quote(r["whatsapp_number"])
        addr = sql_quote(r.get("address"))
        mail = sql_quote(r.get("email"))
        pc = sql_quote(r.get("postal_code"))
        cit = sql_quote(r.get("city"))
        cc = sql_quote(r.get("country") or "PT")
        lines.append(
            "INSERT INTO customers (full_name, whatsapp_number, email, address, postal_code, city, country) "
            f"VALUES ({fname}, {wa}, {mail}, {addr}, {pc}, {cit}, {cc}) "
            "ON CONFLICT (whatsapp_number) DO UPDATE SET "
            "full_name = CASE "
            "WHEN trim(COALESCE(EXCLUDED.full_name,'')) <> '' THEN EXCLUDED.full_name "
            "ELSE customers.full_name END, "
            "address = CASE "
            "WHEN trim(COALESCE(EXCLUDED.address,'')) <> '' THEN EXCLUDED.address "
            "ELSE customers.address END, "
            "postal_code = CASE "
            "WHEN trim(COALESCE(EXCLUDED.postal_code::text,'')) <> '' THEN EXCLUDED.postal_code "
            "ELSE customers.postal_code END, "
            "city = CASE "
            "WHEN trim(COALESCE(EXCLUDED.city,'')) <> '' THEN EXCLUDED.city "
            "ELSE customers.city END, "
            "country = CASE "
            "WHEN trim(COALESCE(EXCLUDED.country::text,'')) <> '' THEN EXCLUDED.country "
            "ELSE customers.country END, "
            "district = CASE "
            "WHEN UPPER(trim(COALESCE(EXCLUDED.country::text,''))) IN ('ES', 'MC') THEN NULL "
            "ELSE customers.district END, "
            "email = CASE "
            "WHEN trim(COALESCE(EXCLUDED.email,'')) <> '' THEN EXCLUDED.email "
            "ELSE COALESCE(customers.email, EXCLUDED.email) END;",
        )
    lines.append("COMMIT;")
    return "\n".join(lines) + "\n"


def psql_via_docker(sql: str) -> int:
    proc = subprocess.run(
        ["docker", "exec", "-i", "db_evolution", "psql", "-U", "evolution", "-d", "evolution_db", "-v", "ON_ERROR_STOP=1"],
        input=sql,
        text=True,
        capture_output=True,
    )
    sys.stdout.write(proc.stdout or "")
    sys.stderr.write(proc.stderr or "")
    return proc.returncode


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("json_path", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="Only report quality; emit SQL preview count")
    ap.add_argument("--execute", action="store_true", help="Run INSERT via docker db_evolution")
    ap.add_argument("--sql-out", type=Path, help="Write SQL to file")
    args = ap.parse_args()

    data = json.loads(args.json_path.read_text(encoding="utf-8"))
    clients = data.get("clients") or []

    parsed = [row_from_json_item(it) for it in clients]

    rejects = [r for r in parsed if r["whatsapp_number"] is None]
    mail_bad = [(r["ship2uRecipientId"], r["_mail_warn"]) for r in parsed if r.get("_mail_warn")]

    merged, meta = bundle_by_whatsapp([r for r in parsed if r["whatsapp_number"] is not None])

    print("=== Relatório de qualidade (Ship2u → customers) ===")
    print(f"Registos no JSON: {len(clients)}")
    print(f"Inserções previstas (telefone válido normalizado): {len(merged)}")
    print(f"Agrupamentos com mesmo WA (fusão): {len(meta['dup_groups'])} ")
    print(f"Rejeitados (sem dígitos / comprimento WA inválido): {len(rejects)}")
    if rejects:
        for r in rejects[:8]:
            print(f"  - id={r['ship2uRecipientId']} tel={r['_tel_raw']!r}")
    print(f"Emails descartados (formato inválido): {len(mail_bad)}")
    if mail_bad:
        for sid, w in mail_bad[:10]:
            print(f"  - id={sid} reason={w}")
    print(
        "Nota: nomes/moradas passam de MAIÚSCULAS para capitalização PT; "
        "telefones PT 9 dígitos → 351… (como na BD actual)."
    )

    sql = build_sql(merged)

    if args.sql_out:
        args.sql_out.write_text(sql, encoding="utf-8")
        print(f"SQL escrito em {args.sql_out}")

    if args.dry_run:
        print("\n-- dry-run: não executado na BD.")
        return

    if args.execute:
        rc = psql_via_docker(sql)
        if rc != 0:
            sys.exit(rc)
        print("Import concluído (docker db_evolution).")
        return

    print("Use --execute para aplicar ou --sql-out ficheiro.sql para rever o SQL.")


if __name__ == "__main__":
    main()
