import { LocalShellTaskState, TaskHandle, TaskContext } from './types';
import { createTaskStateBase, registerTask, updateTaskState, enqueueTaskNotification, evictTaskOutput, TaskOutput, registerTaskHandle } from './framework';
import { exec, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';

// Shell命令执行器
class ShellCommand {
  private process: ChildProcess | null = null;
  public taskOutput: TaskOutput;
  public result: Promise<{ code: number; interrupted: boolean }>;
  private resolveResult: (value: { code: number; interrupted: boolean }) => void;
  private rejectResult: (reason: any) => void;
  
  constructor(private command: string, private cwd: string) {
    this.taskOutput = new TaskOutput();
    this.result = new Promise((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
  }
  
  // 启动命令
  start() {
    this.process = exec(this.command, { cwd: this.cwd }, (error, stdout, stderr) => {
      if (error) {
        this.resolveResult({ code: error.code || 1, interrupted: false });
      } else {
        this.resolveResult({ code: 0, interrupted: false });
      }
    });
    
    // 捕获输出
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        this.taskOutput.write(data);
      });
    }
    
    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        this.taskOutput.write(data);
      });
    }
  }
  
  // 后台化
  background(taskId: string) {
    // 这里可以实现后台化逻辑
  }
  
  // 杀死进程
  kill() {
    if (this.process) {
      this.process.kill();
      this.resolveResult({ code: 1, interrupted: true });
    }
  }
}

// 启动Shell任务
export async function spawnShellTask(
  input: {
    command: string;
    description: string;
    toolUseId?: string;
    agentId?: string;
  },
  context: TaskContext,
): Promise<TaskHandle> {
  const { command, description, toolUseId, agentId } = input;
  const { setAppState, cwd } = context;

  // 创建Shell命令
  const shellCommand = new ShellCommand(command, cwd);
  const taskId = shellCommand.taskOutput.taskId;
  
  // 创建任务状态
  const taskState: LocalShellTaskState = {
    ...createTaskStateBase(taskId, 'local_bash', description, toolUseId),
    type: 'local_bash',
    status: 'running',
    command,
    isBackgrounded: true,
    agentId,
    outputFile: shellCommand.taskOutput.path,
  };
  
  // 注册任务
  registerTask(taskState, setAppState);
  
  // 启动命令
  shellCommand.start();
  
  // 等待任务完成
  void shellCommand.result.then(async (result) => {
    let wasKilled = false;
    updateTaskState<LocalShellTaskState>(taskId, setAppState, (task) => {
      if (task.status === 'killed') {
        wasKilled = true;
        return task;
      }
      return {
        ...task,
        status: result.code === 0 ? 'completed' : 'failed',
        result: {
          code: result.code,
          interrupted: result.interrupted,
        },
        endTime: Date.now(),
      };
    });
    
    // 发送完成通知
    enqueueTaskNotification(
      taskId, 
      wasKilled ? 'killed' : result.code === 0 ? 'completed' : 'failed',
      description
    );
    
    // 清理任务输出
    void evictTaskOutput(taskId);
  });
  
  const handle: TaskHandle = {
    taskId,
    cleanup: () => {
      shellCommand.kill();
    },
  };
  
  // 注册任务句柄
  registerTaskHandle(taskId, handle);
  
  return handle;
}

// 停止Shell任务
export async function killShellTask(
  taskId: string,
  setAppState: (updater: (prev: any) => any) => void,
): Promise<void> {
  // 这里可以实现具体的停止逻辑
  // 目前通过killTask函数统一处理
}
