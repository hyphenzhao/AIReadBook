/** A message fit for the reader, from whatever the provider SDK threw. */
export function llmErrorMessage(error: unknown) {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  if (status === 401 || status === 403) return "AI 服务拒绝了 API Key，请在设置中检查";
  if (status === 404) return "AI 服务找不到所选模型，请在设置中重新选择";
  if (status === 429) return "AI 服务请求过于频繁或额度不足";
  return "AI 服务出错，请稍后重试";
}
