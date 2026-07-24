from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import pickle

import numpy as np


@dataclass
class FaceModel:
    centroids: dict[str, np.ndarray]
    acceptance_distances: dict[str, float]
    threshold: float

    def predict(self, features: np.ndarray) -> tuple[str, float]:
        if not self.centroids:
            return "unknown", 0.0
        distances = {
            label: float(np.linalg.norm(features - centroid))
            for label, centroid in self.centroids.items()
        }
        if not distances:
            return "unknown", 0.0
        label, distance = min(distances.items(), key=lambda item: item[1])
        acceptance_distance = self.acceptance_distances.get(label, 1.2)
        confidence = float(np.exp(-distance / acceptance_distance))
        if confidence < self.threshold:
            return "unknown", confidence
        return label, confidence


def train_classifier(features: np.ndarray, labels: list[str], threshold: float) -> FaceModel:
    centroids: dict[str, np.ndarray] = {}
    acceptance_distances: dict[str, float] = {}
    label_array = np.asarray(labels)

    for label in sorted(set(labels)):
        class_features = features[label_array == label]
        centroid = class_features.mean(axis=0)
        distances = np.linalg.norm(class_features - centroid, axis=1)
        centroids[label] = centroid
        acceptance_distances[label] = max(float(np.percentile(distances, 95)) * 2.0, 1.2)

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
    if not path.is_file():
        return FaceModel(centroids={}, acceptance_distances={}, threshold=0.3)
    try:
        with path.open("rb") as handle:
            model = pickle.load(handle)
        if not isinstance(model, FaceModel):
            return FaceModel(centroids={}, acceptance_distances={}, threshold=0.3)
        return model
    except Exception:
        return FaceModel(centroids={}, acceptance_distances={}, threshold=0.3)
