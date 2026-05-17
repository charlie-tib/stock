# Agent4Stock

一个手机优先的股票交易决策 AI 助手 demo，可部署到 Vercel。

当前版本包含：

- PWA 聊天页面
- 移动端适配
- `/api/chat` 后端接口
- DeepSeek API 接入
- 会话参数：标的、模式、周期、仓位、风险偏好

## 本地运行

复制环境变量模板：

```bash
copy .env.local.example .env.local
```

填写：

```env
DEEPSEEK_API_KEY=你的key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=你的模型名
```

安装依赖并启动：

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 部署到 Vercel

1. 把本项目推到 GitHub。
2. 在 Vercel 中选择 `Add New Project`。
3. 导入这个 GitHub 仓库。
4. 在 Vercel 项目的 Environment Variables 中添加：

```env
DEEPSEEK_API_KEY=你的key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=你的模型名
```

5. 点击 Deploy。

部署完成后，手机打开 Vercel 给你的地址即可使用。可以在手机浏览器中选择“添加到主屏幕”，把它作为 PWA 使用。

## 说明

`.env`、`.env.local`、`.vercel` 和 `node_modules` 已经被 `.gitignore` 排除，不会提交到 GitHub。

旧的 Python 本地 demo 文件仍保留在仓库中，后续可以删除或作为本地测试工具继续保留。
