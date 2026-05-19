"""
overtime_routes.py - Nursing Overtime Flask Blueprint
------------------------------------------------------
Routes: /overtime/*
"""

import json
import os
from datetime import datetime

from flask import (Blueprint, jsonify, redirect, render_template,
                   request, send_file, url_for)

from overtime import (
    DEPARTMENTS, DISCLAIMER, OT_TYPE_INFO, RISK_INFO, SHIFT_TYPES,
    calculate_ot, chart_7day_ot, chart_ot_types, chart_top_nurses,
    daily_summary, detect_risks, export_csv, export_json_report,
    export_pdf, generate_ai_insights, monthly_summary,
    day_name, today_str,
)

# ── Blueprint setup ───────────────────────────────────────────────────────────
overtime_bp = Blueprint("overtime", __name__, url_prefix="/overtime")

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
OT_DATA_DIR   = os.path.join(BASE_DIR, "overtime_data")
OT_LOG_PATH   = os.path.join(OT_DATA_DIR, "attendance_log.json")
EXPORT_DIR    = os.path.join(OT_DATA_DIR, "exports")

os.makedirs(OT_DATA_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR,  exist_ok=True)


# ── Log helpers ───────────────────────────────────────────────────────────────

def load_records() -> list:
    if os.path.exists(OT_LOG_PATH):
        with open(OT_LOG_PATH, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []


def save_records(records: list):
    with open(OT_LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)


def get_record(records: list, rec_id: str):
    return next((r for r in records if r.get("id") == rec_id), None)


# ══════════════════════════════════════════════════════════════════════════════
#  DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@overtime_bp.route("/")
def dashboard():
    records  = load_records()
    now      = datetime.now()
    today    = today_str()

    day_sum  = daily_summary(records, today)
    mo_sum   = monthly_summary(records, now.year, now.month)
    risks    = detect_risks(records)
    insights = generate_ai_insights(records)

    c7day    = chart_7day_ot(records)
    ctypes   = chart_ot_types(records)
    ctop     = chart_top_nurses(records, now.month, now.year)

    pending_total = sum(1 for r in records
                        if r.get("status") == "pending" and r.get("ot_hours", 0) > 0)

    return render_template(
        "overtime_dashboard.html",
        day_sum       = day_sum,
        mo_sum        = mo_sum,
        risks         = risks,
        insights      = insights,
        c7day_labels  = json.dumps(c7day["labels"]),
        c7day_values  = json.dumps(c7day["values"]),
        ctypes_labels = json.dumps(ctypes["labels"]),
        ctypes_values = json.dumps(ctypes["values"]),
        ctypes_colors = json.dumps(ctypes["colors"]),
        ctop_labels   = json.dumps(ctop["labels"]),
        ctop_values   = json.dumps(ctop["values"]),
        pending_total = pending_total,
        risk_info     = RISK_INFO,
        disclaimer    = DISCLAIMER,
        now           = now,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  CHECK-IN / CHECK-OUT
# ══════════════════════════════════════════════════════════════════════════════

@overtime_bp.route("/checkin", methods=["GET", "POST"])
def checkin():
    if request.method == "GET":
        return render_template(
            "overtime_checkin.html",
            shift_types  = SHIFT_TYPES,
            departments  = DEPARTMENTS,
            today        = today_str(),
            disclaimer   = DISCLAIMER,
            error        = None,
            success      = None,
        )

    # POST: save new record
    nurse_name   = request.form.get("nurse_name",  "").strip()
    department   = request.form.get("department",  "").strip()
    date_str     = request.form.get("date",        today_str()).strip()
    shift_type   = request.form.get("shift_type",  "morning").strip()
    check_in     = request.form.get("check_in",    "").strip()
    check_out    = request.form.get("check_out",   "").strip()
    notes        = request.form.get("notes",       "").strip()

    if not all([nurse_name, department, date_str, check_in]):
        return render_template("overtime_checkin.html",
                               shift_types=SHIFT_TYPES, departments=DEPARTMENTS,
                               today=today_str(), disclaimer=DISCLAIMER,
                               error="Please fill in all required fields.", success=None)

    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    rec = {
        "id":                 f"OT_{ts}",
        "nurse_name":         nurse_name,
        "department":         department,
        "date":               date_str,
        "day_of_week":        day_name(date_str),
        "shift_type":         shift_type,
        "shift_label":        SHIFT_TYPES.get(shift_type, {}).get("label", shift_type),
        "check_in":           check_in,
        "check_out":          check_out or None,
        "total_hours":        None,
        "regular_hours":      None,
        "ot_hours":           None,
        "ot_type":            None,
        "is_weekend":         None,
        "risk_level":         None,
        "notes":              notes,
        "status":             "active" if not check_out else "pending",
        "supervisor_name":    "",
        "supervisor_comment": "",
        "approved_at":        "",
        "created_at":         datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

    # Calculate OT immediately if check-out provided
    if check_out:
        ot = calculate_ot(check_in, check_out, shift_type, date_str)
        rec.update(ot)
        rec["status"] = "pending" if ot["ot_hours"] > 0 else "completed"

    records = load_records()
    records.insert(0, rec)
    save_records(records)

    return render_template("overtime_checkin.html",
                           shift_types=SHIFT_TYPES, departments=DEPARTMENTS,
                           today=today_str(), disclaimer=DISCLAIMER,
                           error=None,
                           success=f"Record saved for {nurse_name}. ID: {rec['id']}")


@overtime_bp.route("/checkout/<rec_id>", methods=["POST"])
def checkout(rec_id):
    check_out = request.form.get("check_out", "").strip()
    if not check_out:
        return jsonify({"ok": False, "error": "check_out time required"}), 400

    records = load_records()
    rec     = get_record(records, rec_id)
    if not rec:
        return jsonify({"ok": False, "error": "Record not found"}), 404

    ot = calculate_ot(rec["check_in"], check_out,
                      rec["shift_type"], rec["date"])
    rec.update(ot)
    rec["check_out"] = check_out
    rec["status"]    = "pending" if ot["ot_hours"] > 0 else "completed"
    save_records(records)
    return jsonify({"ok": True, "ot_hours": ot["ot_hours"]})


# ══════════════════════════════════════════════════════════════════════════════
#  RECORDS LIST
# ══════════════════════════════════════════════════════════════════════════════

@overtime_bp.route("/records")
def records_list():
    records = load_records()

    # Filters
    nurse_f  = request.args.get("nurse",  "").strip()
    date_f   = request.args.get("date",   "").strip()
    month_f  = request.args.get("month",  "").strip()
    status_f = request.args.get("status", "").strip()

    filtered = records
    if nurse_f:
        filtered = [r for r in filtered
                    if nurse_f.lower() in r.get("nurse_name", "").lower()]
    if date_f:
        filtered = [r for r in filtered if r.get("date") == date_f]
    if month_f:
        filtered = [r for r in filtered if (r.get("date") or "").startswith(month_f)]
    if status_f:
        filtered = [r for r in filtered if r.get("status") == status_f]

    return render_template(
        "overtime_records.html",
        records     = filtered,
        total       = len(filtered),
        shift_types = SHIFT_TYPES,
        ot_info     = OT_TYPE_INFO,
        risk_info   = RISK_INFO,
        disclaimer  = DISCLAIMER,
        filter_nurse  = nurse_f,
        filter_date   = date_f,
        filter_month  = month_f,
        filter_status = status_f,
    )


# ══════════════════════════════════════════════════════════════════════════════
#  SUPERVISOR APPROVAL
# ══════════════════════════════════════════════════════════════════════════════

@overtime_bp.route("/api/approve/<rec_id>", methods=["POST"])
def approve(rec_id):
    data     = request.get_json(silent=True) or {}
    sv_name  = data.get("supervisor_name",  "").strip() or "Supervisor"
    comment  = data.get("comment",          "").strip()

    records = load_records()
    rec     = get_record(records, rec_id)
    if not rec:
        return jsonify({"ok": False, "error": "Record not found"}), 404

    rec["status"]             = "approved"
    rec["supervisor_name"]    = sv_name
    rec["supervisor_comment"] = comment
    rec["approved_at"]        = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_records(records)
    return jsonify({"ok": True})


@overtime_bp.route("/api/reject/<rec_id>", methods=["POST"])
def reject(rec_id):
    data     = request.get_json(silent=True) or {}
    sv_name  = data.get("supervisor_name",  "").strip() or "Supervisor"
    comment  = data.get("comment",          "").strip()

    records = load_records()
    rec     = get_record(records, rec_id)
    if not rec:
        return jsonify({"ok": False, "error": "Record not found"}), 404

    rec["status"]             = "rejected"
    rec["supervisor_name"]    = sv_name
    rec["supervisor_comment"] = comment
    rec["approved_at"]        = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    save_records(records)
    return jsonify({"ok": True})


# ══════════════════════════════════════════════════════════════════════════════
#  EXPORT
# ══════════════════════════════════════════════════════════════════════════════

@overtime_bp.route("/export/csv")
def export_csv_route():
    records  = load_records()
    month_f  = request.args.get("month", "")
    if month_f:
        records = [r for r in records if (r.get("date") or "").startswith(month_f)]
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(EXPORT_DIR, f"overtime_report_{ts}.csv")
    export_csv(records, path)
    return send_file(path, as_attachment=True,
                     download_name=f"overtime_report_{ts}.csv",
                     mimetype="text/csv")


@overtime_bp.route("/export/json")
def export_json_route():
    records = load_records()
    month_f = request.args.get("month", "")
    if month_f:
        records = [r for r in records if (r.get("date") or "").startswith(month_f)]
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(EXPORT_DIR, f"overtime_report_{ts}.json")
    export_json_report(records, path)
    return send_file(path, as_attachment=True,
                     download_name=f"overtime_report_{ts}.json",
                     mimetype="application/json")


@overtime_bp.route("/export/pdf")
def export_pdf_route():
    records = load_records()
    month_f = request.args.get("month", "")
    title   = "Monthly Overtime Report"
    if month_f:
        records = [r for r in records if (r.get("date") or "").startswith(month_f)]
        title   = f"Overtime Report {month_f}"
    ts   = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(EXPORT_DIR, f"overtime_report_{ts}.pdf")
    export_pdf(records, path, title)
    return send_file(path, as_attachment=True,
                     download_name=f"overtime_report_{ts}.pdf",
                     mimetype="application/pdf")
