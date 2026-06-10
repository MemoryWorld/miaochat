const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
const defaultBlockList = config.resolver.blockList;

config.watchFolders = [workspaceRoot];

// 仓库内统一用 ESM 风格的 ".js" 后缀导入 .ts/.tsx 源文件（Node/tsx/vitest 均配了
// extension alias），Metro 默认不识别——把相对导入的 .js 后缀去掉交回默认解析。
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (/^\.{1,2}\//.test(moduleName) && moduleName.endsWith(".js")) {
    try {
      return context.resolveRequest(
        context,
        moduleName.slice(0, -".js".length),
        platform
      );
    } catch {
      // 真实 .js 文件（极少）回落到原始名称解析
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList)
    ? defaultBlockList
    : defaultBlockList
      ? [defaultBlockList]
      : []),
  pathToRegExp(path.resolve(workspaceRoot, ".tmp")),
  pathToRegExp(path.resolve(workspaceRoot, "apps/web/.next"))
];

module.exports = config;

function pathToRegExp(targetPath) {
  return new RegExp(`${escapeRegExp(targetPath)}[/\\\\].*`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
