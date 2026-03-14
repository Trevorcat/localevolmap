from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from cloud_mapping.app.db import CloudMappingStore
from cloud_mapping.app.matcher import discover_relations, rank_column_candidates, rank_table_candidates
from cloud_mapping.app.profiles import table_profile_from_payload


class IngestProfilesRequest(BaseModel):
    profiles: list[dict]


class QueryCandidatesRequest(BaseModel):
    query_profile: dict
    limit: int = Field(default=5, ge=1, le=50)


def build_router(store: CloudMappingStore) -> APIRouter:
    router = APIRouter()

    @router.post("/api/v1/ingest/profiles")
    def ingest_profiles(request: IngestProfilesRequest) -> dict[str, object]:
        profiles = [table_profile_from_payload(item) for item in request.profiles]
        ids = store.upsert_profiles(profiles)
        return {"ingested": len(ids), "table_profile_ids": ids}

    @router.post("/api/v1/query/candidates")
    def query_candidates(request: QueryCandidatesRequest) -> dict[str, object]:
        query = table_profile_from_payload(request.query_profile)
        candidates = store.load_table_profiles(kind="csv")
        ranked = rank_table_candidates(query, candidates)[: request.limit]
        relation_hints = discover_relations([*candidates[: request.limit], *([query] if query.kind != "csv" else [])])
        return {
            "initial_candidate_count": len(candidates),
            "candidates": [
                {
                    "logical_name": item.table.logical_name,
                    "source_path": str(item.table.source_path),
                    "score": item.score,
                    "reasons": item.reasons,
                    "column_candidates": {
                        key: [candidate.__dict__ for candidate in value[:3]]
                        for key, value in rank_column_candidates(query, item.table).items()
                    },
                }
                for item in ranked
            ],
            "relation_hints": [hint.__dict__ for hint in relation_hints[:10]],
        }

    return router
