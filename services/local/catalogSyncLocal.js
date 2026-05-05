import {NativeModules, Platform} from 'react-native';
import {CATALOG_SEED_TS} from '../../constants/config/api';

const {CatalogDatabaseModule} = NativeModules;

export const CATALOG_SYNC_SKIP_TABLES = new Set([
  'address_allowed_center',
  'testwarning',
]);

const CATALOG_SYNC_SOURCE_TABLES = [
  'address',
  'billingtomodeofreceipt',
  'compcategory',
  'groupmaster',
  'modeofpayment',
  'panelrates',
  'subgroup',
  'test',
  'testcategory',
  'testprofile',
  'testprofilebreakuptestsdetails',
  'testspecimen',
];

export const CATALOG_SYNC_TABLES = CATALOG_SYNC_SOURCE_TABLES.filter(
  tableName => !CATALOG_SYNC_SKIP_TABLES.has(tableName),
);

export const DEFAULT_SYNC_SINCE = CATALOG_SEED_TS;

export const shouldSkipCatalogSyncTable = tableName =>
  CATALOG_SYNC_SKIP_TABLES.has(String(tableName || '').trim().toLowerCase());

export const isCatalogSyncAvailable = () =>
  Platform.OS === 'android' && Boolean(CatalogDatabaseModule?.upsertSyncRows);

export const getCatalogTableLastSyncedAt = async tableName => {
  if (shouldSkipCatalogSyncTable(tableName)) {
    return DEFAULT_SYNC_SINCE;
  }

  if (!isCatalogSyncAvailable()) {
    return DEFAULT_SYNC_SINCE;
  }

  const value = await CatalogDatabaseModule.getSyncMeta(tableName);
  return value || DEFAULT_SYNC_SINCE;
};

export const upsertCatalogSyncRows = async ({tableName, rows}) => {
  if (
    shouldSkipCatalogSyncTable(tableName) ||
    !isCatalogSyncAvailable() ||
    !Array.isArray(rows) ||
    !rows.length
  ) {
    return {
      rowsChanged: 0,
      maxUpdatedAt: '',
    };
  }

  const result = await CatalogDatabaseModule.upsertSyncRows(
    tableName,
    JSON.stringify(rows),
  );

  return typeof result === 'string' ? JSON.parse(result) : result;
};

export const markCatalogSyncStatus = async ({tableName, status, message = ''}) => {
  if (shouldSkipCatalogSyncTable(tableName)) {
    return;
  }

  if (!isCatalogSyncAvailable() || !CatalogDatabaseModule?.markSyncStatus) {
    return;
  }

  await CatalogDatabaseModule.markSyncStatus(tableName, status, message);
};

export const setCatalogTableLastSyncedAt = async ({tableName, lastSyncedAt}) => {
  if (shouldSkipCatalogSyncTable(tableName)) {
    return;
  }

  if (!isCatalogSyncAvailable() || !CatalogDatabaseModule?.setSyncMeta) {
    return;
  }

  await CatalogDatabaseModule.setSyncMeta(tableName, lastSyncedAt);
};
