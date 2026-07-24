from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .config import FACE_SIZE, IMAGE_EXTENSIONS


@dataclass(frozen=True)
class DetectedFace:
    image: np.ndarray
    box: tuple[int, int, int, int]


def image_paths(data_dir: Path) -> list[Path]:
    return sorted(
        path
        for path in data_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def load_image(path: Path) -> np.ndarray:
    image = cv2.imread(str(path))
    if image is None:
        raise ValueError(f"Could not read image: {path}")
    return image


def load_face_detector() -> cv2.CascadeClassifier:
    bundled_cascade = Path(__file__).resolve().parent / "assets" / "haarcascade_frontalface_default.xml"
    cascade_path = bundled_cascade if bundled_cascade.is_file() else Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(str(cascade_path))
    if detector.empty():
        raise RuntimeError(f"Could not load OpenCV face detector: {cascade_path}")
    return detector


def detect_faces(
    image: np.ndarray,
    detector: cv2.CascadeClassifier,
    face_size: tuple[int, int] = FACE_SIZE,
) -> list[DetectedFace]:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    boxes = detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=6,
        minSize=(50, 50),
    )

    if len(boxes) == 0:
        return []

    # Sort boxes by area descending so primary faces come first
    box_list = sorted([tuple(b) for b in boxes], key=lambda b: b[2] * b[3], reverse=True)
    largest_area = box_list[0][2] * box_list[0][3]

    # Filter out tiny noise boxes (e.g. less than 20% of the largest box area)
    filtered_boxes = [b for b in box_list if (b[2] * b[3]) >= 0.20 * largest_area]

    faces: list[DetectedFace] = []
    for x, y, w, h in filtered_boxes:
        crop = gray[y : y + h, x : x + w]
        resized = cv2.resize(crop, face_size, interpolation=cv2.INTER_AREA)
        faces.append(DetectedFace(image=resized, box=(int(x), int(y), int(w), int(h))))
    return faces


def lbph_features(face: np.ndarray) -> np.ndarray:
    """Return a Local Binary Pattern histogram for a normalized grayscale face."""
    radius = 1
    points = 8 * radius
    center = face[radius:-radius, radius:-radius]

    code = np.zeros_like(center, dtype=np.uint8)
    offsets = [
        (-1, -1),
        (-1, 0),
        (-1, 1),
        (0, 1),
        (1, 1),
        (1, 0),
        (1, -1),
        (0, -1),
    ]
    for bit, (dy, dx) in enumerate(offsets[:points]):
        neighbor = face[radius + dy : face.shape[0] - radius + dy, radius + dx : face.shape[1] - radius + dx]
        code |= ((neighbor >= center).astype(np.uint8) << bit)

    grid_y, grid_x = 8, 8
    cell_h = code.shape[0] // grid_y
    cell_w = code.shape[1] // grid_x
    histograms: list[np.ndarray] = []

    for row in range(grid_y):
        for col in range(grid_x):
            cell = code[row * cell_h : (row + 1) * cell_h, col * cell_w : (col + 1) * cell_w]
            hist, _ = np.histogram(cell, bins=256, range=(0, 256))
            hist_sum = hist.sum()
            if hist_sum > 0:
                hist = hist.astype(np.float32) / hist_sum
            else:
                hist = hist.astype(np.float32)
            histograms.append(hist)

    return np.concatenate(histograms)
