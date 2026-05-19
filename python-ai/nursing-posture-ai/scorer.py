"""
scorer.py - Nursing Posture AI Core Scoring Engine
---------------------------------------------------
Shared by both main.py (CLI) and app.py (web upload).
For nursing training and supervision only - not a medical diagnosis.
"""

import cv2
import mediapipe as mp
import json
import math
import os
from datetime import datetime

# ── mediapipe Tasks API ───────────────────────────────────────────────────────
BaseOptions           = mp.tasks.BaseOptions
PoseLandmarker        = mp.tasks.vision.PoseLandmarker
PoseLandmarkerOptions = mp.tasks.vision.PoseLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

DISCLAIMER = (
    "For nursing training and supervisor review only. "
    "Do NOT use as medical diagnosis. "
    "Final judgment must be done by a supervisor or registered nurse."
)

POSTURE_TYPES = {
    "left_turning": {
        "label":       "Patient Turning - Left Side-Lying",
        "icon":        "↺",
        "description": "Patient positioned in left lateral decubitus (side-lying) for pressure injury prevention.",
    },
    "right_turning": {
        "label":       "Patient Turning - Right Side-Lying",
        "icon":        "↻",
        "description": "Patient positioned in right lateral decubitus (side-lying) for pressure injury prevention.",
    },
    "sitting_posture": {
        "label":       "Sitting Posture Assessment",
        "icon":        "🪑",
        "description": "Patient seated upright; assessing spinal alignment, head position, and weight distribution.",
    },
    "rehabilitation_standing": {
        "label":       "Rehabilitation Standing Assessment",
        "icon":        "🧍",
        "description": "Patient in standing posture during rehabilitation; assessing balance, alignment, and joint loading.",
    },
    "wheelchair_posture": {
        "label":       "Wheelchair Posture Assessment",
        "icon":        "♿",
        "description": "Patient seated in wheelchair; assessing trunk support, head control, and pressure distribution.",
    },
}

RISK_LEVELS = {
    "A": {"label": "Low Risk",      "color": "#16a34a", "bg": "#dcfce7"},
    "B": {"label": "Monitor",       "color": "#2563eb", "bg": "#dbeafe"},
    "C": {"label": "At Risk",       "color": "#d97706", "bg": "#fef3c7"},
    "D": {"label": "Critical Risk", "color": "#dc2626", "bg": "#fee2e2"},
}

STATUS_LABELS = {
    "A": "Excellent - meets all clinical standards",
    "B": "Good - basic standards acceptable",
    "C": "Needs improvement - follow suggestions below",
    "D": "Poor - immediate correction required",
}

GRADE_COLORS = {
    "A": (0, 220, 80),
    "B": (0, 200, 255),
    "C": (0, 165, 255),
    "D": (0, 60, 220),
}

POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7),
    (0, 4), (4, 5), (5, 6), (6, 8),
    (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24),
    (23, 25), (25, 27), (27, 29), (27, 31), (29, 31),
    (24, 26), (26, 28), (28, 30), (28, 32), (30, 32),
]

_SUGGESTION_MAP = {
    "side_lying_position": (
        0.80,
        "Reposition to a full side-lying position (30-60 degrees lateral rotation). "
        "Use a wedge pillow behind the back to maintain the angle."
    ),
    "shoulder_hip_alignment": (
        0.80,
        "Adjust positioning so that the shoulder line and hip line are parallel. "
        "Avoid torso twisting, which increases shear stress and pressure injury risk."
    ),
    "head_support": (
        0.80,
        "Adjust pillow height to maintain neutral cervical alignment. "
        "The ear should be level with the shoulder with no lateral neck bend."
    ),
    "back_support": (
        0.80,
        "Place a firm wedge or folded pillow along the patient's back to maintain "
        "spinal alignment and prevent rolling back to supine."
    ),
    "leg_separation_support": (
        0.80,
        "Insert a pillow between the knees and ankles to eliminate pressure "
        "between bony prominences (medial condyles and medial malleoli)."
    ),
    "pressure_area_protection": (
        0.80,
        "Elevate heels off the mattress using a heel-relief device or pillow under "
        "the calves. Inspect and pad bony prominences at the trochanter and shoulder."
    ),
}


# ══════════════════════════════════════════════════════════════════════════════
#  SCORING HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _line_angle(a, b):
    return math.degrees(math.atan2(b.y - a.y, b.x - a.x))

def _z_gap(a, b):
    return abs(a.z - b.z)


# ══════════════════════════════════════════════════════════════════════════════
#  SIX SCORING CRITERIA
# ══════════════════════════════════════════════════════════════════════════════

