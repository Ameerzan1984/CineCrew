# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Private S3-compatible object storage for generated media.

This module is deliberately separate from the HTTP API and does not create
public or presigned URLs. Callers persist the returned logical object name as a
private result reference and serve media only through an authorized backend.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Mapping, Protocol


_SAFE_OBJECT_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,1023}$")
_SAFE_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")


class S3Client(Protocol):
    """Subset of the boto3 S3 client used by this adapter."""

    def put_object(self, **kwargs): ...
    def upload_fileobj(self, Fileobj, Bucket, Key, ExtraArgs=None, **kwargs): ...
    def download_file(self, Bucket, Key, Filename, **kwargs): ...
    def delete_object(self, **kwargs): ...


class ObjectStorageError(RuntimeError):
    """Safe operation error that does not include SDK request details."""


def _validate_name(value: object, label: str) -> str:
    if (not isinstance(value, str) or not _SAFE_OBJECT_NAME.fullmatch(value)
            or any(part in ("", ".", "..") for part in value.split("/"))):
        raise ValueError(f"invalid {label}")
    return value


def _validate_content_type(content_type: object) -> str:
    if (not isinstance(content_type, str) or not content_type or len(content_type) > 255
            or not content_type.isascii()
            or any(ord(char) < 32 or ord(char) == 127 for char in content_type)):
        raise ValueError("invalid content type")
    return content_type


class S3ObjectStorage:
    """Store media in a private S3-compatible bucket such as Cloudflare R2.

    The bucket must be configured as private by the deployment. This adapter
    sends no ACL setting, never creates a URL, and exposes only logical object
    names that can be stored in the generation ledger.
    """

    def __init__(self, bucket: str, client: S3Client, *, prefix: str = ""):
        if not isinstance(bucket, str) or not _SAFE_BUCKET.fullmatch(bucket):
            raise ValueError("invalid object storage bucket")
        if prefix:
            _validate_name(prefix, "object storage prefix")
        if client is None:
            raise ValueError("an S3-compatible client is required")
        self.bucket = bucket
        self.prefix = prefix
        self.client = client

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None,
                 *, client: S3Client | None = None) -> "S3ObjectStorage":
        """Build configuration from server-side environment variables.

        Supported variables are ``CINEMESH_OBJECT_STORAGE_BUCKET``, optional
        ``CINEMESH_OBJECT_STORAGE_PREFIX``, ``CINEMESH_OBJECT_STORAGE_ENDPOINT``
        and ``CINEMESH_OBJECT_STORAGE_REGION``. Optional access key, secret and
        session token variables are passed directly to boto3 and are never
        logged. When no credentials are provided, boto3's normal provider chain
        is used. Supplying ``client`` avoids importing boto3 and any network use.
        """
        env = os.environ if environ is None else environ
        bucket = env.get("CINEMESH_OBJECT_STORAGE_BUCKET", "")
        prefix = env.get("CINEMESH_OBJECT_STORAGE_PREFIX", "")
        endpoint = env.get("CINEMESH_OBJECT_STORAGE_ENDPOINT") or None
        region = env.get("CINEMESH_OBJECT_STORAGE_REGION") or ("auto" if endpoint else "us-east-1")
        access_key = env.get("CINEMESH_OBJECT_STORAGE_ACCESS_KEY_ID") or None
        secret_key = env.get("CINEMESH_OBJECT_STORAGE_SECRET_ACCESS_KEY") or None
        session_token = env.get("CINEMESH_OBJECT_STORAGE_SESSION_TOKEN") or None

        if bool(access_key) != bool(secret_key):
            raise ValueError("both object storage access key and secret key are required")
        if session_token and not access_key:
            raise ValueError("object storage session token requires explicit access keys")

        if client is None:
            try:
                import boto3
            except ImportError as exc:
                raise RuntimeError("install boto3 to configure S3 object storage") from exc
            client_kwargs = {"region_name": region}
            if endpoint:
                client_kwargs["endpoint_url"] = endpoint
            if access_key:
                client_kwargs["aws_access_key_id"] = access_key
                client_kwargs["aws_secret_access_key"] = secret_key
            if session_token:
                client_kwargs["aws_session_token"] = session_token
            client = boto3.client("s3", **client_kwargs)
        return cls(bucket, client, prefix=prefix)

    def _key_for(self, object_name: str) -> str:
        name = _validate_name(object_name, "object name")
        key = f"{self.prefix}/{name}" if self.prefix else name
        if len(key) > 1024:
            raise ValueError("object key exceeds S3's 1024 character limit")
        return key

    def put_bytes(self, object_name: str, body: bytes,
                  content_type: str = "application/octet-stream") -> str:
        """Write bytes and return a private logical reference, never a URL."""
        if not isinstance(body, bytes):
            raise TypeError("body must be bytes")
        key = self._key_for(object_name)
        content_type = _validate_content_type(content_type)
        try:
            self.client.put_object(Bucket=self.bucket, Key=key, Body=body,
                                   ContentType=content_type,
                                   CacheControl="private, no-store")
        except Exception:
            raise ObjectStorageError("private object upload failed") from None
        return object_name

    def put_file(self, object_name: str, path: str | Path,
                 content_type: str = "application/octet-stream") -> str:
        """Stream a local media file to storage, including multipart uploads."""
        key = self._key_for(object_name)
        content_type = _validate_content_type(content_type)
        try:
            with Path(path).open("rb") as media:
                self.client.upload_fileobj(
                    media, self.bucket, key,
                    ExtraArgs={"ContentType": content_type,
                               "CacheControl": "private, no-store"},
                )
        except Exception:
            raise ObjectStorageError("private object upload failed") from None
        return object_name

    def download_file(self, object_ref: str, path: str | Path) -> None:
        """Download a logical reference to a caller-selected local path."""
        key = self._key_for(object_ref)
        try:
            self.client.download_file(self.bucket, key, str(path))
        except Exception:
            raise ObjectStorageError("private object download failed") from None

    def delete(self, object_ref: str) -> None:
        """Delete a logical reference from the configured private bucket."""
        key = self._key_for(object_ref)
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception:
            raise ObjectStorageError("private object deletion failed") from None
