"""
FastAPI backend server for See&Say Application
Uses external MongoDB manager from storage_manager.py
"""

from fastapi import FastAPI, HTTPException, UploadFile
from pydantic import BaseModel
from typing import Optional, List
import logging
import os
import csv
import json
import re
import uuid
import random
import base64
from datetime import datetime
from dotenv import load_dotenv

# ✅ Import your existing storage manager
from MongoDB import SeeSayMongoStorage


from fastapi.middleware.cors import CORSMiddleware
from fastapi import BackgroundTasks

from typing import Optional
import traceback

from AI_Models_API import * ## NEW LINE

# ------------------------------------------------------
# Setup
# ------------------------------------------------------
load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mongodb_url = os.environ.get("MONGODB_URL")
database_name = os.environ.get("DATABASE_NAME")

# Initialize MongoDB storage manager
storage = SeeSayMongoStorage(mongodb_url, database_name)
GEMINI_DAILY_LIMIT = int(os.environ.get("GEMINI_DAILY_LIMIT", "200"))
_raw_max_seg = int(os.environ.get("GEMINI_MAX_SEGMENT_SECONDS", "30"))
# Keep server trim cap >= frontend expression window (30s). Older .env files used 20.
if _raw_max_seg < 30:
    logger.warning(
        "GEMINI_MAX_SEGMENT_SECONDS=%s is below 30; raising to 30 so stored clips match the 30s expression timer "
        "(remove or update GEMINI_MAX_SEGMENT_SECONDS in your environment if you relied on the old value).",
        _raw_max_seg,
    )
GEMINI_MAX_SEGMENT_SECONDS = max(30, _raw_max_seg)
logger.info(
    "Expression clip trim + Gemini scoring window cap: GEMINI_MAX_SEGMENT_SECONDS=%s "
    "(override with env GEMINI_MAX_SEGMENT_SECONDS; minimum 30)",
    GEMINI_MAX_SEGMENT_SECONDS,
)
GEMINI_IMPRESSION_DAILY_LIMIT = int(os.environ.get("GEMINI_IMPRESSION_DAILY_LIMIT", "200"))
GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS = int(os.environ.get("GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS", "2800"))
EXPRESSION_IMPRESSION_SAMPLE_CAP = int(os.environ.get("EXPRESSION_IMPRESSION_SAMPLE_CAP", "10"))


def _csv_pls_category_primary(row: dict) -> str:
    """Broad PLS theme per question: CSV ``category_PLS``; falls back to legacy ``semantics``."""
    v = (row.get("category_PLS") or "").strip()
    if v:
        return v
    return (row.get("semantics") or "").strip()


def _csv_pls_category_sub(row: dict) -> str:
    """Supplementary PLS detail: ``sub_category_PLS``; falls back to legacy ``category PLS``."""
    v = (row.get("sub_category_PLS") or row.get("sub_category_pls") or "").strip()
    if v:
        return v
    return (row.get("category PLS") or row.get("category_pls") or "").strip()


def _expression_csv_path():
    csv_candidates = [
        os.path.join(os.path.dirname(__file__), "..", "frontend_demo", "resources", "query_database.csv"),
        os.path.join(os.path.dirname(__file__), "resources", "query_database.csv"),
    ]
    for c in csv_candidates:
        if os.path.exists(c):
            return c
    return None


def _load_question_rubrics_from_csv():
    """
    Loads expression (הבעה) and comprehension (הבנה) rubric rows from the shared CSV.
    Returns (expression_rubrics, comprehension_rubrics).
    """
    csv_path = _expression_csv_path()
    if not csv_path:
        logger.warning("Question rubric CSV not found; Gemini expression scoring will be skipped.")
        return {}, {}

    expression_rubrics = {}
    comprehension_rubrics = {}
    try:
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                qn = str((row.get("query_number") or "").strip())
                qtype = (row.get("query_type") or "").strip()
                if not qn:
                    continue
                pls_primary = _csv_pls_category_primary(row)
                pls_sub = _csv_pls_category_sub(row)
                if qtype == "הבעה":
                    expression_rubrics[qn] = {
                        "question_text_boy": (row.get("query_boy") or "").strip(),
                        "question_text_girl": (row.get("query_girl") or "").strip(),
                        "question_text_fallback": (row.get("query") or "").strip(),
                        "expected_full": (row.get("expected_full_ai") or row.get("expected_full") or "").strip(),
                        "expected_partial": (row.get("expected_partial") or "").strip(),
                        "expected_wrong": (row.get("expected_wrong") or "").strip(),
                        "comments": (row.get("comments") or "").strip(),
                        "facilitator_hint": (row.get("hint") or "").strip(),
                        "pls_category": pls_primary,
                        "pls_sub_category": pls_sub,
                        "test_goal": (row.get("test goal") or row.get("test_goal") or "").strip(),
                    }
                elif qtype == "הבנה":
                    comprehension_rubrics[qn] = {
                        "pls_category": pls_primary,
                        "pls_sub_category": pls_sub,
                    }
    except Exception as e:
        logger.warning(f"Failed to load question rubrics from CSV: {e}")
        return {}, {}

    return expression_rubrics, comprehension_rubrics


EXPRESSION_RUBRICS, COMPREHENSION_RUBRICS = _load_question_rubrics_from_csv()


def _parse_results_from_full_array(full_array_str, array_key):
    """
    Parse comprehension or expression tuples from full_array JSON.
    Returns [(question_number:str, headlight_result:str), ...]
    """
    try:
        parsed = json.loads(full_array_str)
    except Exception:
        return []

    chunk = parsed.get(array_key) if isinstance(parsed, dict) else None
    if not isinstance(chunk, str):
        return []

    matches = re.findall(r'\((\d+),"([^"]+)"\)', chunk)
    return [(m[0], m[1]) for m in matches]


def _parse_expression_results_from_full_array(full_array_str):
    return _parse_results_from_full_array(full_array_str, "expression")


def _parse_comprehension_results_from_full_array(full_array_str):
    return _parse_results_from_full_array(full_array_str, "comprehension")


def _normalize_headlight_result(result: str) -> str:
    r = (result or "").strip().lower()
    if r in ("correct", "partly", "wrong"):
        return r
    if r in ("partial", "partially"):
        return "partly"
    if r in ("incorrect", "fail", "failed"):
        return "wrong"
    return r or "partly"


