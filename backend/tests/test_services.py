"""Tests for encoding, simulation, upload parsing and Gemini conversion."""

from __future__ import annotations

import io
import json

import httpx
import numpy as np
import pandas as pd
import pytest

from app.config import Settings
from app.core import EncoderService, InvalidCategoriesError, SafeDecoder, validate_matrix
from app.services.dataset_service import parse_file, profile_columns, suggest_column
from app.services.gemini_config_service import GEMINI_MODEL_CHOICES, GeminiConfigService
from app.services.gemini_service import GeminiService, scores_to_probabilities
from app.services.simulation_service import DEMO_CATEGORIES, ProbabilitySimulator, build_demo_frame
from app.utils.errors import (
    PayloadTooLargeError,
    ProviderNotConfiguredError,
    UploadValidationError,
    UpstreamProviderError,
)


# ------------------------------------------------------------------- encoder
def test_encoder_preserves_first_appearance_order_and_one_hot():
    encoder = EncoderService()
    encoding, matrix = encoder.fit_transform(["Electronics", "Furniture", "Clothing", "Furniture", None])
    assert encoding.categories == ("Electronics", "Furniture", "Clothing")
    assert encoding.one_hot("Furniture") == [0, 1, 0]
    assert matrix.tolist() == [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 1, 0], [0, 0, 0]]


def test_encoder_alphabetical_and_frequency_orders():
    values = ["b", "a", "c", "c", "c", "a"]
    assert EncoderService(order="alphabetical").fit(values).categories == ("a", "b", "c")
    assert EncoderService(order="frequency").fit(values).categories == ("c", "a", "b")


def test_encoder_rejects_high_cardinality():
    with pytest.raises(InvalidCategoriesError):
        EncoderService(max_categories=3).fit(["a", "b", "c", "d"])


def test_argmax_inverse_transform_round_trips_one_hot():
    encoding, matrix = EncoderService().fit_transform(["x", "y", "z"])
    assert EncoderService.argmax_decode(matrix, encoding) == ["x", "y", "z"]


# ----------------------------------------------------------------- simulator
def test_simulated_vectors_are_valid_and_reproducible():
    frame, confusables = build_demo_frame(rows=200, seed=7)
    encoding = EncoderService().fit(frame["product_type"])
    labels = frame["product_type"].tolist()
    a = ProbabilitySimulator(7).generate_for_labels(labels, encoding, None, confusables)
    b = ProbabilitySimulator(7).generate_for_labels(labels, encoding, None, confusables)
    assert np.array_equal(a.probabilities, b.probabilities)
    validate_matrix(a.probabilities, encoding.size)  # does not raise
    assert set(encoding.categories) <= set(DEMO_CATEGORIES)


def test_simulation_produces_a_mix_of_statuses():
    frame, confusables = build_demo_frame(rows=400, seed=42)
    encoding = EncoderService().fit(frame["product_type"])
    output = ProbabilitySimulator(42).generate_for_labels(frame["product_type"].tolist(), encoding, None, confusables)
    statuses = {r.status.value for r in SafeDecoder().decode_validated(output.probabilities, encoding.categories)}
    assert {"SAFE", "AMBIGUOUS", "REJECTED"} <= statuses


@pytest.mark.parametrize("scenario,expected", [("safe", "SAFE"), ("near_tie", "AMBIGUOUS"), ("low_confidence", "AMBIGUOUS")])
def test_example_vectors_match_their_scenario(scenario, expected):
    cats = ["Electronics", "Furniture", "Clothing"]
    for seed in range(20):
        vector = ProbabilitySimulator(seed).example_vector(cats, scenario)
        assert vector.sum() == pytest.approx(1.0, abs=1e-6)
        assert SafeDecoder().decode(vector, cats).status.value == expected


# -------------------------------------------------------------------- upload
SETTINGS = Settings(persist_state=False, max_upload_mb=1, max_rows=1000)


def test_parse_csv_and_detect_categorical_columns():
    content = b"product_id,product_type\n1,Electronics\n2,Furniture\n3,Clothing\n"
    frame = parse_file("products.csv", content, SETTINGS)
    profiles = profile_columns(frame, 50)
    by_name = {p["name"]: p for p in profiles}
    assert frame.shape == (3, 2)
    assert by_name["product_type"]["is_categorical"]
    assert not by_name["product_id"]["is_categorical"]
    assert suggest_column(profiles) == "product_type"


def test_parse_semicolon_csv():
    frame = parse_file("x.csv", b"a;b\n1;x\n2;y\n", SETTINGS)
    assert list(frame.columns) == ["a", "b"]


def test_parse_xlsx():
    buffer = io.BytesIO()
    pd.DataFrame({"kind": ["A", "B", "A"], "value": [1, 2, 3]}).to_excel(buffer, index=False)
    frame = parse_file("book.xlsx", buffer.getvalue(), SETTINGS)
    assert frame["kind"].tolist() == ["A", "B", "A"]


