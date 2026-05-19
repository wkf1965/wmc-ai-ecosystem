"""
app.py - WMC Nursing Posture AI Web Server
-------------------------------------------
Nurse uploads a patient posture photo.
AI scores the posture and generates a full assessment report.

For nursing training and supervisor review only.
Do NOT use as medical diagnosis.

Run:
    venv/Scripts/python.exe app.py
Then open:
    http://localhost:5000
"""

import os
import cv2
import json
from datetime import datetime
from flask import (Flask, request, render_template,
                   send_from_directory, url_for, jsonify)
from werkzeug.utils import secure_filename

from scorer import (
    analyze_image, draw_skeleton, draw_score_panel,
    save_json_report, save_txt_report,
    DISCLAIMER, POSTURE_TYPES, RISK_LEVELS,
)
from overtime_routes import overtime_bp

# ── App setup ─────────────────────────────────────────────────────────────────
BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER   = os.path.join(BASE_DIR, "uploads")
REPORTS_FOLDER  = os.path.join(BASE_DIR, "reports")
OUTPUTS_FOLDER  = os.path.join(BASE_DIR, "static", "output_images")
MODEL_PATH      = os.path.join(BASE_DIR, "pose_landmarker.task")
SETTINGS_PATH   = os.path.join(BASE_DIR, "scoring_settings.json")
LOG_PATH        = os.path.join(BASE_DIR, "assessments_log.json")
ALLOWED_EXT     = {"jpg", "jpeg", "png", "bmp", "jfif"}
MAX_MB          = 16

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024

for folder in (UPLOAD_FOLDER, REPORTS_FOLDER, OUTPUTS_FOLDER):
    os.makedirs(folder, exist_ok=True)

with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
    SETTINGS = json.load(f)

app.register_blueprint(overtime_bp)


# ── Assessment log helpers ────────────────────────────────────────────────────

def load_log():
    if os.path.exists(LOG_PATH):
        with open(LOG_PATH, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []


def save_log(entries):
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2, ensure_ascii=False)


def append_assessment(entry):
    log = load_log()
    log.insert(0, entry)        # newest first
    log = log[:50]              # keep last 50
    save_log(log)


# ── File helper ───────────────────────────────────────────────────────────────

def allowed(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXT


# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("nurse_upload.html",
                           posture_types=POSTURE_TYPES)


