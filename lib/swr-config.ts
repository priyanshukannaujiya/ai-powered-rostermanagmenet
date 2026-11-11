export const swrDefaults = {
  revalidateIfStale: false,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 15000,
};

export const dashboardSWR = {
  ...swrDefaults,
  refreshInterval: 60000,
};

export const liveSWR = {
  ...swrDefaults,
  refreshInterval: 30000,
};

export const rapidSWR = {
  ...swrDefaults,
  refreshInterval: 15000,
};
