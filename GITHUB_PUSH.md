# 上传到 GitHub 的步骤

本地已完成：`git init`、`.gitignore`、首次提交，当前分支为 `main`。

## 1. 在 GitHub 上创建新仓库

1. 打开 https://github.com/new
2. **Repository name**：例如 `ai-stream-chat`（或任意名称）
3. **Description**（可选）：`AI 流式对话应用，支持智谱 AI / 讯飞星火`
4. 选择 **Public**
5. **不要**勾选 "Add a README file"（本地已有代码）
6. 点击 **Create repository**

## 2. 在本地添加远程并推送

在项目根目录 `222` 下执行（把 `YOUR_USERNAME` 和 `YOUR_REPO` 换成你的 GitHub 用户名和仓库名）：

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

**示例**：用户名为 `zhangsan`，仓库名为 `ai-stream-chat` 时：

```bash
git remote add origin https://github.com/zhangsan/ai-stream-chat.git
git push -u origin main
```

若使用 SSH：

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## 3. 首次推送若提示登录

- 使用 HTTPS 时，GitHub 要求用 **Personal Access Token** 代替密码  
  创建：GitHub → Settings → Developer settings → Personal access tokens
- 使用 SSH 时，需本机已配置 SSH 公钥并添加到 GitHub

推送成功后，在浏览器打开 `https://github.com/YOUR_USERNAME/YOUR_REPO` 即可看到代码。
