from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import base64
import numpy as np
import cv2
import kociemba

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
    # 1. Black/Shadow check (If it's too dark, don't guess a color)
    if v < 40:
        return "Unknown"
        
    # 2. White check 
    # Lowered the Saturation threshold to 40! 
    # Your real White is ~15-30. Your Yellow is ~55-70. This fixes the overlap.
    if s < 40 and v > 80:
        return "W"
    
    # 2.1 NEW: The "Blue-Tinted White" Cheat Code
    # If the Hue is Blue (85-130), but the Value (brightness) is relatively low (< 160)
    # compared to your real glowing blue stickers, assume it's a shadowed White piece.
    if 85 <= h <= 130 and v < 160:
        return "W"
      
    # 3. Hue checks
    if h < 5 or h > 165:
        return "R"  # Red
    elif 5 <= h < 22:
        return "O"  # Orange
    elif 22 <= h < 60: 
        return "Y"  # Yellow (Expanded all the way up to 60 to catch your webcam's yellow)
    elif 60 <= h < 85:
        return "G"  # Green (Pushed start to 60 so it stops stealing yellow)
    elif 85 <= h < 130:
        return "B"  # Blue
        
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
        for i, (x, y) in enumerate(centers):
            roi = hsv_img[y-5:y+5, x-5:x+5]
            avg_color = np.mean(roi, axis=(0, 1))
            
            # Convert to integers so they are easy to read
            h, s, v = [int(val) for val in avg_color] 
            
            color_name = classify_color(h, s, v)
            detected_colors.append(color_name)
            
            # THIS IS THE NEW LINE: Print the exact math for every single square!
            print(f"Square {i+1} -> H:{h:3d}, S:{s:3d}, V:{v:3d}  => Seen as: {color_name}")

        print("Detected face colors:", detected_colors)

        return {
            "status": "success", 
            "colors": detected_colors
        }
        
    except Exception as e:
        print("Error processing image:", e)
        return {"status": "error", "message": str(e)}

class CubeState(BaseModel):
    colors: list[str] # Expects a list of 54 color strings (e.g., ["W", "W", "W", ...])

@app.post("/solve")
async def solve_cube(state: CubeState):
    try:
        # 1. Map our detected colors to Kociemba's required Face letters
        # Standard layout: White=Up, Red=Right, Green=Front, Yellow=Down, Orange=Left, Blue=Back
        color_to_face = {
            'W': 'U', 'R': 'R', 'G': 'F', 
            'Y': 'D', 'O': 'L', 'B': 'B',
            'Unknown': 'U' # Fallback to prevent immediate crashes, though invalid cubes will still fail
        }

        # 2. Convert the 54 colors into a single 54-character string
        cube_string = "".join([color_to_face[c] for c in state.colors])
        print(f"Attempting to solve string: {cube_string}")

        # 3. Feed it to the Kociemba algorithm!
        solution = kociemba.solve(cube_string)
        print(f"Solution found: {solution}")

        # 4. The solution is a string like "R2 U' F D". We split it into a list for React.
        moves_list = solution.split(" ")

        return {
            "status": "success",
            "moves": moves_list
        }

    except ValueError as ve:
        # Kociemba throws a ValueError if the cube state is physically impossible
        return {"status": "error", "message": "Invalid cube state. Are the colors scanned correctly?"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)