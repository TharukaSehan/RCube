from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import base64
import numpy as np
import cv2

# Initialize the FastAPI app
app = FastAPI()

# IMPORTANT: We must enable CORS so your React app (on port 5173) 
# is allowed to send data to this Python app (on port 8000).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the format of the data we expect from React
class ImageData(BaseModel):
    image_base64: str

# Create an endpoint to receive the webcam photo
@app.post("/process-face")
async def process_face(data: ImageData):
    try:
        # 1. The image comes as a base64 string. We need to strip the prefix: "data:image/jpeg;base64,"
        encoded_data = data.image_base64.split(",")[1]
        
        # 2. Decode the string back into bytes
        nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
        
        # 3. Use OpenCV to convert those bytes into a readable image format (a NumPy array)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # For now, let's just grab the dimensions to prove we successfully read the image!
        height, width, channels = img.shape
        
        print(f"Success! Received an image with dimensions: {width}x{height}")
        
        return {
            "status": "success", 
            "message": "Image received and decoded by OpenCV!", 
            "dimensions": f"{width}x{height}"
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Run the server
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)