def _build_comprehension_impression_entries(full_array_str):
    """
    Join comprehension traffic results from full_array with category_PLS / sub_category_PLS from CSV.
    No hints, goals, or question text — results + PLS columns only.
    """
    items = _parse_comprehension_results_from_full_array(full_array_str)
    if not items:
        return []

    entries = []
    for question_number, headlight_result in items:
        rubric = COMPREHENSION_RUBRICS.get(str(question_number)) or {}
        entries.append({
            "question_number": int(question_number),
            "headlight_result": _normalize_headlight_result(headlight_result),
            "pls_category": (rubric.get("pls_category") or "").strip(),
            "pls_sub_category": (rubric.get("pls_sub_category") or "").strip(),
        })

    entries.sort(key=lambda e: e["question_number"])
    return entries


def _run_expressive_language_impression(
    impression_pool,
    full_array_str,
    child_age_label_he,
):
    """
    One impression Gemini call: optional comprehension text block + up to N expression audio samples.
    Returns expressive_language_impression dict (status done/skipped/failed).
    """
    comprehension_entries = _build_comprehension_impression_entries(full_array_str)
    k = min(EXPRESSION_IMPRESSION_SAMPLE_CAP, len(impression_pool)) if impression_pool else 0
    chosen = random.sample(impression_pool, k=k) if k else []

    if not chosen and not comprehension_entries:
        return {
            "status": "skipped",
            "reason": "no_eligible_samples",
            "sample_count_used": 0,
            "comprehension_items_submitted": 0,
            "data_quality": "limited",
            "limitations_he": "לא נאספו דגימות הבעה עם קטע שמע תקין ולא נמצאו תוצאות הבנה.",
        }

    impression_allowed = storage.check_and_increment_daily_quota(
        quota_key="gemini_expressive_language_impression",
        date_key=datetime.utcnow().strftime("%Y-%m-%d"),
        daily_limit=GEMINI_IMPRESSION_DAILY_LIMIT,
    )
    if not impression_allowed:
        return {
            "status": "skipped",
            "reason": "quota_exceeded",
            "sample_count_used": 0,
            "comprehension_items_submitted": len(comprehension_entries),
            "data_quality": "limited",
            "limitations_he": "המכסה היומית לניתוח התרשמות הבעה נוצלה.",
        }

    entries = []
    for c in chosen:
        entries.append({
            "question_number": c["question_number"],
            "headlight_result": c["headlight_result"],
            "question_text": c["question_text"],
            "context_hint": c.get("context_hint") or "",
            "linguistic_goal_line": c.get("linguistic_goal_line") or "",
            "pls_semantics_area": c.get("pls_semantics_area") or "",
            "pls_category": c.get("pls_category") or "",
            "audio_bytes": c["audio_bytes"],
        })

    logger.info(
        "Gemini expressive_language_impression: expression_samples=%s pool=%s comprehension_items=%s",
        len(entries),
        len(impression_pool),
        len(comprehension_entries),
    )
    imp = summarize_expressive_language_impression_gemini(
        entries,
        child_age_label_he,
        max_output_tokens=GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS,
        comprehension_entries=comprehension_entries,
    )
    if imp:
        return {
            "status": "done",
            **imp,
            "samples_submitted": len(entries),
            "comprehension_items_submitted": len(comprehension_entries),
        }
    return {
        "status": "failed",
        "reason": "model_unavailable_or_invalid_json",
        "sample_count_used": 0,
        "comprehension_items_submitted": len(comprehension_entries),
        "data_quality": "limited",
        "limitations_he": "לא ניתן היה להפיק התרשמות אוטומטית (שירות המודל או פלט לא תקין).",
    }


def _parse_question_timestamps(timestamps_text):
    """
    Supports:
    - Legacy frontend format: [(1,0),(2,65),(3,127)]
    - Event payload format:
      {"version":2,"format":"question_events","events":[{"q":33,"t":1543,"type":"start"},{"q":33,"t":1555,"type":"end"}]}
    Returns dict with:
      starts_by_q: first start second per question
      ends_by_q: explicit end second per question (if provided)
      ordered_starts: list[(question_number:int, second:int)] sorted by second
    """
    parsed = {
        "starts_by_q": {},
        "ends_by_q": {},
        "ordered_starts": [],
    }
    if not timestamps_text:
        return parsed

    text = str(timestamps_text).strip()
    start_events = []
    end_events = []

    if text.startswith("{"):
        try:
            payload = json.loads(text)
            events = payload.get("events") if isinstance(payload, dict) else None
            if isinstance(events, list):
                for ev in events:
                    if not isinstance(ev, dict):
                        continue
                    q = ev.get("q")
                    t = ev.get("t")
                    et = str(ev.get("type") or "start").lower()
                    try:
                        qn = int(q)
                        sec = int(t)
                    except Exception:
                        continue
                    if sec < 0:
                        continue
                    if et == "end":
                        end_events.append((qn, sec))
                    else:
                        start_events.append((qn, sec))
        except Exception:
            # Fall back to legacy parser below.
            start_events = []
            end_events = []

    if not start_events and not end_events:
        pairs = re.findall(r'\((\d+),\s*(\d+)\)', text)
        start_events = [(int(q), int(t)) for q, t in pairs]

    start_events.sort(key=lambda x: x[1])
    end_events.sort(key=lambda x: x[1])

    parsed["ordered_starts"] = start_events
    starts_by_q = parsed["starts_by_q"]
    for qn, sec in start_events:
        if str(qn) not in starts_by_q:
            starts_by_q[str(qn)] = sec

    ends_by_q = parsed["ends_by_q"]
    for qn, sec in end_events:
        key = str(qn)
        start_sec = starts_by_q.get(key)
        if start_sec is None or sec <= start_sec:
            continue
        if key not in ends_by_q:
            ends_by_q[key] = sec

    return parsed


