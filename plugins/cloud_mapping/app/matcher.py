from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from cloud_mapping.app.profiles import ColumnProfile, TableProfile


def _tokens(value: str) -> set[str]:
    normalized = re.sub(r"[^\w\u4e00-\u9fff]+", " ", value).casefold()
    return {token for token in normalized.split() if token}


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, left.casefold(), right.casefold()).ratio()


def _header_overlap(query: TableProfile, candidate: TableProfile) -> float:
    flattened_left = set().union(*[_tokens(column.normalized_name) for column in query.columns]) if query.columns else set()
    flattened_right = set().union(*[_tokens(column.normalized_name) for column in candidate.columns]) if candidate.columns else set()
    if not flattened_left or not flattened_right:
        return 0.0
    return len(flattened_left & flattened_right) / len(flattened_left | flattened_right)


def _sample_overlap(query: TableProfile, candidate: TableProfile) -> float:
    left_values = {
        token
        for row in query.sample_rows
        for value in row.values()
        if isinstance(value, str) and value.strip()
        for token in _tokens(value)
    }
    right_values = {
        token
        for row in candidate.sample_rows
        for value in row.values()
        if isinstance(value, str) and value.strip()
        for token in _tokens(value)
    }
    if not left_values or not right_values:
        return 0.0
    return len(left_values & right_values) / len(left_values | right_values)


@dataclass(frozen=True)
class RankedTableCandidate:
    table: TableProfile
    score: float
    reasons: list[str]


@dataclass(frozen=True)
class RankedColumnCandidate:
    column_name: str
    score: float


@dataclass(frozen=True)
class RelationHint:
    left_table: str
    left_column: str
    right_table: str
    right_column: str
    confidence: float


def rank_table_candidates(query: TableProfile, candidates: list[TableProfile]) -> list[RankedTableCandidate]:
    ranked: list[RankedTableCandidate] = []
    query_name = f"{query.logical_name} {query.sheet_name or ''}".strip()
    for candidate in candidates:
        name_score = max(
            _similarity(query_name, candidate.logical_name),
            max((_similarity(header, candidate.logical_name) for header in query.headers), default=0.0),
        )
        header_score = _header_overlap(query, candidate)
        sample_score = _sample_overlap(query, candidate)
        score = round((name_score * 0.45) + (header_score * 0.3) + (sample_score * 0.25), 4)
        reasons = [
            f"name={name_score:.2f}",
            f"headers={header_score:.2f}",
            f"samples={sample_score:.2f}",
        ]
        ranked.append(RankedTableCandidate(table=candidate, score=score, reasons=reasons))
    return sorted(ranked, key=lambda item: item.score, reverse=True)


def _column_value_overlap(left: ColumnProfile, right: ColumnProfile) -> float:
    left_values = {token for value in left.sample_values if value for token in _tokens(value)}
    right_values = {token for value in right.sample_values if value for token in _tokens(value)}
    if not left_values or not right_values:
        return 0.0
    return len(left_values & right_values) / len(left_values | right_values)


def rank_column_candidates(query: TableProfile, candidate: TableProfile) -> dict[str, list[RankedColumnCandidate]]:
    ranked: dict[str, list[RankedColumnCandidate]] = {}
    for query_column in query.columns:
        bucket: list[RankedColumnCandidate] = []
        for candidate_column in candidate.columns:
            name_score = max(
                _similarity(query_column.column_name, candidate_column.column_name),
                _similarity(query_column.normalized_name, candidate_column.normalized_name),
            )
            type_score = 1.0 if query_column.inferred_type == candidate_column.inferred_type else 0.0
            value_score = _column_value_overlap(query_column, candidate_column)
            unique_score = 1.0 - abs(query_column.unique_ratio - candidate_column.unique_ratio)
            score = round((name_score * 0.45) + (type_score * 0.2) + (value_score * 0.25) + (max(unique_score, 0.0) * 0.1), 4)
            bucket.append(RankedColumnCandidate(column_name=candidate_column.column_name, score=score))
        ranked[query_column.column_name] = sorted(bucket, key=lambda item: item.score, reverse=True)
    return ranked


def discover_relations(tables: list[TableProfile]) -> list[RelationHint]:
    hints: list[RelationHint] = []
    for left_index, left_table in enumerate(tables):
        for right_table in tables[left_index + 1 :]:
            for left_column in left_table.columns:
                for right_column in right_table.columns:
                    overlap = _column_value_overlap(left_column, right_column)
                    name_score = _similarity(left_column.column_name, right_column.column_name)
                    if overlap >= 0.5 or (name_score >= 0.6 and max(left_column.unique_ratio, right_column.unique_ratio) >= 0.5):
                        hints.append(
                            RelationHint(
                                left_table=left_table.logical_name,
                                left_column=left_column.column_name,
                                right_table=right_table.logical_name,
                                right_column=right_column.column_name,
                                confidence=round(max(overlap, name_score), 4),
                            )
                        )
    return sorted(hints, key=lambda item: item.confidence, reverse=True)
