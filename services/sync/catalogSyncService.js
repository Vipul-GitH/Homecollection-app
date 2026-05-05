import {fetchCatalogSyncPageApi} from '../api/catalogSyncApi';
import {
  CATALOG_SYNC_TABLES,
  DEFAULT_SYNC_SINCE,
  getCatalogTableLastSyncedAt,
  isCatalogSyncAvailable,
  markCatalogSyncStatus,
  setCatalogTableLastSyncedAt,
  shouldSkipCatalogSyncTable,
  upsertCatalogSyncRows,
} from '../local/catalogSyncLocal';
import {warnDebug} from '../../utils/app/logger';

const DEFAULT_PAGE_LIMIT = 1000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000];

export let isCatalogSyncRunning = false;

const logSyncDebug = (...args) => {
  if (__DEV__) {
    console.log(...args);
  }
};

const warnSyncDebug = (...args) => {
  if (__DEV__) {
    console.warn(...args);
  }
};

const wait = ms =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

const getRowUpdatedAt = row =>
  String(row?.updated_at || row?.UpdatedAt || row?.updatedAt || '').trim();

const maxUpdatedAtFromRows = rows =>
  rows.reduce((maxValue, row) => {
    const updatedAt = getRowUpdatedAt(row);
    return updatedAt && updatedAt > maxValue ? updatedAt : maxValue;
  }, '');

const normalizeCursor = cursor =>
  cursor === null || cursor === undefined ? '' : String(cursor);

const shouldRetrySyncError = error => {
  const status = Number(error?.status || 0);

  if (status >= 500) {
    return true;
  }

  if (status >= 400) {
    return false;
  }

  return true;
};

const fetchPageWithRetry = async request => {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fetchCatalogSyncPageApi(request);
    } catch (error) {
      lastError = error;

      if (!shouldRetrySyncError(error) || attempt >= MAX_RETRIES) {
        break;
      }

      await wait(
        RETRY_BACKOFF_MS[attempt] ||
          RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1],
      );
    }
  }

  throw lastError;
};

