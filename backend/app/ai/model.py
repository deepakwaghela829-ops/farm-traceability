import os
import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

# =========================================================
# 1. DEFINE FILE PATHS
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "data", "crop_price_data.csv")
MODEL_DIR = os.path.join(BASE_DIR, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "crop_price_model.pkl")


def train_and_save_model():
    """
    Trains the Random Forest regression model on crop_price_data.csv
    and saves the fitted pipeline to models/crop_price_model.pkl.
    """
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Training dataset not found at {DATA_PATH}")

    print("Loading dataset...")
    df = pd.read_csv(DATA_PATH)
    print(f"Number of records: {len(df)}")

    # Input features and target
    X = df[
        [
            "crop_type",
            "historical_price",
            "season",
            "location",
            "demand",
            "production_quantity",
        ]
    ]
    y = df["target_price"]

    categorical_features = ["crop_type", "season", "location"]
    numerical_features = ["historical_price", "demand", "production_quantity"]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                categorical_features,
            )
        ],
        remainder="passthrough",
    )

    model = RandomForestRegressor(
        n_estimators=200,
        random_state=42,
        max_depth=8,
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42
    )

    print("Training Random Forest regression model...")
    pipeline.fit(X_train, y_train)

    predictions = pipeline.predict(X_test)
    mae = mean_absolute_error(y_test, predictions)
    mse = mean_squared_error(y_test, predictions)
    rmse = mse**0.5
    r2 = r2_score(y_test, predictions)

    print("-----------------------------")
    print("MODEL EVALUATION (Training Holdout)")
    print("-----------------------------")
    print(f"MAE  : {mae:.2f}")
    print(f"RMSE : {rmse:.2f}")
    print(f"R2   : {r2:.4f}")
    print("-----------------------------")

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    print(f"Model saved to: {MODEL_PATH}")
    return pipeline


if __name__ == "__main__":
    train_and_save_model()
