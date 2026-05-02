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
GEMINI_DAILY_LIMIT = int(os.environ.get("GEMINI_DAILY_LIMIT", "100"))
GEMINI_MAX_SEGMENT_SECONDS = int(os.environ.get("GEMINI_MAX_SEGMENT_SECONDS", "20"))
GEMINI_IMPRESSION_DAILY_LIMIT = int(os.environ.get("GEMINI_IMPRESSION_DAILY_LIMIT", "200"))
GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS = int(os.environ.get("GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS", "500"))
EXPRESSION_IMPRESSION_SAMPLE_CAP = int(os.environ.get("EXPRESSION_IMPRESSION_SAMPLE_CAP", "10"))


def _load_expression_rubrics():
    """
    Loads expression-question rubric fields from the shared CSV.
    Expected columns (order does not matter):
      - query_boy / query_girl (preferred) or query (fallback)
      - expected_full_ai (preferred) or expected_full (fallback)
      - expected_partial
      - expected_wrong
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
        logger.warning("Expression rubric CSV not found; Gemini expression scoring will be skipped.")
        return {}

    rubrics = {}
    try:
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                qn = str((row.get("query_number") or "").strip())
                qtype = (row.get("query_type") or "").strip()
                if not qn or qtype != "הבעה":
                    continue
                rubrics[qn] = {
                    "question_text_boy": (row.get("query_boy") or "").strip(),
                    "question_text_girl": (row.get("query_girl") or "").strip(),
                    "question_text_fallback": (row.get("query") or "").strip(),
                    "expected_full": (row.get("expected_full_ai") or row.get("expected_full") or "").strip(),
                    "expected_partial": (row.get("expected_partial") or "").strip(),
                    "expected_wrong": (row.get("expected_wrong") or "").strip(),
                    "comments": (row.get("comments") or "").strip(),
                    "facilitator_hint": (row.get("hint") or "").strip(),
                    "semantics": (row.get("semantics") or "").strip(),
                    "category_pls": (row.get("category PLS") or row.get("category_pls") or "").strip(),
                    "test_goal": (row.get("test goal") or row.get("test_goal") or "").strip(),
                }
    except Exception as e:
        logger.warning(f"Failed to load expression rubrics from CSV: {e}")
        return {}

    return rubrics


EXPRESSION_RUBRICS = _load_expression_rubrics()


def _parse_expression_results_from_full_array(full_array_str):
    """
    full_array is JSON-stringified object from frontend:
      {"comprehension":"[(1,\"correct\")]", "expression":"[(7,\"partly\"),(8,\"wrong\")]"}
    Returns list of tuples: [(question_number:str, headlight_result:str), ...]
    """
    try:
        parsed = json.loads(full_array_str)
    except Exception:
        return []

    expr = parsed.get("expression") if isinstance(parsed, dict) else None
    if not isinstance(expr, str):
        return []

    matches = re.findall(r'\((\d+),"([^"]+)"\)', expr)
    return [(m[0], m[1]) for m in matches]


def _parse_question_timestamps(timestamps_text):
    """
    Frontend timestamps format: [(1,0),(2,65),(3,127)]
    Returns list of tuples: [(question_number:int, second:int), ...] sorted by second.
    """
    if not timestamps_text:
        return []
    pairs = re.findall(r'\((\d+),\s*(\d+)\)', timestamps_text)
    rows = [(int(q), int(t)) for q, t in pairs]
    rows.sort(key=lambda x: x[1])
    return rows


def _timestamp_window_for_question(qn, sorted_marks):
    """
    Calculates [start, end) window for a question using next timestamp as end when possible.
    """
    start = None
    end = None
    for idx, (question_num, sec) in enumerate(sorted_marks):
        if str(question_num) == str(qn):
            start = sec
            if idx + 1 < len(sorted_marks):
                end = sorted_marks[idx + 1][1]
            break
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
    audioFile64: str
    timestamps: str
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
    pending_expression_ai = {
        "status": "pending",
        "test_id": test_id,
        "started_at": datetime.utcnow().isoformat() + "Z",
        "per_question": [],
        "summary": {
            "score_avg": None,
            "score_0_1_2": [],
            "counts": {"0": 0, "1": 0, "2": 0},
            "daily_limit": GEMINI_DAILY_LIMIT,
            "max_segment_seconds": GEMINI_MAX_SEGMENT_SECONDS,
        },
        "meta": {
            "expression_question_count": len(expression_items),
        },
        "expressive_language_impression": {"status": "pending"},
    }

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
    )

    return {
        "success": True,
        "test_id": test_id,
        "transcription": updated_transcription["updated_transcription"],
        "expression_ai": pending_expression_ai,
    }


def _compute_expression_ai_payload(full_array, timestamps, audio_file64, child_gender, age_years, age_months):
    expression_ai_rows = []
    impression_pool = []
    expression_items = _parse_expression_results_from_full_array(full_array)
    timestamp_marks = _parse_question_timestamps(timestamps)
    decoded_audio_bytes = None
    decode_audio_error = None
    try:
        decoded_audio_bytes = decode_base64_to_bytes(audio_file64)
    except Exception as e:
        decode_audio_error = str(e)
        logger.warning(f"Failed decoding test audio for expression slicing: {e}")

    for question_number, headlight_result in expression_items:
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
            continue

        start_sec, end_sec = _timestamp_window_for_question(question_number, timestamp_marks)
        if start_sec is not None and end_sec is not None and (end_sec - start_sec) > GEMINI_MAX_SEGMENT_SECONDS:
            expression_ai_rows.append({
                "question_number": int(question_number),
                "headlight_result": headlight_result,
                "ai_score": 1,
                "ai_confidence": 0.0,
                "ai_reason_short": "segment_too_long",
                "ai_flags": ["segment_too_long", "needs_manual_review"],
                "ai_speaker_observation": None,
                "timestamp_start_sec": start_sec,
                "timestamp_end_sec": end_sec,
            })
            continue
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
            continue

        normalized_gender = str(child_gender or "").strip().lower()
        is_female = normalized_gender in ["female", "girl"]
        question_text = (
            rubric.get("question_text_girl") if is_female
            else rubric.get("question_text_boy")
        ) or rubric.get("question_text_fallback") or ""

        prompt_with_window = (
            question_text
            + (
                f"\n\nRelevant answer window (seconds in full recording): start={start_sec}, end={end_sec if end_sec is not None else 'end_of_recording'}"
                if start_sec is not None else ""
            )
        )

        effective_end_sec = end_sec if end_sec is not None else (start_sec + GEMINI_MAX_SEGMENT_SECONDS)
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
            continue

        goal_bits = [
            (rubric.get("semantics") or "").strip(),
            (rubric.get("category_pls") or "").strip(),
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

    expression_ai_summary = _aggregate_expression_ai(expression_ai_rows)

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
                    "audio_bytes": c["audio_bytes"],
                })
            imp = summarize_expressive_language_impression_gemini(
                entries,
                child_age_label_he,
                max_output_tokens=GEMINI_IMPRESSION_MAX_OUTPUT_TOKENS,
            )
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
        "expressive_language_impression": expressive_language_impression,
    }


def _run_expression_ai_background(user_id, test_id, full_array, timestamps, audio_file64, child_gender, age_years, age_months):
    try:
        payload = _compute_expression_ai_payload(
            full_array, timestamps, audio_file64, child_gender, age_years, age_months
        )
    except Exception as e:
        logger.error(f"Background expression AI failed for testId {test_id}: {e}")
        payload = {
            "status": "failed",
            "completed_at": datetime.utcnow().isoformat() + "Z",
            "error": str(e),
            "per_question": [],
            "summary": _aggregate_expression_ai([]),
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


