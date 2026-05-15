const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_TABLES = new Set([
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
]);

const EXTRA_TABLE_SPECS = {
  hcolony_master: {
    columns: ['id', 'colony_name', 'pincode', 'route_no', 'color', 'city', 'is_active'],
  },
  tag_master: {
    columns: [
      'id',
      'tag_name',
      'allow_in_permanent',
      'allow_in_transactional',
      'allow_in_patient_tag',
      'is_active',
      'created_at',
      'updated_at',
    ],
  },
};

const IMPORT_TABLES = new Set([
  ...TARGET_TABLES,
  ...Object.keys(EXTRA_TABLE_SPECS),
]);

const SKIP_TABLES = new Set([
  'address_allowed_center',
  'testwarning',
]);

const SYNC_TABLE_SPECS = {
  address: {
    columns: [
      'sync_key',
      'CenterID',
      'Atype',
      'code',
      'ABARID',
      'pname',
      'desi',
      'orgname',
      'address',
      'address1',
      'address2',
      'city',
      'pin',
      'area',
      'ophone',
      'note',
      'category',
      'Aprint',
      'title',
      'email',
      'BillingChargeMode',
      'updated_at',
    ],
    primaryKey: ['CenterID', 'Atype', 'code', 'ABARID'],
  },
  billingtomodeofreceipt: {
    columns: [
      'BillingToModeOfReceiptID',
      'ModeID',
      'CenterID',
      'Atype',
      'Code',
      'DefaultReceiptMode',
      'updated_at',
    ],
    primaryKey: ['BillingToModeOfReceiptID', 'ModeID', 'CenterID', 'Atype', 'Code'],
  },
  compcategory: {
    columns: [
      'CompCatID',
      'CatDetails',
      'createdby',
      'Modifiedby',
      'CreatedDatetime',
      'ModifiedDateTime',
      'IPAddress_SystemName',
      'Modified_IPAddress',
      'Active',
      'ExpiryDate',
      'ApplyFromDate',
      'LinkedCatId',
      'PartialPaymentfrompatient',
      'StandardMRP',
      'TurnOverAmountFrom',
      'TurnOverAmountTo',
      'Apply_Date',
      'Expiry_Date',
      'updated_at',
    ],
    primaryKey: ['CompCatID'],
  },
  groupmaster: {
    columns: ['Gcode', 'Description', 'updated_at'],
    primaryKey: ['Gcode'],
  },
  modeofpayment: {
    columns: ['ModeID', 'PaymentMode', 'DefaultMode', 'updated_at'],
    primaryKey: ['ModeID'],
  },
  panelrates: {
    columns: [
      'CompCatID',
      'GCode',
      'SCode',
      'TestCode',
      'CTestCode',
      'CTestName',
      'Charge',
      'BookedFlag',
      'DiscountAllowed',
      'MaxDiscount',
      'percentageonstandard',
      'MaximumpercentageAllowed',
      'CenterID',
      'MRP',
      'PanelRateID',
      'updated_at',
    ],
    primaryKey: ['CompCatID', 'GCode', 'SCode', 'TestCode', 'CTestCode', 'CenterID'],
  },
  subgroup: {
    columns: ['Gcode', 'Scode', 'Description', 'TestCategoryID', 'SpecimenID', 'updated_at'],
    primaryKey: ['Gcode', 'Scode'],
  },
  test: {
    columns: [
      'Gcode',
      'Scode',
      'TestCode',
      'Testcode1',
      'Description',
      'Profile',
      'TestAs',
      'SpecimenID',
      'TestCategoryID',
      'updated_at',
    ],
    primaryKey: ['Gcode', 'Scode', 'TestCode'],
  },
  testcategory: {
    columns: ['TestCategoryID', 'TestCategory', 'DiscountPercentage', 'updated_at'],
    primaryKey: ['TestCategoryID'],
  },
  testprofile: {
    columns: [
      'ProfileCodeID',
      'Gcode',
      'SCode',
      'ProfileCode',
      'TestCode',
      'TestAmount',
      'IPAddress_SystemName',
      'Modified_IPAddress',
      'ProfileCode1',
      'updated_at',
    ],
    primaryKey: ['ProfileCodeID', 'Gcode', 'SCode', 'ProfileCode', 'TestCode'],
  },
  testprofilebreakuptestsdetails: {
    columns: ['Gcode', 'SCode', 'PTCode', 'ProfileTestCode', 'TestCode', 'updated_at'],
    primaryKey: ['Gcode', 'SCode', 'PTCode', 'ProfileTestCode', 'TestCode'],
  },
  testspecimen: {
    columns: [
      'SpecimenID',
      'SpName',
      'Sampletype',
      'SPDetails',
      'ContainerID',
      'SampleCollection',
      'SampleRecieve',
      'StoreSample',
      'updated_at',
    ],
    primaryKey: ['SpecimenID'],
  },
};

