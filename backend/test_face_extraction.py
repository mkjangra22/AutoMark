import urllib.request
import json
import base64
import os

def test_extract_real_face():
    selected_img = os.getenv("FACE_TEST_IMAGE")
    if not selected_img or not os.path.isfile(selected_img):
        print("Skipped: set FACE_TEST_IMAGE to a local, consented test image.")
        return True
        
    print(f"Using profile image: {selected_img}")
    with open(selected_img, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
        
    ext = os.path.splitext(selected_img)[1].lower()
    mime_type = "image/jpeg"
    if ext == ".png":
        mime_type = "image/png"
    elif ext == ".jpg" or ext == ".jpeg":
        mime_type = "image/jpeg"
        
    base64_data_url = f"data:{mime_type};base64,{encoded_string}"
    
    data = json.dumps({"images": [base64_data_url]}).encode('utf-8')
    req = urllib.request.Request(
        "http://127.0.0.1:8000/extract_descriptors", 
        data=data, 
        headers={'Content-Type': 'application/json'}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode())
            descriptors = res_data.get("descriptors", [])
            print("Response Keys:", res_data.keys())
            if len(descriptors) > 0:
                print("Face descriptors extracted successfully!")
                print("Number of faces detected:", len(descriptors))
                print("Descriptor dimensions (should be 512):", len(descriptors[0]))
                return len(descriptors[0]) == 512
            else:
                print("Failed: No face detected in the image.")
                return False
    except Exception as e:
        print("Extract descriptors failed with error:", e)
        return False

if __name__ == "__main__":
    if test_extract_real_face():
        print("Real face descriptor extraction test PASSED.")
    else:
        print("Real face descriptor extraction test FAILED.")
