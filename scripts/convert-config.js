#!/usr/bin/env node
/* eslint-disable */
// AUTO-GENERATED SCRIPT: Converts config.json to TypeScript definition.
// Usage: node scripts/convert-config.js

const fs = require('fs');
const path = require('path');

// Resolve project root (one level up from scripts folder)
const projectRoot = path.resolve(__dirname, '..');

// Paths
const configPath = path.join(projectRoot, 'config.json');
const libDir = path.join(projectRoot, 'src', 'lib');
const oldRuntimePath = path.join(libDir, 'runtime.ts');
const newRuntimePath = path.join(libDir, 'runtime.ts');

// Delete the old runtime.ts file if it exists
if (fs.existsSync(oldRuntimePath)) {
  fs.unlinkSync(oldRuntimePath);
  console.log('旧的 runtime.ts 已删除');
}

// Read and parse config.json (support remote CONFIGJSON)
const remoteConfigBase = (process.env.CONFIGJSON || '').trim();
let rawConfig;

async function loadConfig() {
  if (remoteConfigBase) {
    const remoteConfigUrl = /\.json($|\?)/i.test(remoteConfigBase)
      ? remoteConfigBase
      : `${remoteConfigBase.replace(/\/+$/, '')}/config.json`;
    try {
      const resp = await fetch(remoteConfigUrl);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      return await resp.text();
    } catch (err) {
      console.warn(`从 CONFIGJSON 加载失败 (${remoteConfigUrl}):`, err);
    }
  }

  try {
    return fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    console.warn(`未找到本地 config.json（${configPath}）`);
    return null;
  }
}

(async () => {
  rawConfig = await loadConfig();
  let config;
  if (!rawConfig) {
    // Fallback minimal config so local builds without CONFIGJSON still work.
    config = { cache_time: 7200, api_site: {}, users: [] };
    console.warn('未找到配置，已生成最小默认 runtime.ts 以继续构建');
  } else {
    try {
      config = JSON.parse(rawConfig);
    } catch (err) {
      console.error('config.json 不是有效的 JSON:', err);
      process.exit(1);
    }
  }

// Prepare TypeScript file content
const tsContent =
  `// 该文件由 scripts/convert-config.js 自动生成，请勿手动修改\n` +
  `/* eslint-disable */\n\n` +
  `export const config = ${JSON.stringify(config, null, 2)} as const;\n\n` +
  `export type RuntimeConfig = typeof config;\n\n` +
  `export default config;\n`;

// Ensure lib directory exists
if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

// Write to runtime.ts
try {
  fs.writeFileSync(newRuntimePath, tsContent, 'utf8');
  console.log('已生成 src/lib/runtime.ts');
} catch (err) {
  console.error('写入 runtime.ts 失败:', err);
  process.exit(1);
}

})();
