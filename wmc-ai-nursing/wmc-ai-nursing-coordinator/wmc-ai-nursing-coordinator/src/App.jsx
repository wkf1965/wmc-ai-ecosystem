import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import PatientsPage from './pages/PatientsPage'
import PatientDetailPage from './pages/PatientDetailPage'
import PatientFormPage from './pages/PatientFormPage'
import PatientRegistrationPage from './pages/PatientRegistrationPage'
import NursingNotesPage from './pages/NursingNotesPage'
import NursingNoteFormPage from './pages/NursingNoteFormPage'
import RehabPage from './pages/RehabPage'
import AIAlertsPage from './pages/AIAlertsPage'
import AIRiskDetectionPage from './pages/AIRiskDetectionPage'
import FamilyUpdatesPage from './pages/FamilyUpdatesPage'
import ReportsPage from './pages/ReportsPage'
import ShiftHandoverPage from './pages/ShiftHandoverPage'
import SupervisorCommandCenterPage from './pages/SupervisorCommandCenterPage'
import DoctorReviewQueuePage from './pages/DoctorReviewQueuePage'
import MedicationTrackingPage from './pages/MedicationTrackingPage'
import RehabTrackingPage from './pages/RehabTrackingPage'
import MobileNurseInputPage from './pages/MobileNurseInputPage'
import NurseVitalInputPage from './pages/NurseVitalInputPage'
import SideTurningPosturePage from './pages/SideTurningPosturePage'
import SideTurningScheduleBoardPage from './pages/SideTurningScheduleBoardPage'
import StaffAttendancePage from './pages/StaffAttendancePage'
import OTManagementPage from './pages/OTManagementPage'
import OTReportsPage from './pages/OTReportsPage'
import OvertimePage from './pages/OvertimePage'
import GoogleSheetSettingsPage from './pages/GoogleSheetSettingsPage'
import CareLoopsPage from './pages/CareLoopsPage'
import HealthCheckLoopPage from './pages/HealthCheckLoopPage'
import SideTurningLoopPage from './pages/SideTurningLoopPage'
import MedicationLoopPage from './pages/MedicationLoopPage'
import HydrationLoopPage from './pages/HydrationLoopPage'
import NutritionLoopPage from './pages/NutritionLoopPage'
import RehabilitationLoopPage from './pages/RehabilitationLoopPage'
import WoundCareLoopPage from './pages/WoundCareLoopPage'
import MentalHealthLoopPage from './pages/MentalHealthLoopPage'
import ContinenceLoopPage from './pages/ContinenceLoopPage'
import StaffOvertimeLoopPage from './pages/StaffOvertimeLoopPage'
import EmergencyResponseLoopPage from './pages/EmergencyResponseLoopPage'
import SleepMonitoringLoopPage from './pages/SleepMonitoringLoopPage'
import FallPreventionLoopPage from './pages/FallPreventionLoopPage'
import DoctorReviewLoopPage from './pages/DoctorReviewLoopPage'
import AIRiskPredictionLoopPage from './pages/AIRiskPredictionLoopPage'
import FamilyUpdateLoopPage from './pages/FamilyUpdateLoopPage'
import InfectionControlLoopPage from './pages/InfectionControlLoopPage'
import AIBrainDashboardPage from './pages/AIBrainDashboardPage'
import TelegramNurseInputPage from './pages/TelegramNurseInputPage'
import TelegramSettingsPage from './pages/TelegramSettingsPage'
import TelegramTestPage from './pages/TelegramTestPage'
import TelegramNursingDashboardPage from './pages/TelegramNursingDashboardPage'
import RoomModulePage from './pages/RoomModulePage'
import BackendApiTesterPage from './pages/BackendApiTesterPage'
import NursingSupervisorDashboardPage from './pages/NursingSupervisorDashboardPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="patients/new" element={<PatientFormPage />} />
          <Route path="patient-registration" element={<PatientRegistrationPage />} />
          <Route path="patients/:id/edit" element={<PatientFormPage />} />
          <Route path="patients/:id" element={<PatientDetailPage />} />
          <Route path="patients" element={<PatientsPage />} />
          <Route path="nursing-notes/new" element={<NursingNoteFormPage />} />
          <Route path="nursing-notes" element={<NursingNotesPage />} />
          <Route path="rehab" element={<RehabPage />} />
          <Route path="ai-risk" element={<AIRiskDetectionPage />} />
          <Route path="alerts" element={<AIAlertsPage />} />
          <Route path="ai-brain" element={<AIBrainDashboardPage />} />
          <Route path="telegram-nurse-input" element={<TelegramNurseInputPage />} />
          <Route path="telegram-test" element={<TelegramTestPage />} />
          <Route path="telegram-nursing-dashboard" element={<TelegramNursingDashboardPage />} />
          {/* Roster board + Patientsroom registration — keep above catch-all * */}
          <Route path="room-module" element={<RoomModulePage />} />
          <Route path="family-updates" element={<FamilyUpdatesPage />} />
          <Route path="side-turning" element={<SideTurningScheduleBoardPage />} />
          <Route path="side-turning-loop" element={<SideTurningLoopPage />} />
          <Route path="side-turning-posture" element={<SideTurningPosturePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="shift-handover" element={<ShiftHandoverPage />} />
          <Route path="supervisor" element={<SupervisorCommandCenterPage />} />
          <Route path="nursing-supervisor" element={<NursingSupervisorDashboardPage />} />
          <Route path="doctor-review" element={<DoctorReviewQueuePage />} />
          <Route path="doctor-review-loop" element={<DoctorReviewLoopPage />} />
          <Route path="medications" element={<MedicationTrackingPage />} />
          <Route path="medication-loop" element={<MedicationLoopPage />} />
          <Route path="rehab-tracking" element={<RehabTrackingPage />} />
          <Route path="mobile-nurse" element={<MobileNurseInputPage />} />
          <Route path="nurse-input" element={<NurseVitalInputPage />} />
          <Route path="staff-attendance" element={<StaffAttendancePage />} />
          <Route path="ot-management" element={<OTManagementPage />} />
          <Route path="ot-reports" element={<OTReportsPage />} />
          <Route path="overtime" element={<OvertimePage />} />
          <Route path="care-loops" element={<CareLoopsPage />} />
          <Route path="health-check-loop" element={<HealthCheckLoopPage />} />
          <Route path="hydration-loop" element={<HydrationLoopPage />} />
          <Route path="nutrition-loop" element={<NutritionLoopPage />} />
          <Route path="rehabilitation-loop" element={<RehabilitationLoopPage />} />
          <Route path="wound-care-loop" element={<WoundCareLoopPage />} />
          <Route path="mental-health-loop" element={<MentalHealthLoopPage />} />
          <Route path="continence-loop" element={<ContinenceLoopPage />} />
          <Route path="staff-overtime-loop" element={<StaffOvertimeLoopPage />} />
          <Route path="emergency-response-loop" element={<EmergencyResponseLoopPage />} />
          <Route path="sleep-monitoring-loop" element={<SleepMonitoringLoopPage />} />
          <Route path="fall-prevention-loop" element={<FallPreventionLoopPage />} />
          <Route path="ai-risk-prediction-loop" element={<AIRiskPredictionLoopPage />} />
          <Route path="family-update-loop" element={<FamilyUpdateLoopPage />} />
          <Route path="infection-control-loop" element={<InfectionControlLoopPage />} />
          <Route path="settings/google-sheet" element={<GoogleSheetSettingsPage />} />
          <Route path="settings/telegram" element={<TelegramSettingsPage />} />
          <Route path="backend-api-test" element={<BackendApiTesterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
