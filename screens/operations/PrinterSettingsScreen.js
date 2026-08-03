import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  NativeModules,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../styles/appStyles';

const {PrinterModule} = NativeModules;

const SAVED_PRINTER_KEY = '@homecollection/default_printer';

const requestBluetoothPermissions = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Platform.Version >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);

    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ].every(permission => results[permission] === PermissionsAndroid.RESULTS.GRANTED);
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
};

const parseSavedPrinter = value => {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(value);
    return parsedValue?.address ? parsedValue : null;
  } catch {
    return null;
  }
};

export default function PrinterSettingsScreen() {
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const [loadingAction, setLoadingAction] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const canUsePrinter = Boolean(PrinterModule);
  const selectedPrinterLabel = useMemo(
    () =>
      selectedPrinter
        ? `${selectedPrinter.name || 'Bluetooth Printer'} (${selectedPrinter.address})${
            selectedPrinter.transport ? ` • ${selectedPrinter.transport}` : ''
          }`
        : 'No printer selected',
    [selectedPrinter],
  );

  useEffect(() => {
    AsyncStorage.getItem(SAVED_PRINTER_KEY)
      .then(value => {
        const savedPrinter = parseSavedPrinter(value);
        if (savedPrinter) {
          setSelectedPrinter(savedPrinter);
        }
      })
      .catch(() => {});
  }, []);

  const runPrinterAction = async (actionType, action) => {
    if (loadingAction) {
      return;
    }

    try {
      setLoadingAction(actionType);
      setStatusMessage('');
      await action();
    } catch (error) {
      setStatusMessage(error?.message || 'Printer action failed.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleScanPrinters = () =>
    runPrinterAction('scan', async () => {
      if (!canUsePrinter || !PrinterModule?.getPairedBluetoothPrinters) {
        setStatusMessage('Printer module is not available in this APK build.');
        return;
      }

      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) {
        setStatusMessage('Bluetooth permission is required to list printers.');
        return;
      }

      const pairedPrinters = await PrinterModule.getPairedBluetoothPrinters();
      setPrinters(Array.isArray(pairedPrinters) ? pairedPrinters : []);
      setStatusMessage(
        pairedPrinters?.length
          ? 'Paired printers loaded. Select your M58BT-L printer.'
          : 'No paired Bluetooth printer found. Pair printer from phone Bluetooth settings first.',
      );
    });

  const handleSelectPrinter = printer =>
    runPrinterAction(`select-${printer.address}`, async () => {
      setSelectedPrinter(printer);
      await AsyncStorage.setItem(SAVED_PRINTER_KEY, JSON.stringify(printer));
      setStatusMessage('Default printer saved.');
    });

  const runPrint = (actionType, printMethod, successMessage) =>
    runPrinterAction(actionType, async () => {
      if (!selectedPrinter?.address) {
        setStatusMessage('Select a printer first.');
        return;
      }

      const hasPermission = await requestBluetoothPermissions();
      if (!hasPermission) {
        setStatusMessage('Bluetooth permission is required before printing.');
        return;
      }

      await PrinterModule[printMethod](
        selectedPrinter.address,
        selectedPrinter.transport || '',
      );
      setStatusMessage(successMessage);
    });

  return (
    <View style={localStyles.screen}>
      <View style={localStyles.headerCard}>
        <View style={localStyles.headerIcon}>
          <Ionicons name="print-outline" size={28} color={BRAND.primary} />
        </View>
        <Text style={localStyles.eyebrow}>Printer Setup</Text>
        <Text style={localStyles.title}>M58BT-L Label Printer</Text>
        <Text style={localStyles.description}>
          Pair the printer once, save it as default, then print a test page to
          verify label alignment.
        </Text>
      </View>

      <View style={localStyles.card}>
        <Text style={localStyles.cardTitle}>Default Printer</Text>
        <Text style={localStyles.cardText}>{selectedPrinterLabel}</Text>
        <TouchableOpacity
          activeOpacity={0.86}
          style={localStyles.primaryButton}
          onPress={handleScanPrinters}
          disabled={Boolean(loadingAction)}>
          {loadingAction === 'scan' ? (
            <ActivityIndicator color={BRAND.surface} size="small" />
          ) : (
            <Ionicons name="bluetooth-outline" size={18} color={BRAND.surface} />
          )}
          <Text style={localStyles.primaryButtonText}>
            {loadingAction === 'scan' ? 'Scanning...' : 'Scan Paired Printers'}
          </Text>
        </TouchableOpacity>
      </View>

      {printers.length ? (
        <View style={localStyles.card}>
          <Text style={localStyles.cardTitle}>Paired Printers</Text>
          {printers.map(printer => {
            const isSelected = selectedPrinter?.address === printer.address;
            const isSelecting = loadingAction === `select-${printer.address}`;

            return (
              <TouchableOpacity
                key={printer.address}
                activeOpacity={0.86}
                style={[
                  localStyles.printerRow,
                  isSelected && localStyles.printerRowSelected,
                ]}
                onPress={() => handleSelectPrinter(printer)}
                disabled={Boolean(loadingAction)}>
                <View style={localStyles.printerTextWrap}>
                  <Text style={localStyles.printerName}>
                    {printer.name || 'Bluetooth Printer'}
                  </Text>
                  <Text style={localStyles.printerAddress}>{printer.address}</Text>
                  {printer.transport ? (
                    <Text style={localStyles.printerTransport}>
                      {printer.transport}
                    </Text>
                  ) : null}
                </View>
                {isSelecting ? (
                  <ActivityIndicator color={BRAND.primary} size="small" />
                ) : (
                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? BRAND.success : BRAND.muted}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={localStyles.card}>
        <Text style={localStyles.cardTitle}>Test Print</Text>
        <Text style={localStyles.cardText}>
          Print one fixed sample label to verify printer connection and alignment.
        </Text>
        <TouchableOpacity
          activeOpacity={0.86}
          style={[
            localStyles.secondaryButton,
            !selectedPrinter && localStyles.buttonDisabled,
          ]}
          onPress={() =>
            runPrint(
              'test-page',
              'printSampleTubeLabel',
              'Test page printed successfully.',
            )
          }
          disabled={Boolean(loadingAction) || !selectedPrinter}>
          {loadingAction === 'test-page' ? (
            <ActivityIndicator color={BRAND.primary} size="small" />
          ) : (
            <Ionicons name="barcode-outline" size={18} color={BRAND.primary} />
          )}
          <Text style={localStyles.secondaryButtonText}>
            {loadingAction === 'test-page' ? 'Printing...' : 'Print Test Page'}
          </Text>
        </TouchableOpacity>
      </View>

      {statusMessage ? (
        <Text style={localStyles.statusText}>{statusMessage}</Text>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  screen: {
    gap: 14,
  },
  headerCard: {
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    borderColor: BRAND.border,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: '#EAF3FF',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    marginBottom: 10,
    width: 44,
  },
  eyebrow: {
    color: BRAND.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: BRAND.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 4,
    textAlign: 'center',
  },
  description: {
    color: BRAND.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  card: {
    backgroundColor: BRAND.surface,
    borderColor: BRAND.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  cardTitle: {
    color: BRAND.text,
    fontSize: 16,
    fontWeight: '900',
  },
  cardText: {
    color: BRAND.muted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: BRAND.primary,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: BRAND.surface,
    fontSize: 14,
    fontWeight: '900',
  },
  printerRow: {
    alignItems: 'center',
    borderColor: BRAND.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 12,
  },
  printerRowSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#86EFAC',
  },
  printerTextWrap: {
    flex: 1,
  },
  printerName: {
    color: BRAND.text,
    fontSize: 14,
    fontWeight: '900',
  },
  printerAddress: {
    color: BRAND.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  printerTransport: {
    color: BRAND.primary,
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: BRAND.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  statusText: {
    color: BRAND.muted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
});
