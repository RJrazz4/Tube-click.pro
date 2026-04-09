export interface AdminConfig {
  locker_url: string;
  image_api_key: string;
  text_api_key: string;
  voice_api_key: string;
}

const CONFIG_KEY = "tubegenius_admin_config";

const DEFAULT_CONFIG: AdminConfig = {
  locker_url: "",
  image_api_key: "",
  text_api_key: "",
  voice_api_key: "",
};

const STORAGE_KEY_MAP = {
  image: "fal-api-key",
  text: "gemini-api-key",
  voice: "elevenlabs-api-key",
} as const;

type ApiKeyType = keyof typeof STORAGE_KEY_MAP;

function readStoredConfig(): Partial<AdminConfig> {
  try {
    const rawConfig = localStorage.getItem(CONFIG_KEY);
    return rawConfig ? JSON.parse(rawConfig) : {};
  } catch {
    return {};
  }
}

function cleanValue(value: string | null | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

export function getStoredAdminConfig(): AdminConfig {
  const storedConfig = readStoredConfig();

  return {
    locker_url: cleanValue(storedConfig.locker_url) ?? DEFAULT_CONFIG.locker_url,
    image_api_key:
      cleanValue(storedConfig.image_api_key) ?? cleanValue(localStorage.getItem(STORAGE_KEY_MAP.image)) ?? DEFAULT_CONFIG.image_api_key,
    text_api_key:
      cleanValue(storedConfig.text_api_key) ?? cleanValue(localStorage.getItem(STORAGE_KEY_MAP.text)) ?? DEFAULT_CONFIG.text_api_key,
    voice_api_key:
      cleanValue(storedConfig.voice_api_key) ?? cleanValue(localStorage.getItem(STORAGE_KEY_MAP.voice)) ?? DEFAULT_CONFIG.voice_api_key,
  };
}

export function getStoredApiKey(type: ApiKeyType) {
  const storedConfig = getStoredAdminConfig();

  if (type === "image") return cleanValue(storedConfig.image_api_key);
  if (type === "text") return cleanValue(storedConfig.text_api_key);

  return cleanValue(storedConfig.voice_api_key);
}
