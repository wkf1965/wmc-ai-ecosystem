const alertRepository = require('../../repositories/alert.repository')

async function listAlerts(filters = {}) {
  const { data: alerts, source } = await alertRepository.getAll(filters)
  return {
    total: alerts.length,
    count: alerts.length,
    alerts,
    source,
    mock: source === 'mock',
  }
}

module.exports = { listAlerts }
