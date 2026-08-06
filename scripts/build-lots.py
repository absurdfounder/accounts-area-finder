#!/usr/bin/env python3
"""Build lots.js from Super Sales Agro party statement RTFs (+ optional Excel fallback)."""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SKIP_RE = re.compile(
    r"OP BALANCE|CL BALANCE|\bBV\d|\bJV\d|CHQ-|PHONEPE|T/F TO|TOTAL NET|Total Credit|Total Debit|NET BALANCE|SALE-|\*OP|\*CL",
    re.I,
)
WEEK_RULE = "1-7,8-14,15-21,22-31"


def week_of_month(day: int) -> int:
    if day <= 7:
        return 1
    if day <= 14:
        return 2
    if day <= 21:
        return 3
    return 4


def rtf_to_text(raw: str) -> str:
    text = re.sub(r"\\par\b", "\n", raw)
    text = re.sub(r"\\'[0-9a-fA-F]{2}", " ", text)
    text = re.sub(r"\\[a-zA-Z]+\d* ?", " ", text)
    text = text.replace("{", "").replace("}", "").replace("\\", "")
    return text


def parse_rtf(path: Path) -> list[dict]:
    raw = path.read_text(errors="ignore")
    text = rtf_to_text(raw)
    parts = re.split(r"(?=PARTY\s*:)", text)
    lots: list[dict] = []
    seen: set[tuple] = set()

    for part in parts:
        header = re.search(r"PARTY\s*:(.+?)\(([^()\n]+)\)", part)
        if not header:
            continue
        party_code = header.group(2).strip()
        if not party_code:
            continue

        for line in part.splitlines():
            line = line.strip()
            if not line or SKIP_RE.search(line):
                continue
            match = re.match(r"^(\d{2}/\d{2}/\d{4})\s+(\S+)\s+(.*)$", line)
            if not match:
                continue
            voucher = match.group(2)
            if re.match(r"^(BV|JV)\d", voucher, re.I):
                continue
            rest = match.group(3)
            candidates = re.findall(r"(?:^|\s)(\d{1,4})(?=\s+\d|\s+\d{1,3},\d{3}|\s*$)", rest)
            if not candidates:
                continue
            cases = int(candidates[0])
            if cases <= 0:
                continue
            try:
                dt = datetime.strptime(match.group(1), "%d/%m/%Y")
            except ValueError:
                continue
            key = (party_code, dt.date().isoformat(), voucher, cases)
            if key in seen:
                continue
            seen.add(key)
            lots.append(
                {
                    "partyCode": party_code,
                    "date": dt.date().isoformat(),
                    "month": dt.month,
                    "week": week_of_month(dt.day),
                    "year": dt.year,
                    "cases": cases,
                    "voucher": voucher,
                    "source": path.name,
                }
            )
    return lots


def parse_excel_fallback(path: Path, existing_codes: set[str]) -> list[dict]:
    try:
        import openpyxl
    except ImportError:
        print("openpyxl not installed; skipping Excel fallback", file=sys.stderr)
        return []

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    lots: list[dict] = []
    for row in ws.iter_rows(min_row=7, values_only=True):
        if not row or not row[2] or not row[4]:
            continue
        code = str(row[2]).strip()
        if not code or code in existing_codes:
            continue
        drange = str(row[4]).strip()
        match = re.match(r"(\d{2}/\d{2}/\d{2})\s+to\s+(\d{2}/\d{2}/\d{2})", drange)
        if not match:
            continue
        d1 = datetime.strptime(match.group(1), "%d/%m/%y")
        d2 = datetime.strptime(match.group(2), "%d/%m/%y")
        # Only trust single-day ranges as exact arrivals
        if d1.date() != d2.date():
            continue
        cases = int(row[5] or 0) or 1
        lots.append(
            {
                "partyCode": code,
                "date": d1.date().isoformat(),
                "month": d1.month,
                "week": week_of_month(d1.day),
                "year": d1.year,
                "cases": cases,
                "voucher": "xlsx",
                "source": path.name,
            }
        )
    wb.close()
    return lots


def build_seasonal_index(lots: list[dict]) -> dict:
    buckets: dict[str, dict] = {}
    for lot in lots:
        key = f"{lot['month']}-{lot['week']}"
        bucket = buckets.setdefault(key, {})
        entry = bucket.setdefault(
            lot["partyCode"],
            {"partyCode": lot["partyCode"], "years": set(), "lotCount": 0, "totalCases": 0, "dates": []},
        )
        entry["years"].add(lot["year"])
        entry["lotCount"] += 1
        entry["totalCases"] += int(lot["cases"] or 0)
        entry["dates"].append(lot["date"])

    out: dict[str, list] = {}
    for key, parties in buckets.items():
        rows = []
        for entry in parties.values():
            rows.append(
                {
                    "partyCode": entry["partyCode"],
                    "years": sorted(entry["years"]),
                    "lotCount": entry["lotCount"],
                    "totalCases": entry["totalCases"],
                    "dates": sorted(set(entry["dates"])),
                }
            )
        rows.sort(key=lambda r: (-r["lotCount"], -r["totalCases"], r["partyCode"]))
        out[key] = rows
    return out


def main() -> int:
    home = Path.home()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rtf",
        nargs="*",
        default=[
            str(home / "Downloads" / "2023-2024 report.rtf"),
            str(home / "Downloads" / "2024-2025 report.rtf"),
            str(home / "Downloads" / "2025-2026 report.rtf"),
        ],
        help="Party statement RTF paths",
    )
    parser.add_argument(
        "--xlsx",
        default=str(home / "Downloads" / "Combined_Party_Lot_Report_No_Gujarat.xlsx"),
        help="Optional Combined Lot Report for single-day fallback",
    )
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parents[1] / "lots.js"),
        help="Output lots.js path",
    )
    args = parser.parse_args()

    lots: list[dict] = []
    used_files: list[str] = []
    for path_str in args.rtf:
        path = Path(path_str).expanduser()
        if not path.exists():
            print(f"skip missing {path}", file=sys.stderr)
            continue
        parsed = parse_rtf(path)
        print(f"{path.name}: {len(parsed)} lots")
        lots.extend(parsed)
        used_files.append(path.name)

    existing = {lot["partyCode"] for lot in lots}
    xlsx = Path(args.xlsx).expanduser()
    if xlsx.exists():
        extra = parse_excel_fallback(xlsx, existing)
        print(f"{xlsx.name} fallback: {len(extra)} single-day lots")
        lots.extend(extra)
        if extra:
            used_files.append(xlsx.name)

    lots.sort(key=lambda lot: (lot["date"], lot["partyCode"], lot.get("voucher") or ""))
    seasonal = build_seasonal_index(lots)
    payload = {
        "generatedFrom": used_files,
        "weekRule": WEEK_RULE,
        "count": len(lots),
        "partyCount": len({lot["partyCode"] for lot in lots}),
        "lots": lots,
        "seasonal": seasonal,
    }

    out = Path(args.out)
    out.write_text(
        "window.LOTS_DATA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {out} ({len(lots)} lots, {payload['partyCount']} parties, {len(seasonal)} buckets)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
