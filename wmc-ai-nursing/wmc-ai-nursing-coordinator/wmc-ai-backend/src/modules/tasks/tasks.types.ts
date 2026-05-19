export type NurseTaskPriority = 'Urgent' | 'High' | 'Medium' | 'Low'

/** Single queue item surfaced to nurses */
export interface NurseQueuedTask {
  priority: NurseTaskPriority
  patientName: string
  task: string
  dueTime: string
  source: string
}

export interface TasksQueueResponse {
  tasks: NurseQueuedTask[]
  summary: {
    urgentTasks: number
    highPriorityTasks: number
    mediumPriorityTasks: number
    totalTasks: number
  }
}
