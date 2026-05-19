import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PatientsProvider } from './context/PatientsProvider.jsx'
import { NursingNotesProvider } from './context/NursingNotesProvider.jsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <PatientsProvider>
        <NursingNotesProvider>
          <App />
        </NursingNotesProvider>
      </PatientsProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
