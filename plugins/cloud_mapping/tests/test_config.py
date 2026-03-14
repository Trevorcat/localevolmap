from __future__ import annotations

from pathlib import Path

from cloud_mapping.app.config import AppConfig, load_config


def test_load_config_defaults(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("CLOUD_MAPPING_DB_PATH", raising=False)
    monkeypatch.delenv("CLOUD_MAPPING_HOST", raising=False)
    monkeypatch.delenv("CLOUD_MAPPING_PORT", raising=False)

    config = load_config(base_dir=tmp_path)

    assert isinstance(config, AppConfig)
    assert config.host == "0.0.0.0"
    assert config.port == 8010
    assert config.db_path == tmp_path / "data" / "mapping.db"


def test_load_config_honors_environment(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("CLOUD_MAPPING_DB_PATH", str(tmp_path / "custom.db"))
    monkeypatch.setenv("CLOUD_MAPPING_HOST", "127.0.0.1")
    monkeypatch.setenv("CLOUD_MAPPING_PORT", "8123")

    config = load_config(base_dir=tmp_path)

    assert config.host == "127.0.0.1"
    assert config.port == 8123
    assert config.db_path == tmp_path / "custom.db"
