import logging
from typing import Any
from fastapi import HTTPException, status
import httpx
from app.config import get_settings
from app.models.user import User

logger = logging.getLogger("app.blockchain")

ALLOWED_READ_METHODS = {
    "eth_chainId",
    "net_version",
    "eth_blockNumber",
    "eth_getCode",
    "eth_call",
    "eth_estimateGas",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    "eth_getLogs",
    "eth_accounts",
    "eth_gasPrice",
}

FORBIDDEN_METHOD_PREFIXES = (
    "personal_",
    "admin_",
    "debug_",
    "miner_",
    "evm_",
    "ganache_",
    "txpool_",
    "hardhat_",
    "anvil_",
)


def get_rpc_headers() -> dict[str, str]:
    current_settings = get_settings()
    headers = {"Content-Type": "application/json"}
    if current_settings.ganache_rpc_token:
        headers["Authorization"] = f"Bearer {current_settings.ganache_rpc_token.strip()}"
    return headers


async def check_blockchain_health() -> dict:
    current_settings = get_settings()
    rpc_url = current_settings.ganache_rpc_url.strip() if current_settings.ganache_rpc_url else ""
    if not rpc_url:
        return {
            "online": False,
            "status": "unconfigured",
            "chain_id": None,
            "chain_id_matches": False,
            "expected_chain_id": current_settings.ganache_chain_id,
            "contract_address": current_settings.ganache_contract_address or None,
            "contract_deployed": False,
            "latest_block": None,
            "notice": "GANACHE_RPC_URL is not configured",
        }

    headers = get_rpc_headers()
    expected_chain_id = current_settings.ganache_chain_id
    contract_addr = current_settings.ganache_contract_address.strip() if current_settings.ganache_contract_address else ""

    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            chain_resp = await client.post(
                rpc_url,
                json={"jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 1},
                headers=headers,
            )
            block_resp = await client.post(
                rpc_url,
                json={"jsonrpc": "2.0", "method": "eth_blockNumber", "params": [], "id": 2},
                headers=headers,
            )

            chain_data = chain_resp.json()
            block_data = block_resp.json()

            if "error" in chain_data:
                return {
                    "online": False,
                    "status": "rpc_error",
                    "error": chain_data["error"].get("message", "RPC error"),
                    "contract_address": contract_addr or None,
                    "contract_deployed": False,
                }

            chain_hex = chain_data.get("result", "0x0")
            chain_dec = int(chain_hex, 16) if chain_hex and chain_hex.startswith("0x") else 0
            block_hex = block_data.get("result", "0x0")
            block_dec = int(block_hex, 16) if block_hex and block_hex.startswith("0x") else 0

            code_deployed = False
            if contract_addr:
                code_resp = await client.post(
                    rpc_url,
                    json={"jsonrpc": "2.0", "method": "eth_getCode", "params": [contract_addr, "latest"], "id": 3},
                    headers=headers,
                )
                code_result = code_resp.json().get("result", "0x")
                code_deployed = code_result not in ("0x", "0x0", "", None)

            chain_matches = chain_dec == expected_chain_id
            status_text = "connected" if (chain_matches and code_deployed) else (
                "chain_mismatch" if not chain_matches else "contract_not_found"
            )

            return {
                "online": True,
                "status": status_text,
                "chain_id": chain_dec,
                "chain_id_matches": chain_matches,
                "expected_chain_id": expected_chain_id,
                "contract_address": contract_addr or None,
                "contract_deployed": code_deployed,
                "latest_block": block_dec,
                "notice": "Remote Ganache node is online and healthy" if status_text == "connected" else (
                    f"Connected to chain {chain_dec}, but contract byte code verification returned {code_deployed}"
                ),
            }
    except Exception as exc:
        logger.debug(f"Ganache health check notice: {exc}")
        return {
            "online": False,
            "status": "offline",
            "chain_id": None,
            "chain_id_matches": False,
            "expected_chain_id": expected_chain_id,
            "contract_address": contract_addr or None,
            "contract_deployed": False,
            "latest_block": None,
            "notice": f"Remote Ganache node offline or unreachable ({type(exc).__name__})",
        }


def authorize_rpc_payload(payload: dict[str, Any], current_user: User) -> None:
    """
    Enforces strict JSON-RPC method restrictions and prevents account impersonation.
    Disallows administrative and arbitrary RPC calls.
    """
    method = payload.get("method")
    if not isinstance(method, str) or not method.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON-RPC payload: 'method' must be a non-empty string.",
        )

    clean_method = method.strip()

    # 1. Strictly block administrative, debug, and personal Ganache methods
    if clean_method.startswith(FORBIDDEN_METHOD_PREFIXES):
        logger.warning(
            f"Security Alert: User '{current_user.username}' attempted forbidden RPC method '{clean_method}'"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"RPC method '{clean_method}' is forbidden. Administrative and debug controls are disabled.",
        )

    # 2. Check if read-only safe method
    if clean_method in ALLOWED_READ_METHODS:
        return

    # 3. Check state-changing transaction method
    if clean_method == "eth_sendTransaction":
        # Check role permission
        allowed_tx_roles = {"FARMER", "SUPPLIER", "RETAILER"}
        user_role = (current_user.role or "").upper()
        if user_role not in allowed_tx_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not authorized to submit on-chain transactions. Only registered supply-chain actors may initiate state changes.",
            )

        params = payload.get("params", [])
        if not params or not isinstance(params, list) or not isinstance(params[0], dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaction parameters must contain a transaction object with 'from' address.",
            )

        tx_obj = params[0]
        from_address = tx_obj.get("from")
        if not from_address or not isinstance(from_address, str):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Transaction parameters must specify a valid 'from' wallet address.",
            )

        # Anti-Impersonation Check: caller's wallet MUST match transaction 'from'
        user_wallet = (current_user.wallet_address or "").strip().lower()
        if not user_wallet or from_address.strip().lower() != user_wallet:
            logger.warning(
                f"Security Alert: Impersonation attempt by '{current_user.username}' (Wallet: {user_wallet}) pretending to be '{from_address}'"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account impersonation forbidden: transaction 'from' address does not match your authenticated wallet.",
            )

        return

    # 4. Any other unvetted method is rejected
    logger.warning(
        f"Security Alert: User '{current_user.username}' called unapproved RPC method '{clean_method}'"
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"RPC method '{clean_method}' is not permitted by client security policy.",
    )


async def forward_rpc_payload(payload: dict) -> dict:
    current_settings = get_settings()
    rpc_url = current_settings.ganache_rpc_url.strip() if current_settings.ganache_rpc_url else ""
    if not rpc_url:
        return {
            "jsonrpc": "2.0",
            "id": payload.get("id", 1),
            "error": {"code": -32000, "message": "GANACHE_RPC_URL is not configured on backend"},
        }

    headers = get_rpc_headers()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(rpc_url, json=payload, headers=headers)
            return resp.json()
    except Exception as exc:
        return {
            "jsonrpc": "2.0",
            "id": payload.get("id", 1),
            "error": {"code": -32000, "message": f"Ganache RPC relay error: {str(exc)}"},
        }
