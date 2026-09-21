"""End-to-end API tests using FastAPI's TestClient."""

from __future__ import annotations

import csv
import io
import json

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

CATS = ["Electronics", "Furniture", "Clothing"]


@pytest.fixture()
def client(tmp_path):
    settings = Settings(storage_dir=tmp_path, persist_state=False, gemini_api_key="")
    return TestClient(create_app(settings))


@pytest.fixture()
def demo(client):
    response = client.post("/api/datasets/demo", json={"rows": 200, "seed": 11})
    assert response.status_code == 201, response.text
    return response.json()


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["gemini_configured"] is False


def test_decode_endpoint_matches_spec_example(client):
    response = client.post(
        "/api/decode",
        json={
            "categories": CATS,
            "probabilities": [0.48, 0.47, 0.05],
            "confidence_threshold": 0.75,
            "near_tie_threshold": 0.05,
            "mode": "strict",
            "top_k": 3,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["prediction"] is None
    assert body["status"] == "AMBIGUOUS"
    assert body["confidence"] == 0.48
    assert body["gap"] == 0.01
    assert [a["category"] for a in body["alternatives"]] == ["Furniture", "Clothing"]
    assert body["mode"] == "strict"
    assert body["threshold"] == 0.75


def test_compare_modes(client):
    body = client.post("/api/decode/compare", json={"categories": CATS, "probabilities": [0.48, 0.47, 0.05]}).json()
    assert body["argmax"]["prediction"] == "Electronics"
    assert body["strict"]["status"] == "AMBIGUOUS"
    assert body["soft"]["status"] == "UNCERTAIN"
    assert body["advisory"]["prediction"] == "Electronics"


@pytest.mark.parametrize(
    "payload,code",
    [
        ({"categories": CATS, "probabilities": [0.5, -0.1, 0.6]}, "NEGATIVE_PROBABILITY"),
        ({"categories": CATS, "probabilities": [1.2, 0.0, 0.0]}, "PROBABILITY_OUT_OF_RANGE"),
        ({"categories": CATS, "probabilities": [0.5, 0.5]}, "PROBABILITY_LENGTH_MISMATCH"),
        ({"categories": CATS, "probabilities": [0.2, 0.2, 0.2]}, "PROBABILITY_SUM_INVALID"),
        ({"categories": CATS, "probabilities": [0.5, "abc", 0.5]}, "MALFORMED_PROBABILITY_VECTOR"),
        ({"categories": ["A"], "probabilities": [1.0]}, "INVALID_CATEGORIES"),
        ({"probabilities": [0.5, 0.5]}, "INVALID_CATEGORIES"),
        ({"categories": CATS, "probabilities": [0.9, 0.05, 0.05], "confidence_threshold": 1.5}, "INVALID_THRESHOLD"),
        ({"categories": CATS, "probabilities": [0.9, 0.05, 0.05], "top_k": 11}, "INVALID_THRESHOLD"),
    ],
)
def test_decode_errors(client, payload, code):
    response = client.post("/api/decode", json=payload)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == code


def test_demo_pipeline_populates_results(client, demo):
    assert demo["pipeline"]["stage"] == "decoded"
    assert demo["target_column"] == "product_type"
    summary = client.get(f"/api/results/{demo['id']}/summary").json()
    assert summary["total_rows"] == 200
    assert summary["counts"]["SAFE"] > 0
    assert summary["counts"]["AMBIGUOUS"] > 0
    assert sum(summary["counts"].values()) == 200


def test_threshold_and_mode_changes_affect_results(client, demo):
    dataset_id = demo["id"]
    strict = client.post(f"/api/datasets/{dataset_id}/decode", json={"mode": "strict"}).json()
    soft = client.post(f"/api/datasets/{dataset_id}/decode", json={"mode": "soft"}).json()
    assert soft["counts"]["UNCERTAIN"] == 200 - strict["counts"]["SAFE"]
    lenient = client.post(f"/api/datasets/{dataset_id}/decode", json={"mode": "strict", "confidence_threshold": 0.3, "near_tie_threshold": 0.0}).json()
    assert lenient["counts"]["SAFE"] > strict["counts"]["SAFE"]


def test_results_filtering_sorting_and_pagination(client, demo):
    dataset_id = demo["id"]
    page = client.get(f"/api/results/{dataset_id}", params={"status": "AMBIGUOUS", "sort_by": "gap", "page_size": 5}).json()
    assert page["page_size"] == 5
    assert all(item["status"] == "AMBIGUOUS" for item in page["items"])
    gaps = [item["gap"] for item in page["items"]]
    assert gaps == sorted(gaps)
    search = client.get(f"/api/results/{dataset_id}", params={"search": "sofa"}).json()
    assert all("Sofa" in item["context"]["product_name"] for item in search["items"])


def test_review_flow_creates_audit_and_export(client, demo):
    dataset_id = demo["id"]
    queue = client.get(f"/api/results/{dataset_id}", params={"status": "needs_review"}).json()
    row = queue["items"][0]
    alternative = row["top_2"]

    response = client.post("/api/review", json={"dataset_id": dataset_id, "row_id": row["row_id"], "action": "choose", "category": alternative})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["row"]["status"] == "MANUALLY_REVIEWED"
    assert body["row"]["final_value"] == alternative
    assert body["audit"]["action"] == "CHOOSE_ALTERNATIVE"
    assert body["audit"]["previous_status"] == row["status"]
    assert body["needs_review"] == queue["total"] - 1

    audit = client.get(f"/api/audit/{dataset_id}").json()
    assert audit["total"] == 1
    assert audit["items"][0]["selected_category"] == alternative

    export = client.get(f"/api/export/{dataset_id}", params={"kind": "results"})
    assert export.status_code == 200
    assert "attachment" in export.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(export.text)))
    assert len(rows) == 200
    required = {
        "original_value", "predicted_value", "confidence", "top_1", "top_2", "top_1_probability",
        "top_2_probability", "probability_gap", "status", "reason", "decoding_mode", "manually_reviewed",
    }
    assert required <= set(rows[0])
    reviewed = rows[row["row_id"] - 1]
    assert reviewed["predicted_value"] == alternative
    assert reviewed["manually_reviewed"] == "True"

    for kind in ("corrected", "ambiguous", "audit"):
        assert client.get(f"/api/export/{dataset_id}", params={"kind": kind}).status_code == 200


