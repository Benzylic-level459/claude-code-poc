import { LocalAgentTaskState, TaskHandle, TaskContext } from './types';
import { createTaskStateBase, registerTask, updateTaskState, enqueueTaskNotification, TaskOutput, registerTaskHandle } from './framework';
import { QueryEngine } from '../backend/queryEngine';
import { ApiService } from '../backend/apiService';
import { ToolRegistry } from '../backend/toolSystem';

// 启动本地代理任务
export async function spawnLocalAgentTask(
  input: {
    description: string;
    prompt: string;
    subagentType?: string;
    model?: string;
    toolUseId?: string;
  },
  context: TaskContext,
): Promise<TaskHandle> {
  const { description, prompt, subagentType, model, toolUseId } = input;
  const { setAppState, cwd, userId } = context;

  // 创建任务输出
  const taskOutput = new TaskOutput();
  const taskId = taskOutput.taskId;
  
  // 创建任务状态
  const taskState: LocalAgentTaskState = {
    ...createTaskStateBase(taskId, 'local_agent', description, toolUseId),
    type: 'local_agent',
    status: 'running',
    prompt,
    subagentType,
    model,
    outputFile: taskOutput.path,
    startTime: Date.now(),
  };
  
  // 注册任务
  registerTask(taskState, setAppState);
  
  // 创建必要的服务
  const apiService = new ApiService();
  const toolRegistry = new ToolRegistry();
  
  // 创建 QueryEngine
  const queryEngine = new QueryEngine({
    apiService,
    toolRegistry,
    userId,
    cwd,
  });
  
  // 异步执行代理
  void (async () => {
    try {
      // 创建会话
      const sessionId = queryEngine.createSession();
      
      // 处理用户输入
      const messages = await queryEngine.processUserInput(sessionId, prompt);
      
      // 收集结果
      let result = '';
      for (const message of messages) {
        if (message.role === 'assistant') {
          result += message.content + '\n';
          await taskOutput.write(`Assistant: ${message.content}\n`);
        } else if (message.role === 'tool') {
          await taskOutput.write(`Tool: ${message.tool_name}\nResult: ${message.content}\n`);
        }
      }
      
      // 更新任务状态为完成
      updateTaskState<LocalAgentTaskState>(taskId, setAppState, (task) => ({
        ...task,
        status: 'completed',
        result,
        endTime: Date.now(),
      }));
      
      // 发送通知
      enqueueTaskNotification(taskId, 'completed', description);
      
    } catch (error) {
      // 更新任务状态为失败
      updateTaskState<LocalAgentTaskState>(taskId, setAppState, (task) => ({
        ...task,
        status: 'failed',
        result: String(error),
        endTime: Date.now(),
      }));
      
      enqueueTaskNotification(taskId, 'failed', description);
    } finally {
      // 关闭任务输出
      await taskOutput.close();
    }
  })();
  
  const handle: TaskHandle = {
    taskId,
    cleanup: () => {
      // 这里可以实现清理逻辑
    },
  };
  
  // 注册任务句柄
  registerTaskHandle(taskId, handle);
  
  return handle;
}
