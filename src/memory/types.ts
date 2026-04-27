// 内存层级
export type MemoryLevel = 'short' | 'medium' | 'long';

// 内存项
export type MemoryItem = {
  id: string;
  content: string;
  metadata: MemoryMetadata;
  createdAt: Date;
  updatedAt: Date;
  level: MemoryLevel;
};

// 内存元数据
export type MemoryMetadata = {
  type: string;           // 内存类型（如 'code', 'conversation', 'tool_result' 等）
  tags: string[];         // 标签
  relevance: number;      // 相关性分数（0-1）
  source: string;         // 来源
  userId: string;         // 用户ID
  sessionId?: string;     // 会话ID
  expireAt?: Date;        // 过期时间
};

// 内存查询参数
export type MemoryQuery = {
  query: string;          // 查询文本
  limit?: number;         // 返回数量限制
  levels?: MemoryLevel[]; // 内存层级
  tags?: string[];        // 标签过滤
  types?: string[];       // 类型过滤
  relevanceThreshold?: number; // 相关性阈值
};

// 内存统计
export type MemoryStats = {
  totalItems: number;
  itemsByLevel: Record<MemoryLevel, number>;
  itemsByType: Record<string, number>;
  memorySize: number;     // 内存大小（字节）
  lastCleanup: Date | null;
};

// 熔断状态
export type CircuitState = 'closed' | 'open' | 'half-open';

// 熔断配置
export type CircuitConfig = {
  failureThreshold: number;  // 失败阈值
  resetTimeout: number;      // 重置超时（毫秒）
  successThreshold: number;  // 成功阈值
};
