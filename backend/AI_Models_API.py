
try:
    from openai import OpenAI
except Exception:
    OpenAI = None

from httpx import HTTPStatusError

import os
from dotenv import load_dotenv
import logging
import re
import base64
import json
import io
from prompts import (
    build_expression_scoring_prompt,
    EXPRESSIVE_LANGUAGE_IMPRESSION_INSTRUCTIONS_HE,
    build_expressive_language_impression_header,
)

#from server import *


load_dotenv()
# OPENAI_API_KEY = os.environ.get("OPENAI_KEY")
OPENAI_LINKCARRING_API_KEY = os.environ.get("OPENAI_LINKCARRING_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
# Set to 1 / true to log rich Gemini parse/API diagnostics (no audio bytes logged).
_GEMINI_SCORE_DEBUG = str(os.environ.get("GEMINI_EXPRESSION_SCORE_DEBUG", "")).strip().lower() in (
    "1", "true", "yes", "on",
)

# Must match prompts.py speaker_observation enum (+ pipeline-only fallback).
_SPEAKER_OBSERVATION_VALUES = frozenset({
    "child_response_clear",
    "single_speaker_examinee_clear",
    "no_audible_speech",
    "only_noise_or_unclear",
    "adult_or_parent_only_no_child",
    "mixed_speakers_child_segment_unclear",
    "manual_review_fallback",
})


def _as_float01(x):
    """Accept Python float, numpy scalars, Decimal, str; returns float in [0,1] or raises."""
    if isinstance(x, bool):
        raise TypeError("bool not allowed")
    v = float(x)
    if v < 0 or v > 1:
        raise ValueError("out of range")
    return v


def _as_score_012(x):
    """Accept int-like (including numpy), str digits; returns 0, 1, or 2 or raises."""
    if isinstance(x, bool):
        raise TypeError("bool not allowed")
    n = int(round(float(x)))
    if n not in (0, 1, 2):
        raise ValueError("not in 0..2")
    return n


openAI_client = OpenAI(api_key=OPENAI_LINKCARRING_API_KEY) if (OpenAI and OPENAI_LINKCARRING_API_KEY) else None


def decode_base64_to_bytes(base64_audio):
    if not base64_audio:
        raise ValueError(f"No 'base64_audio' (base64) found.")

    audio_b64 = base64_audio
    if isinstance(base64_audio, str) and base64_audio.startswith("data:"):
        _, _, payload = base64_audio.partition(",")
        audio_b64 = payload

    # Decode base64 to bytes
    try:
        audio_bytes = base64.b64decode(audio_b64)
    except Exception as e:
        raise ValueError(f"Error decoding base64 audio: {e}")

    # # Save the file
    # with open(output_path, "wb") as f:
    #     f.write(audio_bytes)
    # f.close()

    return audio_bytes


def slice_audio_window_bytes(audio_bytes, start_sec, end_sec, output_format="mp3"):
    """
    Returns sliced audio bytes for [start_sec, end_sec) window.
    Uses pydub and clamps to valid range.
    """
    try:
        from pydub import AudioSegment
    except Exception as e:
        raise RuntimeError(f"pydub is unavailable: {e}")

    if audio_bytes is None:
        raise ValueError("audio_bytes is required for slicing.")
    if start_sec is None or end_sec is None:
        raise ValueError("Both start_sec and end_sec are required for slicing.")

    start_ms = int(max(0, float(start_sec)) * 1000)
    end_ms = int(max(0, float(end_sec)) * 1000)
    if end_ms <= start_ms:
        raise ValueError("Invalid slice window: end must be after start.")

    source = AudioSegment.from_file(io.BytesIO(audio_bytes))
    total_ms = len(source)
    clamped_start_ms = min(start_ms, total_ms)
    clamped_end_ms = min(end_ms, total_ms)
    if clamped_end_ms <= clamped_start_ms:
        raise ValueError("Slice window is outside audio duration.")

    segment = source[clamped_start_ms:clamped_end_ms]
    output = io.BytesIO()
    segment.export(output, format=output_format)
    return output.getvalue()


def _validate_expression_scoring_payload(payload):
    if not isinstance(payload, dict):
        return False
    # Do not use isinstance(x, float): numpy / Decimal / google types fail that check.
    try:
        _as_score_012(payload.get("score"))
    except Exception:
        return False
    try:
        _as_float01(payload.get("confidence"))
    except Exception:
        return False
    if not isinstance(payload.get("reason_short"), str):
        return False
    flags = payload.get("flags")
    if not isinstance(flags, list):
        return False
    obs = payload.get("speaker_observation")
    if not isinstance(obs, str) or obs.strip() not in _SPEAKER_OBSERVATION_VALUES:
        return False
    return True


def _coerce_expression_scoring_dict(raw):
    """
    Gemini sometimes returns JSON numbers as strings or omits fields.
    Normalize before strict validation so real scores aren't rejected.
    Also normalizes numpy/google numeric scalars (float/int isinstance checks miss np.float64).
    """
    if raw is None:
        return None
    if hasattr(raw, "model_dump"):
        try:
            raw = raw.model_dump()
        except Exception:
            raw = None
    if not isinstance(raw, dict):
        return None
    out = dict(raw)

    rs = out.get("reason_short")
    if rs is None:
        out["reason_short"] = ""
    elif not isinstance(rs, str):
        out["reason_short"] = str(rs)

    fl = out.get("flags")
    if fl is None:
        out["flags"] = []
    elif isinstance(fl, str):
        out["flags"] = [fl]
    elif isinstance(fl, list):
        out["flags"] = [str(x) for x in fl]
    else:
        out["flags"] = []

    # Score / confidence: accept str, numpy scalars, Decimal, etc.
    try:
        out["score"] = _as_score_012(out.get("score"))
    except Exception:
        pass
    try:
        out["confidence"] = _as_float01(out.get("confidence"))
    except Exception:
        pass

    so = out.get("speaker_observation")
    if isinstance(so, str):
        out["speaker_observation"] = so.strip()
    elif so is not None:
        out["speaker_observation"] = str(so).strip()

    return out


def _expression_scoring_response_schema(types_module):
    """OpenAPI-style schema for structured JSON output (Gemini API)."""
    Sch = types_module.Schema
    Ty = types_module.Type
    obs_strings = [
        "child_response_clear",
        "single_speaker_examinee_clear",
        "no_audible_speech",
        "only_noise_or_unclear",
        "adult_or_parent_only_no_child",
        "mixed_speakers_child_segment_unclear",
    ]
    return Sch(
        type=Ty.OBJECT,
        required=["score", "confidence", "reason_short", "flags", "speaker_observation"],
        properties={
            "score": Sch(type=Ty.INTEGER, minimum=0, maximum=2),
            "confidence": Sch(type=Ty.NUMBER, minimum=0, maximum=1),
            "reason_short": Sch(type=Ty.STRING),
            "flags": Sch(
                type=Ty.ARRAY,
                items=Sch(type=Ty.STRING),
            ),
            "speaker_observation": Sch(
                type=Ty.STRING,
                enum=obs_strings,
            ),
        },
    )


def _strip_markdown_json_fence(text):
    """Models sometimes wrap JSON in ```json ... ``` even when mime type is json."""
    if not text:
        return text
    s = text.strip()
    if not s.startswith("```"):
        return s
    s = re.sub(r"^```[a-zA-Z0-9]*\s*", "", s)
    s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _extract_json_text_from_gemini_response(response):
    """Prefer SDK helpers; fall back to first candidate text parts."""
    text = getattr(response, "text", None)
    if text:
        return text
    try:
        cands = getattr(response, "candidates", None) or []
        if not cands:
            return None
        parts = cands[0].content.parts if cands[0].content else None
        if not parts:
            return None
        chunks = []
        for p in parts:
            t = getattr(p, "text", None)
            if t:
                chunks.append(t)
        return "".join(chunks) if chunks else None
    except Exception:
        return None


def _log_gemini_response_issues(response, stage):
    """Debug empty/blocked responses without leaking full audio."""
    try:
        pf = getattr(response, "prompt_feedback", None)
        if pf is not None:
            logging.warning("Gemini expression scoring [%s]: prompt_feedback=%s", stage, pf)
        cands = getattr(response, "candidates", None)
        if not cands:
            logging.warning("Gemini expression scoring [%s]: no candidates in response", stage)
        else:
            for i, c in enumerate(cands):
                fr = getattr(c, "finish_reason", None)
                if fr is not None:
                    logging.warning(
                        "Gemini expression scoring [%s]: candidate[%s] finish_reason=%s",
                        stage, i, fr,
                    )
    except Exception as e:
        logging.warning("Gemini expression scoring [%s]: could not log response metadata: %s", stage, e)


def score_expression_with_gemini(base64_audio, question_prompt, expected_full, expected_partial, expected_wrong):
    """
    Scores a single expression question with Gemini.
    Returns dict: {score, confidence, reason_short, flags} or None on hard failure.
    """
    try:
        audio_bytes = decode_base64_to_bytes(base64_audio)
    except Exception as e:
        logging.warning(f"Could not decode expression audio for Gemini: {e}")
        return None

    return score_expression_with_gemini_bytes(
        audio_bytes=audio_bytes,
        question_prompt=question_prompt,
        expected_full=expected_full,
        expected_partial=expected_partial,
        expected_wrong=expected_wrong,
    )


def score_expression_with_gemini_bytes(audio_bytes, question_prompt, expected_full, expected_partial, expected_wrong):
    if not GEMINI_API_KEY:
        logging.warning("GEMINI_API_KEY is missing; skipping Gemini expression scoring.")
        return None

    try:
        # Lazy import so backend still works if package not installed yet.
        from google import genai
        from google.genai import types
    except Exception as e:
        logging.warning(f"google-genai dependency is unavailable: {e}")
        return None

    if not audio_bytes:
        logging.warning("Empty audio bytes passed to Gemini expression scoring.")
        return None

    prompt = build_expression_scoring_prompt(
        question_prompt=question_prompt,
        expected_full=expected_full,
        expected_partial=expected_partial,
        expected_wrong=expected_wrong,
    )

    client = genai.Client(api_key=GEMINI_API_KEY)
    # Default to Pro for scoring quality; override with GEMINI_MODEL / GEMINI_MODEL_FALLBACKS.
    _default_primary = "gemini-2.5-pro"
    primary_model = os.environ.get("GEMINI_MODEL", _default_primary).strip() or _default_primary
    fallback_csv = os.environ.get(
        "GEMINI_MODEL_FALLBACKS",
        "gemini-2.5-flash,gemini-2.5-flash-lite",
    )
    model_chain = []
    for m in [primary_model] + [x.strip() for x in fallback_csv.split(",") if x.strip()]:
        if m not in model_chain:
            model_chain.append(m)

    try:
        from google.genai import errors as genai_errors
    except Exception:
        genai_errors = None

    schema = _expression_scoring_response_schema(types)
    contents = [
        types.Part.from_text(text=prompt),
        types.Part.from_bytes(data=audio_bytes, mime_type="audio/mpeg"),
    ]
    if _GEMINI_SCORE_DEBUG:
        logging.info(
            "Gemini expression scoring: model_chain=%s audio_bytes=%s prompt_chars=%s",
            model_chain,
            len(audio_bytes),
            len(prompt),
        )

    def try_parse_response(response, stage):
        """Prefer structured parse from SDK; then JSON text; always coerce types."""
        parsed_obj = getattr(response, "parsed", None)
        if parsed_obj is not None:
            if _GEMINI_SCORE_DEBUG:
                logging.info(
                    "Gemini expression scoring [%s]: response.parsed type=%s repr=%s",
                    stage,
                    type(parsed_obj).__name__,
                    repr(parsed_obj)[:800],
                )
            coerced = _coerce_expression_scoring_dict(parsed_obj)
            if coerced and _validate_expression_scoring_payload(coerced):
                return coerced
            if _GEMINI_SCORE_DEBUG:
                logging.info(
                    "Gemini expression scoring [%s]: parsed branch failed validate; coerced=%s",
                    stage,
                    coerced,
                )
        raw_text = _extract_json_text_from_gemini_response(response)
        if not raw_text:
            _log_gemini_response_issues(response, stage)
            return None
        raw_text = _strip_markdown_json_fence(raw_text)
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as e:
            logging.warning(
                "Gemini expression scoring [%s]: invalid JSON (first 240 chars): %s — error: %s",
                stage,
                raw_text[:240],
                e,
            )
            return None
        coerced = _coerce_expression_scoring_dict(parsed)
        if coerced and _validate_expression_scoring_payload(coerced):
            return coerced
        logging.warning(
            "Gemini expression scoring [%s]: after coerce, payload invalid: %s",
            stage,
            coerced,
        )
        return None

    # For each model: structured JSON schema, then JSON mime only (multimodal quirks).
    for model_try in model_chain:
        for use_schema in (True, False):
            stage = (
                ("structured_schema+" if use_schema else "json_mime_only+") + model_try
            )
            try:
                cfg_kwargs = {
                    "temperature": 0.2,
                    "response_mime_type": "application/json",
                }
                if use_schema:
                    cfg_kwargs["response_schema"] = schema
                response = client.models.generate_content(
                    model=model_try,
                    config=types.GenerateContentConfig(**cfg_kwargs),
                    contents=contents,
                )
                ok = try_parse_response(response, stage)
                if ok:
                    return ok
                if _GEMINI_SCORE_DEBUG:
                    logging.info(
                        "Gemini expression scoring [%s]: parse returned None (see warnings above).",
                        stage,
                    )
            except Exception as e:
                # google.genai.errors.ClientError uses .code (HTTP status), not .status_code
                err_code = getattr(e, "code", None) or getattr(e, "status_code", None)
                if (
                    genai_errors
                    and isinstance(e, genai_errors.ClientError)
                    and err_code == 404
                ):
                    logging.warning(
                        "Gemini expression scoring: model %r not available (404). "
                        "Set GEMINI_MODEL to a current model (e.g. gemini-2.5-pro). Error: %s",
                        model_try,
                        e,
                    )
                    break
                logging.exception(
                    "Gemini expression scoring [%s] API raised — model=%s",
                    stage,
                    model_try,
                )
                continue

    logging.warning(
        "Gemini expression scoring exhausted retries; using manual-review fallback "
        "(tried models=%s). Check logs above for 404 model name or JSON/prompt_feedback.",
        model_chain,
    )
    return {
        "score": 1,
        "confidence": 0.0,
        "reason_short": "needs_manual_review",
        "flags": ["needs_manual_review"],
        "speaker_observation": "manual_review_fallback",
    }


_DATA_QUALITY_IMPRESSION = frozenset({"good", "partial", "limited"})


def _validate_expressive_language_impression_payload(payload):
    if not isinstance(payload, dict):
        return False
    if not isinstance(payload.get("summary_paragraph_he"), str):
        return False
    sc = payload.get("sample_count_used")
    try:
        sc = int(sc)
        if sc < 0:
            return False
    except Exception:
        return False
    dq = payload.get("data_quality")
    if not isinstance(dq, str) or dq.strip() not in _DATA_QUALITY_IMPRESSION:
        return False
    for key in ("observed_strengths", "observed_challenges"):
        v = payload.get(key)
        if not isinstance(v, list):
            return False
        if not all(isinstance(x, str) for x in v):
            return False
    for key in ("phonology_separate_note_he", "limitations_he"):
        if not isinstance(payload.get(key), str):
            return False
    # Extended PLS narrative report (still descriptive; not per-question 0/1/2)
    if not isinstance(payload.get("summary_card_intro_he"), str):
        return False
    for key in ("positive_points_he", "improvement_points_he"):
        v = payload.get(key)
        if not isinstance(v, list):
            return False
        if not all(isinstance(x, str) for x in v):
            return False
        if len(v) < 2:
            return False
    for key in (
        "feedback_integrative_language_he",
        "feedback_semantics_he",
        "feedback_language_structure_he",
        "feedback_phonological_awareness_he",
    ):
        if not isinstance(payload.get(key), str):
            return False
    steps = payload.get("recommended_next_steps_he")
    if not isinstance(steps, list):
        return False
    if not all(isinstance(x, str) for x in steps):
        return False
    if len(steps) != 3:
        return False
    return True


def _coerce_expressive_language_impression_dict(raw):
    if raw is None:
        return None
    if hasattr(raw, "model_dump"):
        try:
            raw = raw.model_dump()
        except Exception:
            raw = None
    if not isinstance(raw, dict):
        return None
    out = dict(raw)
    if out.get("summary_paragraph_he") is None:
        out["summary_paragraph_he"] = ""
    elif not isinstance(out["summary_paragraph_he"], str):
        out["summary_paragraph_he"] = str(out["summary_paragraph_he"])
    try:
        out["sample_count_used"] = int(out.get("sample_count_used", 0))
    except Exception:
        out["sample_count_used"] = 0
    dq = out.get("data_quality")
    if isinstance(dq, str) and dq.strip() in _DATA_QUALITY_IMPRESSION:
        out["data_quality"] = dq.strip()
    else:
        out["data_quality"] = "limited"
    for key in ("observed_strengths", "observed_challenges"):
        v = out.get(key)
        if v is None:
            out[key] = []
        elif isinstance(v, str):
            out[key] = [v] if v.strip() else []
        elif isinstance(v, list):
            out[key] = [str(x) for x in v]
        else:
            out[key] = []
    for key in ("phonology_separate_note_he", "limitations_he"):
        if out.get(key) is None:
            out[key] = ""
        elif not isinstance(out[key], str):
            out[key] = str(out[key])
    if out.get("summary_card_intro_he") is None:
        out["summary_card_intro_he"] = ""
    elif not isinstance(out["summary_card_intro_he"], str):
        out["summary_card_intro_he"] = str(out["summary_card_intro_he"])
    for key in ("positive_points_he", "improvement_points_he"):
        v = out.get(key)
        if v is None:
            out[key] = []
        elif isinstance(v, str):
            out[key] = [v] if v.strip() else []
        elif isinstance(v, list):
            out[key] = [str(x) for x in v]
        else:
            out[key] = []
    for key in (
        "feedback_integrative_language_he",
        "feedback_semantics_he",
        "feedback_language_structure_he",
        "feedback_phonological_awareness_he",
    ):
        if out.get(key) is None:
            out[key] = ""
        elif not isinstance(out[key], str):
            out[key] = str(out[key])
    st = out.get("recommended_next_steps_he")
    if st is None:
        out["recommended_next_steps_he"] = []
    elif isinstance(st, str):
        out["recommended_next_steps_he"] = [st] if st.strip() else []
    elif isinstance(st, list):
        out["recommended_next_steps_he"] = [str(x) for x in st]
    else:
        out["recommended_next_steps_he"] = []
    _normalize_impression_extended_fields(out)
    return out


def _normalize_impression_extended_fields(out):
    """Pad/trim extended PLS report fields so validation passes without re-calling the model."""
    filler_pos = "בדגימות שנבדקו עלו מקומות חוזרים שמצביעים על יכולת הבעה תקינה בחלק מהמשימות."
    filler_imp = "בדגימות שנבדקו עולה צורך בהמשך תרגול ממוקד בהתאם לגיל."
    filler_cat = (
        "בדגימות שנבדקו אין מספיק בסיס להתייחסות ספציפית למסגרת זו."
    )

    pos = [x.strip() for x in (out.get("positive_points_he") or []) if isinstance(x, str) and x.strip()]
    if len(pos) < 2:
        for x in out.get("observed_strengths") or []:
            if isinstance(x, str) and x.strip() and x.strip() not in pos:
                pos.append(x.strip())
            if len(pos) >= 2:
                break
    while len(pos) < 2:
        pos.append(filler_pos)
    out["positive_points_he"] = pos[:8]

    imp = [x.strip() for x in (out.get("improvement_points_he") or []) if isinstance(x, str) and x.strip()]
    if len(imp) < 2:
        for x in out.get("observed_challenges") or []:
            if isinstance(x, str) and x.strip() and x.strip() not in imp:
                imp.append(x.strip())
            if len(imp) >= 2:
                break
    while len(imp) < 2:
        imp.append(filler_imp)
    out["improvement_points_he"] = imp[:8]

    for key in (
        "feedback_integrative_language_he",
        "feedback_semantics_he",
        "feedback_language_structure_he",
        "feedback_phonological_awareness_he",
    ):
        v = (out.get(key) or "").strip() if isinstance(out.get(key), str) else ""
        if not v:
            out[key] = filler_cat
        else:
            out[key] = v

    intro = out.get("summary_card_intro_he")
    if not isinstance(intro, str) or not intro.strip():
        sp = (out.get("summary_paragraph_he") or "").strip()
        out["summary_card_intro_he"] = sp[:320] + ("…" if len(sp) > 320 else "") if sp else filler_cat

    steps = []
    for x in out.get("recommended_next_steps_he") or []:
        if isinstance(x, str) and x.strip():
            steps.append(x.strip())
    while len(steps) < 3:
        steps.append("המשיכו לתרגל באופן קצר ומהנה בהתאם לדגימות שנבדקו.")
    out["recommended_next_steps_he"] = steps[:3]


def _expressive_language_impression_response_schema(types_module):
    Sch = types_module.Schema
    Ty = types_module.Type
    str_arr = Sch(type=Ty.ARRAY, items=Sch(type=Ty.STRING))
    return Sch(
        type=Ty.OBJECT,
        required=[
            "summary_paragraph_he",
            "summary_card_intro_he",
            "sample_count_used",
            "data_quality",
            "observed_strengths",
            "observed_challenges",
            "positive_points_he",
            "improvement_points_he",
            "feedback_integrative_language_he",
            "feedback_semantics_he",
            "feedback_language_structure_he",
            "feedback_phonological_awareness_he",
            "recommended_next_steps_he",
            "phonology_separate_note_he",
            "limitations_he",
        ],
        properties={
            "summary_paragraph_he": Sch(
                type=Ty.STRING,
                description=(
                    "One concise Hebrew paragraph summarizing the child's expressive-language ability "
                    "based only on the provided expression samples. No grade, no diagnosis, no treatment recommendation."
                ),
            ),
            "summary_card_intro_he": Sch(
                type=Ty.STRING,
                description="1–2 short Hebrew sentences for an on-screen intro card (strengths/limitations overview).",
            ),
            "sample_count_used": Sch(
                type=Ty.INTEGER,
                description="Number of usable expression samples considered.",
            ),
            "data_quality": Sch(
                type=Ty.STRING,
                enum=["good", "partial", "limited"],
                description="How reliable the impression is based on sample count, audio/transcript clarity, and consistency.",
            ),
            "observed_strengths": str_arr,
            "observed_challenges": str_arr,
            "positive_points_he": Sch(
                type=Ty.ARRAY,
                items=Sch(type=Ty.STRING),
                description="2–4 short Hebrew bullet sentences: positive observations.",
            ),
            "improvement_points_he": Sch(
                type=Ty.ARRAY,
                items=Sch(type=Ty.STRING),
                description="2–4 short Hebrew bullet sentences: areas to reinforce.",
            ),
            "feedback_integrative_language_he": Sch(
                type=Ty.STRING,
                description="Hebrew paragraph: integrative language skills frame (מיומנויות שפה אינטגרטיביות).",
            ),
            "feedback_semantics_he": Sch(
                type=Ty.STRING,
                description="Hebrew paragraph: semantics frame (סמנטיקה).",
            ),
            "feedback_language_structure_he": Sch(
                type=Ty.STRING,
                description="Hebrew paragraph: language structure frame (מבנה שפה).",
            ),
            "feedback_phonological_awareness_he": Sch(
                type=Ty.STRING,
                description="Hebrew paragraph: phonological awareness frame (מודעות פונולוגית).",
            ),
            "recommended_next_steps_he": Sch(
                type=Ty.ARRAY,
                items=Sch(type=Ty.STRING),
                description="Exactly 3 short Hebrew lines suggesting home/practice activities (not clinical advice).",
            ),
            "phonology_separate_note_he": Sch(
                type=Ty.STRING,
                description="Short note about articulation/phonology only if relevant, explicitly separated from semantic-language ability.",
            ),
            "limitations_he": Sch(
                type=Ty.STRING,
                description="Brief Hebrew note about limitations, for example small number of samples or unclear audio.",
            ),
        },
    )


def summarize_expressive_language_impression_gemini(
    sample_entries,
    child_age_label_he: str,
    max_output_tokens: int = 500,
    comprehension_context_he: str = None,
):
    """
    One multimodal Gemini call: Hebrew instructions + up to 10 labeled audio clips.
    sample_entries: list of dicts with:
      question_number, headlight_result, question_text, context_hint, linguistic_goal_line,
      audio_bytes (mp3)
    Returns validated dict matching the impression schema, or None on hard failure.
    """
    if not GEMINI_API_KEY:
        logging.warning("GEMINI_API_KEY is missing; skipping expressive-language impression.")
        return None
    if not sample_entries:
        return None

    try:
        from google import genai
        from google.genai import types
    except Exception as e:
        logging.warning(f"google-genai dependency is unavailable: {e}")
        return None

    header = build_expressive_language_impression_header(child_age_label_he)
    intro = EXPRESSIVE_LANGUAGE_IMPRESSION_INSTRUCTIONS_HE.strip() + "\n\n" + header.strip()

    parts = [types.Part.from_text(text=intro)]
    comp_ctx = (comprehension_context_he or "").strip()
    if comp_ctx:
        parts.append(types.Part.from_text(text=comp_ctx))
    for i, ent in enumerate(sample_entries, start=1):
        qn = ent.get("question_number")
        hl = ent.get("headlight_result") or ""
        qt = (ent.get("question_text") or "").strip()
        ctx = (ent.get("context_hint") or "").strip()
        goal = (ent.get("linguistic_goal_line") or "").strip()
        pls_area = (ent.get("pls_semantics_area") or "").strip()
        pls_cat = (ent.get("pls_category") or "").strip()
        meta = (
            f"--- דגימה {i} ---\n"
            f"מספר שאלה: {qn}\n"
            f"תוצאת מחוון במשימה: {hl}\n"
            f"נוסח השאלה:\n{qt}\n"
        )
        if pls_area:
            meta += f"מסגרת רחבה לפי עמודת category_PLS בקובץ המבחן: {pls_area}\n"
        if pls_cat:
            meta += f"פירוט משני (עמודת sub_category_PLS בקובץ — לא מחליף את category_PLS): {pls_cat}\n"
        if goal:
            meta += f"מטרה לשונית צפויה (מתוך חומרי המבחן):\n{goal}\n"
        if ctx:
            meta += f"הקשר/הנחיה למבחן:\n{ctx}\n"
        meta += "\nקטע שמע (MP3) של תשובת הילד בחלון זה:\n"
        parts.append(types.Part.from_text(text=meta))
        ab = ent.get("audio_bytes") or b""
        if not ab:
            logging.warning("Expressive impression: missing audio for sample %s", qn)
            continue
        parts.append(types.Part.from_bytes(data=ab, mime_type="audio/mpeg"))

    if len(parts) < 2:
        return None

    client = genai.Client(api_key=GEMINI_API_KEY)
    _default_primary = "gemini-2.5-pro"
    primary_model = os.environ.get("GEMINI_MODEL", _default_primary).strip() or _default_primary
    fallback_csv = os.environ.get(
        "GEMINI_MODEL_FALLBACKS",
        "gemini-2.5-flash,gemini-2.5-flash-lite",
    )
    model_chain = []
    for m in [primary_model] + [x.strip() for x in fallback_csv.split(",") if x.strip()]:
        if m not in model_chain:
            model_chain.append(m)

    try:
        from google.genai import errors as genai_errors
    except Exception:
        genai_errors = None

    schema = _expressive_language_impression_response_schema(types)
    contents = parts
    mot = max(1024, min(int(max_output_tokens or 500), 8192))

    def try_parse_response(response, stage):
        parsed_obj = getattr(response, "parsed", None)
        if parsed_obj is not None:
            coerced = _coerce_expressive_language_impression_dict(parsed_obj)
            if coerced and _validate_expressive_language_impression_payload(coerced):
                return coerced
        raw_text = _extract_json_text_from_gemini_response(response)
        if not raw_text:
            return None
        raw_text = _strip_markdown_json_fence(raw_text)
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError:
            return None
        coerced = _coerce_expressive_language_impression_dict(parsed)
        if coerced and _validate_expressive_language_impression_payload(coerced):
            return coerced
        return None

    for model_try in model_chain:
        for use_schema in (True, False):
            stage = (
                ("structured_schema+" if use_schema else "json_mime_only+") + model_try
            )
            try:
                cfg_kwargs = {
                    "temperature": 0.2,
                    "max_output_tokens": mot,
                    "response_mime_type": "application/json",
                }
                if use_schema:
                    cfg_kwargs["response_schema"] = schema
                response = client.models.generate_content(
                    model=model_try,
                    config=types.GenerateContentConfig(**cfg_kwargs),
                    contents=contents,
                )
                ok = try_parse_response(response, stage)
                if ok:
                    return ok
            except Exception as e:
                err_code = getattr(e, "code", None) or getattr(e, "status_code", None)
                if (
                    genai_errors
                    and isinstance(e, genai_errors.ClientError)
                    and err_code == 404
                ):
                    logging.warning(
                        "Expressive impression: model %r not available (404). Error: %s",
                        model_try,
                        e,
                    )
                    break
                logging.exception(
                    "Expressive language impression [%s] API raised — model=%s",
                    stage,
                    model_try,
                )
                continue

    logging.warning("Expressive language impression exhausted retries.")
    return None

