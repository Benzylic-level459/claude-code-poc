import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from '../backend/toolSystem';
import { getMemoryManager } from '../memory/MemoryManager';
import { MemoryLevel } from '../memory/types';

// 内存操作工具输入模式
const memoryInputSchema = z.discriminatedUnion('action', [
  // 添加内存
  z.object({
    action: z.literal('add'),
    content: z.string().describe('内存内容'),
    type: z.string().describe('内存类型'),
    tags: z.array(z.string()).describe('标签'),
    level: z.enum(['short', 'medium', 'long']).optional().describe('内存层级'),
  }),
  // 查询内存
  z.object({
    action: z.literal('query'),
    query: z.string().describe('查询文本'),
    limit: z.number().optional().describe('返回数量限制'),
    levels: z.array(z.enum(['short', 'medium', 'long'])).optional().describe('内存层级'),
    tags: z.array(z.string()).optional().describe('标签过滤'),
    types: z.array(z.string()).optional().describe('类型过滤'),
  }),
  // 获取内存
  z.object({
    action: z.literal('get'),
    id: z.string().describe('内存ID'),
  }),
  // 删除内存
  z.object({
    action: z.literal('delete'),
    id: z.string().describe('内存ID'),
  }),
  // 获取内存统计
  z.object({
    action: z.literal('stats'),
  }),
]);

export class MemoryTool implements Tool {
  name = 'memory';
  description = '管理内存，支持添加、查询、获取和删除内存项';
  inputSchema = memoryInputSchema;

  async call(input: any, context: ToolContext): Promise<ToolResult> {
    try {
      const validatedInput = this.inputSchema.parse(input);
      const memoryManager = getMemoryManager();
      
      switch (validatedInput.action) {
        case 'add':
          const memoryItem = await memoryManager.addMemory(
            validatedInput.content,
            {
              type: validatedInput.type,
              tags: validatedInput.tags,
              source: 'user',
              userId: context.userId,
              sessionId: context.sessionId,
            },
            validatedInput.level || 'medium'
          );
          return {
            data: {
              memoryId: memoryItem.id,
              message: '内存添加成功',
            },
            success: true,
          };
          
        case 'query':
          const results = await memoryManager.queryMemory({
            query: validatedInput.query,
            limit: validatedInput.limit,
            levels: validatedInput.levels,
            tags: validatedInput.tags,
            types: validatedInput.types,
          });
          return {
            data: {
              results: results.map(item => ({
                id: item.id,
                content: item.content,
                type: item.metadata.type,
                tags: item.metadata.tags,
                relevance: item.metadata.relevance,
                level: item.level,
                createdAt: item.createdAt,
              })),
              count: results.length,
            },
            success: true,
          };
          
        case 'get':
          const memory = await memoryManager.getMemory(validatedInput.id);
          if (memory) {
            return {
              data: {
                memory: {
                  id: memory.id,
                  content: memory.content,
                  type: memory.metadata.type,
                  tags: memory.metadata.tags,
                  level: memory.level,
                  createdAt: memory.createdAt,
                  updatedAt: memory.updatedAt,
                },
              },
              success: true,
            };
          } else {
            return {
              data: {},
              success: false,
              error: '内存项不存在',
            };
          }
          
        case 'delete':
          const deleted = await memoryManager.deleteMemory(validatedInput.id);
          return {
            data: {
              deleted,
              message: deleted ? '内存删除成功' : '内存项不存在',
            },
            success: true,
          };
          
        case 'stats':
          const stats = await memoryManager.getStats();
          return {
            data: stats,
            success: true,
          };
          
        default:
          return {
            data: {},
            success: false,
            error: '不支持的操作',
          };
      }
    } catch (error) {
      return {
        data: {},
        success: false,
        error: error instanceof Error ? error.message : '内存操作失败',
      };
    }
  }
}