def _timestamp_window_for_question(qn, marks_data):
    """
    Calculates [start, end) window:
      1) start from question start mark
      2) end from explicit question end mark (if present)
      3) fallback end from next start mark in timeline
    """
    if not marks_data:
        return None, None

    key = str(qn)
    starts_by_q = marks_data.get("starts_by_q") or {}
    ends_by_q = marks_data.get("ends_by_q") or {}
    ordered_starts = marks_data.get("ordered_starts") or []

    start = starts_by_q.get(key)
    if start is None:
        return None, None

    explicit_end = ends_by_q.get(key)
    if explicit_end is not None and explicit_end > start:
        return start, explicit_end

    end = None
    for idx, (question_num, sec) in enumerate(ordered_starts):
        if str(question_num) == key and sec == start:
            if idx + 1 < len(ordered_starts):
                end = ordered_starts[idx + 1][1]
            break
    if end is not None and end <= start:
        end = None
    return start, end


def _aggregate_expression_ai(per_question_rows):
    if not per_question_rows:
        return {
            "score_avg": None,
            "score_0_1_2": [],
            "counts": {"0": 0, "1": 0, "2": 0},
            "daily_limit": GEMINI_DAILY_LIMIT,
            "max_segment_seconds": GEMINI_MAX_SEGMENT_SECONDS,
        }

    vals = []
    counts = {"0": 0, "1": 0, "2": 0}
    for row in per_question_rows:
        s = row.get("ai_score")
        if s in [0, 1, 2]:
            vals.append(s)
            counts[str(s)] += 1
    avg = (sum(vals) / len(vals)) if vals else None
    return {
        "score_avg": avg,
        "score_0_1_2": vals,
        "counts": counts,
        "daily_limit": GEMINI_DAILY_LIMIT,
        "max_segment_seconds": GEMINI_MAX_SEGMENT_SECONDS,
    }


def _parent_result_to_score(parent_result):
    norm = str(parent_result or "").strip().lower()
    if norm == "correct":
        return 2
    if norm == "partly":
        return 1
    if norm == "wrong":
        return 0
    return None


def _build_parent_ai_comparison(expression_items, per_question_rows):
    parent_by_q = {}
    for qn, parent_result in (expression_items or []):
        parent_by_q[str(qn)] = parent_result

    rows = []
    match_count = 0
    total_compared = 0
    for row in (per_question_rows or []):
        qn_raw = row.get("question_number")
        qn_key = str(qn_raw)
        parent_result = parent_by_q.get(qn_key)
        parent_score = _parent_result_to_score(parent_result)
        ai_score = row.get("ai_score")
        ai_score_num = ai_score if ai_score in [0, 1, 2] else None
        is_match = (
            parent_score is not None
            and ai_score_num is not None
            and parent_score == ai_score_num
        )
        if parent_score is not None and ai_score_num is not None:
            total_compared += 1
        if is_match:
            match_count += 1
        rows.append({
            "question_number": qn_raw,
            "parent_result": parent_result,
            "parent_score": parent_score,
            "ai_score": ai_score_num,
            "match": bool(is_match),
        })

    match_rate = (match_count / total_compared) if total_compared > 0 else None
    return {
        "match_count": match_count,
        "total_compared": total_compared,
        "match_rate": match_rate,
        "rows": rows,
    }


def _build_pending_expression_ai_payload(test_id, started_at, expression_question_count, phase, processed_questions, per_question_rows=None):
    rows = per_question_rows or []
    return {
        "status": "pending",
        "test_id": test_id,
        "started_at": started_at,
        "per_question": rows,
        "summary": _aggregate_expression_ai(rows),
        "meta": {
            "expression_question_count": expression_question_count,
            "parent_ai_comparison": {
                "status": "pending",
                "match_count": 0,
                "total_compared": 0,
                "match_rate": None,
                "rows": [],
            },
            "progress": {
                "phase": phase,
                "processed_questions": processed_questions,
                "total_questions": expression_question_count,
                "last_updated_at": datetime.utcnow().isoformat() + "Z",
            },
        },
        "expressive_language_impression": {"status": "pending"},
    }


def _trim_expression_clip_bytes(audio_bytes):
    if not audio_bytes:
        return None
    try:
        return slice_audio_window_bytes(
            audio_bytes, 0, float(GEMINI_MAX_SEGMENT_SECONDS), output_format="mp3"
        )
    except Exception:
        return audio_bytes


def _store_trimmed_expression_clip_data_url(audio_file64: str) -> str:
    """
    Persist at most the first GEMINI_MAX_SEGMENT_SECONDS of each clip (MP3).
    Clients may send longer blobs (e.g. delay until traffic tap); Mongo should not store that tail.
    """
    if not audio_file64 or not str(audio_file64).strip():
        return audio_file64 or ""
    try:
        raw = decode_base64_to_bytes(audio_file64)
    except Exception:
        logger.warning("clip trim: decode failed, storing original payload")
        return audio_file64
    trimmed = _trim_expression_clip_bytes(raw)
    if not trimmed:
        return audio_file64
    try:
        b64 = base64.b64encode(trimmed).decode("ascii")
        return "data:audio/mpeg;base64," + b64
    except Exception as e:
        logger.warning(f"clip trim: re-encode failed ({e}), storing original payload")
        return audio_file64


def _impression_pool_entry_from_clip_bytes(
    question_number,
    headlight_result,
    clip_mp3_bytes,
    child_gender,
):
    """Build impression_pool item (with audio_bytes) without calling Gemini scoring."""
    rubric = EXPRESSION_RUBRICS.get(str(question_number))
    if not rubric or not clip_mp3_bytes:
        return None
    normalized_gender = str(child_gender or "").strip().lower()
    is_female = normalized_gender in ["female", "girl"]
    question_text = (
        rubric.get("question_text_girl") if is_female
        else rubric.get("question_text_boy")
    ) or rubric.get("question_text_fallback") or ""
    goal_bits = [
        (rubric.get("pls_category") or "").strip(),
        (rubric.get("pls_sub_category") or "").strip(),
        (rubric.get("test_goal") or "").strip(),
    ]
    linguistic_goal_line = " · ".join(g for g in goal_bits if g)
    hint_lines = []
    if (rubric.get("comments") or "").strip():
        hint_lines.append((rubric.get("comments") or "").strip())
    if (rubric.get("facilitator_hint") or "").strip():
        hint_lines.append((rubric.get("facilitator_hint") or "").strip())
    context_hint = "\n".join(hint_lines)
    return {
        "question_number": int(question_number),
        "headlight_result": headlight_result,
        "audio_bytes": clip_mp3_bytes,
        "question_text": question_text,
        "context_hint": context_hint,
        "linguistic_goal_line": linguistic_goal_line,
        # Keys kept for stored payloads / Gemini: broad = category_PLS, fine = sub_category_PLS.
        "pls_semantics_area": (rubric.get("pls_category") or "").strip(),
        "pls_category": (rubric.get("pls_sub_category") or "").strip(),
    }


