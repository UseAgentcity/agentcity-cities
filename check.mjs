import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const MODES = new Set(['dispatch', 'ride']);
const STATUSES = new Set(['sample', 'draft', 'in-review', 'approved']);
const WINNERS = [4000, 2500, 1500, 1200, 800];
let failed = 0;

function fail(city, message) {
  failed += 1;
  console.error(`${city}: ${message}`);
}

const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== '.github');
if (dirs.length === 0) fail('cities', '没有城市目录');

for (const entry of dirs) {
  const city = entry.name;
  const dir = path.join(root, city);
  const rulesPath = path.join(dir, 'rules.json');
  const notesPath = path.join(dir, 'notes.md');
  if (!fs.existsSync(rulesPath) || !fs.existsSync(notesPath)) {
    fail(city, '缺少 rules.json 或 notes.md');
    continue;
  }
  let rules;
  try {
    rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  } catch {
    fail(city, 'rules.json 不是合法的 JSON');
    continue;
  }
  const allowed = new Set(['city', 'name', 'mapCity', 'modes', 'lockBps', 'reviewSeconds', 'creatorShareBps', 'winnerSharesBps', 'creator', 'claimExpires', 'status']);
  for (const key of Object.keys(rules)) if (!allowed.has(key)) fail(city, `不能有字段 ${key}`);
  if (rules.city !== city || rules.mapCity !== city) fail(city, 'city 和 mapCity 必须等于目录名');
  if (typeof rules.name !== 'string' || rules.name.length === 0) fail(city, '缺少城市名称');
  if (!Array.isArray(rules.modes) || rules.modes.length === 0 || rules.modes.some((mode) => !MODES.has(mode))) fail(city, '玩法只能是 dispatch 或 ride');
  if (rules.lockBps !== 5) fail(city, '锁定比例必须是 0.05%');
  if (rules.reviewSeconds !== 3600) fail(city, '公示时间必须是 1 小时');
  if (rules.creatorShareBps !== 2000) fail(city, '创建者分成必须是 20%');
  if (!Array.isArray(rules.winnerSharesBps) || rules.winnerSharesBps.length !== 5 || rules.winnerSharesBps.some((n, i) => n !== WINNERS[i])) fail(city, '选手分成必须是 40/25/15/12/8');
  if (!STATUSES.has(rules.status)) fail(city, '状态不合法');
  if (rules.status === 'sample' || rules.status === 'draft') {
    if (rules.creator !== null || rules.claimExpires !== null) fail(city, '样例和草稿不能占用人');
  } else {
    const creator = rules.creator;
    if (!creator || typeof creator.name !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(creator.wallet ?? '')) fail(city, '创建者要有名字和收款地址');
    if (Number.isNaN(Date.parse(rules.claimExpires))) fail(city, '认领期限不合法');
  }
  const notes = fs.readFileSync(notesPath, 'utf8');
  if (notes.trim().length === 0) fail(city, 'notes.md 是空的');
  if (/private key|DEPLOYER_PRIVATE_KEY|begin private/i.test(notes)) fail(city, '说明里不能有私钥');
}

if (failed) {
  console.error(`未通过 ${failed} 项`);
  process.exit(1);
}
console.log(`通过 ${dirs.length} 座城`);
