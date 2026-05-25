const nursingRepository = require('../../repositories/nursing.repository')

async function listRecords(filters = {}) {
  const { data: records, source } = await nursingRepository.getAll(filters)
  return {
    total:   records.length,
    count:   records.length,
    records,
    source,
    mock: source === 'mock',
  }
}

async function createRecord(input) {
  const { data: record, source } = await nursingRepository.create(input)
  return { record, source, mock: source === 'mock' }
}

module.exports = { listRecords, createRecord }
