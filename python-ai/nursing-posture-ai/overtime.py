"""
overtime.py - Nursing Overtime Calculation Core
-------------------------------------------------
For nursing operations management only.
Not a payroll replacement system.
All records must be verified by a supervisor.
"""

import csv
import json
import os
from collections import defaultdict
from datetime import date, datetime, timedelta

# ── Constants ─────────────────────────────────────────────────────────────────
NORMAL_HOURS      = 8.0
DAILY_OT_WARN     = 4.0   # h — flag single-day OT
WEEKLY_OT_WARN    = 16.0  # h — flag weekly OT
CONSEC_DAYS_WARN  = 5     # days — flag consecutive work days

DISCLAIMER = (
    "This system is for nursing operations management only. "
    "Not a payroll replacement system. "
    "All records must be verified by a supervisor before any administrative action."
)

SHIFT_TYPES = {
    "morning":   {"label": "Morning Shift",   "icon": "🌅", "start": "07:00", "end": "15:00"},
    "afternoon": {"label": "Afternoon Shift", "icon": "🌤",  "start": "15:00", "end": "23:00"},
    "night":     {"label": "Night Shift",     "icon": "🌙", "start": "23:00", "end": "07:00"},
    "emergency": {"label": "Emergency Duty",  "icon": "🚨", "start": None,    "end": None},
    "split":     {"label": "Split Shift",     "icon": "⏱",  "start": None,    "end": None},
}

OT_TYPE_INFO = {
    "none":      {"label": "No OT",        "color": "#16a34a", "bg": "#dcfce7"},
    "regular":   {"label": "Regular OT",   "color": "#2563eb", "bg": "#dbeafe"},
    "weekend":   {"label": "Weekend OT",   "color": "#7c3aed", "bg": "#ede9fe"},
    "emergency": {"label": "Emergency OT", "color": "#dc2626", "bg": "#fee2e2"},
}

RISK_INFO = {
    "low":      {"label": "Low Risk",       "color": "#16a34a", "bg": "#dcfce7"},
    "medium":   {"label": "Moderate Risk",  "color": "#d97706", "bg": "#fef3c7"},
    "high":     {"label": "High Risk",      "color": "#dc2626", "bg": "#fee2e2"},
    "critical": {"label": "Critical",       "color": "#991b1b", "bg": "#fecaca"},
}

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

DEPARTMENTS = [
    "Ward A", "Ward B", "Ward C",
    "ICU", "Emergency Room", "Operating Room",
    "Pediatrics", "Geriatrics", "Rehabilitation",
    "Outpatient", "Other",
]


# ══════════════════════════════════════════════════════════════════════════════
#  TIME HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def hours_between(check_in: str, check_out: str) -> float:
    t_in  = datetime.strptime(check_in,  "%H:%M")
    t_out = datetime.strptime(check_out, "%H:%M")
    if t_out <= t_in:
        t_out += timedelta(hours=24)   # overnight
    return round((t_out - t_in).total_seconds() / 3600, 2)


def is_weekend(date_str: str) -> bool:
    return datetime.strptime(date_str, "%Y-%m-%d").weekday() >= 5


def day_name(date_str: str) -> str:
    return datetime.strptime(date_str, "%Y-%m-%d").strftime("%A")


def today_str() -> str:
    return str(date.today())


# ══════════════════════════════════════════════════════════════════════════════
#  CORE OT CALCULATION
# ══════════════════════════════════════════════════════════════════════════════