export const syncCatalogTable = async ({
  accessToken,
  tableName,
  limit = DEFAULT_PAGE_LIMIT,
}) => {
  if (shouldSkipCatalogSyncTable(tableName)) {
    logSyncDebug('[Catalog Sync] Table skipped', {tableName});
    return {
      tableName,
      ok: true,
      skipped: true,
      rowsChanged: 0,
      rowsReceived: 0,
      lastSyncedAt: DEFAULT_SYNC_SINCE,
    };
  }

  const syncSince = await getCatalogTableLastSyncedAt(tableName);
  const since = syncSince || DEFAULT_SYNC_SINCE;
  let currentCursor = '';
  let lastSuccessfulCursor = null;
  let maxUpdatedAt = '';
  let totalRowsChanged = 0;
  let totalRowsReceived = 0;

  await markCatalogSyncStatus({tableName, status: 'running'});
  logSyncDebug('[Catalog Sync] Table start', {
    tableName,
    since,
    limit,
  });

  try {
    while (true) {
      if (
        lastSuccessfulCursor !== null &&
        normalizeCursor(currentCursor) === lastSuccessfulCursor
      ) {
        const repeatedCursorLabel = currentCursor || '<initial>';
        warnSyncDebug(
          `[Catalog Sync] ${tableName} aborted: repeated cursor ${repeatedCursorLabel}`,
        );
        throw new Error(
          `Repeated cursor detected for ${tableName}: ${repeatedCursorLabel}`,
        );
      }

      const requestCursor = currentCursor;
      const page = await fetchPageWithRetry({
        accessToken,
        tableName,
        since,
        limit,
        cursor: requestCursor,
      });
      const rows = page.rows || [];
      lastSuccessfulCursor = normalizeCursor(requestCursor);
      totalRowsReceived += rows.length;

      logSyncDebug('[Catalog Sync] Page apply start', {
        tableName,
        cursor: requestCursor || null,
        rows: rows.length,
        nextCursor: page.nextCursor || null,
        pageMaxUpdatedAt: page.maxUpdatedAt || null,
      });

      if (rows.length) {
        const result = await upsertCatalogSyncRows({tableName, rows});
        const pageMaxUpdatedAt =
          page.maxUpdatedAt ||
          result?.maxUpdatedAt ||
          maxUpdatedAtFromRows(rows);

        if (pageMaxUpdatedAt && pageMaxUpdatedAt > maxUpdatedAt) {
          maxUpdatedAt = pageMaxUpdatedAt;
        }

        totalRowsChanged += Number(result?.rowsChanged || rows.length || 0);
        logSyncDebug('[Catalog Sync] Page applied', {
          tableName,
          cursor: requestCursor || null,
          rowsChanged: Number(result?.rowsChanged || rows.length || 0),
          resultMaxUpdatedAt: result?.maxUpdatedAt || null,
        });
      } else {
        logSyncDebug('[Catalog Sync] Page empty', {
          tableName,
          cursor: requestCursor || null,
        });
      }

      currentCursor = normalizeCursor(page.nextCursor);

      if (!page.hasMore || !currentCursor) {
        break;
      }
    }

    if (totalRowsReceived > 0 && maxUpdatedAt) {
      await setCatalogTableLastSyncedAt({
        tableName,
        lastSyncedAt: maxUpdatedAt,
      });
      logSyncDebug('[Catalog Sync] Meta updated', {
        tableName,
        previousLastSyncedAt: since,
        nextLastSyncedAt: maxUpdatedAt,
      });
    } else {
      logSyncDebug('[Catalog Sync] Meta unchanged', {
        tableName,
        lastSyncedAt: since,
        rowsReceived: totalRowsReceived,
      });
    }

    await markCatalogSyncStatus({tableName, status: 'success'});
    logSyncDebug('[Catalog Sync] Table complete', {
      tableName,
      rowsReceived: totalRowsReceived,
      rowsChanged: totalRowsChanged,
      lastSyncedAt: maxUpdatedAt || since,
    });
    return {
      tableName,
      ok: true,
      rowsChanged: totalRowsChanged,
      rowsReceived: totalRowsReceived,
      lastSyncedAt: maxUpdatedAt || since,
    };
  } catch (error) {
    warnSyncDebug('[Catalog Sync] Table failed', {
      tableName,
      since,
      message: error?.message || 'Sync failed',
      status: error?.status || null,
    });
    await markCatalogSyncStatus({
      tableName,
      status: 'failed',
      message: error?.message || 'Sync failed',
    });
    throw error;
  }
};

export const runCatalogSyncOnce = async ({accessToken} = {}) => {
  if (!isCatalogSyncAvailable()) {
    logSyncDebug('[Catalog Sync] Skipped: native SQLite sync unavailable');
    return [];
  }

  if (isCatalogSyncRunning) {
    logSyncDebug('[Catalog Sync] Skipped: sync already running');
    return [
      {
        status: 'skipped',
        reason: 'Catalog sync is already running.',
      },
    ];
  }

  isCatalogSyncRunning = true;
  logSyncDebug('[Catalog Sync] Cycle start', {
    tableCount: CATALOG_SYNC_TABLES.length,
  });

  try {
    const results = [];

    for (const tableName of CATALOG_SYNC_TABLES) {
      try {
        const value = await syncCatalogTable({accessToken, tableName});
        results.push({status: 'fulfilled', value});
      } catch (error) {
        warnDebug(`Catalog sync table failed (${tableName}):`, error);
        results.push({status: 'rejected', tableName, reason: error});
      }
    }

    logSyncDebug('[Catalog Sync] Cycle complete', {
      fulfilled: results.filter(result => result.status === 'fulfilled').length,
      rejected: results.filter(result => result.status === 'rejected').length,
    });
    return results;
  } finally {
    isCatalogSyncRunning = false;
    logSyncDebug('[Catalog Sync] Running flag cleared');
  }
};
