from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook

from cloud_mapping.app.db import CloudMappingStore
from cloud_mapping.app.profiles import profile_csv_file, profile_workbook


def test_profile_csv_file_uses_third_header_row_and_samples(tmp_path: Path) -> None:
    csv_path = tmp_path / "ChargeBundle.csv"
    csv_path.write_text(
        "礼包ID,礼包名,价格\n"
        "KN,GX,N\n"
        "ChargeBundleId,BundleName,BasicGold\n"
        "20001,Starter Bundle,500\n"
        "20002,Advanced Bundle,1000\n",
        encoding="utf-8",
    )

    profile = profile_csv_file(csv_path)

    assert profile.logical_name == "ChargeBundle"
    assert profile.headers == ["ChargeBundleId", "BundleName", "BasicGold"]
    assert profile.data_row_count == 2
    assert profile.columns[0].unique_ratio == 1.0
    assert profile.columns[2].inferred_type == "number"
    assert profile.sample_rows[0]["BundleName"] == "Starter Bundle"


def test_profile_workbook_creates_one_profile_per_sheet(tmp_path: Path) -> None:
    workbook_path = tmp_path / "规划.xlsx"
    workbook = Workbook()
    ws = workbook.active
    ws.title = "每日必买"
    ws.append(["唯一id", "礼包名称", "礼包档位/$"])
    ws.append([20001, "Starter Bundle", 4.99])
    ws.append([20002, "Advanced Bundle", 9.99])
    ws2 = workbook.create_sheet("说明")
    ws2.append(["备注"])
    ws2.append(["这是一页说明"])
    workbook.save(workbook_path)

    profiles = profile_workbook(workbook_path)

    assert [profile.sheet_name for profile in profiles] == ["每日必买", "说明"]
    assert profiles[0].headers == ["唯一id", "礼包名称", "礼包档位/$"]
    assert profiles[0].sample_rows[1]["礼包名称"] == "Advanced Bundle"
    assert profiles[0].is_primary_candidate is True
    assert profiles[1].is_primary_candidate is False


def test_store_persists_table_and_column_profiles(tmp_path: Path) -> None:
    csv_path = tmp_path / "ChargeBundle.csv"
    csv_path.write_text(
        "礼包ID,礼包名,价格\n"
        "KN,GX,N\n"
        "ChargeBundleId,BundleName,BasicGold\n"
        "20001,Starter Bundle,500\n",
        encoding="utf-8",
    )
    db_path = tmp_path / "mapping.db"

    store = CloudMappingStore(db_path)
    store.initialize()
    stored_ids = store.upsert_profiles([profile_csv_file(csv_path)])

    assert len(stored_ids) == 1
    stored = store.list_table_profiles(kind="csv")
    assert len(stored) == 1
    assert stored[0]["logical_name"] == "ChargeBundle"
    columns = store.list_columns_for_table(stored_ids[0])
    assert [column["column_name"] for column in columns] == ["ChargeBundleId", "BundleName", "BasicGold"]
