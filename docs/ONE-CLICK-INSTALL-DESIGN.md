# 一键安装设计方案

## 核心目标

1. **AI Agent 全自动安装**：通过单一服务器接口，Agent 完成所有安装步骤
2. **零仓库配置**：用户无需提供仓库地址，服务器内置所有配置

---

## 架构设计

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   AI Agent  │──────▶│  Install API     │──────▶│   Server Config │
│  (Claude等) │      │  /api/v1/install │      │  (内置仓库地址) │
└─────────────┘      └──────────────────┘      └─────────────────┘
         │                    │
         │ 返回安装计划        │
         ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                      安装计划 (Install Plan)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Skill 文件  │  │ MCP 配置    │  │  环境检查脚本       │  │
│  │ (直接下载)  │  │ (自动生成)  │  │  (自动检测client)   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 新增 API 端点

### 1. 获取安装计划

```http
POST /api/v1/install/plan
Content-Type: application/json

{
  "client": "claude|codex|opencode|cursor|auto",  // auto=自动检测
  "scope": "global|project",                      // global=用户级, project=项目级
  "features": ["skill", "mcp"],                   // 要安装的功能
  "serverUrl": "http://your-server:3000"          // 服务器地址
}
```

**响应：**

```json
{
  "success": true,
  "detectedClient": "claude",
  "detectedOS": "windows|macos|linux",
  "plan": {
    "skill": {
      "action": "download",
      "url": "http://your-server:3000/skill/claude",
      "targetPath": "~/.claude/commands/evomap.md",
      "description": "下载 Skill 文件到 Claude commands 目录"
    },
    "mcp": {
      "action": "configure",
      "config": {
        "mcpServers": {
          "localevomap": {
            "command": "npx",
            "args": ["-y", "@trevorcat/localevomap-mcp@latest"],
            "env": {
              "LOCAL_EVOMAP_SERVER_URL": "http://your-server:3000",
              "LOCAL_EVOMAP_API_KEY": "{{API_KEY}}",
              "LOCAL_EVOMAP_CLIENT": "claude"
            }
          }
        }
      },
      "targetPath": "~/.claude/mcp.json",
      "description": "配置 MCP 服务器"
    },
    "verification": {
      "steps": [
        {
          "description": "检查 Skill 文件是否安装",
          "command": "test -f ~/.claude/commands/evomap.md"
        },
        {
          "description": "检查 MCP 配置",
          "command": "test -f ~/.claude/mcp.json"
        },
        {
          "description": "测试服务器连接",
          "endpoint": "/api/v1/genes",
          "method": "GET"
        }
      ]
    }
  }
}
```

### 2. 执行安装（可选，用于服务器端执行）

```http
POST /api/v1/install/execute
Authorization: Bearer {token}

{
  "targetHost": "...",    // 目标机器（用于远程安装）
  "planId": "..."         // 从 /plan 获取的计划ID
}
```

### 3. 客户端自动发现

```http
GET /api/v1/install/detect
Headers: {
  "User-Agent": "...",           // 从请求头自动检测 OS
  "X-Client-Hint": "claude"      // 可选的客户端提示
}

响应：
{
  "os": "windows",
  "shell": "powershell",
  "detectedClients": ["claude", "cursor"],  // 检测到的客户端
  "preferredClient": "claude"
}
```

---

## MCP 零配置设计

### 问题现状

当前 MCP 配置需要用户手动设置：
- 仓库地址
- 服务器地址
- API Key

### 解决方案

服务器**内置所有配置**，通过 API 返回完整配置：

```json
{
  "mcp": {
    "config": {
      "mcpServers": {
        "localevomap": {
          "command": "npx",
          "args": ["-y", "@trevorcat/localevomap-mcp@latest"],
          "env": {
            "LOCAL_EVOMAP_SERVER_URL": "http://your-server:3000",
            "LOCAL_EVOMAP_API_KEY": "{{DYNAMIC_API_KEY}}",
            "LOCAL_EVOMAP_CLIENT": "{{DETECTED_CLIENT}}"
          }
        }
      }
    }
  }
}
```

**关键设计：**
1. **NPM 包分发**：MCP 服务器通过 npm 发布，无需用户指定仓库
2. **服务器地址内置**：由服务器 API 返回，无需用户输入
3. **动态 API Key**：服务器生成临时/永久 key 并填入配置
4. **客户端自动检测**：根据调用来源或环境变量自动识别

---

## Agent 安装流程

### 极简版（用户只需说："安装 localevomap"）

```
用户: 帮我安装 localevomap

Agent:
  1. 询问服务器地址（或从环境变量读取 LOCAL_EVOMAP_SERVER）
  2. 调用 GET /api/v1/install/detect 检测环境
  3. 调用 POST /api/v1/install/plan 获取安装计划
  4. 按 plan 执行：
     - 下载 skill 文件
     - 写入 MCP 配置
     - 执行验证步骤
  5. 报告安装结果
```

### 单命令版

```bash
# 用户只需执行（Agent 自动生成）：
curl -s http://your-server:3000/api/v1/install/script | bash -s -- --client=claude
```

服务器返回**自执行脚本**：

