"""
main.py - Nursing Posture AI CLI
---------------------------------
For nursing training and supervisor review only.
Do NOT use as medical diagnosis.

Usage:
    python main.py
    python main.py --patient "Bed-3 Patient" --nurse "Nurse Wang"
    python main.py --image photo.jpg --patient "Bed-3 Patient" --nurse "Nurse Wang"
"""

import argparse
import cv2
import json
import os
from datetime import datetime

from scorer import (
    analyze_image, draw_skeleton, draw_score_panel,
    save_json_report, save_txt_report,
    DISCLAIMER, STATUS_LABELS,
)

MODEL_PATH    = "pose_landmarker.task"
SETTINGS_PATH = "scoring_settings.json"
REPORTS_DIR   = "reports"


def parse_args():
    p = argparse.ArgumentParser(description="Nursing Posture AI - Patient Turning Assessment")
    p.add_argument("--image",   default="test.jpg",    help="Input image file (default: test.jpg)")
    p.add_argument("--patient", default="Patient-001", help="Patient name or ID")
    p.add_argument("--nurse",   default="Nurse-001",   help="Nurse name or ID")
    return p.parse_args()


def main():
    args = parse_args()

    with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
        settings = json.load(f)

    result, error = analyze_image(args.image, settings, MODEL_PATH)
    if error:
        print(f"[ERROR] {error}")
        return

    breakdown   = result["breakdown"]
    total       = result["total"]
    grade       = result["grade"]
    grade_label = result["grade_label"]
    status      = result["status"]
    observation = result["observation"]
    suggestions = result["suggestions"]
    image       = result["image"]
    landmarks   = result["landmarks"]

    dt_now = datetime.now()
    dt_str = dt_now.strftime("%Y-%m-%d %H:%M:%S")
    ts     = dt_now.strftime("%Y%m%d_%H%M%S")

    # ── Console output ────────────────────────────────────────────────────────
    W = 65
    print("=" * W)
    print("  NURSING POSTURE ASSESSMENT - PATIENT TURNING")
    print("=" * W)
    print(f"  Patient : {args.patient}")
    print(f"  Nurse   : {args.nurse}")
    print(f"  Time    : {dt_str}")
    print("-" * W)
    print(f"  {'Criterion':<34} {'Score':>6}   Detail")
    print("-" * W)
    for i, (crit, (pts, max_pts, detail)) in enumerate(breakdown.items(), 1):
        print(f"  {i}. {crit.replace('_',' ').title():<32} {pts:>3}/{max_pts:<3}  {detail}")
    print("-" * W)
    print(f"  {'TOTAL SCORE':<34} {total:>3}/100")
    print(f"  {'GRADE':<34} {grade}  ({grade_label})")
    print(f"  {'STATUS':<34} {status}")
    print("=" * W)
    print(f"\n  AI Observation:\n  {observation}\n")
    if suggestions:
        print("  Improvement Suggestions:")
        for i, s in enumerate(suggestions, 1):
            print(f"  {i}. {s}")
    print()

    # ── Annotated output image ────────────────────────────────────────────────
    draw_skeleton(image, landmarks)
    draw_score_panel(image, total, grade, grade_label, breakdown)
    output_ts  = f"output_{ts}.jpg"
    cv2.imwrite(output_ts, image)
    cv2.imwrite("output.jpg", image)

    # ── Reports ───────────────────────────────────────────────────────────────
    os.makedirs(REPORTS_DIR, exist_ok=True)
    json_path   = os.path.join(REPORTS_DIR, f"posture_report_{ts}.json")
    txt_path    = os.path.join(REPORTS_DIR, f"posture_report_{ts}.txt")
    json_latest = os.path.join(REPORTS_DIR, "posture_report.json")
    txt_latest  = os.path.join(REPORTS_DIR, "posture_report.txt")

    for jp in (json_path, json_latest):
        save_json_report(jp, args.patient, args.nurse, dt_str,
                         args.image, total, grade, grade_label,
                         breakdown, observation, suggestions)

    for tp in (txt_path, txt_latest):
        save_txt_report(tp, args.patient, args.nurse, dt_str,
                        args.image, total, grade, grade_label,
                        breakdown, observation, suggestions)

    print(f"  Annotated image  -> {output_ts}  (also output.jpg)")
    print(f"  JSON report      -> {json_path}")
    print(f"  TXT  report      -> {txt_path}")
    print(f"\n  ** REVIEW REQUIRED - supervisor or registered nurse must sign off **\n")


if __name__ == "__main__":
    main()
