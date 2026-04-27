import { z } from 'zod';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import config from '../config/config';

const execPromise = promisify(exec);

// 工具上下文类型
export interface ToolContext {
  cwd: string;
  userId: string;
  sessionId: string;
}

// 工具结果类型
export interface ToolResult<T = any> {
  data: T;
  success: boolean;
  error?: string;
  messages?: string[];
}

// 工具基础接口
export interface Tool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  call(input: any, context: ToolContext): Promise<ToolResult>;
}

// 文件读取工具
export class FileReadTool implements Tool {
  name = 'file_read';
  description = '读取文件内容';
  inputSchema = z.object({
    file_path: z.string().describe('文件路径'),
  });

  async call(input: { file_path: string }, context: ToolContext): Promise<ToolResult<string>> {
    try {
      const fullPath = input.file_path.startsWith('/') 
        ? input.file_path 
        : `${context.cwd}/${input.file_path}`;
      
      const stats = await fs.stat(fullPath);
      if (stats.size > config.MAX_FILE_SIZE) {
        return {
          data: '',
          success: false,
          error: `文件大小超过限制 (${config.MAX_FILE_SIZE} bytes)`,
        };
      }
      
      const content = await fs.readFile(fullPath, 'utf8');
      return {
        data: content,
        success: true,
      };
    } catch (error) {
      return {
        data: '',
        success: false,
        error: error instanceof Error ? error.message : '读取文件失败',
      };
    }
  }
}

// 文件写入工具
export class FileWriteTool implements Tool {
  name = 'file_write';
  description = '写入文件内容';
  inputSchema = z.object({
    file_path: z.string().describe('文件路径'),
    content: z.string().describe('文件内容'),
  });

  async call(input: { file_path: string; content: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const fullPath = input.file_path.startsWith('/') 
        ? input.file_path 
        : `${context.cwd}/${input.file_path}`;
      
      // 确保目录存在
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (dir) {
        await fs.mkdir(dir, { recursive: true });
      }
      
      await fs.writeFile(fullPath, input.content, 'utf8');
      return {
        data: { file_path: fullPath },
        success: true,
      };
    } catch (error) {
      return {
        data: {},
        success: false,
        error: error instanceof Error ? error.message : '写入文件失败',
      };
    }
  }
}

// Bash执行工具
export class BashTool implements Tool {
  name = 'bash';
  description = '执行Bash命令';
  inputSchema = z.object({
    command: z.string().describe('Bash命令'),
    cwd: z.string().optional().describe('工作目录'),
  });

  async call(input: { command: string; cwd?: string }, context: ToolContext): Promise<ToolResult<{ stdout: string; stderr: string }>> {
    try {
      const workingDir = input.cwd || context.cwd;
      const { stdout, stderr } = await execPromise(input.command, { cwd: workingDir });
      
      // 限制输出大小
      const limitedStdout = stdout.length > config.MAX_COMMAND_OUTPUT 
        ? stdout.substring(0, config.MAX_COMMAND_OUTPUT) + '... (truncated)' 
        : stdout;
      const limitedStderr = stderr.length > config.MAX_COMMAND_OUTPUT 
        ? stderr.substring(0, config.MAX_COMMAND_OUTPUT) + '... (truncated)' 
        : stderr;
      
      return {
        data: { stdout: limitedStdout, stderr: limitedStderr },
        success: true,
      };
    } catch (error: any) {
      return {
        data: { stdout: error.stdout || '', stderr: error.stderr || '' },
        success: false,
        error: error.message || '执行命令失败',
      };
    }
  }
}

// 工具注册表
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor() {
    // 注册默认工具
    this.registerTool(new FileReadTool());
    this.registerTool(new FileWriteTool());
    this.registerTool(new BashTool());
    
    // 注册任务和内存工具
    try {
      const { TaskCreateTool } = require('../tools/TaskCreateTool');
      const { MemoryTool } = require('../tools/MemoryTool');
      this.registerTool(new TaskCreateTool());
      this.registerTool(new MemoryTool());
    } catch (error) {
      console.warn('Failed to load additional tools:', error);
    }
  }

  // 注册工具
  registerTool(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  // 获取工具
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  // 获取所有工具
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  // 执行工具
  async executeTool(name: string, input: any, context: ToolContext): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return {
        data: {},
        success: false,
        error: `工具 ${name} 不存在`,
      };
    }

    try {
      // 验证输入
      const validatedInput = tool.inputSchema.parse(input);
      return await tool.call(validatedInput, context);
    } catch (error) {
      return {
        data: {},
        success: false,
        error: error instanceof Error ? error.message : '工具执行失败',
      };
    }
  }
}