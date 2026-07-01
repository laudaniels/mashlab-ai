"""Shared upload helpers for analysis endpoints."""

from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

import config


async def save_upload(file: UploadFile, prefix: str) -> tuple[Path, str]:
    if file.filename is None or file.filename.strip() == "":
        raise HTTPException(status_code=400, detail="A local audio filename is required.")

    suffix = Path(file.filename).suffix or ".audio"
    temp_path = config.TEMP_DIR / f"{prefix}-{uuid4().hex}{suffix}"
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    with temp_path.open("wb") as handle:
        shutil.copyfileobj(file.file, handle)

    return temp_path, file.filename


def cleanup_path(path: Path) -> None:
    if path.exists():
        path.unlink(missing_ok=True)


def save_upload_bytes(filename: str, content: bytes, prefix: str) -> tuple[Path, str]:
    if filename.strip() == "":
        raise ValueError("A local audio filename is required.")

    suffix = Path(filename).suffix or ".audio"
    temp_path = config.TEMP_DIR / f"{prefix}-{uuid4().hex}{suffix}"
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    with temp_path.open("wb") as handle:
        handle.write(content)

    return temp_path, filename
