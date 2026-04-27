import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from '../backend/toolSystem';
import { spawnShellTask } from '../tasks/LocalShellTask';
import { spawnLocalAgentTask } from '../tasks/LocalAgentTask';
import { spawnLocalWorkflowTask } from '../tasks/LocalWorkflowTask';
import { TaskType } from '../tasks/types';

// 任务创建工具输入模式
const taskCreateInputSchema = z.object({
  type: z.enum(['local_bash', 'local_agent', 'local_workflow']).describe('任务类型'),
  description: z.string().describe('任务描述'),
  command: z.string().optional().describe('Bash命令（仅local_bash类型需要）'),
  prompt: z.string().optional().describe('代理提示词（仅local_agent类型需要）'),
  steps: z.array(z.object({
    name: z.string().describe('步骤名称'),
    description: z.string().describe('步骤描述'),
    toolName: z.string().describe('工具名称'),
    input: z.record(z.string(), z.any()).describe('工具输入'),
    dependencies: z.array(z.string()).optional().describe('依赖的步骤ID'),
  })).optional().describe('工作流步骤（仅local_workflow类型需要）'),
  subagentType: z.string().optional().describe('子代理类型（仅local_agent类型需要）'),
  model: z.string().optional().describe('使用的模型（仅local_agent类型需要）'),
});

export class TaskCreateTool implements Tool {
  name = 'task_create';
  description = '创建和管理任务，支持本地Bash、本地代理和工作流任务';
  inputSchema = taskCreateInputSchema;

  async call(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const validatedInput = this.inputSchema.parse(input);
      
      let taskHandle;
      
      switch (validatedInput.type) {
        case 'local_bash':
          if (!validatedInput.command) {
            return {
              data: {},
              success: false,
              error: 'Bash命令不能为空',
            };
          }
          taskHandle = await spawnShellTask({
            command: validatedInput.command,
            description: validatedInput.description,
            agentId: context.userId,
          }, {
            cwd: context.cwd,
            setAppState: (updater) => {
              // 这里可以实现状态更新逻辑
              console.log('Updating app state');
            },
            getAppState: () => ({}),
            userId: context.userId,
          });
          break;
          
        case 'local_agent':
          if (!validatedInput.prompt) {
            return {
              data: {},
              success: false,
              error: '代理提示词不能为空',
            };
          }
          taskHandle = await spawnLocalAgentTask({
            description: validatedInput.description,
            prompt: validatedInput.prompt,
            subagentType: validatedInput.subagentType,
            model: validatedInput.model,
          }, {
            cwd: context.cwd,
            setAppState: (updater) => {
              console.log('Updating app state');
            },
            getAppState: () => ({}),
            userId: context.userId,
          });
          break;
          
        case 'local_workflow':
          if (!validatedInput.steps || validatedInput.steps.length === 0) {
            return {
              data: {},
              success: false,
              error: '工作流步骤不能为空',
            };
          }
          taskHandle = await spawnLocalWorkflowTask({
            description: validatedInput.description,
            steps: validatedInput.steps,
          }, {
            cwd: context.cwd,
            setAppState: (updater) => {
              console.log('Updating app state');
            },
            getAppState: () => ({}),
            userId: context.userId,
          });
          break;
          
        default:
          return {
            data: {},
            success: false,
            error: '不支持的任务类型',
          };
      }
      
      return {
        data: {
          taskId: taskHandle.taskId,
          message: `任务创建成功: ${validatedInput.description}`,
        },
        success: true,
      };
    } catch (error) {
      return {
        data: {},
        success: false,
        error: error instanceof Error ? error.message : '任务创建失败',
      };
    }
  }
}
