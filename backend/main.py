import base64
import io
import json
import os
import time
import urllib.parse
import urllib.request

import numpy as np
import torch
from facenet_pytorch import InceptionResnetV1, MTCNN
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="AutoMark FaceNet Recognition Backend")

# This backend is intended for the local machine that runs the attendance desk.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

device = torch.device("cpu")
print("Loading MTCNN and FaceNet (VGGFace2) on CPU...")
mtcnn = MTCNN(keep_all=False, select_largest=True, device=device)
resnet = InceptionResnetV1(pretrained="vggface2").eval().to(device)
print("Face models loaded successfully.")

STUDENT_CACHE = {}
LAST_CACHE_TIME = 0.0
CACHE_TTL_SECONDS = 30
FIREBASE_PROJECT_ID = os.getenv(
    "FIREBASE_PROJECT_ID", os.getenv("VITE_FIREBASE_PROJECT_ID", "automark12")
)

# These are deliberately conservative defaults. Tune them using real, consented
# validation images from your school before changing them for production.
MIN_FACE_PROBABILITY = 0.97
MIN_FACE_SIZE_PIXELS = 100
MATCH_THRESHOLD = 0.70
MATCH_MARGIN = 0.04
TOP_REFERENCE_SAMPLES = 3
EMBEDDING_DIMENSION = 512


class RecognizeRequest(BaseModel):
    image: str


class ExtractRequest(BaseModel):
    images: list[str]


def decode_base64_image(base64_str: str) -> Image.Image:
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]
        return Image.open(io.BytesIO(base64.b64decode(base64_str))).convert("RGB")
    except Exception as error:
        raise HTTPException(status_code=400, detail="Invalid or unreadable image.") from error


def normalize_embedding(embedding: np.ndarray) -> np.ndarray | None:
    embedding = np.asarray(embedding, dtype=np.float32)
    norm = np.linalg.norm(embedding)
    if embedding.shape != (EMBEDDING_DIMENSION,) or norm == 0:
        return None
    return embedding / norm


def detect_single_face(image: Image.Image):
    """Return a valid face box or a user-facing rejection reason."""
    try:
        boxes, probabilities = mtcnn.detect(image)
    except Exception as error:
        print(f"MTCNN detection error: {error}")
        return None, "Face detection failed. Try again."

    if boxes is None or probabilities is None or len(boxes) == 0:
        return None, "No face detected."
    if len(boxes) != 1:
        return None, "Show exactly one face to the camera."

    box = boxes[0]
    probability = float(probabilities[0])
    width = float(box[2] - box[0])
    height = float(box[3] - box[1])
    if probability < MIN_FACE_PROBABILITY:
        return None, "Face detection is not confident. Improve lighting and face the camera."
    if min(width, height) < MIN_FACE_SIZE_PIXELS:
        return None, "Move closer to the camera."

    return {
        "x": float(box[0]),
        "y": float(box[1]),
        "width": width,
        "height": height,
        "probability": probability,
    }, None


def get_face_embedding(image: Image.Image) -> np.ndarray | None:
    try:
        face_tensor = mtcnn(image)
        if face_tensor is None:
            return None
        with torch.no_grad():
            embedding = resnet(face_tensor.unsqueeze(0).to(device))[0].cpu().numpy()
        return normalize_embedding(embedding)
    except Exception as error:
        print(f"Embedding extraction error: {error}")
        return None


def fetch_students_from_firestore():
    """Load valid student descriptor arrays from Firestore's REST endpoint."""
    students = {}
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

                descriptors = []
                values = fields.get("descriptors", {}).get("arrayValue", {}).get("values", [])
                for item in values:
                    raw_values = item.get("arrayValue", {}).get("values", [])
                    vector = []
                    for value in raw_values:
                        number = value.get("doubleValue", value.get("integerValue"))
                        if number is not None:
                            vector.append(float(number))
                    normalized = normalize_embedding(np.array(vector, dtype=np.float32))
                    if normalized is not None:
                        descriptors.append(normalized)

                uid = document.get("name", "").rsplit("/", 1)[-1]
                if uid and descriptors:
                    students[uid] = {
                        "name": fields.get("name", {}).get("stringValue", "Unknown"),
                        "rollNo": fields.get("rollNo", {}).get("stringValue", "N/A"),
                        "descriptors": descriptors,
                    }

            page_token = data.get("nextPageToken")
            if not page_token:
                break

        print(f"Loaded {len(students)} registered students into the recognition cache.")
        return students
    except Exception as error:
        # Preserve the existing cache if Firebase is temporarily unavailable.
        print(f"Could not refresh students from Firestore: {error}")
        return None


