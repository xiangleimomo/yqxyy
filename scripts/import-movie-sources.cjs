// Usage: node scripts/import-movie-sources.cjs <title/url text file> [--write]
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const aliases = {
  '功夫熊猫1':'kung-fu-panda-1', '功夫熊猫2':'kung-fu-panda-2', '功夫熊猫3':'kung-fu-panda-3', '功夫熊猫4':'kung-fu-panda-4',
  '驯龙高手1':'dragon-1', '驯龙高手2':'dragon-2', '驯龙高手3':'dragon-3',
  '疯狂动物城1':'zootopia-1', '疯狂动物城2':'zootopia-2', '头脑特工队1':'inside-out-1', '头脑特工队2':'inside-out-2',
  '比得兔1':'peter-rabbit-1', '比得兔2':'peter-rabbit-2', '赛车总动员':'cars-1',
  '哈利波特与魔法石':'harry-potter-philosophers-stone', '哈利波特与密室':'harry-potter-chamber-of-secrets',
  '哈利波特与阿兹卡班的囚徒':'harry-potter-prisoner-of-azkaban', '哈利波特与火焰杯':'harry-potter-goblet-of-fire',
  '哈利波特与凤凰社':'harry-potter-order-of-phoenix', '哈利波特与混血王子':'harry-potter-half-blood-prince',
  '哈利波特与死亡圣器上':'harry-potter-deathly-hallows-part-1', '哈利波特与死亡圣器下':'harry-potter-deathly-hallows-part-2',
  '神奇动物在哪里':'fantastic-beasts-1', '神奇动物：格林德沃之罪':'fantastic-beasts-2',
  '纳尼亚传奇1：狮子、女巫和魔衣橱':'narnia-1', '纳尼亚传奇2：凯斯宾王子':'narnia-2', '纳尼亚传奇3：黎明踏浪号':'narnia-3',
  '帕丁顿熊':'paddington-1', '帕丁顿熊2':'paddington-2', '帕丁顿熊3':'paddington-3',
  '玩具总动员1':'toy-story-1', '玩具总动员2':'toy-story-2', '玩具总动员3':'toy-story-3',
  '超人总动员':'incredibles-1', '超人总动员2':'incredibles-2', '无敌破坏王':'wreck-it-ralph-1', '无敌破坏王2':'wreck-it-ralph-2',
  '怪兽电力公司':'monsters-inc', '怪兽大学':'monsters-university'
};
const reviewedBackups = {
  'cars-2':'/20250408/3701_b181eaa4/index.m3u8',
  'despicable-me-1':'/20250408/3711_aba18772/index.m3u8',
  'finding-nemo':'/20250408/3736_3e195b07/index.m3u8',
  'harry-potter-philosophers-stone':'/20250325/1771_21be9a4b/index.m3u8',
  'harry-potter-deathly-hallows-part-1':'/20250325/1782_4a2ddf14/index.m3u8',
  'harry-potter-deathly-hallows-part-2':'/20250325/1783_b865367f/index.m3u8',
  'sonic-3':'/20250430/5290_6e7d5d25/index.m3u8',
  'trolls-2':'/20250520/6928_20c1945e/index.m3u8'
};
function parse(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const changes = new Map();
  changes.missing = [];
  const seenTitles = new Set();
  for (let i = 0; i < lines.length;) {
    const id = aliases[lines[i]];
    if (!id) throw Error('Unmatched title: ' + lines[i]);
    if (seenTitles.has(id)) throw Error('Duplicate movie: ' + id);
    seenTitles.add(id);
    if (!lines[i+1] || !/^https?:\/\//i.test(lines[i+1])) { changes.missing.push(lines[i]); i++; continue; }
    let url = new URL(lines[i+1]);
    // The supplied player-page links explicitly contain the actual media URL.
    const wrapped = url.hostname === 'mujizybf.com' && url.pathname === '/m3u8/' && url.searchParams.get('url');
    if (wrapped) url = new URL(wrapped);
    if (url.protocol !== 'https:' || !url.pathname.endsWith('.m3u8')) throw Error('Invalid M3U8 URL for ' + id);
    changes.set(id, wrapped ? url.href : lines[i+1]);
    i += 2;
  }
  return changes;
}
function run(input, write = false) {
  const changes = parse(fs.readFileSync(input, 'utf8'));
  const plans = [], seen = new Set();
  for (const series of fs.readdirSync(path.join(root, 'data/movies'))) {
    const file = path.join(root, 'data/movies', series, 'movies.json');
    if (!fs.existsSync(file)) continue;
    const original = fs.readFileSync(file, 'utf8'), data = JSON.parse(original);
    for (const movie of data.sources || []) {
      if (changes.has(movie.id)) { movie.hlsUrl = changes.get(movie.id); seen.add(movie.id); }
      if (reviewedBackups[movie.id]) movie.backupHlsUrl = 'https://vip.dytt-live.com' + reviewedBackups[movie.id];
    }
    const byId = new Map((data.sources || []).map(movie => [movie.id, movie]));
    // Patch source fields in place so compact catalogue arrays retain their formatting.
    const updated = original.replace(/\{[^{}]*\}/g, block => {
      let old; try { old = JSON.parse(block); } catch (_) { return block; }
      const movie = byId.get(old.id);
      if (!movie || !Object.hasOwn(old, 'hlsUrl')) return block;
      let next = block.replace(/("hlsUrl"\s*:\s*)"[^"\r\n]*"/, (_, prefix) => prefix + JSON.stringify(movie.hlsUrl));
      if (movie.backupHlsUrl) {
        if (Object.hasOwn(old, 'backupHlsUrl')) next = next.replace(/("backupHlsUrl"\s*:\s*)"[^"\r\n]*"/, (_, prefix) => prefix + JSON.stringify(movie.backupHlsUrl));
        else next = next.replace(/^(\s*)"hlsUrl"[^\r\n]*([\r\n]+)/m, (line, indent, newline) => line + indent + '"backupHlsUrl": ' + JSON.stringify(movie.backupHlsUrl) + ',' + newline);
      }
      return next;
    });
    if (JSON.stringify(JSON.parse(updated)) !== JSON.stringify(data)) {
      // Field ordering may change when a backup is inserted; compare by movie values below.
      const check = JSON.parse(updated);
      for (const movie of check.sources || []) {
        const expected = byId.get(movie.id);
        if (movie.hlsUrl !== expected.hlsUrl || movie.backupHlsUrl !== expected.backupHlsUrl) throw Error('Source patch failed: ' + movie.id);
      }
    }
    if (JSON.stringify(JSON.parse(original)) !== JSON.stringify(data)) plans.push({file, updated});
  }
  for (const id of changes.keys()) if (!seen.has(id)) throw Error('Missing catalogue movie: ' + id);
  // Validate everything before writing any file. Rerunning does not replace approved backups.
  if (write) for (const plan of plans) fs.writeFileSync(plan.file, plan.updated);
  return {matched: changes.size, missing: changes.missing, files: plans.map(p => path.relative(root, p.file)), backupCount: Object.keys(reviewedBackups).length, write};
}
if (require.main === module) {
  if (!process.argv[2]) throw Error('Provide the title/URL text file');
  console.log(JSON.stringify(run(process.argv[2], process.argv.includes('--write'))));
}
module.exports = {parse, run, reviewedBackups};
