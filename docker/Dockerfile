# 使用 Node.js 18 作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制源代码
COPY src/ ./src/
COPY tsconfig.json ./

# 构建项目
RUN npm run build

# 复制 .env 文件（如果存在）
COPY .env* ./

# 设置环境变量
ENV NODE_ENV=production

# 暴露端口（如果需要）
# EXPOSE 3000

# 运行命令
CMD ["npm", "start"]
