function validateLlamaApiKey(apiKey: string): boolean {
  return apiKey.length === 32;
}
export { validateLlamaApiKey };
