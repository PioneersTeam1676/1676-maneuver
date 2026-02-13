import { getCurrentApiBaseUrl } from "@/lib/apiClient";

const getApiOrigin = (): string => {
  try {
    const baseUrl = getCurrentApiBaseUrl();
    return new URL(baseUrl).origin;
  } catch {
    return "";
  }
};

export const resolveImageUrl = (value: string | null | undefined): string => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/images/")) {
    const origin = getApiOrigin();
    return origin ? `${origin}${trimmed}` : trimmed;
  }

  if (trimmed.startsWith("images/")) {
    const origin = getApiOrigin();
    return origin ? `${origin}/${trimmed}` : `/${trimmed}`;
  }

  return trimmed;
};
