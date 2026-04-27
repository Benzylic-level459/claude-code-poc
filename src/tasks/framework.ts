import { TaskState, TaskHandle, TaskContext, TaskStateBase, TaskType } from './types';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

// 任务注册表
const taskRegistry = new Map<string, TaskHandle>();

// 创建任务状态基础
export function createTaskStateBase(
  taskId: string,
  type: TaskType,
  description: string,
  toolUseID?: string,
): TaskStateBase {
  return {
    id: taskId,
    type,
    status: 'pending',
    description,
    toolUseID,
  };
}

// 注册任务
export function registerTask(
  taskState: TaskState,
  setAppState: (updater: (prev: any) => any) => void,
): void {
  setAppState(prev => {
    const tasks = prev.tasks || {};
    return {
      ...prev,
      tasks: {
        ...tasks,
        [taskState.id]: taskState,
      },
    };
  });
}

// 更新任务状态
export function updateTaskState<T extends TaskState>(
  taskId: string,
  setAppState: (updater: (prev: any) => any) => void,
  updater: (task: T) => T,
): void {
  setAppState(prev => {
    const tasks = prev.tasks || {};
    const task = tasks[taskId];
    if (!task) {
      console.error(`Task ${taskId} not found`);
      return prev;
    }
    
    const updatedTask = updater(task as T);
    
    return {
      ...prev,
      tasks: {
        ...tasks,
        [taskId]: updatedTask,
      },
    };
  });
}

// 注销任务
export function unregisterTask(
  taskId: string,
  setAppState: (updater: (prev: any) => any) => void,
): void {
  setAppState(prev => {
    const tasks = prev.tasks || {};
    const newTasks = { ...tasks };
    delete newTasks[taskId];
    return {
      ...prev,
      tasks: newTasks,
    };
  });
}

// 获取任务状态
export function getTaskState(
  taskId: string,
  getAppState: () => any,
): TaskState | undefined {
  const state = getAppState();
  const tasks = state.tasks || {};
  return tasks[taskId];
}

// 完成任务
export function completeTask(
  taskId: string,
  setAppState: (updater: (prev: any) => any) => void,
  result?: unknown,
): void {
  updateTaskState(taskId, setAppState, task => ({
    ...task,
    status: 'completed',
    result,
    endTime: Date.now(),
  }));
}

// 标记任务失败
export function failTask(
  taskId: string,
  setAppState: (updater: (prev: any) => any) => void,
  error: string,
): void {
  updateTaskState(taskId, setAppState, task => ({
    ...task,
    status: 'failed',
    error,
    endTime: Date.now(),
  }));
}

// 启动任务
export function startTask(
  taskId: string,
  setAppState: (updater: (prev: any) => any) => void,
): void {
  updateTaskState(taskId, setAppState, task => ({
    ...task,
    status: 'running',
    startTime: Date.now(),
  }));
}

// 终止任务
export async function killTask(
  taskId: string,
  setAppState: (updater: (prev: any) => any) => void,
): Promise<void> {
  const task = getTaskState(taskId, () => ({
    tasks: Object.fromEntries(taskRegistry.entries()),
  }));
  
  if (!task || (task.status !== 'running' && task.status !== 'pending')) {
    return;
  }
  
  // 更新任务状态
  updateTaskState(taskId, setAppState, t => ({
    ...t,
    status: 'killed',
    endTime: Date.now(),
  }));
  
  // 执行清理
  const handle = taskRegistry.get(taskId);
  if (handle) {
    handle.cleanup();
    taskRegistry.delete(taskId);
  }
}

// 注册任务句柄
export function registerTaskHandle(taskId: string, handle: TaskHandle): void {
  taskRegistry.set(taskId, handle);
}

// 任务输出管理
export class TaskOutput {
  public readonly taskId: string;
  public readonly path: string;
  private writeStream?: fs.WriteStream;
  
  constructor(taskId?: string) {
    this.taskId = taskId ?? randomUUID();
    this.path = getTaskOutputPath(this.taskId);
  }
  
  // 写入数据
  async write(data: string | Buffer): Promise<void> {
    if (!this.writeStream) {
      const dir = path.dirname(this.path);
      await fs.mkdir(dir, { recursive: true });
      this.writeStream = fs.createWriteStream(this.path);
    }
    
    return new Promise((resolve, reject) => {
      this.writeStream!.write(data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  // 读取输出
  async read(): Promise<string> {
    return fs.readFile(this.path, 'utf-8');
  }
  
  // 关闭流
  async close(): Promise<void> {
    if (this.writeStream) {
      return new Promise((resolve) => {
        this.writeStream!.end(() => resolve());
      });
    }
  }
}

// 获取任务输出路径
function getTaskOutputPath(taskId: string): string {
  const tempDir = process.env.TEMP || process.env.TMPDIR || './temp';
  return path.join(tempDir, 'fupaw-tasks', `${taskId}.log`);
}

// 清理任务输出
export async function evictTaskOutput(taskId: string): Promise<void> {
  const outputPath = getTaskOutputPath(taskId);
  try {
    await fs.unlink(outputPath);
  } catch {
    // 文件可能不存在，忽略错误
  }
}

// 任务通知
export function enqueueTaskNotification(
  taskId: string,
  status: 'completed' | 'failed' | 'killed',
  description: string,
): void {
  const summary = formatTaskSummary(taskId, status, description);
  console.log(`Task notification: ${summary}`);
  // 这里可以实现更复杂的通知机制
}

// 格式化任务摘要
function formatTaskSummary(
  taskId: string,
  status: 'completed' | 'failed' | 'killed',
  description: string,
): string {
  let summary: string;
  switch (status) {
    case 'completed':
      summary = `Task "${description}" completed`;
      break;
    case 'failed':
      summary = `Task "${description}" failed`;
      break;
    case 'killed':
      summary = `Task "${description}" was stopped`;
      break;
  }
  return summary;
}
