from __future__ import annotations

import json
import urllib.request
from typing import Any


class EvoMapClient:
    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            method=method,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            data=None if payload is None else json.dumps(payload).encode("utf-8"),
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read().decode("utf-8")
        return json.loads(body) if body else {}

    def start_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/api/v1/tasks", payload)

    def search_knowledge(self, payload: dict[str, Any]) -> dict[str, Any]:
        task_id = payload.get("taskId")
        if task_id:
            scoped = dict(payload)
            scoped.pop("taskId", None)
            return self._request("POST", f"/api/v1/tasks/{task_id}/search", scoped)
        return self._request("POST", "/api/v1/knowledge/search", payload)

    def record_usage(self, task_id: str, knowledge: list[dict[str, Any]]) -> dict[str, Any]:
        return self._request("POST", f"/api/v1/tasks/{task_id}/usage", {"knowledge": knowledge})

    def finalize_task(self, task_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", f"/api/v1/tasks/{task_id}/finalize", payload)
