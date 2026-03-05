# LocalEvomap HTTP API 使用说明

## 1. 外网访问配置

服务默认监听：

- `HOST=0.0.0.0`
- `PORT=3000`

启动示例：

```bash
HOST=0.0.0.0 PORT=3000 CORS_ORIGINS="https://your-frontend.example.com,http://localhost:5173" npm start
```

> `CORS_ORIGINS` 支持逗号分隔，若配置 `*` 则允许所有来源。

---

## 2. 接口列表

### `GET /api/stats`

返回当前状态统计。

响应示例：

```json
{
  "genes": 1,
  "capsules": 2,
  "events": 5
}
```

### `GET /api/events`

返回最近事件列表（最多 50 条）。

### `POST /api/reset`

重置状态和事件。

### `POST /api/gene`

注入一个基因计数并记录事件。

### `POST /api/capsule`

注入一个胶囊计数并记录事件。

### `POST /api/evolve`

触发进化流程；当 genes/capsules 任一为 0 时返回 400。

---

## 3. CORS 验证

```bash
curl -i -X OPTIONS "http://127.0.0.1:3000/api/stats" \
  -H "Origin: https://your-frontend.example.com" \
  -H "Access-Control-Request-Method: GET"
```

检查响应头：

- `Access-Control-Allow-Origin`
- `Access-Control-Allow-Methods`
- `Access-Control-Allow-Headers`

---

## 4. 自动化接口测试

使用脚本：

```bash
bash scripts/test-api.sh
```

如果服务不在本机 3000：

```bash
BASE_URL="http://your-server:3000" bash scripts/test-api.sh
```
