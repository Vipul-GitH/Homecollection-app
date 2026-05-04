package com.homecollection

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap

class LocalDocumentPickerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  ActivityEventListener {

  companion object {
    private const val PICK_DOCUMENT_REQUEST_CODE = 4815
    private const val CANCELLED_CODE = "DOCUMENT_PICKER_CANCELLED"
  }

  private var pendingPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "LocalDocumentPickerModule"

  @ReactMethod
  fun pickDocuments(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("DOCUMENT_PICKER_BUSY", "Document picker is already open.")
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Current activity is not available.")
      return
    }

    pendingPromise = promise

    val intent =
      Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        type = "*/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      }

    try {
      activity.startActivityForResult(intent, PICK_DOCUMENT_REQUEST_CODE)
    } catch (error: Exception) {
      pendingPromise = null
      promise.reject("DOCUMENT_PICKER_OPEN_FAILED", error.message, error)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != PICK_DOCUMENT_REQUEST_CODE) {
      return
    }

    val promise = pendingPromise
    pendingPromise = null

    if (promise == null) {
      return
    }

    if (resultCode != Activity.RESULT_OK || data == null) {
      promise.reject(CANCELLED_CODE, "Document selection cancelled.")
      return
    }

    val selectedUris = mutableListOf<Uri>()

    data.data?.let { selectedUris.add(it) }

    val clipData = data.clipData
    if (clipData != null) {
      for (index in 0 until clipData.itemCount) {
        clipData.getItemAt(index)?.uri?.let { selectedUris.add(it) }
      }
    }

    if (selectedUris.isEmpty()) {
      promise.reject(CANCELLED_CODE, "No documents selected.")
      return
    }

    val results = WritableNativeArray()
    selectedUris.forEach { uri ->
      persistReadPermission(data, uri)
      val map = WritableNativeMap()
      map.putString("uri", uri.toString())
      map.putString("name", resolveDisplayName(uri))
      map.putString("type", reactContext.contentResolver.getType(uri) ?: "")
      results.pushMap(map)
    }

    promise.resolve(results)
  }

  override fun onNewIntent(intent: Intent) {
    // No-op.
  }

  private fun resolveDisplayName(uri: Uri): String {
    var displayName = ""
    var cursor: Cursor? = null
    try {
      cursor = reactContext.contentResolver.query(uri, null, null, null, null)
      if (cursor != null && cursor.moveToFirst()) {
        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (nameIndex >= 0) {
          displayName = cursor.getString(nameIndex) ?: ""
        }
      }
    } catch (_: Exception) {
      // ignore
    } finally {
      cursor?.close()
    }

    if (displayName.isNotBlank()) {
      return displayName
    }

    val path = uri.path ?: ""
    return path.substringAfterLast('/').ifBlank { "document" }
  }

  private fun persistReadPermission(data: Intent, uri: Uri) {
    try {
      val readFlags = data.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION
      if (readFlags != 0) {
        reactContext.contentResolver.takePersistableUriPermission(uri, readFlags)
      }
    } catch (_: Exception) {
      // Some providers do not allow persisted permissions.
    }
  }
}
