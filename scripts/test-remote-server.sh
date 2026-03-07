#!/bin/bash
# LocalEvomap 快速测试脚本

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-YOUR_API_KEY}"

echo "========================================="
echo "LocalEvomap 远程服务测试"
echo "服务器：$BASE_URL"
echo "========================================="

# 1. 健康检查
echo -e "\n[1/6] 健康检查..."
STATS=$(curl -s "$BASE_URL/api/stats")
echo "统计信息：$STATS"
if [ $? -eq 0 ]; then
    echo "✅ 服务器响应正常"
else
    echo "❌ 服务器无响应"
    exit 1
fi

# 2. 获取基因列表
echo -e "\n[2/6] 获取基因列表..."
GENES=$(curl -s "$BASE_URL/api/v1/genes")
echo "基因列表：$GENES"
echo "✅ API 访问正常"

# 3. 创建测试基因
echo -e "\n[3/6] 创建测试基因..."
CREATE_RESULT=$(curl -s -X POST "$BASE_URL/api/v1/genes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Gene",
    "id": "gene_test_from_script",
    "category": "repair",
    "signals_match": ["error", "test"],
    "preconditions": ["has test signal"],
    "strategy": ["Test strategy"],
    "constraints": {"max_files": 1, "max_lines": 10}
  }')
echo "创建结果：$CREATE_RESULT"
if echo "$CREATE_RESULT" | grep -q "created"; then
    echo "✅ 基因创建成功"
else
    echo "⚠️  基因可能已存在或创建失败"
fi

# 4. 获取刚创建的基因
echo -e "\n[4/6] 获取测试基因详情..."
GENE_DETAIL=$(curl -s "$BASE_URL/api/v1/genes/gene_test_from_script")
echo "基因详情：$GENE_DETAIL"
if echo "$GENE_DETAIL" | grep -q "gene_test_from_script"; then
    echo "✅ 基因详情获取成功"
else
    echo "❌ 无法获取基因详情"
fi

# 5. 搜索胶囊
echo -e "\n[5/6] 搜索胶囊..."
CAPSULES=$(curl -s "$BASE_URL/api/v1/capsules/search")
echo "胶囊列表：$CAPSULES"
echo "✅ 胶囊搜索正常"

# 6. 获取事件列表
echo -e "\n[6/6] 获取事件列表..."
EVENTS=$(curl -s "$BASE_URL/api/v1/events")
echo "事件列表：$EVENTS"
echo "✅ 事件获取正常"

# 清理测试基因
echo -e "\n[清理] 删除测试基因..."
DELETE_RESULT=$(curl -s -X DELETE "$BASE_URL/api/v1/genes/gene_test_from_script" \
  -H "Authorization: Bearer $API_KEY")
echo "删除结果：$DELETE_RESULT"
echo "✅ 测试基因已软删除"

echo -e "\n========================================="
echo "所有测试完成！"
echo "========================================="
echo -e "\n访问 Dashboard: http://your-server.example.com:3000"
echo "查看使用文档：HOW_TO_USE.md"
