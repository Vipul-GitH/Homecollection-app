package com.homecollection

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import com.caysn.autoreplyprint.AutoReplyPrint
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.sun.jna.Pointer
import com.sun.jna.ptr.IntByReference
import java.nio.charset.Charset
import java.util.Collections
import java.util.UUID

class PrinterModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "PrinterModule"

  @ReactMethod
  fun getPairedBluetoothPrinters(promise: Promise) {
    try {
      val adapter = getBluetoothAdapter()
      if (adapter == null) {
        promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not available on this device.")
        return
      }

      if (!adapter.isEnabled) {
        promise.reject("BLUETOOTH_DISABLED", "Bluetooth is turned off.")
        return
      }

      if (!hasBluetoothConnectPermission()) {
        promise.reject(
          "BLUETOOTH_PERMISSION_REQUIRED",
          "Bluetooth permission is required before listing printers.",
        )
        return
      }

      val discoveredPrinters = discoverPrintersWithSdk()
      val seenAddresses = mutableSetOf<String>()
      val printers = WritableNativeArray()
      discoveredPrinters.forEach { printer ->
        if (printer.address.isNotBlank() && seenAddresses.add(printer.address)) {
          val map = WritableNativeMap()
          map.putString("name", printer.name.ifBlank { "Bluetooth Printer" })
          map.putString("address", printer.address)
          map.putString("transport", printer.transport)
          printers.pushMap(map)
        }
      }

      getBondedDevices(adapter).forEach { device ->
        val address = device.address ?: ""
        if (address.isNotBlank() && seenAddresses.add(address)) {
          val map = WritableNativeMap()
          map.putString("name", device.name ?: "Bluetooth Printer")
          map.putString("address", address)
          map.putString("transport", "ANDROID_BONDED")
          printers.pushMap(map)
        }
      }

      promise.resolve(printers)
    } catch (error: Exception) {
      promise.reject("PRINTER_LIST_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun printTestLabel(address: String, transport: String?, promise: Promise) {
    printLabel(
      address = address,
      transport = transport,
      title = "HOME COLLECTION",
      patientLine = "Printer Test Label",
      tubeLine = "M58BT-L | 58mm Label",
      barcode = "HC-TEST-0001",
      promise = promise,
    )
  }

  @ReactMethod
  fun printPosModeTest(address: String, transport: String?, promise: Promise) {
    printRawCommand(
      address = address,
      transport = transport,
      command = buildPosTestCommand(),
      successMessage = "POS test command sent",
      promise = promise,
    )
  }

  @ReactMethod
  fun printTsplModeTest(address: String, transport: String?, promise: Promise) {
    printRawCommand(
      address = address,
      transport = transport,
      command = buildTsplLabelCommand(
        title = "TSPL TEST",
        patientLine = "HOME COLLECTION",
        tubeLine = "MODE CHECK",
        barcode = "HC-TSPL-001",
      ),
      successMessage = "TSPL test command sent",
      promise = promise,
    )
  }

  @ReactMethod
  fun printCpclModeTest(address: String, transport: String?, promise: Promise) {
    printRawCommand(
      address = address,
      transport = transport,
      command = buildCpclTestCommand(),
      successMessage = "CPCL test command sent",
      promise = promise,
    )
  }

  @ReactMethod
  fun printSampleTubeLabel(address: String, transport: String?, promise: Promise) {
    printLabel(
      address = address,
      transport = transport,
      title = "BK6419 | SAMPLE",
      patientLine = "Patient: Rohit",
      tubeLine = "Tube: Serum",
      barcode = "BK6419-SERUM-01",
      promise = promise,
    )
  }

  @ReactMethod
  fun printTubeLabels(address: String, transport: String?, labels: ReadableArray, promise: Promise) {
    val normalizedAddress = address.trim()
    if (normalizedAddress.isBlank()) {
      promise.reject("PRINTER_ADDRESS_REQUIRED", "Select a printer first.")
      return
    }

    if (!hasBluetoothConnectPermission()) {
      promise.reject(
        "BLUETOOTH_PERMISSION_REQUIRED",
        "Bluetooth permission is required before printing.",
      )
      return
    }

    if (labels.size() <= 0) {
      promise.reject("PRINTER_LABELS_REQUIRED", "No tube labels available to print.")
      return
    }

    Thread {
      var connection: PrinterConnection? = null
      try {
        logDebug("printTubeLabels:start address=$normalizedAddress transport=${transport.orEmpty()} count=${labels.size()}")
        connection = openBluetoothPrinter(normalizedAddress, transport)
        if (connection == null) {
          logDebug("printTubeLabels:connect_failed")
          promise.reject(
            "PRINTER_CONNECT_FAILED",
            "Unable to connect to printer by Bluetooth Classic or BLE.",
          )
          return@Thread
        }

        val batchCommand = StringBuilder(buildPatientTubeLabelSetupCommand())
        for (index in 0 until labels.size()) {
          val labelMap = labels.getMap(index)
          val command =
            buildPatientTubeLabelCommand(
              patientName = labelMap?.getString("patientName").orEmpty(),
              ageGender = labelMap?.getString("ageGender").orEmpty(),
              tubeName = labelMap?.getString("tubeName").orEmpty(),
              barcode = labelMap?.getString("barcode").orEmpty(),
              dateText = labelMap?.getString("dateText").orEmpty(),
              phleboName = labelMap?.getString("phleboName").orEmpty(),
            )
          logDebug("printTubeLabels:write_label index=${index + 1}/${labels.size()}")
          batchCommand.append(command)
        }

        writeRawCommand(connection, batchCommand.toString())

        logDebug("printTubeLabels:write_success count=${labels.size()} mode=${connection.mode}")
        promise.resolve("Tube labels printed: ${labels.size()}")
      } catch (error: Exception) {
        logDebug("printTubeLabels:error ${error.javaClass.simpleName}: ${error.message}")
        promise.reject("PRINTER_PRINT_FAILED", error.message, error)
      } finally {
        closeConnection(connection)
      }
    }.start()
  }

  private fun printLabel(
    address: String,
    transport: String?,
    title: String,
    patientLine: String,
    tubeLine: String,
    barcode: String,
    promise: Promise,
  ) {
    val normalizedAddress = address.trim()
    if (normalizedAddress.isBlank()) {
      promise.reject("PRINTER_ADDRESS_REQUIRED", "Select a printer first.")
      return
    }

    if (!hasBluetoothConnectPermission()) {
      promise.reject(
        "BLUETOOTH_PERMISSION_REQUIRED",
        "Bluetooth permission is required before printing.",
      )
      return
    }

    Thread {
      var connection: PrinterConnection? = null
      try {
        logDebug("printLabel:start address=$normalizedAddress transport=${transport.orEmpty()} title=$title")
        connection = openBluetoothPrinter(normalizedAddress, transport)
        if (connection == null) {
          logDebug("printLabel:connect_failed")
          promise.reject(
            "PRINTER_CONNECT_FAILED",
            "Unable to connect to printer by Bluetooth Classic or BLE.",
          )
          return@Thread
        }
        logDebug("printLabel:connected mode=${connection.mode}")

        val command = buildTsplLabelCommand(title, patientLine, tubeLine, barcode)
        writeRawCommand(connection, command)
        logDebug("printLabel:write_success mode=${connection.mode}")
        promise.resolve("Print command sent by ${connection.mode}")
      } catch (error: Exception) {
        logDebug("printLabel:error ${error.javaClass.simpleName}: ${error.message}")
        promise.reject("PRINTER_PRINT_FAILED", error.message, error)
      } finally {
        closeConnection(connection)
      }
    }.start()
  }

  private fun printRawCommand(
    address: String,
    transport: String?,
    command: String,
    successMessage: String,
    promise: Promise,
  ) {
    val normalizedAddress = address.trim()
    if (normalizedAddress.isBlank()) {
      promise.reject("PRINTER_ADDRESS_REQUIRED", "Select a printer first.")
      return
    }

    if (!hasBluetoothConnectPermission()) {
      promise.reject(
        "BLUETOOTH_PERMISSION_REQUIRED",
        "Bluetooth permission is required before printing.",
      )
      return
    }

    Thread {
      var connection: PrinterConnection? = null
      try {
        logDebug("printRawCommand:start address=$normalizedAddress transport=${transport.orEmpty()} bytes=${command.toByteArray(PRINTER_CHARSET).size}")
        connection = openBluetoothPrinter(normalizedAddress, transport)
        if (connection == null) {
          logDebug("printRawCommand:connect_failed")
          promise.reject(
            "PRINTER_CONNECT_FAILED",
            "Unable to connect to printer by Bluetooth Classic or BLE.",
          )
          return@Thread
        }

        logDebug("printRawCommand:connected mode=${connection.mode}")
        writeRawCommand(connection, command)
        logDebug("printRawCommand:write_success mode=${connection.mode}")
        promise.resolve("$successMessage by ${connection.mode}")
      } catch (error: Exception) {
        logDebug("printRawCommand:error ${error.javaClass.simpleName}: ${error.message}")
        promise.reject("PRINTER_PRINT_FAILED", error.message, error)
      } finally {
        closeConnection(connection)
      }
    }.start()
  }

  private fun writeRawCommand(connection: PrinterConnection, command: String) {
    val bytes = command.toByteArray(PRINTER_CHARSET)
    logDebug("writeRawCommand:bytes=${bytes.size} preview=${command.take(120).replace("\r", "\\r").replace("\n", "\\n")}")
    val written =
      when {
        connection.handle != null ->
          AutoReplyPrint.INSTANCE.CP_Port_Write(connection.handle, bytes, bytes.size, 10000)
        connection.socket != null -> {
          connection.socket.outputStream.write(bytes)
          connection.socket.outputStream.flush()
          bytes.size
        }
        else -> 0
      }
    logDebug("writeRawCommand:written=$written expected=${bytes.size}")
    if (written != bytes.size) {
      throw IllegalStateException("Printer connected but command write failed.")
    }
    Thread.sleep(120)
  }

  private fun buildPosTestCommand(): String =
    "\u001B@\u001Ba\u0001HOME COLLECTION\r\nPOS MODE TEST\r\nM58BT-L\r\n\r\n\r\n"

  private fun buildCpclTestCommand(): String =
    "! 0 200 200 240 1\r\n" +
      "CENTER\r\n" +
      "TEXT 4 0 0 20 CPCL TEST\r\n" +
      "TEXT 4 0 0 55 HOME COLLECTION\r\n" +
      "TEXT 4 0 0 90 MODE CHECK\r\n" +
      "BARCODE 128 1 1 60 20 125 HC-CPCL-001\r\n" +
      "FORM\r\n" +
      "PRINT\r\n"

  private fun buildTsplLabelCommand(
    title: String,
    patientLine: String,
    tubeLine: String,
    barcode: String,
  ): String {
    val safeTitle = toTsplText(title, 24)
    val safePatientLine = toTsplText(patientLine, 32)
    val safeTubeLine = toTsplText(tubeLine, 32)
    val safeBarcode = toTsplText(barcode, 40)

    return """
      SIZE 50 mm,25 mm
      GAP 2 mm,0 mm
      SPEED 3
      DENSITY 8
      DIRECTION 0
      REFERENCE 0,0
      CLS
      TEXT 20,24,"0",0,1,1,"$safeTitle"
      TEXT 20,62,"0",0,1,1,"$safePatientLine"
      TEXT 20,100,"0",0,1,1,"$safeTubeLine"
      TEXT 20,138,"0",0,1,1,"$safeBarcode"
      PRINT 1,1
    """.trimIndent().replace("\n", "\r\n") + "\r\n"
  }

  private fun buildPatientTubeLabelCommand(
    patientName: String,
    ageGender: String,
    tubeName: String,
    barcode: String,
    dateText: String,
    phleboName: String,
  ): String {
    val safePatientName = toTsplText(patientName.uppercase(), 24)
    val safeAgeGender = toTsplText(ageGender, 28)
    val safeTubeName = toTsplText(tubeName, 22)
    val safeBarcode = toTsplBarcode(barcode)
    val safeBarcodeText = safeBarcode
    val safeDateText = toTsplText(dateText, 12)
    val safePhleboName = toTsplText(phleboName.uppercase(), 12)
    val phleboTextCommand =
      if (safePhleboName.isNotBlank()) {
        "TEXT 362,176,\"0\",270,1,1,\"$safePhleboName\""
      } else {
        ""
      }
    val nameX = 24
    val barcodeX = 24
    val barcodeTextX = 24
    val detailX = 24

    return """
      CLS
      TEXT $nameX,16,"1",0,1,1,"$safePatientName"
      BARCODE $barcodeX,42,"128",46,0,0,2,2,"$safeBarcode"
      TEXT $barcodeTextX,92,"1",0,1,1,"$safeBarcodeText"
      TEXT $detailX,120,"1",0,1,1,"$safeAgeGender"
      TEXT $detailX,146,"1",0,1,1,"$safeDateText $safeTubeName"
      $phleboTextCommand
      PRINT 1,1
    """.trimIndent().replace("\n", "\r\n") + "\r\n"
  }

  private fun buildPatientTubeLabelSetupCommand(): String =
    """
      SIZE 50 mm,25 mm
      GAP 2 mm,0 mm
      SPEED 5
      DENSITY 10
      DIRECTION 0
      REFERENCE 0,0
      GAPDETECT
    """.trimIndent().replace("\n", "\r\n") + "\r\n"

  private fun toTsplText(value: String, maxLength: Int): String =
    value
      .replace("\"", "'")
      .replace(Regex("[\\r\\n\\t]"), " ")
      .take(maxLength)

  private fun toTsplBarcode(value: String): String {
    val normalizedValue = value.filter { it.isLetterOrDigit() || it == '-' }
    return (normalizedValue.ifBlank { "0000000000" }).take(32)
  }

  private fun openBluetoothPrinter(address: String, transport: String?): PrinterConnection? {
    val normalizedTransport = transport.orEmpty().uppercase()
    run {
      logDebug("openBluetoothPrinter:try_android_socket_first address=$address transport=$normalizedTransport")
      val socket = tryOpenAndroidSppSocket(address)
      if (socket != null) {
        logDebug("openBluetoothPrinter:android_socket_opened_first")
        return PrinterConnection(
          handle = null,
          socket = socket,
          mode = "Android Bluetooth Socket",
        )
      }
      logDebug("openBluetoothPrinter:android_socket_first_failed")
      if (normalizedTransport.contains("BT") || normalizedTransport.contains("BONDED")) {
        return null
      }
    }

    val modes =
      when {
        normalizedTransport.contains("BLE") -> listOf(ConnectionMode.BLE, ConnectionMode.SPP)
        normalizedTransport.contains("BT") -> listOf(ConnectionMode.SPP, ConnectionMode.BLE)
        else -> listOf(ConnectionMode.SPP, ConnectionMode.BLE)
      }

    modes.forEach { mode ->
      val label = if (mode == ConnectionMode.SPP) "Bluetooth Classic" else "Bluetooth BLE"
      logDebug("openBluetoothPrinter:try_${mode.name.lowercase()} address=$address transport=$normalizedTransport")
      val handle = tryOpenBluetoothPrinter(address, mode)
      if (handle != null) {
        logDebug("openBluetoothPrinter:${mode.name.lowercase()}_opened")
        return PrinterConnection(
          handle = handle,
          socket = null,
          mode = label,
        )
      }
    }

    logDebug("openBluetoothPrinter:failed_all")
    if (normalizedTransport.contains("BLE")) {
      logDebug("openBluetoothPrinter:try_android_socket_fallback address=$address")
      val socket = tryOpenAndroidSppSocket(address)
      if (socket != null) {
        logDebug("openBluetoothPrinter:android_socket_opened")
        return PrinterConnection(
          handle = null,
          socket = socket,
          mode = "Android Bluetooth Socket",
        )
      }

      logDebug("openBluetoothPrinter:android_socket_failed")
    }
    return null
  }

  private fun tryOpenBluetoothPrinter(address: String, mode: ConnectionMode): Pointer? {
    listOf(1, 0).forEach { autoReplyFlag ->
      val handle =
      try {
        when (mode) {
          ConnectionMode.SPP -> AutoReplyPrint.INSTANCE.CP_Port_OpenBtSpp(address, autoReplyFlag)
          ConnectionMode.BLE -> AutoReplyPrint.INSTANCE.CP_Port_OpenBtBle(address, autoReplyFlag)
        }
      } catch (error: Exception) {
        logDebug("tryOpenBluetoothPrinter:${mode.name}:flag=$autoReplyFlag open_exception ${error.javaClass.simpleName}: ${error.message}")
        null
      }

      if (handle == null || handle == Pointer.NULL) {
        logDebug("tryOpenBluetoothPrinter:${mode.name}:flag=$autoReplyFlag handle_null")
        return@forEach
      }

      val isOpened =
        try {
          AutoReplyPrint.INSTANCE.CP_Port_IsOpened(handle)
        } catch (_: Exception) {
          logDebug("tryOpenBluetoothPrinter:${mode.name}:flag=$autoReplyFlag is_open_exception")
          false
        }

      logDebug("tryOpenBluetoothPrinter:${mode.name}:flag=$autoReplyFlag isOpened=$isOpened")
      if (isOpened) {
        return handle
      }

      try {
        AutoReplyPrint.INSTANCE.CP_Port_Close(handle)
      } catch (_: Exception) {
        // Ignore close errors for failed connection attempts.
      }
    }

    return null
  }

  @SuppressLint("MissingPermission")
  private fun tryOpenAndroidSppSocket(address: String): BluetoothSocket? {
    return try {
      val adapter = getBluetoothAdapter()
      if (adapter == null) {
        logDebug("tryOpenAndroidSppSocket:adapter_null")
        return null
      }

      adapter.cancelDiscovery()
      val device = adapter.getRemoteDevice(address)
      val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
      socket.connect()
      logDebug("tryOpenAndroidSppSocket:connected")
      socket
    } catch (error: Exception) {
      logDebug("tryOpenAndroidSppSocket:error ${error.javaClass.simpleName}: ${error.message}")
      null
    }
  }

  private fun closeConnection(connection: PrinterConnection?) {
    if (connection?.handle != null) {
      try {
        AutoReplyPrint.INSTANCE.CP_Port_Close(connection.handle)
      } catch (_: Exception) {
        // Ignore close errors; the print result has already been reported.
      }
    }

    if (connection?.socket != null) {
      try {
        connection.socket.close()
      } catch (_: Exception) {
        // Ignore close errors; the print result has already been reported.
      }
    }
  }

  private fun logDebug(message: String) {
    Log.d(LOG_TAG, message)
  }

  private fun getBluetoothAdapter(): BluetoothAdapter? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
      val manager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
      return manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
    }

    return BluetoothAdapter.getDefaultAdapter()
  }

  @SuppressLint("MissingPermission")
  private fun getBondedDevices(adapter: BluetoothAdapter) = adapter.bondedDevices.orEmpty()

  private fun discoverPrintersWithSdk(): List<DiscoveredPrinter> {
    val printers = Collections.synchronizedList(mutableListOf<DiscoveredPrinter>())

    try {
      val btCallback =
        AutoReplyPrint.CP_OnBluetoothDeviceDiscovered_Callback { deviceName, deviceAddress, _ ->
          logDebug("sdkEnum:BT name=$deviceName address=$deviceAddress")
          if (!deviceAddress.isNullOrBlank()) {
            printers.add(
              DiscoveredPrinter(
                name = deviceName ?: "Bluetooth Printer",
                address = deviceAddress,
                transport = "SDK_BT",
              ),
            )
          }
        }
      AutoReplyPrint.INSTANCE.CP_Port_EnumBtDevice(4000, IntByReference(0), btCallback, null)
    } catch (error: Exception) {
      logDebug("sdkEnum:BT_error ${error.javaClass.simpleName}: ${error.message}")
    }

    try {
      val bleCallback =
        AutoReplyPrint.CP_OnBluetoothDeviceDiscovered_Callback { deviceName, deviceAddress, _ ->
          logDebug("sdkEnum:BLE name=$deviceName address=$deviceAddress")
          if (!deviceAddress.isNullOrBlank()) {
            printers.add(
              DiscoveredPrinter(
                name = deviceName ?: "BLE Printer",
                address = deviceAddress,
                transport = "SDK_BLE",
              ),
            )
          }
        }
      AutoReplyPrint.INSTANCE.CP_Port_EnumBleDevice(5000, IntByReference(0), bleCallback, null)
    } catch (error: Exception) {
      logDebug("sdkEnum:BLE_error ${error.javaClass.simpleName}: ${error.message}")
    }

    return printers.toList()
  }

  private fun hasBluetoothConnectPermission(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      reactContext.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
      PackageManager.PERMISSION_GRANTED

  companion object {
    private const val LOG_TAG = "HCPrinterModule"
    private val PRINTER_CHARSET: Charset = Charsets.US_ASCII
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  }

  private data class PrinterConnection(
    val handle: Pointer?,
    val socket: BluetoothSocket?,
    val mode: String,
  )

  private data class DiscoveredPrinter(
    val name: String,
    val address: String,
    val transport: String,
  )

  private enum class ConnectionMode {
    SPP,
    BLE,
  }
}
