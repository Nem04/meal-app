// 全局配置：全部来自环境变量，无外部依赖。
export const config = {
  port: Number(process.env.PORT || 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || '',
  // 家庭口令：为空表示不启用口令保护（局域网默认不启用）。
  passcode: process.env.FAMILY_PASSCODE || '',
};
