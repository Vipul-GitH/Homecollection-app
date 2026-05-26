package com.homecollection

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
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

class SecureApiModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

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
        reactApplicationContext.contentResolver.openInputStream(android.net.Uri.parse(uriString))
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

          writeMultipartFilePart(
            outputStream,
            boundary,
            fieldName,
            fileName,
            mimeType,
            uriString,
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
