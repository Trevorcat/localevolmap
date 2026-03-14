from __future__ import annotations

from fastapi import FastAPI

from cloud_mapping.app.api import build_router
from cloud_mapping.app.config import load_config
from cloud_mapping.app.db import CloudMappingStore


def create_app() -> FastAPI:
    config = load_config()
    app = FastAPI(title="cloud-mapping", version="0.1.0")
    store = CloudMappingStore(config.db_path)
    store.initialize()

    @app.get("/health")
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "host": config.host,
            "port": config.port,
            "db_path": str(config.db_path),
        }

    app.include_router(build_router(store))

    return app


app = create_app()