def score_side_lying_position(lm):
    combined = (_z_gap(lm[11], lm[12]) + _z_gap(lm[23], lm[24])) / 2 * 0.70 \
               + abs(lm[11].y - lm[12].y) * 0.30
    if   combined >= 0.18: return 30, "Excellent - clearly side-lying"
    elif combined >= 0.12: return 23, "Good - approximately 45 degrees lateral rotation"
    elif combined >= 0.06: return 15, "Fair - approximately 30 degrees lateral tilt"
    elif combined >= 0.02: return  8, "Minimal lateral rotation detected"
    else:                  return  3, "Body appears supine/prone - not side-lying"


def score_shoulder_hip_alignment(lm):
    diff = abs(_line_angle(lm[11], lm[12]) - _line_angle(lm[23], lm[24])) % 180
    if diff > 90: diff = 180 - diff
    if   diff <= 5:  return 20, "Excellent - shoulder and hip lines parallel"
    elif diff <= 12: return 16, "Good - minor angular difference"
    elif diff <= 25: return 10, "Moderate - misalignment risk; monitor for spinal twist"
    else:            return  4, "Poor - significant axial twist detected"


def score_head_support(lm):
    diff = abs(lm[0].y - (lm[7].y + lm[8].y) / 2)
    ear_above = (lm[11].y + lm[12].y) / 2 > (lm[7].y + lm[8].y) / 2
    if   diff < 0.04 and ear_above: return 15, "Excellent - head in neutral position"
    elif diff < 0.08:               return 12, "Good - slight head deviation"
    elif diff < 0.14:               return  8, "Fair - head may not be fully supported"
    else:                           return  4, "Poor - hyperflexion or hyperextension present"


def score_back_support(lm):
    s_x = (lm[11].x + lm[12].x) / 2
    k_x = (lm[25].x + lm[26].x) / 2
    dev = abs((lm[23].x + lm[24].x) / 2 - (s_x + k_x) / 2)
    if   dev < 0.02: return 15, "Excellent - spine well aligned"
    elif dev < 0.05: return 12, "Good - minimal lateral deviation"
    elif dev < 0.10: return  8, "Moderate - lateral curvature present"
    else:            return  4, "Poor - significant spinal curvature"


def score_leg_separation(lm):
    combined = abs(lm[25].x - lm[26].x) * 0.60 + _z_gap(lm[25], lm[26]) * 0.40
    if   combined >= 0.15: return 10, "Excellent - legs well separated"
    elif combined >= 0.08: return  8, "Good - adequate knee separation"
    elif combined >= 0.04: return  5, "Fair - partial separation only"
    else:                  return  2, "Poor - legs together; bony pressure risk"


def score_pressure_area_protection(lm):
    avg_z  = (_z_gap(lm[27], lm[28]) + _z_gap(lm[29], lm[30])) / 2
    heel_v = (lm[29].visibility + lm[30].visibility) / 2
    if   avg_z >= 0.10 and heel_v >= 0.60: return 10, "Excellent - heels and ankles properly positioned"
    elif avg_z >= 0.06 or  heel_v >= 0.50: return  8, "Good - minor pressure area concern"
    elif avg_z >= 0.03:                    return  5, "Fair - monitor heel and ankle pressure points"
    else:                                  return  2, "Poor - potential pressure injury risk at heels/ankles"


# ══════════════════════════════════════════════════════════════════════════════
#  GRADE / OBSERVATION / SUGGESTIONS
# ══════════════════════════════════════════════════════════════════════════════

def assign_grade(total, grades_cfg):
    for grade, rng in grades_cfg.items():
        if rng["min"] <= total <= rng["max"]:
            return grade, rng["label"]
    return "D", "Poor - Immediate Correction Required"


def generate_ai_observation(breakdown):
    parts = []
    s1, _, _ = breakdown["side_lying_position"]
    s2, _, _ = breakdown["shoulder_hip_alignment"]
    s3, _, _ = breakdown["head_support"]
    s4, _, _ = breakdown["back_support"]
    s5, _, _ = breakdown["leg_separation_support"]
    s6, _, _ = breakdown["pressure_area_protection"]

    parts.append(
        "The patient is clearly in a proper side-lying posture, meeting the clinical standard for lateral body rotation."
        if s1 == 30 else
        "The patient shows good lateral rotation (approximately 45 degrees), approaching full side-lying."
        if s1 >= 23 else
        "The patient shows partial lateral tilt (~30 degrees). A more complete side-lying position is recommended."
        if s1 >= 15 else
        "The patient does not appear to be in a proper side-lying position. Immediate repositioning is required."
    )
    parts.append(
        "Shoulder-hip alignment is excellent with no axial spinal twist detected."
        if s2 >= 16 else
        "Shoulder-hip misalignment is present, increasing shear stress and pressure injury risk at the sacrum and trochanters."
    )
    parts.append(
        "Head and neck positioning is adequate, indicating appropriate pillow height."
        if s3 >= 12 else
        "Head and neck deviation detected, suggesting insufficient or incorrectly positioned pillow support."
    )
    parts.append(
        "The spine appears well supported with minimal lateral curvature."
        if s4 >= 12 else
        "Lateral spinal curvature detected. A wedge pillow behind the back is recommended."
    )
    parts.append(
        "Leg separation is adequate, reducing contact pressure between medial knee condyles and malleoli."
        if s5 >= 8 else
        "Insufficient leg separation detected. A pillow between the knees and ankles is recommended."
    )
    parts.append(
        "Heel and ankle positioning appears satisfactory with no evident direct surface compression."
        if s6 >= 8 else
        "Potential pressure area risk detected at the heels or ankles. Elevation or heel-relief padding is advised."
    )
    return " ".join(parts)


