import cv2
import numpy as np

IMG_SIZE = 64

def preprocess_frame(frame):
    """
    Preprocess a single frame for prediction.
    1. Resize to IMG_SIZE x IMG_SIZE
    2. Normalize pixel values to [0, 1]
    3. Expand dims to match model input (1, 64, 64, 3)
    """
    try:
        resized_frame = cv2.resize(frame, (IMG_SIZE, IMG_SIZE))
        normalized_frame = resized_frame / 255.0
        input_data = np.expand_dims(normalized_frame, axis=0) # Add batch dimension
        return input_data
    except Exception as e:
        print(f"Error in preprocessing frame: {e}")
        return None

def load_and_preprocess_image(image_path):
    """
    Load an image from path and preprocess it.
    """
    image = cv2.imread(image_path)
    if image is None:
        return None
    return preprocess_frame(image)
