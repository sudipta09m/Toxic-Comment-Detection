#  ------------------- m --------------------

# app.py — lazy-loading, GPU-aware Flask + status endpoint
from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import logging
import os
import time

app = Flask(__name__)
CORS(app)
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

SAVE_DIRECTORY = "./toxic_comment_model"
MODEL_LOCK = threading.Lock()

# model state: "not_loaded", "loading", "ready", "error"
MODEL_STATE = {"state": "not_loaded", "error": None}
toxic_pipe = None

# decide device: GPU 0 if cuda available, else CPU (-1)
USE_CUDA = False
DEVICE = -1
try:
    import torch  # light import to check cuda availability only
    USE_CUDA = torch.cuda.is_available()
    DEVICE = 0 if USE_CUDA else -1
except Exception:
    USE_CUDA = False
    DEVICE = -1

log.info("CUDA available: %s, using device: %s", USE_CUDA, DEVICE)

def load_model():
    """
    Loads the HF pipeline into the global toxic_pipe.
    This function acquires MODEL_LOCK to avoid duplicate loads.
    """
    global toxic_pipe, MODEL_STATE
    with MODEL_LOCK:
        if MODEL_STATE["state"] == "ready":
            log.info("Model already loaded.")
            return
        MODEL_STATE["state"] = "loading"
        MODEL_STATE["error"] = None
        try:
            # import inside the function so module import stays fast
            from transformers import pipeline
            log.info("Loading model pipeline from %s ... (this may take a while)", SAVE_DIRECTORY)
            toxic_pipe = pipeline(
                "text-classification",
                model=SAVE_DIRECTORY,
                truncation=True,
                device=DEVICE
            )
            MODEL_STATE["state"] = "ready"
            log.info("Model loaded successfully.")
        except Exception as e:
            MODEL_STATE["state"] = "error"
            MODEL_STATE["error"] = str(e)
            toxic_pipe = None
            log.exception("Failed to load model: %s", e)
            # propagate for immediate callers if desired; here we keep state and return

@app.route("/predict", methods=["POST"])
def predict():
    global toxic_pipe, MODEL_STATE

    # If model not loaded yet, attempt to load synchronously.
    # If model is currently being loaded by another thread, return 503 to indicate busy.
    if MODEL_STATE["state"] == "not_loaded":
        log.info("Model not loaded; loading synchronously for incoming request.")
        try:
            load_model()
        except Exception as e:
            # load_model already records error in MODEL_STATE, but return a 500 here as well
            return jsonify({"error": "model load failed", "detail": str(e)}), 500

    if MODEL_STATE["state"] == "loading":
        # Another thread is already loading the model — avoid waiting here to keep requests responsive.
        return jsonify({"error": "model is currently loading, please retry shortly"}), 503

    if MODEL_STATE["state"] == "error":
        return jsonify({"error": "model failed to load", "detail": MODEL_STATE["error"]}), 500

    # at this point model is ready
    payload = request.get_json(force=True, silent=True) or {}
    comments = payload.get("comments", [])
    if not isinstance(comments, list):
        return jsonify({"error": "expected 'comments' as list"}), 400

    preds = []
    for text in comments:
        try:
            out = toxic_pipe(text)
            preds.append(out[0] if isinstance(out, list) and out else out)
        except Exception as e:
            log.exception("prediction error")
            preds.append({"error": str(e), "label": None, "score": 0.0})

    return jsonify({"predictions": preds})

@app.route("/status", methods=["GET"])
def status():
    """Return model state and a small health-check."""
    return jsonify({
        "model_state": MODEL_STATE["state"],
        "error": MODEL_STATE["error"],
        "cuda_available": USE_CUDA,
        "device": DEVICE
    })

def background_warmup():
    """
    Optional: call this if you want the server to start fast and begin loading the model in background.
    If you prefer on-demand loading (load at first /predict), comment the thread start in __main__.
    """
    log.info("Background warmup thread sleeping 1s then starting model load...")
    time.sleep(1)
    try:
        load_model()
    except Exception:
        log.exception("Background warmup failed")

if __name__ == "__main__":
    # If you want background warmup (load model while app is up), start a thread here.
    # If you prefer no background load, comment out the two lines below.
    t = threading.Thread(target=background_warmup, daemon=True)
    t.start()

    # listen on all interfaces
    app.run(host="0.0.0.0", port=5000, debug=True)