```bash
#!/bin/bash
# 自动生成的安装脚本

# 1. 检测环境
CLIENT="claude"
OS="$(uname -s)"

# 2. 下载 skill
curl -sL "http://your-server:3000/skill/claude" -o ~/.claude/commands/evomap.md

# 3. 配置 MCP
mkdir -p ~/.claude
cat > ~/.claude/mcp.json << 'EOF'
{
  "mcpServers": {
    "localevomap": {
      "command": "npx",
      "args": ["-y", "@trevorcat/localevomap-mcp@latest"],
      "env": {
        "LOCAL_EVOMAP_SERVER_URL": "http://your-server:3000",
        "LOCAL_EVOMAP_API_KEY": "auto-generated-key"
      }
    }
  }
}
EOF

echo "✅ 安装完成！重启 Claude Code 即可使用。"
```

---

## 服务器实现建议

### 1. 配置存储（不暴露给用户）

```typescript
// server/config/install.ts
export const installConfig = {
  // MCP 包信息
  mcpPackage: {
    name: "@trevorcat/localevomap-mcp",
    registry: "https://registry.npmjs.org",
    // 内网可配置私有 registry
  },

  // Skill 文件模板映射
  skillTemplates: {
    claude: "./templates/skill-claude.md",
    codex: "./templates/skill-codex.md",
    opencode: "./templates/skill-opencode.md",
    cursor: "./templates/skill-cursor.md"
  },

  // 客户端配置路径映射
  clientPaths: {
    claude: {
      skill: "~/.claude/commands/evomap.md",
      mcp: "~/.claude/mcp.json"
    },
    codex: {
      skill: "~/.codex/AGENTS.md",
      mcp: null  // Codex 可能不支持 MCP
    },
    // ...
  }
};
```

### 2. API 路由

```typescript
// server/routes/install.ts
router.post('/api/v1/install/plan', async (req, res) => {
  const { client, scope, features } = req.body;

  // 1. 自动检测客户端
  const detectedClient = await detectClient(req);

  // 2. 生成 API Key（如果是授权安装）
  const apiKey = await generateApiKey(req.user);

  // 3. 构建安装计划
  const plan = buildInstallPlan({
    client: client || detectedClient,
    scope,
    features,
    apiKey,
    serverUrl: getServerUrl()
  });

  res.json({ success: true, plan });
});

router.get('/api/v1/install/script', async (req, res) => {
  const { client, os } = detectEnvironment(req);
  const script = generateInstallScript({ client, os });

  res.setHeader('Content-Type', 'text/plain');
  res.send(script);
});
```

### 3. 动态 MCP 配置生成

```typescript
function generateMcpConfig(params: {
  serverUrl: string;
  apiKey: string;
  client: string;
}) {
  return {
    mcpServers: {
      localevomap: {
        command: "npx",
        args: ["-y", "@trevorcat/localevomap-mcp@latest"],
        env: {
          LOCAL_EVOMAP_SERVER_URL: params.serverUrl,
          LOCAL_EVOMAP_API_KEY: params.apiKey,
          LOCAL_EVOMAP_CLIENT: params.client,
          // 内置配置，用户无感知
          LOCAL_EVOMAP_AUTO_UPDATE: "true"
        }
      }
    }
  };
}
```

---

## 用户交互流程

### 场景 1：全新用户

```
用户：帮我安装 localevomap

AI：好的，我需要知道你的 LocalEvomap 服务器地址。
     如果你不确定，可以使用我们团队的默认服务器：http://team-server:3000

用户：用默认的

AI：检测到你在使用 Claude Code (Windows)。
     我将为你安装：
     1. Skill 文件 → ~/.claude/commands/evomap.md
     2. MCP 配置 → ~/.claude/mcp.json

     安装完成后需要重启 Claude Code。

     确认安装？[Y/n]

用户：Y

AI：[执行安装...]
     ✅ Skill 已安装
     ✅ MCP 已配置
     ✅ 服务器连接测试通过

     请重启 Claude Code，然后输入 /evomap 测试。
```

### 场景 2：已有 API Key 的用户

```
用户：安装 localevomap，key 是 abc123

AI：使用提供的 API Key 安装到 Claude Code？
     服务器：http://team-server:3000

用户：确认

AI：[一键安装完成]
```

### 场景 3：项目级安装

```
用户：给当前项目安装 localevomap

AI：检测到当前目录是 /projects/my-game
     将安装项目级配置到 .claude/commands/evomap.md
     确认？
```

---

## 安全考虑

1. **API Key 生成**：
   - 支持预生成 key（管理员分发）
   - 支持动态生成（需认证）
   - 支持匿名只读模式（仅限 skill，无 MCP）

2. **安装验证**：
   - 所有下载文件提供 checksum 验证
   - MCP 配置验证 JSON 格式
   - 安装后自动测试连接

3. **权限控制**：
   - 可选：限制 install API 只能由内网访问
   - 可选：需要管理员 token 才能生成 key

---

## 实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | `/api/v1/install/plan` | 核心接口，返回安装计划 |
| P0 | MCP 配置自动生成 | 内置服务器地址和包名 |
| P1 | `/api/v1/install/detect` | 自动检测客户端和 OS |
| P1 | Agent 自动执行 | Agent 根据 plan 自动执行安装 |
| P2 | `/api/v1/install/script` | 返回自执行脚本 |
| P2 | 验证步骤 | 安装后自动验证 |
| P3 | 远程安装 | 在服务器端执行安装 |
