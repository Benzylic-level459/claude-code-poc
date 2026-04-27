// 任务状态类型
export type TaskStatus = 
  | 'pending'      // 待执行
  | 'running'      // 运行中
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'killed'       // 被终止

// 任务类型
export type TaskType = 
  | 'local_bash'       // 本地 Bash
  | 'local_agent'      // 本地代理
  | 'remote_agent'     // 远程代理
  | 'local_workflow'   // 本地工作流

// 任务基础接口
export type TaskStateBase = {
  id: string                    // 任务唯一标识
  type: TaskType               // 任务类型
  status: TaskStatus           // 任务状态
  description: string          // 任务描述
  toolUseID?: string           // 关联的工具调用 ID
  startTime?: number           // 开始时间
  endTime?: number             // 结束时间
  notified?: boolean           // 是否已通知
}

// 本地 Bash 任务状态
export type LocalShellTaskState = TaskStateBase & {
  type: 'local_bash'
  command: string              // 执行的命令
  result?: {
    code: number              // 退出码
    interrupted: boolean      // 是否被中断
  }
  isBackgrounded: boolean      // 是否已后台化
  agentId?: string            // 创建该任务的代理 ID
  outputFile?: string          // 输出文件路径
}

// 本地代理任务状态
export type LocalAgentTaskState = TaskStateBase & {
  type: 'local_agent'
  prompt: string               // 代理提示词
  subagentType?: string        // 子代理类型
  model?: string               // 使用的模型
  outputFile: string           // 输出文件路径
  result?: string              // 执行结果
  isBackgrounded?: boolean     // 是否后台化
}

// 远程代理任务状态
export type RemoteAgentTaskState = TaskStateBase & {
  type: 'remote_agent'
  prompt: string
  subagentType?: string
  remoteEnvId: string          // 远程环境 ID
  outputFile: string
  result?: string
}

// 本地工作流任务状态
export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  steps: WorkflowStep[]        // 工作流步骤
  currentStep: number          // 当前步骤
  result?: Record<string, any> // 执行结果
}

// 工作流步骤
export type WorkflowStep = {
  id: string
  name: string
  description: string
  toolName: string
  input: Record<string, any>
  dependencies?: string[]      // 依赖的步骤 ID
  result?: any                 // 步骤执行结果
  status: TaskStatus           // 步骤状态
}

// 任务状态联合类型
export type TaskState = 
  | LocalShellTaskState
  | LocalAgentTaskState
  | RemoteAgentTaskState
  | LocalWorkflowTaskState

// 后台任务类型
export type BackgroundTaskState = 
  | LocalShellTaskState
  | LocalAgentTaskState
  | RemoteAgentTaskState
  | LocalWorkflowTaskState

// 任务输入类型
export type TaskInput = {
  type: TaskType
  description: string
  [key: string]: any
}

// 任务句柄
export type TaskHandle = {
  taskId: string
  cleanup: () => void
}

// 任务上下文
export type TaskContext = {
  cwd: string
  setAppState: (updater: (prev: any) => any) => void
  getAppState: () => any
  userId: string
}

// 检查是否为后台任务
export function isBackgroundTask(task: TaskState): task is BackgroundTaskState {
  if (task.status !== 'running' && task.status !== 'pending') {
    return false
  }
  if ('isBackgrounded' in task && task.isBackgrounded === false) {
    return false
  }
  return true
}

// 检查任务类型的辅助函数
export function isLocalShellTask(task: TaskState): task is LocalShellTaskState {
  return task.type === 'local_bash'
}

export function isLocalAgentTask(task: TaskState): task is LocalAgentTaskState {
  return task.type === 'local_agent'
}

export function isRemoteAgentTask(task: TaskState): task is RemoteAgentTaskState {
  return task.type === 'remote_agent'
}

export function isLocalWorkflowTask(task: TaskState): task is LocalWorkflowTaskState {
  return task.type === 'local_workflow'
}
