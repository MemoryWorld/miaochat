const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
const defaultBlockList = config.resolver.blockList;

config.watchFolders = [workspaceRoot];
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
