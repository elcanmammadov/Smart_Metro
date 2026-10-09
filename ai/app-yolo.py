import cv2
import json
import os
import ssl
import time
import urllib.error
import urllib.request
from pathlib import Path
from ultralytics import YOLO

# Daha sürətli: yolov8n.pt
# Daha dəqiq, amma bir az ağır: yolov8s.pt
BASE_DIR = Path(__file__).resolve().parent
model = YOLO(str(BASE_DIR / "yolov8n.pt"))

API_URL = os.getenv(
    "SMARTMETRO_WAGON_API_URL",
    "https://smartmetro.hewart.az/api/train_wagon_counts.php",
)
API_KEY = os.getenv("SMARTMETRO_WAGON_API_KEY", "salam123")
TRAIN_NUMBER = os.getenv("SMARTMETRO_TRAIN_NUMBER", "T-001")
STATION_ID = int(os.getenv("SMARTMETRO_STATION_ID", "3"))
WAGON_NUMBER = int(os.getenv("SMARTMETRO_WAGON_NUMBER", "4"))
WAGON_CAPACITY = int(os.getenv("SMARTMETRO_WAGON_CAPACITY", "120"))
POST_INTERVAL_SECONDS = float(os.getenv("SMARTMETRO_POST_INTERVAL_SECONDS", "5"))
ALLOW_INSECURE_SSL = os.getenv("SMARTMETRO_ALLOW_INSECURE_SSL", "0") == "1"

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Kamera açıla bilmədi.")
    exit()

# Kamera ölçüsü
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

# Qutu sabitləşdirmə üçün yaddaş
smooth_boxes = {}

# 0.0 - çox yumşaq, 1.0 - sabitləşdirmə yoxdur
SMOOTHING = 0.65

# Yalnız bu qədər kadr görünməyən ID yaddaşda qalsın
missing_counter = {}
MAX_MISSING = 15
last_post_at = 0
last_post_status = "API: gozleyir"


def build_ssl_context():
    if ALLOW_INSECURE_SSL:
        return ssl._create_unverified_context()

    cafile = os.getenv("SMARTMETRO_SSL_CAFILE")
    if cafile:
        return ssl.create_default_context(cafile=cafile)

    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def smooth_box(track_id, new_box):
    """
    Qutuların titrəməsini azaltmaq üçün sadə EMA filter.
    """
    if track_id not in smooth_boxes:
        smooth_boxes[track_id] = new_box
        return new_box

    old_box = smooth_boxes[track_id]

    smoothed = [
        int(old_box[i] * SMOOTHING + new_box[i] * (1 - SMOOTHING))
        for i in range(4)
    ]

    smooth_boxes[track_id] = smoothed
    return smoothed


def post_wagon_count(person_count):
    payload = {
        "api_key": API_KEY,
        "action": "insert",
        "train_number": TRAIN_NUMBER,
        "station_id": STATION_ID,
        "wagon_number": WAGON_NUMBER,
        "wagon_capacity": WAGON_CAPACITY,
        "current_people_count": min(person_count, WAGON_CAPACITY),
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=4, context=build_ssl_context()) as res:
        body = json.loads(res.read().decode("utf-8"))
        if not body.get("success"):
            raise RuntimeError(body.get("message") or "API xetasi")
        return body


while True:
    ret, frame = cap.read()

    if not ret:
        print("Kameradan görüntü alınmadı.")
        break

    # YOLO tracking
    results = model.track(
        frame,
        persist=True,
        classes=[0],          # COCO dataset-də 0 = person
        conf=0.45,            # Güvən səviyyəsi. Artırsan daha az səhv tapar.
        iou=0.5,
        imgsz=640,
        tracker="bytetrack.yaml",
        verbose=False
    )

    current_ids = set()

    if results and results[0].boxes is not None:
        boxes = results[0].boxes

        for box in boxes:
            if box.id is None:
                continue

            track_id = int(box.id[0])
            current_ids.add(track_id)
            missing_counter[track_id] = 0

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            conf = float(box.conf[0])

            x1, y1, x2, y2 = smooth_box(track_id, [x1, y1, x2, y2])

            # Qutu çək
            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (0, 255, 0),
                2
            )

            label = f"Insan ID:{track_id} {conf:.2f}"

            cv2.putText(
                frame,
                label,
                (x1, max(30, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (0, 255, 0),
                2
            )

    # Görünməyən köhnə ID-ləri təmizlə
    for track_id in list(smooth_boxes.keys()):
        if track_id not in current_ids:
            missing_counter[track_id] = missing_counter.get(track_id, 0) + 1

            if missing_counter[track_id] > MAX_MISSING:
                del smooth_boxes[track_id]
                del missing_counter[track_id]

    person_count = len(current_ids)

    now = time.time()
    if now - last_post_at >= POST_INTERVAL_SECONDS:
        last_post_at = now
        try:
            post_wagon_count(person_count)
            last_post_status = f"API: gonderildi ({person_count})"
        except (urllib.error.URLError, TimeoutError, RuntimeError, json.JSONDecodeError) as exc:
            last_post_status = f"API: xeta {exc}"

    cv2.putText(
        frame,
        f"Insan sayi: {person_count}",
        (30, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.4,
        (0, 0, 255),
        3
    )

    cv2.putText(
        frame,
        f"Qatar {TRAIN_NUMBER} | Stansiya {STATION_ID} | Vaqon {WAGON_NUMBER}",
        (30, 92),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2
    )

    cv2.putText(
        frame,
        last_post_status[:70],
        (30, 124),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 0),
        2
    )

    cv2.imshow("Stabil insan sayan kamera", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
