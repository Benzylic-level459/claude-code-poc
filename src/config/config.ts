import dotenv from 'dotenv';
import { z } from 'zod';

// 加载环境变量
dotenv.config();

// 配置模式
const configSchema = z.object({
  // API 配置
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LOCAL_MODEL_ENDPOINT: z.string().default('http://localhost:11434/api/generate'),
  
  // 应用配置
  APP_NAME: z.string().default('FuPaw POC'),
  APP_VERSION: z.string().default('1.0.0'),
  
  // 模型配置
  DEFAULT_MODEL: z.string().default('qwen2:0.5b'),
  
  // 工具配置
  MAX_FILE_SIZE: z.union([z.number(), z.string().transform(Number)]).default(1024 * 1024), // 1MB
  MAX_COMMAND_OUTPUT: z.union([z.number(), z.string().transform(Number)]).default(1024 * 100), // 100KB
  
  // 会话配置
  SESSION_TIMEOUT: z.union([z.number(), z.string().transform(Number)]).default(3600000), // 1小时
});

// 验证配置
const config = configSchema.parse(process.env);

export default config;