def test_review_validation(client, demo):
    dataset_id = demo["id"]
    bad_category = client.post("/api/review", json={"dataset_id": dataset_id, "row_id": 1, "action": "choose", "category": "Toys"})
    assert bad_category.status_code == 422
    assert bad_category.json()["error"]["code"] == "UNKNOWN_CATEGORY"
    missing_row = client.post("/api/review", json={"dataset_id": dataset_id, "row_id": 9999, "action": "accept"})
    assert missing_row.status_code == 404
    revert = client.post("/api/review", json={"dataset_id": dataset_id, "row_id": 1, "action": "revert"})
    assert revert.status_code == 409


def test_manual_review_survives_redecode(client, demo):
    dataset_id = demo["id"]
    client.post("/api/review", json={"dataset_id": dataset_id, "row_id": 3, "action": "reject"})
    client.post(f"/api/datasets/{dataset_id}/decode", json={"mode": "advisory"})
    row = client.get(f"/api/results/{dataset_id}/rows/3").json()
    assert row["status"] == "MANUALLY_REVIEWED"
    assert row["final_value"] is None


def test_bulk_review(client, demo):
    dataset_id = demo["id"]
    queue = client.get(f"/api/results/{dataset_id}", params={"status": "needs_review", "page_size": 3}).json()
    ids = [item["row_id"] for item in queue["items"]]
    body = client.post("/api/review/bulk", json={"dataset_id": dataset_id, "row_ids": ids + ids[:1], "action": "accept"}).json()
    assert body["applied"] == len(ids)
    assert body["skipped"] == 0


