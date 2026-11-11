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

/**
 * For screens that must never show a stale cached snapshot after a write
 * (roster grid, employee schedule, notifications). Unlike `swrDefaults`, it
 * revalidates on mount and on focus, so navigating between the manager grid
 * and the employee portal always re-reads the database.
 */
export const realtimeSWR = {
  revalidateIfStale: true,
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  revalidateOnMount: true,
  dedupingInterval: 2000,
  refreshInterval: 15000,
  keepPreviousData: true,
};
