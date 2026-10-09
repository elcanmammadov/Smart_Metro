import cv2
import numpy as np


def non_max_suppression(boxes, overlap_thresh=0.65):
    """
    Üst-üstə düşən eyni insan qutularını birləşdirmək/silmək üçün sadə NMS.
    """
    if len(boxes) == 0:
        return []

    boxes = np.array(boxes, dtype=float)

    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 0] + boxes[:, 2]
    y2 = boxes[:, 1] + boxes[:, 3]

    area = (x2 - x1 + 1) * (y2 - y1 + 1)
    indexes = np.argsort(y2)

    picked = []

    while len(indexes) > 0:
        last = len(indexes) - 1
        i = indexes[last]
        picked.append(i)

        xx1 = np.maximum(x1[i], x1[indexes[:last]])
        yy1 = np.maximum(y1[i], y1[indexes[:last]])
        xx2 = np.minimum(x2[i], x2[indexes[:last]])
        yy2 = np.minimum(y2[i], y2[indexes[:last]])

        w = np.maximum(0, xx2 - xx1 + 1)
        h = np.maximum(0, yy2 - yy1 + 1)

        overlap = (w * h) / area[indexes[:last]]

        indexes = np.delete(
            indexes,
            np.concatenate(([last], np.where(overlap > overlap_thresh)[0]))
        )

    return boxes[picked].astype(int)


# Kamera açılır
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("Kamera açıla bilmədi.")
    exit()

# HOG insan detektoru
hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

while True:
    ret, frame = cap.read()

    if not ret:
        print("Kameradan görüntü alınmadı.")
        break

    # Sürəti artırmaq üçün ölçünü bir az kiçildirik
    frame = cv2.resize(frame, (800, 600))

    # İnsanları tap
    boxes, weights = hog.detectMultiScale(
        frame,
        winStride=(8, 8),
        padding=(16, 16),
        scale=1.05
    )

    # Təkrar qutuları azalt
    boxes = non_max_suppression(boxes)

    # İnsan sayını hesabla
    person_count = len(boxes)

    # Qutuları çək
    for (x, y, w, h) in boxes:
        cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.putText(
            frame,
            "Insan",
            (x, y - 10),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

    # Sayı ekranda göstərilir
    cv2.putText(
        frame,
        f"Insan sayi: {person_count}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.2,
        (0, 0, 255),
        3
    )

    cv2.imshow("Insan sayan kamera", frame)

    # Çıxmaq üçün Q düyməsi
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()