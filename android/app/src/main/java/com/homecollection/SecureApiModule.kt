package com.homecollection

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import org.json.JSONObject
import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

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
}
