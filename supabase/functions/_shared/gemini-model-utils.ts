interface GeminiModelRecord {
  name?: string;
  supportedGenerationMethods?: string[];
}

interface GeminiModelsResponse {
  models?: GeminiModelRecord[];
}

export function normalizeGeminiModelName(name: string): string {
  return name.replace(/^models\//, '').trim();
}

export function getPreferredGeminiCandidates(configuredModel: string | undefined): string[] {
  const configured = (configuredModel || '').trim();
  return Array.from(new Set([
    configured,
    'gemini-3-flash-preview',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
  ].filter(Boolean)));
}

export function getGenerateContentCapableGeminiModels(payload: unknown): string[] {
  const response = payload as GeminiModelsResponse;
  if (!Array.isArray(response?.models)) {
    return [];
  }

  return response.models
    .map((model) => {
      const normalizedName = normalizeGeminiModelName(model?.name || '');
      const methods = Array.isArray(model?.supportedGenerationMethods)
        ? model.supportedGenerationMethods
        : [];
      const canGenerate = methods.includes('generateContent');

      if (!normalizedName.startsWith('gemini')) return '';
      if (!canGenerate) return '';
      return normalizedName;
    })
    .filter((modelName) => modelName.length > 0);
}

export function rankGeminiModels(preferredModels: string[], availableModels: string[]): string[] {
  const availableSet = new Set(availableModels);

  const orderedPreferred = preferredModels.filter((model) => availableSet.has(model));
  const remainingAvailable = availableModels.filter((model) => !orderedPreferred.includes(model));

  return Array.from(new Set([...orderedPreferred, ...remainingAvailable]));
}
