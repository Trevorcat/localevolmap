from __future__ import annotations

from typing import Any


def calculate_contributions(
    *,
    initial_candidate_count: int,
    mapping_candidate_count: int,
    evomap_candidate_count: int,
    final_candidate_count: int,
) -> dict[str, float]:
    total_reduction = max(initial_candidate_count - final_candidate_count, 0)
    if total_reduction == 0:
        return {
            "mapping_percent": 0.0,
            "evomap_percent": 0.0,
            "llm_percent": 0.0,
        }

    mapping_reduction = max(initial_candidate_count - mapping_candidate_count, 0)
    evomap_reduction = max(mapping_candidate_count - evomap_candidate_count, 0)
    llm_reduction = max(evomap_candidate_count - final_candidate_count, 0)
    return {
        "mapping_percent": (mapping_reduction / total_reduction) * 100,
        "evomap_percent": (evomap_reduction / total_reduction) * 100,
        "llm_percent": (llm_reduction / total_reduction) * 100,
    }


def apply_evomap_rerank(candidates: list[dict[str, Any]], knowledge: dict[str, Any]) -> list[dict[str, Any]]:
    summaries = [
        str(item.get("summary", ""))
        for key in ("capsules", "genes")
        for item in knowledge.get(key, [])
        if isinstance(item, dict)
    ]
    reranked: list[dict[str, Any]] = []
    for candidate in candidates:
        boosted = dict(candidate)
        logical_name = str(candidate.get("logical_name", ""))
        bonus = 0.0
        for summary in summaries:
            if logical_name and logical_name.casefold() in summary.casefold():
                bonus += 0.2
        boosted["score"] = round(float(candidate.get("score", 0.0)) + bonus, 4)
        reranked.append(boosted)
    return sorted(reranked, key=lambda item: float(item.get("score", 0.0)), reverse=True)
