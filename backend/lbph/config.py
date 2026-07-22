from pathlib import Path


IMAGE_EXTENSIONS = {".bmp", ".jpeg", ".jpg", ".png", ".webp"}
FACE_SIZE = (160, 160)
DEFAULT_CONFIDENCE_THRESHOLD = 0.55


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
