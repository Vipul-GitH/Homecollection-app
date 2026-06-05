package com.homecollection

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import kotlin.random.Random
import kotlin.math.max

class SecureApiModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val UPLOAD_IMAGE_MAX_SIDE = 1024
    private val UPLOAD_IMAGE_JPEG_QUALITIES = intArrayOf(60, 50, 42)
    private const val UPLOAD_IMAGE_TARGET_BYTES = 2L * 1024L * 1024L
    private const val UPLOAD_IMAGE_CACHE_MAX_AGE_MS = 24L * 60L * 60L * 1000L
  }

  override fun getName(): String = "SecureApiModule"

  private fun createSslContext(): SSLContext {
    val certificateFactory = CertificateFactory.getInstance("X.509")
    val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
      load(null, null)
    }

    reactApplicationContext.resources.openRawResource(R.raw.server_cert).use { inputStream ->
      val certificate = certificateFactory.generateCertificate(inputStream) as X509Certificate
      keyStore.setCertificateEntry("server_cert", certificate)
    }

    reactApplicationContext.resources.openRawResource(R.raw.intermediate_cert).use { inputStream ->
      val certificate = certificateFactory.generateCertificate(inputStream) as X509Certificate
      keyStore.setCertificateEntry("intermediate_cert", certificate)
    }

    val trustManagerFactory =
      TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
        init(keyStore)
      }

    return SSLContext.getInstance("TLS").apply {
      init(null, trustManagerFactory.trustManagers, SecureRandom())
    }
  }

  private fun applyHeaders(connection: HttpURLConnection, headersJson: String?) {
    if (headersJson.isNullOrBlank()) {
      return
    }

    val headers = JSONObject(headersJson)
    val keys = headers.keys()

    while (keys.hasNext()) {
      val key = keys.next()
      connection.setRequestProperty(key, headers.optString(key))
    }
  }

  private fun openUploadInputStream(uriString: String): InputStream {
    return when {
      uriString.startsWith("content://", ignoreCase = true) -> {
        reactApplicationContext.contentResolver.openInputStream(Uri.parse(uriString))
          ?: throw IllegalArgumentException("Unable to open content URI: $uriString")
      }
      uriString.startsWith("file://", ignoreCase = true) -> {
        FileInputStream(java.io.File(URI(uriString)))
      }
      else -> FileInputStream(java.io.File(uriString))
    }
  }

  private fun openSecureConnection(url: String, timeoutMs: Int): HttpURLConnection {
    val connection = URL(url.replace(" ", "%20")).openConnection() as HttpURLConnection
    connection.connectTimeout = timeoutMs
    connection.readTimeout = timeoutMs
    connection.instanceFollowRedirects = true
    connection.doInput = true

    if (connection is HttpsURLConnection) {
      val sslContext = createSslContext()
      connection.sslSocketFactory = sslContext.socketFactory
      connection.hostnameVerifier = HttpsURLConnection.getDefaultHostnameVerifier()
    }

    return connection
  }

  private fun cacheFileForUrl(url: String): File {
    val path = try {
      URL(url.replace(" ", "%20")).path
    } catch (_: Exception) {
      ""
    }
    val extension = path.substringAfterLast('.', "jpg")
      .lowercase()
      .takeIf { it in setOf("jpg", "jpeg", "png", "webp") }
      ?: "jpg"
    val directory = File(reactApplicationContext.cacheDir, "remote-documents").apply {
      mkdirs()
    }
    return File(directory, "document-${url.hashCode()}.$extension")
  }

  private fun isImageUpload(mimeType: String, fileName: String, uriString: String): Boolean {
    val normalizedMimeType = mimeType.lowercase()
    if (normalizedMimeType.startsWith("image/")) {
      return true
    }

    val source = "$fileName $uriString".lowercase()
    return source.endsWith(".jpg") ||
      source.endsWith(".jpeg") ||
      source.endsWith(".png") ||
      source.endsWith(".webp") ||
      source.contains(".jpg?") ||
      source.contains(".jpeg?") ||
      source.contains(".png?") ||
      source.contains(".webp?")
  }

  private fun cleanupOldCompressedUploads(directory: File) {
    val cutoff = System.currentTimeMillis() - UPLOAD_IMAGE_CACHE_MAX_AGE_MS
    try {
      directory.listFiles()?.forEach { file ->
        if (file.isFile && file.lastModified() < cutoff) {
          file.delete()
        }
      }
    } catch (_: Exception) {
      // Cache cleanup should never block an upload.
    }
  }

  private fun resolveUploadFileSize(uriString: String): Long {
    return try {
      when {
        uriString.startsWith("content://", ignoreCase = true) -> {
          var resolvedSize = 0L
          reactApplicationContext.contentResolver.query(
            Uri.parse(uriString),
            arrayOf(OpenableColumns.SIZE),
            null,
            null,
            null,
          )?.use { cursor ->
            if (cursor.moveToFirst()) {
              val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
              if (sizeIndex >= 0) {
                resolvedSize = cursor.getLong(sizeIndex)
              }
            }
          }
          resolvedSize
        }
        uriString.startsWith("file://", ignoreCase = true) -> {
          File(URI(uriString)).length()
        }
        else -> File(uriString).length()
      }
    } catch (_: Exception) {
      0L
    }
  }

  private fun calculateImageSampleSize(width: Int, height: Int): Int {
    var sampleSize = 1
    while (
      width / sampleSize > UPLOAD_IMAGE_MAX_SIDE * 2 ||
      height / sampleSize > UPLOAD_IMAGE_MAX_SIDE * 2
    ) {
      sampleSize *= 2
    }
    return sampleSize.coerceAtLeast(1)
  }

  private fun decodeUploadBitmap(uriString: String): Bitmap? {
    val bounds = BitmapFactory.Options().apply {
      inJustDecodeBounds = true
    }
    openUploadInputStream(uriString).use { inputStream ->
      BitmapFactory.decodeStream(inputStream, null, bounds)
    }

    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      return null
    }

    val decodeOptions = BitmapFactory.Options().apply {
      inSampleSize = calculateImageSampleSize(bounds.outWidth, bounds.outHeight)
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }

    return openUploadInputStream(uriString).use { inputStream ->
      BitmapFactory.decodeStream(inputStream, null, decodeOptions)
    }
  }

  private fun scaleUploadBitmap(bitmap: Bitmap): Bitmap {
    val largestSide = max(bitmap.width, bitmap.height)
    if (largestSide <= UPLOAD_IMAGE_MAX_SIDE) {
      return bitmap
    }

    val scale = UPLOAD_IMAGE_MAX_SIDE.toFloat() / largestSide.toFloat()
    val width = max(1, (bitmap.width * scale).toInt())
    val height = max(1, (bitmap.height * scale).toInt())
    return Bitmap.createScaledBitmap(bitmap, width, height, true)
  }

  private fun compressedUploadFileName(fileName: String, index: Int): String {
    val baseName = fileName
      .substringBeforeLast('.', fileName)
      .replace(Regex("[^A-Za-z0-9._-]"), "_")
      .ifBlank { "upload-$index" }
    return "$baseName-compressed.jpg"
  }

  private fun writeCompressedUploadAttempt(
    bitmap: Bitmap,
    directory: File,
    outputName: String,
    quality: Int,
  ): File? {
    val outputFile = File(
      directory,
      "${System.currentTimeMillis()}-${Random.nextInt(1000, 9999)}-q$quality-$outputName",
    )

    return try {
      FileOutputStream(outputFile).use { outputStream ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream)
        outputStream.flush()
      }

      if (outputFile.length() > 0L) {
        outputFile
      } else {
        outputFile.delete()
        null
      }
    } catch (_: Exception) {
      outputFile.delete()
      null
    }
  }

  private fun maybeCompressImageForUpload(
    uriString: String,
    fileName: String,
    mimeType: String,
    index: Int,
  ): Pair<File, String>? {
    if (!isImageUpload(mimeType, fileName, uriString)) {
      return null
    }

    var decodedBitmap: Bitmap? = null
    var scaledBitmap: Bitmap? = null

    return try {
      val originalSize = resolveUploadFileSize(uriString)
      decodedBitmap = decodeUploadBitmap(uriString) ?: return null
      scaledBitmap = scaleUploadBitmap(decodedBitmap)

      val directory = File(reactApplicationContext.cacheDir, "compressed-uploads").apply {
        mkdirs()
      }
      cleanupOldCompressedUploads(directory)

      val outputName = compressedUploadFileName(fileName, index)
      var bestFile: File? = null

      for (quality in UPLOAD_IMAGE_JPEG_QUALITIES) {
        val attemptFile = writeCompressedUploadAttempt(
          scaledBitmap,
          directory,
          outputName,
          quality,
        ) ?: continue

        val currentBest = bestFile
        if (currentBest == null || attemptFile.length() < currentBest.length()) {
          currentBest?.delete()
          bestFile = attemptFile
        } else {
          attemptFile.delete()
        }

        if ((bestFile?.length() ?: Long.MAX_VALUE) <= UPLOAD_IMAGE_TARGET_BYTES) {
          break
        }
      }

      val resolvedBestFile = bestFile ?: return null
      if (originalSize > 0L && resolvedBestFile.length() >= originalSize) {
        resolvedBestFile.delete()
        return null
      }

      Pair(resolvedBestFile, outputName)
    } catch (_: Throwable) {
      null
    } finally {
      if (scaledBitmap != null && scaledBitmap != decodedBitmap) {
        scaledBitmap.recycle()
      }
      decodedBitmap?.recycle()
    }
  }

  private fun writeMultipartTextPart(
    outputStream: java.io.OutputStream,
    boundary: String,
    name: String,
    value: String,
  ) {
    val safeValue = value
    outputStream.write("--$boundary\r\n".toByteArray(Charsets.UTF_8))
    outputStream.write(
      "Content-Disposition: form-data; name=\"$name\"\r\n\r\n".toByteArray(Charsets.UTF_8),
    )
    outputStream.write(safeValue.toByteArray(Charsets.UTF_8))
    outputStream.write("\r\n".toByteArray(Charsets.UTF_8))
  }

  private fun writeMultipartFilePart(
    outputStream: java.io.OutputStream,
    boundary: String,
    fieldName: String,
    fileName: String,
    mimeType: String,
    uriString: String,
  ) {
    outputStream.write("--$boundary\r\n".toByteArray(Charsets.UTF_8))
    outputStream.write(
      "Content-Disposition: form-data; name=\"$fieldName\"; filename=\"$fileName\"\r\n"
        .toByteArray(Charsets.UTF_8),
    )
    outputStream.write("Content-Type: $mimeType\r\n\r\n".toByteArray(Charsets.UTF_8))

    openUploadInputStream(uriString).use { inputStream ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      while (true) {
        val bytesRead = inputStream.read(buffer)
        if (bytesRead <= 0) {
          break
        }
        outputStream.write(buffer, 0, bytesRead)
      }
    }

    outputStream.write("\r\n".toByteArray(Charsets.UTF_8))
  }

  @ReactMethod
  fun request(
    url: String,
    method: String,
    headersJson: String?,
    body: String?,
    timeoutMs: Int?,
    promise: Promise,
  ) {
    try {
      val resolvedTimeoutMs = (timeoutMs ?: 20000).coerceAtLeast(5000)
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = resolvedTimeoutMs
      connection.readTimeout = resolvedTimeoutMs
      connection.requestMethod = method.uppercase()
      connection.instanceFollowRedirects = true
      connection.doInput = true

      if (connection is HttpsURLConnection) {
        val sslContext = createSslContext()
        connection.sslSocketFactory = sslContext.socketFactory
        connection.hostnameVerifier = HttpsURLConnection.getDefaultHostnameVerifier()
      }

      applyHeaders(connection, headersJson)

      if (!body.isNullOrEmpty()) {
        connection.doOutput = true
        BufferedWriter(OutputStreamWriter(connection.outputStream, Charsets.UTF_8)).use { writer ->
          writer.write(body)
          writer.flush()
        }
      }

      val responseCode = connection.responseCode
      val bodyText =
        try {
          connection.inputStream?.bufferedReader()?.use { it.readText() } ?: ""
        } catch (error: Exception) {
          connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
        }

      val result = WritableNativeMap().apply {
        putInt("status", responseCode)
        putString("statusText", connection.responseMessage ?: "")
        putString("bodyText", bodyText)
        putString("url", connection.url?.toString() ?: url)
      }

      promise.resolve(result)
      connection.disconnect()
    } catch (error: Exception) {
      promise.reject("SECURE_API_ERROR", error.message, error)
    }
  }

  @ReactMethod
  fun downloadToCache(url: String, timeoutMs: Int?, promise: Promise) {
    var connection: HttpURLConnection? = null

    try {
      val normalizedUrl = url.trim()
      if (normalizedUrl.isBlank()) {
        throw IllegalArgumentException("Document URL is empty")
      }

      val targetFile = cacheFileForUrl(normalizedUrl)
      if (targetFile.exists() && targetFile.length() > 0) {
        promise.resolve(android.net.Uri.fromFile(targetFile).toString())
        return
      }

      val resolvedTimeoutMs = (timeoutMs ?: 20000).coerceAtLeast(5000)
      connection = openSecureConnection(normalizedUrl, resolvedTimeoutMs)
      connection.requestMethod = "GET"

      val responseCode = connection.responseCode
      if (responseCode !in 200..299) {
        throw IllegalStateException("Document download failed: HTTP $responseCode")
      }

      connection.inputStream.use { inputStream ->
        FileOutputStream(targetFile, false).use { outputStream ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          while (true) {
            val bytesRead = inputStream.read(buffer)
            if (bytesRead <= 0) {
              break
            }
            outputStream.write(buffer, 0, bytesRead)
          }
          outputStream.flush()
        }
      }

      promise.resolve(android.net.Uri.fromFile(targetFile).toString())
    } catch (error: Exception) {
      promise.reject("SECURE_DOWNLOAD_ERROR", error.message, error)
    } finally {
      connection?.disconnect()
    }
  }

  @ReactMethod
  fun multipartRequest(
    url: String,
    method: String,
    headersJson: String?,
    fieldsJson: String?,
    filesJson: String?,
    timeoutMs: Int?,
    promise: Promise,
  ) {
    try {
      val resolvedTimeoutMs = (timeoutMs ?: 20000).coerceAtLeast(5000)
      val boundary = "----LabmateBoundary${System.currentTimeMillis()}${Random.nextInt(1000, 9999)}"
      val connection = URL(url).openConnection() as HttpURLConnection
      connection.connectTimeout = resolvedTimeoutMs
      connection.readTimeout = resolvedTimeoutMs
      connection.requestMethod = method.uppercase()
      connection.instanceFollowRedirects = true
      connection.doInput = true
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")

      if (connection is HttpsURLConnection) {
        val sslContext = createSslContext()
        connection.sslSocketFactory = sslContext.socketFactory
        connection.hostnameVerifier = HttpsURLConnection.getDefaultHostnameVerifier()
      }

      applyHeaders(connection, headersJson)

      val fields = JSONObject(if (fieldsJson.isNullOrBlank()) "{}" else fieldsJson)
      val files = org.json.JSONArray(if (filesJson.isNullOrBlank()) "[]" else filesJson)

      connection.outputStream.use { outputStream ->
        val fieldKeys = fields.keys()
        while (fieldKeys.hasNext()) {
          val fieldName = fieldKeys.next()
          val fieldValue = fields.optString(fieldName, "")
          writeMultipartTextPart(outputStream, boundary, fieldName, fieldValue)
        }

        for (index in 0 until files.length()) {
          val file = files.optJSONObject(index) ?: continue
          val fieldName = file.optString("fieldName", "").trim()
          val uriString = file.optString("uri", "").trim()
          val fileName = file.optString("name", "upload-$index")
          val mimeType = file.optString("type", "application/octet-stream")

          if (fieldName.isBlank() || uriString.isBlank()) {
            continue
          }

          val compressedImage = maybeCompressImageForUpload(
            uriString,
            fileName,
            mimeType,
            index,
          )
          val uploadUriString =
            compressedImage?.first?.let { Uri.fromFile(it).toString() } ?: uriString
          val uploadFileName = compressedImage?.second ?: fileName
          val uploadMimeType = if (compressedImage != null) "image/jpeg" else mimeType

          writeMultipartFilePart(
            outputStream,
            boundary,
            fieldName,
            uploadFileName,
            uploadMimeType,
            uploadUriString,
          )
        }

        outputStream.write("--$boundary--\r\n".toByteArray(Charsets.UTF_8))
        outputStream.flush()
      }

      val responseCode = connection.responseCode
      val bodyText =
        try {
          connection.inputStream?.bufferedReader()?.use { it.readText() } ?: ""
        } catch (error: Exception) {
          connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
        }

      val result = WritableNativeMap().apply {
        putInt("status", responseCode)
        putString("statusText", connection.responseMessage ?: "")
        putString("bodyText", bodyText)
        putString("url", connection.url?.toString() ?: url)
      }

      promise.resolve(result)
      connection.disconnect()
    } catch (error: Exception) {
      promise.reject("SECURE_API_MULTIPART_ERROR", error.message, error)
    }
  }
}
