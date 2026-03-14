from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    db_path: Path
    evomap_url: str | None
    evomap_api_key: str | None
    llm_base_url: str | None
    llm_api_key: str | None
    llm_model: str | None


def load_config(base_dir: Path | None = None) -> AppConfig:
    root = (base_dir or Path(__file__).resolve().parents[1]).resolve()
    db_path = Path(os.getenv("CLOUD_MAPPING_DB_PATH", root / "data" / "mapping.db"))

    return AppConfig(
        host=os.getenv("CLOUD_MAPPING_HOST", "0.0.0.0"),
        port=int(os.getenv("CLOUD_MAPPING_PORT", "8010")),
        db_path=db_path,
        evomap_url=os.getenv("CLOUD_MAPPING_EVOMAP_URL"),
        evomap_api_key=os.getenv("CLOUD_MAPPING_EVOMAP_API_KEY"),
        llm_base_url=os.getenv("CLOUD_MAPPING_LLM_BASE_URL"),
        llm_api_key=os.getenv("CLOUD_MAPPING_LLM_API_KEY"),
        llm_model=os.getenv("CLOUD_MAPPING_LLM_MODEL"),
    )
