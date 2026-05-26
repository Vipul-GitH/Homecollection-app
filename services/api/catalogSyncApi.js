import {getCatalogSyncTableApiUrl} from '../../constants/config/api';
import {secureFetch} from './secureFetch';
import {shouldSkipCatalogSyncTable} from '../local/catalogSyncLocal';

const logSyncApiDebug = () => {};
const CATALOG_SYNC_REQUEST_TIMEOUT_MS = 25000;

const getRowsFromResponse = responseData => {
  if (Array.isArray(responseData)) {
    return responseData;
  }

  if (Array.isArray(responseData?.rows)) {
    return responseData.rows;
  }

  if (Array.isArray(responseData?.items)) {
    return responseData.items;
  }

  if (Array.isArray(responseData?.data)) {
    return responseData.data;
  }

  return [];
};

export const fetchCatalogSyncPageApi = async ({
  accessToken,
  tableName,
  since,
  limit,
  cursor,
}) => {
  if (shouldSkipCatalogSyncTable(tableName)) {
    return {
      rows: [],
      maxUpdatedAt: '',
      nextCursor: '',
      hasMore: false,
    };
  }

  const headers = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await secureFetch(
    getCatalogSyncTableApiUrl({tableName, since, limit, cursor}),
    {
      method: 'GET',
      headers,
      timeoutMs: CATALOG_SYNC_REQUEST_TIMEOUT_MS,
    },
  );

  let responseData = null;

  try {
    responseData = await response.json();
  } catch (error) {
    responseData = null;
  }

  if (!response.ok) {
    const syncError = new Error(
      responseData?.message ||
        responseData?.error ||
        `Sync failed for ${tableName} with status ${response.status}.`,
    );
    syncError.name = 'CatalogSyncApiError';
    syncError.status = response.status;
    syncError.statusText = response.statusText;
    syncError.responseBody = responseData;
    throw syncError;
  }

  const rows = getRowsFromResponse(responseData);
  const nextCursor =
    responseData?.next_cursor ||
    responseData?.nextCursor ||
    responseData?.cursor ||
    '';
  const maxUpdatedAt =
    responseData?.max_updated_at ||
    responseData?.maxUpdatedAt ||
    responseData?.last_updated_at ||
    '';

  logSyncApiDebug('[Catalog Sync] API page response', {
    tableName,
    status: response.status,
    since,
    cursor: cursor || null,
    rows: rows.length,
    nextCursor: nextCursor || null,
    maxUpdatedAt: maxUpdatedAt || null,
  });

  return {
    rows,
    maxUpdatedAt,
    nextCursor,
    hasMore: Boolean(
      responseData?.has_more ||
        responseData?.hasMore ||
        responseData?.next_cursor ||
        responseData?.nextCursor,
    ),
  };
};
