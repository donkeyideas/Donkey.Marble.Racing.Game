// Validates all 100 seeds from VALIDATED_SEEDS — outputs pass/fail report
// Usage: node scripts/validate-all-100.js

const path = require('path');

// Import the generator + simulator from generate-tracks.js
// We'll inline the seed list and reuse the functions

const SEEDS = [
  1004, 1006, 1013, 1028, 1041, 1043, 1055, 1068, 1081, 1094,
  1098, 1106, 1109, 1123, 1130, 1139, 1143, 1144, 1150, 1165,
  1172, 1175, 1177, 1178, 1187, 1192, 1203, 1204, 1206, 1214,
  1219, 1240, 1241, 1250, 1262, 1280, 1299, 1300, 1322, 1325,
  1337, 1351, 1353, 1360, 1365, 1368, 1387, 1390, 1403, 1410,
  1411, 1425, 1426, 1428, 1432, 1433, 1435, 1436, 1466, 1473,
  1479, 1488, 1489, 1494, 1510, 1520, 1523, 1548, 1561, 1564,
  1579, 1580, 1581, 1592, 1598, 1604, 1608, 1618, 1620, 1638,
  1639, 1646, 1657, 1663, 1667, 1670, 1691, 1693, 1694, 1725,
  1750, 1805, 1840, 1895, 1910, 1940, 1970, 2005, 2010, 2015,
];

// Load the generate-tracks module by running it as a child process
// Actually, let's just re-run the validator directly
const { execSync } = require('child_process');

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║          DONKEY MARBLE RACING — 100 COURSE VALIDATION          ║');
console.log('║   Criteria: <60s avg, 8/8 finish, <=75 bodies, no escapes     ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

let passed = 0, failed = 0;
const results = [];

SEEDS.forEach((seed, i) => {
  try {
    const output = execSync(
      `node scripts/generate-tracks.js --seed ${seed}`,
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 30000 }
    );
    const pass = output.includes('passes validation');
    const status = pass ? 'PASS' : 'FAIL';
    if (pass) passed++; else failed++;

    // Extract timing from verbose output
    const timeMatch = output.match(/avg=(\d+\.\d+)s/);
    const finishedMatch = output.match(/finished=(\d)\/8/);
    const stuckMatch = output.match(/stuck=(\d+)/);
    const bodiesMatch = output.match(/bodies=(\d+)/);

    const avgTime = timeMatch ? timeMatch[1] : '?';
    const finished = finishedMatch ? finishedMatch[1] : '?';
    const stuck = stuckMatch ? stuckMatch[1] : '?';
    const bodies = bodiesMatch ? bodiesMatch[1] : '?';

    const num = String(i + 1).padStart(3, ' ');
    console.log(`  ${status === 'PASS' ? '✓' : '✗'} #${num} seed=${seed}  avg=${avgTime}s  finished=${finished}/8  stuck=${stuck}  bodies=${bodies}  [${status}]`);
    results.push({ seed, status, avgTime, finished, stuck, bodies });
  } catch (e) {
    // execSync throws on non-zero exit — extract stdout/stderr for details
    const out = (e.stdout || '') + (e.stderr || '');
    const timeMatch = out.match(/avg=(\d+\.\d+)s/);
    const finishedMatch = out.match(/finished=(\d)\/8/);
    const stuckMatch = out.match(/stuck=(\d+)/);
    const bodiesMatch = out.match(/bodies=(\d+)/);

    const avgTime = timeMatch ? timeMatch[1] : '?';
    const finished = finishedMatch ? finishedMatch[1] : '?';
    const stuck = stuckMatch ? stuckMatch[1] : '?';
    const bodies = bodiesMatch ? bodiesMatch[1] : '?';

    failed++;
    const num = String(i + 1).padStart(3, ' ');
    console.log(`  ✗ #${num} seed=${seed}  avg=${avgTime}s  finished=${finished}/8  stuck=${stuck}  bodies=${bodies}  [FAIL]`);
    results.push({ seed, status: 'FAIL', avgTime, finished, stuck, bodies });
  }
});

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║                          SUMMARY                               ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log(`  Total courses: ${SEEDS.length}`);
console.log(`  PASSED: ${passed}`);
console.log(`  FAILED: ${failed}`);
console.log(`  Pass rate: ${(passed / SEEDS.length * 100).toFixed(1)}%`);

const passTimes = results.filter(r => r.status === 'PASS').map(r => parseFloat(r.avgTime)).filter(t => !isNaN(t));
if (passTimes.length > 0) {
  console.log(`  Avg race time: ${(passTimes.reduce((a, b) => a + b, 0) / passTimes.length).toFixed(1)}s`);
  console.log(`  Fastest: ${Math.min(...passTimes).toFixed(1)}s`);
  console.log(`  Slowest: ${Math.max(...passTimes).toFixed(1)}s`);
}

if (failed > 0) {
  console.log(`\n  FAILED SEEDS:`);
  results.filter(r => r.status !== 'PASS').forEach(r => {
    console.log(`    seed=${r.seed}: avg=${r.avgTime}s finished=${r.finished}/8 stuck=${r.stuck} bodies=${r.bodies}`);
  });
}

console.log('');
