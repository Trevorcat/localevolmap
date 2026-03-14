from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from cloud_mapping.app.main import create_app
from cloud_mapping.app.profiles import profile_csv_file, profile_workbook


def test_health_endpoint_returns_ok(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("CLOUD_MAPPING_DB_PATH", str(tmp_path / "mapping.db"))

    client = TestClient(create_app())
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ingest_and_query_round_trip(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("CLOUD_MAPPING_DB_PATH", str(tmp_path / "mapping.db"))
    client = TestClient(create_app())

    csv_path = tmp_path / "ChargeBundle.csv"
    csv_path.write_text(
        "礼包ID,礼包名,价格\n"
        "KN,GX,N\n"
        "ChargeBundleId,BundleName,BasicGold\n"
        "20001,Starter Bundle,500\n",
        encoding="utf-8",
    )
    workbook_path = tmp_path / "【规划】003 商业化.xlsx"

    from openpyxl import Workbook

    workbook = Workbook()
    ws = workbook.active
    ws.title = "每日必买"
    ws.append(["唯一id", "礼包名称", "礼包档位/$"])
    ws.append([20001, "Starter Bundle", 4.99])
    workbook.save(workbook_path)

    ingest_response = client.post(
        "/api/v1/ingest/profiles",
        json={
            "profiles": [
                profile_csv_file(csv_path).to_record() | {
                    "columns": [column.__dict__ for column in profile_csv_file(csv_path).columns]
                }
            ]
        },
    )

    assert ingest_response.status_code == 200
    assert ingest_response.json()["ingested"] == 1

    query_profile = profile_workbook(workbook_path)[0]
    query_response = client.post(
        "/api/v1/query/candidates",
        json={
            "query_profile": query_profile.to_record() | {
                "columns": [column.__dict__ for column in query_profile.columns]
            },
            "limit": 3,
        },
    )

    assert query_response.status_code == 200
    payload = query_response.json()
    assert payload["initial_candidate_count"] == 1
    assert payload["candidates"][0]["logical_name"] == "ChargeBundle"