def _score_expression_row_from_clip_audio(
    question_number,
    headlight_result,
    clip_mp3_bytes,
    child_gender,
):
    """
    Score a single expression question from an already-segmented MP3 clip (≤ GEMINI_MAX_SEGMENT_SECONDS).
    Returns (row_dict, impression_pool_entry_or_none).
    """
    rubric = EXPRESSION_RUBRICS.get(str(question_number))
    if not rubric:
        return {
            "question_number": int(question_number),
            "headlight_result": headlight_result,
            "ai_score": 1,
            "ai_confidence": 0.0,
            "ai_reason_short": "missing_csv_rubric",
            "ai_flags": ["needs_manual_review"],
            "ai_speaker_observation": None,
            "timestamp_start_sec": 0,
            "timestamp_end_sec": None,
            "score_complete": True,
            "source": "clip",
        }, None

    normalized_gender = str(child_gender or "").strip().lower()
    is_female = normalized_gender in ["female", "girl"]
    question_text = (
        rubric.get("question_text_girl") if is_female
        else rubric.get("question_text_boy")
    ) or rubric.get("question_text_fallback") or ""

    prompt_with_window = (
        question_text
        + f"\n\nRelevant answer window: standalone expression clip (seconds 0–{GEMINI_MAX_SEGMENT_SECONDS} max)."
    )

    goal_bits = [
        (rubric.get("pls_category") or "").strip(),
        (rubric.get("pls_sub_category") or "").strip(),
        (rubric.get("test_goal") or "").strip(),
    ]
    linguistic_goal_line = " · ".join(g for g in goal_bits if g)
    hint_lines = []
    if (rubric.get("comments") or "").strip():
        hint_lines.append((rubric.get("comments") or "").strip())
    if (rubric.get("facilitator_hint") or "").strip():
        hint_lines.append((rubric.get("facilitator_hint") or "").strip())
    context_hint = "\n".join(hint_lines)

    pool_entry = _impression_pool_entry_from_clip_bytes(
        question_number, headlight_result, clip_mp3_bytes, child_gender
    )

    allowed = storage.check_and_increment_daily_quota(
        quota_key="gemini_expression_scoring",
        date_key=datetime.utcnow().strftime("%Y-%m-%d"),
        daily_limit=GEMINI_DAILY_LIMIT,
    )
    if allowed:
        logger.info(
            "Gemini expression score: question=%s audio_bytes=%s (clip window cap=%ss)",
            question_number,
            len(clip_mp3_bytes) if clip_mp3_bytes else 0,
            GEMINI_MAX_SEGMENT_SECONDS,
        )
    if not allowed:
        return {
            "question_number": int(question_number),
            "headlight_result": headlight_result,
            "ai_score": 1,
            "ai_confidence": 0.0,
            "ai_reason_short": "quota_exceeded",
            "ai_flags": ["quota_exceeded", "needs_manual_review"],
            "ai_speaker_observation": None,
            "timestamp_start_sec": 0,
            "timestamp_end_sec": None,
            "score_complete": True,
            "source": "clip",
        }, None

    ai = score_expression_with_gemini_bytes(
        audio_bytes=clip_mp3_bytes,
        question_prompt=prompt_with_window,
        expected_full=rubric.get("expected_full") or "",
        expected_partial=rubric.get("expected_partial") or "",
        expected_wrong=rubric.get("expected_wrong") or "",
    )

    if not ai:
        ai = {
            "score": 1,
            "confidence": 0.0,
            "reason_short": "gemini_unavailable",
            "flags": ["needs_manual_review"],
            "speaker_observation": "manual_review_fallback",
        }

    row = {
        "question_number": int(question_number),
        "headlight_result": headlight_result,
        "ai_score": ai.get("score"),
        "ai_confidence": ai.get("confidence"),
        "ai_reason_short": ai.get("reason_short"),
        "ai_flags": ai.get("flags"),
        "ai_speaker_observation": ai.get("speaker_observation"),
        "timestamp_start_sec": 0,
        "timestamp_end_sec": None,
        "score_complete": True,
        "source": "clip",
    }
    return row, pool_entry


def _merge_per_question_rows(existing_rows, new_row):
    qn_key = str(new_row.get("question_number"))
    out = [r for r in (existing_rows or []) if str(r.get("question_number")) != qn_key]
    out.append(new_row)
    out.sort(key=lambda r: int(r.get("question_number") or 0))
    return out


def _latest_clip_docs_by_question_number(clips):
    by_q = {}
    for c in clips or []:
        if not isinstance(c, dict):
            continue
        qn = str(c.get("question_number") or "").strip()
        if qn:
            by_q[qn] = c
    return by_q


def _run_expression_clip_score_background(
    user_id: int,
    test_id: str,
    question_number: int,
    headlight_result: str,
    audio_file64: str,
    child_gender,
    age_years,
    age_months,
):
    test = storage.get_user_test_by_id(user_id, test_id)
    if not test:
        logger.warning(f"clip score: missing test user={user_id} test={test_id}")
        return
    expr_ai = test.get("expressionAI") or {}
    started_at = expr_ai.get("started_at") or (datetime.utcnow().isoformat() + "Z")
    meta = expr_ai.get("meta") or {}
    expression_question_count = int(meta.get("expression_question_count") or 0)

    try:
        raw = decode_base64_to_bytes(audio_file64)
    except Exception as e:
        logger.warning(f"clip decode failed q={question_number}: {e}")
        raw = None

    clip_bytes = _trim_expression_clip_bytes(raw) if raw else None
    if not clip_bytes:
        new_row = {
            "question_number": int(question_number),
            "headlight_result": headlight_result,
            "ai_score": 1,
            "ai_confidence": 0.0,
            "ai_reason_short": "audio_decode_failed",
            "ai_flags": ["audio_decode_failed", "needs_manual_review"],
            "ai_speaker_observation": None,
            "timestamp_start_sec": 0,
            "timestamp_end_sec": None,
            "score_complete": True,
            "source": "clip",
        }
    else:
        new_row, _pool = _score_expression_row_from_clip_audio(
            question_number, headlight_result, clip_bytes, child_gender
        )

    merged = _merge_per_question_rows(expr_ai.get("per_question") or [], new_row)
    processed = len(
        [
            r
            for r in merged
            if r.get("score_complete")
            and r.get("ai_score") in [0, 1, 2]
        ]
    )
    phase = "scoring_clips"
    payload = _build_pending_expression_ai_payload(
        test_id=test_id,
        started_at=started_at,
        expression_question_count=expression_question_count,
        phase=phase,
        processed_questions=min(processed, expression_question_count),
        per_question_rows=merged,
    )
    payload["expressive_language_impression"] = {"status": "pending"}
    storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=payload)


