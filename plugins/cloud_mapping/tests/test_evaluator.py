from __future__ import annotations

from cloud_mapping.app.evaluator import apply_evomap_rerank, calculate_contributions


def test_calculate_contributions_uses_stage_reduction() -> None:
    metrics = calculate_contributions(
        initial_candidate_count=1200,
        mapping_candidate_count=12,
        evomap_candidate_count=3,
        final_candidate_count=1,
    )

    assert round(metrics["mapping_percent"], 2) == 99.08
    assert round(metrics["evomap_percent"], 2) == 0.75
    assert round(metrics["llm_percent"], 2) == 0.17


def test_apply_evomap_rerank_boosts_matching_candidate_names() -> None:
    candidates = [
        {"logical_name": "ActivityParam", "score": 0.55},
        {"logical_name": "ChargeBundle", "score": 0.45},
    ]
    knowledge = {
        "capsules": [
            {"summary": "商业化礼包问题最终命中了 ChargeBundle 和 BundleGroup"}
        ],
        "genes": [],
    }

    reranked = apply_evomap_rerank(candidates, knowledge)

    assert reranked[0]["logical_name"] == "ChargeBundle"
    assert reranked[0]["score"] > reranked[1]["score"]
