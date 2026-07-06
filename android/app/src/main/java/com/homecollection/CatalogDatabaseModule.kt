package com.homecollection

import android.content.ContentValues
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class CatalogDatabaseModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CatalogDatabaseModule"

  private val assetName = "catalog_preload.db"
  private val databaseVersion = "2"
  private val seedSyncedAt = "2026-05-09 14:56:55"
  private val maxProfileTreeDepth = 8
  private val maxProfileChildrenPerNode = 150
  private val skippedSyncTables = setOf("address_allowed_center", "testwarning")
  private var database: SQLiteDatabase? = null
  private var hasEnsuredSyncSchema = false

  private data class SyncTableSpec(
    val tableName: String,
    val columns: List<String>,
    val primaryKey: List<String>,
  )

  private val syncTableSpecs = listOf(
    SyncTableSpec(
      "address",
      listOf(
        "sync_key",
        "CenterID",
        "Atype",
        "code",
        "ABARID",
        "pname",
        "desi",
        "orgname",
        "address",
        "address1",
        "address2",
        "city",
        "pin",
        "area",
        "ophone",
        "note",
        "category",
        "Aprint",
        "title",
        "email",
        "BillingChargeMode",
        "showmrp",
        "Active",
        "updated_at",
      ),
      listOf("CenterID", "Atype", "code", "ABARID"),
    ),
    SyncTableSpec(
      "billingtomodeofreceipt",
      listOf(
        "BillingToModeOfReceiptID",
        "ModeID",
        "CenterID",
        "Atype",
        "Code",
        "DefaultReceiptMode",
        "updated_at",
      ),
      listOf("BillingToModeOfReceiptID", "ModeID", "CenterID", "Atype", "Code"),
    ),
    SyncTableSpec(
      "compcategory",
      listOf(
        "CompCatID",
        "CatDetails",
        "createdby",
        "Modifiedby",
        "CreatedDatetime",
        "ModifiedDateTime",
        "IPAddress_SystemName",
        "Modified_IPAddress",
        "Active",
        "ExpiryDate",
        "ApplyFromDate",
        "LinkedCatId",
        "PartialPaymentfrompatient",
        "StandardMRP",
        "TurnOverAmountFrom",
        "TurnOverAmountTo",
        "Apply_Date",
        "Expiry_Date",
        "updated_at",
      ),
      listOf("CompCatID"),
    ),
    SyncTableSpec("groupmaster", listOf("Gcode", "Description", "updated_at"), listOf("Gcode")),
    SyncTableSpec(
      "modeofpayment",
      listOf("ModeID", "PaymentMode", "DefaultMode", "updated_at"),
      listOf("ModeID"),
    ),
    SyncTableSpec(
      "panelrates",
      listOf(
        "CompCatID",
        "GCode",
        "SCode",
        "TestCode",
        "CTestCode",
        "CTestName",
        "Charge",
        "BookedFlag",
        "DiscountAllowed",
        "MaxDiscount",
        "percentageonstandard",
        "MaximumpercentageAllowed",
        "CenterID",
        "MRP",
        "PanelRateID",
        "Active",
        "updated_at",
      ),
      listOf("CompCatID", "GCode", "SCode", "TestCode", "CTestCode", "CenterID"),
    ),
    SyncTableSpec(
      "subgroup",
      listOf("Gcode", "Scode", "Description", "TestCategoryID", "SpecimenID", "updated_at"),
      listOf("Gcode", "Scode"),
    ),
    SyncTableSpec(
      "test",
      listOf(
        "Gcode",
        "Scode",
        "TestCode",
        "Testcode1",
        "Test",
        "Description",
        "Shortname",
        "Description1",
        "Profile",
        "TestAs",
        "SpecimenID",
        "TestCategoryID",
        "updated_at",
      ),
      listOf("Gcode", "Scode", "TestCode"),
    ),
    SyncTableSpec(
      "testcategory",
      listOf("TestCategoryID", "TestCategory", "DiscountPercentage", "updated_at"),
      listOf("TestCategoryID"),
    ),
    SyncTableSpec(
      "testprofile",
      listOf(
        "ProfileCodeID",
        "Gcode",
        "SCode",
        "ProfileCode",
        "TestCode",
        "TestAmount",
        "IPAddress_SystemName",
        "Modified_IPAddress",
        "ProfileCode1",
        "updated_at",
      ),
      listOf("ProfileCodeID", "Gcode", "SCode", "ProfileCode", "TestCode"),
    ),
    SyncTableSpec(
      "testprofilebreakuptestsdetails",
      listOf("Gcode", "SCode", "PTCode", "ProfileTestCode", "TestCode", "updated_at"),
      listOf("Gcode", "SCode", "PTCode", "ProfileTestCode", "TestCode"),
    ),
    SyncTableSpec(
      "testspecimen",
      listOf(
        "SpecimenID",
        "SpName",
        "Sampletype",
        "SPDetails",
        "ContainerID",
        "SampleCollection",
        "SampleRecieve",
        "StoreSample",
        "updated_at",
      ),
      listOf("SpecimenID"),
    ),
  ).associateBy { it.tableName }

  private data class TubeRootRequest(
    val code: String,
    val compCatId: String,
    val centerId: String,
    val atype: String,
    val gcode: String,
    val scode: String,
  )

  private data class TubeQueueItem(
    val code: String,
    val compCatId: String,
    val centerId: String,
    val atype: String,
    val gcode: String,
    val scode: String,
  )

  private data class ProfileChildRow(
    val bookedCode: String,
    val masterTestCode: String,
    val description: String,
    val profile: Int,
    val specimenName: String,
  )

  private fun databaseFile(): File =
    File(reactApplicationContext.filesDir, assetName)

  private fun copyBundledDatabase(targetFile: File) {
    targetFile.parentFile?.mkdirs()
    reactApplicationContext.assets.open(assetName).use { input ->
      FileOutputStream(targetFile, false).use { output ->
        input.copyTo(output)
      }
    }
  }

  private fun readDatabaseVersion(file: File): String {
    if (!file.exists()) {
      return ""
    }

    var db: SQLiteDatabase? = null
    return try {
      db = SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
      db.rawQuery(
          "SELECT value FROM catalog_meta WHERE key = 'version' LIMIT 1",
          emptyArray<String>(),
        ).use { cursor ->
          if (cursor.moveToFirst()) cursor.getString(0) ?: "" else ""
        }
    } catch (error: Exception) {
      ""
    } finally {
      db?.close()
    }
  }

  private fun databaseHasTable(file: File, tableName: String): Boolean {
    if (!file.exists()) {
      return false
    }

    var db: SQLiteDatabase? = null
    return try {
      db = SQLiteDatabase.openDatabase(file.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
      db.rawQuery(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
          arrayOf(tableName),
        ).use { cursor ->
          cursor.moveToFirst()
        }
    } catch (error: Exception) {
      false
    } finally {
      db?.close()
    }
  }

  @Synchronized
  private fun openDatabase(): SQLiteDatabase {
    val existingDatabase = database
    if (existingDatabase != null && existingDatabase.isOpen) {
      return existingDatabase
    }

    val targetFile = databaseFile()
    val currentVersion = readDatabaseVersion(targetFile)

    if (currentVersion != databaseVersion || !databaseHasTable(targetFile, "hcolony_master")) {
      database?.close()
      database = null
      copyBundledDatabase(targetFile)
    }

    return SQLiteDatabase.openDatabase(
      targetFile.absolutePath,
      null,
      SQLiteDatabase.OPEN_READWRITE,
    ).also {
      database = it
      ensureSyncSchema(it)
    }
  }

  private fun quoteIdent(value: String): String = "\"${value.replace("\"", "\"\"")}\""

  private fun ensureSyncSchema(db: SQLiteDatabase) {
    if (hasEnsuredSyncSchema) {
      return
    }

    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS sync_meta (
        table_name TEXT PRIMARY KEY,
        last_synced_at TEXT NOT NULL
      )
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS sync_status (
        table_name TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        message TEXT,
        updated_at TEXT NOT NULL
      )
      """.trimIndent(),
    )
    db.execSQL("DROP TABLE IF EXISTS handover_pending")

    syncTableSpecs.values.forEach { spec ->
      val columnSql = spec.columns.joinToString(", ") { column ->
        syncColumnDefinition(spec.tableName, column)
      }
      val primaryKeySql = spec.primaryKey.joinToString(", ") { quoteIdent(it) }
      db.execSQL(
        """
        CREATE TABLE IF NOT EXISTS ${quoteIdent(spec.tableName)} (
          $columnSql,
          PRIMARY KEY ($primaryKeySql)
        )
        """.trimIndent(),
      )
      ensureUpdatedAtColumn(db, spec.tableName)
      db.execSQL(
        """
        INSERT OR IGNORE INTO sync_meta (table_name, last_synced_at)
        VALUES (?, ?)
        """.trimIndent(),
        arrayOf(spec.tableName, maxUpdatedAtForTable(db, spec.tableName).ifBlank { seedSyncedAt }),
      )
    }

    ensurePanelRatesDiscountPercentSchema(db)
    ensureAddressShowMrpSchema(db)
    ensureActiveFlagSchema(db)
    ensureAddressSyncKeySchema(db)
    ensureTestsGenderFlagSchema(db)
    ensurePerformanceIndexes(db)

    hasEnsuredSyncSchema = true
  }

  private fun ensurePerformanceIndexes(db: SQLiteDatabase) {
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_panel_companies_comp_cat_id ON panel_companies(comp_cat_id)",
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_panel_companies_search_key ON panel_companies(search_key)",
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_panel_rates_company_group_subgroup ON panel_rates(comp_cat_id, gcode, scode)",
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_panel_rates_company_test ON panel_rates(comp_cat_id, booked_code)",
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_panelrates_company_group_subgroup ON panelrates(CompCatID, CenterID, GCode, SCode, BookedFlag)",
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_panelrates_company_test ON panelrates(CompCatID, CenterID, TestCode, CTestCode, BookedFlag)",
    )
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_groups_gcode ON groups(gcode)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_subgroups_group_subgroup ON subgroups(gcode, scode)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_tests_testcode1 ON tests(testcode1)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_tests_test_code ON tests(test_code)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_tests_group_subgroup_test ON tests(gcode, scode, test_code)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_tests_gender_flag ON tests(gender_flag)")
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_tests_specimen ON tests(specimen_id)")
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_test_profiles_parent ON test_profiles(gcode, scode, profile_code)",
    )
    db.execSQL(
      "CREATE INDEX IF NOT EXISTS idx_test_profiles_parent_child ON test_profiles(gcode, scode, profile_code, child_testcode1)",
    )
  }

  private fun ensurePanelRatesDiscountPercentSchema(db: SQLiteDatabase) {
    ensureColumn(db, "panel_rates", "base_discount_percent", "REAL")
    ensureColumn(db, "panel_rates", "max_allowed_discount_percent", "REAL")
  }

  private fun ensureAddressShowMrpSchema(db: SQLiteDatabase) {
    ensureColumn(db, "address", "showmrp", "TINYINT(1) NOT NULL DEFAULT 0")
  }

  private fun ensureActiveFlagSchema(db: SQLiteDatabase) {
    ensureColumn(db, "address", "Active", "TEXT DEFAULT '1'")
    ensureColumn(db, "panelrates", "Active", "TEXT DEFAULT '1'")
    ensureColumn(db, "panel_companies", "showmrp", "INTEGER NOT NULL DEFAULT 0")
    ensureColumn(db, "panel_companies", "active", "INTEGER NOT NULL DEFAULT 1")
    ensureColumn(db, "panel_rates", "active", "INTEGER NOT NULL DEFAULT 1")
  }

  private fun ensureAddressSyncKeySchema(db: SQLiteDatabase) {
    ensureColumn(db, "address", "sync_key", "TEXT")
    ensureColumn(db, "panel_companies", "sync_key", "TEXT")
    db.execSQL(
      """
      UPDATE address
      SET sync_key =
        CASE
          WHEN TRIM(IFNULL(code, '')) != '' AND TRIM(IFNULL(ABARID, '')) != ''
            THEN IFNULL(CenterID, '') || '|' || IFNULL(Atype, '') || '|' || IFNULL(code, '') || '|' || IFNULL(ABARID, '')
          ELSE IFNULL(CenterID, '') || '|' || IFNULL(Atype, '') || '|' || IFNULL(pname, '') || '|' || IFNULL(category, '')
        END
      WHERE sync_key IS NULL OR sync_key = ''
      """.trimIndent(),
    )
    db.execSQL(
      """
      UPDATE panel_companies
      SET sync_key = (
        SELECT a.sync_key
        FROM address a
        WHERE CAST(a.CenterID AS TEXT) = CAST(panel_companies.center_id AS TEXT)
          AND IFNULL(a.Atype, '') = IFNULL(panel_companies.atype, '')
          AND CAST(a.category AS TEXT) = CAST(panel_companies.comp_cat_id AS TEXT)
          AND IFNULL(a.pname, '') = IFNULL(panel_companies.pname, '')
          AND TRIM(IFNULL(a.sync_key, '')) != ''
        LIMIT 1
      )
      WHERE sync_key IS NULL OR sync_key = ''
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE UNIQUE INDEX IF NOT EXISTS idx_address_sync_key
      ON address(sync_key)
      WHERE sync_key IS NOT NULL AND sync_key != ''
      """.trimIndent(),
    )
    db.execSQL(
      """
      CREATE UNIQUE INDEX IF NOT EXISTS idx_panel_companies_sync_key
      ON panel_companies(sync_key)
      WHERE sync_key IS NOT NULL AND sync_key != ''
      """.trimIndent(),
    )
  }

  private fun ensureTestsGenderFlagSchema(db: SQLiteDatabase) {
    ensureColumn(db, "tests", "gender_flag", "TEXT")
    ensureColumn(db, "tests", "shortname", "TEXT")
    db.execSQL(
      """
      UPDATE tests
      SET shortname = (
        SELECT Shortname
        FROM test
        WHERE test.Gcode = tests.gcode
          AND test.Scode = tests.scode
          AND test.TestCode = tests.test_code
        LIMIT 1
      )
      WHERE (shortname IS NULL OR TRIM(shortname) = '')
        AND EXISTS (
          SELECT 1
          FROM test
          WHERE test.Gcode = tests.gcode
            AND test.Scode = tests.scode
            AND test.TestCode = tests.test_code
            AND TRIM(IFNULL(test.Shortname, '')) != ''
        )
      """.trimIndent(),
    )
  }

  private fun maxUpdatedAtForTable(db: SQLiteDatabase, tableName: String): String {
    return try {
      db.rawQuery(
        "SELECT MAX(updated_at) FROM ${quoteIdent(tableName)} WHERE TRIM(updated_at) != ''",
        emptyArray(),
      ).use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0)?.trim() ?: "" else ""
      }
    } catch (error: Exception) {
      ""
    }
  }

  private fun ensureUpdatedAtColumn(db: SQLiteDatabase, tableName: String) {
    ensureColumn(db, tableName, "updated_at", "TEXT")
  }

  private fun ensureColumn(
    db: SQLiteDatabase,
    tableName: String,
    columnName: String,
    columnType: String,
  ) {
    db.rawQuery("PRAGMA table_info(${quoteIdent(tableName)})", emptyArray()).use { cursor ->
      while (cursor.moveToNext()) {
        if (cursor.stringValue("name").equals(columnName, ignoreCase = true)) {
          return
        }
      }
    }

    db.execSQL(
      "ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${quoteIdent(columnName)} $columnType",
    )
  }

  private fun syncColumnDefinition(tableName: String, columnName: String): String {
    val type =
      if (tableName == "address" && columnName.equals("showmrp", ignoreCase = true)) {
        "TINYINT(1) NOT NULL DEFAULT 0"
      } else {
        "TEXT"
      }

    return "${quoteIdent(columnName)} $type"
  }

  private fun Cursor.stringValue(columnName: String): String {
    val index = getColumnIndex(columnName)
    if (index < 0 || isNull(index)) {
      return ""
    }

    return getString(index)?.trim() ?: ""
  }

  private fun Cursor.doubleValue(columnName: String): Double {
    val index = getColumnIndex(columnName)
    if (index < 0 || isNull(index)) {
      return 0.0
    }

    return getDouble(index)
  }

  private fun Cursor.intValue(columnName: String): Int {
    val index = getColumnIndex(columnName)
    if (index < 0 || isNull(index)) {
      return 0
    }

    return getInt(index)
  }

  private fun normalizePatientGenderFilter(value: String): String {
    val normalizedValue = value.trim().lowercase()

    return when {
      normalizedValue.startsWith("m") -> "male"
      normalizedValue.startsWith("f") -> "female"
      else -> ""
    }
  }

  private fun genderFilterWhere(columnName: String = "gender_flag"): String =
    """
    (
      ? = ''
      OR TRIM(IFNULL($columnName, '')) = ''
      OR LOWER(TRIM($columnName)) IN ('1', 'both', 'all')
      OR (? = 'male' AND LOWER(TRIM($columnName)) IN ('2', 'male', 'm'))
      OR (? = 'female' AND LOWER(TRIM($columnName)) IN ('3', 'female', 'f'))
    )
    """.trimIndent()

  private fun genderFilterArgs(patientGender: String): Array<String> {
    val genderFilter = normalizePatientGenderFilter(patientGender)
    return arrayOf(genderFilter, genderFilter, genderFilter)
  }

  @ReactMethod
  fun getPanelCompanies(promise: Promise) {
    getPanelCompaniesByAtype("", promise)
  }

  @ReactMethod
  fun getPanelCompaniesByAtype(atype: String, promise: Promise) {
    try {
      val db = openDatabase()
      val items = JSONArray()
      val normalizedAtype = atype.trim().uppercase()
      val whereParts = mutableListOf(
        "TRIM(IFNULL(pname, '')) != ''",
        "active = 1",
      )
      if (normalizedAtype.isNotBlank()) {
        whereParts.add("UPPER(TRIM(IFNULL(atype, ''))) = ?")
      }
      val whereSql = "WHERE ${whereParts.joinToString(" AND ")}"
      val args =
        if (normalizedAtype.isBlank()) emptyArray<String>() else arrayOf(normalizedAtype)

      db.rawQuery(
        """
        SELECT
          CAST(id AS TEXT) AS id,
          sync_key,
          CAST(center_id AS TEXT) AS center_id,
          atype,
          pname,
          CAST(comp_cat_id AS TEXT) AS comp_cat_id,
          cat_details,
          billing_charge_mode,
          showmrp,
          active
        FROM panel_companies
        $whereSql
        ORDER BY pname COLLATE NOCASE, comp_cat_id
        """.trimIndent(),
        args,
      ).use { cursor ->
        while (cursor.moveToNext()) {
          items.put(
            JSONObject()
              .put("id", cursor.stringValue("id"))
              .put("sync_key", cursor.stringValue("sync_key"))
              .put("CenterID", cursor.stringValue("center_id"))
              .put("Atype", cursor.stringValue("atype"))
              .put("pname", cursor.stringValue("pname"))
              .put("CompCatID", cursor.stringValue("comp_cat_id"))
              .put("CatDetails", cursor.stringValue("cat_details"))
              .put("BillingChargeMode", cursor.stringValue("billing_charge_mode"))
              .put("showmrp", cursor.intValue("showmrp"))
              .put("ShowMRP", cursor.intValue("showmrp"))
              .put("Active", cursor.intValue("active")),
          )
        }
      }

      promise.resolve(JSONObject().put("ok", true).put("items", items).toString())
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun getAddressCities(promise: Promise) {
    try {
      val db = openDatabase()
      val items = JSONArray()

      db.rawQuery(
        """
        SELECT DISTINCT city
        FROM hcolony_master
        WHERE is_active = 1 AND TRIM(city) != ''
        ORDER BY city COLLATE NOCASE
        """.trimIndent(),
        emptyArray<String>(),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          items.put(cursor.stringValue("city"))
        }
      }

      promise.resolve(JSONObject().put("ok", true).put("items", items).toString())
    } catch (error: Exception) {
      promise.reject("ADDRESS_CITIES_ERROR", error)
    }
  }

  @ReactMethod
  fun getAddressColoniesByCity(city: String, promise: Promise) {
    try {
      val db = openDatabase()
      val items = JSONArray()

      db.rawQuery(
        """
        SELECT id, colony_name, pincode, route_no, color, city
        FROM hcolony_master
        WHERE is_active = 1
          AND LOWER(TRIM(city)) = LOWER(TRIM(?))
          AND TRIM(colony_name) != ''
        ORDER BY colony_name COLLATE NOCASE
        """.trimIndent(),
        arrayOf(city),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          items.put(
            JSONObject()
              .put("id", cursor.stringValue("id"))
              .put("colony_name", cursor.stringValue("colony_name"))
              .put("pincode", cursor.stringValue("pincode"))
              .put("route_no", cursor.stringValue("route_no"))
              .put("color", cursor.stringValue("color"))
              .put("city", cursor.stringValue("city")),
          )
        }
      }

      promise.resolve(JSONObject().put("ok", true).put("items", items).toString())
    } catch (error: Exception) {
      promise.reject("ADDRESS_COLONIES_ERROR", error)
    }
  }

  @ReactMethod
  fun getAddressRoutesByPincode(pincode: String, promise: Promise) {
    try {
      val db = openDatabase()
      val items = JSONArray()

      db.rawQuery(
        """
        SELECT DISTINCT pincode, route_no, city, colony_name
        FROM hcolony_master
        WHERE is_active = 1 AND TRIM(pincode) = TRIM(?)
        ORDER BY route_no COLLATE NOCASE, colony_name COLLATE NOCASE
        """.trimIndent(),
        arrayOf(pincode),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          items.put(
            JSONObject()
              .put("pincode", cursor.stringValue("pincode"))
              .put("route_no", cursor.stringValue("route_no"))
              .put("city", cursor.stringValue("city"))
              .put("colony_name", cursor.stringValue("colony_name")),
          )
        }
      }

      promise.resolve(JSONObject().put("ok", true).put("items", items).toString())
    } catch (error: Exception) {
      promise.reject("ADDRESS_PINCODE_ERROR", error)
    }
  }

  @ReactMethod
  fun getPatientTags(promise: Promise) {
    try {
      val db = openDatabase()
      val items = JSONArray()

      db.rawQuery(
        """
        SELECT tag_name
        FROM tag_master
        WHERE is_active = 1
          AND allow_in_patient_tag = 1
          AND TRIM(tag_name) != ''
        ORDER BY tag_name COLLATE NOCASE
        """.trimIndent(),
        emptyArray<String>(),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          items.put(cursor.stringValue("tag_name"))
        }
      }

      promise.resolve(JSONObject().put("ok", true).put("items", items).toString())
    } catch (error: Exception) {
      promise.reject("PATIENT_TAGS_ERROR", error)
    }
  }

  @ReactMethod
  fun getMatchedPanelCompaniesForPatient(patientJson: String, promise: Promise) {
    try {
      val db = openDatabase()
      val patient = JSONObject(patientJson.ifBlank { "{}" })
      val panelCompanyName = patient.optString("panelCompany", "")
        .ifBlank { patient.optString("panel_company", "") }
        .trim()
      val compCatId = patient.optString("compCatId", "")
        .ifBlank { patient.optString("comp_cat_id", "") }
        .trim()
      val selectedCompCatIds = patient.optString("selectedCompCatIds", "")
        .ifBlank { patient.optString("selected_comp_cat_ids", "") }
        .trim()
      val centerId = patient.optString("centerId", "")
        .ifBlank { patient.optString("CenterID", "") }
        .trim()
      val atype = patient.optString("atype", "")
        .ifBlank { patient.optString("Atype", "") }
        .trim()
      val items = findMatchedPanelCompanies(
        db,
        panelCompanyName,
        compCatId,
        selectedCompCatIds,
        centerId,
        atype,
      )

      promise.resolve(JSONObject().put("ok", true).put("items", items).toString())
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun getPanelCatalogByCompany(compCatId: String, promise: Promise) {
    try {
      val db = openDatabase()
      val normalizedCompCatId = compCatId.trim()
      val groups = JSONArray()
      val panelCompany = resolvePanelCompanyName(db, normalizedCompCatId)

      db.rawQuery(
        """
        SELECT DISTINCT pr.gcode, g.description
        FROM panel_rates pr
        JOIN groups g ON g.gcode = pr.gcode
        WHERE pr.comp_cat_id = ?
          AND pr.booked_flag = 1
          AND pr.active = 1
          AND TRIM(pr.gcode) != ''
          AND TRIM(pr.scode) != ''
          AND TRIM(pr.test_code) != ''
        ORDER BY pr.gcode COLLATE NOCASE
        """.trimIndent(),
        arrayOf(normalizedCompCatId),
      ).use { groupCursor ->
        while (groupCursor.moveToNext()) {
          val gcode = groupCursor.stringValue("gcode")
          val subgroups = buildSubgroups(db, normalizedCompCatId, gcode)

          if (subgroups.length() > 0) {
            groups.put(
              JSONObject()
                .put("group_id", gcode)
                .put("gcode", gcode)
                .put("group_name", groupCursor.stringValue("description"))
                .put("subgroups", subgroups),
            )
          }
        }
      }

      promise.resolve(
        JSONObject()
          .put("ok", true)
          .put("panel_company", panelCompany)
          .put("groups", groups)
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun getPanelCatalogByCompanyIdentity(panelCompanyJson: String, promise: Promise) {
    try {
      val db = openDatabase()
      val request = JSONObject(panelCompanyJson.ifBlank { "{}" })
      val compCatId = request.optString("compCatId", "")
        .ifBlank { request.optString("CompCatID", "") }
        .trim()
      val panelCode = request.optString("panelCode", "")
        .ifBlank { request.optString("panel_code", "") }
        .trim()
      val panelAbarid = request.optString("panelAbarid", "")
        .ifBlank { request.optString("panel_abarid", "") }
        .trim()
      val resolvedPanel = resolvePanelCompanyIdentity(
        db,
        compCatId,
        request.optString("centerId", "").ifBlank { request.optString("CenterID", "") },
        request.optString("atype", "").ifBlank { request.optString("Atype", "") },
        panelCode,
        panelAbarid,
      )

      val normalizedCompCatId = resolvedPanel.optString("compCatId", compCatId).trim()
      val centerId = resolvedPanel.optString("centerId", "").trim()
      val groups = if (centerId.isNotBlank()) {
        buildGroupsForRawPanelRates(db, normalizedCompCatId, centerId)
      } else {
        buildGroupsForProjectedPanelRates(db, normalizedCompCatId)
      }
      val panelCompany = resolvedPanel.optString("name", "")
        .ifBlank { resolvePanelCompanyName(db, normalizedCompCatId) }

      promise.resolve(
        JSONObject()
          .put("ok", true)
          .put("panel_company", panelCompany)
          .put("panel_identity", resolvedPanel)
          .put("groups", groups)
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun getPanelCatalogGroupsByCompanyIdentity(panelCompanyJson: String, promise: Promise) {
    try {
      val db = openDatabase()
      val resolvedPanel = resolvePanelIdentityFromRequest(db, panelCompanyJson)
      val normalizedCompCatId = resolvedPanel.optString("compCatId", "").trim()
      val centerId = resolvedPanel.optString("centerId", "").trim()
      val groups = if (centerId.isNotBlank()) {
        buildLightRawGroups(db, normalizedCompCatId, centerId)
      } else {
        buildLightGroups(db, normalizedCompCatId)
      }
      val panelCompany = resolvedPanel.optString("name", "")
        .ifBlank { resolvePanelCompanyName(db, normalizedCompCatId) }

      promise.resolve(
        JSONObject()
          .put("ok", true)
          .put("lazy", true)
          .put("panel_company", panelCompany)
          .put("panel_identity", resolvedPanel)
          .put("groups", groups)
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun getPanelCatalogSubgroupsByCompanyIdentity(
    panelCompanyJson: String,
    gcode: String,
    promise: Promise,
  ) {
    try {
      val db = openDatabase()
      val resolvedPanel = resolvePanelIdentityFromRequest(db, panelCompanyJson)
      val normalizedCompCatId = resolvedPanel.optString("compCatId", "").trim()
      val centerId = resolvedPanel.optString("centerId", "").trim()
      val subgroups = if (centerId.isNotBlank()) {
        buildLightRawSubgroups(db, normalizedCompCatId, centerId, gcode)
      } else {
        buildLightSubgroups(db, normalizedCompCatId, gcode)
      }

      promise.resolve(
        JSONObject()
          .put("ok", true)
          .put("lazy", true)
          .put("panel_identity", resolvedPanel)
          .put("gcode", gcode)
          .put("subgroups", subgroups)
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun getPanelCatalogTestsByCompanyIdentity(
    panelCompanyJson: String,
    gcode: String,
    scode: String,
    patientGender: String,
    promise: Promise,
  ) {
    try {
      val db = openDatabase()
      val resolvedPanel = resolvePanelIdentityFromRequest(db, panelCompanyJson)
      val normalizedCompCatId = resolvedPanel.optString("compCatId", "").trim()
      val centerId = resolvedPanel.optString("centerId", "").trim()
      val tests = if (centerId.isNotBlank()) {
        buildRawTests(db, normalizedCompCatId, centerId, gcode, scode, patientGender)
      } else {
        buildTests(db, normalizedCompCatId, gcode, scode, patientGender)
      }

      promise.resolve(
        JSONObject()
          .put("ok", true)
          .put("lazy", true)
          .put("panel_identity", resolvedPanel)
          .put("gcode", gcode)
          .put("scode", scode)
          .put("tests", tests)
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun searchPanelCatalogTestsByCompanyIdentity(
    panelCompanyJson: String,
    query: String,
    limitText: String,
    patientGender: String,
    promise: Promise,
  ) {
    try {
      val db = openDatabase()
      val resolvedPanel = resolvePanelIdentityFromRequest(db, panelCompanyJson)
      val normalizedCompCatId = resolvedPanel.optString("compCatId", "").trim()
      val centerId = resolvedPanel.optString("centerId", "").trim()
      val limit = limitText.toIntOrNull()?.coerceIn(1, 150) ?: 80
      val tests = if (centerId.isNotBlank()) {
        searchRawTests(db, normalizedCompCatId, centerId, query, limit, patientGender)
      } else {
        searchProjectedTests(db, normalizedCompCatId, query, limit, patientGender)
      }

      promise.resolve(
        JSONObject()
          .put("ok", true)
          .put("lazy", true)
          .put("panel_identity", resolvedPanel)
          .put("tests", tests)
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun getBookingTestPrices(testRequestsJson: String, promise: Promise) {
    try {
      val db = openDatabase()
      val requests = JSONArray(testRequestsJson.ifBlank { "[]" })
      val patients = JSONArray()

      for (patientIndex in 0 until requests.length()) {
        val request = requests.optJSONObject(patientIndex) ?: continue
        val tests = request.optJSONArray("tests") ?: JSONArray()
        val resolvedTests = JSONArray()

        for (testIndex in 0 until tests.length()) {
          val test = tests.optJSONObject(testIndex) ?: continue
          val code = rowString(test, "code").ifBlank { rowString(test, "booked_code") }
          if (code.isBlank()) {
            continue
          }

          val resolvedRate = resolveBookingTestPrice(db, request, test, code)
          resolvedTests.put(
            JSONObject()
              .put("code", code)
              .put("booked_code", resolvedRate.optString("booked_code", code))
              .put("description", resolvedRate.optString("description", rowString(test, "description")))
              .put("charge", resolvedRate.optDouble("charge", 0.0))
              .put("mrp", resolvedRate.optDouble("mrp", 0.0))
              .put("max_discount", resolvedRate.optDouble("max_discount", 0.0))
              .put("max_allowed_discount", resolvedRate.optDouble("max_allowed_discount", 0.0)),
          )
        }

        patients.put(
          JSONObject()
            .put("patient_id", request.optString("patient_id"))
            .put("tests", resolvedTests),
        )
      }

      promise.resolve(JSONObject().put("ok", true).put("patients", patients).toString())
    } catch (error: Exception) {
      promise.reject("BOOKING_TEST_PRICE_ERROR", error)
    }
  }

  private fun resolveBookingTestPrice(
    db: SQLiteDatabase,
    request: JSONObject,
    test: JSONObject,
    code: String,
  ): JSONObject {
    val compCatId = rowString(test, "comp_cat_id").ifBlank { rowString(request, "comp_cat_id") }
    val centerId = rowString(test, "center_id").ifBlank { rowString(request, "center_id") }
    val normalizedCode = code.trim().uppercase()
    val (gcode, scode, shortTestCode) = parseFullCatalogCodeParts(normalizedCode)

    if (compCatId.isNotBlank()) {
      val rawArgs = mutableListOf(compCatId)
      if (centerId.isNotBlank()) {
        rawArgs.add(centerId)
      }
      val centerClause = if (centerId.isNotBlank()) "AND CAST(pr.CenterID AS TEXT) = ?" else ""
      val rawCodeClause =
        if (gcode.isNotBlank() && scode.isNotBlank() && shortTestCode.isNotBlank()) {
          rawArgs.add(gcode)
          rawArgs.add(scode)
          rawArgs.add(shortTestCode)
          rawArgs.add(normalizedCode)
          """
          AND UPPER(TRIM(pr.GCode)) = ?
          AND UPPER(TRIM(pr.SCode)) = ?
          AND (
            UPPER(TRIM(pr.TestCode)) = ?
            OR UPPER(TRIM(pr.CTestCode)) = ?
          )
          """.trimIndent()
        } else {
          rawArgs.add(normalizedCode)
          rawArgs.add(normalizedCode)
          """
          AND (
            UPPER(TRIM(pr.TestCode)) = ?
            OR UPPER(TRIM(pr.CTestCode)) = ?
          )
          """.trimIndent()
        }

      db.rawQuery(
        """
        SELECT
          COALESCE(NULLIF(pr.CTestCode, ''), NULLIF(pr.TestCode, '')) AS booked_code,
          COALESCE(NULLIF(t1.description, ''), NULLIF(t2.description, ''), NULLIF(pr.CTestName, ''), NULLIF(pr.TestCode, '')) AS description,
          CAST(pr.Charge AS REAL) AS charge,
          CAST(pr.MRP AS REAL) AS mrp,
          CAST(IFNULL(NULLIF(pr.percentageonstandard, ''), '0') AS REAL) AS percentageonstandard,
          CASE
            WHEN NULLIF(pr.percentageonstandard, '') IS NOT NULL
              THEN CAST(pr.MRP AS REAL) * CAST(pr.percentageonstandard AS REAL) / 100.0
            ELSE CAST(IFNULL(NULLIF(pr.MaxDiscount, ''), '0') AS REAL)
          END AS max_discount,
          CAST(pr.MRP AS REAL) * CAST(IFNULL(NULLIF(pr.MaximumpercentageAllowed, ''), '0') AS REAL) / 100.0 AS max_allowed_discount
        FROM panelrates pr
        LEFT JOIN tests t1
          ON UPPER(TRIM(t1.test_code)) = UPPER(TRIM(pr.TestCode))
        LEFT JOIN tests t2
          ON UPPER(TRIM(t2.testcode1)) = UPPER(TRIM(pr.CTestCode))
        WHERE CAST(pr.CompCatID AS TEXT) = ?
          $centerClause
          $rawCodeClause
          AND CAST(pr.BookedFlag AS TEXT) = '1'
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
        ORDER BY CAST(pr.MRP AS REAL) DESC
        LIMIT 1
        """.trimIndent(),
        rawArgs.toTypedArray(),
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          return JSONObject()
            .put("booked_code", cursor.stringValue("booked_code"))
            .put("description", cursor.stringValue("description"))
            .put("charge", cursor.doubleValue("charge"))
            .put("mrp", cursor.doubleValue("mrp"))
            .put("percentageonstandard", cursor.doubleValue("percentageonstandard"))
            .put("max_discount", cursor.doubleValue("max_discount"))
            .put("max_allowed_discount", cursor.doubleValue("max_allowed_discount"))
        }
      }

      val projectedArgs = mutableListOf(compCatId)
      val projectedCodeClause =
        if (gcode.isNotBlank() && scode.isNotBlank() && shortTestCode.isNotBlank()) {
          projectedArgs.add(gcode)
          projectedArgs.add(scode)
          projectedArgs.add(shortTestCode)
          projectedArgs.add(normalizedCode)
          """
          AND pr.gcode = ?
          AND pr.scode = ?
          AND (
            UPPER(TRIM(pr.test_code)) = ?
            OR UPPER(TRIM(pr.ctest_code)) = ?
          )
          """.trimIndent()
        } else {
          projectedArgs.add(normalizedCode)
          projectedArgs.add(normalizedCode)
          projectedArgs.add(normalizedCode)
          projectedArgs.add(normalizedCode)
          """
          AND (
            UPPER(TRIM(pr.test_code)) = ?
            OR UPPER(TRIM(pr.ctest_code)) = ?
            OR UPPER(TRIM(t1.testcode1)) = ?
            OR UPPER(TRIM(t2.testcode1)) = ?
          )
          """.trimIndent()
        }

      db.rawQuery(
        """
        SELECT
          COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.ctest_code, ''),
            NULLIF(pr.test_code, '')
          ) AS booked_code,
          COALESCE(
            NULLIF(t1.description, ''),
            NULLIF(t2.description, ''),
            NULLIF(pr.ctest_name, ''),
            NULLIF(pr.test_code, '')
          ) AS description,
          pr.charge AS charge,
          pr.mrp AS mrp,
          pr.base_discount_percent AS percentageonstandard,
          (pr.mrp * IFNULL(pr.base_discount_percent, 0) / 100.0) AS max_discount,
          (pr.mrp * IFNULL(pr.max_allowed_discount_percent, 0) / 100.0) AS max_allowed_discount
        FROM panel_rates pr
        LEFT JOIN tests t1
          ON t1.gcode = pr.gcode
         AND t1.scode = pr.scode
         AND t1.test_code = pr.test_code
        LEFT JOIN tests t2
          ON t2.testcode1 = pr.ctest_code
         AND TRIM(pr.ctest_code) != ''
        WHERE pr.comp_cat_id = ?
          $projectedCodeClause
          AND pr.booked_flag = 1
          AND pr.active = 1
        ORDER BY pr.mrp DESC
        LIMIT 1
        """.trimIndent(),
        projectedArgs.toTypedArray(),
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          return JSONObject()
            .put("booked_code", cursor.stringValue("booked_code"))
            .put("description", cursor.stringValue("description"))
            .put("charge", cursor.doubleValue("charge"))
            .put("mrp", cursor.doubleValue("mrp"))
            .put("percentageonstandard", cursor.doubleValue("percentageonstandard"))
            .put("max_discount", cursor.doubleValue("max_discount"))
            .put("max_allowed_discount", cursor.doubleValue("max_allowed_discount"))
        }
      }
    }

    return JSONObject().put("booked_code", code)
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getSpecimenNameForTestCodeSync(testCode: String): String {
    return try {
      val db = openDatabase()
      val normalizedTestCode = testCode.trim()

      db.rawQuery(
        """
        SELECT ts.sp_name
        FROM tests t
        JOIN test_specimens ts ON ts.specimen_id = t.specimen_id
        WHERE t.testcode1 = ? OR t.test_code = ?
        LIMIT 1
        """.trimIndent(),
        arrayOf(normalizedTestCode, normalizedTestCode),
      ).use { cursor ->
        if (cursor.moveToFirst()) cursor.stringValue("sp_name") else ""
      }
    } catch (error: Exception) {
      ""
    }
  }

  @ReactMethod
  fun getSampleTubeMappingForTestCodes(testCodesJson: String, promise: Promise) {
    try {
      val startedAt = System.currentTimeMillis()
      val db = openDatabase()
      val roots = JSONArray(testCodesJson)
      val queue = ArrayDeque<TubeQueueItem>()
      val visited = mutableSetOf<String>()
      val testsMap = JSONObject()
      val childrenMap = JSONObject()
      val testInfoCache = mutableMapOf<String, JSONObject>()
      val childCodesCache = mutableMapOf<String, List<String>>()
      val profileChildrenByGroupCache = mutableMapOf<String, Map<String, List<String>>>()

      for (index in 0 until roots.length()) {
        val root = parseTubeRootRequest(roots.get(index))
        root?.let {
          queue.add(
            TubeQueueItem(
              it.code,
              it.compCatId,
              it.centerId,
              it.atype,
              it.gcode,
              it.scode,
            ),
          )
        }
      }

      while (queue.isNotEmpty()) {
        val currentItem = queue.removeFirst()
        val currentCode = currentItem.code.trim().uppercase()
        val visitedKey = listOf(
          currentItem.compCatId,
          currentItem.centerId,
          currentItem.atype,
          currentItem.gcode,
          currentItem.scode,
          currentCode,
        ).joinToString("|")
        if (currentCode.isBlank() || visited.contains(visitedKey)) {
          continue
        }

        visited.add(visitedKey)
        val testInfoCacheKey = listOf(
          currentItem.compCatId,
          currentItem.centerId,
          currentItem.gcode,
          currentItem.scode,
          currentCode,
        ).joinToString("|")
        val testInfo = testInfoCache.getOrPut(testInfoCacheKey) {
          resolveTubeTestInfo(
            db,
            currentCode,
            currentItem.compCatId,
            currentItem.centerId,
            currentItem.gcode,
            currentItem.scode,
          )
        }
        val mapCode = testInfo.optString("testcode1", currentCode).trim().uppercase()
          .ifBlank { currentCode }

        val testJson = JSONObject()
          .put("specimen_name", testInfo.optString("specimen_name", ""))
          .put("description", testInfo.optString("description", ""))
          .put("testcode1", mapCode)
          .put("test_code", testInfo.optString("test_code", ""))
        testsMap.put(mapCode, testJson)
        if (currentCode != mapCode) {
          testsMap.put(currentCode, testJson)
        }

        val parentCandidates = linkedSetOf(
          currentCode,
          mapCode,
          testInfo.optString("test_code", "").trim().uppercase(),
        ).filter { it.isNotBlank() }
        val childCodesCacheKey = listOf(
          currentItem.gcode,
          currentItem.scode,
          parentCandidates.joinToString(","),
        ).joinToString("|")
        val children = childCodesCache.getOrPut(childCodesCacheKey) {
          val groupKey = listOf(currentItem.gcode.trim().uppercase(), currentItem.scode.trim().uppercase())
            .joinToString("|")
          val groupChildrenMap = profileChildrenByGroupCache.getOrPut(groupKey) {
            preloadProfileChildrenMap(
              db,
              currentItem.gcode,
              currentItem.scode,
            )
          }
          resolveTubeChildCodes(
            parentCandidates,
            currentItem.gcode,
            currentItem.scode,
            groupChildrenMap,
          )
        }
        val childArray = JSONArray()
        children.forEach { childCode ->
          childArray.put(childCode)
          val childCodeContext = parseFullCatalogCodeContext(childCode)
          val childGcode = childCodeContext.first.ifBlank { currentItem.gcode }
          val childScode = childCodeContext.second.ifBlank { currentItem.scode }
          val childVisitedKey = listOf(
            currentItem.compCatId,
            currentItem.centerId,
            currentItem.atype,
            childGcode,
            childScode,
            childCode,
          ).joinToString("|")
          if (!visited.contains(childVisitedKey)) {
            queue.add(
              TubeQueueItem(
                childCode,
                currentItem.compCatId,
                currentItem.centerId,
                currentItem.atype,
                childGcode,
                childScode,
              ),
            )
          }
        }
        testJson
          .put("is_profile", testInfo.optInt("profile", 0) == 1 || children.isNotEmpty())
          .put("has_children", children.isNotEmpty())
        childrenMap.put(mapCode, childArray)
        if (currentCode != mapCode) {
          childrenMap.put(currentCode, childArray)
        }
      }

      promise.resolve(
        JSONObject()
          .put("ok", true)
          .put("testsMap", testsMap)
          .put("childrenMap", childrenMap)
          .put("duration_ms", System.currentTimeMillis() - startedAt)
          .put("visited_count", visited.size)
          .put("tests_map_count", testsMap.length())
          .put("children_map_count", childrenMap.length())
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("CATALOG_DB_ERROR", error.message, error)
    }
  }

  private fun parseTubeRootRequest(value: Any?): TubeRootRequest? {
    if (value == null || value == JSONObject.NULL) {
      return null
    }

    if (value is JSONObject) {
      val catalogParts = value.optString("catalogKey", "").split("|")
      val code = value.optString("code", "").trim().uppercase()
      val compCatId = value.optString("compCatId", "")
        .ifBlank { catalogParts.getOrNull(0) ?: "" }
        .trim()
      val centerId = value.optString("centerId", "").trim()
      val atype = value.optString("atype", "").trim().uppercase()
      val codeContext = parseFullCatalogCodeContext(code)
      val gcode = (
        value.optString("gcode", "").ifBlank { catalogParts.getOrNull(1) ?: "" }
          .ifBlank { codeContext.first }
      ).trim().uppercase()
      val scode = (
        value.optString("scode", "").ifBlank { catalogParts.getOrNull(2) ?: "" }
          .ifBlank { codeContext.second }
      ).trim().uppercase()

      return if (code.isBlank()) {
        null
      } else {
        TubeRootRequest(code, compCatId, centerId, atype, gcode, scode)
      }
    }

    val code = value.toString().trim().uppercase()
    val codeContext = parseFullCatalogCodeContext(code)
    return if (code.isBlank()) {
      null
    } else {
      TubeRootRequest(code, "", "", "", codeContext.first, codeContext.second)
    }
  }

  private fun parseFullCatalogCodeContext(code: String): Pair<String, String> {
    val match = Regex("^(G[^S]+)(S[^T]+)T.+$", RegexOption.IGNORE_CASE)
      .find(code.trim())
    return Pair(
      match?.groupValues?.getOrNull(1)?.uppercase() ?: "",
      match?.groupValues?.getOrNull(2)?.uppercase() ?: "",
    )
  }

  private fun parseFullCatalogCodeParts(code: String): Triple<String, String, String> {
    val match = Regex("^(G[^S]+)(S[^T]+)(T.+)$", RegexOption.IGNORE_CASE)
      .find(code.trim())
    return Triple(
      match?.groupValues?.getOrNull(1)?.uppercase() ?: "",
      match?.groupValues?.getOrNull(2)?.uppercase() ?: "",
      match?.groupValues?.getOrNull(3)?.uppercase() ?: "",
    )
  }

  private fun resolveTubeTestInfo(
    db: SQLiteDatabase,
    testCode: String,
    compCatId: String = "",
    centerId: String = "",
    gcode: String = "",
    scode: String = "",
  ): JSONObject {
    val normalizedTestCode = testCode.trim().uppercase()
    val normalizedCompCatId = compCatId.trim()
    val normalizedGcode = gcode.trim().uppercase()
    val normalizedScode = scode.trim().uppercase()

    if (
      compCatId.isNotBlank() &&
      centerId.isNotBlank() &&
      gcode.isNotBlank() &&
      scode.isNotBlank()
    ) {
      val rawPanelRateInfo = resolveTubeTestInfoFromRawPanelRates(
        db,
        normalizedTestCode,
        compCatId,
        centerId,
        gcode,
        scode,
      )

      if (rawPanelRateInfo != null) {
        return rawPanelRateInfo
      }
    }

    if (compCatId.isNotBlank() && gcode.isNotBlank() && scode.isNotBlank()) {
      db.rawQuery(
        """
        SELECT
          COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.ctest_code, ''),
            NULLIF(pr.test_code, ''),
            ?
          ) AS testcode1,
          COALESCE(NULLIF(t1.test_code, ''), NULLIF(t2.test_code, ''), NULLIF(pr.test_code, '')) AS test_code,
          COALESCE(NULLIF(t1.description, ''), NULLIF(t2.description, ''), NULLIF(pr.ctest_name, ''), ?) AS description,
          COALESCE(t1.profile, t2.profile, 0) AS profile,
          COALESCE(NULLIF(ts1.sp_name, ''), NULLIF(ts2.sp_name, '')) AS specimen_name
        FROM panel_rates pr
        LEFT JOIN tests t1
          ON t1.gcode = pr.gcode
         AND t1.scode = pr.scode
         AND t1.test_code = pr.test_code
        LEFT JOIN tests t2
          ON t2.testcode1 = pr.ctest_code
         AND pr.ctest_code != ''
        LEFT JOIN test_specimens ts1 ON ts1.specimen_id = t1.specimen_id
        LEFT JOIN test_specimens ts2 ON ts2.specimen_id = t2.specimen_id
        WHERE CAST(pr.comp_cat_id AS TEXT) = ?
          AND pr.gcode = ?
          AND pr.scode = ?
          AND pr.booked_flag = 1
          AND pr.active = 1
          AND (
            pr.ctest_code = ?
            OR pr.test_code = ?
            OR t1.testcode1 = ?
            OR t1.test_code = ?
            OR t2.testcode1 = ?
            OR t2.test_code = ?
          )
        ORDER BY
          CASE
            WHEN pr.ctest_code = ? THEN 0
            WHEN t1.testcode1 = ? THEN 1
            ELSE 2
          END,
          pr.ctest_name COLLATE NOCASE
        LIMIT 1
        """.trimIndent(),
        arrayOf(
          normalizedTestCode,
          normalizedTestCode,
          normalizedCompCatId,
          normalizedGcode,
          normalizedScode,
          normalizedTestCode,
          normalizedTestCode,
          normalizedTestCode,
          normalizedTestCode,
          normalizedTestCode,
          normalizedTestCode,
          normalizedTestCode,
          normalizedTestCode,
        ),
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          return JSONObject()
            .put("testcode1", cursor.stringValue("testcode1"))
            .put("test_code", cursor.stringValue("test_code"))
            .put("description", cursor.stringValue("description"))
            .put("profile", cursor.intValue("profile"))
            .put("specimen_name", cursor.stringValue("specimen_name"))
            .put("comp_cat_id", normalizedCompCatId)
        }
      }
    }

    if (gcode.isNotBlank() && scode.isNotBlank()) {
      db.rawQuery(
        """
        SELECT
          COALESCE(NULLIF(t.testcode1, ''), NULLIF(t.test_code, ''), ?) AS testcode1,
          t.test_code,
          t.description,
          COALESCE(t.profile, 0) AS profile,
          ts.sp_name AS specimen_name
        FROM tests t
        LEFT JOIN test_specimens ts ON ts.specimen_id = t.specimen_id
        WHERE t.gcode = ?
          AND t.scode = ?
          AND (
            t.testcode1 = ?
            OR t.test_code = ?
          )
        ORDER BY t.testcode1 COLLATE NOCASE
        LIMIT 1
        """.trimIndent(),
        arrayOf(
          normalizedTestCode,
          normalizedGcode,
          normalizedScode,
          normalizedTestCode,
          normalizedTestCode,
        ),
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          return JSONObject()
            .put("testcode1", cursor.stringValue("testcode1"))
            .put("test_code", cursor.stringValue("test_code"))
            .put("description", cursor.stringValue("description"))
            .put("profile", cursor.intValue("profile"))
            .put("specimen_name", cursor.stringValue("specimen_name"))
        }
      }
    }

    db.rawQuery(
      """
      SELECT
        COALESCE(NULLIF(t.testcode1, ''), NULLIF(t.test_code, ''), ?) AS testcode1,
        t.test_code,
        t.description,
        COALESCE(t.profile, 0) AS profile,
        ts.sp_name AS specimen_name
      FROM tests t
      LEFT JOIN test_specimens ts ON ts.specimen_id = t.specimen_id
      WHERE t.testcode1 = ?
         OR t.test_code = ?
      ORDER BY t.description COLLATE NOCASE
      LIMIT 1
      """.trimIndent(),
      arrayOf(normalizedTestCode, normalizedTestCode, normalizedTestCode),
    ).use { cursor ->
      if (cursor.moveToFirst()) {
        return JSONObject()
          .put("testcode1", cursor.stringValue("testcode1"))
          .put("test_code", cursor.stringValue("test_code"))
          .put("description", cursor.stringValue("description"))
          .put("profile", cursor.intValue("profile"))
          .put("specimen_name", cursor.stringValue("specimen_name"))
      }
    }

    return JSONObject()
      .put("testcode1", normalizedTestCode)
      .put("test_code", "")
      .put("description", normalizedTestCode)
      .put("profile", 0)
      .put("specimen_name", "")
  }

  private fun resolveTubeTestInfoFromRawPanelRates(
    db: SQLiteDatabase,
    normalizedTestCode: String,
    compCatId: String,
    centerId: String,
    gcode: String,
    scode: String,
  ): JSONObject? {
    val normalizedCompCatId = compCatId.trim()
    val normalizedCenterId = centerId.trim()
    val normalizedGcode = gcode.trim().uppercase()
    val normalizedScode = scode.trim().uppercase()

    db.rawQuery(
      """
      SELECT
        COALESCE(
          NULLIF(t1.testcode1, ''),
          NULLIF(t1.test_code, ''),
          NULLIF(t2.testcode1, ''),
          NULLIF(t2.test_code, ''),
          NULLIF(pr.CTestCode, ''),
          NULLIF(pr.TestCode, ''),
          ?
        ) AS testcode1,
        COALESCE(NULLIF(t1.test_code, ''), NULLIF(t2.test_code, ''), NULLIF(pr.TestCode, '')) AS test_code,
        COALESCE(NULLIF(t1.description, ''), NULLIF(t2.description, ''), NULLIF(pr.CTestName, ''), ?) AS description,
        COALESCE(t1.profile, t2.profile, 0) AS profile,
        COALESCE(NULLIF(ts1.sp_name, ''), NULLIF(ts2.sp_name, '')) AS specimen_name
      FROM panelrates pr
      LEFT JOIN tests t1
        ON t1.gcode = pr.GCode
       AND t1.scode = pr.SCode
       AND t1.test_code = pr.TestCode
      LEFT JOIN tests t2
        ON t2.testcode1 = pr.CTestCode
       AND pr.CTestCode != ''
      LEFT JOIN test_specimens ts1 ON ts1.specimen_id = t1.specimen_id
      LEFT JOIN test_specimens ts2 ON ts2.specimen_id = t2.specimen_id
      WHERE CAST(pr.CompCatID AS TEXT) = ?
        AND CAST(pr.CenterID AS TEXT) = ?
        AND pr.GCode = ?
        AND pr.SCode = ?
        AND CAST(pr.BookedFlag AS TEXT) = '1'
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
        AND (
          pr.CTestCode = ?
          OR pr.TestCode = ?
          OR t1.testcode1 = ?
          OR t1.test_code = ?
          OR t2.testcode1 = ?
          OR t2.test_code = ?
        )
      ORDER BY
        CASE
          WHEN pr.CTestCode = ? THEN 0
          WHEN t1.testcode1 = ? THEN 1
          ELSE 2
        END,
        pr.CTestName COLLATE NOCASE
      LIMIT 1
      """.trimIndent(),
      arrayOf(
        normalizedTestCode,
        normalizedTestCode,
        normalizedCompCatId,
        normalizedCenterId,
        normalizedGcode,
        normalizedScode,
        normalizedTestCode,
        normalizedTestCode,
        normalizedTestCode,
        normalizedTestCode,
        normalizedTestCode,
        normalizedTestCode,
        normalizedTestCode,
        normalizedTestCode,
      ),
    ).use { cursor ->
      if (cursor.moveToFirst()) {
        return JSONObject()
          .put("testcode1", cursor.stringValue("testcode1"))
          .put("test_code", cursor.stringValue("test_code"))
          .put("description", cursor.stringValue("description"))
          .put("profile", cursor.intValue("profile"))
          .put("specimen_name", cursor.stringValue("specimen_name"))
          .put("comp_cat_id", normalizedCompCatId)
          .put("center_id", normalizedCenterId)
      }
    }

    return null
  }

  private fun preloadProfileChildrenMap(
    db: SQLiteDatabase,
    gcode: String,
    scode: String,
  ): Map<String, List<String>> {
    val normalizedGcode = gcode.trim().uppercase()
    val normalizedScode = scode.trim().uppercase()
    if (normalizedGcode.isBlank() || normalizedScode.isBlank()) {
      return emptyMap()
    }

    val childrenByProfile = linkedMapOf<String, MutableList<String>>()
    db.rawQuery(
      """
      SELECT profile_code, child_testcode1
      FROM test_profiles
      WHERE gcode = ?
        AND scode = ?
        AND profile_code != ''
        AND child_testcode1 != ''
      ORDER BY profile_code COLLATE NOCASE, child_testcode1 COLLATE NOCASE
      """.trimIndent(),
      arrayOf(normalizedGcode, normalizedScode),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val profileCode = cursor.stringValue("profile_code").trim().uppercase()
        val childCode = cursor.stringValue("child_testcode1").trim().uppercase()
        if (profileCode.isBlank() || childCode.isBlank()) {
          continue
        }
        val rows = childrenByProfile.getOrPut(profileCode) { mutableListOf() }
        if (!rows.contains(childCode)) {
          rows.add(childCode)
        }
      }
    }

    return childrenByProfile.mapValues { it.value.toList() }
  }

  private fun preloadProfileChildRowsMap(
    db: SQLiteDatabase,
    gcode: String,
    scode: String,
  ): Map<String, List<ProfileChildRow>> {
    val normalizedGcode = gcode.trim().uppercase()
    val normalizedScode = scode.trim().uppercase()
    if (normalizedGcode.isBlank() || normalizedScode.isBlank()) {
      return emptyMap()
    }

    val childRowsByProfile = linkedMapOf<String, MutableList<ProfileChildRow>>()
    db.rawQuery(
      """
      SELECT DISTINCT
        tp.profile_code,
        COALESCE(NULLIF(child.testcode1, ''), NULLIF(tp.child_testcode1, '')) AS booked_code,
        COALESCE(NULLIF(child.test_code, ''), NULLIF(tp.child_testcode1, '')) AS master_test_code,
        COALESCE(NULLIF(child.description, ''), NULLIF(tp.child_testcode1, '')) AS description,
        COALESCE(child.profile, 0) AS profile,
        ts.sp_name AS specimen_name
      FROM test_profiles tp
      LEFT JOIN tests child ON child.testcode1 = tp.child_testcode1
      LEFT JOIN test_specimens ts ON ts.specimen_id = child.specimen_id
      WHERE tp.gcode = ?
        AND tp.scode = ?
        AND tp.profile_code != ''
        AND tp.child_testcode1 != ''
      ORDER BY tp.profile_code COLLATE NOCASE, description COLLATE NOCASE
      """.trimIndent(),
      arrayOf(normalizedGcode, normalizedScode),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val profileCode = cursor.stringValue("profile_code").trim().uppercase()
        if (profileCode.isBlank()) {
          continue
        }
        val row = ProfileChildRow(
          bookedCode = cursor.stringValue("booked_code"),
          masterTestCode = cursor.stringValue("master_test_code"),
          description = cursor.stringValue("description"),
          profile = cursor.intValue("profile"),
          specimenName = cursor.stringValue("specimen_name"),
        )
        childRowsByProfile.getOrPut(profileCode) { mutableListOf() }.add(row)
      }
    }

    return childRowsByProfile.mapValues { entry ->
      if (entry.value.size <= maxProfileChildrenPerNode) {
        entry.value.toList()
      } else {
        entry.value.take(maxProfileChildrenPerNode)
      }
    }
  }

  private fun resolveTubeChildCodes(
    parentCandidates: List<String>,
    gcode: String,
    scode: String,
    preloadedChildrenMap: Map<String, List<String>>? = null,
  ): List<String> {
    if (parentCandidates.isEmpty() || gcode.isBlank() || scode.isBlank()) {
      return emptyList()
    }

    val normalizedParents = parentCandidates.map { it.trim().uppercase() }
    val groupChildrenMap = preloadedChildrenMap ?: return emptyList()
    val mergedChildren = linkedSetOf<String>()
    normalizedParents.forEach { parentCode ->
      groupChildrenMap[parentCode]?.forEach { mergedChildren.add(it) }
    }
    return mergedChildren.toList()
  }

  private fun resolvePanelCompanyName(db: SQLiteDatabase, compCatId: String): String {
    db.rawQuery(
      """
      SELECT pname
      FROM panel_companies
      WHERE comp_cat_id = ?
        AND TRIM(IFNULL(pname, '')) != ''
        AND active = 1
      ORDER BY pname COLLATE NOCASE
      LIMIT 1
      """.trimIndent(),
      arrayOf(compCatId),
    ).use { cursor ->
      if (cursor.moveToFirst()) {
        return cursor.stringValue("pname")
      }
    }

    return ""
  }

  private fun resolvePanelCompanyIdentity(
    db: SQLiteDatabase,
    compCatId: String,
    centerId: String,
    atype: String,
    panelCode: String,
    panelAbarid: String,
  ): JSONObject {
    val whereParts = mutableListOf<String>()
    val args = mutableListOf<String>()

    if (panelCode.isNotBlank() && panelAbarid.isNotBlank()) {
      whereParts.add("sync_key LIKE ?")
      args.add("%|$panelCode|$panelAbarid")
    }
    if (compCatId.isNotBlank()) {
      whereParts.add("CAST(comp_cat_id AS TEXT) = ?")
      args.add(compCatId)
    }
    if (centerId.isNotBlank()) {
      whereParts.add("CAST(center_id AS TEXT) = ?")
      args.add(centerId)
    }
    if (atype.isNotBlank()) {
      whereParts.add("UPPER(TRIM(atype)) = ?")
      args.add(atype.trim().uppercase())
    }

    val whereSql = if (whereParts.isEmpty()) "1 = 0" else whereParts.joinToString(" AND ")

    db.rawQuery(
      """
      SELECT id, sync_key, center_id, atype, pname, comp_cat_id, cat_details, billing_charge_mode, showmrp, active
      FROM panel_companies
      WHERE $whereSql
        AND TRIM(IFNULL(pname, '')) != ''
        AND active = 1
      ORDER BY
        CASE WHEN sync_key LIKE ? THEN 0 ELSE 1 END,
        pname COLLATE NOCASE,
        comp_cat_id
      LIMIT 1
      """.trimIndent(),
      (args + "%|$panelCode|$panelAbarid").toTypedArray(),
    ).use { cursor ->
      if (cursor.moveToFirst()) {
        val syncKey = cursor.stringValue("sync_key")
        val syncParts = syncKey.split("|")
        return JSONObject()
          .put("id", cursor.intValue("id"))
          .put("syncKey", syncKey)
          .put("centerId", cursor.stringValue("center_id"))
          .put("atype", cursor.stringValue("atype"))
          .put("name", cursor.stringValue("pname"))
          .put("compCatId", cursor.stringValue("comp_cat_id"))
          .put("details", cursor.stringValue("cat_details"))
          .put("billingChargeMode", cursor.stringValue("billing_charge_mode"))
          .put("showmrp", cursor.intValue("showmrp"))
          .put("active", cursor.intValue("active"))
          .put("panelCode", syncParts.getOrNull(2) ?: panelCode)
          .put("panelAbarid", syncParts.getOrNull(3) ?: panelAbarid)
      }
    }

    if (compCatId.isNotBlank()) {
      val fallbackWhereParts = mutableListOf("sync_key LIKE ?")
      val fallbackArgs = mutableListOf("%|$compCatId|%")

      if (centerId.isNotBlank()) {
        fallbackWhereParts.add("CAST(center_id AS TEXT) = ?")
        fallbackArgs.add(centerId)
      }
      if (atype.isNotBlank()) {
        fallbackWhereParts.add("UPPER(TRIM(atype)) = ?")
        fallbackArgs.add(atype.trim().uppercase())
      }

      db.rawQuery(
        """
        SELECT id, sync_key, center_id, atype, pname, comp_cat_id, cat_details, billing_charge_mode, showmrp, active
        FROM panel_companies
        WHERE ${fallbackWhereParts.joinToString(" AND ")}
          AND TRIM(IFNULL(pname, '')) != ''
          AND active = 1
        ORDER BY pname COLLATE NOCASE, comp_cat_id
        LIMIT 1
        """.trimIndent(),
        fallbackArgs.toTypedArray(),
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          val syncKey = cursor.stringValue("sync_key")
          val syncParts = syncKey.split("|")
          return JSONObject()
            .put("id", cursor.intValue("id"))
            .put("syncKey", syncKey)
            .put("centerId", cursor.stringValue("center_id"))
            .put("atype", cursor.stringValue("atype"))
            .put("name", cursor.stringValue("pname"))
            .put("compCatId", cursor.stringValue("comp_cat_id"))
            .put("details", cursor.stringValue("cat_details"))
            .put("billingChargeMode", cursor.stringValue("billing_charge_mode"))
            .put("showmrp", cursor.intValue("showmrp"))
            .put("active", cursor.intValue("active"))
            .put("panelCode", syncParts.getOrNull(2) ?: panelCode)
            .put("panelAbarid", syncParts.getOrNull(3) ?: panelAbarid)
        }
      }
    }

    return JSONObject()
      .put("compCatId", compCatId)
      .put("centerId", centerId)
      .put("atype", atype)
      .put("panelCode", panelCode)
      .put("panelAbarid", panelAbarid)
  }

  private fun buildPanelCompanyJson(
    cursor: Cursor,
    fallbackPanelCode: String = "",
    fallbackPanelAbarid: String = "",
  ): JSONObject {
    val syncKey = cursor.stringValue("sync_key")
    val syncParts = syncKey.split("|")

    return JSONObject()
      .put("id", cursor.intValue("id"))
      .put("sync_key", syncKey)
      .put("syncKey", syncKey)
      .put("CenterID", cursor.stringValue("center_id"))
      .put("Atype", cursor.stringValue("atype"))
      .put("pname", cursor.stringValue("pname"))
      .put("CompCatID", cursor.stringValue("comp_cat_id"))
      .put("CatDetails", cursor.stringValue("cat_details"))
      .put("BillingChargeMode", cursor.stringValue("billing_charge_mode"))
      .put("showmrp", cursor.intValue("showmrp"))
      .put("ShowMRP", cursor.intValue("showmrp"))
      .put("Active", cursor.intValue("active"))
      .put("code", syncParts.getOrNull(2) ?: fallbackPanelCode)
      .put("ABARID", syncParts.getOrNull(3) ?: fallbackPanelAbarid)
  }

  private data class PanelCompanyCandidate(
    val item: JSONObject,
    val score: Int,
    val centerId: Int,
    val compCatId: Int,
  )

  private fun buildPanelCompanyJsonFromIdentity(identity: JSONObject): JSONObject =
    JSONObject()
      .put("id", identity.optString("id", ""))
      .put("sync_key", identity.optString("syncKey", ""))
      .put("syncKey", identity.optString("syncKey", ""))
      .put("CenterID", identity.optString("centerId", ""))
      .put("Atype", identity.optString("atype", ""))
      .put("pname", identity.optString("name", ""))
      .put("CompCatID", identity.optString("compCatId", ""))
      .put("CatDetails", identity.optString("details", ""))
      .put("BillingChargeMode", identity.optString("billingChargeMode", ""))
      .put("showmrp", identity.optInt("showmrp", 0))
      .put("ShowMRP", identity.optInt("showmrp", 0))
      .put("Active", identity.optInt("active", 1))
      .put("code", identity.optString("panelCode", ""))
      .put("ABARID", identity.optString("panelAbarid", ""))

  private fun findMatchedPanelCompanies(
    db: SQLiteDatabase,
    panelCompanyName: String,
    compCatId: String,
    selectedCompCatIds: String,
    centerId: String,
    atype: String,
  ): JSONArray {
    val normalizedPanelName = panelCompanyName.trim().lowercase()
    val selectedIds = selectedCompCatIds
      .split(",")
      .map { it.trim() }
      .filter { it.isNotBlank() }
      .distinct()
    val normalizedCompCatId = compCatId.trim()
    val normalizedCenterId = centerId.trim()
    val normalizedAtype = atype.trim().uppercase()
    val whereParts = mutableListOf<String>()
    val args = mutableListOf<String>()
    val exactMatches = mutableListOf<PanelCompanyCandidate>()
    val partialMatches = mutableListOf<PanelCompanyCandidate>()

    if (selectedIds.isNotEmpty()) {
      val selectedItems = mutableMapOf<String, JSONObject>()
      val codeMatchClauses = selectedIds.joinToString(" OR ") { "sync_key LIKE ?" }
      val selectedWhereSql = listOf(
        "CAST(comp_cat_id AS TEXT) IN (${selectedIds.joinToString(",") { "?" }})",
        codeMatchClauses,
      ).joinToString(" OR ")
      val selectedArgs = selectedIds + selectedIds.map { "%|$it|%" }

      db.rawQuery(
        """
        SELECT id, sync_key, center_id, atype, pname, comp_cat_id, cat_details, billing_charge_mode, showmrp, active
        FROM panel_companies
        WHERE UPPER(TRIM(IFNULL(atype, ''))) = 'C'
          AND TRIM(IFNULL(pname, '')) != ''
          AND active = 1
          AND ($selectedWhereSql)
        ORDER BY pname COLLATE NOCASE, comp_cat_id
        """.trimIndent(),
        selectedArgs.toTypedArray(),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          val item = buildPanelCompanyJson(cursor)
          selectedItems[item.optString("CompCatID", "").trim()] = item
          selectedItems[item.optString("code", "").trim()] = item
        }
      }

      return JSONArray().apply {
        selectedIds.forEach { selectedId ->
          selectedItems[selectedId]?.let { put(it) }
        }
      }
    }

    if (normalizedPanelName.isNotBlank()) {
      whereParts.add("LOWER(TRIM(pname)) = ?")
      args.add(normalizedPanelName)
      whereParts.add("LOWER(TRIM(cat_details)) = ?")
      args.add(normalizedPanelName)
      whereParts.add("LOWER(TRIM(pname)) LIKE ?")
      args.add("%$normalizedPanelName%")
      whereParts.add("LOWER(TRIM(cat_details)) LIKE ?")
      args.add("%$normalizedPanelName%")
      whereParts.add("? LIKE '%' || LOWER(TRIM(pname)) || '%'")
      args.add(normalizedPanelName)
      whereParts.add("? LIKE '%' || LOWER(TRIM(cat_details)) || '%'")
      args.add(normalizedPanelName)
    }
    if (normalizedCompCatId.isNotBlank()) {
      whereParts.add("CAST(comp_cat_id AS TEXT) = ?")
      args.add(normalizedCompCatId)
    }
    if (normalizedCenterId.isNotBlank()) {
      whereParts.add("CAST(center_id AS TEXT) = ?")
      args.add(normalizedCenterId)
    }
    if (normalizedAtype.isNotBlank()) {
      whereParts.add("UPPER(TRIM(atype)) = ?")
      args.add(normalizedAtype)
    }

    if (whereParts.isEmpty()) {
      return JSONArray()
    }

    db.rawQuery(
      """
      SELECT id, sync_key, center_id, atype, pname, comp_cat_id, cat_details, billing_charge_mode, showmrp, active
      FROM panel_companies
      WHERE UPPER(TRIM(IFNULL(atype, ''))) = 'C'
        AND TRIM(IFNULL(pname, '')) != ''
        AND active = 1
        AND (${whereParts.joinToString(" OR ")})
      ORDER BY pname COLLATE NOCASE, comp_cat_id
      """.trimIndent(),
      args.toTypedArray(),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val item = buildPanelCompanyJson(cursor)
        val itemName = item.optString("pname", "").trim().lowercase()
        val itemDetails = item.optString("CatDetails", "").trim().lowercase()
        val itemCompCatId = item.optString("CompCatID", "").trim()
        val itemCenterId = item.optString("CenterID", "").trim()
        val itemAtype = item.optString("Atype", "").trim().uppercase()
        var score = 0

        if (itemName == normalizedPanelName) {
          score += 100
        }
        if (itemDetails == normalizedPanelName) {
          score += 80
        }
        if (normalizedCompCatId.isNotBlank() && itemCompCatId == normalizedCompCatId) {
          score += 40
        }
        if (normalizedCenterId.isNotBlank() && itemCenterId == normalizedCenterId) {
          score += 30
        }
        if (normalizedAtype.isNotBlank() && itemAtype == normalizedAtype) {
          score += 20
        }

        val candidate = PanelCompanyCandidate(
          item = item,
          score = score,
          centerId = itemCenterId.toIntOrNull() ?: 0,
          compCatId = itemCompCatId.toIntOrNull() ?: 0,
        )
        val isExactMatch = itemName == normalizedPanelName || itemDetails == normalizedPanelName

        if (isExactMatch) {
          exactMatches.add(candidate)
        } else {
          partialMatches.add(candidate)
        }
      }
    }

    val source = if (exactMatches.isNotEmpty()) exactMatches else partialMatches
    val sorted = source.sortedWith(
      compareByDescending<PanelCompanyCandidate> { it.score }
        .thenByDescending { it.centerId }
        .thenByDescending { it.compCatId },
    )

    val narrowed = if (
      exactMatches.isNotEmpty() &&
      (normalizedCenterId.isNotBlank() || normalizedAtype.isNotBlank())
    ) {
      sorted.take(1)
    } else {
      sorted
    }

    if (narrowed.isNotEmpty()) {
      return JSONArray().apply {
        narrowed.forEach { put(it.item) }
      }
    }

    if (
      normalizedCompCatId.isNotBlank() ||
        normalizedCenterId.isNotBlank() ||
        normalizedAtype.isNotBlank()
    ) {
      val resolvedIdentity = resolvePanelCompanyIdentity(
        db,
        normalizedCompCatId,
        normalizedCenterId,
        "C",
        "",
        "",
      )
      if (
        resolvedIdentity.optString("name", "").isNotBlank() ||
          resolvedIdentity.optString("compCatId", "").isNotBlank()
      ) {
        return JSONArray().put(buildPanelCompanyJsonFromIdentity(resolvedIdentity))
      }
    }

    return JSONArray()
  }

  private fun buildGroupsForProjectedPanelRates(db: SQLiteDatabase, compCatId: String): JSONArray {
    val groups = JSONArray()

    db.rawQuery(
      """
      SELECT DISTINCT pr.gcode, g.description
      FROM panel_rates pr
      JOIN groups g ON g.gcode = pr.gcode
      WHERE pr.comp_cat_id = ?
        AND pr.booked_flag = 1
          AND pr.active = 1
        AND TRIM(pr.gcode) != ''
        AND TRIM(pr.scode) != ''
        AND TRIM(pr.test_code) != ''
      ORDER BY pr.gcode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId),
    ).use { groupCursor ->
      while (groupCursor.moveToNext()) {
        val gcode = groupCursor.stringValue("gcode")
        val subgroups = buildSubgroups(db, compCatId, gcode)

        if (subgroups.length() > 0) {
          groups.put(
            JSONObject()
              .put("group_id", gcode)
              .put("gcode", gcode)
              .put("group_name", groupCursor.stringValue("description"))
              .put("subgroups", subgroups),
          )
        }
      }
    }

    return groups
  }

  private fun resolvePanelIdentityFromRequest(
    db: SQLiteDatabase,
    panelCompanyJson: String,
  ): JSONObject {
    val request = JSONObject(panelCompanyJson.ifBlank { "{}" })
    val compCatId = request.optString("compCatId", "")
      .ifBlank { request.optString("CompCatID", "") }
      .trim()
    val panelCode = request.optString("panelCode", "")
      .ifBlank { request.optString("panel_code", "") }
      .trim()
    val panelAbarid = request.optString("panelAbarid", "")
      .ifBlank { request.optString("panel_abarid", "") }
      .trim()

    return resolvePanelCompanyIdentity(
      db,
      compCatId,
      request.optString("centerId", "").ifBlank { request.optString("CenterID", "") },
      request.optString("atype", "").ifBlank { request.optString("Atype", "") },
      panelCode,
      panelAbarid,
    )
  }

  private fun buildLightGroups(db: SQLiteDatabase, compCatId: String): JSONArray {
    val groups = JSONArray()

    db.rawQuery(
      """
      SELECT pr.gcode, g.description, COUNT(DISTINCT pr.scode) AS subgroup_count
      FROM panel_rates pr
      JOIN groups g ON g.gcode = pr.gcode
      WHERE pr.comp_cat_id = ?
        AND pr.booked_flag = 1
          AND pr.active = 1
        AND TRIM(pr.gcode) != ''
        AND TRIM(pr.scode) != ''
        AND TRIM(pr.test_code) != ''
      GROUP BY pr.gcode, g.description
      ORDER BY pr.gcode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val gcode = cursor.stringValue("gcode")
        groups.put(
          JSONObject()
            .put("group_id", gcode)
            .put("gcode", gcode)
            .put("group_name", cursor.stringValue("description"))
            .put("subgroup_count", cursor.intValue("subgroup_count"))
            .put("subgroups", JSONArray())
            .put("lazy_subgroups", true),
        )
      }
    }

    return groups
  }

  private fun buildLightRawGroups(
    db: SQLiteDatabase,
    compCatId: String,
    centerId: String,
  ): JSONArray {
    val groups = JSONArray()

    db.rawQuery(
      """
      SELECT pr.GCode AS gcode, g.description, COUNT(DISTINCT pr.SCode) AS subgroup_count
      FROM panelrates pr
      JOIN groups g ON UPPER(TRIM(g.gcode)) = UPPER(TRIM(pr.GCode))
      WHERE pr.CompCatID = ?
        AND pr.CenterID = ?
        AND pr.BookedFlag = 1
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
        AND TRIM(pr.GCode) != ''
        AND TRIM(pr.SCode) != ''
        AND TRIM(pr.TestCode) != ''
      GROUP BY pr.GCode, g.description
      ORDER BY pr.GCode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, centerId),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val gcode = cursor.stringValue("gcode")
        groups.put(
          JSONObject()
            .put("group_id", gcode)
            .put("gcode", gcode)
            .put("group_name", cursor.stringValue("description"))
            .put("subgroup_count", cursor.intValue("subgroup_count"))
            .put("subgroups", JSONArray())
            .put("lazy_subgroups", true),
        )
      }
    }

    return groups
  }

  private fun buildGroupsForRawPanelRates(
    db: SQLiteDatabase,
    compCatId: String,
    centerId: String,
  ): JSONArray {
    val groups = JSONArray()

    db.rawQuery(
      """
      SELECT DISTINCT pr.GCode AS gcode, g.description
      FROM panelrates pr
      JOIN groups g ON UPPER(TRIM(g.gcode)) = UPPER(TRIM(pr.GCode))
      WHERE CAST(pr.CompCatID AS TEXT) = ?
        AND CAST(pr.CenterID AS TEXT) = ?
        AND CAST(pr.BookedFlag AS TEXT) = '1'
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
        AND TRIM(pr.GCode) != ''
        AND TRIM(pr.SCode) != ''
        AND TRIM(pr.TestCode) != ''
      ORDER BY pr.GCode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, centerId),
    ).use { groupCursor ->
      while (groupCursor.moveToNext()) {
        val gcode = groupCursor.stringValue("gcode")
        val subgroups = buildRawSubgroups(db, compCatId, centerId, gcode)

        if (subgroups.length() > 0) {
          groups.put(
            JSONObject()
              .put("group_id", gcode)
              .put("gcode", gcode)
              .put("group_name", groupCursor.stringValue("description"))
              .put("subgroups", subgroups),
          )
        }
      }
    }

    return groups
  }

  private fun buildSubgroups(
    db: SQLiteDatabase,
    compCatId: String,
    gcode: String,
  ): JSONArray {
    val subgroups = JSONArray()

    db.rawQuery(
      """
      SELECT DISTINCT sg.scode, sg.description
      FROM panel_rates pr
      JOIN subgroups sg ON sg.gcode = pr.gcode AND sg.scode = pr.scode
      WHERE pr.comp_cat_id = ?
        AND pr.gcode = ?
        AND pr.booked_flag = 1
          AND pr.active = 1
        AND TRIM(pr.scode) != ''
        AND TRIM(pr.test_code) != ''
      ORDER BY sg.scode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, gcode),
    ).use { subgroupCursor ->
      while (subgroupCursor.moveToNext()) {
        val scode = subgroupCursor.stringValue("scode")
        val tests = buildTests(db, compCatId, gcode, scode, "")

        if (tests.length() > 0) {
          subgroups.put(
            JSONObject()
              .put("subgroup_id", scode)
              .put("scode", scode)
              .put("subgroup_name", subgroupCursor.stringValue("description"))
              .put("tests", tests),
          )
        }
      }
    }

    return subgroups
  }

  private fun buildLightSubgroups(
    db: SQLiteDatabase,
    compCatId: String,
    gcode: String,
  ): JSONArray {
    val subgroups = JSONArray()

    db.rawQuery(
      """
      SELECT sg.scode, sg.description, COUNT(DISTINCT pr.test_code) AS test_count
      FROM panel_rates pr
      JOIN subgroups sg ON sg.gcode = pr.gcode AND sg.scode = pr.scode
      WHERE pr.comp_cat_id = ?
        AND pr.gcode = ?
        AND pr.booked_flag = 1
          AND pr.active = 1
        AND TRIM(pr.scode) != ''
        AND TRIM(pr.test_code) != ''
      GROUP BY sg.scode, sg.description
      ORDER BY sg.scode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, gcode),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val scode = cursor.stringValue("scode")
        subgroups.put(
          JSONObject()
            .put("subgroup_id", scode)
            .put("scode", scode)
            .put("subgroup_name", cursor.stringValue("description"))
            .put("test_count", cursor.intValue("test_count"))
            .put("tests", JSONArray())
            .put("lazy_tests", true),
        )
      }
    }

    return subgroups
  }

  private fun buildRawSubgroups(
    db: SQLiteDatabase,
    compCatId: String,
    centerId: String,
    gcode: String,
  ): JSONArray {
    val subgroups = JSONArray()

    db.rawQuery(
      """
      SELECT DISTINCT sg.scode, sg.description
      FROM panelrates pr
      JOIN subgroups sg
        ON UPPER(TRIM(sg.gcode)) = UPPER(TRIM(pr.GCode))
       AND UPPER(TRIM(sg.scode)) = UPPER(TRIM(pr.SCode))
      WHERE pr.CompCatID = ?
        AND pr.CenterID = ?
        AND pr.GCode = ?
        AND pr.BookedFlag = 1
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
        AND TRIM(pr.SCode) != ''
        AND TRIM(pr.TestCode) != ''
      ORDER BY sg.scode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, centerId, gcode.trim().uppercase()),
    ).use { subgroupCursor ->
      while (subgroupCursor.moveToNext()) {
        val scode = subgroupCursor.stringValue("scode")
        val tests = buildRawTests(db, compCatId, centerId, gcode, scode, "")

        if (tests.length() > 0) {
          subgroups.put(
            JSONObject()
              .put("subgroup_id", scode)
              .put("scode", scode)
              .put("subgroup_name", subgroupCursor.stringValue("description"))
              .put("tests", tests),
          )
        }
      }
    }

    return subgroups
  }

  private fun buildLightRawSubgroups(
    db: SQLiteDatabase,
    compCatId: String,
    centerId: String,
    gcode: String,
  ): JSONArray {
    val subgroups = JSONArray()

    db.rawQuery(
      """
      SELECT sg.scode, sg.description, COUNT(DISTINCT pr.TestCode) AS test_count
      FROM panelrates pr
      JOIN subgroups sg
        ON UPPER(TRIM(sg.gcode)) = UPPER(TRIM(pr.GCode))
       AND UPPER(TRIM(sg.scode)) = UPPER(TRIM(pr.SCode))
      WHERE pr.CompCatID = ?
        AND pr.CenterID = ?
        AND pr.GCode = ?
        AND pr.BookedFlag = 1
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
        AND TRIM(pr.SCode) != ''
        AND TRIM(pr.TestCode) != ''
      GROUP BY sg.scode, sg.description
      ORDER BY sg.scode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, centerId, gcode.trim().uppercase()),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val scode = cursor.stringValue("scode")
        subgroups.put(
          JSONObject()
            .put("subgroup_id", scode)
            .put("scode", scode)
            .put("subgroup_name", cursor.stringValue("description"))
            .put("test_count", cursor.intValue("test_count"))
            .put("tests", JSONArray())
            .put("lazy_tests", true),
        )
      }
    }

    return subgroups
  }

  private fun buildTests(
    db: SQLiteDatabase,
    compCatId: String,
    gcode: String,
    scode: String,
    patientGender: String,
  ): JSONArray {
    val tests = JSONArray()
    val genderArgs = genderFilterArgs(patientGender)

    db.rawQuery(
      """
      SELECT
        dedupe_key,
        MIN(booked_code) AS booked_code,
        MIN(description) AS description,
        MAX(profile) AS profile,
        MAX(charge) AS charge,
        MAX(mrp) AS mrp,
        MAX(percentageonstandard) AS percentageonstandard,
        MAX(max_discount) AS max_discount,
        MAX(max_allowed_discount) AS max_allowed_discount,
        MIN(specimen_name) AS specimen_name,
        MIN(gender_flag) AS gender_flag,
        COUNT(*) AS duplicate_count,
        GROUP_CONCAT(source_row_id) AS source_row_ids
      FROM (
        SELECT
          pr.rowid AS source_row_id,
          COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.ctest_code, ''),
            NULLIF(pr.test_code, '')
          ) AS booked_code,
          UPPER(TRIM(COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.ctest_code, ''),
            NULLIF(pr.test_code, '')
          ))) AS dedupe_key,
          COALESCE(
            NULLIF(t1.description, ''),
            NULLIF(t2.description, ''),
            NULLIF(pr.ctest_name, ''),
            NULLIF(pr.test_code, '')
          ) AS description,
          COALESCE(t1.profile, t2.profile, 0) AS profile,
          pr.charge,
          pr.mrp,
          pr.base_discount_percent AS percentageonstandard,
          (pr.mrp * IFNULL(pr.base_discount_percent, 0) / 100.0) AS max_discount,
          (pr.mrp * IFNULL(pr.max_allowed_discount_percent, 0) / 100.0) AS max_allowed_discount,
          COALESCE(NULLIF(ts1.sp_name, ''), NULLIF(ts2.sp_name, '')) AS specimen_name,
          COALESCE(NULLIF(t1.gender_flag, ''), NULLIF(t2.gender_flag, ''), '1') AS gender_flag
        FROM panel_rates pr
        LEFT JOIN tests t1
          ON t1.gcode = pr.gcode
         AND t1.scode = pr.scode
         AND t1.test_code = pr.test_code
        LEFT JOIN tests t2
          ON t2.testcode1 = pr.ctest_code
         AND TRIM(pr.ctest_code) != ''
        LEFT JOIN test_specimens ts1 ON ts1.specimen_id = t1.specimen_id
        LEFT JOIN test_specimens ts2 ON ts2.specimen_id = t2.specimen_id
        WHERE pr.comp_cat_id = ?
          AND pr.gcode = ?
          AND pr.scode = ?
          AND pr.booked_flag = 1
          AND pr.active = 1
          AND TRIM(pr.test_code) != ''
      )
      WHERE booked_code IS NOT NULL
        AND TRIM(booked_code) != ''
        AND ${genderFilterWhere("gender_flag")}
      GROUP BY dedupe_key
      ORDER BY description COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, gcode, scode) + genderArgs,
    ).use { testCursor ->
      while (testCursor.moveToNext()) {
        val bookedCode = testCursor.stringValue("booked_code")

        tests.put(
          JSONObject()
            .put("catalog_key", "$compCatId|$gcode|$scode|$bookedCode")
            .put("dedupe_key", testCursor.stringValue("dedupe_key"))
            .put("booked_code", bookedCode)
            .put("description", testCursor.stringValue("description"))
            .put("is_profile", testCursor.intValue("profile") == 1)
            .put("has_children", false)
            .put("charge", testCursor.doubleValue("charge"))
            .put("mrp", testCursor.doubleValue("mrp"))
            .put("percentageonstandard", testCursor.doubleValue("percentageonstandard"))
            .put("max_discount", testCursor.doubleValue("max_discount"))
            .put("max_allowed_discount", testCursor.doubleValue("max_allowed_discount"))
            .put("specimen_name", testCursor.stringValue("specimen_name"))
            .put("gender_flag", testCursor.stringValue("gender_flag"))
            .put("duplicate_count", testCursor.intValue("duplicate_count"))
            .put("source_row_ids", testCursor.stringValue("source_row_ids")),
        )
      }
    }

    return tests
  }

  private fun buildRawTests(
    db: SQLiteDatabase,
    compCatId: String,
    centerId: String,
    gcode: String,
    scode: String,
    patientGender: String,
  ): JSONArray {
    val tests = JSONArray()
    val genderArgs = genderFilterArgs(patientGender)

    db.rawQuery(
      """
      SELECT
        dedupe_key,
        MIN(booked_code) AS booked_code,
        MIN(description) AS description,
        MAX(profile) AS profile,
        MAX(charge) AS charge,
        MAX(mrp) AS mrp,
        MAX(percentageonstandard) AS percentageonstandard,
        MAX(max_discount) AS max_discount,
        MAX(max_allowed_discount) AS max_allowed_discount,
        MIN(specimen_name) AS specimen_name,
        MIN(gender_flag) AS gender_flag,
        COUNT(*) AS duplicate_count,
        GROUP_CONCAT(source_row_id) AS source_row_ids
      FROM (
        SELECT
          pr.rowid AS source_row_id,
          COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.CTestCode, ''),
            NULLIF(pr.TestCode, '')
          ) AS booked_code,
          UPPER(TRIM(COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.CTestCode, ''),
            NULLIF(pr.TestCode, '')
          ))) AS dedupe_key,
          COALESCE(
            NULLIF(t1.description, ''),
            NULLIF(t2.description, ''),
            NULLIF(pr.CTestName, ''),
            NULLIF(pr.TestCode, '')
          ) AS description,
          COALESCE(t1.profile, t2.profile, 0) AS profile,
          CAST(pr.Charge AS REAL) AS charge,
          CAST(pr.MRP AS REAL) AS mrp,
          CAST(IFNULL(NULLIF(pr.percentageonstandard, ''), '0') AS REAL) AS percentageonstandard,
          CASE
            WHEN NULLIF(pr.percentageonstandard, '') IS NOT NULL
              THEN CAST(pr.MRP AS REAL) * CAST(pr.percentageonstandard AS REAL) / 100.0
            ELSE CAST(IFNULL(NULLIF(pr.MaxDiscount, ''), '0') AS REAL)
          END AS max_discount,
          CAST(pr.MRP AS REAL) * CAST(IFNULL(NULLIF(pr.MaximumpercentageAllowed, ''), '0') AS REAL) / 100.0 AS max_allowed_discount,
          COALESCE(NULLIF(ts1.sp_name, ''), NULLIF(ts2.sp_name, '')) AS specimen_name,
          COALESCE(NULLIF(t1.gender_flag, ''), NULLIF(t2.gender_flag, ''), '1') AS gender_flag
        FROM panelrates pr
        LEFT JOIN tests t1
          ON UPPER(TRIM(t1.gcode)) = UPPER(TRIM(pr.GCode))
         AND UPPER(TRIM(t1.scode)) = UPPER(TRIM(pr.SCode))
         AND UPPER(TRIM(t1.test_code)) = UPPER(TRIM(pr.TestCode))
        LEFT JOIN tests t2
          ON UPPER(TRIM(t2.testcode1)) = UPPER(TRIM(pr.CTestCode))
         AND TRIM(pr.CTestCode) != ''
        LEFT JOIN test_specimens ts1 ON ts1.specimen_id = t1.specimen_id
        LEFT JOIN test_specimens ts2 ON ts2.specimen_id = t2.specimen_id
        WHERE pr.CompCatID = ?
          AND pr.CenterID = ?
          AND pr.GCode = ?
          AND pr.SCode = ?
          AND pr.BookedFlag = 1
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
          AND TRIM(pr.TestCode) != ''
      )
      WHERE booked_code IS NOT NULL
        AND TRIM(booked_code) != ''
        AND ${genderFilterWhere("gender_flag")}
      GROUP BY dedupe_key
      ORDER BY description COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, centerId, gcode.trim().uppercase(), scode.trim().uppercase()) + genderArgs,
    ).use { testCursor ->
      while (testCursor.moveToNext()) {
        val bookedCode = testCursor.stringValue("booked_code")

        tests.put(
          JSONObject()
            .put("catalog_key", "$compCatId|$gcode|$scode|$bookedCode")
            .put("dedupe_key", testCursor.stringValue("dedupe_key"))
            .put("booked_code", bookedCode)
            .put("description", testCursor.stringValue("description"))
            .put("is_profile", testCursor.intValue("profile") == 1)
            .put("has_children", false)
            .put("charge", testCursor.doubleValue("charge"))
            .put("mrp", testCursor.doubleValue("mrp"))
            .put("percentageonstandard", testCursor.doubleValue("percentageonstandard"))
            .put("max_discount", testCursor.doubleValue("max_discount"))
            .put("max_allowed_discount", testCursor.doubleValue("max_allowed_discount"))
            .put("specimen_name", testCursor.stringValue("specimen_name"))
            .put("gender_flag", testCursor.stringValue("gender_flag"))
            .put("duplicate_count", testCursor.intValue("duplicate_count"))
            .put("source_row_ids", testCursor.stringValue("source_row_ids")),
        )
      }
    }

    return tests
  }

  private fun searchProjectedTests(
    db: SQLiteDatabase,
    compCatId: String,
    query: String,
    limit: Int,
    patientGender: String,
  ): JSONArray {
    val tests = JSONArray()
    val searchLike = "%${query.trim()}%"
    val genderArgs = genderFilterArgs(patientGender)

    db.rawQuery(
      """
      SELECT
        dedupe_key,
        MIN(booked_code) AS booked_code,
        MIN(description) AS description,
        MIN(shortname) AS shortname,
        MAX(profile) AS profile,
        MAX(charge) AS charge,
        MAX(mrp) AS mrp,
        MAX(max_discount) AS max_discount,
        MAX(max_allowed_discount) AS max_allowed_discount,
        MIN(specimen_name) AS specimen_name,
        MIN(gcode) AS gcode,
        MIN(scode) AS scode,
        MIN(group_name) AS group_name,
        MIN(subgroup_name) AS subgroup_name,
        MIN(gender_flag) AS gender_flag,
        COUNT(*) AS duplicate_count,
        GROUP_CONCAT(source_row_id) AS source_row_ids
      FROM (
        SELECT
          pr.rowid AS source_row_id,
          pr.gcode,
          pr.scode,
          g.description AS group_name,
          sg.description AS subgroup_name,
          COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.ctest_code, ''),
            NULLIF(pr.test_code, '')
          ) AS booked_code,
          UPPER(TRIM(COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.ctest_code, ''),
            NULLIF(pr.test_code, '')
          ))) AS dedupe_key,
          COALESCE(
            NULLIF(t1.description, ''),
            NULLIF(t2.description, ''),
            NULLIF(pr.ctest_name, ''),
            NULLIF(pr.test_code, '')
          ) AS description,
          COALESCE(NULLIF(t1.shortname, ''), NULLIF(t2.shortname, ''), NULLIF(pr.ctest_name, '')) AS shortname,
          COALESCE(t1.profile, t2.profile, 0) AS profile,
          pr.charge,
          pr.mrp,
          pr.base_discount_percent AS percentageonstandard,
          (pr.mrp * IFNULL(pr.base_discount_percent, 0) / 100.0) AS max_discount,
          (pr.mrp * IFNULL(pr.max_allowed_discount_percent, 0) / 100.0) AS max_allowed_discount,
          COALESCE(NULLIF(ts1.sp_name, ''), NULLIF(ts2.sp_name, '')) AS specimen_name,
          COALESCE(NULLIF(t1.gender_flag, ''), NULLIF(t2.gender_flag, ''), '1') AS gender_flag
        FROM panel_rates pr
        JOIN groups g ON g.gcode = pr.gcode
        JOIN subgroups sg ON sg.gcode = pr.gcode AND sg.scode = pr.scode
        LEFT JOIN tests t1
          ON t1.gcode = pr.gcode
         AND t1.scode = pr.scode
         AND t1.test_code = pr.test_code
        LEFT JOIN tests t2
          ON t2.testcode1 = pr.ctest_code
         AND TRIM(pr.ctest_code) != ''
        LEFT JOIN test_specimens ts1 ON ts1.specimen_id = t1.specimen_id
        LEFT JOIN test_specimens ts2 ON ts2.specimen_id = t2.specimen_id
        WHERE pr.comp_cat_id = ?
          AND pr.booked_flag = 1
          AND pr.active = 1
          AND TRIM(pr.test_code) != ''
          AND (
            pr.test_code LIKE ? COLLATE NOCASE
            OR pr.ctest_code LIKE ? COLLATE NOCASE
            OR t1.description LIKE ? COLLATE NOCASE
            OR t2.description LIKE ? COLLATE NOCASE
            OR t1.shortname LIKE ? COLLATE NOCASE
            OR t2.shortname LIKE ? COLLATE NOCASE
            OR pr.ctest_name LIKE ? COLLATE NOCASE
          )
      )
      WHERE booked_code IS NOT NULL
        AND TRIM(booked_code) != ''
        AND ${genderFilterWhere("gender_flag")}
      GROUP BY dedupe_key
      ORDER BY description COLLATE NOCASE
      LIMIT ?
      """.trimIndent(),
      arrayOf(
        compCatId,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
      ) +
        genderArgs +
        arrayOf(limit.toString()),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val bookedCode = cursor.stringValue("booked_code")
        val gcode = cursor.stringValue("gcode")
        val scode = cursor.stringValue("scode")
        tests.put(
          JSONObject()
            .put("catalog_key", "$compCatId|$gcode|$scode|$bookedCode")
            .put("dedupe_key", cursor.stringValue("dedupe_key"))
            .put("booked_code", bookedCode)
            .put("description", cursor.stringValue("description"))
            .put("shortname", cursor.stringValue("shortname"))
            .put("is_profile", cursor.intValue("profile") == 1)
            .put("has_children", false)
            .put("charge", cursor.doubleValue("charge"))
            .put("mrp", cursor.doubleValue("mrp"))
            .put("percentageonstandard", cursor.doubleValue("percentageonstandard"))
            .put("max_discount", cursor.doubleValue("max_discount"))
            .put("max_allowed_discount", cursor.doubleValue("max_allowed_discount"))
            .put("specimen_name", cursor.stringValue("specimen_name"))
            .put("gender_flag", cursor.stringValue("gender_flag"))
            .put("duplicate_count", cursor.intValue("duplicate_count"))
            .put("source_row_ids", cursor.stringValue("source_row_ids"))
            .put("__groupName", cursor.stringValue("group_name"))
            .put("__subgroupName", cursor.stringValue("subgroup_name")),
        )
      }
    }

    return tests
  }

  private fun searchRawTests(
    db: SQLiteDatabase,
    compCatId: String,
    centerId: String,
    query: String,
    limit: Int,
    patientGender: String,
  ): JSONArray {
    val tests = JSONArray()
    val searchLike = "%${query.trim()}%"
    val genderArgs = genderFilterArgs(patientGender)

    db.rawQuery(
      """
      SELECT
        dedupe_key,
        MIN(booked_code) AS booked_code,
        MIN(description) AS description,
        MIN(shortname) AS shortname,
        MAX(profile) AS profile,
        MAX(charge) AS charge,
        MAX(mrp) AS mrp,
        MAX(max_discount) AS max_discount,
        MAX(max_allowed_discount) AS max_allowed_discount,
        MIN(specimen_name) AS specimen_name,
        MIN(gcode) AS gcode,
        MIN(scode) AS scode,
        MIN(group_name) AS group_name,
        MIN(subgroup_name) AS subgroup_name,
        MIN(gender_flag) AS gender_flag,
        COUNT(*) AS duplicate_count,
        GROUP_CONCAT(source_row_id) AS source_row_ids
      FROM (
        SELECT
          pr.rowid AS source_row_id,
          pr.GCode AS gcode,
          pr.SCode AS scode,
          g.description AS group_name,
          sg.description AS subgroup_name,
          COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.CTestCode, ''),
            NULLIF(pr.TestCode, '')
          ) AS booked_code,
          UPPER(TRIM(COALESCE(
            NULLIF(t1.testcode1, ''),
            NULLIF(t1.test_code, ''),
            NULLIF(t2.testcode1, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.CTestCode, ''),
            NULLIF(pr.TestCode, '')
          ))) AS dedupe_key,
          COALESCE(
            NULLIF(t1.description, ''),
            NULLIF(t2.description, ''),
            NULLIF(pr.CTestName, ''),
            NULLIF(pr.TestCode, '')
          ) AS description,
          COALESCE(NULLIF(t1.shortname, ''), NULLIF(t2.shortname, ''), NULLIF(pr.CTestName, '')) AS shortname,
          COALESCE(t1.profile, t2.profile, 0) AS profile,
          CAST(pr.Charge AS REAL) AS charge,
          CAST(pr.MRP AS REAL) AS mrp,
          CAST(IFNULL(NULLIF(pr.percentageonstandard, ''), '0') AS REAL) AS percentageonstandard,
          CASE
            WHEN NULLIF(pr.percentageonstandard, '') IS NOT NULL
              THEN CAST(pr.MRP AS REAL) * CAST(pr.percentageonstandard AS REAL) / 100.0
            ELSE CAST(IFNULL(NULLIF(pr.MaxDiscount, ''), '0') AS REAL)
          END AS max_discount,
          CAST(pr.MRP AS REAL) * CAST(IFNULL(NULLIF(pr.MaximumpercentageAllowed, ''), '0') AS REAL) / 100.0 AS max_allowed_discount,
          COALESCE(NULLIF(ts1.sp_name, ''), NULLIF(ts2.sp_name, '')) AS specimen_name,
          COALESCE(NULLIF(t1.gender_flag, ''), NULLIF(t2.gender_flag, ''), '1') AS gender_flag
        FROM panelrates pr
        JOIN groups g ON g.gcode = pr.GCode
        JOIN subgroups sg ON sg.gcode = pr.GCode AND sg.scode = pr.SCode
        LEFT JOIN tests t1
          ON t1.gcode = pr.GCode
         AND t1.scode = pr.SCode
         AND t1.test_code = pr.TestCode
        LEFT JOIN tests t2
          ON t2.testcode1 = pr.CTestCode
         AND TRIM(pr.CTestCode) != ''
        LEFT JOIN test_specimens ts1 ON ts1.specimen_id = t1.specimen_id
        LEFT JOIN test_specimens ts2 ON ts2.specimen_id = t2.specimen_id
        WHERE pr.CompCatID = ?
          AND pr.CenterID = ?
          AND pr.BookedFlag = 1
          AND CAST(IFNULL(pr.Active, '1') AS TEXT) = '1'
          AND TRIM(pr.TestCode) != ''
          AND (
            pr.TestCode LIKE ? COLLATE NOCASE
            OR pr.CTestCode LIKE ? COLLATE NOCASE
            OR t1.description LIKE ? COLLATE NOCASE
            OR t2.description LIKE ? COLLATE NOCASE
            OR t1.shortname LIKE ? COLLATE NOCASE
            OR t2.shortname LIKE ? COLLATE NOCASE
            OR pr.CTestName LIKE ? COLLATE NOCASE
          )
      )
      WHERE booked_code IS NOT NULL
        AND TRIM(booked_code) != ''
        AND ${genderFilterWhere("gender_flag")}
      GROUP BY dedupe_key
      ORDER BY description COLLATE NOCASE
      LIMIT ?
      """.trimIndent(),
      arrayOf(
        compCatId,
        centerId,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
        searchLike,
      ) +
        genderArgs +
        arrayOf(limit.toString()),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val bookedCode = cursor.stringValue("booked_code")
        val gcode = cursor.stringValue("gcode")
        val scode = cursor.stringValue("scode")
        tests.put(
          JSONObject()
            .put("catalog_key", "$compCatId|$gcode|$scode|$bookedCode")
            .put("dedupe_key", cursor.stringValue("dedupe_key"))
            .put("booked_code", bookedCode)
            .put("description", cursor.stringValue("description"))
            .put("shortname", cursor.stringValue("shortname"))
            .put("is_profile", cursor.intValue("profile") == 1)
            .put("has_children", false)
            .put("charge", cursor.doubleValue("charge"))
            .put("mrp", cursor.doubleValue("mrp"))
            .put("percentageonstandard", cursor.doubleValue("percentageonstandard"))
            .put("max_discount", cursor.doubleValue("max_discount"))
            .put("max_allowed_discount", cursor.doubleValue("max_allowed_discount"))
            .put("specimen_name", cursor.stringValue("specimen_name"))
            .put("gender_flag", cursor.stringValue("gender_flag"))
            .put("duplicate_count", cursor.intValue("duplicate_count"))
            .put("source_row_ids", cursor.stringValue("source_row_ids"))
            .put("__groupName", cursor.stringValue("group_name"))
            .put("__subgroupName", cursor.stringValue("subgroup_name")),
        )
      }
    }

    return tests
  }

  private fun hasProfileChildren(
    db: SQLiteDatabase,
    gcode: String,
    scode: String,
    profileCode: String,
  ): Boolean {
    val normalizedProfileCode = profileCode.trim().uppercase()

    if (normalizedProfileCode.isBlank()) {
      return false
    }

    return preloadProfileChildrenMap(db, gcode, scode)[normalizedProfileCode]?.isNotEmpty() == true
  }

  private fun getProfileCodesWithChildren(
    db: SQLiteDatabase,
    gcode: String,
    scode: String,
  ): Set<String> {
    return preloadProfileChildrenMap(db, gcode, scode).keys
  }

  private fun buildChildTests(
    db: SQLiteDatabase,
    gcode: String,
    scode: String,
    profileCode: String,
    visitedProfileCodes: Set<String> = emptySet(),
    preloadedChildRowsMap: Map<String, List<ProfileChildRow>>? = null,
  ): JSONArray {
    val childTests = JSONArray()
    val normalizedProfileCode = profileCode.trim().uppercase()
    val childRowsMap = preloadedChildRowsMap ?: preloadProfileChildRowsMap(db, gcode, scode)

    if (
      normalizedProfileCode.isBlank() ||
      visitedProfileCodes.contains(normalizedProfileCode) ||
      visitedProfileCodes.size >= maxProfileTreeDepth
    ) {
      return childTests
    }

    val nextVisitedProfileCodes = visitedProfileCodes + normalizedProfileCode
    val profileRows = childRowsMap[normalizedProfileCode].orEmpty()
    profileRows.forEach { row ->
      val bookedCode = row.bookedCode
      val masterTestCode = row.masterTestCode
      val description = row.description
      val nestedChildTests = buildChildTests(
        db,
        gcode,
        scode,
        masterTestCode,
        nextVisitedProfileCodes,
        childRowsMap,
      )
      val hasNestedChildren = nestedChildTests.length() > 0

      if (bookedCode.isNotBlank() || description.isNotBlank()) {
        childTests.put(
          JSONObject()
            .put("booked_code", bookedCode)
            .put("dedupe_key", bookedCode.trim().uppercase())
            .put("description", description)
            .put("specimen_name", row.specimenName)
            .put("is_profile", row.profile == 1 || hasNestedChildren)
            .put("has_children", hasNestedChildren)
            .put("child_tests", nestedChildTests),
        )
      }
    }

    return childTests
  }

  @ReactMethod
  fun getSyncMeta(tableName: String, promise: Promise) {
    val normalizedTableName = tableName.trim().lowercase()
    if (skippedSyncTables.contains(normalizedTableName)) {
      promise.resolve(seedSyncedAt)
      return
    }

    try {
      val db = openDatabase()
      ensureSyncSchema(db)
      db.rawQuery(
        "SELECT last_synced_at FROM sync_meta WHERE table_name = ? LIMIT 1",
        arrayOf(tableName.trim()),
      ).use { cursor ->
        promise.resolve(if (cursor.moveToFirst()) cursor.getString(0) else seedSyncedAt)
      }
    } catch (error: Exception) {
      promise.reject("SYNC_META_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun setSyncMeta(tableName: String, lastSyncedAt: String, promise: Promise) {
    val normalizedTableName = tableName.trim().lowercase()
    if (skippedSyncTables.contains(normalizedTableName)) {
      promise.resolve(true)
      return
    }

    try {
      val db = openDatabase()
      ensureSyncSchema(db)
      updateSyncMeta(db, tableName.trim(), lastSyncedAt.trim().ifBlank { seedSyncedAt })
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SYNC_META_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun markSyncStatus(tableName: String, status: String, message: String, promise: Promise) {
    val normalizedTableName = tableName.trim().lowercase()
    if (skippedSyncTables.contains(normalizedTableName)) {
      promise.resolve(true)
      return
    }

    try {
      val db = openDatabase()
      ensureSyncSchema(db)
      val values = ContentValues().apply {
        put("table_name", tableName.trim())
        put("status", status.trim())
        put("message", message)
        put("updated_at", currentMysqlTimestamp())
      }
      db.insertWithOnConflict("sync_status", null, values, SQLiteDatabase.CONFLICT_REPLACE)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("SYNC_STATUS_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun upsertSyncRows(tableName: String, rowsJson: String, promise: Promise) {
    val normalizedTableName = tableName.trim().lowercase()
    if (skippedSyncTables.contains(normalizedTableName)) {
      promise.resolve(
        JSONObject()
          .put("rowsChanged", 0)
          .put("maxUpdatedAt", "")
          .put("skipped", true)
          .toString(),
      )
      return
    }

    val spec = syncTableSpecs[normalizedTableName]

    if (spec == null) {
      promise.reject("SYNC_TABLE_UNSUPPORTED", "Unsupported sync table: $normalizedTableName")
      return
    }

    try {
      val db = openDatabase()
      ensureSyncSchema(db)
      val rows = JSONArray(rowsJson)
      var rowsChanged = 0
      var maxUpdatedAt = ""

      db.beginTransaction()
      try {
        for (index in 0 until rows.length()) {
          val row = rows.optJSONObject(index) ?: continue
          val rowUpdatedAt = rowString(row, "updated_at").ifBlank {
            rowString(row, "UpdatedAt").ifBlank { rowString(row, "updatedAt") }
          }

          if (rowUpdatedAt.isNotBlank() && rowUpdatedAt > maxUpdatedAt) {
            maxUpdatedAt = rowUpdatedAt
          }

          upsertRawSyncRow(db, spec, row, rowUpdatedAt)
          upsertProjectedRow(db, normalizedTableName, row)
          rowsChanged += 1
        }

        db.setTransactionSuccessful()
      } finally {
        db.endTransaction()
      }

      promise.resolve(
        JSONObject()
          .put("rowsChanged", rowsChanged)
          .put("maxUpdatedAt", maxUpdatedAt)
          .toString(),
      )
    } catch (error: Exception) {
      promise.reject("SYNC_UPSERT_ERROR", error.message, error)
    }
  }

  private fun currentMysqlTimestamp(): String =
    java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
      .format(java.util.Date())

  private fun updateSyncMeta(db: SQLiteDatabase, tableName: String, lastSyncedAt: String) {
    val values = ContentValues().apply {
      put("table_name", tableName)
      put("last_synced_at", lastSyncedAt)
    }
    db.insertWithOnConflict("sync_meta", null, values, SQLiteDatabase.CONFLICT_REPLACE)
  }

  private fun rowString(row: JSONObject, columnName: String): String {
    if (row.has(columnName) && !row.isNull(columnName)) {
      return row.optString(columnName, "").trim()
    }

    val keys = row.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      if (key.equals(columnName, ignoreCase = true) && !row.isNull(key)) {
        return row.optString(key, "").trim()
      }
    }

    return ""
  }

  private fun rowNumber(row: JSONObject, columnName: String): Double =
    rowString(row, columnName).toDoubleOrNull() ?: 0.0

  private fun rowInt(row: JSONObject, columnName: String): Int =
    rowString(row, columnName).toDoubleOrNull()?.toInt() ?: 0

  private fun whereClauseFor(spec: SyncTableSpec): String =
    spec.primaryKey.joinToString(" AND ") { "${quoteIdent(it)} = ?" }

  private fun whereArgsFor(spec: SyncTableSpec, row: JSONObject): Array<String> =
    spec.primaryKey.map { rowString(row, it) }.toTypedArray()

  private fun upsertRawSyncRow(
    db: SQLiteDatabase,
    spec: SyncTableSpec,
    row: JSONObject,
    rowUpdatedAt: String,
  ) {
    val values = ContentValues()
    spec.columns.forEach { column ->
      val value = when {
        column == "updated_at" -> rowUpdatedAt
        spec.tableName == "address" && column == "sync_key" -> addressSyncKey(row)
        spec.tableName == "address" && column == "showmrp" ->
          rowString(row, column).ifBlank { "0" }
        column == "Active" -> rowString(row, column).ifBlank { "1" }
        else -> rowString(row, column)
      }
      values.put(column, value)
    }
    db.insertWithOnConflict(spec.tableName, null, values, SQLiteDatabase.CONFLICT_REPLACE)
  }

  private fun addressSyncKey(row: JSONObject): String {
    val centerId = rowString(row, "CenterID")
    val atype = rowString(row, "Atype")
    val code = rowString(row, "code")
    val abarid = rowString(row, "ABARID")

    if (code.isNotBlank() && abarid.isNotBlank()) {
      return listOf(centerId, atype, code, abarid).joinToString("|")
    }

    return listOf(centerId, atype, rowString(row, "pname"), rowString(row, "category"))
      .joinToString("|")
  }

  private fun deleteProjectedRow(db: SQLiteDatabase, tableName: String, row: JSONObject) {
    when (tableName) {
      "address" -> db.delete(
        "panel_companies",
        "sync_key = ?",
        arrayOf(addressSyncKey(row)),
      )
      "compcategory" -> {
        db.delete("panel_categories", "comp_cat_id = ?", arrayOf(rowString(row, "CompCatID")))
        db.delete("panel_companies", "comp_cat_id = ?", arrayOf(rowString(row, "CompCatID")))
      }
      "groupmaster" -> db.delete("groups", "gcode = ?", arrayOf(rowString(row, "Gcode")))
      "subgroup" -> db.delete(
        "subgroups",
        "gcode = ? AND scode = ?",
        arrayOf(rowString(row, "Gcode"), rowString(row, "Scode")),
      )
      "test" -> db.delete(
        "tests",
        "gcode = ? AND scode = ? AND test_code = ?",
        arrayOf(rowString(row, "Gcode"), rowString(row, "Scode"), rowString(row, "TestCode")),
      )
      "testspecimen" -> db.delete(
        "test_specimens",
        "specimen_id = ?",
        arrayOf(rowString(row, "SpecimenID")),
      )
      "panelrates" -> db.delete(
        "panel_rates",
        "comp_cat_id = ? AND gcode = ? AND scode = ? AND test_code = ? AND ctest_code = ?",
        arrayOf(
          rowString(row, "CompCatID"),
          rowString(row, "GCode"),
          rowString(row, "SCode"),
          rowString(row, "TestCode"),
          rowString(row, "CTestCode"),
        ),
      )
      "testprofile" -> db.delete(
        "test_profiles",
        "gcode = ? AND scode = ? AND profile_code = ? AND child_testcode1 = ?",
        arrayOf(
          rowString(row, "Gcode"),
          rowString(row, "SCode"),
          rowString(row, "ProfileCode"),
          rowString(row, "TestCode"),
        ),
      )
      "testprofilebreakuptestsdetails" -> db.delete(
        "test_profiles",
        "gcode = ? AND scode = ? AND profile_code = ? AND child_testcode1 = ?",
        arrayOf(
          rowString(row, "Gcode"),
          rowString(row, "SCode"),
          rowString(row, "PTCode"),
          rowString(row, "TestCode"),
        ),
      )
    }
  }

  private fun upsertProjectedRow(db: SQLiteDatabase, tableName: String, row: JSONObject) {
    when (tableName) {
      "address" -> upsertPanelCompany(db, row)
      "compcategory" -> upsertPanelCategory(db, row)
      "groupmaster" -> replaceValues(
        db,
        "groups",
        mapOf("gcode" to rowString(row, "Gcode"), "description" to rowString(row, "Description")),
      )
      "subgroup" -> replaceValues(
        db,
        "subgroups",
        mapOf(
          "gcode" to rowString(row, "Gcode"),
          "scode" to rowString(row, "Scode"),
          "description" to rowString(row, "Description"),
        ),
      )
      "test" -> replaceValues(
        db,
        "tests",
        mapOf(
          "gcode" to rowString(row, "Gcode"),
          "scode" to rowString(row, "Scode"),
          "test_code" to rowString(row, "TestCode"),
          "testcode1" to rowString(row, "Testcode1"),
          "description" to rowString(row, "Description"),
          "shortname" to rowString(row, "Shortname"),
          "gender_flag" to rowString(row, "Test"),
          "profile" to rowInt(row, "Profile"),
          "specimen_id" to rowInt(row, "SpecimenID"),
        ),
      )
      "testspecimen" -> replaceValues(
        db,
        "test_specimens",
        mapOf("specimen_id" to rowInt(row, "SpecimenID"), "sp_name" to rowString(row, "SpName")),
      )
      "panelrates" -> upsertPanelRate(db, row)
      "testprofile" -> {
        deleteProjectedRow(db, "testprofile", row)
        replaceValues(
          db,
          "test_profiles",
          mapOf(
            "gcode" to rowString(row, "Gcode"),
            "scode" to rowString(row, "SCode"),
            "profile_code" to rowString(row, "ProfileCode"),
            "child_testcode1" to rowString(row, "TestCode"),
          ),
        )
      }
      "testprofilebreakuptestsdetails" -> {
        deleteProjectedRow(db, "testprofilebreakuptestsdetails", row)
        replaceValues(
          db,
          "test_profiles",
          mapOf(
            "gcode" to rowString(row, "Gcode"),
            "scode" to rowString(row, "SCode"),
            "profile_code" to rowString(row, "PTCode"),
            "child_testcode1" to rowString(row, "TestCode").trim(),
          ),
        )
      }
    }
  }

  private fun upsertPanelCategory(db: SQLiteDatabase, row: JSONObject) {
    replaceValues(
      db,
      "panel_categories",
      mapOf("comp_cat_id" to rowInt(row, "CompCatID"), "cat_details" to rowString(row, "CatDetails")),
    )

    val values = ContentValues().apply {
      put("cat_details", rowString(row, "CatDetails"))
    }
    db.update("panel_companies", values, "comp_cat_id = ?", arrayOf(rowString(row, "CompCatID")))
  }

  private fun upsertPanelCompany(db: SQLiteDatabase, row: JSONObject) {
    val compCatId = rowString(row, "category")
    val catDetails = resolveCatDetails(db, compCatId)
    val syncKey = addressSyncKey(row)

    db.delete(
      "panel_companies",
      "sync_key = ?",
      arrayOf(syncKey),
    )
    replaceValues(
      db,
      "panel_companies",
      mapOf(
        "pname" to rowString(row, "pname"),
        "comp_cat_id" to rowInt(row, "category"),
        "cat_details" to catDetails,
        "billing_charge_mode" to rowString(row, "BillingChargeMode"),
        "center_id" to rowInt(row, "CenterID"),
        "atype" to rowString(row, "Atype"),
        "showmrp" to rowString(row, "showmrp").ifBlank { "0" }.toDoubleOrNull()?.toInt().let {
          if (it == 1) 1 else 0
        },
        "active" to rowString(row, "Active").ifBlank { "1" }.toDoubleOrNull()?.toInt().let {
          if (it == 0) 0 else 1
        },
        "sync_key" to syncKey,
        "search_key" to "${rowString(row, "pname")} $catDetails $compCatId".lowercase(),
      ),
    )
    deleteStalePanelCompanyRowsForAddress(db, row)
  }

  private fun deleteStalePanelCompanyRowsForAddress(db: SQLiteDatabase, row: JSONObject) {
    db.delete(
      "panel_companies",
      """
      CAST(center_id AS TEXT) = ?
        AND IFNULL(atype, '') = ?
        AND CAST(comp_cat_id AS TEXT) = ?
        AND NOT EXISTS (
          SELECT 1
          FROM address a
          WHERE CAST(a.CenterID AS TEXT) = CAST(panel_companies.center_id AS TEXT)
            AND IFNULL(a.Atype, '') = IFNULL(panel_companies.atype, '')
            AND CAST(a.category AS TEXT) = CAST(panel_companies.comp_cat_id AS TEXT)
            AND IFNULL(a.pname, '') = IFNULL(panel_companies.pname, '')
        )
      """.trimIndent(),
      arrayOf(rowString(row, "CenterID"), rowString(row, "Atype"), rowString(row, "category")),
    )
  }

  private fun upsertPanelRate(db: SQLiteDatabase, row: JSONObject) {
    deleteProjectedRow(db, "panelrates", row)
    replaceValues(
      db,
      "panel_rates",
      mapOf(
        "comp_cat_id" to rowInt(row, "CompCatID"),
        "gcode" to rowString(row, "GCode"),
        "scode" to rowString(row, "SCode"),
        "test_code" to rowString(row, "TestCode"),
        "ctest_code" to rowString(row, "CTestCode"),
        "ctest_name" to rowString(row, "CTestName"),
        "charge" to rowNumber(row, "Charge"),
        "mrp" to rowNumber(row, "MRP"),
        "max_discount" to rowNumber(row, "MaxDiscount"),
        "base_discount_percent" to
          rowNumber(row, "percentageonstandard"),
        "max_allowed_discount_percent" to rowNumber(row, "MaximumpercentageAllowed"),
        "booked_flag" to rowInt(row, "BookedFlag"),
        "active" to rowString(row, "Active").ifBlank { "1" }.toDoubleOrNull()?.toInt().let {
          if (it == 0) 0 else 1
        },
      ),
    )
  }

  private fun resolveCatDetails(db: SQLiteDatabase, compCatId: String): String {
    db.rawQuery(
      "SELECT cat_details FROM panel_categories WHERE comp_cat_id = ? LIMIT 1",
      arrayOf(compCatId),
    ).use { cursor ->
      if (cursor.moveToFirst()) {
        return cursor.stringValue("cat_details")
      }
    }

    return ""
  }

  private fun replaceValues(db: SQLiteDatabase, tableName: String, valuesMap: Map<String, Any?>) {
    val values = ContentValues()
    valuesMap.forEach { (key, value) ->
      when (value) {
        null -> values.putNull(key)
        is Int -> values.put(key, value)
        is Double -> values.put(key, value)
        is Float -> values.put(key, value)
        is Long -> values.put(key, value)
        else -> values.put(key, value.toString())
      }
    }
    db.insertWithOnConflict(tableName, null, values, SQLiteDatabase.CONFLICT_REPLACE)
  }

  override fun invalidate() {
    database?.close()
    database = null
    super.invalidate()
  }
}


