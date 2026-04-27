import { MemoryItem, MemoryLevel, MemoryQuery, MemoryStats, MemoryMetadata, CircuitState, CircuitConfig } from './types';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

// 默认熔断配置
const DEFAULT_CIRCUIT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  resetTimeout: 30000, // 30秒
  successThreshold: 3,
};

// 内存项过期时间配置（毫秒）
const MEMORY_EXPIRY: Record<MemoryLevel, number> = {
  short: 3600000,     // 1小时
  medium: 86400000,    // 24小时
  long: 2592000000,    // 30天
};

// 内存大小限制（字节）
const MEMORY_SIZE_LIMIT: Record<MemoryLevel, number> = {
  short: 1024 * 1024,    // 1MB
  medium: 10 * 1024 * 1024, // 10MB
  long: 100 * 1024 * 1024, // 100MB
};

// 内存管理器类
export class MemoryManager {
  private memoryStore: Map<string, MemoryItem> = new Map();
  private circuitState: CircuitState = 'closed';
  private circuitConfig: CircuitConfig;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private memoryDir: string;

  constructor(memoryDir?: string) {
    this.circuitConfig = DEFAULT_CIRCUIT_CONFIG;
    this.memoryDir = memoryDir || path.join(process.env.TEMP || process.env.TMPDIR || './temp', 'fupaw-memory');
    this.init();
  }

