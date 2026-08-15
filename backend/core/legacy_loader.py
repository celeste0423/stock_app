from __future__ import annotations

import importlib.util
import marshal
from pathlib import Path
from types import CodeType
from typing import Any, MutableMapping


LEGACY_BYTECODE_PATH = Path(__file__).resolve().parent.parent / "legacy" / "app.cpython-312.pyc"
PYC_HEADER_SIZE = 16


def execute_legacy_backend(namespace: MutableMapping[str, Any]) -> None:
    """Execute the verified legacy backend in the public backend.app namespace."""
    payload = LEGACY_BYTECODE_PATH.read_bytes()
    if payload[:4] != importlib.util.MAGIC_NUMBER:
        raise RuntimeError(
            "The preserved backend requires the project's Python 3.12 runtime "
            f"(expected magic {payload[:4]!r}, running {importlib.util.MAGIC_NUMBER!r})."
        )

    code = marshal.loads(payload[PYC_HEADER_SIZE:])
    if not isinstance(code, CodeType):
        raise RuntimeError("The preserved backend artifact does not contain a module code object.")

    exec(code, namespace)