def test_evaluation_compares_argmax_and_safe_decoder(client, demo):
    body = client.get(f"/api/results/{demo['id']}/evaluation").json()
    assert body["has_ground_truth"]
    assert body["argmax"]["accepted"] == body["argmax"]["total"] == 200
    assert body["argmax"]["abstained"] == 0
    assert body["safe"]["abstained"] > 0
    assert body["safe"]["accepted"] + body["safe"]["flagged"] == 200
    assert body["comparison"]["unsafe_predictions_prevented"] > 0
    assert body["safe"]["selective_accuracy"] >= body["argmax"]["accuracy"]
    assert any(point["is_current"] for point in body["sweep"])


def test_upload_select_simulate_decode(client):
    content = "product_id,product_type\n" + "".join(
        f"{i},{['Electronics', 'Furniture', 'Clothing'][(i - 1) % 3]}\n" for i in range(1, 61)
    )
    upload = client.post("/api/datasets/upload", files={"file": ("products.csv", content, "text/csv")})
    assert upload.status_code == 201, upload.text
    dataset = upload.json()
    assert dataset["row_count"] == 60 and dataset["column_count"] == 2
    assert dataset["suggested_column"] == "product_type"

    early = client.post(f"/api/datasets/{dataset['id']}/decode", json={})
    assert early.status_code == 409

    encoding = client.post("/api/encode", json={"dataset_id": dataset["id"], "column": "product_type"}).json()
    assert encoding["categories"] == CATS
    assert encoding["mapping"][1] == {"category": "Furniture", "index": 1, "one_hot": [0, 1, 0], "count": 20}

    simulated = client.post(f"/api/datasets/{dataset['id']}/simulate", json={"seed": 3}).json()
    assert simulated["pipeline"]["stage"] == "probabilities_ready"
    decoded = client.post(f"/api/datasets/{dataset['id']}/decode", json={}).json()
    assert decoded["decoded"] and decoded["total_rows"] == 60


def test_upload_with_probability_columns(client):
    lines = ["item,label,p_a,p_b"] + [f"{i},{'a' if i % 2 else 'b'},0.6,0.4" for i in range(10)] + ["10,a,0.5,0.6"]
    upload = client.post("/api/datasets/upload", files={"file": ("probs.csv", "\n".join(lines), "text/csv")}).json()
    client.post("/api/encode", json={"dataset_id": upload["id"], "column": "label"})
    detail = client.get(f"/api/datasets/{upload['id']}").json()
    assert detail["suggested_probability_columns"] == {"a": "p_a", "b": "p_b"}
    bad = client.post(f"/api/datasets/{upload['id']}/probabilities/columns", json={"mapping": {"a": "p_a", "b": "p_b"}})
    assert bad.status_code == 422
    assert bad.json()["error"]["code"] == "PROBABILITY_SUM_INVALID"
    assert "Row 11" in bad.json()["error"]["message"]
    ok = client.post(f"/api/datasets/{upload['id']}/probabilities/columns", json={"mapping": {"a": "p_a", "b": "p_b"}, "normalize": True})
    assert ok.status_code == 200


