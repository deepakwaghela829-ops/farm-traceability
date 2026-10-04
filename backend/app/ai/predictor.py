import os
import joblib
import pandas as pd

# Directory where this file resides
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "models", "crop_price_model.pkl")

# Cached singleton model instance
_model = None


def get_model():
    """
    Safely and efficiently loads the trained model once (singleton pattern).
    """
    global _model
    if _model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(f"Trained crop price model not found at {MODEL_PATH}")
        _model = joblib.load(MODEL_PATH)
    return _model


def predict_price(
    crop_type: str,
    historical_price: float,
    season: str,
    location: str,
    demand: float,
    production_quantity: float,
) -> float:
    """
    Predict the future crop price using the trained Random Forest ML pipeline.
    
    Inputs:
    - crop_type: e.g. Banana, Tomato, Onion
    - historical_price: Historical price benchmark
    - season: e.g. Monsoon, Winter, Summer
    - location: e.g. Palghar, Nashik
    - demand: Relative market demand score (e.g. 0.8)
    - production_quantity: Production quantity
    
    Returns:
    - Predicted price rounded to 2 decimal places.
    """
    model = get_model()

    input_data = pd.DataFrame(
        [
            {
                "crop_type": crop_type,
                "historical_price": historical_price,
                "season": season,
                "location": location,
                "demand": demand,
                "production_quantity": production_quantity,
            }
        ]
    )

    prediction = model.predict(input_data)
    predicted_price = float(prediction[0])
    return round(predicted_price, 2)


if __name__ == "__main__":
    result = predict_price(
        crop_type="Banana",
        historical_price=4500,
        season="Monsoon",
        location="Palghar",
        demand=0.8,
        production_quantity=500,
    )
    print(f"Sample prediction: ₹{result}")
