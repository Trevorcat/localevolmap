/**
 * External Capsules Usage Example
 * 
 * 演示如何使用外部胶囊源功能
 * 
 * 运行步骤:
 * 1. 启动 Hub 服务器：npx ts-node examples/hub-server.ts
 * 2. 运行此示例：npx ts-node examples/use-external-capsules.ts
 */

import { LocalEvomap } from '../index';

async function main() {
  console.log('🧪 External Capsules Example\n');
  
  // 1. 配置本地 Hub
  const evomap = new LocalEvomap({
    strategy: 'balanced',
    genes_path: './data/genes',
    capsules_path: './data/capsules',
    events_path: './data/events',
    review_mode: false,  // 测试时关闭审批
    max_blast_radius: { files: 50, lines: 500 },
    forbidden_paths: ['.git', 'node_modules'],
    selection: {
      driftEnabled: true,
      effectivePopulationSize: 3,
      minConfidence: 0.5,
      alternativesCount: 5
    },
    rollbackEnabled: false,
    rollbackStrategy: 'none',
    cacheEnabled: false,
    cacheTtlMs: 3600000,
    externalSources: [
      {
        name: 'local-test-hub',
        url: 'http://localhost:3000',
        validatedOnly: false,
        apiKey: 'test-api-key',
        enabled: true
      }
    ]
  });
  
  // 2. 初始化
  console.log('📦 Initializing Local Evomap...');
  await evomap.init();
  
  // 3. 添加一个测试基因
  console.log('\n🧬 Adding test gene...');
  await evomap.addGene({
    type: 'Gene',
    id: 'gene_repair_type_errors',
    category: 'repair',
    signals_match: ['type_error', 'undefined', 'log_error'],
    preconditions: ['has type error signal'],
    strategy: ['Fix the type error'],
    constraints: { max_files: 5, max_lines: 50 }
  });
  
  // 4. 搜索外部胶囊
  console.log('\n🔍 Searching external capsules...');
  const searchResults = await evomap.searchExternalCapsules({
    signals: ['log_error', 'type_error'],
    limit: 10
  });
  
  // 显示搜索结果
  for (const [hubName, result] of searchResults) {
    console.log(`\n  ${hubName}:`);
    console.log(`    Total: ${result.total}`);
    console.log(`    Capsules:`);
    result.capsules.slice(0, 5).forEach(c => {
      console.log(`      - ${c.id}`);
      console.log(`        Summary: ${c.summary}`);
      console.log(`        Confidence: ${c.confidence}`);
      console.log(`        Downloads: ${c.downloads}`);
    });
  }
  
  // 5. 下载胶囊
  console.log('\n📥 Downloading capsule...');
  const downloadResult = await evomap.downloadExternalCapsule('capsule_type_error_fix');
  
  if (downloadResult.capsule) {
    console.log(`  ✓ Downloaded from: ${downloadResult.source}`);
    console.log(`  ✓ ID: ${downloadResult.capsule.id}`);
    console.log(`  ✓ Summary: ${downloadResult.capsule.summary}`);
  } else {
    console.log('  ✗ Download failed');
  }
  
  // 6. 查看胶囊池统计
  console.log('\n📊 Capsule pool stats:');
  const stats = await evomap.getCapsulePoolStats();
  console.log(`  Total: ${stats.total}`);
  console.log(`  Avg Confidence: ${stats.avgConfidence.toFixed(2)}`);
  console.log(`  Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
  
  // 7. 模拟进化
  console.log('\n🧬 Simulating evolution...');
  const logs = [
    {
      type: 'tool_result',
      error: {
        code: 'TS2339',
        message: "Property 'xyz' does not exist on type 'Object'"
      },
      timestamp: new Date().toISOString()
    }
  ];
  
  const signals = evomap.extractSignals(logs);
  console.log('  Extracted signals:', signals.slice(0, 5));
  
  const { selected: gene } = await evomap.selectGene(signals);
  console.log(`  Selected gene: ${gene.id}`);
  
  const capsule = await evomap.selectCapsule(signals);
  if (capsule) {
    console.log(`  Selected capsule: ${capsule.id}`);
    console.log(`  Confidence: ${capsule.confidence}`);
  }
  
  console.log('\n✅ Example completed successfully!\n');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
