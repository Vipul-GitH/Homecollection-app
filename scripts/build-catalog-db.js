const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TARGET_TABLES = new Set([
  'address',
  'compcategory',
  'groupmaster',
  'subgroup',
  'test',
  'testspecimen',
  'panelrates',
  'testprofile',
]);

const INSERT_RE = /INSERT INTO `([^`]+)` \((.*?)\) VALUES/s;

const cleanText = value =>
  value === null || value === undefined
    ? ''
    : String(value).replace(/\u0000/g, '').trim();

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

const writeInsert = (stream, table, columns, values) => {
  stream.write(
    `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${values
      .map(sqlValue)
      .join(', ')});\n`,
  );
};

const parseInsertBlock = block => {
  const match = block.match(INSERT_RE);
  if (!match) {
    return null;
  }

  const valuesSql = block.slice(match.index + match[0].length).trim().replace(/;$/, '');
  return {
    tableName: match[1],
    columns: match[2].split(',').map(column => column.trim().replace(/`/g, '')),
    rows: parseRows(valuesSql),
  };
};

const iterInsertBlocks = function* (sqlPath) {
  const content = fs.readFileSync(sqlPath, 'utf8');
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
    const statementEnd = content.indexOf(';\n', headerEnd);
    if (statementEnd === -1) {
      return;
    }

    if (TARGET_TABLES.has(tableName)) {
      yield content.slice(insertIndex, statementEnd + 1);
    }

    offset = statementEnd + 2;
  }
};

const schemaSql = version => `
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

CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE panel_categories (comp_cat_id INTEGER PRIMARY KEY, cat_details TEXT);
CREATE TABLE panel_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  booked_flag INTEGER
);
CREATE TABLE test_profiles (
  gcode TEXT,
  scode TEXT,
  profile_code TEXT,
  child_testcode1 TEXT
);
INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('version', ${sqlValue(version)});
`;

const indexesSql = `
CREATE INDEX idx_panel_companies_comp_cat_id ON panel_companies(comp_cat_id);
CREATE INDEX idx_panel_companies_search_key ON panel_companies(search_key);
CREATE INDEX idx_panel_rates_company_group_subgroup
  ON panel_rates(comp_cat_id, gcode, scode, booked_flag);
CREATE INDEX idx_panel_rates_company_test
  ON panel_rates(comp_cat_id, gcode, scode, test_code);
CREATE INDEX idx_tests_testcode1 ON tests(testcode1);
CREATE INDEX idx_tests_specimen ON tests(specimen_id);
CREATE INDEX idx_test_profiles_parent ON test_profiles(gcode, scode, profile_code);
COMMIT;
VACUUM;
`;

const getArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
};

const buildDatabase = ({input, output, version, sqlite3Path}) => {
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

  stream.write(schemaSql(version));

  for (const block of iterInsertBlocks(input)) {
    const parsed = parseInsertBlock(block);
    if (!parsed) {
      continue;
    }

    const {tableName, columns, rows} = parsed;
    const index = Object.fromEntries(columns.map((column, columnIndex) => [column, columnIndex]));
    counts[tableName] = (counts[tableName] || 0) + rows.length;

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
          pname: cleanText(row[index.pname]),
          compCatId: toInt(row[index.category]),
          billingChargeMode: cleanText(row[index.BillingChargeMode]),
          atype: cleanText(row[index.Atype]),
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
    }
  }

  addressRows.forEach(address => {
    const catDetails = compCategories.get(address.compCatId) || '';
    writeInsert(
      stream,
      'panel_companies',
      ['pname', 'comp_cat_id', 'cat_details', 'billing_charge_mode', 'center_id', 'atype', 'search_key'],
      [
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
const output = getArg('--output');
const version = getArg('--version', 'bhasin_7001_v1');
const sqlite3Path = getArg('--sqlite3', 'sqlite3');

if (!input || !output) {
  console.error('Usage: node scripts/build-catalog-db.js --input dump.sql --output catalog_preload.db [--sqlite3 sqlite3.exe]');
  process.exit(1);
}

buildDatabase({input, output, version, sqlite3Path}).catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
