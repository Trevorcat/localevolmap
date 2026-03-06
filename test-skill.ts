/**
 * 测试 LocalEvomap Skill 是否能正确运行
 */

import { 
  extractSignals,
  searchCapsules,
  getGenes,
  evolutionAssistant 
} from './opencode/localevomap-skill/index';
import type { CapsuleSearchResult, GenesListResult } from './opencode/localevomap-skill/types';

async function testSkill(): Promise<void> {
  console.log('🧪 测试 LocalEvomap Skill...\n');
  
  // 测试 1: 信号提取
  console.log('1️⃣ 测试信号提取');
  const signals = extractSignals('TypeError: Cannot read properties of undefined');
  console.log('   输入:', 'TypeError: Cannot read properties of undefined');
  console.log('   输出:', signals);
  console.log('   ✅ 通过\n');
  
  // 测试 2: 搜索胶囊
  console.log('2️⃣ 测试搜索胶囊');
  try {
    const capsules: CapsuleSearchResult = await searchCapsules(['error'], { limit: 3 });
    console.log('   找到胶囊数:', capsules.total);
    console.log('   前 3 个胶囊:');
    capsules.capsules.slice(0, 3).forEach((c, i) => {
      console.log(`     ${i + 1}. ${c.summary} (信心度：${c.confidence})`);
    });
    console.log('   ✅ 通过\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log('   ❌ 失败:', errorMessage, '\n');
  }
  
  // 测试 3: 获取基因
  console.log('3️⃣ 测试获取基因');
  try {
    const genes: GenesListResult = await getGenes('repair');
    console.log('   找到基因数:', genes.total);
    console.log('   前 3 个基因:');
    genes.genes.slice(0, 3).forEach((g, i) => {
      console.log(`     ${i + 1}. ${g.id} (${g.category})`);
    });
    console.log('   ✅ 通过\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log('   ❌ 失败:', errorMessage, '\n');
  }
  
  // 测试 4: 进化助手
  console.log('4️⃣ 测试进化助手');
  try {
    const result = await evolutionAssistant({
      message: 'TypeError: undefined is not a function',
      logs: [{ error: 'TypeError: undefined is not a function' }],
      context: 'repair'
    });
    
    console.log('   结果类型:', result?.type);
    if (result?.type === 'capsule_found') {
      console.log('   找到胶囊:', result.capsule?.summary);
      console.log('   信心度:', result.confidence);
      console.log('   建议:', result.suggestion);
    } else if (result?.type === 'gene_found') {
      console.log('   找到基因:', result.gene?.id);
      console.log('   策略:', result.suggestion);
    } else {
      console.log('   结果:', result?.message);
    }
    console.log('   ✅ 通过\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log('   ❌ 失败:', errorMessage, '\n');
  }
  
  console.log('🏁 测试完成');
}

testSkill().catch(console.error);
