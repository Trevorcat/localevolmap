from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
from urllib import request

from cloud_mapping.app.profiles import profile_csv_file, profile_workbook


def _profile_payload(profile: Any) -> dict[str, Any]:
    return profile.to_record() | {"headers": profile.headers, "sample_rows": profile.sample_rows, "columns": [column.__dict__ for column in profile.columns]}


def build_scan_payload(*, csv_root: Path, xlsx_root: Path) -> dict[str, Any]:
    csv_profiles = [_profile_payload(profile_csv_file(path)) for path in sorted(csv_root.rglob("*.csv"))]
    xlsx_profiles = []
    for path in sorted(xlsx_root.rglob("*.xlsx")):
        xlsx_profiles.extend(_profile_payload(profile) for profile in profile_workbook(path))
    return {
        "profiles": [*csv_profiles, *xlsx_profiles],
        "profile_count": len(csv_profiles) + len(xlsx_profiles),
        "csv_count": len(csv_profiles),
        "xlsx_count": len(xlsx_profiles),
    }


def upload_profiles(server_url: str, payload: dict[str, Any], batch_size: int = 100) -> dict[str, Any]:
    ingested = 0
    table_profile_ids: list[int] = []
    profiles = payload["profiles"]
    for start in range(0, len(profiles), batch_size):
        batch = profiles[start : start + batch_size]
        req = request.Request(
            f"{server_url.rstrip('/')}/api/v1/ingest/profiles",
            method="POST",
            headers={"Content-Type": "application/json"},
            data=json.dumps({"profiles": batch}, ensure_ascii=False).encode("utf-8"),
        )
        with request.urlopen(req, timeout=300) as response:
            result = json.loads(response.read().decode("utf-8"))
        ingested += int(result.get("ingested", 0))
        table_profile_ids.extend(result.get("table_profile_ids", []))
    return {"ingested": ingested, "table_profile_ids": table_profile_ids}


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan game workbook and CSV directories, then upload profiles to the cloud mapping service.")
    parser.add_argument("--csv-root", required=True)
    parser.add_argument("--xlsx-root", required=True)
    parser.add_argument("--server-url", required=True)
    parser.add_argument("--batch-size", type=int, default=100)
    args = parser.parse_args()

    payload = build_scan_payload(csv_root=Path(args.csv_root), xlsx_root=Path(args.xlsx_root))
    result = upload_profiles(args.server_url, payload, batch_size=args.batch_size)
    print(json.dumps({"scan": {k: v for k, v in payload.items() if k != "profiles"}, "result": result}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
