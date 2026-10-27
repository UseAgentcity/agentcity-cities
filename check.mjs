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

const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
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
  const allowed = new Set(['city', 'name', 'mapCity', 'lat', 'lon', 'tileUrl', 'tile', 'mapUrl', 'mapHash', 'modes', 'lockBps', 'reviewSeconds', 'creatorShareBps', 'winnerSharesBps', 'creator', 'claimExpires', 'status']);
  for (const key of Object.keys(rules)) if (!allowed.has(key)) fail(city, `不能有字段 ${key}`);
  if (rules.city !== city || rules.mapCity !== city) fail(city, 'city 和 mapCity 必须等于目录名');
  if (typeof rules.name !== 'string' || rules.name.length === 0) fail(city, '缺少城市名称');
  if (!Number.isFinite(rules.lat) || Math.abs(rules.lat) > 90 || !Number.isFinite(rules.lon) || Math.abs(rules.lon) > 180) fail(city, '经纬度不合法');
  if (rules.tileUrl !== 'https://agentcity.xyz/api/tiles/v/{z}/{x}/{y}') fail(city, '路网地址不对');
  if (!rules.tile || rules.tile.z !== 14 || !Number.isInteger(rules.tile.x) || !Number.isInteger(rules.tile.y)) fail(city, '地图块必须是 14 级整数坐标');
  if (rules.mapHash !== null && !/^0x[0-9a-f]{64}$/.test(rules.mapHash)) fail(city, '固定地图哈希不合法');
  if (rules.mapUrl !== null && typeof rules.mapUrl !== 'string') fail(city, '固定地图地址不合法');
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
    const expires = Date.parse(rules.claimExpires);
    if (Number.isNaN(expires)) fail(city, '认领期限不合法');
    else if (expires - Date.now() > 24 * 60 * 60 * 1000) fail(city, '认领期限最多 1 天');
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
