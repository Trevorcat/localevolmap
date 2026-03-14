from __future__ import annotations

from pathlib import Path

from openpyxl import Workbook

from cloud_mapping.app.matcher import discover_relations, rank_column_candidates, rank_table_candidates
from cloud_mapping.app.profiles import profile_csv_file, profile_workbook


def test_rank_table_candidates_prefers_name_and_header_overlap(tmp_path: Path) -> None:
    workbook_path = tmp_path / "【规划】003 商业化.xlsx"
    workbook = Workbook()
    ws = workbook.active
    ws.title = "每日必买"
    ws.append(["唯一id", "礼包名称", "礼包档位/$"])
    ws.append([20001, "Starter Bundle", 4.99])
    workbook.save(workbook_path)

    charge_bundle = tmp_path / "ChargeBundle.csv"
    charge_bundle.write_text(
        "礼包ID,礼包名,价格\n"
        "KN,GX,N\n"
        "ChargeBundleId,BundleName,BasicGold\n"
        "20001,Starter Bundle,500\n",
        encoding="utf-8",
    )
    activity_param = tmp_path / "ActivityParam.csv"
    activity_param.write_text(
        "活动ID,礼包组id\n"
        "KN,AN\n"
        "ActivityParamId,BundleGroupID\n"
        "1001,100\n",
        encoding="utf-8",
    )

    query = profile_workbook(workbook_path)[0]
    candidates = [profile_csv_file(charge_bundle), profile_csv_file(activity_param)]

    ranked = rank_table_candidates(query, candidates)

    assert ranked[0].table.logical_name == "ChargeBundle"
    assert ranked[0].score > ranked[1].score


def test_rank_column_candidates_prefers_semantically_close_columns(tmp_path: Path) -> None:
    workbook_path = tmp_path / "【规划】003 商业化.xlsx"
    workbook = Workbook()
    ws = workbook.active
    ws.title = "每日必买"
    ws.append(["唯一id", "礼包名称", "礼包档位/$"])
    ws.append([20001, "Starter Bundle", 4.99])
    workbook.save(workbook_path)

    csv_path = tmp_path / "ChargeBundle.csv"
    csv_path.write_text(
        "礼包ID,礼包名,价格\n"
        "KN,GX,N\n"
        "ChargeBundleId,BundleName,BasicGold\n"
        "20001,Starter Bundle,500\n",
        encoding="utf-8",
    )

    query = profile_workbook(workbook_path)[0]
    candidate = profile_csv_file(csv_path)

    ranked = rank_column_candidates(query, candidate)

    assert ranked["唯一id"][0].column_name == "ChargeBundleId"
    assert ranked["礼包名称"][0].column_name == "BundleName"


def test_discover_relations_finds_overlap_between_id_columns(tmp_path: Path) -> None:
    left = tmp_path / "ChargeBundle.csv"
    left.write_text(
        "礼包ID,礼包名\n"
        "KN,GX\n"
        "ChargeBundleId,BundleName\n"
        "20001,Starter Bundle\n"
        "20002,Advanced Bundle\n",
        encoding="utf-8",
    )
    right = tmp_path / "BundleGroup.csv"
    right.write_text(
        "组ID,礼包列表\n"
        "KN,AN\n"
        "BundleGroupId,ChargeBundleIds\n"
        "100,20001;20002\n",
        encoding="utf-8",
    )

    relations = discover_relations([profile_csv_file(left), profile_csv_file(right)])

    assert any(relation.right_table == "BundleGroup" for relation in relations)
