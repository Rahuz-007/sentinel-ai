
import cv2
import numpy as np
import sys
import os

# Adjust path
sys.path.append(os.path.join(os.getcwd(), 'ml_service'))

try:
    from ml_service.prediction.predictor import predictor
    print("✅ Predictor loaded successfully")
except Exception as e:
    print(f"❌ Failed to load predictor: {e}")
    sys.exit(1)

# Create a dummy dark image to test CLAHE
img = np.zeros((480, 640, 3), dtype=np.uint8)
# Add some "glare" (bright spot)
cv2.circle(img, (320, 240), 50, (255, 255, 255), -1)

print("Testing prediction on dummy frame...")
try:
    result = predictor.predict_frame(img)
    print(f"✅ Prediction Result: {result}")
    
    if result is None:
        print("❌ Prediction returned None")
    else:
        print("✅ Preprocessing pipeline works")

except Exception as e:
    print(f"❌ Prediction failed: {e}")
