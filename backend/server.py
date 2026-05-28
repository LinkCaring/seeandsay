"""
FastAPI backend server for See&Say Application
Uses external MongoDB manager from storage_manager.py
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
import os
import csv
import json
import re
import uuid
import random
import secrets
import time
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# ✅ Import your existing storage manager
from MongoDB import SeeSayMongoStorage


from fastapi.middleware.cors import CORSMiddleware
from fastapi import BackgroundTasks

from typing import Optional
import traceback

from AI_Models_API import (
    decode_base64_to_bytes,
    slice_audio_window_bytes,
    score_expression_with_gemini_bytes,
    summarize_expressive_language_impression_gemini,
)
import azure_blob
import sms_notify

# ------------------------------------------------------
# Setup — load .env before reading any os.environ constants
# ------------------------------------------------------
load_dotenv()

EXPRESSION_AI_STALE_BUILDING_IMPRESSION_MINUTES = int(
    os.environ.get("EXPRESSION_AI_STALE_BUILDING_IMPRESSION_MINUTES", "10")
)
RESULTS_TOKEN_TTL_DAYS = int(os.environ.get("RESULTS_TOKEN_TTL_DAYS", "7"))
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mongodb_url = os.environ.get("MONGODB_URL")
database_name = os.environ.get("DATABASE_NAME")

# Initialize MongoDB storage manager
storage = SeeSayMongoStorage(mongodb_url, database_name)
GEMINI_DAILY_LIMIT = int(os.environ.get("GEMINI_DAILY_LIMIT", "350"))
GEMINI_MAX_SEGMENT_SECONDS = int(os.environ.get("GEMINI_MAX_SEGMENT_SECONDS", "20"))
INCREMENTAL_SCORE_RETRY_ATTEMPTS = int(os.environ.get("INCREMENTAL_SCORE_RETRY_ATTEMPTS", "5"))
INCREMENTAL_SCORE_RETRY_DELAY_SEC = float(os.environ.get("INCREMENTAL_SCORE_RETRY_DELAY_SEC", "2.0"))
GEMINI_IMPRESSION_DAILY_LIMIT = int(
    os.environ.get("GEMINI_IMPRESSION_DAILY_LIMIT", os.environ.get("GEMINI_DAILY_LIMIT", "350"))
)
GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS = int(os.environ.get("GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS", "2800"))
EXPRESSION_IMPRESSION_SAMPLE_CAP = int(os.environ.get("EXPRESSION_IMPRESSION_SAMPLE_CAP", "10"))


def _csv_row_to_rubric(row):
    qn = str((row.get("query_number") or "").strip())
    if not qn:
        return None, None
    return qn, {
        "query_type": (row.get("query_type") or "").strip(),
        "question_text_boy": (row.get("query_boy") or "").strip(),
        "question_text_girl": (row.get("query_girl") or "").strip(),
        "question_text_fallback": (row.get("query") or "").strip(),
        "expected_full": (row.get("expected_full_ai") or row.get("expected_full") or "").strip(),
        "expected_partial": (row.get("expected_partial") or "").strip(),
        "expected_wrong": (row.get("expected_wrong") or "").strip(),
        "comments": (row.get("comments") or "").strip(),
        "facilitator_hint": (row.get("hint") or "").strip(),
        "category_pls": (
            (row.get("category_PLS") or row.get("category_pls") or row.get("semantics") or "")
            .strip()
        ),
        "sub_category_pls": (
            (
                row.get("sub_category_PLS")
                or row.get("sub_category_pls")
                or row.get("category PLS")
                or row.get("category_pls")
                or ""
            ).strip()
        ),
        "test_goal": (row.get("test goal") or row.get("test_goal") or "").strip(),
    }


def _load_question_rubrics():
    """
    Loads all question rubric fields from the shared CSV (comprehension + expression).
    """
    csv_candidates = [
        os.path.join(os.path.dirname(__file__), "..", "frontend_demo", "resources", "query_database.csv"),
        os.path.join(os.path.dirname(__file__), "resources", "query_database.csv"),
    ]
    csv_path = None
    for c in csv_candidates:
        if os.path.exists(c):
            csv_path = c
            break
    if not csv_path:
        logger.warning("Question rubric CSV not found; Gemini expression scoring will be skipped.")
        return {}

    rubrics = {}
    try:
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                qn, rubric = _csv_row_to_rubric(row)
                if qn:
                    rubrics[qn] = rubric
    except Exception as e:
        logger.warning(f"Failed to load question rubrics from CSV: {e}")
        return {}

    return rubrics


QUESTION_RUBRICS = _load_question_rubrics()
EXPRESSION_RUBRICS = {
    qn: r for qn, r in QUESTION_RUBRICS.items() if r.get("query_type") == "הבעה"
}


def _parse_section_results_from_full_array(full_array_str, section_key):
    """
    full_array is JSON-stringified object from frontend:
      {"comprehension":"[(1,\"correct\")]", "expression":"[(7,\"partly\"),(8,\"wrong\")]"}
    Returns list of tuples: [(question_number:str, headlight_result:str), ...]
    """
    try:
        parsed = json.loads(full_array_str)
    except Exception:
        return []

    section = parsed.get(section_key) if isinstance(parsed, dict) else None
    if not isinstance(section, str):
        return []

    matches = re.findall(r'\((\d+),"([^"]+)"\)', section)
    return [(m[0], m[1]) for m in matches]


def _parse_expression_results_from_full_array(full_array_str):
    return _parse_section_results_from_full_array(full_array_str, "expression")


def _parse_comprehension_results_from_full_array(full_array_str):
    return _parse_section_results_from_full_array(full_array_str, "comprehension")


def _question_text_for_gender(rubric, child_gender):
    normalized_gender = str(child_gender or "").strip().lower()
    is_female = normalized_gender in ["female", "girl"]
    return (
        (rubric.get("question_text_girl") if is_female else rubric.get("question_text_boy"))
        or rubric.get("question_text_fallback")
        or ""
    )


_HEADLIGHT_LABEL_HE = {
    "correct": "נכון",
    "partly": "חלקי",
    "wrong": "לא נכון",
}


def _build_comprehension_impression_context_he(full_array_str, child_gender):
    # full_array comprehension entries come only from answered questions (frontend questionResults).
    items = _parse_comprehension_results_from_full_array(full_array_str)
    if not items:
        return ""

    lines = [
        "--- תוצאות הבנה (שאלות שנענו בפועל במבחן; ללא קטעי שמע) ---",
        "לכל שורה: מספר שאלה, סטטוס תשובה (נכון/חלקי/לא נכון), category_PLS, sub_category_PLS, ונוסח השאלה.",
    ]
    for question_number, headlight_result in items:
        rubric = QUESTION_RUBRICS.get(str(question_number), {})
        question_text = _question_text_for_gender(rubric, child_gender)
        category_pls = (rubric.get("category_pls") or "").strip()
        sub_category_pls = (rubric.get("sub_category_pls") or "").strip()
        status_he = _HEADLIGHT_LABEL_HE.get(headlight_result, headlight_result)
        line = (
            f"שאלה {question_number}: תשובה={status_he} ({headlight_result})"
            f" | category_PLS={category_pls or '—'}"
            f" | sub_category_PLS={sub_category_pls or '—'}"
        )
        if question_text:
            line += f"\n  נוסח: {question_text}"
        lines.append(line)
    return "\n".join(lines)


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

    max_end_sec = start + GEMINI_MAX_SEGMENT_SECONDS

    explicit_end = ends_by_q.get(key)
    if explicit_end is not None and explicit_end > start:
        return start, min(explicit_end, max_end_sec)

    end = None
    for idx, (question_num, sec) in enumerate(ordered_starts):
        if str(question_num) == key and sec == start:
            if idx + 1 < len(ordered_starts):
                end = ordered_starts[idx + 1][1]
            break
    if end is not None and end <= start:
        end = None
    if end is not None:
        end = min(end, max_end_sec)
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
    parentPhone: Optional[str] = None


class ParentPhoneRequest(BaseModel):
    userId: int
    parentPhone: Optional[str] = None


class AddTestRequest(BaseModel):
    userId: int
    ageYears: int
    ageMonths: int
    full_array: str
    correct: Optional[int] = None
    partly: Optional[int] = None
    wrong: Optional[int] = None
    audioFile64: Optional[str] = None
    audioBlobPath: Optional[str] = None
    timestamps: Optional[str] = ""
    childGender: Optional[str] = None
    testId: Optional[str] = None
    clientInfo: Optional[Dict[str, Any]] = None


class PrepareUploadRequest(BaseModel):
    userId: int
    testId: str


class PrepareSegmentUploadRequest(BaseModel):
    userId: int
    testId: str
    questionNumber: str


class ExpressionSegmentRequest(BaseModel):
    userId: int
    testId: str
    questionNumber: str
    blobPath: str
    headlightResult: Optional[str] = None
    childGender: Optional[str] = None
    ageYears: Optional[int] = None
    ageMonths: Optional[int] = None


# Routes
@app.get("/")
def home():
    return {"message": "✅ Hello from See&Say FastAPI backend"}

def _build_results_access():
    expires = datetime.now(timezone.utc) + timedelta(days=RESULTS_TOKEN_TTL_DAYS)
    return {
        "token": secrets.token_urlsafe(32),
        "expiresAt": expires.isoformat().replace("+00:00", "Z"),
        "smsSentAt": None,
        "smsLastError": None,
    }


def _parse_iso_utc(iso_str):
    if not iso_str:
        return None
    try:
        ts = str(iso_str).replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _results_token_expired(expires_at):
    exp = _parse_iso_utc(expires_at)
    if not exp:
        return True
    return datetime.now(timezone.utc) >= exp


def _build_results_public_url(token):
    base = (os.environ.get("MILI_PUBLIC_BASE_URL") or "").strip()
    if not base:
        base = "http://localhost:8000/frontend_demo/"
    return f"{base.rstrip('/')}?t={token}"


@app.post("/api/createUser")
def create_user(user: CreateUserRequest):
    logger.warning(f"Received user creation: {user.dict()}")
    success = storage.add_user(
        user_id=user.userId,
        user_name=user.userName,
        parent_phone=user.parentPhone,
    )

    if not success:
        if user.parentPhone is not None:
            updated = storage.set_user_parent_phone(user.userId, user.parentPhone)
            if not updated:
                raise HTTPException(status_code=404, detail="User not found")
            return {"success": True, "existing": True, "updatedPhone": True}
        return {"success": True, "existing": True}
    return {"success": True}


@app.patch("/api/user/parentPhone")
def patch_user_parent_phone(body: ParentPhoneRequest):
    updated = storage.set_user_parent_phone(body.userId, body.parentPhone)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    phone = storage.get_user_parent_phone(body.userId)
    return {"success": True, "parentPhone": phone}

@app.post("/api/tests/prepareUpload")
def prepare_upload(body: PrepareUploadRequest):
    if not azure_blob.is_configured():
        raise HTTPException(status_code=503, detail="Azure Blob storage is not configured")
    test_id = str(body.testId).strip()
    if not test_id:
        raise HTTPException(status_code=400, detail="testId is required")
    blob_path = azure_blob.session_blob_path(body.userId, test_id)
    return {
        "success": True,
        "testId": test_id,
        "blobPath": blob_path,
        "uploadUrl": azure_blob.build_upload_url(blob_path),
    }


@app.post("/api/tests/prepareSegmentUpload")
def prepare_segment_upload(body: PrepareSegmentUploadRequest):
    if not azure_blob.is_configured():
        raise HTTPException(status_code=503, detail="Azure Blob storage is not configured")
    test_id = str(body.testId).strip()
    qn = str(body.questionNumber).strip()
    if not test_id or not qn:
        raise HTTPException(status_code=400, detail="testId and questionNumber are required")
    blob_path = azure_blob.expression_segment_blob_path(body.userId, test_id, qn)
    return {
        "success": True,
        "testId": test_id,
        "questionNumber": qn,
        "blobPath": blob_path,
        "uploadUrl": azure_blob.build_upload_url(blob_path),
    }


@app.post("/api/tests/expressionSegment")
def expression_segment(body: ExpressionSegmentRequest, background_tasks: BackgroundTasks):
    if not azure_blob.is_configured():
        raise HTTPException(status_code=503, detail="Azure Blob storage is not configured")
    test_id = str(body.testId).strip()
    qn = str(body.questionNumber).strip()
    if not test_id or not qn:
        raise HTTPException(status_code=400, detail="testId and questionNumber are required")
    ok, _size = azure_blob.verify_blob_exists(body.blobPath)
    if not ok:
        raise HTTPException(status_code=409, detail="Segment audio not found in Azure yet")

    pending_expression_ai = _build_pending_expression_ai_payload(
        test_id=test_id,
        started_at=datetime.utcnow().isoformat() + "Z",
        expression_question_count=0,
        phase="scoring_questions",
        processed_questions=0,
        per_question_rows=[],
    )
    storage.ensure_test_shell(body.userId, test_id, expression_ai=pending_expression_ai)
    segment = {
        "questionNumber": qn,
        "blobPath": body.blobPath,
        "uploadedAt": datetime.utcnow().isoformat() + "Z",
        "headlightResult": body.headlightResult,
    }
    storage.upsert_expression_segment(body.userId, test_id, segment)
    background_tasks.add_task(
        _run_expression_segment_background,
        body.userId,
        test_id,
        qn,
        body.blobPath,
        body.headlightResult,
        body.childGender,
    )
    return {"success": True, "testId": test_id, "questionNumber": qn}


@app.post("/api/addTestToUser")
def add_test(test: AddTestRequest, background_tasks: BackgroundTasks):
    logger.warning(f"Received user test: {test.userId}")
    if test.clientInfo:
        ci = test.clientInfo
        logger.warning(
            "clientInfo testId=%s apiUserId=%s app=%s blobOk=%s recInterrupted=%s screen=%s ua=%s",
            ci.get("pendingTestId"),
            ci.get("apiUserId"),
            ci.get("appVersion"),
            ci.get("blobUploadOk"),
            ci.get("recordingInterrupted"),
            ci.get("screen"),
            (str(ci.get("userAgent") or ""))[:120],
        )

    updated_transcription = {"updated_transcription": "None", "success": False, "parent_speaker": "None"}
    test_id = str(test.testId).strip() if test.testId else str(uuid.uuid4())

    existing = storage.get_user_test_by_id(test.userId, test_id)
    if existing and not existing.get("isDraftShell"):
        existing_ai = existing.get("expressionAI") or {}
        return {
            "success": True,
            "test_id": test_id,
            "transcription": existing.get("transcription") or updated_transcription["updated_transcription"],
            "expression_ai": existing_ai,
            "idempotent": True,
        }

    audio_blob_path = (test.audioBlobPath or "").strip() or None
    audio_file64 = test.audioFile64
    expression_mode = ((test.clientInfo or {}).get("expressionAudioMode") or "legacy").strip().lower()

    if audio_blob_path:
        if not azure_blob.is_configured():
            raise HTTPException(status_code=503, detail="Azure Blob storage is not configured")
        ok, size = azure_blob.verify_blob_exists(audio_blob_path)
        if not ok:
            raise HTTPException(
                status_code=409,
                detail="Session audio not found in Azure yet. Upload the recording to Blob before saving test metadata.",
            )
        logger.info("Verified audio blob for test %s (size=%s)", test_id, size)
        audio_file64 = None
    elif not audio_file64 and expression_mode != "incremental":
        raise HTTPException(status_code=400, detail="audioBlobPath or audioFile64 is required")

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
    response_expression_ai = pending_expression_ai

    results_access = _build_results_access()

    if existing and existing.get("isDraftShell"):
        existing_expression_ai = (existing.get("expressionAI") or {}) if isinstance(existing, dict) else {}
        preserve_expression_ai = pending_expression_ai
        if expression_mode == "incremental" and existing_expression_ai.get("per_question"):
            preserve_expression_ai = existing_expression_ai
        success = storage.finalize_test_shell(
            user_id=test.userId,
            test_id=test_id,
            fields={
                "dateFinished": datetime.now(),
                "ageYears": test.ageYears,
                "ageMonths": test.ageMonths,
                "fullArray": test.full_array,
                "correct": test.correct,
                "partly": test.partly,
                "wrong": test.wrong,
                "transcription": updated_transcription["updated_transcription"],
                "timestamps": test.timestamps,
                "audioBlobPath": audio_blob_path,
                "audioFile64": audio_file64 if not audio_blob_path else None,
                "clientInfo": test.clientInfo or {},
                "resultsAccess": results_access,
                "expressionAI": preserve_expression_ai,
            },
        )
        response_expression_ai = preserve_expression_ai
    else:
        success = storage.add_test_to_user(
            user_id=test.userId,
            age_years=test.ageYears,
            age_months=test.ageMonths,
            full_array=test.full_array,
            correct=test.correct,
            partly=test.partly,
            wrong=test.wrong,
            audio_file_base64=audio_file64,
            audio_blob_path=audio_blob_path,
            updated_transcription=updated_transcription["updated_transcription"],
            timestamps=test.timestamps,
            expression_ai=pending_expression_ai,
            test_id=test_id,
            client_info=test.clientInfo,
            results_access=results_access,
        )
        response_expression_ai = pending_expression_ai
    if not success:
        raise HTTPException(status_code=404, detail="User not found or exam not added")

    if expression_mode == "incremental":
        segments = storage.get_test_expression_segments(test.userId, test_id)
        rows = (storage.get_test_expression_ai(test.userId, test_id) or {}).get("per_question") or []
        payload = {
            "status": "pending",
            "test_id": test_id,
            "started_at": started_at,
            "per_question": rows,
            "summary": _aggregate_expression_ai(rows),
            "meta": {
                "expression_question_count": len(_parse_expression_results_from_full_array(test.full_array)),
                "parent_ai_comparison": {"status": "pending", "rows": []},
                "progress": {
                    "phase": "building_impression",
                    "processed_questions": len(rows),
                    "total_questions": len(_parse_expression_results_from_full_array(test.full_array)),
                    "last_updated_at": datetime.utcnow().isoformat() + "Z",
                },
                "uploaded_segments": len(segments),
            },
            "expressive_language_impression": {"status": "pending"},
        }
        storage.update_test_expression_ai(user_id=test.userId, test_id=test_id, expression_ai=payload)
        response_expression_ai = payload
        background_tasks.add_task(
            _finalize_incremental_expression_ai_background,
            test.userId,
            test_id,
            test.full_array,
            test.childGender,
            test.ageYears,
            test.ageMonths,
            started_at,
        )
    else:
        background_tasks.add_task(
            _run_expression_ai_background,
            test.userId,
            test_id,
            test.full_array,
            test.timestamps,
            audio_file64,
            test.childGender,
            test.ageYears,
            test.ageMonths,
            started_at,
            audio_blob_path,
        )

    return {
        "success": True,
        "test_id": test_id,
        "transcription": updated_transcription["updated_transcription"],
        "expression_ai": response_expression_ai,
    }


def _compute_expression_ai_payload(
    full_array,
    timestamps,
    child_gender,
    age_years,
    age_months,
    progress_cb=None,
    audio_file64=None,
    audio_blob_path=None,
):
    expression_ai_rows = []
    impression_pool = []
    expression_items = _parse_expression_results_from_full_array(full_array)
    total_expression_items = len(expression_items)
    timestamp_marks = _parse_question_timestamps(timestamps)
    decoded_audio_bytes = None
    decode_audio_error = None
    try:
        if audio_blob_path:
            decoded_audio_bytes = azure_blob.download_blob_bytes(audio_blob_path)
        elif audio_file64:
            decoded_audio_bytes = decode_base64_to_bytes(audio_file64)
        else:
            decode_audio_error = "no_audio_source"
    except Exception as e:
        decode_audio_error = str(e)
        logger.warning(f"Failed loading test audio for expression slicing: {e}")

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
            (rubric.get("category_pls") or "").strip(),
            (rubric.get("sub_category_pls") or "").strip(),
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
            # Broad PLS frame: CSV column category_PLS (formerly semantics).
            "pls_semantics_area": (rubric.get("category_pls") or "").strip(),
            # Finer tag: CSV column sub_category_PLS (formerly category PLS).
            "pls_category": (rubric.get("sub_category_pls") or "").strip(),
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

        try:
            ai = score_expression_with_gemini_bytes(
                audio_bytes=sliced_audio_bytes,
                question_prompt=prompt_with_window,
                expected_full=rubric.get("expected_full") or "",
                expected_partial=rubric.get("expected_partial") or "",
                expected_wrong=rubric.get("expected_wrong") or "",
            )
        except Exception as e:
            logger.error(
                "Gemini expression scoring failed for question %s: %s",
                question_number,
                e,
            )
            ai = None

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

    expressive_language_impression = {
        "status": "skipped",
        "reason": "no_eligible_samples",
        "sample_count_used": 0,
        "data_quality": "limited",
        "limitations_he": "לא נאספו דגימות הבעה עם קטע שמע תקין.",
    }
    if impression_pool:
        k = min(EXPRESSION_IMPRESSION_SAMPLE_CAP, len(impression_pool))
        chosen = random.sample(impression_pool, k=k) if k else []
        impression_allowed = storage.check_and_increment_daily_quota(
            quota_key="gemini_expressive_language_impression",
            date_key=datetime.utcnow().strftime("%Y-%m-%d"),
            daily_limit=GEMINI_IMPRESSION_DAILY_LIMIT,
        )
        if not impression_allowed:
            expressive_language_impression = {
                "status": "skipped",
                "reason": "quota_exceeded",
                "sample_count_used": 0,
                "data_quality": "limited",
                "limitations_he": "המכסה היומית לניתוח התרשמות הבעה נוצלה.",
            }
        else:
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
            comprehension_context_he = _build_comprehension_impression_context_he(
                full_array, child_gender
            )
            try:
                imp = summarize_expressive_language_impression_gemini(
                    entries,
                    child_age_label_he,
                    max_output_tokens=GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS,
                    comprehension_context_he=comprehension_context_he or None,
                )
            except Exception as e:
                logger.error("Expressive-language impression Gemini call failed: %s", e)
                imp = None
            if imp:
                expressive_language_impression = {
                    "status": "done",
                    **imp,
                    "samples_submitted": len(entries),
                }
            else:
                expressive_language_impression = {
                    "status": "failed",
                    "reason": "model_unavailable_or_invalid_json",
                    "sample_count_used": 0,
                    "data_quality": "limited",
                    "limitations_he": "לא ניתן היה להפיק התרשמות אוטומטית (שירות המודל או פלט לא תקין).",
                }

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


def _score_single_expression_from_blob(
    question_number,
    headlight_result,
    blob_path,
    child_gender,
):
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
            "timestamp_end_sec": GEMINI_MAX_SEGMENT_SECONDS,
        }
    try:
        audio_bytes = azure_blob.download_blob_bytes(blob_path)
    except Exception:
        return {
            "question_number": int(question_number),
            "headlight_result": headlight_result,
            "ai_score": 1,
            "ai_confidence": 0.0,
            "ai_reason_short": "audio_decode_failed",
            "ai_flags": ["audio_decode_failed", "needs_manual_review"],
            "ai_speaker_observation": None,
            "timestamp_start_sec": 0,
            "timestamp_end_sec": GEMINI_MAX_SEGMENT_SECONDS,
        }
    question_text = _question_text_for_gender(rubric, child_gender)
    ai = score_expression_with_gemini_bytes(
        audio_bytes=audio_bytes,
        question_prompt=question_text,
        expected_full=rubric.get("expected_full") or "",
        expected_partial=rubric.get("expected_partial") or "",
        expected_wrong=rubric.get("expected_wrong") or "",
    ) or {
        "score": 1,
        "confidence": 0.0,
        "reason_short": "gemini_unavailable",
        "flags": ["needs_manual_review"],
        "speaker_observation": "manual_review_fallback",
    }
    return {
        "question_number": int(question_number),
        "headlight_result": headlight_result,
        "ai_score": ai.get("score"),
        "ai_confidence": ai.get("confidence"),
        "ai_reason_short": ai.get("reason_short"),
        "ai_flags": ai.get("flags"),
        "ai_speaker_observation": ai.get("speaker_observation"),
        "timestamp_start_sec": 0,
        "timestamp_end_sec": GEMINI_MAX_SEGMENT_SECONDS,
    }


def _run_expression_segment_background(
    user_id,
    test_id,
    question_number,
    blob_path,
    headlight_result,
    child_gender,
):
    try:
        row = _score_single_expression_from_blob(
            question_number=question_number,
            headlight_result=headlight_result or "wrong",
            blob_path=blob_path,
            child_gender=child_gender,
        )
        current = storage.get_test_expression_ai(user_id=user_id, test_id=test_id) or {}
        rows = current.get("per_question") or []
        q_key = str(question_number)
        next_rows = [r for r in rows if str(r.get("question_number")) != q_key] + [row]
        total = max(len(_parse_expression_results_from_full_array((storage.get_user_test_by_id(user_id, test_id) or {}).get("fullArray") or "")), len(next_rows))
        phase = "building_impression" if len(next_rows) >= total else "scoring_questions"
        pending = _build_pending_expression_ai_payload(
            test_id=test_id,
            started_at=current.get("started_at") or datetime.utcnow().isoformat() + "Z",
            expression_question_count=total,
            phase=phase,
            processed_questions=len(next_rows),
            per_question_rows=next_rows,
        )
        storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=pending)
    except Exception as e:
        logger.error("Segment scoring failed for test %s q%s: %s", test_id, question_number, e)


def _build_processing_failed_expression_row(question_number, headlight_result):
    """Fallback per-question row when upload/scoring cannot complete after retries."""
    return {
        "question_number": int(question_number),
        "headlight_result": headlight_result or "wrong",
        "ai_score": 1,
        "ai_confidence": 0.0,
        "ai_reason_short": "processing_failed",
        "ai_flags": ["processing_failed", "needs_manual_review"],
        "ai_speaker_observation": (
            "לא הושלם עיבוד אוטומטי לשאלה זו (העלאת קטע או ניקוד נכשלו לאחר ניסיונות חוזרים)."
        ),
        "timestamp_start_sec": 0,
        "timestamp_end_sec": GEMINI_MAX_SEGMENT_SECONDS,
    }


def _try_score_expression_row_from_segment(question_number, headlight_result, blob_path, child_gender):
    try:
        return _score_single_expression_from_blob(
            question_number=question_number,
            headlight_result=headlight_result or "wrong",
            blob_path=blob_path,
            child_gender=child_gender,
        )
    except Exception as e:
        logger.error("Score attempt failed for q%s: %s", question_number, e)
        return None


def _ensure_incremental_expression_rows_complete(
    user_id,
    test_id,
    full_array,
    child_gender,
    started_at,
    initial_rows,
    segments_by_q,
):
    """
    Retry scoring for every expression question in full_array before impression.
    Missing rows after retries get ai_score=1 processing_failed fallback.
    """
    expression_items = _parse_expression_results_from_full_array(full_array)
    total_expression_items = len(expression_items)
    if total_expression_items == 0:
        return [], segments_by_q, total_expression_items

    rows_by_q = {}
    for row in initial_rows or []:
        qn = str(row.get("question_number") or "")
        if qn:
            rows_by_q[qn] = row

    expected_keys = [str(qn) for qn, _hr in expression_items]
    headlight_by_q = {str(qn): hr for qn, hr in expression_items}

    for attempt in range(INCREMENTAL_SCORE_RETRY_ATTEMPTS):
        missing = [q for q in expected_keys if q not in rows_by_q]
        if not missing:
            break

        pending = _build_pending_expression_ai_payload(
            test_id=test_id,
            started_at=started_at,
            expression_question_count=total_expression_items,
            phase="retrying_missing",
            processed_questions=len(rows_by_q),
            per_question_rows=list(rows_by_q.values()),
        )
        storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=pending)

        for q_key in missing:
            seg = segments_by_q.get(q_key) or {}
            blob_path = (seg.get("blobPath") or "").strip()
            if not blob_path:
                continue
            scored = _try_score_expression_row_from_segment(
                q_key,
                seg.get("headlightResult") or headlight_by_q.get(q_key),
                blob_path,
                child_gender,
            )
            if scored:
                rows_by_q[q_key] = scored

        if not [q for q in expected_keys if q not in rows_by_q]:
            break

        if attempt < INCREMENTAL_SCORE_RETRY_ATTEMPTS - 1:
            time.sleep(INCREMENTAL_SCORE_RETRY_DELAY_SEC)
            latest = storage.get_user_test_by_id(user_id, test_id) or {}
            for seg in latest.get("expressionSegments") or []:
                q = str(seg.get("questionNumber") or "")
                if q:
                    segments_by_q[q] = seg
            for row in (latest.get("expressionAI") or {}).get("per_question") or []:
                rq = str(row.get("question_number") or "")
                if rq and rq not in rows_by_q:
                    rows_by_q[rq] = row

    for q_key in expected_keys:
        if q_key in rows_by_q:
            continue
        rows_by_q[q_key] = _build_processing_failed_expression_row(
            q_key, headlight_by_q.get(q_key) or "wrong"
        )
        logger.warning(
            "Incremental test %s q%s: using processing_failed fallback row",
            test_id,
            q_key,
        )

    building_pending = _build_pending_expression_ai_payload(
        test_id=test_id,
        started_at=started_at,
        expression_question_count=total_expression_items,
        phase="building_impression",
        processed_questions=len(rows_by_q),
        per_question_rows=list(rows_by_q.values()),
    )
    storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=building_pending)

    ordered_rows = []
    for qn, _hr in expression_items:
        q_key = str(qn)
        if q_key in rows_by_q:
            ordered_rows.append(rows_by_q[q_key])

    return ordered_rows, segments_by_q, total_expression_items


def _finalize_incremental_expression_ai_background(
    user_id,
    test_id,
    full_array,
    child_gender,
    age_years,
    age_months,
    started_at,
):
    """Finalize incremental mode by building impression over scored segment rows."""
    try:
        expression_items = _parse_expression_results_from_full_array(full_array)
        total_expression_items = len(expression_items)
        latest = storage.get_user_test_by_id(user_id, test_id) or {}
        initial_rows = (latest.get("expressionAI") or {}).get("per_question") or []
        segments = latest.get("expressionSegments") or []

        by_q = {}
        for seg in segments:
            q = str(seg.get("questionNumber") or "")
            if q:
                by_q[q] = seg

        rows, by_q, total_expression_items = _ensure_incremental_expression_rows_complete(
            user_id=user_id,
            test_id=test_id,
            full_array=full_array,
            child_gender=child_gender,
            started_at=started_at,
            initial_rows=initial_rows,
            segments_by_q=by_q,
        )

        impression_pool = []
        for row in rows:
            qn = str(row.get("question_number") or "")
            if not qn:
                continue
            seg = by_q.get(qn) or {}
            blob_path = (seg.get("blobPath") or "").strip()
            if not blob_path:
                continue
            try:
                clip_bytes = azure_blob.download_blob_bytes(blob_path)
            except Exception:
                continue
            rubric = EXPRESSION_RUBRICS.get(qn) or {}
            question_text = _question_text_for_gender(rubric, child_gender)
            goal_bits = [
                (rubric.get("category_pls") or "").strip(),
                (rubric.get("sub_category_pls") or "").strip(),
                (rubric.get("test_goal") or "").strip(),
            ]
            linguistic_goal_line = " · ".join(g for g in goal_bits if g)
            hint_lines = []
            if (rubric.get("comments") or "").strip():
                hint_lines.append((rubric.get("comments") or "").strip())
            if (rubric.get("facilitator_hint") or "").strip():
                hint_lines.append((rubric.get("facilitator_hint") or "").strip())
            impression_pool.append({
                "question_number": int(qn),
                "headlight_result": row.get("headlight_result"),
                "audio_bytes": clip_bytes,
                "question_text": question_text,
                "context_hint": "\n".join(hint_lines),
                "linguistic_goal_line": linguistic_goal_line,
                "pls_semantics_area": (rubric.get("category_pls") or "").strip(),
                "pls_category": (rubric.get("sub_category_pls") or "").strip(),
            })

        ay = int(age_years) if age_years is not None else 0
        am = int(age_months) if age_months is not None else 0
        child_age_label_he = f"{ay} שנים ו-{am} חודשים"
        expressive_language_impression = {
            "status": "skipped",
            "reason": "no_eligible_samples",
            "sample_count_used": 0,
            "data_quality": "limited",
            "limitations_he": "לא נאספו דגימות הבעה עם קטע שמע תקין.",
        }
        if impression_pool:
            k = min(EXPRESSION_IMPRESSION_SAMPLE_CAP, len(impression_pool))
            chosen = random.sample(impression_pool, k=k) if k else []
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
            comprehension_context_he = _build_comprehension_impression_context_he(
                full_array, child_gender
            )
            try:
                imp = summarize_expressive_language_impression_gemini(
                    entries,
                    child_age_label_he,
                    max_output_tokens=GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS,
                    comprehension_context_he=comprehension_context_he or None,
                )
            except Exception as imp_err:
                logger.error("Incremental impression build failed for test %s: %s", test_id, imp_err)
                imp = None
            if imp:
                expressive_language_impression = {
                    "status": "done",
                    **imp,
                    "samples_submitted": len(entries),
                }
            else:
                expressive_language_impression = {
                    "status": "failed",
                    "reason": "model_unavailable_or_invalid_json",
                    "sample_count_used": 0,
                    "data_quality": "limited",
                    "limitations_he": "לא ניתן היה להפיק התרשמות אוטומטית (שירות המודל או פלט לא תקין).",
                }

        payload = {
            "status": "done",
            "test_id": test_id,
            "started_at": started_at,
            "completed_at": datetime.utcnow().isoformat() + "Z",
            "per_question": rows,
            "summary": _aggregate_expression_ai(rows),
            "meta": {
                "expression_question_count": total_expression_items,
                "parent_ai_comparison": {
                    "status": "done",
                    **_build_parent_ai_comparison(expression_items, rows),
                },
                "progress": {
                    "phase": "done",
                    "processed_questions": total_expression_items,
                    "total_questions": total_expression_items,
                    "last_updated_at": datetime.utcnow().isoformat() + "Z",
                },
                "uploaded_segments": len(segments),
            },
            "expressive_language_impression": expressive_language_impression,
        }
        storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=payload)
        _maybe_send_results_sms(user_id, test_id, payload)
    except Exception as e:
        logger.error("Incremental finalize failed for test %s: %s", test_id, e)


def _build_failed_expression_ai_payload(test_id, started_at, total_expression_items, error_message, per_question_rows):
    rows = list(per_question_rows or [])
    processed = len(rows)
    return {
        "status": "failed",
        "test_id": test_id,
        "started_at": started_at,
        "completed_at": datetime.utcnow().isoformat() + "Z",
        "error": str(error_message),
        "per_question": rows,
        "summary": _aggregate_expression_ai(rows),
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
                "processed_questions": processed,
                "total_questions": total_expression_items,
                "last_updated_at": datetime.utcnow().isoformat() + "Z",
            },
        },
        "expressive_language_impression": {
            "status": "failed",
            "reason": "pipeline_error",
            "limitations_he": str(error_message),
        },
    }


def _finalize_stuck_pending_expression_ai(user_id, test_id, started_at, total_expression_items, latest_rows):
    """Ensure background job never leaves impression/status pending forever."""
    preserved = list(latest_rows or [])
    if not preserved:
        existing = storage.get_test_expression_ai(user_id=user_id, test_id=test_id) or {}
        preserved = existing.get("per_question") or []
    return _build_failed_expression_ai_payload(
        test_id=test_id,
        started_at=started_at,
        total_expression_items=total_expression_items,
        error_message="expression_ai_job_ended_before_completion",
        per_question_rows=preserved,
    )


def _expression_ai_payload_is_terminal(payload):
    if not payload:
        return False
    status = payload.get("status")
    if status in ("done", "failed"):
        return True
    impression = payload.get("expressive_language_impression") or {}
    return impression.get("status") in ("done", "failed", "skipped")


def _run_expression_ai_background(
    user_id,
    test_id,
    full_array,
    timestamps,
    audio_file64,
    child_gender,
    age_years,
    age_months,
    started_at,
    audio_blob_path=None,
):
    total_expression_items = len(_parse_expression_results_from_full_array(full_array))
    latest_rows = []
    payload = None
    terminal_written = False

    def emit_progress(phase, processed_questions, total_questions, rows_snapshot):
        latest_rows[:] = list(rows_snapshot)
        pending = _build_pending_expression_ai_payload(
            test_id=test_id,
            started_at=started_at,
            expression_question_count=total_questions,
            phase=phase,
            processed_questions=processed_questions,
            per_question_rows=latest_rows,
        )
        storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=pending)

    try:
        if audio_blob_path:
            emit_progress("awaiting_audio", 0, total_expression_items, [])
            if not azure_blob.wait_for_blob(audio_blob_path):
                raise RuntimeError(
                    f"Session audio blob not available within {azure_blob.AUDIO_BLOB_WAIT_SECONDS}s"
                )

        emit_progress("processing_started", 0, total_expression_items, [])
        payload = _compute_expression_ai_payload(
            full_array,
            timestamps,
            child_gender,
            age_years,
            age_months,
            progress_cb=emit_progress,
            audio_file64=audio_file64,
            audio_blob_path=audio_blob_path,
        )
        payload["test_id"] = test_id
        payload["started_at"] = started_at
        terminal_written = _expression_ai_payload_is_terminal(payload)
    except Exception as e:
        logger.error(f"Background expression AI failed for testId {test_id}: {e}")
        payload = _build_failed_expression_ai_payload(
            test_id=test_id,
            started_at=started_at,
            total_expression_items=total_expression_items,
            error_message=e,
            per_question_rows=latest_rows,
        )
        terminal_written = True
    finally:
        if not terminal_written:
            payload = _finalize_stuck_pending_expression_ai(
                user_id, test_id, started_at, total_expression_items, latest_rows
            )
        if payload is not None:
            storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=payload)
            _maybe_send_results_sms(user_id, test_id, payload)


def _maybe_send_results_sms(user_id, test_id, payload):
    if not payload or payload.get("status") != "done":
        return
    phone = storage.get_user_parent_phone(user_id)
    if not phone:
        return
    test_doc = storage.get_user_test_by_id(user_id, test_id)
    if not test_doc:
        return
    access = test_doc.get("resultsAccess") or {}
    token = access.get("token")
    if not token:
        return
    if access.get("smsSentAt"):
        return
    if _results_token_expired(access.get("expiresAt")):
        return
    url = _build_results_public_url(token)
    if sms_notify.send_results_ready_sms(phone, url):
        storage.mark_results_sms_sent(user_id, test_id)
    else:
        storage.set_test_sms_last_error(user_id, test_id, "sms_send_failed")


def _maybe_finalize_stale_building_impression(payload, user_id, test_id):
    """If worker died during building_impression, mark failed while keeping scores."""
    if not payload or payload.get("status") in ("done", "failed"):
        return payload
    meta = payload.get("meta") or {}
    progress = meta.get("progress") or {}
    phase = progress.get("phase")
    if phase != "building_impression":
        return payload
    updated_at = progress.get("last_updated_at") or payload.get("started_at")
    if not updated_at:
        return payload
    try:
        ts = updated_at.replace("Z", "+00:00")
        last = datetime.fromisoformat(ts)
        if last.tzinfo:
            from datetime import timezone
            age_sec = (datetime.now(timezone.utc) - last).total_seconds()
        else:
            age_sec = (datetime.utcnow() - last).total_seconds()
    except Exception:
        return payload
    if age_sec < EXPRESSION_AI_STALE_BUILDING_IMPRESSION_MINUTES * 60:
        return payload
    rows = payload.get("per_question") or []
    failed = _build_failed_expression_ai_payload(
        test_id=test_id,
        started_at=payload.get("started_at") or datetime.utcnow().isoformat() + "Z",
        total_expression_items=progress.get("total_questions") or len(rows),
        error_message="stale_building_impression_timeout",
        per_question_rows=rows,
    )
    storage.update_test_expression_ai(user_id=user_id, test_id=test_id, expression_ai=failed)
    return failed


@app.get("/api/results/by-token")
def results_by_token(t: str):
    token = str(t or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="Token is required")
    found = storage.find_test_by_results_token(token)
    if not found:
        raise HTTPException(status_code=404, detail="Results not found")
    user_id = found["userId"]
    test_doc = found["test"] or {}
    access = test_doc.get("resultsAccess") or {}
    expires_at = access.get("expiresAt")
    if _results_token_expired(expires_at):
        raise HTTPException(status_code=410, detail="Results link has expired")
    expression_ai = test_doc.get("expressionAI") or {}
    test_id = test_doc.get("testId")
    if test_id and expression_ai:
        expression_ai = _maybe_finalize_stale_building_impression(
            expression_ai, user_id, test_id
        )
    parent_expression_by_question = {}
    full_array = test_doc.get("fullArray") or ""
    for qn, result in _parse_expression_results_from_full_array(full_array):
        parent_expression_by_question[str(qn)] = result
    return {
        "success": True,
        "expiresAt": expires_at,
        "test_id": test_id,
        "expression_ai": expression_ai,
        "parent_expression_by_question": parent_expression_by_question,
        "summary": {
            "correct": test_doc.get("correct"),
            "partly": test_doc.get("partly"),
            "wrong": test_doc.get("wrong"),
            "ageYears": test_doc.get("ageYears"),
            "ageMonths": test_doc.get("ageMonths"),
        },
    }


@app.get("/api/expressionAiStatus")
def expression_ai_status(userId: int, testId: str):
    payload = storage.get_test_expression_ai(user_id=userId, test_id=testId)
    if payload is None:
        raise HTTPException(status_code=404, detail="Test or expression AI payload not found")
    payload = _maybe_finalize_stale_building_impression(payload, userId, testId)
    return {"success": True, "test_id": testId, "expression_ai": payload}


@app.get("/api/tests/recoverLatest")
def recover_latest_test(userId: int):
    latest = storage.get_latest_user_test(userId)
    if not latest:
        raise HTTPException(status_code=404, detail="No tests found for user")
    test_id = latest.get("testId")
    expression_ai = latest.get("expressionAI") or {}
    upload_complete = bool(latest.get("audioBlobPath") or latest.get("audioFile64"))
    return {
        "success": True,
        "test_id": test_id,
        "createdAt": latest.get("dateFinished"),
        "uploadComplete": upload_complete,
        "expression_ai": expression_ai,
    }


@app.get("/api/testStatus")
def test_status(userId: int, testId: str):
    test_doc = storage.get_user_test_by_id(userId, testId)
    if not test_doc:
        raise HTTPException(status_code=404, detail="Test not found")
    expression_ai = test_doc.get("expressionAI") or {}
    expression_ai = _maybe_finalize_stale_building_impression(expression_ai, userId, testId)
    return {
        "success": True,
        "test_id": testId,
        "uploadComplete": bool(test_doc.get("audioBlobPath") or test_doc.get("audioFile64")),
        "audioBlobPath": test_doc.get("audioBlobPath"),
        "expression_ai": expression_ai,
    }






