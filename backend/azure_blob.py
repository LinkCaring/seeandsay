"""
Azure Blob helpers for session audio (container SAS from env).
"""
from __future__ import annotations

import os
import time
from typing import Optional, Tuple

import requests

# Server poll when blob not yet present (edge case); not the 12:30 recording cap. Default 30 min.
AUDIO_BLOB_WAIT_SECONDS = int(os.environ.get("AZURE_AUDIO_BLOB_WAIT_SECONDS", "1800"))
AUDIO_BLOB_POLL_INTERVAL_SEC = float(os.environ.get("AZURE_AUDIO_BLOB_POLL_INTERVAL_SEC", "2"))


def _account() -> str:
    return (os.environ.get("AZURE_STORAGE_ACCOUNT_NAME") or "").strip()


def _container() -> str:
    return (os.environ.get("AZURE_STORAGE_CONTAINER") or "").strip()


def _sas_token() -> str:
    return (os.environ.get("AZURE_STORAGE_SAS_TOKEN") or "").strip().lstrip("?")


def is_configured() -> bool:
    return bool(_account() and _container() and _sas_token())


def session_blob_path(user_id: int | str, test_id: str) -> str:
    return f"tests/{user_id}/{test_id}/session.mp3"


def expression_segment_blob_path(user_id: int | str, test_id: str, question_number: str | int) -> str:
    qn = str(question_number).strip()
    return f"tests/{user_id}/{test_id}/expression/q{qn}.mp3"


def build_upload_url(blob_path: str) -> str:
    account = _account()
    container = _container()
    sas = _sas_token()
    if not account or not container or not sas:
        raise RuntimeError("Azure Blob storage is not configured (missing env vars)")
    path = blob_path.lstrip("/")
    return f"https://{account}.blob.core.windows.net/{container}/{path}?{sas}"


def _blob_url(blob_path: str) -> str:
    return build_upload_url(blob_path)


def verify_blob_exists(blob_path: str, min_size: int = 1) -> Tuple[bool, Optional[int]]:
    """HEAD blob; returns (exists_with_min_size, content_length)."""
    if not is_configured():
        return False, None
    url = _blob_url(blob_path)
    try:
        resp = requests.head(url, timeout=30)
        if resp.status_code not in (200, 201):
            return False, None
        length = resp.headers.get("Content-Length")
        size = int(length) if length is not None else None
        if size is not None and size < min_size:
            return False, size
        return True, size
    except Exception:
        return False, None


def wait_for_blob(blob_path: str, max_wait_sec: Optional[int] = None) -> bool:
    deadline = time.time() + (max_wait_sec if max_wait_sec is not None else AUDIO_BLOB_WAIT_SECONDS)
    while time.time() < deadline:
        ok, _ = verify_blob_exists(blob_path)
        if ok:
            return True
        time.sleep(AUDIO_BLOB_POLL_INTERVAL_SEC)
    return False


def download_blob_bytes(blob_path: str, max_bytes: Optional[int] = None) -> bytes:
    url = _blob_url(blob_path)
    resp = requests.get(url, timeout=120, stream=True)
    resp.raise_for_status()
    data = resp.content
    if max_bytes is not None and len(data) > max_bytes:
        raise ValueError(f"Blob exceeds max size {max_bytes}")
    return data