def _run_finalize_expression_ai_from_clips_background(
    user_id: int,
    test_id: str,
    full_array: str,
    child_gender,
    age_years,
    age_months,
    started_at: str,
):
    """
    After finalize: fill any missing per-question scores from clips, build impression, mark done.
    Reuses rows already marked score_complete from incremental clip scoring.
    """
    expression_items = _parse_expression_results_from_full_array(full_array)
    total_expression_items = len(expression_items)
    test = storage.get_user_test_by_id(user_id, test_id)
    if not test:
        logger.error(f"finalize expr AI: no test user={user_id} test={test_id}")
        return

    clips = test.get("expressionAudioClips") or []
    latest_clips = _latest_clip_docs_by_question_number(clips)
    stored_clip_qns = sorted(latest_clips.keys(), key=lambda x: int(x) if str(x).isdigit() else x)
    logger.info(
        "finalize_merge: test=%s expression_items=%s stored_clips=%s clip_docs_total=%s",
        test_id,
        len(expression_items),
        len(stored_clip_qns),
        len(clips or []),
    )
    expr_ai = test.get("expressionAI") or {}
    existing_rows = expr_ai.get("per_question") or []
    existing_by_qn = {str(r.get("question_number")): r for r in existing_rows}

    def count_scored_rows(rows):
        return len(
            [
                r
                for r in (rows or [])
                if r.get("score_complete") and r.get("ai_score") in [0, 1, 2]
            ]
        )

    def merged_rows_snapshot(rows_out_partial):
        """Union incremental finalize rows with clip scores already stored before finalize."""
        by_qn = {str(r.get("question_number")): r for r in (existing_rows or [])}
        for r in rows_out_partial or []:
            qn = str(r.get("question_number") or "")
            if qn:
                by_qn[qn] = r
        return list(by_qn.values())

    def progress_scored_count(rows_out_partial):
        """
        Scored count for UI: rows_out so far plus background clip scores not yet visited in the loop.
        Without this, the first loop iteration reports 1/N after merge reported 13/N.
        """
        out_qns = {str(r.get("question_number")) for r in (rows_out_partial or [])}
        n = count_scored_rows(rows_out_partial)
        for r in existing_rows or []:
            qn = str(r.get("question_number") or "")
            if not qn or qn in out_qns:
                continue
            if r.get("score_complete") and r.get("ai_score") in [0, 1, 2]:
                n += 1
        return min(total_expression_items, n)

    last_reported_processed = 0

    def emit_progress(phase, processed_questions, rows_out_partial):
        nonlocal last_reported_processed
        merged = merged_rows_snapshot(rows_out_partial)
        processed = min(
            total_expression_items,
            max(processed_questions, progress_scored_count(rows_out_partial), last_reported_processed),
        )
        last_reported_processed = processed
        payload = _build_pending_expression_ai_payload(
            test_id=test_id,
            started_at=started_at,
            expression_question_count=total_expression_items,
            phase=phase,
            processed_questions=processed,
            per_question_rows=merged,
        )
        payload["expressive_language_impression"] = {"status": "pending"}
        storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=payload)

    emit_progress("finalize_merge", progress_scored_count([]), [])

    impression_pool = []
    rows_out = []
    missing_clip_questions = []

    for idx, (question_number, headlight_result) in enumerate(expression_items):
        qn_key = str(question_number)
        clip_doc = latest_clips.get(qn_key)
        prior = existing_by_qn.get(qn_key)
        if prior and prior.get("score_complete") and prior.get("ai_score") in [0, 1, 2]:
            rows_out.append(prior)
            if clip_doc and clip_doc.get("audioFile64"):
                try:
                    raw = decode_base64_to_bytes(clip_doc.get("audioFile64"))
                    clip_bytes = _trim_expression_clip_bytes(raw)
                    if clip_bytes:
                        pool_entry = _impression_pool_entry_from_clip_bytes(
                            question_number, headlight_result, clip_bytes, child_gender
                        )
                        if pool_entry:
                            impression_pool.append(pool_entry)
                except Exception:
                    pass
            emit_progress("finalize_merge", progress_scored_count(rows_out), rows_out)
            continue

        if not clip_doc or not clip_doc.get("audioFile64"):
            missing_clip_questions.append(str(question_number))
            rows_out.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "missing_clip_at_finalize",
                "ai_flags": ["missing_clip_at_finalize", "needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": 0,
                "timestamp_end_sec": None,
                "score_complete": True,
                "source": "clip",
            })
            emit_progress("finalize_merge", progress_scored_count(rows_out), rows_out)
            continue

        try:
            raw = decode_base64_to_bytes(clip_doc.get("audioFile64"))
            clip_bytes = _trim_expression_clip_bytes(raw)
        except Exception:
            clip_bytes = None

        if not clip_bytes:
            rows_out.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "audio_decode_failed",
                "ai_flags": ["audio_decode_failed", "needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": 0,
                "timestamp_end_sec": None,
                "score_complete": True,
                "source": "clip",
            })
        else:
            row, pool_entry = _score_expression_row_from_clip_audio(
                question_number, headlight_result, clip_bytes, child_gender
            )
            rows_out.append(row)
            if pool_entry:
                impression_pool.append(pool_entry)
        emit_progress("finalize_merge", progress_scored_count(rows_out), rows_out)

    if missing_clip_questions:
        logger.warning(
            "finalize_merge missing_clip_at_finalize: test=%s count=%s questions=%s "
            "(no audio in Mongo for these — client never POSTed expressionClip or POST failed). "
            "stored_clip_qns=%s",
            test_id,
            len(missing_clip_questions),
            missing_clip_questions,
            stored_clip_qns,
        )

    expression_ai_summary = _aggregate_expression_ai(rows_out)
    parent_ai_comparison = _build_parent_ai_comparison(expression_items, rows_out)

    ay = int(age_years) if age_years is not None else 0
    am = int(age_months) if age_months is not None else 0
    child_age_label_he = f"{ay} שנים ו-{am} חודשים"

    expressive_language_impression = _run_expressive_language_impression(
        impression_pool,
        full_array,
        child_age_label_he,
    )

    final_payload = {
        "status": "done",
        "completed_at": datetime.utcnow().isoformat() + "Z",
        "per_question": rows_out,
        "summary": expression_ai_summary,
        "meta": {
            "expression_question_count": total_expression_items,
            "parent_ai_comparison": {
                "status": "done",
                **parent_ai_comparison,
            },
            "progress": {
                "phase": "done",
                "processed_questions": total_expression_items,
                "total_questions": total_expression_items,
                "last_updated_at": datetime.utcnow().isoformat() + "Z",
            },
        },
        "expressive_language_impression": expressive_language_impression,
        "started_at": started_at,
        "test_id": test_id,
    }
    storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=final_payload)


