package com.homecollection

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

class LocalGeoCameraModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext),
  ActivityEventListener {

  companion object {
    private const val CAMERA_REQUEST_CODE = 4921
    private const val CANCELLED_CODE = "CAMERA_CANCELLED"
    private const val MAX_IMAGE_SIDE = 1800
  }

  private var pendingPromise: Promise? = null
  private var pendingPhotoUri: Uri? = null
  private var pendingPhotoFile: File? = null
  private var pendingStampLines: List<String> = emptyList()

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "LocalGeoCameraModule"

  @ReactMethod
  fun captureStampedPhoto(stampText: String, promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("CAMERA_BUSY", "Camera is already open.")
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Current activity is not available.")
      return
    }

    val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
    if (cameraIntent.resolveActivity(reactContext.packageManager) == null) {
      promise.reject("CAMERA_UNAVAILABLE", "No camera app is available.")
      return
    }

    try {
      val photoFile = createCameraOutputFile()
      val authority = "${reactContext.packageName}.fileprovider"
      val photoUri = FileProvider.getUriForFile(reactContext, authority, photoFile)

      pendingPromise = promise
      pendingPhotoFile = photoFile
      pendingPhotoUri = photoUri
      pendingStampLines =
        stampText
          .split("\n")
          .map { it.trim() }
          .filter { it.isNotBlank() }

      cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, photoUri)
      cameraIntent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      activity.startActivityForResult(cameraIntent, CAMERA_REQUEST_CODE)
    } catch (error: Exception) {
      clearPendingState()
      promise.reject("CAMERA_OPEN_FAILED", error.message, error)
    }
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?,
  ) {
    if (requestCode != CAMERA_REQUEST_CODE) {
      return
    }

    val promise = pendingPromise
    val sourceUri = pendingPhotoUri
    val sourceFile = pendingPhotoFile
    val stampLines = pendingStampLines
    clearPendingState()

    if (promise == null) {
      return
    }

    if (resultCode != Activity.RESULT_OK || sourceUri == null || sourceFile == null) {
      sourceFile?.delete()
      promise.reject(CANCELLED_CODE, "Camera capture cancelled.")
      return
    }

    try {
      val sourceBitmap =
        reactContext.contentResolver.openInputStream(sourceUri).use { inputStream ->
          BitmapFactory.decodeStream(inputStream)
        } ?: throw IllegalStateException("Unable to decode captured image.")

      val stampedBitmap = stampBitmap(sourceBitmap, stampLines)
      val outputFile = createStampedOutputFile()

      FileOutputStream(outputFile).use { outputStream ->
        stampedBitmap.compress(Bitmap.CompressFormat.JPEG, 92, outputStream)
      }

      if (stampedBitmap != sourceBitmap) {
        stampedBitmap.recycle()
      }
      sourceBitmap.recycle()
      sourceFile.delete()

      val result = WritableNativeMap()
      result.putString("uri", Uri.fromFile(outputFile).toString())
      result.putString("name", outputFile.name)
      result.putString("type", "image/jpeg")
      promise.resolve(result)
    } catch (error: Exception) {
      sourceFile.delete()
      promise.reject("CAMERA_STAMP_FAILED", error.message, error)
    }
  }

  override fun onNewIntent(intent: Intent) {
    // No-op.
  }

  private fun createCameraOutputFile(): File {
    val directory =
      reactContext.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
        ?: reactContext.cacheDir
    if (!directory.exists()) {
      directory.mkdirs()
    }
    return File.createTempFile("patient-photo-source-", ".jpg", directory)
  }

  private fun createStampedOutputFile(): File {
    val directory = File(reactContext.cacheDir, "patient-geo-photos")
    if (!directory.exists()) {
      directory.mkdirs()
    }
    val timestamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
    return File(directory, "patient-photo-$timestamp.jpg")
  }

  private fun stampBitmap(sourceBitmap: Bitmap, stampLines: List<String>): Bitmap {
    val scale =
      min(
        1f,
        MAX_IMAGE_SIDE.toFloat() / max(sourceBitmap.width, sourceBitmap.height).toFloat(),
      )
    val width = max(1, (sourceBitmap.width * scale).toInt())
    val height = max(1, (sourceBitmap.height * scale).toInt())
    val bitmap =
      if (scale < 1f) {
        Bitmap.createScaledBitmap(sourceBitmap, width, height, true)
      } else {
        sourceBitmap.copy(Bitmap.Config.ARGB_8888, true)
      }

    if (stampLines.isEmpty()) {
      return bitmap
    }

    val canvas = Canvas(bitmap)
    val density = reactContext.resources.displayMetrics.density
    val padding = (12 * density).toInt()
    val textSize = max(15f * density, bitmap.width * 0.032f)
    val lineGap = (5 * density).toInt()
    val paint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        this.textSize = textSize
        typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
      }
    val backgroundPaint =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(178, 0, 0, 0)
      }
    val maxTextWidth = bitmap.width - padding * 2
    val wrappedLines = stampLines.flatMap { line -> wrapLine(line, paint, maxTextWidth) }
    val bounds = Rect()
    paint.getTextBounds("Ag", 0, 2, bounds)
    val lineHeight = bounds.height() + lineGap
    val blockHeight = padding * 2 + lineHeight * wrappedLines.size
    val top = bitmap.height - blockHeight

    canvas.drawRect(
      0f,
      top.toFloat().coerceAtLeast(0f),
      bitmap.width.toFloat(),
      bitmap.height.toFloat(),
      backgroundPaint,
    )

    var y = top + padding + bounds.height()
    wrappedLines.forEach { line ->
      canvas.drawText(line, padding.toFloat(), y.toFloat(), paint)
      y += lineHeight
    }

    return bitmap
  }

  private fun wrapLine(line: String, paint: Paint, maxWidth: Int): List<String> {
    if (paint.measureText(line) <= maxWidth) {
      return listOf(line)
    }

    val wrappedLines = mutableListOf<String>()
    val words = line.split(Regex("\\s+")).filter { it.isNotBlank() }
    var currentLine = ""

    words.forEach { word ->
      val nextLine = if (currentLine.isBlank()) word else "$currentLine $word"
      if (paint.measureText(nextLine) <= maxWidth) {
        currentLine = nextLine
        return@forEach
      }

      if (currentLine.isNotBlank()) {
        wrappedLines.add(currentLine)
      }
      currentLine =
        if (paint.measureText(word) <= maxWidth) {
          word
        } else {
          truncateLongWord(word, paint, maxWidth)
        }
    }

    if (currentLine.isNotBlank()) {
      wrappedLines.add(currentLine)
    }

    return wrappedLines.ifEmpty { listOf(line) }
  }

  private fun truncateLongWord(word: String, paint: Paint, maxWidth: Int): String {
    var truncated = word
    while (truncated.length > 4 && paint.measureText("$truncated...") > maxWidth) {
      truncated = truncated.dropLast(1)
    }
    return "$truncated..."
  }

  private fun clearPendingState() {
    pendingPromise = null
    pendingPhotoUri = null
    pendingPhotoFile = null
    pendingStampLines = emptyList()
  }
}
