import urllib.request
import json
import base64
import io
from PIL import Image

def get_dummy_base64_image():
    # Create a simple red image
    img = Image.new('RGB', (200, 200), color='red')
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    return f"data:image/jpeg;base64,{img_str}"

def test_health():
    try:
        response = urllib.request.urlopen("http://127.0.0.1:8000/health")
        data = json.loads(response.read().decode())
        print("Health Check Response:", data)
        return data.get("status") == "ok"
    except Exception as e:
        print("Health Check Failed:", e)
        return False

def test_extract_descriptors():
    try:
        dummy_img = get_dummy_base64_image()
        data = json.dumps({"images": [dummy_img]}).encode('utf-8')
        req = urllib.request.Request(
            "http://127.0.0.1:8000/extract_descriptors", 
            data=data, 
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode())
            print("Extract Descriptors Response (No Face Expected):", res_data)
            # Expect empty descriptors list since it's just a red box
            return "descriptors" in res_data
    except Exception as e:
        print("Extract Descriptors Failed:", e)
        return False

def test_recognize():
    try:
        dummy_img = get_dummy_base64_image()
        data = json.dumps({"image": dummy_img}).encode('utf-8')
        req = urllib.request.Request(
            "http://127.0.0.1:8000/recognize", 
            data=data, 
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode())
            print("Recognize Response:", res_data)
            return "match" in res_data and res_data["match"] is False
    except Exception as e:
        print("Recognize Failed:", e)
        return False

if __name__ == "__main__":
    print("Waiting for FastAPI to start and running tests...")
    import time
    time.sleep(3) # Wait a bit for server initialization
    if test_health():
        print("Health test PASSED.")
    if test_extract_descriptors():
        print("Extract descriptors test PASSED.")
    if test_recognize():
        print("Recognize test PASSED.")