def generate_suggestions(breakdown):
    suggestions = []
    for criterion, (pts, max_pts, _) in breakdown.items():
        threshold, text = _SUGGESTION_MAP.get(criterion, (0.80, ""))
        if text and (pts / max_pts) < threshold:
            suggestions.append(text)
    if not suggestions:
        suggestions.append(
            "All criteria meet or exceed the acceptable standard. "
            "Continue current positioning technique and reassess in 2 hours."
        )
    return suggestions


# ══════════════════════════════════════════════════════════════════════════════
#  POSE DETECTION + FULL ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

def analyze_image(image_path, settings, model_path="pose_landmarker.task"):
    """
    Run full pose detection and scoring on an image.
    Returns (result_dict, error_string). On success error_string is None.
    """
    image = cv2.imread(image_path)
    if image is None:
        return None, f"Cannot read image file: {image_path}"

    options = PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.IMAGE,
    )
    with PoseLandmarker.create_from_options(options) as landmarker:
        rgb      = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result   = landmarker.detect(mp_image)

    if not result.pose_landmarks:
        return None, "No human pose detected in the uploaded image."

    lm = result.pose_landmarks[0]

    s1, d1 = score_side_lying_position(lm)
    s2, d2 = score_shoulder_hip_alignment(lm)
    s3, d3 = score_head_support(lm)
    s4, d4 = score_back_support(lm)
    s5, d5 = score_leg_separation(lm)
    s6, d6 = score_pressure_area_protection(lm)

    breakdown = {
        "side_lying_position":      (s1, 30, d1),
        "shoulder_hip_alignment":   (s2, 20, d2),
        "head_support":             (s3, 15, d3),
        "back_support":             (s4, 15, d4),
        "leg_separation_support":   (s5, 10, d5),
        "pressure_area_protection": (s6, 10, d6),
    }

    total       = sum(pts for pts, _, _ in breakdown.values())
    grade, grade_label = assign_grade(total, settings["grades"])
    observation = generate_ai_observation(breakdown)
    suggestions = generate_suggestions(breakdown)

    return {
        "image":       image,
        "landmarks":   lm,
        "breakdown":   breakdown,
        "total":       total,
        "grade":       grade,
        "grade_label": grade_label,
        "status":      STATUS_LABELS.get(grade, ""),
        "observation": observation,
        "suggestions": suggestions,
    }, None


# ══════════════════════════════════════════════════════════════════════════════
#  IMAGE ANNOTATION
# ══════════════════════════════════════════════════════════════════════════════

def draw_skeleton(image, landmarks):
    h, w = image.shape[:2]
    for s, e in POSE_CONNECTIONS:
        if s >= len(landmarks) or e >= len(landmarks):
            continue
        cv2.line(image,
                 (int(landmarks[s].x * w), int(landmarks[s].y * h)),
                 (int(landmarks[e].x * w), int(landmarks[e].y * h)),
                 (0, 128, 255), 2)
    for lm in landmarks:
        cx, cy = int(lm.x * w), int(lm.y * h)
        cv2.circle(image, (cx, cy), 5, (0, 235, 80), -1)
        cv2.circle(image, (cx, cy), 5, (255, 255, 255), 1)


