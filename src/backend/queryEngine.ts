import { ApiService } from './apiService';
import { ToolRegistry, ToolContext, ToolResult } from './toolSystem';
import { randomUUID } from 'crypto';

// 消息类型
export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_name?: string;
  tool_input?: any;
  tool_result?: ToolResult;
}

// 会话状态
export interface SessionState {
  id: string;
  messages: Message[];
  createdAt: Date;
  lastUpdated: Date;
  userId: string;
}

// 查询引擎配置
export interface QueryEngineConfig {
  apiService: ApiService;
  toolRegistry: ToolRegistry;
  userId: string;
  cwd: string;
}

// 查询引擎类
export class QueryEngine {
  private apiService: ApiService;
  private toolRegistry: ToolRegistry;
  private sessions: Map<string, SessionState> = new Map();
  private userId: string;
  private cwd: string;

  constructor(config: QueryEngineConfig) {
    this.apiService = config.apiService;
    this.toolRegistry = config.toolRegistry;
    this.userId = config.userId;
    this.cwd = config.cwd;
  }

  // 创建新会话
  createSession(): string {
    const sessionId = randomUUID();
    const session: SessionState = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
      lastUpdated: new Date(),
      userId: this.userId,
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  // 获取会话
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  // 添加消息到会话
  addMessage(sessionId: string, message: Message): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.lastUpdated = new Date();
    }
  }

  // 处理用户输入
  async processUserInput(sessionId: string, input: string): Promise<Message[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('会话不存在');
    }

    // 添加用户消息
    const userMessage: Message = {
      role: 'user',
      content: input,
    };
    this.addMessage(sessionId, userMessage);

    // 构建系统提示
    const systemContent = "你是一个智能代码助手，帮助用户解决编程问题。\n\n可用工具：\n" + this.toolRegistry.getTools().map(tool => `- ${tool.name}: ${tool.description}`).join('\n') + "\n\n当需要执行工具时，请使用以下格式：\n```tool_call\n{\n  \"tool_name\": \"工具名称\",\n  \"tool_input\": { 工具输入参数 }\n}\n```\n\n当收到工具执行结果时，请基于结果提供最终回答。";

    // 构建消息历史
    const messagesForApi: Array<{ role: 'user' | 'assistant'; content: string }> = session.messages
      .filter(msg => msg.role !== 'system')
      .map(msg => {
        if (msg.role === 'tool') {
          return {
            role: 'assistant' as const,
            content: "工具执行结果：" + JSON.stringify(msg.tool_result),
          };
        }
        if (msg.role === 'user' || msg.role === 'assistant') {
          return {
            role: msg.role,
            content: msg.content,
          };
        }
        return null;
      })
      .filter((msg): msg is { role: 'user' | 'assistant'; content: string } => msg !== null);

    // 发送消息到 LLM
    const response = await this.apiService.sendMessage(messagesForApi, { system: systemContent });

    // 处理 LLM 响应
    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content[0].text || '',
    };
    this.addMessage(sessionId, assistantMessage);

    // 检查是否需要执行工具
    const toolCallMatch = assistantMessage.content.match(/```tool_call\n([\s\S]*?)```/);
    if (toolCallMatch) {
      try {
        const toolCall = JSON.parse(toolCallMatch[1]);
        const toolName = toolCall.tool_name;
        const toolInput = toolCall.tool_input;

        // 执行工具
        const toolContext: ToolContext = {
          cwd: this.cwd,
          userId: this.userId,
          sessionId,
        };

        const toolResult = await this.toolRegistry.executeTool(toolName, toolInput, toolContext);

        // 添加工具消息
        const toolMessage: Message = {
          role: 'tool',
          content: JSON.stringify(toolResult),
          tool_name: toolName,
          tool_input: toolInput,
          tool_result: toolResult,
        };
        this.addMessage(sessionId, toolMessage);

        // 递归处理工具执行结果
        const followUpMessages = await this.processToolResult(sessionId, toolResult);
        return [userMessage, assistantMessage, toolMessage, ...followUpMessages];
      } catch (error) {
        console.error('工具调用解析失败:', error);
        const errorMessage: Message = {
          role: 'assistant',
          content: `工具调用解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
        };
        this.addMessage(sessionId, errorMessage);
        return [userMessage, assistantMessage, errorMessage];
      }
    }

    return [userMessage, assistantMessage];
  }

  // 处理工具执行结果
  private async processToolResult(sessionId: string, toolResult: ToolResult): Promise<Message[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    // 构建系统提示
    const systemContent = "工具执行结果：" + JSON.stringify(toolResult) + "\n\n请基于工具执行结果提供最终回答。";

    // 构建消息历史
    const messagesForApi: Array<{ role: 'user' | 'assistant'; content: string }> = session.messages
      .filter(msg => msg.role !== 'system')
      .map(msg => {
        if (msg.role === 'tool') {
          return {
            role: 'assistant' as const,
            content: "工具执行结果：" + JSON.stringify(msg.tool_result),
          };
        }
        if (msg.role === 'user' || msg.role === 'assistant') {
          return {
            role: msg.role,
            content: msg.content,
          };
        }
        return null;
      })
      .filter((msg): msg is { role: 'user' | 'assistant'; content: string } => msg !== null);

    // 发送消息到 LLM
    const response = await this.apiService.sendMessage(messagesForApi, { system: systemContent });

    // 处理 LLM 响应
    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content[0].text || '',
    };
    this.addMessage(sessionId, assistantMessage);

    // 检查是否需要执行更多工具
    const toolCallMatch = assistantMessage.content.match(/```tool_call\n([\s\S]*?)```/);
    if (toolCallMatch) {
      try {
        const toolCall = JSON.parse(toolCallMatch[1]);
        const toolName = toolCall.tool_name;
        const toolInput = toolCall.tool_input;

        // 执行工具
        const toolContext: ToolContext = {
          cwd: this.cwd,
          userId: this.userId,
          sessionId,
        };

        const newToolResult = await this.toolRegistry.executeTool(toolName, toolInput, toolContext);

        // 添加工具消息
        const toolMessage: Message = {
          role: 'tool',
          content: JSON.stringify(newToolResult),
          tool_name: toolName,
          tool_input: toolInput,
          tool_result: newToolResult,
        };
        this.addMessage(sessionId, toolMessage);

        // 递归处理工具执行结果
        const followUpMessages = await this.processToolResult(sessionId, newToolResult);
        return [assistantMessage, toolMessage, ...followUpMessages];
      } catch (error) {
        console.error('工具调用解析失败:', error);
        const errorMessage: Message = {
          role: 'assistant',
          content: `工具调用解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
        };
        this.addMessage(sessionId, errorMessage);
        return [assistantMessage, errorMessage];
      }
    }

    return [assistantMessage];
  }

  // 流式处理用户输入
  async *streamUserInput(sessionId: string, input: string): AsyncGenerator<Message> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('会话不存在');
    }

    // 添加用户消息
    const userMessage: Message = {
      role: 'user',
      content: input,
    };
    this.addMessage(sessionId, userMessage);
    yield userMessage;

    // 构建系统提示
    const systemContent = "你是一个智能代码助手，帮助用户解决编程问题。\n\n可用工具：\n" + this.toolRegistry.getTools().map(tool => `- ${tool.name}: ${tool.description}`).join('\n') + "\n\n当需要执行工具时，请使用以下格式：\n```tool_call\n{\n  \"tool_name\": \"工具名称\",\n  \"tool_input\": { 工具输入参数 }\n}\n```\n\n当收到工具执行结果时，请基于结果提供最终回答。";

    // 构建消息历史
    const messagesForApi: Array<{ role: 'user' | 'assistant'; content: string }> = session.messages
      .filter(msg => msg.role !== 'system')
      .map(msg => {
        if (msg.role === 'tool') {
          return {
            role: 'assistant' as const,
            content: "工具执行结果：" + JSON.stringify(msg.tool_result),
          };
        }
        if (msg.role === 'user' || msg.role === 'assistant') {
          return {
            role: msg.role,
            content: msg.content,
          };
        }
        return null;
      })
      .filter((msg): msg is { role: 'user' | 'assistant'; content: string } => msg !== null);

    // 流式发送消息到 LLM
    let assistantContent = '';
    for await (const chunk of this.apiService.streamMessage(messagesForApi, { system: systemContent })) {
      if (chunk.type === 'content_block_delta') {
        const text = chunk.delta.text || '';
        assistantContent += text;
        // 这里可以添加实时流式输出逻辑
      }
    }

    // 处理完整的 LLM 响应
    const assistantMessage: Message = {
      role: 'assistant',
      content: assistantContent,
    };
    this.addMessage(sessionId, assistantMessage);
    yield assistantMessage;

    // 检查是否需要执行工具
    const toolCallMatch = assistantMessage.content.match(/```tool_call\n([\s\S]*?)```/);
    if (toolCallMatch) {
      try {
        const toolCall = JSON.parse(toolCallMatch[1]);
        const toolName = toolCall.tool_name;
        const toolInput = toolCall.tool_input;

        // 执行工具
        const toolContext: ToolContext = {
          cwd: this.cwd,
          userId: this.userId,
          sessionId,
        };

        const toolResult = await this.toolRegistry.executeTool(toolName, toolInput, toolContext);

        // 添加工具消息
        const toolMessage: Message = {
          role: 'tool',
          content: JSON.stringify(toolResult),
          tool_name: toolName,
          tool_input: toolInput,
          tool_result: toolResult,
        };
        this.addMessage(sessionId, toolMessage);
        yield toolMessage;

        // 处理工具执行结果
        const followUpMessages = await this.processToolResult(sessionId, toolResult);
        for (const msg of followUpMessages) {
          yield msg;
        }
      } catch (error) {
        console.error('工具调用解析失败:', error);
        const errorMessage: Message = {
          role: 'assistant',
          content: `工具调用解析失败: ${error instanceof Error ? error.message : '未知错误'}`,
        };
        this.addMessage(sessionId, errorMessage);
        yield errorMessage;
      }
    }
  }

  // 清理会话
  cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // 获取所有会话
  getSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }
}