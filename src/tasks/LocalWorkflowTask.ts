import { LocalWorkflowTaskState, TaskHandle, TaskContext, WorkflowStep, TaskStatus } from './types';
import { createTaskStateBase, registerTask, updateTaskState, enqueueTaskNotification, registerTaskHandle } from './framework';
import { ToolRegistry } from '../backend/toolSystem';
import { randomUUID } from 'crypto';

// 启动本地工作流任务
export async function spawnLocalWorkflowTask(
  input: {
    description: string;
    steps: Omit<WorkflowStep, 'id' | 'status'>[];
    toolUseId?: string;
  },
  context: TaskContext,
): Promise<TaskHandle> {
  const { description, steps, toolUseId } = input;
  const { setAppState, cwd, userId } = context;

  // 创建任务状态
  const taskId = randomUUID();
  
  // 为每个步骤生成ID并设置初始状态
  const workflowSteps = steps.map((step, index) => ({
    ...step,
    id: step.id || `step-${index + 1}`,
    status: 'pending' as TaskStatus,
  }));
  
  const taskState: LocalWorkflowTaskState = {
    ...createTaskStateBase(taskId, 'local_workflow', description, toolUseId),
    type: 'local_workflow',
    status: 'running',
    steps: workflowSteps,
    currentStep: 0,
    startTime: Date.now(),
  };
  
  // 注册任务
  registerTask(taskState, setAppState);
  
  // 执行工作流
  void executeWorkflow(taskId, workflowSteps, context);
  
  const handle: TaskHandle = {
    taskId,
    cleanup: () => {
      // 这里可以实现清理逻辑
      updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, (task) => ({
        ...task,
        status: 'killed',
        endTime: Date.now(),
      }));
    },
  };
  
  // 注册任务句柄
  registerTaskHandle(taskId, handle);
  
  return handle;
}

// 执行工作流
async function executeWorkflow(
  taskId: string,
  steps: WorkflowStep[],
  context: TaskContext,
): Promise<void> {
  const { setAppState, cwd, userId } = context;
  const toolRegistry = new ToolRegistry();
  
  const results: Record<string, any> = {};
  let currentStepIndex = 0;
  
  while (currentStepIndex < steps.length) {
    const step = steps[currentStepIndex];
    
    // 检查依赖
    if (!areDependenciesMet(step, results)) {
      // 依赖未满足，跳过当前步骤
      currentStepIndex++;
      continue;
    }
    
    // 更新步骤状态为运行中
    updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, (task) => {
      const updatedSteps = task.steps.map((s) => 
        s.id === step.id ? { ...s, status: 'running' } : s
      );
      return {
        ...task,
        steps: updatedSteps,
        currentStep: currentStepIndex,
      };
    });
    
    try {
      // 准备工具输入（支持使用前面步骤的结果）
      const toolInput = resolveStepInput(step.input, results);
      
      // 执行工具
      const toolContext = {
        cwd,
        userId,
        sessionId: taskId,
      };
      
      const toolResult = await toolRegistry.executeTool(step.toolName, toolInput, toolContext);
      
      // 存储步骤结果
      results[step.id] = toolResult;
      
      // 更新步骤状态为完成
      updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, (task) => {
        const updatedSteps = task.steps.map((s) => 
          s.id === step.id ? { ...s, status: 'completed', result: toolResult } : s
        );
        return {
          ...task,
          steps: updatedSteps,
        };
      });
      
    } catch (error) {
      // 更新步骤状态为失败
      updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, (task) => {
        const updatedSteps = task.steps.map((s) => 
          s.id === step.id ? { ...s, status: 'failed', result: String(error) } : s
        );
        return {
          ...task,
          steps: updatedSteps,
          status: 'failed',
          endTime: Date.now(),
        };
      });
      
      // 发送失败通知
      enqueueTaskNotification(taskId, 'failed', `${taskId} - Step ${step.name} failed`);
      return;
    }
    
    currentStepIndex++;
  }
  
  // 所有步骤完成
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, (task) => ({
    ...task,
    status: 'completed',
    result: results,
    endTime: Date.now(),
  }));
  
  // 发送完成通知
  enqueueTaskNotification(taskId, 'completed', taskId);
}

// 检查依赖是否满足
function areDependenciesMet(step: WorkflowStep, results: Record<string, any>): boolean {
  if (!step.dependencies || step.dependencies.length === 0) {
    return true;
  }
  
  return step.dependencies.every((depId) => results[depId] !== undefined);
}

// 解析步骤输入（支持引用前面步骤的结果）
function resolveStepInput(input: Record<string, any>, results: Record<string, any>): Record<string, any> {
  const resolvedInput: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.startsWith('$result.')) {
      // 引用前面步骤的结果
      const parts = value.slice('$result.'.length).split('.');
      let result = results;
      
      for (const part of parts) {
        if (result[part] !== undefined) {
          result = result[part];
        } else {
          result = undefined;
          break;
        }
      }
      
      resolvedInput[key] = result;
    } else {
      resolvedInput[key] = value;
    }
  }
  
  return resolvedInput;
}
