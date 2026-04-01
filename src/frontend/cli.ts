import { Command } from 'commander';
import chalk from 'chalk';
import { ApiService } from '../backend/apiService';
import { ToolRegistry } from '../backend/toolSystem';
import { QueryEngine } from '../backend/queryEngine';
import config from '../config/config';
import { randomUUID } from 'crypto';
import * as readline from 'readline';

// 创建命令行界面
const program = new Command();

// 初始化服务
const apiService = new ApiService();
const toolRegistry = new ToolRegistry();
const userId = randomUUID();
const cwd = process.cwd();
const queryEngine = new QueryEngine({
  apiService,
  toolRegistry,
  userId,
  cwd,
});

// 全局会话ID
let currentSessionId: string | null = null;

// 命令行界面配置
program
  .name('claude-code-poc')
  .description('Claude Code POC - 基于核心设计理念的小型版本')
  .version(config.APP_VERSION);

// 启动交互式会话
program
  .command('chat')
  .description('启动交互式聊天会话')
  .action(async () => {
    if (!apiService.hasApiConfig()) {
      console.error(chalk.red('错误: 未配置 API，请设置 LOCAL_MODEL_ENDPOINT 环境变量'));
      process.exit(1);
    }

    // 创建新会话
    currentSessionId = queryEngine.createSession();
    console.log(chalk.blue(`会话已创建，ID: ${currentSessionId}`));
    console.log(chalk.green('欢迎使用 Claude Code POC！输入你的问题，或输入 exit 退出。'));

    // 创建 readline 接口
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
    });

    rl.prompt();

    rl.on('line', async (input) => {
      if (input.trim() === 'exit') {
        rl.close();
        return;
      }

      try {
        console.log(chalk.yellow('思考中...'));
        
        // 处理用户输入
        const messages = await queryEngine.processUserInput(currentSessionId!, input);
        
        // 显示结果
        for (const message of messages) {
          if (message.role === 'assistant') {
            console.log(chalk.green('Claude:'));
            console.log(message.content);
          } else if (message.role === 'tool') {
            console.log(chalk.cyan('工具执行:'));
            console.log(`工具: ${message.tool_name}`);
            console.log(`结果: ${message.content}`);
          }
        }
      } catch (error) {
        console.error(chalk.red('错误:', error instanceof Error ? error.message : error));
      } finally {
        rl.prompt();
      }
    });

    rl.on('close', () => {
      console.log(chalk.blue('会话已结束'));
      if (currentSessionId) {
        queryEngine.cleanupSession(currentSessionId);
      }
      process.exit(0);
    });
  });

// 执行单个查询
program
  .command('query')
  .description('执行单个查询')
  .argument('<query>', '查询内容')
  .action(async (query) => {
    if (!apiService.hasApiConfig()) {
      console.error(chalk.red('错误: 未配置 API，请设置 LOCAL_MODEL_ENDPOINT 环境变量'));
      process.exit(1);
    }

    // 创建临时会话
    const sessionId = queryEngine.createSession();

    try {
      console.log(chalk.yellow('思考中...'));
      
      // 处理用户输入
      const messages = await queryEngine.processUserInput(sessionId, query);
      
      // 显示结果
      for (const message of messages) {
        if (message.role === 'assistant') {
          console.log(chalk.green('Claude:'));
          console.log(message.content);
        } else if (message.role === 'tool') {
          console.log(chalk.cyan('工具执行:'));
          console.log(`工具: ${message.tool_name}`);
          console.log(`结果: ${message.content}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('错误:', error instanceof Error ? error.message : error));
    } finally {
      queryEngine.cleanupSession(sessionId);
    }
  });

// 列出可用工具
program
  .command('tools')
  .description('列出可用工具')
  .action(() => {
    console.log(chalk.blue('可用工具:'));
    const tools = toolRegistry.getTools();
    tools.forEach(tool => {
      console.log(`- ${chalk.green(tool.name)}: ${tool.description}`);
    });
  });

// 显示配置信息
program
  .command('config')
  .description('显示配置信息')
  .action(() => {
    console.log(chalk.blue('配置信息:'));
    console.log(`API 配置: ${apiService.hasApiConfig() ? chalk.green('已配置') : chalk.red('未配置')}`);
    console.log(`默认模型: ${chalk.green(config.DEFAULT_MODEL)}`);
    console.log(`当前工作目录: ${chalk.green(cwd)}`);
  });

// 处理未知命令
program.on('command:*', () => {
  console.error(chalk.red('错误: 未知命令'));
  console.log(chalk.blue('可用命令:'));
  program.help();
  process.exit(1);
});

// 解析命令行参数
program.parse(process.argv);

// 如果没有指定命令，显示帮助
if (!program.args.length) {
  program.help();
}