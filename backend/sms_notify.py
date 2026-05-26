"""
SMS notifications via sms4free.co.il (results-ready link).
Credentials: SMS_KEY, SMS_USER, SMS_PASS, SMS_SENDER.
"""

import json
import logging
import os
import re

import requests

logger = logging.getLogger(__name__)

SMS_API_URL = "https://api.sms4free.co.il/ApiSMS/v2/SendSMS"


def sms_credentials_configured():
    keys = ("SMS_KEY", "SMS_USER", "SMS_PASS", "SMS_SENDER")
    return all(os.environ.get(k) for k in keys)


def _parse_sms_success(response, body_text):
    success = False
    parsed = None
    try:
        parsed = json.loads(body_text)
    except json.JSONDecodeError:
        parsed = None

    if parsed and isinstance(parsed, dict):
        status = parsed.get("status")
        message = str(parsed.get("message") or parsed.get("msg") or "")
        if (
            status == 10
            or status == "10"
            or re.search(r"succeed|success|succeded|ok", message, re.I)
        ):
            success = True

    if not success:
        text = str(body_text or "").lower()
        if '"status":10' in text or re.search(r"succeed|success|succeded|ok", text):
            success = True

    if not success and response.ok:
        num = None
        try:
            num = int(body_text.strip())
        except (ValueError, AttributeError):
            num = None
        if num is not None and num > 0:
            success = True

    return success


def send_results_ready_sms(recipient, results_url):
    """
    Send Hebrew SMS with results link. Returns True on success.
    Missing credentials → log warning and return False (non-fatal).
    """
    missing = [k for k in ("SMS_KEY", "SMS_USER", "SMS_PASS", "SMS_SENDER") if not os.environ.get(k)]
    if missing:
        logger.warning("SMS skipped — credentials missing: %s", ", ".join(missing))
        return False

    if not recipient or not results_url:
        logger.warning("SMS skipped — missing recipient or URL")
        return False

    key = os.environ["SMS_KEY"]
    user = os.environ["SMS_USER"]
    password = os.environ["SMS_PASS"]
    sender = os.environ["SMS_SENDER"]

    msg = (
        f"משוב MILI מוכן. לצפייה: {results_url}\n"
        "הקישור זמין למשך 7 ימים."
    )
    payload = {
        "key": key,
        "user": user,
        "pass": password,
        "sender": sender,
        "recipient": recipient,
        "msg": msg,
    }
    logger.info("SMS send (no secrets): sender=%s recipient=%s", sender, recipient)

    try:
        response = requests.post(
            SMS_API_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        body_text = response.text
        logger.info("SMS API status=%s body=%s", response.status_code, body_text[:200])

        success = _parse_sms_success(response, body_text)
        if not success and not response.ok:
            logger.error("SMS API HTTP %s: %s", response.status_code, body_text)
            return False
        if not success:
            logger.error("SMS API error code: %s", body_text)
            return False
        return True
    except Exception as err:
        logger.error("SMS fetch error: %s", err)
        return False
