from fastapi import APIRouter, Body, Request
from app.services.blockchain_service import check_blockchain_health, forward_rpc_payload

router = APIRouter(prefix="/api/blockchain", tags=["Blockchain & Ganache EVM"])


@router.get("/status")
async def get_blockchain_status():
    """Returns the operational status, chain ID, and contract verification of the remote Ganache EVM."""
    return await check_blockchain_health()


@router.post("/rpc")
async def proxy_blockchain_rpc(payload: dict = Body(...)):
    """
    Secure relay for Ethereum JSON-RPC calls.
    Allows frontend clients to interact with remote Ganache EVM without leaking
    server-side RPC authentication tokens or suffering mixed-content / CORS restrictions.
    """
    return await forward_rpc_payload(payload)
