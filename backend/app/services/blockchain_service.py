import logging
import httpx
from app.config import get_settings

logger = logging.getLogger("app.blockchain")
settings = get_settings()


def get_rpc_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if settings.ganache_rpc_token:
        headers["Authorization"] = f"Bearer {settings.ganache_rpc_token.strip()}"
    return headers


async def check_blockchain_health() -> dict:
    rpc_url = settings.ganache_rpc_url.strip() if settings.ganache_rpc_url else ""
    if not rpc_url:
        return {
            "online": False,
            "status": "unconfigured",
            "chain_id": None,
            "chain_id_matches": False,
            "contract_address": settings.ganache_contract_address or None,
            "contract_deployed": False,
            "latest_block": None,
            "notice": "GANACHE_RPC_URL is not configured",
        }

    headers = get_rpc_headers()
    expected_chain_id = settings.ganache_chain_id
    contract_addr = settings.ganache_contract_address.strip() if settings.ganache_contract_address else ""

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


async def forward_rpc_payload(payload: dict) -> dict:
    rpc_url = settings.ganache_rpc_url.strip() if settings.ganache_rpc_url else ""
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