def draw_score_panel(image, total, grade, grade_label, breakdown):
    h, w    = image.shape[:2]
    panel_w = 310
    panel_h = 55 + len(breakdown) * 30 + 50
    x0, y0  = w - panel_w - 12, 12
    x1, y1  = w - 12, y0 + panel_h

    overlay = image.copy()
    cv2.rectangle(overlay, (x0, y0), (x1, y1), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.72, image, 0.28, 0, image)

    color = GRADE_COLORS.get(grade, (200, 200, 200))
    tx, ty = x0 + 10, y0 + 26
    cv2.putText(image, f"Score: {total}/100   Grade: {grade} - {grade_label}",
                (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.50, color, 2)
    ty += 8
    cv2.line(image, (x0 + 8, ty), (x1 - 8, ty), (60, 60, 60), 1)
    ty += 20

    for criterion, (pts, max_pts, _) in breakdown.items():
        pct   = pts / max_pts
        bcolor = (0, 200, 80)  if pct >= 0.80 else \
                 (0, 200, 230) if pct >= 0.60 else \
                 (0, 140, 255) if pct >= 0.40 else (0, 60, 200)
        cv2.putText(image, f"{criterion.replace('_', ' ').title()}: {pts}/{max_pts}",
                    (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (210, 210, 210), 1)
        ty += 22
        bx1 = tx + int((panel_w - 30) * pct)
        cv2.rectangle(image, (tx, ty - 8), (tx + panel_w - 30, ty - 2), (45, 45, 45), -1)
        if bx1 > tx:
            cv2.rectangle(image, (tx, ty - 8), (bx1, ty - 2), bcolor, -1)
        ty += 8

    ty += 6
    cv2.line(image, (x0 + 8, ty), (x1 - 8, ty), (50, 50, 50), 1)
    ty += 16
    cv2.putText(image, "Training use only - not a medical diagnosis",
                (tx, ty), cv2.FONT_HERSHEY_SIMPLEX, 0.30, (100, 100, 100), 1)


# ══════════════════════════════════════════════════════════════════════════════
#  REPORT WRITERS
# ══════════════════════════════════════════════════════════════════════════════

def save_json_report(path, patient_name, nurse_name, dt_str,
                     image_file, total, grade, grade_label,
                     breakdown, observation, suggestions,
                     posture_type="left_turning"):
    pt_info = POSTURE_TYPES.get(posture_type, POSTURE_TYPES["left_turning"])
    report = {
        "disclaimer":          DISCLAIMER,
        "assessment_type":     pt_info["label"],
        "posture_type":        posture_type,
        "review_required":     True,
        "supervisor_reviewed": False,
        "supervisor_comment":  "",
        "patient_name":        patient_name,
        "nurse_name":          nurse_name,
        "date_time":           dt_str,
        "image_file":          image_file,
        "score":               total,
        "max_score":           100,
        "grade":               grade,
        "grade_label":         grade_label,
        "status":              STATUS_LABELS.get(grade, ""),
        "scoring_items": {
            k: {
                "score":      pts,
                "max_score":  max_pts,
                "percentage": round(pts / max_pts * 100, 1),
                "detail":     detail,
            }
            for k, (pts, max_pts, detail) in breakdown.items()
        },
        "ai_observation":          observation,
        "improvement_suggestions": suggestions,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


def save_txt_report(path, patient_name, nurse_name, dt_str,
                    image_file, total, grade, grade_label,
                    breakdown, observation, suggestions,
                    posture_type="left_turning"):
    W   = 65
    SEP = "=" * W
    LIN = "-" * W

    def wrap(text, indent="  "):
        words, lines, buf, col = text.split(), [], indent, len(indent)
        for w in words:
            if col + len(w) + 1 > W - 2:
                lines.append(buf)
                buf, col = indent + w + " ", len(indent) + len(w) + 1
            else:
                buf += w + " "
                col += len(w) + 1
        if buf.strip():
            lines.append(buf)
        return lines

    pt_label = POSTURE_TYPES.get(posture_type, POSTURE_TYPES["left_turning"])["label"]
    rows = [
        SEP,
        "  NURSING POSTURE ASSESSMENT REPORT",
        f"  {pt_label}",
        SEP,
        f"  Patient Name : {patient_name}",
        f"  Nurse Name   : {nurse_name}",
        f"  Date / Time  : {dt_str}",
        f"  Image File   : {image_file}",
        LIN,
        f"  SCORE  :  {total} / 100",
        f"  GRADE  :  {grade}  ({grade_label})",
        f"  STATUS :  {STATUS_LABELS.get(grade, '')}",
        LIN,
        "  SCORING ITEMS",
        LIN,
    ]
    for i, (k, (pts, max_pts, detail)) in enumerate(breakdown.items(), 1):
        rows.append(f"  {i}. {k.replace('_',' ').title():<32} {pts:>3} / {max_pts}   {detail}")

    rows += [LIN, "  AI OBSERVATION", LIN]
    rows += wrap(observation)

    rows += [LIN, "  IMPROVEMENT SUGGESTIONS", LIN]
    for i, sug in enumerate(suggestions, 1):
        rows += wrap(sug, indent=f"  {i}. ")

    rows += [
        LIN,
        "  REVIEW REQUIRED  :  YES",
        "  SUPERVISOR COMMENT:",
        "  " + "_" * 61,
        "  " + "_" * 61,
        "  " + "_" * 61,
        SEP,
        "  DISCLAIMER",
        LIN,
    ]
    rows += wrap(DISCLAIMER)
    rows.append(SEP)

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(rows) + "\n")