# FastAPI setup
app = FastAPI(title="See&Say Backend")

# Allow all origins (for testing; restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # or ["https://yourfrontend.com"]
    allow_credentials=True,
    allow_methods=["*"],       # GET, POST, OPTIONS, etc.
    allow_headers=["*"],
)



class CreateUserRequest(BaseModel):
    userId: int
    userName: Optional[str] = None


class AddTestRequest(BaseModel):
    userId: int
    ageYears: int
    ageMonths: int
    full_array: str
    correct: Optional[int] = None
    partly: Optional[int] = None
    wrong: Optional[int] = None
    audioFile64: str = ""
    timestamps: str = "{}"
    childGender: Optional[str] = None


class CreateTestDraftRequest(BaseModel):
    userId: int
    expressionQuestionCount: int = 40


class ExpressionClipRequest(BaseModel):
    userId: int
    questionNumber: int
    headlightResult: str
    audioFile64: str
    childGender: Optional[str] = None
    ageYears: Optional[int] = None
    ageMonths: Optional[int] = None


class FinalizeDraftTestRequest(BaseModel):
    userId: int
    ageYears: int
    ageMonths: int
    full_array: str
    correct: Optional[int] = None
    partly: Optional[int] = None
    wrong: Optional[int] = None
    timestamps: str = "{}"
    childGender: Optional[str] = None


class SpeakerVerificationRequest(BaseModel):
    userId: int
    audioFile64:str
    # returns {"success": True, "parent_speaker": parent_speaker, "updated_transcription: updated_transcription }

class GetFinalTranscriptionRequest(BaseModel):
    userId: int



# Routes
@app.get("/")
def home():
    return {"message": "✅ Hello from See&Say FastAPI backend"}

@app.post("/api/createUser")
def create_user(user: CreateUserRequest):
    logger.warning(f"Received user creation: {user.dict()}")
    success = storage.add_user(
        user_id=user.userId,
        user_name=user.userName
    )

    if not success:
        raise HTTPException(status_code=400, detail="User already exists or could not be added")
    # user = storage.get_user_config(user.userId)
    return {"success": True
            # "user": user
            }

@app.post("/api/addTestToUser")
def add_test(test: AddTestRequest, background_tasks: BackgroundTasks):
    logger.warning(f"Received user test: {test.userId}")

    # Speaker verification is intentionally disabled in this flow.
    updated_transcription = {"updated_transcription": "None", "success": False, "parent_speaker": "None"}
    test_id = str(uuid.uuid4())
    expression_items = _parse_expression_results_from_full_array(test.full_array)
    started_at = datetime.utcnow().isoformat() + "Z"
    pending_expression_ai = _build_pending_expression_ai_payload(
        test_id=test_id,
        started_at=started_at,
        expression_question_count=len(expression_items),
        phase="queued",
        processed_questions=0,
        per_question_rows=[],
    )

    success = storage.add_test_to_user(
        user_id=test.userId,
        age_years=test.ageYears,
        age_months=test.ageMonths,
        full_array=test.full_array,
        correct=test.correct,
        partly=test.partly,
        wrong=test.wrong,
        audio_file_base64=test.audioFile64,
        updated_transcription=updated_transcription["updated_transcription"],
        timestamps=test.timestamps,
        expression_ai=pending_expression_ai,
        test_id=test_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="User not found or exam not added")

    background_tasks.add_task(
        _run_expression_ai_background,
        test.userId,
        test_id,
        test.full_array,
        test.timestamps,
        test.audioFile64,
        test.childGender,
        test.ageYears,
        test.ageMonths,
        started_at,
    )

    return {
        "success": True,
        "test_id": test_id,
        "transcription": updated_transcription["updated_transcription"],
        "expression_ai": pending_expression_ai,
    }


@app.post("/api/createTestDraft")
def create_test_draft(body: CreateTestDraftRequest):
    test_id = str(uuid.uuid4())
    started_at = datetime.utcnow().isoformat() + "Z"
    pending_expression_ai = _build_pending_expression_ai_payload(
        test_id=test_id,
        started_at=started_at,
        expression_question_count=max(1, int(body.expressionQuestionCount or 1)),
        phase="draft",
        processed_questions=0,
        per_question_rows=[],
    )
    ok = storage.add_draft_test_to_user(
        user_id=body.userId,
        test_id=test_id,
        expression_ai_pending=pending_expression_ai,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="User not found or draft not created")
    return {
        "success": True,
        "test_id": test_id,
        "expression_ai": pending_expression_ai,
    }