def refresh_student_cache(force: bool = False):
    global STUDENT_CACHE, LAST_CACHE_TIME
    if not force and STUDENT_CACHE and time.time() - LAST_CACHE_TIME < CACHE_TTL_SECONDS:
        return
    students = fetch_students_from_firestore()
    if students is not None:
        STUDENT_CACHE = students
        LAST_CACHE_TIME = time.time()


def unknown_response(reason: str, box=None):
    return {
        "match": False,
        "label": "unknown",
        "name": "Unknown",
        "rollNo": "N/A",
        "similarity": 0.0,
        "distance": 1.0,
        "margin": 0.0,
        "reason": reason,
        "box": box,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "cached_students": len(STUDENT_CACHE),
        "match_threshold": MATCH_THRESHOLD,
        "match_margin": MATCH_MARGIN,
    }


@app.post("/reload")
def reload_students():
    refresh_student_cache(force=True)
    return {"status": "success", "cached_students": len(STUDENT_CACHE)}


@app.post("/extract_descriptors")
def extract_descriptors(request: ExtractRequest):
    descriptors = []
    rejected = []
    for index, base64_image in enumerate(request.images):
        try:
            image = decode_base64_image(base64_image)
            _, reason = detect_single_face(image)
            if reason:
                rejected.append({"index": index, "reason": reason})
                continue
            embedding = get_face_embedding(image)
            if embedding is None:
                rejected.append({"index": index, "reason": "Could not create a face descriptor."})
                continue
            descriptors.append(embedding.tolist())
        except HTTPException as error:
            rejected.append({"index": index, "reason": error.detail})

    return {"descriptors": descriptors, "rejected": rejected}


@app.post("/recognize")
def recognize(request: RecognizeRequest):
    refresh_student_cache()
    image = decode_base64_image(request.image)
    box, reason = detect_single_face(image)
    if reason:
        return unknown_response(reason, box)
    if not STUDENT_CACHE:
        return unknown_response("No registered students are available.", box)

    query_embedding = get_face_embedding(image)
    if query_embedding is None:
        return unknown_response("Could not create a face descriptor.", box)

    candidates = []
    for uid, info in STUDENT_CACHE.items():
        similarities = sorted(
            (float(np.dot(query_embedding, reference)) for reference in info["descriptors"]),
            reverse=True,
        )
        # Median of the best samples is less vulnerable to one bad enrollment photo.
        score = float(np.median(similarities[:TOP_REFERENCE_SAMPLES]))
        candidates.append((score, uid, info))

    candidates.sort(key=lambda candidate: candidate[0], reverse=True)
    best_score, best_uid, best_info = candidates[0]
    second_score = candidates[1][0] if len(candidates) > 1 else 0.0
    margin = best_score - second_score
    matched = best_score >= MATCH_THRESHOLD and (
        len(candidates) == 1 or margin >= MATCH_MARGIN
    )

    if not matched:
        if best_score < MATCH_THRESHOLD:
            reason = "Face does not match a registered student confidently."
        else:
            reason = "Face is too similar to another student. Try again with better lighting."
        print(f"Recognition rejected: score={best_score:.3f}, margin={margin:.3f}")
        response = unknown_response(reason, box)
        response.update({"similarity": best_score, "distance": 1.0 - best_score, "margin": margin})
        return response

    print(f"Recognition matched {best_info['name']}: score={best_score:.3f}, margin={margin:.3f}")
    return {
        "match": True,
        "label": best_uid,
        "name": best_info["name"],
        "rollNo": best_info["rollNo"],
        "similarity": best_score,
        "distance": 1.0 - best_score,
        "margin": margin,
        "reason": "Face recognized.",
        "box": box,
    }
