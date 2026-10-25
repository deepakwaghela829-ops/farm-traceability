import os
import joblib
import pandas as pd

# Directory where this file resides
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "crop_price_data.csv")
MODEL_PATH = os.path.join(BASE_DIR, "models", "crop_price_model.pkl")

# Cached singleton model instance
_model = None
_benchmarks = None


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


def get_market_benchmarks() -> dict:
    """
    Loads historical market benchmarks (average historical_price, demand, season, location)
    from the dataset for auto-populating features when predicting for a registered crop.
    """
    global _benchmarks
    if _benchmarks is not None:
        return _benchmarks

    if not os.path.exists(DATA_PATH):
        return {}

    df = pd.read_csv(DATA_PATH)
    benchmarks = {}
    for crop, group in df.groupby("crop_type"):
        avg_quintal = float(round(group["historical_price"].mean(), 2))
        avg_kg = float(round(avg_quintal / 100.0, 2))
        benchmarks[crop.strip().lower()] = {
            "crop_type": crop,
            "avg_historical_price": avg_quintal,
            "avg_historical_price_per_quintal": avg_quintal,
            "avg_historical_price_per_kg": avg_kg,
            "avg_demand": float(round(group["demand"].mean(), 2)),
            "default_season": group["season"].mode().iloc[0] if not group["season"].empty else "Monsoon",
            "default_location": group["location"].mode().iloc[0] if not group["location"].empty else "Palghar",
            "avg_production_quantity": float(round(group["production_quantity"].mean(), 2)),
        }

    # Overall dataset fallbacks
    overall_quintal = float(round(df["historical_price"].mean(), 2))
    overall_kg = float(round(overall_quintal / 100.0, 2))
    overall = {
        "crop_type": "General",
        "avg_historical_price": overall_quintal,
        "avg_historical_price_per_quintal": overall_quintal,
        "avg_historical_price_per_kg": overall_kg,
        "avg_demand": float(round(df["demand"].mean(), 2)),
        "default_season": "Monsoon",
        "default_location": "Palghar",
        "avg_production_quantity": float(round(df["production_quantity"].mean(), 2)),
    }
    benchmarks["__default__"] = overall
    _benchmarks = benchmarks
    return _benchmarks


def predict_price(
    crop_type: str,
    historical_price: float,
    season: str,
    location: str,
    demand: float,
    production_quantity: float,
    output_unit: str = "kg",
) -> float:
    """
    Predict crop price using the trained Random Forest ML pipeline.

    The model was trained on APMC market benchmarks in INR per quintal (1 quintal = 100 kg).
    - If historical_price < 200, it is treated as INR/kg and scaled to quintal for the model.
    - If historical_price >= 200, it is treated as INR/quintal directly.
    - If output_unit == "kg" (default), converts the quintal prediction to INR/kg (/ 100).
    - If output_unit == "quintal", returns INR/quintal directly.
    """
    model = get_model()

    model_historical_price = float(historical_price)
    if model_historical_price < 200.0:
        model_historical_price = model_historical_price * 100.0

    input_data = pd.DataFrame(
        [
            {
                "crop_type": crop_type,
                "historical_price": model_historical_price,
                "season": season,
                "location": location,
                "demand": demand,
                "production_quantity": production_quantity,
            }
        ]
    )

    prediction = model.predict(input_data)
    predicted_quintal = float(prediction[0])

    if output_unit == "quintal":
        return round(predicted_quintal, 2)
    # Default is per kg (1 quintal = 100 kg)
    return round(predicted_quintal / 100.0, 2)


def predict_price_breakdown(
    crop_type: str,
    historical_price: float,
    season: str,
    location: str,
    demand: float,
    production_quantity: float,
) -> dict:
    price_kg = predict_price(
        crop_type=crop_type,
        historical_price=historical_price,
        season=season,
        location=location,
        demand=demand,
        production_quantity=production_quantity,
        output_unit="kg",
    )
    price_quintal = round(price_kg * 100.0, 2)
    return {
        "price_per_kg": price_kg,
        "price_per_quintal": price_quintal,
    }


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
