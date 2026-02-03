import cv2
import numpy as np
import sys
import os

# Add ml_service to path
sys.path.insert(0, os.path.join(os.getcwd(), 'ml_service'))

from ml_service.prediction.predictor import Predictor

try:
    p = Predictor()
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    res = p.predict_frame(dummy_frame)
    print("Result:", res)
except Exception as e:
    import traceback
    traceback.print_exc()
