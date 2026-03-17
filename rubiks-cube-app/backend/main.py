from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import base64
import numpy as np
import cv2

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ImageData(BaseModel):
    image_base64: str

# --- NEW: Color Classification Function ---
def classify_color(h, s, v):
    """
    Takes a Hue, Saturation, and Value and returns the Rubik's cube color.
    Note: These ranges might need tweaking based on your specific webcam lighting!
    """
    # If there is very little color (low saturation) and it's fairly bright, it's White
    if s < 60 and v > 100:
        return "W"
    
    # Otherwise, we look at the Hue (0 to 179 in OpenCV) to determine the color
    if h < 10 or h > 165:
        return "R" # Red
    elif 10 <= h < 25:
        return "O" # Orange
    elif 25 <= h < 45:
        return "Y" # Yellow
    elif 45 <= h < 85:
        return "G" # Green
    elif 85 <= h < 130:
        return "B" # Blue
        
    return "Unknown"

@app.post("/process-face")
async def process_face(data: ImageData):
    try:
        # 1. Decode the image
        encoded_data = data.image_base64.split(",")[1]
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 2. Convert the image from BGR (OpenCV default) to HSV
        hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # 3. Define the center coordinates for our 9 grid squares
        # The image is 300x300, so each square is 100x100.
        # The centers are at 50, 150, and 250 for both X and Y.
        centers = [
            (50, 50),   (150, 50),   (250, 50),   # Top row
            (50, 150),  (150, 150),  (250, 150),  # Middle row
            (50, 250),  (150, 250),  (250, 250)   # Bottom row
        ]
        
        detected_colors = []

        # 4. Loop through the 9 centers and extract the color
        for (x, y) in centers:
            # We grab a small 10x10 pixel box around the center and average it 
            # to avoid reading a speck of dust or a scratch on the cube
            roi = hsv_img[y-5:y+5, x-5:x+5]
            avg_color = np.mean(roi, axis=(0, 1))
            
            h, s, v = avg_color
            
            # Figure out which Rubik's color this HSV value belongs to
            color_name = classify_color(h, s, v)
            detected_colors.append(color_name)

        print("Detected face colors:", detected_colors)

        return {
            "status": "success", 
            "colors": detected_colors
        }
        
    except Exception as e:
        print("Error processing image:", e)
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)