  // 初始化
  private async init() {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });
      await this.loadFromDisk();
    } catch (error) {
      console.error('Memory initialization failed:', error);
    }
  }

  // 从磁盘加载内存
  private async loadFromDisk() {
    try {
      const files = await fs.readdir(this.memoryDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.memoryDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const memoryItem = JSON.parse(content);
          // 转换日期字符串为Date对象
          memoryItem.createdAt = new Date(memoryItem.createdAt);
          memoryItem.updatedAt = new Date(memoryItem.updatedAt);
          if (memoryItem.metadata.expireAt) {
            memoryItem.metadata.expireAt = new Date(memoryItem.metadata.expireAt);
          }
          this.memoryStore.set(memoryItem.id, memoryItem);
        }
      }
      // 清理过期内存
      await this.cleanupExpired();
    } catch (error) {
      console.error('Failed to load memory from disk:', error);
    }
  }

  // 保存内存到磁盘
  private async saveToDisk(item: MemoryItem) {
    try {
      const filePath = path.join(this.memoryDir, `${item.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(item, null, 2));
    } catch (error) {
      console.error('Failed to save memory to disk:', error);
    }
  }

  // 添加内存项
  async addMemory(
    content: string,
    metadata: Omit<MemoryMetadata, 'relevance'>,
    level: MemoryLevel = 'medium'
  ): Promise<MemoryItem> {
    // 检查熔断状态
    if (this.circuitState === 'open') {
      if (Date.now() - this.lastFailureTime < this.circuitConfig.resetTimeout) {
        throw new Error('Memory service is in circuit open state');
      } else {
        // 尝试半开状态
        this.circuitState = 'half-open';
        this.successCount = 0;
      }
    }

    try {
      const memoryItem: MemoryItem = {
        id: randomUUID(),
        content,
        metadata: {
          ...metadata,
          relevance: 0.5, // 默认相关性
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        level,
      };

      // 设置过期时间
      if (!memoryItem.metadata.expireAt) {
        memoryItem.metadata.expireAt = new Date(Date.now() + MEMORY_EXPIRY[level]);
      }

      // 添加到内存存储
      this.memoryStore.set(memoryItem.id, memoryItem);

      // 保存到磁盘
      await this.saveToDisk(memoryItem);

      // 检查内存大小限制
      await this.checkSizeLimit(level);

      // 更新熔断状态
      this.updateCircuitState('success');

      return memoryItem;
    } catch (error) {
      // 更新熔断状态
      this.updateCircuitState('failure');
      throw error;
    }
  }

  // 查询内存
  async queryMemory(query: MemoryQuery): Promise<MemoryItem[]> {
    // 检查熔断状态
    if (this.circuitState === 'open') {
      if (Date.now() - this.lastFailureTime < this.circuitConfig.resetTimeout) {
        throw new Error('Memory service is in circuit open state');
      } else {
        // 尝试半开状态
        this.circuitState = 'half-open';
        this.successCount = 0;
      }
    }

    try {
      const { query: queryText, limit = 10, levels, tags, types, relevanceThreshold = 0.3 } = query;

      // 过滤内存项
      const filteredItems = Array.from(this.memoryStore.values()).filter((item) => {
        // 检查层级
        if (levels && !levels.includes(item.level)) {
          return false;
        }

        // 检查标签
        if (tags && tags.length > 0) {
          const hasTag = tags.some((tag) => item.metadata.tags.includes(tag));
          if (!hasTag) {
            return false;
          }
        }

        // 检查类型
        if (types && !types.includes(item.metadata.type)) {
          return false;
        }

        // 检查相关性
        if (item.metadata.relevance < relevanceThreshold) {
          return false;
        }

        // 检查是否过期
        if (item.metadata.expireAt && new Date() > item.metadata.expireAt) {
          return false;
        }

        // 简单的文本匹配
        const contentLower = item.content.toLowerCase();
        const queryLower = queryText.toLowerCase();
        return contentLower.includes(queryLower) || 
               item.metadata.tags.some(tag => tag.toLowerCase().includes(queryLower));
      });

      // 按相关性和更新时间排序
      filteredItems.sort((a, b) => {
        // 首先按相关性排序
        if (b.metadata.relevance !== a.metadata.relevance) {
          return b.metadata.relevance - a.metadata.relevance;
        }
        // 然后按更新时间排序
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });

      // 限制返回数量
      const result = filteredItems.slice(0, limit);

      // 更新熔断状态
      this.updateCircuitState('success');

      return result;
    } catch (error) {
      // 更新熔断状态
      this.updateCircuitState('failure');
      throw error;
    }
  }

  // 获取内存项
  async getMemory(id: string): Promise<MemoryItem | undefined> {
    try {
      const item = this.memoryStore.get(id);
      if (item) {
        // 检查是否过期
        if (item.metadata.expireAt && new Date() > item.metadata.expireAt) {
          await this.deleteMemory(id);
          return undefined;
        }
        return item;
      }
      return undefined;
    } catch (error) {
      this.updateCircuitState('failure');
      throw error;
    }
  }

  // 更新内存项
  async updateMemory(
    id: string,
    updates: Partial<MemoryItem>
  ): Promise<MemoryItem | undefined> {
    try {
      const item = this.memoryStore.get(id);
      if (item) {
        const updatedItem = {
          ...item,
          ...updates,
          updatedAt: new Date(),
        };
        this.memoryStore.set(id, updatedItem);
        await this.saveToDisk(updatedItem);
        this.updateCircuitState('success');
        return updatedItem;
      }
      return undefined;
    } catch (error) {
      this.updateCircuitState('failure');
      throw error;
    }
  }

  // 删除内存项
  async deleteMemory(id: string): Promise<boolean> {
    try {
      if (this.memoryStore.has(id)) {
        this.memoryStore.delete(id);
        // 删除磁盘文件
        const filePath = path.join(this.memoryDir, `${id}.json`);
        try {
          await fs.unlink(filePath);
        } catch {
          // 文件可能不存在，忽略
        }
        this.updateCircuitState('success');
        return true;
      }
      return false;
    } catch (error) {
      this.updateCircuitState('failure');
      throw error;
    }
  }

  // 清理过期内存
  async cleanupExpired(): Promise<number> {
    try {
      const now = new Date();
      const expiredIds: string[] = [];

      for (const [id, item] of this.memoryStore.entries()) {
        if (item.metadata.expireAt && now > item.metadata.expireAt) {
          expiredIds.push(id);
        }
      }

      for (const id of expiredIds) {
        await this.deleteMemory(id);
      }

      return expiredIds.length;
    } catch (error) {
      console.error('Cleanup failed:', error);
      return 0;
    }
  }

  // 检查内存大小限制
  private async checkSizeLimit(level: MemoryLevel) {
    let levelSize = 0;
    const levelItems: string[] = [];

    // 计算当前层级的内存大小
    for (const [id, item] of this.memoryStore.entries()) {
      if (item.level === level) {
        levelSize += Buffer.byteLength(JSON.stringify(item));
        levelItems.push(id);
      }
    }

    // 如果超过限制，删除最旧的项目
    if (levelSize > MEMORY_SIZE_LIMIT[level]) {
      // 按创建时间排序
      const sortedItems = levelItems
        .map(id => this.memoryStore.get(id)!)  
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // 删除最旧的项目直到满足限制
      let currentSize = levelSize;
      for (const item of sortedItems) {
        if (currentSize <= MEMORY_SIZE_LIMIT[level]) {
          break;
        }
        const itemSize = Buffer.byteLength(JSON.stringify(item));
        await this.deleteMemory(item.id);
        currentSize -= itemSize;
      }
    }
  }

  // 获取内存统计
  async getStats(): Promise<MemoryStats> {
    try {
      const items = Array.from(this.memoryStore.values());
      const itemsByLevel: Record<MemoryLevel, number> = {
        short: 0,
        medium: 0,
        long: 0,
      };
      const itemsByType: Record<string, number> = {};
      let memorySize = 0;

      for (const item of items) {
        itemsByLevel[item.level]++;
        itemsByType[item.metadata.type] = (itemsByType[item.metadata.type] || 0) + 1;
        memorySize += Buffer.byteLength(JSON.stringify(item));
      }

      return {
        totalItems: items.length,
        itemsByLevel,
        itemsByType,
        memorySize,
        lastCleanup: new Date(),
      };
    } catch (error) {
      this.updateCircuitState('failure');
      throw error;
    }
  }

  // 更新熔断状态
  private updateCircuitState(result: 'success' | 'failure') {
    if (result === 'success') {
      if (this.circuitState === 'half-open') {
        this.successCount++;
        if (this.successCount >= this.circuitConfig.successThreshold) {
          this.circuitState = 'closed';
          this.failureCount = 0;
          this.successCount = 0;
        }
      }
    } else {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.circuitConfig.failureThreshold) {
        this.circuitState = 'open';
      }
    }
  }

  // 获取熔断状态
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  // 重置熔断状态
  resetCircuit() {
    this.circuitState = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
  }
}

// 全局内存管理器实例
let memoryManager: MemoryManager | null = null;

// 获取内存管理器实例
export function getMemoryManager(): MemoryManager {
  if (!memoryManager) {
    memoryManager = new MemoryManager();
  }
  return memoryManager;
}
