from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook

from cloud_mapping.scripts.scan_game_project import build_scan_payload


def test_build_scan_payload_collects_csv_and_xlsx_profiles(tmp_path: Path) -> None:
    csv_root = tmp_path / "CsvTable"
    xlsx_root = tmp_path / "W3数值"
    csv_root.mkdir()
    xlsx_root.mkdir()

    csv_path = csv_root / "ChargeBundle.csv"
    csv_path.write_text(
        "礼包ID,礼包名,价格\n"
        "KN,GX,N\n"
        "ChargeBundleId,BundleName,BasicGold\n"
        "20001,Starter Bundle,500\n",
        encoding="utf-8",
    )

    workbook_path = xlsx_root / "【规划】003 商业化.xlsx"
    workbook = Workbook()
    ws = workbook.active
    ws.title = "每日必买"
    ws.append(["唯一id", "礼包名称", "礼包档位/$"])
    ws.append([20001, "Starter Bundle", 4.99])
    workbook.save(workbook_path)

    payload = build_scan_payload(csv_root=csv_root, xlsx_root=xlsx_root)

    assert payload["profile_count"] == 2
    assert payload["csv_count"] == 1
    assert payload["xlsx_count"] == 1