@app.post("/api/tests/{test_id}/expressionClip")
def post_expression_clip(
    test_id: str,
    body: ExpressionClipRequest,
    background_tasks: BackgroundTasks,
):
    audio_stored = _store_trimmed_expression_clip_data_url(body.audioFile64)
    clip_doc = {
        "question_number": body.questionNumber,
        "headlight_result": body.headlightResult,
        "audioFile64": audio_stored,
        "uploaded_at": datetime.utcnow().isoformat() + "Z",
        "format": "mp3_data_url",
        "trimmed_max_seconds": GEMINI_MAX_SEGMENT_SECONDS,
    }
    ok = storage.append_expression_audio_clip(
        user_id=body.userId,
        test_id=test_id,
        clip_doc=clip_doc,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Test not found or clip not saved")
    try:
        raw_len = len(decode_base64_to_bytes(audio_stored))
    except Exception:
        raw_len = -1
    logger.info(
        "expressionClip accepted test=%s q=%s stored_mp3_bytes=%s trim_cap_s=%s (background Gemini score queued)",
        test_id,
        body.questionNumber,
        raw_len,
        GEMINI_MAX_SEGMENT_SECONDS,
    )
    background_tasks.add_task(
        _run_expression_clip_score_background,
        body.userId,
        test_id,
        body.questionNumber,
        body.headlightResult,
        audio_stored,
        body.childGender,
        body.ageYears,
        body.ageMonths,
    )
    return {"success": True, "test_id": test_id}


@app.post("/api/tests/{test_id}/finalizeTest")
def finalize_draft_test_endpoint(
    test_id: str,
    body: FinalizeDraftTestRequest,
    background_tasks: BackgroundTasks,
):
    updated_transcription = {"updated_transcription": "None", "success": False, "parent_speaker": "None"}
    ok = storage.finalize_draft_test(
        user_id=body.userId,
        test_id=test_id,
        age_years=body.ageYears,
        age_months=body.ageMonths,
        full_array=body.full_array,
        correct=body.correct,
        partly=body.partly,
        wrong=body.wrong,
        timestamps=body.timestamps,
        updated_transcription=updated_transcription["updated_transcription"],
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Test not found or finalize failed")

    test_row = storage.get_user_test_by_id(body.userId, test_id)
    started_at = (test_row.get("expressionAI") or {}).get("started_at") or (
        datetime.utcnow().isoformat() + "Z"
    )
    background_tasks.add_task(
        _run_finalize_expression_ai_from_clips_background,
        body.userId,
        test_id,
        body.full_array,
        body.childGender,
        body.ageYears,
        body.ageMonths,
        started_at,
    )
    expr = storage.get_test_expression_ai(body.userId, test_id)
    return {
        "success": True,
        "test_id": test_id,
        "transcription": updated_transcription["updated_transcription"],
        "expression_ai": expr,
    }


def _compute_expression_ai_payload(full_array, timestamps, audio_file64, child_gender, age_years, age_months, progress_cb=None):
    expression_ai_rows = []
    impression_pool = []
    expression_items = _parse_expression_results_from_full_array(full_array)
    total_expression_items = len(expression_items)
    timestamp_marks = _parse_question_timestamps(timestamps)
    decoded_audio_bytes = None
    decode_audio_error = None
    try:
        decoded_audio_bytes = decode_base64_to_bytes(audio_file64)
    except Exception as e:
        decode_audio_error = str(e)
        logger.warning(f"Failed decoding test audio for expression slicing: {e}")

    if callable(progress_cb):
        progress_cb("preparing_audio", 0, total_expression_items, expression_ai_rows)

    for idx, (question_number, headlight_result) in enumerate(expression_items):
        rubric = EXPRESSION_RUBRICS.get(str(question_number))
        if not rubric:
            expression_ai_rows.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "missing_csv_rubric",
                "ai_flags": ["needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": None,
                "timestamp_end_sec": None,
            })
            if callable(progress_cb):
                progress_cb("scoring_questions", idx + 1, total_expression_items, expression_ai_rows)
            continue

        start_sec, end_sec = _timestamp_window_for_question(question_number, timestamp_marks)
        if start_sec is None:
            expression_ai_rows.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "missing_timestamp_start",
                "ai_flags": ["missing_timestamp_start", "needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": start_sec,
                "timestamp_end_sec": end_sec,
            })
            if callable(progress_cb):
                progress_cb("scoring_questions", idx + 1, total_expression_items, expression_ai_rows)
            continue
        if decoded_audio_bytes is None:
            expression_ai_rows.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "audio_decode_failed",
                "ai_flags": ["audio_decode_failed", "needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": start_sec,
                "timestamp_end_sec": end_sec,
                "audio_decode_error": decode_audio_error,
            })
            if callable(progress_cb):
                progress_cb("scoring_questions", idx + 1, total_expression_items, expression_ai_rows)
            continue

        normalized_gender = str(child_gender or "").strip().lower()
        is_female = normalized_gender in ["female", "girl"]
        question_text = (
            rubric.get("question_text_girl") if is_female
            else rubric.get("question_text_boy")
        ) or rubric.get("question_text_fallback") or ""

        effective_end_sec = end_sec if end_sec is not None else (start_sec + GEMINI_MAX_SEGMENT_SECONDS)
        if effective_end_sec - start_sec > GEMINI_MAX_SEGMENT_SECONDS:
            effective_end_sec = start_sec + GEMINI_MAX_SEGMENT_SECONDS

        prompt_with_window = (
            question_text
            + (
                f"\n\nRelevant answer window (seconds in full recording): start={start_sec}, end={effective_end_sec}"
                if start_sec is not None else ""
            )
        )

        try:
            sliced_audio_bytes = slice_audio_window_bytes(
                audio_bytes=decoded_audio_bytes,
                start_sec=start_sec,
                end_sec=effective_end_sec,
                output_format="mp3",
            )
        except Exception as e:
            logger.warning(
                f"Audio slicing failed for question {question_number} "
                f"with window [{start_sec}, {effective_end_sec}): {e}"
            )
            expression_ai_rows.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "audio_slice_failed",
                "ai_flags": ["audio_slice_failed", "needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": start_sec,
                "timestamp_end_sec": end_sec,
            })
            if callable(progress_cb):
                progress_cb("scoring_questions", idx + 1, total_expression_items, expression_ai_rows)
            continue

        goal_bits = [
            (rubric.get("pls_category") or "").strip(),
            (rubric.get("pls_sub_category") or "").strip(),
            (rubric.get("test_goal") or "").strip(),
        ]
        linguistic_goal_line = " · ".join(g for g in goal_bits if g)
        hint_lines = []
        if (rubric.get("comments") or "").strip():
            hint_lines.append((rubric.get("comments") or "").strip())
        if (rubric.get("facilitator_hint") or "").strip():
            hint_lines.append((rubric.get("facilitator_hint") or "").strip())
        context_hint = "\n".join(hint_lines)

        impression_pool.append({
            "question_number": int(question_number),
            "headlight_result": headlight_result,
            "audio_bytes": sliced_audio_bytes,
            "question_text": question_text,
            "context_hint": context_hint,
            "linguistic_goal_line": linguistic_goal_line,
            # Broad PLS frame: CSV category_PLS (stored key name kept for compatibility).
            "pls_semantics_area": (rubric.get("pls_category") or "").strip(),
            # Supplementary: CSV sub_category_PLS (stored key pls_category kept for compatibility).
            "pls_category": (rubric.get("pls_sub_category") or "").strip(),
        })

        allowed = storage.check_and_increment_daily_quota(
            quota_key="gemini_expression_scoring",
            date_key=datetime.utcnow().strftime("%Y-%m-%d"),
            daily_limit=GEMINI_DAILY_LIMIT,
        )
        if not allowed:
            expression_ai_rows.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "quota_exceeded",
                "ai_flags": ["quota_exceeded", "needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": start_sec,
                "timestamp_end_sec": end_sec,
            })
            if callable(progress_cb):
                progress_cb("scoring_questions", idx + 1, total_expression_items, expression_ai_rows)
            continue

        ai = score_expression_with_gemini_bytes(
            audio_bytes=sliced_audio_bytes,
            question_prompt=prompt_with_window,
            expected_full=rubric.get("expected_full") or "",
            expected_partial=rubric.get("expected_partial") or "",
            expected_wrong=rubric.get("expected_wrong") or "",
        )

        if not ai:
            ai = {
                "score": 1,
                "confidence": 0.0,
                "reason_short": "gemini_unavailable",
                "flags": ["needs_manual_review"],
                "speaker_observation": "manual_review_fallback",
            }

        expression_ai_rows.append({
            "question_number": int(question_number),
            "headlight_result": headlight_result,
            "ai_score": ai.get("score"),
            "ai_confidence": ai.get("confidence"),
            "ai_reason_short": ai.get("reason_short"),
            "ai_flags": ai.get("flags"),
            "ai_speaker_observation": ai.get("speaker_observation"),
            "timestamp_start_sec": start_sec,
            "timestamp_end_sec": end_sec,
        })
        if callable(progress_cb):
            progress_cb("scoring_questions", idx + 1, total_expression_items, expression_ai_rows)

    expression_ai_summary = _aggregate_expression_ai(expression_ai_rows)
    parent_ai_comparison = _build_parent_ai_comparison(expression_items, expression_ai_rows)
    if callable(progress_cb):
        progress_cb("building_impression", total_expression_items, total_expression_items, expression_ai_rows)

    ay = int(age_years) if age_years is not None else 0
    am = int(age_months) if age_months is not None else 0
    child_age_label_he = f"{ay} שנים ו-{am} חודשים"

    expressive_language_impression = _run_expressive_language_impression(
        impression_pool,
        full_array,
        child_age_label_he,
    )

    return {
        "status": "done",
        "completed_at": datetime.utcnow().isoformat() + "Z",
        "per_question": expression_ai_rows,
        "summary": expression_ai_summary,
        "meta": {
            "expression_question_count": total_expression_items,
            "parent_ai_comparison": {
                "status": "done",
                **parent_ai_comparison,
            },
            "progress": {
                "phase": "done",
                "processed_questions": total_expression_items,
                "total_questions": total_expression_items,
                "last_updated_at": datetime.utcnow().isoformat() + "Z",
            },
        },
        "expressive_language_impression": expressive_language_impression,
    }