@pytest.mark.parametrize(
    "filename,content,code",
    [
        ("data.txt", b"a,b\n1,2", "UNSUPPORTED_FILE_TYPE"),
        ("data.csv", b"", "EMPTY_FILE"),
        ("data.csv", b"\x00\x01\x02binary", "INVALID_CSV"),
        ("data.csv", b"a,b\n", "EMPTY_DATASET"),
        ("data.xlsx", b"not a zip file", "INVALID_XLSX"),
        ("data.xlsx", b"PK\x03\x04garbage", "INVALID_XLSX"),
    ],
)
def test_invalid_uploads(filename, content, code):
    with pytest.raises(UploadValidationError) as exc:
        parse_file(filename, content, SETTINGS)
    assert exc.value.code == code


def test_upload_size_limit():
    with pytest.raises(PayloadTooLargeError):
        parse_file("big.csv", b"a\n" + b"x\n" * 600_000, SETTINGS)


# -------------------------------------------------------------------- gemini
CATS = ["Electronics", "Furniture", "Clothing"]


def test_scores_to_probabilities_normalises_and_ignores_garbage():
    vector = scores_to_probabilities({"electronics": 60, "Furniture": 30, "Clothing": -5, "Toys": 99}, CATS)
    assert vector.tolist() == pytest.approx([2 / 3, 1 / 3, 0.0])


def test_scores_with_no_usable_values_become_uniform():
    vector = scores_to_probabilities({"Toys": 10}, CATS)
    assert vector.tolist() == pytest.approx([1 / 3] * 3)
    assert SafeDecoder().decode(vector, CATS).status.value == "AMBIGUOUS"


def test_gemini_not_configured_raises():
    service = GeminiService(Settings(persist_state=False, gemini_api_key=""))
    assert not service.configured
    with pytest.raises(ProviderNotConfiguredError):
        service.classify_text("chair", CATS)


def _gemini_transport(payload_items, status=200):
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "test-key"
        if status != 200:
            return httpx.Response(status, json={"error": {"message": "quota exceeded"}})
        body = {"candidates": [{"content": {"parts": [{"text": json.dumps(payload_items)}]}}]}
        return httpx.Response(200, json=body)

    return httpx.MockTransport(handler)


def test_gemini_output_is_converted_then_safely_decoded():
    items = [{"id": 0, "scores": [{"category": "Electronics", "score": 48}, {"category": "Furniture", "score": 47}, {"category": "Clothing", "score": 5}]}]
    service = GeminiService(Settings(persist_state=False, gemini_api_key="test-key"), transport=_gemini_transport(items))
    raw, vector = service.classify_text("Gaming chair with speakers", CATS)
    assert raw["Electronics"] == 48
    result = SafeDecoder().decode(vector, CATS)
    # Gemini "chose" Electronics, but the local detector still refuses the near tie.
    assert result.status.value == "AMBIGUOUS"
    assert result.prediction is None


def test_gemini_http_error_is_reported_without_key():
    service = GeminiService(Settings(persist_state=False, gemini_api_key="test-key"), transport=_gemini_transport([], status=429))
    with pytest.raises(UpstreamProviderError) as exc:
        service.classify_text("x", CATS)
    assert "test-key" not in exc.value.message
    assert "429" in exc.value.message


# -------------------------------------------------------------- gemini config
def test_gemini_config_falls_back_to_environment():
    config = GeminiConfigService(Settings(persist_state=False, gemini_api_key="env-key", gemini_model="gemini-2.0-flash"))
    assert config.configured
    assert config.api_key == "env-key"
    assert config.model == "gemini-2.0-flash"
    assert config.source == "environment"
    assert not config.model_is_custom
    # Short keys (<=8 chars) get a fully-masked preview rather than a partial one.
    assert config.key_preview() == "••••"


def test_gemini_config_settings_override_takes_precedence():
    config = GeminiConfigService(Settings(persist_state=False, gemini_api_key="env-key"))
    config.set_api_key("sk-settings-key-12345")
    assert config.source == "settings"
    assert config.api_key == "sk-settings-key-12345"
    preview = config.key_preview()
    assert preview is not None and preview.startswith("sk-s") and preview.endswith("2345")

    config.set_model("gemini-2.5-pro")
    assert config.model == "gemini-2.5-pro"
    assert config.model_is_custom

    config.clear_api_key()
    assert config.source == "environment"
    assert config.api_key == "env-key"

    config.clear_model()
    assert not config.model_is_custom


def test_gemini_config_with_no_key_anywhere_is_unconfigured():
    config = GeminiConfigService(Settings(persist_state=False, gemini_api_key=""))
    assert not config.configured
    assert config.source == "none"
    assert config.key_preview() is None


def test_gemini_service_status_reports_config_state():
    config = GeminiConfigService(Settings(persist_state=False, gemini_api_key=""))
    config.set_api_key("sk-abcdefgh")
    service = GeminiService(Settings(persist_state=False, gemini_api_key=""), config)
    status = service.status()
    assert status["configured"] is True
    assert status["source"] == "settings"
    assert status["key_preview"] is not None and "sk-a" in status["key_preview"]
    assert status["model_choices"] == list(GEMINI_MODEL_CHOICES)
    assert "sk-abcdefgh" not in json.dumps(status)