def calculate_ot(check_in: str, check_out: str,
                 shift_type: str, date_str: str) -> dict:
    """
    Calculate overtime breakdown for one attendance record.
    Returns: total_hours, regular_hours, ot_hours, ot_type, is_weekend, risk_level
    """
    total   = hours_between(check_in, check_out)
    regular = round(min(total, NORMAL_HOURS), 2)
    ot      = round(max(0.0, total - NORMAL_HOURS), 2)
    weekend = is_weekend(date_str)

    if shift_type == "emergency":
        ot_type = "emergency"
    elif weekend and ot > 0:
        ot_type = "weekend"
    elif ot > 0:
        ot_type = "regular"
    else:
        ot_type = "none"

    if ot >= 6:
        risk = "critical"
    elif ot >= DAILY_OT_WARN:
        risk = "high"
    elif ot >= 2:
        risk = "medium"
    else:
        risk = "low"

    return {
        "total_hours":   round(total, 2),
        "regular_hours": regular,
        "ot_hours":      ot,
        "ot_type":       ot_type,
        "is_weekend":    weekend,
        "risk_level":    risk,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  MULTI-RECORD ANALYSIS
# ══════════════════════════════════════════════════════════════════════════════

def nurse_weekly_ot(records: list, nurse_name: str, ref_date: str) -> float:
    ref        = datetime.strptime(ref_date, "%Y-%m-%d").date()
    week_start = ref - timedelta(days=6)
    return round(sum(
        r.get("ot_hours", 0) for r in records
        if r.get("nurse_name") == nurse_name
        and r.get("date")
        and week_start <= datetime.strptime(r["date"], "%Y-%m-%d").date() <= ref
    ), 2)


def consecutive_days_worked(records: list, nurse_name: str, ref_date: str) -> int:
    worked = {
        datetime.strptime(r["date"], "%Y-%m-%d").date()
        for r in records
        if r.get("nurse_name") == nurse_name and r.get("check_out")
    }
    ref, count = datetime.strptime(ref_date, "%Y-%m-%d").date(), 0
    while ref in worked:
        count += 1
        ref   -= timedelta(days=1)
    return count


# ══════════════════════════════════════════════════════════════════════════════
#  RISK DETECTION
# ══════════════════════════════════════════════════════════════════════════════

def detect_risks(records: list) -> list:
    alerts = []
    today  = today_str()
    nurses = list({r["nurse_name"] for r in records if r.get("nurse_name")})

    # Per-nurse alerts
    for nurse in nurses:
        weekly = nurse_weekly_ot(records, nurse, today)
        consec = consecutive_days_worked(records, nurse, today)

        if weekly >= WEEKLY_OT_WARN * 1.5:
            alerts.append({
                "type": "excessive_ot", "severity": "critical", "nurse_name": nurse,
                "message": f"{nurse}: {weekly}h OT this week — critically excessive.",
                "action":  "Immediate supervisor intervention required.",
            })
        elif weekly >= WEEKLY_OT_WARN:
            alerts.append({
                "type": "excessive_ot", "severity": "high", "nurse_name": nurse,
                "message": f"{nurse}: {weekly}h OT this week — above safe threshold ({WEEKLY_OT_WARN}h).",
                "action":  "Review schedule and redistribute workload.",
            })

        if consec >= CONSEC_DAYS_WARN + 1:
            alerts.append({
                "type": "consecutive_days", "severity": "critical", "nurse_name": nurse,
                "message": f"{nurse}: {consec} consecutive working days without rest.",
                "action":  "Schedule mandatory rest day immediately.",
            })
        elif consec >= CONSEC_DAYS_WARN:
            alerts.append({
                "type": "burnout_risk", "severity": "high", "nurse_name": nurse,
                "message": f"{nurse}: {consec} consecutive working days.",
                "action":  "Ensure a rest day is confirmed within 24 hours.",
            })

    # Dept-level: staffing imbalance
    dept_ot = defaultdict(list)
    for r in records:
        dept_ot[r.get("department", "Unknown")].append(r.get("ot_hours", 0))
    dept_avg = {d: round(sum(v) / len(v), 1) for d, v in dept_ot.items() if v}
    for dept, avg in dept_avg.items():
        if avg >= 3.0:
            alerts.append({
                "type": "insufficient_staffing", "severity": "medium",
                "nurse_name": dept,
                "message": f"{dept}: average {avg}h OT per shift — possible understaffing.",
                "action":  "Review staffing levels for this department.",
            })

    alerts.sort(key=lambda a: SEVERITY_ORDER.get(a["severity"], 9))
    return alerts[:10]


# ══════════════════════════════════════════════════════════════════════════════
#  AI INSIGHTS
# ══════════════════════════════════════════════════════════════════════════════

def generate_ai_insights(records: list) -> list:
    if not records:
        return [{"icon": "info", "severity": "low",
                 "text": "No attendance data yet. Add records to generate insights."}]

    today  = date.today()
    recent = [r for r in records
              if r.get("date") and
              (today - datetime.strptime(r["date"], "%Y-%m-%d").date()).days <= 30]
    if not recent:
        return [{"icon": "info", "severity": "low",
                 "text": "No records in the past 30 days."}]

    insights = []

    # 1 — High workload trend
    nurse_ot = defaultdict(float)
    for r in recent:
        nurse_ot[r.get("nurse_name", "Unknown")] += r.get("ot_hours", 0)
    if nurse_ot:
        top, top_h = max(nurse_ot.items(), key=lambda x: x[1])
        if top_h >= 10:
            insights.append({"icon": "trend", "severity": "high",
                "text": f"High workload trend: {top} has {top_h:.1f}h OT in the past 30 days. "
                        f"Consider redistributing shifts."})

    # 2 — Staffing imbalance across departments
    dept_ot = defaultdict(list)
    for r in recent:
        dept_ot[r.get("department", "Unknown")].append(r.get("ot_hours", 0))
    dept_avg = {d: sum(v)/len(v) for d, v in dept_ot.items() if v}
    if len(dept_avg) >= 2:
        hi_d = max(dept_avg, key=dept_avg.get)
        lo_d = min(dept_avg, key=dept_avg.get)
        if dept_avg[hi_d] >= dept_avg[lo_d] * 2:
            insights.append({"icon": "balance", "severity": "medium",
                "text": f"Staffing imbalance: {hi_d} averages {dept_avg[hi_d]:.1f}h OT/shift "
                        f"vs {dept_avg[lo_d]:.1f}h in {lo_d}. Review allocation."})

    # 3 — Night shift fatigue
    night = [r for r in recent if r.get("shift_type") == "night"]
    if len(night) >= 3:
        avg_n = sum(r.get("ot_hours", 0) for r in night) / len(night)
        if avg_n >= 2:
            insights.append({"icon": "moon", "severity": "medium",
                "text": f"Night shift fatigue: avg {avg_n:.1f}h OT on {len(night)} night shifts "
                        f"this month. Night OT carries higher fatigue risk."})

    # 4 — Emergency duty load
    emg = sum(1 for r in recent if r.get("shift_type") == "emergency")
    if emg >= 5:
        insights.append({"icon": "alert", "severity": "high",
            "text": f"High emergency call frequency: {emg} emergency duties in 30 days. "
                    f"Ensure recovery time between emergency calls."})

    # 5 — Weekend overtime overload
    wk_ot = sum(r.get("ot_hours", 0) for r in recent if r.get("is_weekend"))
    if wk_ot >= 20:
        insights.append({"icon": "calendar", "severity": "medium",
            "text": f"Weekend OT overload: {wk_ot:.1f}h weekend OT this month. "
                    f"Review weekend staffing ratios."})

    # 6 — Pending approvals backlog
    pending = sum(1 for r in records
                  if r.get("status") == "pending" and r.get("ot_hours", 0) > 0)
    if pending >= 3:
        insights.append({"icon": "clock", "severity": "low",
            "text": f"{pending} OT records awaiting supervisor approval. "
                    f"Timely approval supports accurate workload tracking."})

    if not insights:
        insights.append({"icon": "check", "severity": "low",
            "text": "All workload indicators within normal range. No significant concerns."})

    return insights[:5]


# ══════════════════════════════════════════════════════════════════════════════
#  SUMMARIES
# ══════════════════════════════════════════════════════════════════════════════

def daily_summary(records: list, target_date: str = None) -> dict:
    if target_date is None:
        target_date = today_str()
    day = [r for r in records if r.get("date") == target_date]
    return {
        "date":         target_date,
        "day_name":     day_name(target_date),
        "total_nurses": len({r["nurse_name"] for r in day}),
        "total_shifts": len(day),
        "total_ot_h":   round(sum(r.get("ot_hours", 0) for r in day), 1),
        "total_reg_h":  round(sum(r.get("regular_hours", 0) for r in day), 1),
        "pending":      sum(1 for r in day if r.get("status") == "pending"),
    }


def monthly_summary(records: list, year: int, month: int) -> dict:
    prefix = f"{year:04d}-{month:02d}"
    mo     = [r for r in records if (r.get("date") or "").startswith(prefix)]
    nurse_ot = defaultdict(float)
    for r in mo:
        nurse_ot[r.get("nurse_name", "Unknown")] += r.get("ot_hours", 0)
    return {
        "year":          year,
        "month":         month,
        "month_label":   datetime(year, month, 1).strftime("%B %Y"),
        "total_records": len(mo),
        "total_ot_h":    round(sum(r.get("ot_hours", 0) for r in mo), 1),
        "total_reg_h":   round(sum(r.get("regular_hours", 0) for r in mo), 1),
        "nurses_with_ot": {n: round(h, 1) for n, h in nurse_ot.items()},
        "approved":      sum(1 for r in mo if r.get("status") == "approved"),
        "pending":       sum(1 for r in mo if r.get("status") == "pending"),
    }


def chart_7day_ot(records: list) -> dict:
    today = date.today()
    labels, values = [], []
    for i in range(6, -1, -1):
        d   = str(today - timedelta(days=i))
        ot  = round(sum(r.get("ot_hours", 0) for r in records if r.get("date") == d), 1)
        labels.append(datetime.strptime(d, "%Y-%m-%d").strftime("%a %d"))
        values.append(ot)
    return {"labels": labels, "values": values}


def chart_ot_types(records: list) -> dict:
    counts = {k: 0 for k in OT_TYPE_INFO}
    for r in records:
        t = r.get("ot_type", "none")
        counts[t] = counts.get(t, 0) + 1
    return {
        "labels": [OT_TYPE_INFO[k]["label"] for k in counts if counts[k] > 0],
        "values": [counts[k] for k in counts if counts[k] > 0],
        "colors": [OT_TYPE_INFO[k]["color"] for k in counts if counts[k] > 0],
    }


def chart_top_nurses(records: list, month: int = None, year: int = None) -> dict:
    if month and year:
        prefix = f"{year:04d}-{month:02d}"
        src = [r for r in records if (r.get("date") or "").startswith(prefix)]
    else:
        src = records
    nurse_ot = defaultdict(float)
    for r in src:
        nurse_ot[r.get("nurse_name", "Unknown")] += r.get("ot_hours", 0)
    top = sorted(nurse_ot.items(), key=lambda x: x[1], reverse=True)[:8]
    return {
        "labels": [n for n, _ in top],
        "values": [round(h, 1) for _, h in top],
    }


# ══════════════════════════════════════════════════════════════════════════════
#  EXPORT
# ══════════════════════════════════════════════════════════════════════════════

CSV_FIELDS = [
    "id", "nurse_name", "department", "date", "day_of_week",
    "shift_type", "check_in", "check_out",
    "total_hours", "regular_hours", "ot_hours", "ot_type",
    "is_weekend", "risk_level", "status",
    "supervisor_name", "supervisor_comment", "approved_at", "created_at",
]


def export_csv(records: list, filepath: str):
    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    with open(filepath, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(records)


def export_json_report(records: list, filepath: str):
    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
    report = {
        "disclaimer":    DISCLAIMER,
        "generated_at":  datetime.now().isoformat(timespec="seconds"),
        "total_records": len(records),
        "total_ot_h":    round(sum(r.get("ot_hours", 0) for r in records), 1),
        "records":       records,
    }
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


def export_pdf(records: list, filepath: str, title: str = "Nursing Overtime Report"):
    from fpdf import FPDF

    os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Header
    pdf.set_fill_color(15, 52, 96)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, "WMC Nursing AI - " + title, fill=True, ln=True, align="C")
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 6, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", ln=True, align="C")
    pdf.ln(4)

    # Disclaimer
    pdf.set_fill_color(255, 251, 235)
    pdf.set_text_color(124, 74, 0)
    pdf.set_font("Helvetica", "I", 8)
    pdf.multi_cell(0, 5, "NOTICE: " + DISCLAIMER, fill=True)
    pdf.ln(4)

    # Summary
    total_ot = round(sum(r.get("ot_hours", 0) for r in records), 1)
    pdf.set_text_color(15, 52, 96)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, f"Total Records: {len(records)}   |   Total OT Hours: {total_ot}h", ln=True)
    pdf.ln(3)

    # Table header
    cols = [("Nurse", 40), ("Dept", 28), ("Date", 22), ("Shift", 22),
            ("In", 14), ("Out", 14), ("OT h", 14), ("Status", 22)]
    pdf.set_fill_color(15, 52, 96)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 8)
    for label, w in cols:
        pdf.cell(w, 7, label, fill=True, border=1)
    pdf.ln()

    # Rows
    pdf.set_font("Helvetica", "", 8)
    for i, r in enumerate(records):
        fill = i % 2 == 0
        pdf.set_fill_color(240, 246, 255) if fill else pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(30, 45, 61)
        row = [
            r.get("nurse_name", "")[:18],
            r.get("department", "")[:14],
            r.get("date", ""),
            r.get("shift_type", "").capitalize(),
            r.get("check_in", ""),
            r.get("check_out", "") or "--",
            str(r.get("ot_hours", 0)),
            r.get("status", "").capitalize(),
        ]
        for val, (_, w) in zip(row, cols):
            pdf.cell(w, 6, val, fill=fill, border=1)
        pdf.ln()

    pdf.output(filepath)