@app.route("/upload", methods=["POST"])
def upload():
    nurse_name    = request.form.get("nurse_name",    "").strip() or "Unknown Nurse"
    patient_name  = request.form.get("patient_name",  "").strip() or "Unknown Patient"
    posture_type  = request.form.get("posture_type",  "left_turning")

    if posture_type not in POSTURE_TYPES:
        posture_type = "left_turning"

    # ── Validate file ────────────────────────────────────────────────────────
    if "image" not in request.files:
        return render_template("nurse_upload.html",
                               posture_types=POSTURE_TYPES,
                               error="No image file selected.")
    file = request.files["image"]
    if not file or file.filename == "":
        return render_template("nurse_upload.html",
                               posture_types=POSTURE_TYPES,
                               error="No image file selected.")
    if not allowed(file.filename):
        return render_template("nurse_upload.html",
                               posture_types=POSTURE_TYPES,
                               error="Invalid file type. Please upload JPG or PNG.")

    # ── Save with timestamp ──────────────────────────────────────────────────
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = file.filename.rsplit(".", 1)[1].lower()
    if ext == "jfif":
        ext = "jpg"
    upload_name = f"upload_{posture_type}_{ts}.{ext}"
    upload_path = os.path.join(UPLOAD_FOLDER, upload_name)
    file.save(upload_path)

    # ── Run AI scoring ───────────────────────────────────────────────────────
    result, error = analyze_image(upload_path, SETTINGS, MODEL_PATH)
    if error:
        return render_template("nurse_upload.html",
                               posture_types=POSTURE_TYPES,
                               error=f"AI analysis failed: {error}")

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
    risk   = RISK_LEVELS.get(grade, RISK_LEVELS["D"])
    pt_info = POSTURE_TYPES[posture_type]

    # ── Annotate and save output image ───────────────────────────────────────
    draw_skeleton(image, landmarks)
    draw_score_panel(image, total, grade, grade_label, breakdown)
    output_name = f"output_{posture_type}_{ts}.jpg"
    output_path = os.path.join(OUTPUTS_FOLDER, output_name)
    cv2.imwrite(output_path, image)

    # ── Save reports ─────────────────────────────────────────────────────────
    json_name   = f"posture_report_{ts}.json"
    txt_name    = f"posture_report_{ts}.txt"
    json_latest = os.path.join(REPORTS_FOLDER, "posture_report.json")
    txt_latest  = os.path.join(REPORTS_FOLDER, "posture_report.txt")

    for jp in (os.path.join(REPORTS_FOLDER, json_name), json_latest):
        save_json_report(jp, patient_name, nurse_name, dt_str,
                         upload_name, total, grade, grade_label,
                         breakdown, observation, suggestions, posture_type)

    for tp in (os.path.join(REPORTS_FOLDER, txt_name), txt_latest):
        save_txt_report(tp, patient_name, nurse_name, dt_str,
                        upload_name, total, grade, grade_label,
                        breakdown, observation, suggestions, posture_type)

    # ── Log the assessment ────────────────────────────────────────────────────
    assessment_id = ts
    append_assessment({
        "id":                  assessment_id,
        "timestamp":           dt_str,
        "patient_name":        patient_name,
        "nurse_name":          nurse_name,
        "posture_type":        posture_type,
        "posture_label":       pt_info["label"],
        "score":               total,
        "grade":               grade,
        "grade_label":         grade_label,
        "status":              status,
        "risk_label":          risk["label"],
        "upload_file":         upload_name,
        "output_image":        output_name,
        "json_report":         json_name,
        "txt_report":          txt_name,
        "review_required":     True,
        "supervisor_reviewed": False,
        "supervisor_name":     "",
        "supervisor_comment":  "",
        "reviewed_at":         "",
    })

    # ── Build items for template ──────────────────────────────────────────────
    items = [
        {
            "index":      i,
            "key":        k,
            "label":      k.replace("_", " ").title(),
            "score":      pts,
            "max_score":  max_pts,
            "percentage": round(pts / max_pts * 100),
            "detail":     detail,
        }
        for i, (k, (pts, max_pts, detail)) in enumerate(breakdown.items(), 1)
    ]

    return render_template(
        "result.html",
        assessment_id = assessment_id,
        patient_name  = patient_name,
        nurse_name    = nurse_name,
        dt_str        = dt_str,
        upload_file   = upload_name,
        posture_type  = posture_type,
        posture_label = pt_info["label"],
        posture_icon  = pt_info["icon"],
        total         = total,
        grade         = grade,
        grade_label   = grade_label,
        status        = status,
        risk_label    = risk["label"],
        risk_color    = risk["color"],
        risk_bg       = risk["bg"],
        items         = items,
        observation   = observation,
        suggestions   = suggestions,
        output_img    = output_name,
        json_file     = json_name,
        txt_file      = txt_name,
        disclaimer    = DISCLAIMER,
    )


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.route("/dashboard")
def dashboard():
    log = load_log()
    pending = sum(1 for e in log if not e.get("supervisor_reviewed", False))
    return render_template("dashboard.html",
                           assessments=log,
                           total_count=len(log),
                           pending_review=pending,
                           risk_levels=RISK_LEVELS,
                           posture_types=POSTURE_TYPES,
                           disclaimer=DISCLAIMER)


# ── Supervisor review API ─────────────────────────────────────────────────────

@app.route("/api/supervisor-review/<assessment_id>", methods=["POST"])
def supervisor_review(assessment_id):
    data             = request.get_json(silent=True) or {}
    supervisor_name  = data.get("supervisor_name",  "").strip() or "Supervisor"
    comment          = data.get("comment",          "").strip()

    log = load_log()
    updated = False
    for entry in log:
        if entry.get("id") == assessment_id:
            entry["supervisor_reviewed"] = True
            entry["supervisor_name"]     = supervisor_name
            entry["supervisor_comment"]  = comment
            entry["reviewed_at"]         = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            updated = True

            # Also patch the JSON report file
            json_path = os.path.join(REPORTS_FOLDER, entry.get("json_report", ""))
            if os.path.exists(json_path):
                with open(json_path, "r", encoding="utf-8") as f:
                    rpt = json.load(f)
                rpt["supervisor_reviewed"] = True
                rpt["supervisor_name"]     = supervisor_name
                rpt["supervisor_comment"]  = comment
                rpt["reviewed_at"]         = entry["reviewed_at"]
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(rpt, f, indent=2, ensure_ascii=False)
            break

    if not updated:
        return jsonify({"ok": False, "error": "Assessment not found"}), 404

    save_log(log)
    return jsonify({"ok": True})


# ── Static file routes ────────────────────────────────────────────────────────

@app.route("/reports/<filename>")
def download_report(filename):
    return send_from_directory(REPORTS_FOLDER, filename, as_attachment=True)


@app.route("/outputs/<filename>")
def view_output(filename):
    return send_from_directory(OUTPUTS_FOLDER, filename)


if __name__ == "__main__":
    print("=" * 60)
    print("  WMC Nursing Posture AI - Web Upload Server")
    print("  http://localhost:5000")
    print("  Dashboard: http://localhost:5000/dashboard")
    print("  Overtime:  http://localhost:5000/overtime")
    print("  For nursing training and supervisor review only.")
    print("=" * 60)
    app.run(debug=False, host="0.0.0.0", port=5000)
