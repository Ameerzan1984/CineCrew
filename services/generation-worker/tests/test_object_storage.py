# Better Call CineCrew: Consistent Ultra-Long Narrative-to-Film Generation
# Paper: ECCV 2026
# Copyright (c) 2026 Sixun Dong
# Author: Sixun Dong
# Licensed under the Apache License, Version 2.0
"""Offline contract tests for the private object storage adapter."""
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from object_storage import ObjectStorageError, S3ObjectStorage


class FakeS3Client:
    def __init__(self):
        self.objects = {}
        self.calls = []

    def put_object(self, **kwargs):
        self.calls.append(("put_object", kwargs))
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs["Body"]

    def upload_fileobj(self, Fileobj, Bucket, Key, ExtraArgs=None, **kwargs):
        self.calls.append(("upload_fileobj", Bucket, Key, ExtraArgs))
        self.objects[(Bucket, Key)] = Fileobj.read()

    def download_file(self, Bucket, Key, Filename, **kwargs):
        self.calls.append(("download_file", Bucket, Key, Filename))
        Path(Filename).write_bytes(self.objects[(Bucket, Key)])

    def delete_object(self, **kwargs):
        self.calls.append(("delete_object", kwargs))
        del self.objects[(kwargs["Bucket"], kwargs["Key"])]


def test_put_bytes_uses_private_bucket_and_returns_only_logical_reference():
    client = FakeS3Client()
    storage = S3ObjectStorage("cinemesh-media", client, prefix="production")

    ref = storage.put_bytes("film-1/shot-2.mp4", b"video", "video/mp4")

    assert ref == "film-1/shot-2.mp4"
    assert "https://" not in ref and "cinemesh-media" not in ref
    assert client.objects[("cinemesh-media", "production/film-1/shot-2.mp4")] == b"video"
    operation, args = client.calls[0]
    assert operation == "put_object"
    assert args["ContentType"] == "video/mp4"
    assert args["CacheControl"] == "private, no-store"
    assert "ACL" not in args


def test_file_upload_download_and_delete_use_configured_prefix(tmp_path):
    client = FakeS3Client()
    storage = S3ObjectStorage("cinemesh-media", client, prefix="media")
    source = tmp_path / "source.mp4"
    source.write_bytes(b"synthetic media")

    ref = storage.put_file("film/clip.mp4", source, "video/mp4")
    destination = tmp_path / "download.mp4"
    storage.download_file(ref, destination)

    assert ref == "film/clip.mp4"
    assert destination.read_bytes() == b"synthetic media"
    assert client.calls[0] == ("upload_fileobj", "cinemesh-media", "media/film/clip.mp4",
                               {"ContentType": "video/mp4", "CacheControl": "private, no-store"})
    storage.delete(ref)
    assert ("cinemesh-media", "media/film/clip.mp4") not in client.objects


@pytest.mark.parametrize("object_name", ["../outside", "film//clip.mp4", "film/../clip.mp4",
                                          "/absolute.mp4", "s3://bucket/object", "film\\clip.mp4"])
def test_unsafe_references_are_rejected_before_client_call(object_name):
    client = FakeS3Client()
    storage = S3ObjectStorage("cinemesh-media", client)
    with pytest.raises(ValueError):
        storage.put_bytes(object_name, b"data")
    with pytest.raises(ValueError):
        storage.download_file(object_name, "ignored")
    with pytest.raises(ValueError):
        storage.delete(object_name)
    assert client.calls == []


def test_invalid_content_types_and_non_bytes_are_rejected_before_upload():
    client = FakeS3Client()
    storage = S3ObjectStorage("cinemesh-media", client)
    with pytest.raises(ValueError):
        storage.put_bytes("film/clip.mp4", b"data", "video/mp4\r\nX-Public: yes")
    with pytest.raises(TypeError):
        storage.put_bytes("film/clip.mp4", bytearray(b"data"))
    assert client.calls == []


def test_from_env_accepts_injected_client_without_credentials_or_network():
    client = FakeS3Client()
    storage = S3ObjectStorage.from_env({
        "CINEMESH_OBJECT_STORAGE_BUCKET": "private-media",
        "CINEMESH_OBJECT_STORAGE_PREFIX": "cinemesh",
        "CINEMESH_OBJECT_STORAGE_ENDPOINT": "https://example.invalid",
        "CINEMESH_OBJECT_STORAGE_REGION": "auto",
    }, client=client)

    assert storage.put_bytes("film/shot.mp4", b"fixture") == "film/shot.mp4"
    assert client.calls[0][1]["Key"] == "cinemesh/film/shot.mp4"


def test_from_env_requires_bucket_and_complete_explicit_credentials():
    client = FakeS3Client()
    with pytest.raises(ValueError, match="invalid object storage bucket"):
        S3ObjectStorage.from_env({}, client=client)
    with pytest.raises(ValueError, match="both object storage access key and secret key"):
        S3ObjectStorage.from_env({
            "CINEMESH_OBJECT_STORAGE_BUCKET": "private-media",
            "CINEMESH_OBJECT_STORAGE_ACCESS_KEY_ID": "id",
        }, client=client)


def test_sdk_errors_are_redacted_from_adapter_error():
    class FailingClient(FakeS3Client):
        def put_object(self, **kwargs):
            raise RuntimeError("request included credential material")

    storage = S3ObjectStorage("cinemesh-media", FailingClient())
    with pytest.raises(ObjectStorageError, match="private object upload failed") as exc_info:
        storage.put_bytes("film/clip.mp4", b"data")
    assert "credential material" not in str(exc_info.value)
