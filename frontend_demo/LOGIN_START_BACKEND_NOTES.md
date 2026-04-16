# Deferred Backend Follow-Ups For Login/Start Redesign

This UI phase collects additional start-form data in the frontend only.

## Data contract updates likely needed later
- Extend user/session creation API to accept and persist:
  - `childName`
  - `gender`
  - `dateOfBirth`
  - `recordingConsent`
  - `legalConfirmation`
  - `legalConfirmationTimestamp`
- Decide whether these fields are written at "start form submit" or only at session completion.

## Identifier strategy
- Current UI no longer asks for child ID.
- Backend flow should move to one of:
  - server-generated session/user identifier, or
  - device/session token mapped to child profile.
- Speaker verification and test update endpoints should be aligned to the chosen identifier.

## Verification and audit requirements
- Store explicit consent/audit events for:
  - recording consent acceptance
  - privacy policy / terms confirmation
- Keep immutable timestamp and version of policy/terms accepted.

## Storage and analytics
- Persist start-form fields in test result records for reporting.
- Optionally store a partial draft state to recover abandoned sessions.
