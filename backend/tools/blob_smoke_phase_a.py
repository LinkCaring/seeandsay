"""
Phase A: verify Azure Blob SAS (server PUT) and Blob CORS (OPTIONS preflight).
Reads backend/.env. Writes frontend_demo/blob-smoke-config.local.json for browser smoke page.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
try:
    import requests
except ImportError:
    print("Install requests in backend venv: pip install requests")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / "backend" / ".env"
CONFIG_PATH = ROOT / "frontend_demo" / "blob-smoke-config.local.json"
ORIGIN = "http://localhost:8000"


def load_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        raise FileNotFoundError(f"Missing {path}")
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        val = val.strip()
        if " #" in val:
            val = val.split(" #", 1)[0].strip()
        out[key.strip()] = val
    return out


def build_upload_url(account: str, container: str, blob_name: str, sas: str) -> str:
    sas = sas.lstrip("?")
    base = f"https://{account}.blob.core.windows.net/{container}/{blob_name}"
    return f"{base}?{sas}"


def main() -> int:
    env = load_env(ENV_PATH)
    account = env.get("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
    container = env.get("AZURE_STORAGE_CONTAINER", "").strip()
    sas = env.get("AZURE_STORAGE_SAS_TOKEN", "").strip()
    missing = [k for k, v in [
        ("AZURE_STORAGE_ACCOUNT_NAME", account),
        ("AZURE_STORAGE_CONTAINER", container),
        ("AZURE_STORAGE_SAS_TOKEN", sas),
    ] if not v]
    if missing:
        print("Missing env:", ", ".join(missing))
        return 1

    blob_name = f"smoke/phase-a-{int(time.time())}.mp3"
    upload_url = build_upload_url(account, container, blob_name, sas)
    blob_base = f"https://{account}.blob.core.windows.net/{container}"

    print("Account:", account)
    print("Container:", container)
    print("Blob:", blob_name)
    print()

    # CORS preflight (simulates browser before PUT)
    print("1) CORS preflight (OPTIONS)...")
    preflight = requests.options(
        blob_base,
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type,x-ms-blob-type",
        },
        timeout=30,
    )
    allow_origin = preflight.headers.get("Access-Control-Allow-Origin", "")
    allow_methods = preflight.headers.get("Access-Control-Allow-Methods", "")
    print(f"   Status: {preflight.status_code}")
    print(f"   Access-Control-Allow-Origin: {allow_origin!r}")
    print(f"   Access-Control-Allow-Methods: {allow_methods!r}")
    cors_ok = ORIGIN in (allow_origin or "") or allow_origin == "*"
    if not cors_ok:
        print("   FAIL: Origin not allowed. Add", ORIGIN, "to Blob CORS on storage account.")
    else:
        print("   OK: CORS preflight allows origin.")

    # Server PUT (SAS + write)
    print()
    print("2) SAS write (PUT)...")
    body = b"seeandsay-blob-smoke-test"
    put = requests.put(
        upload_url,
        data=body,
        headers={
            "Content-Type": "audio/mpeg",
            "x-ms-blob-type": "BlockBlob",
            "Content-Length": str(len(body)),
        },
        timeout=60,
    )
    print(f"   Status: {put.status_code} {put.reason}")
    if put.status_code not in (200, 201):
        print("   Body:", (put.text or "")[:500])
        print("   FAIL: SAS upload rejected.")
        sas_ok = False
    else:
        print("   OK: Blob created. Check Portal -> container ->", blob_name)
        sas_ok = True

    CONFIG_PATH.write_text(
        json.dumps(
            {
                "uploadUrl": upload_url,
                "blobName": blob_name,
                "origin": ORIGIN,
                "generatedAt": int(time.time()),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print()
    print("Wrote", CONFIG_PATH.relative_to(ROOT))
    print("Browser smoke: open", f"{ORIGIN}/blob-smoke-test.html")

    if sas_ok and cors_ok:
        print()
        print("Phase A: PASSED (SAS + CORS preflight)")
        return 0
    if sas_ok:
        print()
        print("Phase A: SAS OK, CORS preflight FAILED — fix Blob CORS then re-run.")
        return 2
    print()
    print("Phase A: FAILED")
    return 1


if __name__ == "__main__":
    sys.exit(main())
