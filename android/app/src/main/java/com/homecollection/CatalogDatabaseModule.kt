package com.homecollection

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
  private val databaseVersion = "bhasin_7001_v3"
  private val maxProfileTreeDepth = 1
  private val maxProfileChildrenPerNode = 150
  private var database: SQLiteDatabase? = null

  private data class TubeRootRequest(
    val code: String,
    val gcode: String,
    val scode: String,
  )

  private data class TubeQueueItem(
    val code: String,
    val gcode: String,
    val scode: String,
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

  @Synchronized
  private fun openDatabase(): SQLiteDatabase {
    val targetFile = databaseFile()
    val currentVersion = readDatabaseVersion(targetFile)

    if (currentVersion != databaseVersion) {
      database?.close()
      database = null
      copyBundledDatabase(targetFile)
    }

    val existingDatabase = database
    if (existingDatabase != null && existingDatabase.isOpen) {
      return existingDatabase
    }

    return SQLiteDatabase.openDatabase(
      targetFile.absolutePath,
      null,
      SQLiteDatabase.OPEN_READONLY,
    ).also {
      database = it
    }
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

  @ReactMethod
  fun getPanelCompanies(promise: Promise) {
    try {
      val db = openDatabase()
      val items = JSONArray()

      db.rawQuery(
        """
        SELECT center_id, pname, comp_cat_id, cat_details, billing_charge_mode
        FROM panel_companies
        ORDER BY pname COLLATE NOCASE, comp_cat_id
        """.trimIndent(),
        emptyArray<String>(),
      ).use { cursor ->
        while (cursor.moveToNext()) {
          items.put(
            JSONObject()
              .put("CenterID", cursor.intValue("center_id"))
              .put("pname", cursor.stringValue("pname"))
              .put("CompCatID", cursor.intValue("comp_cat_id"))
              .put("CatDetails", cursor.stringValue("cat_details"))
              .put("BillingChargeMode", cursor.stringValue("billing_charge_mode")),
          )
        }
      }

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
      val db = openDatabase()
      val roots = JSONArray(testCodesJson)
      val queue = ArrayDeque<TubeQueueItem>()
      val visited = mutableSetOf<String>()
      val testsMap = JSONObject()
      val childrenMap = JSONObject()

      for (index in 0 until roots.length()) {
        val root = parseTubeRootRequest(roots.get(index))
        root?.let {
          queue.add(TubeQueueItem(it.code, it.gcode, it.scode))
        }
      }

      while (queue.isNotEmpty()) {
        val currentItem = queue.removeFirst()
        val currentCode = currentItem.code.trim().uppercase()
        val visitedKey = listOf(currentItem.gcode, currentItem.scode, currentCode).joinToString("|")
        if (currentCode.isBlank() || visited.contains(visitedKey)) {
          continue
        }

        visited.add(visitedKey)
        val testInfo = resolveTubeTestInfo(
          db,
          currentCode,
          currentItem.gcode,
          currentItem.scode,
        )
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

        val children = resolveTubeChildCodes(
          db,
          parentCandidates,
          currentItem.gcode,
          currentItem.scode,
        )
        val childArray = JSONArray()
        children.forEach { childCode ->
          childArray.put(childCode)
          val childVisitedKey = listOf(currentItem.gcode, currentItem.scode, childCode).joinToString("|")
          if (!visited.contains(childVisitedKey)) {
            queue.add(TubeQueueItem(childCode, currentItem.gcode, currentItem.scode))
          }
        }
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
      val gcode = (
        value.optString("gcode", "").ifBlank { catalogParts.getOrNull(1) ?: "" }
      ).trim().uppercase()
      val scode = (
        value.optString("scode", "").ifBlank { catalogParts.getOrNull(2) ?: "" }
      ).trim().uppercase()

      return if (code.isBlank()) null else TubeRootRequest(code, gcode, scode)
    }

    val code = value.toString().trim().uppercase()
    return if (code.isBlank()) null else TubeRootRequest(code, "", "")
  }

  private fun resolveTubeTestInfo(
    db: SQLiteDatabase,
    testCode: String,
    gcode: String = "",
    scode: String = "",
  ): JSONObject {
    val normalizedTestCode = testCode.trim().uppercase()

    if (gcode.isNotBlank() && scode.isNotBlank()) {
      db.rawQuery(
        """
        SELECT
          COALESCE(NULLIF(t.testcode1, ''), NULLIF(t.test_code, ''), ?) AS testcode1,
          t.test_code,
          t.description,
          ts.sp_name AS specimen_name
        FROM tests t
        LEFT JOIN test_specimens ts ON ts.specimen_id = t.specimen_id
        WHERE UPPER(TRIM(t.gcode)) = ?
          AND UPPER(TRIM(t.scode)) = ?
          AND (
            UPPER(TRIM(t.testcode1)) = ?
            OR UPPER(TRIM(t.test_code)) = ?
          )
        ORDER BY t.testcode1 COLLATE NOCASE
        LIMIT 1
        """.trimIndent(),
        arrayOf(
          normalizedTestCode,
          gcode.trim().uppercase(),
          scode.trim().uppercase(),
          normalizedTestCode,
          normalizedTestCode,
        ),
      ).use { cursor ->
        if (cursor.moveToFirst()) {
          return JSONObject()
            .put("testcode1", cursor.stringValue("testcode1"))
            .put("test_code", cursor.stringValue("test_code"))
            .put("description", cursor.stringValue("description"))
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
        ts.sp_name AS specimen_name
      FROM tests t
      LEFT JOIN test_specimens ts ON ts.specimen_id = t.specimen_id
      WHERE UPPER(TRIM(t.testcode1)) = ?
         OR UPPER(TRIM(t.test_code)) = ?
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
          .put("specimen_name", cursor.stringValue("specimen_name"))
      }
    }

    return JSONObject()
      .put("testcode1", normalizedTestCode)
      .put("test_code", "")
      .put("description", normalizedTestCode)
      .put("specimen_name", "")
  }

  private fun resolveTubeChildCodes(
    db: SQLiteDatabase,
    parentCandidates: List<String>,
    gcode: String,
    scode: String,
  ): List<String> {
    if (parentCandidates.isEmpty() || gcode.isBlank() || scode.isBlank()) {
      return emptyList()
    }

    val placeholders = parentCandidates.joinToString(",") { "?" }
    val children = mutableListOf<String>()
    val args = mutableListOf(gcode.trim().uppercase(), scode.trim().uppercase())
    args.addAll(parentCandidates)

    db.rawQuery(
      """
      SELECT DISTINCT UPPER(TRIM(child_testcode1)) AS child_testcode1
      FROM test_profiles
      WHERE UPPER(TRIM(gcode)) = ?
        AND UPPER(TRIM(scode)) = ?
        AND UPPER(TRIM(profile_code)) IN ($placeholders)
        AND TRIM(child_testcode1) != ''
      ORDER BY child_testcode1 COLLATE NOCASE
      """.trimIndent(),
      args.toTypedArray(),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        val childCode = cursor.stringValue("child_testcode1").trim().uppercase()
        if (childCode.isNotBlank()) {
          children.add(childCode)
        }
      }
    }

    return children
  }

  private fun resolvePanelCompanyName(db: SQLiteDatabase, compCatId: String): String {
    db.rawQuery(
      """
      SELECT pname
      FROM panel_companies
      WHERE comp_cat_id = ?
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
        AND TRIM(pr.scode) != ''
        AND TRIM(pr.test_code) != ''
      ORDER BY sg.scode COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, gcode),
    ).use { subgroupCursor ->
      while (subgroupCursor.moveToNext()) {
        val scode = subgroupCursor.stringValue("scode")
        val tests = buildTests(db, compCatId, gcode, scode)

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

  private fun buildTests(
    db: SQLiteDatabase,
    compCatId: String,
    gcode: String,
    scode: String,
  ): JSONArray {
    val tests = JSONArray()

    db.rawQuery(
      """
      SELECT
        dedupe_key,
        MIN(booked_code) AS booked_code,
        MIN(master_test_code) AS master_test_code,
        MIN(description) AS description,
        MAX(profile) AS profile,
        MAX(charge) AS charge,
        MAX(mrp) AS mrp,
        MAX(max_discount) AS max_discount,
        MIN(specimen_name) AS specimen_name,
        COUNT(*) AS duplicate_count,
        GROUP_CONCAT(source_row_id) AS source_row_ids
      FROM (
        SELECT
          pr.rowid AS source_row_id,
          COALESCE(
            NULLIF(t1.test_code, ''),
            NULLIF(t2.test_code, ''),
            NULLIF(pr.test_code, '')
          ) AS master_test_code,
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
          pr.max_discount,
          COALESCE(NULLIF(ts1.sp_name, ''), NULLIF(ts2.sp_name, '')) AS specimen_name
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
          AND TRIM(pr.test_code) != ''
      )
      WHERE booked_code IS NOT NULL
        AND TRIM(booked_code) != ''
      GROUP BY dedupe_key
      ORDER BY description COLLATE NOCASE
      """.trimIndent(),
      arrayOf(compCatId, gcode, scode),
    ).use { testCursor ->
      while (testCursor.moveToNext()) {
        val masterTestCode = testCursor.stringValue("master_test_code")
        val childTests = buildChildTests(db, gcode, scode, masterTestCode)
        val hasChildren = childTests.length() > 0

        val bookedCode = testCursor.stringValue("booked_code")

        tests.put(
          JSONObject()
            .put("catalog_key", "$compCatId|$gcode|$scode|$bookedCode")
            .put("dedupe_key", testCursor.stringValue("dedupe_key"))
            .put("booked_code", bookedCode)
            .put("description", testCursor.stringValue("description"))
            .put("is_profile", testCursor.intValue("profile") == 1 || hasChildren)
            .put("has_children", hasChildren)
            .put("charge", testCursor.doubleValue("charge"))
            .put("mrp", testCursor.doubleValue("mrp"))
            .put("max_discount", testCursor.doubleValue("max_discount"))
            .put("specimen_name", testCursor.stringValue("specimen_name"))
            .put("duplicate_count", testCursor.intValue("duplicate_count"))
            .put("source_row_ids", testCursor.stringValue("source_row_ids"))
            .put("child_tests", childTests),
        )
      }
    }

    return tests
  }

  private fun buildChildTests(
    db: SQLiteDatabase,
    gcode: String,
    scode: String,
    profileCode: String,
    visitedProfileCodes: Set<String> = emptySet(),
  ): JSONArray {
    val childTests = JSONArray()
    val normalizedProfileCode = profileCode.trim()

    if (
      normalizedProfileCode.isBlank() ||
      visitedProfileCodes.contains(normalizedProfileCode) ||
      visitedProfileCodes.size >= maxProfileTreeDepth
    ) {
      return childTests
    }

    val nextVisitedProfileCodes = visitedProfileCodes + normalizedProfileCode

    db.rawQuery(
      """
      SELECT DISTINCT
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
        AND tp.profile_code = ?
      ORDER BY description COLLATE NOCASE
      LIMIT ?
      """.trimIndent(),
      arrayOf(gcode, scode, normalizedProfileCode, maxProfileChildrenPerNode.toString()),
    ).use { childCursor ->
      while (childCursor.moveToNext()) {
        val bookedCode = childCursor.stringValue("booked_code")
        val masterTestCode = childCursor.stringValue("master_test_code")
        val description = childCursor.stringValue("description")
        val nestedChildTests = buildChildTests(
          db,
          gcode,
          scode,
          masterTestCode,
          nextVisitedProfileCodes,
        )
        val hasNestedChildren = nestedChildTests.length() > 0

        if (bookedCode.isNotBlank() || description.isNotBlank()) {
          childTests.put(
            JSONObject()
              .put("booked_code", bookedCode)
              .put("dedupe_key", bookedCode.trim().uppercase())
              .put("description", description)
              .put("specimen_name", childCursor.stringValue("specimen_name"))
              .put("is_profile", childCursor.intValue("profile") == 1 || hasNestedChildren)
              .put("has_children", hasNestedChildren)
              .put("child_tests", nestedChildTests),
          )
        }
      }
    }

    return childTests
  }

  override fun invalidate() {
    database?.close()
    database = null
    super.invalidate()
  }
}
