#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from urllib.parse import quote

secret = json.load(sys.stdin)
existing_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
values: dict[str, str] = {}

if existing_path and existing_path.exists():
    for line in existing_path.read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key] = value

username = quote(str(secret["username"]), safe="")
password = quote(str(secret["password"]), safe="")
database = quote(str(secret["dbname"]), safe="")
values.update({
    "PORT": "3000",
    "HOST": "127.0.0.1",
    "DATABASE_URL": f"postgresql://{username}:{password}@127.0.0.1:5432/{database}",
    "LINE_CHANNEL_SECRET": values.get("LINE_CHANNEL_SECRET", ""),
    "LINE_CHANNEL_ACCESS_TOKEN": values.get("LINE_CHANNEL_ACCESS_TOKEN", ""),
    "LINE_ADD_FRIEND_URL": values.get("LINE_ADD_FRIEND_URL", "https://line.me/R/ti/p/@YOUR_LINE_ID"),
    "PUBLIC_BASE_URL": values.get("PUBLIC_BASE_URL", "http://127.0.0.1:3000"),
    "AGENTCORE_ENDPOINT": values.get("AGENTCORE_ENDPOINT", ""),
    "AGENTCORE_AUTH_TOKEN": values.get("AGENTCORE_AUTH_TOKEN", ""),
    "SEMANTIC_ROUTER_ENABLED": values.get("SEMANTIC_ROUTER_ENABLED", "true"),
    "SEMANTIC_ROUTER_MODEL_ID": values.get(
        "SEMANTIC_ROUTER_MODEL_ID",
        "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    ),
    "SEMANTIC_ROUTER_TIMEOUT_MS": values.get("SEMANTIC_ROUTER_TIMEOUT_MS", "4500"),
    "SEMANTIC_ROUTER_MIN_CONFIDENCE": values.get("SEMANTIC_ROUTER_MIN_CONFIDENCE", "0.82"),
    "SEMANTIC_ROUTER_MAX_CONCURRENCY": values.get("SEMANTIC_ROUTER_MAX_CONCURRENCY", "4"),
    "SEMANTIC_ROUTER_FAILURE_THRESHOLD": values.get("SEMANTIC_ROUTER_FAILURE_THRESHOLD", "3"),
    "SEMANTIC_ROUTER_CIRCUIT_BREAKER_MS": values.get("SEMANTIC_ROUTER_CIRCUIT_BREAKER_MS", "30000"),
})

for key, value in values.items():
    print(f"{key}={value}")
