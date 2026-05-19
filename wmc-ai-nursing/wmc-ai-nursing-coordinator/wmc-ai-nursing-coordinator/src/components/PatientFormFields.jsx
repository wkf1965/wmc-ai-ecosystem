import {
  FALL_RISK_OPTIONS,
  GENDER_OPTIONS,
  PRESSURE_RISK_OPTIONS,
  REHABILITATION_STATUS_OPTIONS,
} from '../db/patientSchema.js'

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none ring-teal-500/25 focus:border-teal-400 focus:ring-2'
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-500'

export default function PatientFormFields({ form, setForm, errors = {} }) {
  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor="fullName" className={labelClass}>
          Full name <span className="text-red-600">*</span>
        </label>
        <input
          id="fullName"
          type="text"
          autoComplete="name"
          value={form.fullName}
          onChange={(e) => setField('fullName', e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? 'err-fullName' : undefined}
        />
        {errors.fullName ? (
          <p id="err-fullName" className="mt-1 text-xs text-red-600">
            {errors.fullName}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="age" className={labelClass}>
          Age <span className="text-red-600">*</span>
        </label>
        <input
          id="age"
          type="number"
          min={0}
          max={130}
          value={form.age}
          onChange={(e) => setField('age', e.target.value)}
          className={inputClass}
          aria-invalid={Boolean(errors.age)}
        />
        {errors.age ? <p className="mt-1 text-xs text-red-600">{errors.age}</p> : null}
      </div>

      <div>
        <label htmlFor="gender" className={labelClass}>
          Gender
        </label>
        <select
          id="gender"
          value={form.gender}
          onChange={(e) => setField('gender', e.target.value)}
          className={inputClass}
        >
          {GENDER_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="diagnosis" className={labelClass}>
          Diagnosis
        </label>
        <textarea
          id="diagnosis"
          rows={2}
          value={form.diagnosis}
          onChange={(e) => setField('diagnosis', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="admissionDate" className={labelClass}>
          Admission date
        </label>
        <input
          id="admissionDate"
          type="date"
          value={form.admissionDate}
          onChange={(e) => setField('admissionDate', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="rehabilitationStatus" className={labelClass}>
          Rehabilitation status
        </label>
        <select
          id="rehabilitationStatus"
          value={form.rehabilitationStatus}
          onChange={(e) => setField('rehabilitationStatus', e.target.value)}
          className={inputClass}
        >
          {REHABILITATION_STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="mobilityStatus" className={labelClass}>
          Mobility status
        </label>
        <textarea
          id="mobilityStatus"
          rows={2}
          value={form.mobilityStatus}
          onChange={(e) => setField('mobilityStatus', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="feedingStatus" className={labelClass}>
          Feeding status
        </label>
        <textarea
          id="feedingStatus"
          rows={2}
          value={form.feedingStatus}
          onChange={(e) => setField('feedingStatus', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="toiletAssistance" className={labelClass}>
          Toilet assistance
        </label>
        <textarea
          id="toiletAssistance"
          rows={2}
          value={form.toiletAssistance}
          onChange={(e) => setField('toiletAssistance', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="fallRisk" className={labelClass}>
          Fall risk
        </label>
        <select
          id="fallRisk"
          value={form.fallRisk}
          onChange={(e) => setField('fallRisk', e.target.value)}
          className={inputClass}
        >
          {FALL_RISK_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="pressureSoreRisk" className={labelClass}>
          Pressure sore risk
        </label>
        <select
          id="pressureSoreRisk"
          value={form.pressureSoreRisk}
          onChange={(e) => setField('pressureSoreRisk', e.target.value)}
          className={inputClass}
        >
          {PRESSURE_RISK_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="mentalStatus" className={labelClass}>
          Mental status
        </label>
        <textarea
          id="mentalStatus"
          rows={2}
          value={form.mentalStatus}
          onChange={(e) => setField('mentalStatus', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="currentMedications" className={labelClass}>
          Current medications
        </label>
        <textarea
          id="currentMedications"
          rows={3}
          value={form.currentMedications}
          onChange={(e) => setField('currentMedications', e.target.value)}
          className={inputClass}
          placeholder="List or reference MAR / pharmacy reconciliation"
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="familyContact" className={labelClass}>
          Family contact
        </label>
        <input
          id="familyContact"
          type="text"
          value={form.familyContact}
          onChange={(e) => setField('familyContact', e.target.value)}
          className={inputClass}
          placeholder="Name — phone or email"
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor="assignedNurse" className={labelClass}>
          Assigned nurse
        </label>
        <input
          id="assignedNurse"
          type="text"
          value={form.assignedNurse}
          onChange={(e) => setField('assignedNurse', e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  )
}
