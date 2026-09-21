"""Probability-vector simulator and demo dataset generator.

The project deliberately does not train a model. Instead this engine produces
realistic probability vectors for known labels with a controlled mixture of
scenarios, so that the safe decoder can be demonstrated and evaluated:

* ``confident``            - the true label clearly wins (e.g. 0.91 / 0.06 / 0.03)
* ``moderate``             - true label wins with a clear gap but low confidence
* ``near_tie``             - top two within a few points; sometimes the wrong one wins
* ``low_confidence``       - a diffuse, almost uniform vector
* ``overconfident_error``  - a *wrong* category with high confidence (cannot be
                              caught by confidence checks - kept for honest evaluation)
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np
import pandas as pd

from app.core import CategoryEncoding

Scenario = Literal["confident", "moderate", "near_tie", "low_confidence", "overconfident_error"]
ExampleScenario = Literal["safe", "near_tie", "low_confidence", "random"]

SCENARIOS: tuple[Scenario, ...] = (
    "confident",
    "moderate",
    "near_tie",
    "low_confidence",
    "overconfident_error",
)

DEFAULT_MIX: dict[str, float] = {
    "confident": 0.55,
    "moderate": 0.12,
    "near_tie": 0.18,
    "low_confidence": 0.10,
    "overconfident_error": 0.05,
}

DEMO_CATEGORIES = ("Electronics", "Furniture", "Clothing", "Grocery", "Sports")

# (product name, true category, commonly-confused category)
DEMO_PRODUCTS: tuple[tuple[str, str, str | None], ...] = (
    ("Wireless Noise-Cancelling Headphones", "Electronics", None),
    ("27-inch 4K Monitor", "Electronics", None),
    ("USB-C Docking Station", "Electronics", None),
    ("Mechanical Keyboard", "Electronics", None),
    ("Smart Fitness Tracker", "Electronics", "Sports"),
    ("Gaming Chair with Speakers", "Furniture", "Electronics"),
    ("Smart LED Desk Lamp", "Electronics", "Furniture"),
    ("Bluetooth Bike Computer", "Electronics", "Sports"),
    ("Portable Blender", "Electronics", "Grocery"),
    ("Oak Dining Table", "Furniture", None),
    ("Three-Seat Linen Sofa", "Furniture", None),
    ("Walnut Bookshelf", "Furniture", None),
    ("Standing Desk Frame", "Furniture", "Electronics"),
    ("Storage Ottoman", "Furniture", None),
    ("Folding Camping Chair", "Furniture", "Sports"),
    ("Kitchen Bar Stool", "Furniture", None),
    ("Merino Wool Sweater", "Clothing", None),
    ("Slim-Fit Chinos", "Clothing", None),
    ("Rain Jacket", "Clothing", "Sports"),
    ("Yoga Leggings", "Clothing", "Sports"),
    ("Running Shoes", "Sports", "Clothing"),
    ("Heated Winter Gloves", "Clothing", "Electronics"),
    ("Cotton Oxford Shirt", "Clothing", None),
    ("Organic Rolled Oats", "Grocery", None),
    ("Cold Brew Coffee Concentrate", "Grocery", None),
    ("Extra Virgin Olive Oil", "Grocery", None),
    ("Whey Protein Powder", "Grocery", "Sports"),
    ("Electrolyte Drink Mix", "Grocery", "Sports"),
    ("Basmati Rice 5kg", "Grocery", None),
    ("Dark Chocolate Bar", "Grocery", None),
    ("Carbon Tennis Racket", "Sports", None),
    ("Adjustable Dumbbells", "Sports", None),
    ("Yoga Mat", "Sports", "Furniture"),
    ("Mountain Bike Helmet", "Sports", None),
    ("Insulated Water Bottle", "Sports", "Grocery"),
    ("Football Size 5", "Sports", None),
    ("Compression Running Tights", "Sports", "Clothing"),
)

DEMO_REGIONS = ("North", "South", "East", "West")


@dataclass
class SimulationOutput:
    probabilities: np.ndarray
    scenarios: list[str]
    seed: int


def _normalise_mix(mix: dict[str, float] | None) -> dict[str, float]:
    raw = {**DEFAULT_MIX, **(mix or {})} if mix is None else {s: float(mix.get(s, 0.0)) for s in SCENARIOS}
    if any(v < 0 for v in raw.values()):
        raise ValueError("Scenario weights cannot be negative.")
    total = sum(raw.values())
    if total <= 0:
        raise ValueError("At least one scenario weight must be positive.")
    return {k: raw[k] / total for k in SCENARIOS}


class ProbabilitySimulator:
    def __init__(self, seed: int | None = None) -> None:
        self.seed = int(seed) if seed is not None else int(np.random.SeedSequence().entropy % (2**31))
        self.rng = np.random.default_rng(self.seed)

    # ------------------------------------------------------------------ vectors
    def _remainder(self, k: int, fixed: dict[int, float], cap: float) -> np.ndarray:
        """Place ``fixed`` probabilities and spread the rest below ``cap``."""
        vector = np.zeros(k)
        for index, value in fixed.items():
            vector[index] = value
        free = [i for i in range(k) if i not in fixed]
        remainder = max(0.0, 1.0 - sum(fixed.values()))
        if not free:
            vector[next(iter(fixed))] += remainder
            return vector
        for _ in range(50):
            share = self.rng.dirichlet(np.full(len(free), 1.6)) * remainder
            if share.max() < cap:
                break
        else:
            share = np.full(len(free), remainder / len(free))
        vector[free] = share
        return vector

    def _vector(self, k: int, true_index: int, scenario: str, confusable: int | None) -> np.ndarray:
        rng = self.rng
        others = [i for i in range(k) if i != true_index]
        runner_up = confusable if confusable is not None and confusable != true_index else int(rng.choice(others))

        if scenario == "confident":
            p = rng.uniform(0.80, 0.97)
            second = rng.uniform(0.0, 1 - p) * rng.uniform(0.4, 1.0)
            vector = self._remainder(k, {true_index: p, runner_up: second}, cap=min(second, 1 - p) + 1e-9)
        elif scenario == "moderate":
            p = rng.uniform(0.52, 0.72)
            second = rng.uniform(0.12, max(0.13, min(p - 0.10, 1 - p)))
            vector = self._remainder(k, {true_index: p, runner_up: second}, cap=second)
        elif scenario == "near_tie":
            low = 0.5 - 0.02 if k == 2 else 0.34
            high = 0.5 if k == 2 else 0.49
            first = rng.uniform(low, high)
            gap = rng.uniform(0.0, 0.045)
            second = max(0.0, min(first - gap, 1 - first))
            # 55% of near ties still have the true label on top; the rest are argmax errors.
            winner, loser = (true_index, runner_up) if rng.random() < 0.55 else (runner_up, true_index)
            vector = self._remainder(k, {winner: first, loser: second}, cap=max(second - 0.02, 0.0) + 1e-9)
        elif scenario == "low_confidence":
            vector = rng.dirichlet(np.full(k, 7.0))
        elif scenario == "overconfident_error":
            p = rng.uniform(0.78, 0.93)
            second = rng.uniform(0.02, 1 - p)
            vector = self._remainder(k, {runner_up: p, true_index: second}, cap=second)
        else:  # random
            vector = rng.dirichlet(np.ones(k))
        return self._round(vector)

    @staticmethod
    def _round(vector: np.ndarray, decimals: int = 4) -> np.ndarray:
        vector = np.clip(vector, 0, None)
        vector = vector / vector.sum()
        rounded = np.round(vector, decimals)
        rounded[int(np.argmax(rounded))] += round(1.0 - rounded.sum(), decimals)
        return np.clip(rounded, 0.0, 1.0)

    def generate_for_labels(
        self,
        labels: Sequence[str | None],
        encoding: CategoryEncoding,
        mix: dict[str, float] | None = None,
        confusables: Sequence[str | None] | None = None,
    ) -> SimulationOutput:
        weights = _normalise_mix(mix)
        names = list(weights)
        probs = np.array([weights[n] for n in names])
        k = encoding.size
        mapping = encoding.mapping
        rows: list[np.ndarray] = []
        scenarios: list[str] = []
        for i, label in enumerate(labels):
            if label is None or label not in mapping:
                true_index = int(self.rng.integers(k))
                scenario = "low_confidence"
            else:
                true_index = mapping[label]
                confusable_label = confusables[i] if confusables is not None else None
                row_probs = probs
                if confusable_label is not None:
                    # Semantically confusable items are more likely to produce near ties.
                    boost = np.array([0.8 if n == "confident" else 1.0 for n in names])
                    boost[names.index("near_tie")] = 1.6
                    row_probs = probs * boost
                    row_probs = row_probs / row_probs.sum()
                scenario = str(self.rng.choice(names, p=row_probs))
            confusable_index = None
            if confusables is not None and confusables[i] in mapping:
                confusable_index = mapping[confusables[i]]  # type: ignore[index]
            rows.append(self._vector(k, true_index, scenario, confusable_index))
            scenarios.append(scenario)
        return SimulationOutput(np.vstack(rows), scenarios, self.seed)

    def example_vector(self, categories: Sequence[str], scenario: ExampleScenario) -> np.ndarray:
        k = len(categories)
        true_index = int(self.rng.integers(k))
        mapped = {"safe": "confident", "near_tie": "near_tie", "low_confidence": "low_confidence"}
        if scenario == "near_tie":
            vector = self._vector(k, true_index, "near_tie", None)
            # Keep the "wrong" winner out of examples so the ordering reads naturally.
            return vector
        if scenario == "low_confidence":
            base = np.full(k, 1.0 / k) + self.rng.uniform(-0.02, 0.02, size=k) / k
            return self._round(np.clip(base, 0.001, None))
        if scenario == "random":
            return self._round(self.rng.dirichlet(np.ones(k)))
        return self._vector(k, true_index, mapped[scenario], None)


def build_demo_frame(rows: int = 300, seed: int = 42) -> tuple[pd.DataFrame, list[str | None]]:
    """Synthetic product catalogue plus the confusable category for each row."""
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, len(DEMO_PRODUCTS), size=rows)
    records = []
    confusables: list[str | None] = []
    for i, pick in enumerate(picks, start=1):
        name, category, confusable = DEMO_PRODUCTS[int(pick)]
        records.append(
            {
                "product_id": 1000 + i,
                "product_name": name,
                "product_type": category,
                "price": round(float(rng.lognormal(3.6, 0.9)), 2),
                "region": DEMO_REGIONS[int(rng.integers(0, len(DEMO_REGIONS)))],
                "in_stock": bool(rng.random() > 0.15),
            }
        )
        confusables.append(confusable)
    return pd.DataFrame.from_records(records), confusables
