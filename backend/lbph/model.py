from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import pickle

import numpy as np


def chi_squared_distance(a: np.ndarray, b: np.ndarray) -> float:
    eps = 1e-10
    return float(0.5 * np.sum(((a - b) ** 2) / (a + b + eps)))


@dataclass
class FaceModel:
    centroids: dict[str, np.ndarray]
    acceptance_distances: dict[str, float]
    threshold: float

    def predict(self, features: np.ndarray) -> tuple[str, float]:
        if not self.centroids:
            return "unknown", 0.0
        distances = {
            label: chi_squared_distance(features, centroid)
            for label, centroid in self.centroids.items()
        }
        if not distances:
            return "unknown", 0.0
        label, distance = min(distances.items(), key=lambda item: item[1])
        
        # Calculate confidence from Chi-Squared distance (range ~0.0 to 1.0)
        confidence = float(1.0 / (1.0 + (distance / 20.0)))
        acceptance_distance = self.acceptance_distances.get(label, 15.0)

        if distance > acceptance_distance or confidence < self.threshold:
            return "unknown", confidence
        return label, confidence


def train_classifier(features: np.ndarray, labels: list[str], threshold: float) -> FaceModel:
    centroids: dict[str, np.ndarray] = {}
    acceptance_distances: dict[str, float] = {}
    label_array = np.asarray(labels)

    for label in sorted(set(labels)):
        class_features = features[label_array == label]
        centroid = class_features.mean(axis=0)
        dists = [chi_squared_distance(feat, centroid) for feat in class_features]
        centroids[label] = centroid
        p95 = float(np.percentile(dists, 95)) if len(dists) > 0 else 10.0
        acceptance_distances[label] = max(p95 * 1.6, 14.0)

    return FaceModel(
        centroids=centroids,
        acceptance_distances=acceptance_distances,
        threshold=threshold,
    )


def save_model(model: FaceModel, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as handle:
        pickle.dump(model, handle)


def load_model(path: Path) -> FaceModel:
    default_threshold = 0.60
    if not path.is_file():
        return FaceModel(centroids={}, acceptance_distances={}, threshold=default_threshold)
    try:
        with path.open("rb") as handle:
            model = pickle.load(handle)
        if not isinstance(model, FaceModel):
            return FaceModel(centroids={}, acceptance_distances={}, threshold=default_threshold)
        model.threshold = default_threshold
        return model
    except Exception:
        return FaceModel(centroids={}, acceptance_distances={}, threshold=default_threshold)
