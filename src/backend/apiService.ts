import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import config from '../config/config';

// API 服务类
export class ApiService {
  private anthropic: Anthropic | null = null;
  
  constructor() {
    // 初始化 Anthropic 客户端
    if (config.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
      });
    }
  }
  
  // 检查 API 配置
  hasApiConfig(): boolean {
    return !!config.ANTHROPIC_API_KEY || !!config.LOCAL_MODEL_ENDPOINT;
  }
  
  // 发送消息到 LLM
  async sendMessage(
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      system?: string;
    }
  ) {
    // 优先使用本地模型
    if (config.LOCAL_MODEL_ENDPOINT) {
      return this.sendToLocalModel(messages, options);
    }
    
    // 回退到 Anthropic API
    if (!this.anthropic) {
      throw new Error('No API configured');
    }
    
    try {
      const response = await this.anthropic.messages.create({
        model: options?.model || config.DEFAULT_MODEL,
        messages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 1024,
        system: options?.system,
      });
      
      return response;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }
  
  // 流式发送消息
  async *streamMessage(
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      system?: string;
    }
  ) {
    // 优先使用本地模型
    if (config.LOCAL_MODEL_ENDPOINT) {
      yield* this.streamToLocalModel(messages, options);
      return;
    }
    
    // 回退到 Anthropic API
    if (!this.anthropic) {
      throw new Error('No API configured');
    }
    
    try {
      const stream = await this.anthropic.messages.create({
        model: options?.model || config.DEFAULT_MODEL,
        messages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 1024,
        stream: true,
        system: options?.system,
      });
      
      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error) {
      console.error('Streaming API request failed:', error);
      throw error;
    }
  }
  
  // 发送消息到本地模型
  private async sendToLocalModel(
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      system?: string;
    }
  ) {
    try {
      // 构建提示
      let prompt = '';
      if (options?.system) {
        prompt += options.system + '\n\n';
      }
      
      for (const message of messages) {
        if (message.role === 'user') {
          prompt += '用户: ' + message.content + '\n';
        } else {
          prompt += '助手: ' + message.content + '\n';
        }
      }
      
      prompt += '助手: ';
      
      const response = await axios.post(config.LOCAL_MODEL_ENDPOINT, {
        model: options?.model || config.DEFAULT_MODEL,
        prompt,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 1024,
        stream: false,
        keep_alive: '2h',
      });
      
      // 转换响应格式
      return {
        id: 'local-' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: response.data.response,
          },
        ],
        model: options?.model || config.DEFAULT_MODEL,
        stop_reason: response.data.stop_reason,
        usage: {
          input_tokens: response.data.prompt_tokens || 0,
          output_tokens: response.data.completion_tokens || 0,
        },
      };
    } catch (error) {
      console.error('Local model request failed:', error);
      throw error;
    }
  }
  
  // 流式发送消息到本地模型
  private async *streamToLocalModel(
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      system?: string;
    }
  ) {
    try {
      // 构建提示
      let prompt = '';
      if (options?.system) {
        prompt += options.system + '\n\n';
      }
      
      for (const message of messages) {
        if (message.role === 'user') {
          prompt += '用户: ' + message.content + '\n';
        } else {
          prompt += '助手: ' + message.content + '\n';
        }
      }
      
      prompt += '助手: ';
      
      const response = await axios.post(config.LOCAL_MODEL_ENDPOINT, {
        model: options?.model || config.DEFAULT_MODEL,
        prompt,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 1024,
        stream: true,
        keep_alive: '2h',
      }, {
        responseType: 'stream',
      });
      
      // 处理流式响应
      let buffer = '';
      for await (const chunk of response.data) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line.replace('data: ', ''));
              if (data.response) {
                yield {
                  type: 'content_block_delta',
                  delta: {
                    text: data.response,
                  },
                };
              }
              if (data.done) {
                break;
              }
            } catch (error) {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error) {
      console.error('Local model streaming request failed:', error);
      throw error;
    }
  }
  
  // 获取模型列表
  async getModels() {
    // 这里可以添加获取可用模型列表的逻辑
    return [
      'qwen2:0.5b',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240229',
    ];
  }
}