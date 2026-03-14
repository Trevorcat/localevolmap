from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from cloud_mapping.app.profiles import ColumnProfile, TableProfile


class CloudMappingStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS table_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_path TEXT NOT NULL,
                    scope_key TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    logical_name TEXT NOT NULL,
                    sheet_name TEXT,
                    sheet_index INTEGER,
                    is_primary_candidate INTEGER NOT NULL DEFAULT 0,
                    headers_json TEXT NOT NULL,
                    sample_rows_json TEXT NOT NULL,
                    data_row_count INTEGER NOT NULL,
                    UNIQUE(source_path, scope_key)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS column_profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    table_profile_id INTEGER NOT NULL,
                    column_name TEXT NOT NULL,
                    normalized_name TEXT NOT NULL,
                    inferred_type TEXT NOT NULL,
                    unique_ratio REAL NOT NULL,
                    null_ratio REAL NOT NULL,
                    sample_values_json TEXT NOT NULL,
                    top_values_json TEXT NOT NULL,
                    FOREIGN KEY(table_profile_id) REFERENCES table_profiles(id) ON DELETE CASCADE
                )
                """
            )

    def upsert_profiles(self, profiles: list[TableProfile]) -> list[int]:
        stored_ids: list[int] = []
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            for profile in profiles:
                existing = conn.execute(
                    "SELECT id FROM table_profiles WHERE source_path = ? AND scope_key = ?",
                    (str(profile.source_path), profile.sheet_name or ""),
                ).fetchone()
                record = profile.to_record()
                if existing:
                    table_id = int(existing[0])
                    conn.execute(
                        """
                        UPDATE table_profiles
                        SET scope_key = :scope_key,
                            kind = :kind,
                            logical_name = :logical_name,
                            sheet_name = :sheet_name,
                            sheet_index = :sheet_index,
                            is_primary_candidate = :is_primary_candidate,
                            headers_json = :headers_json,
                            sample_rows_json = :sample_rows_json,
                            data_row_count = :data_row_count
                        WHERE id = :id
                        """,
                        {**record, "id": table_id},
                    )
                    conn.execute("DELETE FROM column_profiles WHERE table_profile_id = ?", (table_id,))
                else:
                    cursor = conn.execute(
                        """
                        INSERT INTO table_profiles (
                            source_path, scope_key, kind, logical_name, sheet_name, sheet_index,
                            is_primary_candidate, headers_json, sample_rows_json, data_row_count
                        ) VALUES (
                            :source_path, :scope_key, :kind, :logical_name, :sheet_name, :sheet_index,
                            :is_primary_candidate, :headers_json, :sample_rows_json, :data_row_count
                        )
                        """,
                        record,
                    )
                    table_id = int(cursor.lastrowid)

                for column in profile.columns:
                    conn.execute(
                        """
                        INSERT INTO column_profiles (
                            table_profile_id, column_name, normalized_name, inferred_type,
                            unique_ratio, null_ratio, sample_values_json, top_values_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            table_id,
                            column.column_name,
                            column.normalized_name,
                            column.inferred_type,
                            column.unique_ratio,
                            column.null_ratio,
                            json.dumps(column.sample_values, ensure_ascii=False),
                            json.dumps(column.top_values, ensure_ascii=False),
                        ),
                    )
                stored_ids.append(table_id)
            conn.commit()
        return stored_ids

    def list_table_profiles(self, kind: str | None = None) -> list[dict[str, object]]:
        query = "SELECT id, source_path, kind, logical_name, sheet_name, sheet_index, is_primary_candidate, headers_json, sample_rows_json, data_row_count FROM table_profiles"
        params: tuple[object, ...] = ()
        if kind:
            query += " WHERE kind = ?"
            params = (kind,)
        query += " ORDER BY id"
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()
        return [
            {
                "id": row[0],
                "source_path": row[1],
                "kind": row[2],
                "logical_name": row[3],
                "sheet_name": row[4],
                "sheet_index": row[5],
                "is_primary_candidate": bool(row[6]),
                "headers": json.loads(row[7]),
                "sample_rows": json.loads(row[8]),
                "data_row_count": row[9],
            }
            for row in rows
        ]

    def load_table_profiles(self, kind: str | None = None) -> list[TableProfile]:
        raw_tables = self.list_table_profiles(kind=kind)
        profiles: list[TableProfile] = []
        for raw_table in raw_tables:
            columns_raw = self.list_columns_for_table(int(raw_table["id"]))
            columns = [
                ColumnProfile(
                    column_name=str(item["column_name"]),
                    normalized_name=str(item["normalized_name"]),
                    inferred_type=str(item["inferred_type"]),
                    unique_ratio=float(item["unique_ratio"]),
                    null_ratio=float(item["null_ratio"]),
                    sample_values=[str(value) for value in item["sample_values"]],
                    top_values=[str(value) for value in item["top_values"]],
                )
                for item in columns_raw
            ]
            profiles.append(
                TableProfile(
                    source_path=Path(str(raw_table["source_path"])),
                    kind=str(raw_table["kind"]),
                    logical_name=str(raw_table["logical_name"]),
                    headers=[str(value) for value in raw_table["headers"]],
                    columns=columns,
                    sample_rows=[{str(key): str(value) for key, value in row.items()} for row in raw_table["sample_rows"]],
                    data_row_count=int(raw_table["data_row_count"]),
                    sheet_name=str(raw_table["sheet_name"]) if raw_table["sheet_name"] is not None else None,
                    sheet_index=int(raw_table["sheet_index"]) if raw_table["sheet_index"] is not None else None,
                    is_primary_candidate=bool(raw_table["is_primary_candidate"]),
                )
            )
        return profiles

    def list_columns_for_table(self, table_profile_id: int) -> list[dict[str, object]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                "SELECT column_name, normalized_name, inferred_type, unique_ratio, null_ratio, sample_values_json, top_values_json FROM column_profiles WHERE table_profile_id = ? ORDER BY id",
                (table_profile_id,),
            ).fetchall()
        return [
            {
                "column_name": row[0],
                "normalized_name": row[1],
                "inferred_type": row[2],
                "unique_ratio": row[3],
                "null_ratio": row[4],
                "sample_values": json.loads(row[5]),
                "top_values": json.loads(row[6]),
            }
            for row in rows
        ]
