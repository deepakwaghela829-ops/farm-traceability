from fastapi import APIRouter, Body, Depends
from app.api.routes.auth import get_current_user
from app.models.user import User
from app.services.blockchain_service import (
    authorize_rpc_payload,
    check_blockchain_health,
    forward_rpc_payload,
)

router = APIRouter(prefix="/api/blockchain", tags=["Blockchain & Ganache EVM"])


@router.get("/status")
async def get_blockchain_status():
    """Returns the operational status, chain ID, and contract verification of the remote Ganache EVM."""
    return await check_blockchain_health()


@router.post("/rpc")
async def proxy_blockchain_rpc(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user),
):
    """
    Secure relay for Ethereum JSON-RPC calls.
    Requires authentication, validates role permissions, blocks administrative methods,
    and prevents wallet impersonation on state-changing transactions.
    """
    authorize_rpc_payload(payload, current_user)
    return await forward_rpc_payload(payload)
