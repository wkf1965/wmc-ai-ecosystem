const patientRepository = require('../../repositories/patient.repository')

async function listPatients(filters = {}) {
  const { data: patients, source } = await patientRepository.getAll(filters)
  return {
    total:    patients.length,
    count:    patients.length,
    patients,
    source,
    mock: source === 'mock',
  }
}

async function getPatientById(id) {
  const { data: patient, source } = await patientRepository.getById(id)
  return { patient, source, mock: source === 'mock' }
}

async function createPatient(input) {
  const { data: patient, source } = await patientRepository.create(input)
  return { patient, source, mock: source === 'mock' }
}

module.exports = { listPatients, getPatientById, createPatient }