def _run_expression_ai_background(user_id, test_id, full_array, timestamps, audio_file64, child_gender, age_years, age_months, started_at):
    total_expression_items = len(_parse_expression_results_from_full_array(full_array))

    def emit_progress(phase, processed_questions, total_questions, rows_snapshot):
        payload = _build_pending_expression_ai_payload(
            test_id=test_id,
            started_at=started_at,
            expression_question_count=total_questions,
            phase=phase,
            processed_questions=processed_questions,
            per_question_rows=list(rows_snapshot),
        )
        storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=payload)

    emit_progress("processing_started", 0, total_expression_items, [])
    try:
        payload = _compute_expression_ai_payload(
            full_array, timestamps, audio_file64, child_gender, age_years, age_months, progress_cb=emit_progress
        )
    except Exception as e:
        logger.error(f"Background expression AI failed for testId {test_id}: {e}")
        payload = {
            "status": "failed",
            "completed_at": datetime.utcnow().isoformat() + "Z",
            "error": str(e),
            "per_question": [],
            "summary": _aggregate_expression_ai([]),
            "meta": {
                "expression_question_count": total_expression_items,
                "parent_ai_comparison": {
                    "status": "failed",
                    "match_count": 0,
                    "total_compared": 0,
                    "match_rate": None,
                    "rows": [],
                },
                "progress": {
                    "phase": "failed",
                    "processed_questions": 0,
                    "total_questions": total_expression_items,
                    "last_updated_at": datetime.utcnow().isoformat() + "Z",
                },
            },
            "expressive_language_impression": {
                "status": "failed",
                "reason": "pipeline_error",
                "limitations_he": str(e),
            },
        }
    storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=payload)


@app.get("/api/expressionAiStatus")
def expression_ai_status(userId: int, testId: str):
    payload = storage.get_test_expression_ai(user_id=userId, test_id=testId)
    if payload is None:
        raise HTTPException(status_code=404, detail="Test or expression AI payload not found")
    return {"success": True, "test_id": testId, "expression_ai": payload}




@app.post("/api/VerifySpeaker")
def verify_speaker(data: SpeakerVerificationRequest):
    logger.warning(
        f"Received speaker verification request for user: {data.userId}"
    )

    try:
        verification_result = speaker_verification(data.audioFile64)
        logger.warning(
            f"Speaker verification data for user: {data.userId}\n{verification_result}"
        )
        return {
            "success": verification_result["success"],
            "parent_speaker": verification_result["parent_speaker"]
        }

    except Exception as e:
        logger.error(f"Unexpected error during speaker verification: {e}")
        logger.error(traceback.format_exc())

        raise HTTPException(
            status_code=500,
            detail="Internal server error"
        )








# Not In Use
# @app.get("/api/getUser/{user_id}")
# def get_user(user_id: str):
#     user = storage.get_user_config(user_id)
#     if not user:
#         raise HTTPException(status_code=404, detail="User not found")
#     return {"success": True, "user": user}


