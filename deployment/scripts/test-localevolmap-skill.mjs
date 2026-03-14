#!/usr/bin/env node
/**
 * Test LocalEvolmap Skill Connection
 */

const BASE_URL = 'http://10.104.11.12:3000';
const API_KEY = 'test-api-key';

async function testConnection() {
  console.log('🧬 Testing LocalEvolmap Skill Connection...\n');
  console.log(`Server: ${BASE_URL}\n`);

  try {
    // Test 1: Health Check
    console.log('📊 1. Health Check...');
    const health = await fetch(`${BASE_URL}/api/stats`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    const stats = await health.json();
    console.log(`   ✓ Server is running`);
    console.log(`   - Genes: ${stats.genes}`);
    console.log(`   - Capsules: ${stats.capsules}`);
    console.log(`   - Events: ${stats.events}\n`);

    // Test 2: Get Genes
    console.log('🧬 2. Fetching Genes...');
    const genesRes = await fetch(`${BASE_URL}/api/v1/genes?limit=3`);
    if (!genesRes.ok) throw new Error(`HTTP ${genesRes.status}`);
    const genesData = await genesRes.json();
    console.log(`   ✓ Found ${genesData.total} genes`);
    if (genesData.genes.length > 0) {
      console.log(`   - Categories: ${genesData.categories.join(', ')}\n`);
    }

    // Test 3: Search Capsules
    console.log('💊 3. Searching Capsules...');
    const capsRes = await fetch(`${BASE_URL}/api/v1/capsules/search?limit=3`);
    if (!capsRes.ok) throw new Error(`HTTP ${capsRes.status}`);
    const capsData = await capsRes.json();
    console.log(`   ✓ Found ${capsData.total} capsules\n`);

    // Test 4: Get Events
    console.log('📜 4. Fetching Events...');
    const eventsRes = await fetch(`${BASE_URL}/api/v1/events?limit=3`);
    if (!eventsRes.ok) throw new Error(`HTTP ${eventsRes.status}`);
    const eventsData = await eventsRes.json();
    console.log(`   ✓ Found ${eventsData.total} events\n`);

    console.log('✅ All tests passed! LocalEvolmap skill is working correctly.');
    return true;

  } catch (error) {
    console.error(`\n❌ Connection failed: ${error.message}`);
    console.error('\nTroubleshooting:');
    console.error('  1. Check if server is running: http://10.104.11.12:3000');
    console.error('  2. Verify network connectivity to 10.104.11.12:3000');
    console.error('  3. Check firewall settings\n');
    return false;
  }
}

testConnection();