const INSERT_RE = /INSERT INTO `([^`]+)`(?:\s*\((.*?)\))?\s+VALUES/s;
const CREATE_TABLE_RE = /CREATE TABLE `([^`]+)` \((.*?)\)\s*ENGINE=/gs;

const NULL_CHAR_RE = new RegExp(String.fromCharCode(0), 'g');

const readSqlFile = sqlPath => {
  const buffer = fs.readFileSync(sqlPath);

  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le', 2);
  }

  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    throw new Error(`Unsupported UTF-16 BE SQL file: ${sqlPath}`);
  }

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf8', 3);
  }

  return buffer.toString('utf8');
};

const cleanText = value =>
  value === null || value === undefined
    ? ''
    : String(value).replace(NULL_CHAR_RE, '').trim();

const toInt = value => {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

const toFloat = value => {
  const parsed = Number(cleanText(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const decodeSqlString = value => {
  let output = '';
  let escaped = false;

  for (const char of value) {
    if (escaped) {
      if (char === '0') {
        output += '\u0000';
      } else if (char === 'n') {
        output += '\n';
      } else if (char === 'r') {
        output += '\r';
      } else if (char === 't') {
        output += '\t';
      } else {
        output += char;
      }
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    output += char;
  }

  return escaped ? `${output}\\` : output;
};

const parseToken = token => {
  const trimmed = token.trim();

  if (!trimmed || trimmed.toUpperCase() === 'NULL') {
    return null;
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return decodeSqlString(trimmed.slice(1, -1));
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  return trimmed;
};

const parseRows = valuesSql => {
  const rows = [];
  let row = null;
  let token = '';
  let inString = false;
  let escaped = false;

  for (const char of valuesSql) {
    if (!row) {
      if (char === '(') {
        row = [];
        token = '';
      }
      continue;
    }

    token += char;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === ',') {
      token = token.slice(0, -1);
      row.push(parseToken(token));
      token = '';
      continue;
    }

    if (char === ')') {
      token = token.slice(0, -1);
      row.push(parseToken(token));
      rows.push(row);
      row = null;
      token = '';
    }
  }

  return rows;
};

const sqlValue = value => {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return `'${String(value).replace(/'/g, "''")}'`;
};

const quoteIdent = value => `"${String(value).replace(/"/g, '""')}"`;

const toMysqlDateTime = date => {
  const pad = value => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${[
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join(':')}`;
};

const writeInsert = (stream, table, columns, values, conflict = 'IGNORE') => {
  stream.write(
    `INSERT OR ${conflict} INTO ${quoteIdent(table)} (${columns
      .map(quoteIdent)
      .join(', ')}) VALUES (${values
      .map(sqlValue)
      .join(', ')});\n`,
  );
};

const buildAddressSyncKeyFromValues = ({centerId, atype, code, abarid, pname, category}) => {
  if (code && abarid) {
    return [centerId, atype, code, abarid].join('|');
  }

  return [centerId, atype, pname, category].join('|');
};

const buildAddressSyncKeyFromRow = (rowIndex, row) =>
  buildAddressSyncKeyFromValues({
    centerId: cleanText(row[rowIndex.CenterID]),
    atype: cleanText(row[rowIndex.Atype]),
    code: cleanText(row[rowIndex.code]),
    abarid: cleanText(row[rowIndex.ABARID]),
    pname: cleanText(row[rowIndex.pname]),
    category: cleanText(row[rowIndex.category]),
  });

const COLUMN_ALIASES = {
  address: {
    ophone: ['Omobile'],
  },
  panelrates: {
    PercentageOnStandard: ['percentageonstandard'],
  },
};

const getRowValue = (tableName, rowIndex, row, column) => {
  const directIndex = rowIndex[column];
  if (directIndex !== undefined) {
    return cleanText(row[directIndex]);
  }

  const alias = COLUMN_ALIASES[tableName]?.[column]?.find(name => rowIndex[name] !== undefined);
  return alias === undefined ? null : cleanText(row[rowIndex[alias]]);
};

const writeRawSyncInsert = (stream, tableName, rowIndex, row, seedTs) => {
  const spec = SYNC_TABLE_SPECS[tableName];

  if (!spec) {
    return;
  }

  const values = spec.columns.map(column => {
    if (column === 'updated_at') {
      return seedTs;
    }

    if (tableName === 'address' && column === 'sync_key') {
      return buildAddressSyncKeyFromRow(rowIndex, row);
    }

    return getRowValue(tableName, rowIndex, row, column);
  });

  writeInsert(stream, tableName, spec.columns, values, 'REPLACE');
};

const parseCreateTableColumns = sqlPath => {
  const content = readSqlFile(sqlPath);
  const columnsByTable = new Map();
  let match;

  while ((match = CREATE_TABLE_RE.exec(content)) !== null) {
    const [, tableName, body] = match;
    const columns = body
      .split(/\r?\n/)
      .map(line => line.trim().match(/^`([^`]+)`\s+/)?.[1])
      .filter(Boolean);

    columnsByTable.set(tableName, columns);
  }

  return columnsByTable;
};

const parseInsertBlock = (block, columnsByTable) => {
  const match = block.match(INSERT_RE);
  if (!match) {
    return null;
  }

  const tableName = match[1];
  const columns = match[2]
    ? match[2].split(',').map(column => column.trim().replace(/`/g, ''))
    : columnsByTable.get(tableName);

  if (!columns?.length) {
    return null;
  }

  const valuesSql = block.slice(match.index + match[0].length).trim().replace(/;$/, '');
  return {
    tableName,
    columns,
    rows: parseRows(valuesSql),
  };
};

const findSqlStatementEnd = (content, startIndex) => {
  const crlfEnd = content.indexOf(';\r\n', startIndex);
  const lfEnd = content.indexOf(';\n', startIndex);

  if (crlfEnd === -1) {
    return lfEnd;
  }

  if (lfEnd === -1) {
    return crlfEnd;
  }

  return Math.min(crlfEnd, lfEnd);
};

const iterInsertBlocks = function* (sqlPath) {
  const content = readSqlFile(sqlPath);
  let offset = 0;

  while (offset < content.length) {
    const insertIndex = content.indexOf('INSERT INTO `', offset);
    if (insertIndex === -1) {
      return;
    }

    const headerEnd = content.indexOf(' VALUES', insertIndex);
    if (headerEnd === -1) {
      return;
    }

    const header = content.slice(insertIndex, headerEnd + ' VALUES'.length);
    const match = header.match(INSERT_RE);
    if (!match) {
      offset = headerEnd + 1;
      continue;
    }

    const tableName = match[1];
    const statementEnd = findSqlStatementEnd(content, headerEnd);
    if (statementEnd === -1) {
      return;
    }

    if (!SKIP_TABLES.has(tableName) && IMPORT_TABLES.has(tableName)) {
      yield content.slice(insertIndex, statementEnd + 1);
    }

    offset = statementEnd + 1;
  }
};

const rawSyncSchemaSql = () =>
  Object.entries(SYNC_TABLE_SPECS)
    .map(([tableName, spec]) => {
      const columns = spec.columns
        .map(column => `${quoteIdent(column)} TEXT`)
        .join(',\n  ');
      const primaryKey = spec.primaryKey.map(quoteIdent).join(', ');

      return `
DROP TABLE IF EXISTS ${quoteIdent(tableName)};
CREATE TABLE ${quoteIdent(tableName)} (
  ${columns},
  PRIMARY KEY (${primaryKey})
);
`;
    })
    .join('\n');

const writeSyncMetaBaseline = (stream, seedTs) => {
  Object.keys(SYNC_TABLE_SPECS).forEach(tableName => {
    stream.write(`
INSERT OR REPLACE INTO sync_meta (table_name, last_synced_at)
SELECT ${sqlValue(tableName)},
       COALESCE(NULLIF(MAX(updated_at), ''), ${sqlValue(seedTs)})
FROM ${quoteIdent(tableName)}
WHERE TRIM(updated_at) != '';
INSERT OR IGNORE INTO sync_meta (table_name, last_synced_at)
VALUES (${sqlValue(tableName)}, ${sqlValue(seedTs)});
`);
  });
};

const schemaSql = (version, seedTs) => `
PRAGMA journal_mode = OFF;
PRAGMA synchronous = OFF;
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

DROP TABLE IF EXISTS catalog_meta;
DROP TABLE IF EXISTS panel_companies;
DROP TABLE IF EXISTS panel_categories;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS subgroups;
DROP TABLE IF EXISTS tests;
DROP TABLE IF EXISTS test_specimens;
DROP TABLE IF EXISTS panel_rates;
DROP TABLE IF EXISTS test_profiles;
DROP TABLE IF EXISTS sync_meta;
DROP TABLE IF EXISTS sync_status;

CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sync_meta (table_name TEXT PRIMARY KEY, last_synced_at TEXT NOT NULL);
CREATE TABLE sync_status (
  table_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  message TEXT,
  updated_at TEXT NOT NULL
);
${rawSyncSchemaSql()}
CREATE TABLE panel_categories (comp_cat_id INTEGER PRIMARY KEY, cat_details TEXT);
CREATE TABLE panel_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_key TEXT,
  pname TEXT,
  comp_cat_id INTEGER NOT NULL,
  cat_details TEXT,
  billing_charge_mode TEXT,
  center_id INTEGER,
  atype TEXT,
  search_key TEXT
);
CREATE TABLE groups (gcode TEXT PRIMARY KEY, description TEXT);
CREATE TABLE subgroups (
  gcode TEXT NOT NULL,
  scode TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY(gcode, scode)
);
CREATE TABLE tests (
  gcode TEXT,
  scode TEXT,
  test_code TEXT,
  testcode1 TEXT,
  description TEXT,
  profile INTEGER,
  specimen_id INTEGER,
  PRIMARY KEY(gcode, scode, test_code)
);
CREATE TABLE test_specimens (specimen_id INTEGER PRIMARY KEY, sp_name TEXT);
CREATE TABLE panel_rates (
  comp_cat_id INTEGER,
  gcode TEXT,
  scode TEXT,
  test_code TEXT,
  ctest_code TEXT,
  ctest_name TEXT,
  charge REAL,
  mrp REAL,
  max_discount REAL,
  base_discount_percent REAL,
  max_allowed_discount_percent REAL,
  booked_flag INTEGER
);
CREATE TABLE test_profiles (
  gcode TEXT,
  scode TEXT,
  profile_code TEXT,
  child_testcode1 TEXT
);
CREATE TABLE hcolony_master (
  id INTEGER PRIMARY KEY,
  colony_name TEXT NOT NULL,
  pincode TEXT NOT NULL,
  route_no TEXT NOT NULL,
  color TEXT DEFAULT 'green',
  city TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE tag_master (
  id INTEGER PRIMARY KEY,
  tag_name TEXT NOT NULL,
  allow_in_permanent INTEGER NOT NULL DEFAULT 0,
  allow_in_transactional INTEGER NOT NULL DEFAULT 0,
  allow_in_patient_tag INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', ${sqlValue(version)});
`;

const indexesSql = `
CREATE INDEX idx_panel_companies_comp_cat_id ON panel_companies(comp_cat_id);
CREATE INDEX idx_panel_companies_search_key ON panel_companies(search_key);
CREATE UNIQUE INDEX idx_address_sync_key
  ON address(sync_key)
  WHERE sync_key IS NOT NULL AND sync_key != '';
CREATE UNIQUE INDEX idx_panel_companies_sync_key
  ON panel_companies(sync_key)
  WHERE sync_key IS NOT NULL AND sync_key != '';
CREATE INDEX idx_panel_rates_company_group_subgroup
  ON panel_rates(comp_cat_id, gcode, scode, booked_flag);
CREATE INDEX idx_panel_rates_company_test
  ON panel_rates(comp_cat_id, gcode, scode, test_code);
CREATE INDEX idx_tests_testcode1 ON tests(testcode1);
CREATE INDEX idx_tests_specimen ON tests(specimen_id);
CREATE INDEX idx_test_profiles_parent ON test_profiles(gcode, scode, profile_code);
CREATE INDEX idx_hcolony_pincode ON hcolony_master(pincode);
CREATE INDEX idx_hcolony_route_no ON hcolony_master(route_no);
CREATE UNIQUE INDEX idx_tag_master_name ON tag_master(tag_name);
CREATE INDEX idx_tag_master_patient ON tag_master(allow_in_patient_tag, is_active);
COMMIT;
VACUUM;
`;

const getArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
};

const getArgs = name => {
  const values = [];

  process.argv.forEach((arg, index) => {
    if (arg === name && process.argv[index + 1]) {
      values.push(process.argv[index + 1]);
    }
  });

  return values;
};

const buildDatabase = ({input, extraInputs, output, version, sqlite3Path, seedTs}) => {
  const outputDir = path.dirname(output);
  fs.mkdirSync(outputDir, {recursive: true});

  if (fs.existsSync(output)) {
    fs.unlinkSync(output);
  }

  const importPath = path.join(os.tmpdir(), `catalog-import-${Date.now()}.sql`);
  const stream = fs.createWriteStream(importPath, {encoding: 'utf8'});
  const compCategories = new Map();
  const addressRows = [];
  const counts = {};
  const sqlInputs = [input, ...(Array.isArray(extraInputs) ? extraInputs : [])];
  const columnsByTable = new Map();

  sqlInputs.forEach(sqlPath => {
    parseCreateTableColumns(sqlPath).forEach((columns, tableName) => {
      columnsByTable.set(tableName, columns);
    });
  });

  stream.write(schemaSql(version, seedTs));

  for (const sqlInput of sqlInputs) {
    for (const block of iterInsertBlocks(sqlInput)) {
      const parsed = parseInsertBlock(block, columnsByTable);
      if (!parsed) {
        continue;
      }

      const {tableName, columns, rows} = parsed;
      const index = Object.fromEntries(columns.map((column, columnIndex) => [column, columnIndex]));
      counts[tableName] = (counts[tableName] || 0) + rows.length;

      if (SYNC_TABLE_SPECS[tableName]) {
        rows.forEach(row => writeRawSyncInsert(stream, tableName, index, row, seedTs));
      }

      if (tableName === 'compcategory') {
        rows.forEach(row => {
          const compCatId = toInt(row[index.CompCatID]);
          const catDetails = cleanText(row[index.CatDetails]);
          compCategories.set(compCatId, catDetails);
          writeInsert(stream, 'panel_categories', ['comp_cat_id', 'cat_details'], [
            compCatId,
            catDetails,
          ]);
        });
      } else if (tableName === 'address') {
        rows.forEach(row => {
          addressRows.push({
            centerId: toInt(row[index.CenterID]),
            centerIdText: cleanText(row[index.CenterID]),
            atype: cleanText(row[index.Atype]),
            code: cleanText(row[index.code]),
            abarid: cleanText(row[index.ABARID]),
            pname: cleanText(row[index.pname]),
            compCatId: toInt(row[index.category]),
            category: cleanText(row[index.category]),
            billingChargeMode: cleanText(row[index.BillingChargeMode]),
          });
        });
      } else if (tableName === 'groupmaster') {
        rows.forEach(row => {
          writeInsert(stream, 'groups', ['gcode', 'description'], [
            cleanText(row[index.Gcode]),
            cleanText(row[index.Description]),
          ]);
        });
      } else if (tableName === 'subgroup') {
        rows.forEach(row => {
          writeInsert(stream, 'subgroups', ['gcode', 'scode', 'description'], [
            cleanText(row[index.Gcode]),
            cleanText(row[index.Scode]),
            cleanText(row[index.Description]),
          ]);
        });
      } else if (tableName === 'test') {
        rows.forEach(row => {
          writeInsert(
            stream,
            'tests',
            ['gcode', 'scode', 'test_code', 'testcode1', 'description', 'profile', 'specimen_id'],
            [
              cleanText(row[index.Gcode]),
              cleanText(row[index.Scode]),
              cleanText(row[index.TestCode]),
              cleanText(row[index.Testcode1]),
              cleanText(row[index.Description]),
              toInt(row[index.Profile]),
              toInt(row[index.SpecimenID]),
            ],
          );
        });
      } else if (tableName === 'testspecimen') {
        rows.forEach(row => {
          writeInsert(stream, 'test_specimens', ['specimen_id', 'sp_name'], [
            toInt(row[index.SpecimenID]),
            cleanText(row[index.SpName]),
          ]);
        });
      } else if (tableName === 'panelrates') {
        rows.forEach(row => {
          const percentageOnStandard =
            toFloat(row[index.PercentageOnStandard]) ||
            toFloat(row[index.percentageonstandard]);

          writeInsert(
            stream,
            'panel_rates',
            [
              'comp_cat_id',
              'gcode',
              'scode',
              'test_code',
              'ctest_code',
              'ctest_name',
              'charge',
              'mrp',
              'max_discount',
              'base_discount_percent',
              'max_allowed_discount_percent',
              'booked_flag',
            ],
            [
              toInt(row[index.CompCatID]),
              cleanText(row[index.GCode]),
              cleanText(row[index.SCode]),
              cleanText(row[index.TestCode]),
              cleanText(row[index.CTestCode]),
              cleanText(row[index.CTestName]),
              toFloat(row[index.Charge]),
              toFloat(row[index.MRP]),
              toFloat(row[index.MaxDiscount]),
              toFloat(row[index.FBillingRDiscountPrecent]) ||
                percentageOnStandard,
              toFloat(row[index.MaximumpercentageAllowed]),
              toInt(row[index.BookedFlag]),
            ],
          );
        });
      } else if (tableName === 'testprofile') {
        rows.forEach(row => {
          writeInsert(stream, 'test_profiles', ['gcode', 'scode', 'profile_code', 'child_testcode1'], [
            cleanText(row[index.Gcode]),
            cleanText(row[index.SCode]),
            cleanText(row[index.ProfileCode]),
            cleanText(row[index.TestCode]),
          ]);
        });
      } else if (tableName === 'hcolony_master') {
        rows.forEach(row => {
          writeInsert(
            stream,
            'hcolony_master',
            EXTRA_TABLE_SPECS.hcolony_master.columns,
            [
              toInt(row[index.id]),
              cleanText(row[index.colony_name]),
              cleanText(row[index.pincode]),
              cleanText(row[index.route_no]),
              cleanText(row[index.color]) || 'green',
              cleanText(row[index.city]),
              toInt(row[index.is_active]),
            ],
            'REPLACE',
          );
        });
      } else if (tableName === 'tag_master') {
        rows.forEach(row => {
          writeInsert(
            stream,
            'tag_master',
            EXTRA_TABLE_SPECS.tag_master.columns,
            [
              toInt(row[index.id]),
              cleanText(row[index.tag_name]),
              toInt(row[index.allow_in_permanent]),
              toInt(row[index.allow_in_transactional]),
              toInt(row[index.allow_in_patient_tag]),
              toInt(row[index.is_active]),
              cleanText(row[index.created_at]),
              cleanText(row[index.updated_at]),
            ],
            'REPLACE',
          );
        });
      }
    }
  }

  addressRows.forEach(address => {
    const catDetails = compCategories.get(address.compCatId) || '';
    writeInsert(
      stream,
      'panel_companies',
      [
        'sync_key',
        'pname',
        'comp_cat_id',
        'cat_details',
        'billing_charge_mode',
        'center_id',
        'atype',
        'search_key',
      ],
      [
        buildAddressSyncKeyFromValues({
          centerId: address.centerIdText,
          atype: address.atype,
          code: address.code,
          abarid: address.abarid,
          pname: address.pname,
          category: address.category,
        }),
        address.pname,
        address.compCatId,
        catDetails,
        address.billingChargeMode,
        address.centerId,
        address.atype,
        `${address.pname} ${catDetails} ${address.compCatId}`.toLowerCase(),
      ],
    );
  });

  Object.entries(counts).forEach(([tableName, count]) => {
    writeInsert(stream, 'catalog_meta', ['key', 'value'], [
      `source_count_${tableName}`,
      String(count),
    ]);
  });

  writeSyncMetaBaseline(stream, seedTs);
  stream.write(indexesSql);
  stream.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => {
      const sqliteReadPath = importPath.replace(/\\/g, '/');
      const sqlite = childProcess.spawnSync(sqlite3Path, [output], {
        input: `.read ${sqliteReadPath}\n`,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 20,
      });

      if (sqlite.status !== 0) {
        reject(
          new Error(
            sqlite.stderr ||
              sqlite.stdout ||
              `sqlite3 import failed; import script kept at ${importPath}`,
          ),
        );
        return;
      }

      fs.rmSync(importPath, {force: true});
      resolve();
    });
    stream.on('error', reject);
  });
};

const input = getArg('--input');
const extraInputs = getArgs('--extra-input');
const output = getArg('--output');
const version = getArg('--version', 'bhasin_7001_v1');
const sqlite3Path = getArg('--sqlite3', 'sqlite3');
const seedTs = getArg(
  '--seed-ts',
  fs.existsSync(input) ? toMysqlDateTime(fs.statSync(input).mtime) : '',
);

if (!input || !output) {
  console.error('Usage: node scripts/build-catalog-db.js --input dump.sql --output catalog_preload.db --seed-ts "2026-05-04 12:56:05" [--sqlite3 sqlite3.exe]');
  process.exit(1);
}

if (!seedTs) {
  console.error('Missing --seed-ts. Provide the dump creation timestamp as YYYY-MM-DD HH:MM:SS.');
  process.exit(1);
}

buildDatabase({input, extraInputs, output, version, sqlite3Path, seedTs}).catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
