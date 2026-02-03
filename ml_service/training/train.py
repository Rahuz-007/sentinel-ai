import os
import sys
import tensorflow as tf
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import ModelCheckpoint

# Add project root to path to import model
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from model.cnn_model import create_model

# Constants
DATASET_DIR = os.path.join(os.path.dirname(__file__), '../../dataset')
MODEL_SAVE_PATH = os.path.join(os.path.dirname(__file__), '../model/cnn_model.h5')
IMG_SIZE = 64
BATCH_SIZE = 32
EPOCHS = 20

def train_model():
    print(f"Looking for dataset in: {DATASET_DIR}")
    
    # Check if dataset directories exist and are not empty
    # This is a basic check. In a real scenario, we'd check for files.
    if not os.path.exists(DATASET_DIR):
        print("Dataset directory not found. Please place UCF-Crime frames in 'dataset'.")
        return

    # Data Augmentation
    train_datagen = ImageDataGenerator(
        rescale=1./255,
        rotation_range=10,
        width_shift_range=0.1,
        height_shift_range=0.1,
        shear_range=0.1,
        zoom_range=0.1,
        horizontal_flip=True,
        validation_split=0.2
    )

    print("Loading Training Data...")
    try:
        train_generator = train_datagen.flow_from_directory(
            DATASET_DIR,
            target_size=(IMG_SIZE, IMG_SIZE),
            batch_size=BATCH_SIZE,
            class_mode='categorical',
            subset='training'
        )

        print("Loading Validation Data...")
        validation_generator = train_datagen.flow_from_directory(
            DATASET_DIR,
            target_size=(IMG_SIZE, IMG_SIZE),
            batch_size=BATCH_SIZE,
            class_mode='categorical',
            subset='validation'
        )
    except FileNotFoundError:
        print("Error: Dataset structure incorrect. Ensure 'Fighting', 'Assault', 'Normal' folders exist.")
        return
    except Exception as e:
        print(f"Error loading data: {e}")
        return

    if train_generator.samples == 0:
        print("No images found. Please populate the dataset folder.")
        # CREATE A DUMMY MODEL FOR DEMO PURPOSES IF NO DATA
        print("Creating an untrained dummy model for demonstration...")
        model = create_model()
        model.save(MODEL_SAVE_PATH)
        print(f"Dummy model saved to {MODEL_SAVE_PATH}")
        return

    # Create and Compile Model
    model = create_model()
    
    # Callbacks
    checkpoint = ModelCheckpoint(MODEL_SAVE_PATH, monitor='val_accuracy', save_best_only=True, mode='max', verbose=1)

    # Train
    print("Starting Training...")
    history = model.fit(
        train_generator,
        steps_per_epoch=train_generator.samples // BATCH_SIZE,
        validation_data=validation_generator,
        validation_steps=validation_generator.samples // BATCH_SIZE,
        epochs=EPOCHS,
        callbacks=[checkpoint]
    )

    print("Training Complete.")
    # Final save (if not saved by checkpoint)
    if not os.path.exists(MODEL_SAVE_PATH):
        model.save(MODEL_SAVE_PATH)

if __name__ == "__main__":
    train_model()