def test_upload_errors(client):
    bad_type = client.post("/api/datasets/upload", files={"file": ("evil.exe", b"MZ", "application/octet-stream")})
    assert bad_type.status_code == 400
    assert bad_type.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"
    bad_xlsx = client.post("/api/datasets/upload", files={"file": ("x.xlsx", b"hello", "application/octet-stream")})
    assert bad_xlsx.json()["error"]["code"] == "INVALID_XLSX"
    missing_column = client.post("/api/datasets/demo", json={"rows": 20, "run_pipeline": False}).json()
    response = client.post("/api/encode", json={"dataset_id": missing_column["id"], "column": "nope"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "MISSING_CATEGORICAL_COLUMN"


def test_unknown_dataset_is_404(client):
    response = client.get("/api/datasets/000000000000")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "DATASET_NOT_FOUND"


def test_settings_roundtrip(client):
    updated = client.put("/api/settings", json={"confidence_threshold": 0.6, "near_tie_threshold": 0.1, "mode": "soft", "top_k": 5}).json()
    assert updated["decode"]["mode"] == "soft"
    decoded = client.post("/api/decode", json={"categories": CATS, "probabilities": [0.65, 0.3, 0.05]}).json()
    assert decoded["status"] == "SAFE" and decoded["threshold"] == 0.6
    reset = client.post("/api/settings/reset").json()
    assert reset["decode"] == reset["defaults"]
    invalid = client.put("/api/settings", json={"confidence_threshold": 3, "near_tie_threshold": 0.1, "mode": "soft", "top_k": 5})
    assert invalid.status_code == 422


def test_gemini_endpoints_unavailable_without_key(client, demo):
    assert client.get("/api/gemini/status").json()["configured"] is False
    response = client.post("/api/gemini/classify", json={"text": "sofa", "categories": CATS})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "GEMINI_NOT_CONFIGURED"


def test_gemini_config_can_be_set_from_settings(client):
    status = client.get("/api/gemini/status").json()
    assert status["source"] == "none"
    assert status["key_preview"] is None
    assert "gemini-2.5-flash" in status["model_choices"]

    updated = client.put("/api/gemini/config", json={"api_key": "sk-my-secret-key-999", "model": "gemini-2.5-pro"}).json()
    assert updated["configured"] is True
    assert updated["source"] == "settings"
    assert updated["model"] == "gemini-2.5-pro"
    assert updated["model_is_custom"] is True
    assert updated["key_preview"] is not None
    assert "sk-my-secret-key-999" not in json.dumps(updated)

    # The key is never echoed back anywhere, including /api/settings.
    settings_body = client.get("/api/settings").json()
    assert "sk-my-secret-key-999" not in json.dumps(settings_body)
    assert settings_body["gemini"]["configured"] is True

    # Changing only the model must not disturb the stored key.
    model_only = client.put("/api/gemini/config", json={"model": "gemini-2.0-flash"}).json()
    assert model_only["source"] == "settings"
    assert model_only["model"] == "gemini-2.0-flash"

    # Clearing the key reverts to "none" (no environment key was set for this test client).
    cleared = client.put("/api/gemini/config", json={"api_key": ""}).json()
    assert cleared["configured"] is False
    assert cleared["source"] == "none"
    # The model override is untouched by clearing the key.
    assert cleared["model_is_custom"] is True

    reset_model = client.put("/api/gemini/config", json={"model": ""}).json()
    assert reset_model["model_is_custom"] is False
    assert reset_model["model"] == "gemini-2.5-flash"


def test_gemini_config_rejects_invalid_payload(client):
    too_long = client.put("/api/gemini/config", json={"api_key": "x" * 500})
    assert too_long.status_code == 422


def test_simulator_helpers(client):
    vector = client.post("/api/simulate/vector", json={"categories": CATS, "scenario": "near_tie", "seed": 1}).json()
    assert abs(sum(vector["probabilities"]) - 1) < 1e-6
    normalized = client.post("/api/simulate/normalize", json={"probabilities": [2, 1, 1]}).json()
    assert normalized["probabilities"] == [0.5, 0.25, 0.25]
    assert normalized["original_sum"] == 4


def test_state_persists_across_restarts(tmp_path):
    settings = Settings(storage_dir=tmp_path, persist_state=True)
    first = TestClient(create_app(settings))
    demo = first.post("/api/datasets/demo", json={"rows": 50, "seed": 5}).json()
    first.post("/api/review", json={"dataset_id": demo["id"], "row_id": 1, "action": "reject"})
    before = first.get(f"/api/results/{demo['id']}/summary").json()

    second = TestClient(create_app(settings))
    after = second.get(f"/api/results/{demo['id']}/summary").json()
    assert after["counts"] == before["counts"]
    assert second.get(f"/api/audit/{demo['id']}").json()["total"] == 1
