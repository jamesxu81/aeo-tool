declare module 'google-search-results-nodejs' {
  export function getJson(
    params: Record<string, unknown>,
    callback: (data: Record<string, unknown>) => void,
  ): void;
}
