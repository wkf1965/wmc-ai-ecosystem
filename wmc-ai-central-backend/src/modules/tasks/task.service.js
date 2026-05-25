const taskRepository = require('../../repositories/task.repository')

async function listTasks(filters = {}) {
  const { data: tasks, source } = await taskRepository.getAll(filters)
  return {
    total: tasks.length,
    count: tasks.length,
    tasks,
    source,
    mock: source === 'mock',
  }
}

module.exports = { listTasks }
