"""Bearer-token authentication for the orchestrator.

The orchestrator's port can be reached without going through the gateway, so it verifies
the same HS256 access token the Node services issue and takes the user id from it. A
userId in the request body is never trusted: it would let any caller read or overwrite
another student's tutoring memory.
"""

import jwt
from config import settings
from fastapi import Header, HTTPException


def require_user_id(authorization: str | None = Header(default=None)) -> str:
    if not settings.JWT_SECRET:
        # Fail closed: an unconfigured secret must not mean "no authentication".
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        payload = jwt.decode(authorization[7:], settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e
    user_id = payload.get("userId")
    if not isinstance(user_id, str) or not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user_id
