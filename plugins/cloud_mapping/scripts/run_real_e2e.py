from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib import request

from cloud_mapping.app.evaluator import apply_evomap_rerank, calculate_contributions
from cloud_mapping.app.evomap import EvoMapClient
from cloud_mapping.app.llm import LlmClient
from cloud_mapping.app.profiles import profile_workbook


def _post_json(url: str, payload: dict) -> dict:
    req = request.Request(
        url,
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
    )
    with request.urlopen(req, timeout=300) as response:
        return json.loads(response.read().decode("utf-8"))


def _select_query_profile(workbook_path: Path, preferred_sheet: str | None = None):
    profiles = profile_workbook(workbook_path)
    if preferred_sheet:
        for profile in profiles:
            if profile.sheet_name == preferred_sheet:
                return profile
    def score(profile):
        non_empty_headers = sum(1 for header in profile.headers if header.strip())
        penalty = 5 if profile.sheet_name in {"数值设计", "说明", "备注"} else 0
        return (non_empty_headers * 2) + len(profile.sample_rows) - penalty
    return max(profiles, key=score)


def run_e2e(workbook_path: Path, server_url: str, report_path: Path, preferred_sheet: str | None = None) -> Path:
    query_profile = _select_query_profile(workbook_path, preferred_sheet=preferred_sheet)
    query_payload = query_profile.to_record() | {
        "headers": query_profile.headers,
        "sample_rows": query_profile.sample_rows,
        "columns": [column.__dict__ for column in query_profile.columns],
    }
    mapping_result = _post_json(f"{server_url.rstrip('/')}/api/v1/query/candidates", {"query_profile": query_payload, "limit": 8})
    candidates = mapping_result["candidates"]
    mapping_candidate_count = len(candidates)

    evomap_result = {"genes": [], "capsules": []}
    evomap_candidate_count = mapping_candidate_count
    selected_by_llm = candidates[0]["logical_name"] if candidates else None
    selected_rationale = "No candidate available"
    llm_available = False

    evomap_url = os.getenv("CLOUD_MAPPING_EVOMAP_URL")
    evomap_api_key = os.getenv("CLOUD_MAPPING_EVOMAP_API_KEY")
    task_id = None
    if evomap_url and evomap_api_key and candidates:
        evomap = EvoMapClient(evomap_url, evomap_api_key)
        started = evomap.start_task(
            {
                "client": "cloud-mapping-e2e",
                "workspace": str(workbook_path.parent),
                "goal": f"Find matching CSV tables for {workbook_path.name}",
                "initialSignals": [workbook_path.stem, query_profile.sheet_name or "", *[item["logical_name"] for item in candidates[:3]]],
            }
        )
        task_id = started.get("taskId")
        evomap_result = evomap.search_knowledge(
            {
                "taskId": task_id,
                "signals": [workbook_path.stem, query_profile.sheet_name or "", *query_profile.headers[:3]],
                "workspace": str(workbook_path.parent),
                "limit": 5,
            }
        )
        candidates = apply_evomap_rerank(candidates, evomap_result)
        evomap_candidate_count = min(len(candidates), 3)
        candidates = candidates[:evomap_candidate_count]

    llm_base_url = os.getenv("CLOUD_MAPPING_LLM_BASE_URL")
    llm_api_key = os.getenv("CLOUD_MAPPING_LLM_API_KEY")
    llm_model = os.getenv("CLOUD_MAPPING_LLM_MODEL")
    if llm_base_url and llm_api_key and llm_model and candidates:
        try:
            llm = LlmClient(llm_base_url, llm_api_key, llm_model)
            prompt = json.dumps(
                {
                    "workbook": workbook_path.name,
                    "sheet": query_profile.sheet_name,
                    "headers": query_profile.headers,
                    "candidates": candidates,
                },
                ensure_ascii=False,
                indent=2,
            )
            llm_result = llm.choose_candidate(prompt)
            selected_by_llm = llm_result.get("selected_table", selected_by_llm)
            selected_rationale = llm_result.get("rationale", "")
            llm_available = True
        except Exception as exc:
            selected_rationale = f"LLM unavailable, fallback to top candidate: {exc}"

    contributions = calculate_contributions(
        initial_candidate_count=int(mapping_result["initial_candidate_count"]),
        mapping_candidate_count=max(mapping_candidate_count, 1),
        evomap_candidate_count=max(evomap_candidate_count, 1),
        final_candidate_count=1 if llm_available and selected_by_llm else max(evomap_candidate_count, 1),
    )

    if task_id and evomap_url and evomap_api_key:
        evomap = EvoMapClient(evomap_url, evomap_api_key)
        used_knowledge = []
        if evomap_result.get("genes"):
            used_knowledge.append({"kind": "gene", "id": evomap_result["genes"][0]["id"], "phase": "plan"})
        if evomap_result.get("capsules"):
            used_knowledge.append({"kind": "capsule", "id": evomap_result["capsules"][0]["id"], "phase": "plan"})
        try:
            if used_knowledge:
                evomap.record_usage(task_id, used_knowledge)
            evomap.finalize_task(
                task_id,
                {
                    "summary": f"Selected {selected_by_llm or 'unknown'} for {workbook_path.name}",
                    "outcome": {"status": "success", "score": 0.85},
                    "retrospective": {
                        "signals": [workbook_path.stem, query_profile.sheet_name or ""],
                        "validations": [
                            {
                                "command": "plugins/plugins/cloud_mapping/scripts/run_real_e2e.py",
                                "passed": bool(selected_by_llm),
                                "notes": selected_rationale,
                            }
                        ],
                    },
                    "createCapsule": True,
                },
            )
        except Exception as exc:
            selected_rationale = f"{selected_rationale}\nEvomap finalize skipped: {exc}"

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        "\n".join(
            [
                f"# Cloud Mapping E2E Report - {workbook_path.name}",
                "",
                f"- Sheet: `{query_profile.sheet_name}`",
                f"- Initial candidates: {mapping_result['initial_candidate_count']}",
                f"- Mapping candidates: {mapping_candidate_count}",
                f"- Evomap candidates: {evomap_candidate_count}",
                f"- Final selected table: `{selected_by_llm}`",
                f"- LLM available: {llm_available}",
                "",
                "## Contribution Percentages",
                f"- Mapping: {contributions['mapping_percent']:.2f}%",
                f"- LocalEvomap: {contributions['evomap_percent']:.2f}%",
                f"- LLM: {contributions['llm_percent']:.2f}%",
                "",
                "## Mapping Candidates",
                *[f"- `{item['logical_name']}` score={item['score']}" for item in candidates],
                "",
                "## LLM Rationale",
                selected_rationale,
            ]
        ),
        encoding="utf-8",
    )
    return report_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the real workbook-to-CSV end-to-end evaluation flow.")
    parser.add_argument("--workbook", required=True)
    parser.add_argument("--server-url", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--sheet-name")
    args = parser.parse_args()
    report_path = run_e2e(Path(args.workbook), args.server_url, Path(args.report), preferred_sheet=args.sheet_name)
    print(report_path)


if __name__ == "__main__":
    main()


