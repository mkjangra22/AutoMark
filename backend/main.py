import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import lbph
from .lbph.faces import detect_faces, lbph_features, load_face_detector
from .lbph.model import FaceModel, load_model, save_model

# The supplied model was pickled from the original ``face_recognize`` package.
# Keep that module name as an alias so the existing model can be loaded safely.
sys.modules.setdefault("face_recognize", lbph)
sys.modules.setdefault("face_recognize.model", sys.modules[FaceModel.__module__])

app = FastAPI(title="AutoMark LBP Face Recognition Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

ROOT_DIR = Path(__file__).resolve().parent
MODEL_PATH = ROOT_DIR / "private-models" / "face_model.pkl"
FIREBASE_PROJECT_ID = os.getenv(
    "FIREBASE_PROJECT_ID", os.getenv("VITE_FIREBASE_PROJECT_ID", "automark12")
)
CACHE_TTL_SECONDS = 30
STUDENT_CACHE: dict[str, dict[str, str]] = {}
LAST_CACHE_TIME = 0.0

detector = load_face_detector()


class RecognizeRequest(BaseModel):
    image: str


class RegisterFacesRequest(BaseModel):
    student_id: str
    images: list[str]


def decode_image(encoded_image: str) -> np.ndarray:
    try:
        if "," in encoded_image:
            encoded_image = encoded_image.split(",", 1)[1]
        raw = base64.b64decode(encoded_image)
        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("OpenCV could not decode the image")
        return image
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid or unreadable image.") from error


def get_single_face(image: np.ndarray):
    faces = detect_faces(image, detector)
    if not faces:
        return None, "No face detected."
    if len(faces) != 1:
        return None, "Show exactly one face to the camera."
    return faces[0], None


def box_response(face) -> dict[str, int]:
    x, y, width, height = face.box
    return {"x": x, "y": y, "width": width, "height": height}


def fetch_students_from_firestore():
    students: dict[str, dict[str, str]] = {}
    page_token = None
    try:
        while True:
            url = (
                f"https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}"
                "/databases/(default)/documents/users?pageSize=300"
            )
            if page_token:
                url += "&pageToken=" + urllib.parse.quote(page_token)
            request = urllib.request.Request(url, headers={"User-Agent": "AutoMark/1.0"})
            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.loads(response.read().decode())

            for document in data.get("documents", []):
                fields = document.get("fields", {})
                if fields.get("role", {}).get("stringValue") != "student":
                    continue
                if fields.get("deleted", {}).get("booleanValue", False):
                    continue
                if fields.get("disabled", {}).get("booleanValue", False):
                    continue
                uid = document.get("name", "").rsplit("/", 1)[-1]
                if not uid:
                    continue
                name = fields.get("name", {}).get("stringValue", "Unknown")
                students[uid] = {
                    "uid": uid,
                    "name": name,
                    "rollNo": fields.get("rollNo", {}).get("stringValue", "N/A"),
                    "modelLabel": fields.get("faceModelLabel", {}).get("stringValue", uid),
                    "firstName": name.split()[0] if name else "",
                }
            page_token = data.get("nextPageToken")
            if not page_token:
                break
        return students
    except Exception as error:
        print(f"Could not refresh student labels from Firestore: {error}")
        return None


def refresh_student_cache(force: bool = False):
    global STUDENT_CACHE, LAST_CACHE_TIME
    if not force and STUDENT_CACHE and time.time() - LAST_CACHE_TIME < CACHE_TTL_SECONDS:
        return
    students = fetch_students_from_firestore()
    if students is not None:
        STUDENT_CACHE = students
        LAST_CACHE_TIME = time.time()


def resolve_student(model_label: str):
    normalized_label = model_label.casefold()
    for student in STUDENT_CACHE.values():
        if normalized_label in {
            student["uid"].casefold(),
            student["modelLabel"].casefold(),
            student["firstName"].casefold(),
        }:
            return student
    return {
        "uid": model_label,
        "name": model_label.title(),
        "rollNo": "N/A",
        "modelLabel": model_label
    }


def unknown_response(reason: str, box=None, confidence: float = 0.0):
    return {
        "match": False,
        "label": "unknown",
        "name": "Unknown",
        "rollNo": "N/A",
        "similarity": confidence,
        "distance": 1.0 - confidence,
        "margin": 0.0,
        "reason": reason,
        "box": box,
    }


def add_student_to_model(student_id: str, features: list[np.ndarray]) -> None:
    model = load_model(MODEL_PATH)
    feature_matrix = np.vstack(features)
    centroid = feature_matrix.mean(axis=0)
    distances = np.linalg.norm(feature_matrix - centroid, axis=1)
    model.centroids[student_id] = centroid
    model.acceptance_distances[student_id] = max(float(np.percentile(distances, 95)) * 2.0, 1.2)
    save_model(model, MODEL_PATH)


@app.get("/health")
def health():
    model = load_model(MODEL_PATH)
    return {
        "status": "ok",
        "engine": "opencv-haar-lbp",
        "trained_labels": sorted(model.centroids),
        "cached_students": len(STUDENT_CACHE),
    }


@app.post("/reload")
def reload_students():
    refresh_student_cache(force=True)
    return {"status": "success", "cached_students": len(STUDENT_CACHE)}


@app.post("/register_faces")
def register_faces(request: RegisterFacesRequest):
    min_required = 5
    if len(request.images) < min_required:
        raise HTTPException(status_code=400, detail=f"Provide at least {min_required} face samples for registration.")

    features = []
    rejected = []
    for index, encoded_image in enumerate(request.images):
        try:
            face, reason = get_single_face(decode_image(encoded_image))
            if reason:
                rejected.append({"index": index, "reason": reason})
                continue
            features.append(lbph_features(face.image))
        except HTTPException as error:
            rejected.append({"index": index, "reason": error.detail})

    if len(features) < min_required:
        return {
            "registered": False,
            "accepted": len(features),
            "rejected": rejected,
            "reason": f"At least {min_required} clear, single-face samples are required (accepted {len(features)} of {len(request.images)}). Upload clearer photos or align face in camera.",
        }

    add_student_to_model(request.student_id, features)
    return {"registered": True, "accepted": len(features), "rejected": rejected, "label": request.student_id}


@app.post("/recognize")
def recognize(request: RecognizeRequest):
    image = decode_image(request.image)
    face, reason = get_single_face(image)
    if reason:
        return unknown_response(reason)

    model = load_model(MODEL_PATH)
    model_label, confidence = model.predict(lbph_features(face.image))
    box = box_response(face)
    if model_label == "unknown":
        return unknown_response("Face does not match a registered student confidently.", box, confidence)

    refresh_student_cache()
    student = resolve_student(model_label)
    if student is None:
        return unknown_response("Recognized face is not linked to an active student account.", box, confidence)

    return {
        "match": True,
        "label": student["uid"],
        "name": student["name"],
        "rollNo": student["rollNo"],
        "similarity": confidence,
        "distance": 1.0 - confidence,
        "margin": 0.0,
        "reason": "Face recognized.",
        "box": box,
    }
