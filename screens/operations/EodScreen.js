import React, {useState} from 'react';
import {ActivityIndicator, Alert, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../styles/appStyles';
import PrinterSettingsScreen from './PrinterSettingsScreen';

export default function EodScreen({
  styles,
  onClearAppCache,
  onClearAllAppData,
}) {
  const [activeToolTab, setActiveToolTab] = useState('maintenance');
  const [storageAction, setStorageAction] = useState('');
  const [storageMessage, setStorageMessage] = useState('');

  const runStorageAction = async ({type, action, successMessage}) => {
    if (!action || storageAction) {
      return;
    }

    try {
      setStorageAction(type);
      setStorageMessage('');
      await action();
      setStorageMessage(successMessage);
    } catch (error) {
      setStorageMessage(error?.message || 'Unable to clear app data right now.');
    } finally {
      setStorageAction('');
    }
  };

  const confirmClearCache = () => {
    Alert.alert(
      'Clear App Cache?',
      'Saved appointment lists, booking details, and draft screen data will be removed. Pending offline actions will stay safe.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear Cache',
          style: 'destructive',
          onPress: () =>
            runStorageAction({
              type: 'cache',
              action: onClearAppCache,
              successMessage: 'App cache cleared.',
            }),
        },
      ],
    );
  };

  const confirmClearAllData = () => {
    Alert.alert(
      'Clear All Local Data?',
      'This clears cached appointments, drafts, pending offline actions, and logs you out.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: () =>
            runStorageAction({
              type: 'data',
              action: onClearAllAppData,
              successMessage: 'All local app data cleared.',
            }),
        },
      ],
    );
  };

  const renderActionIcon = actionType =>
    storageAction === actionType ? (
      <ActivityIndicator color={BRAND.surface} size="small" />
    ) : (
      <Ionicons
        name={actionType === 'cache' ? 'trash-outline' : 'warning-outline'}
        size={18}
        style={styles.storageActionIcon}
      />
    );

  return (
    <View style={styles.storageToolsScreen}>
      <View style={localStyles.toolTabs}>
        {[
          {key: 'maintenance', label: 'Maintenance', icon: 'server-outline'},
          {key: 'printer', label: 'Printer', icon: 'print-outline'},
        ].map(tab => {
          const isActive = activeToolTab === tab.key;

          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.86}
              style={[localStyles.toolTabButton, isActive && localStyles.toolTabButtonActive]}
              onPress={() => setActiveToolTab(tab.key)}>
              <Ionicons
                name={tab.icon}
                size={16}
                style={[
                  localStyles.toolTabIcon,
                  isActive && localStyles.toolTabIconActive,
                ]}
              />
              <Text
                style={[
                  localStyles.toolTabText,
                  isActive && localStyles.toolTabTextActive,
                ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeToolTab === 'printer' ? (
        <PrinterSettingsScreen />
      ) : (
        <>
      <View style={styles.storageToolsHeaderCard}>
        <View style={styles.storageToolsIconWrap}>
          <Ionicons name="server-outline" size={28} style={styles.storageToolsIcon} />
        </View>
        <Text style={styles.storageToolsEyebrow}>App Maintenance</Text>
        <Text style={styles.storageToolsTitle}>Storage & Data</Text>
        <Text style={styles.storageToolsText}>
          Clear local saved data when old appointments, drafts, or cached screens
          need a fresh start.
        </Text>
      </View>

      <View style={styles.storageActionCard}>
        <View style={styles.storageActionCopy}>
          <Text style={styles.storageActionTitle}>Clear App Cache</Text>
          <Text style={styles.storageActionText}>
            Removes cached appointment lists, booking details, and local drafts.
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.86}
          style={[
            styles.storageActionButton,
            storageAction && styles.storageActionButtonDisabled,
          ]}
          onPress={confirmClearCache}
          disabled={Boolean(storageAction)}>
          {renderActionIcon('cache')}
          <Text style={styles.storageActionButtonText}>
            {storageAction === 'cache' ? 'Clearing...' : 'Clear Cache'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.storageActionCard, styles.storageDangerCard]}>
        <View style={styles.storageActionCopy}>
          <Text style={styles.storageActionTitle}>Clear All Local Data</Text>
          <Text style={styles.storageActionText}>
            Clears cache, pending offline actions, local drafts, and login data.
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.86}
          style={[
            styles.storageActionButton,
            styles.storageDangerButton,
            storageAction && styles.storageActionButtonDisabled,
          ]}
          onPress={confirmClearAllData}
          disabled={Boolean(storageAction)}>
          {renderActionIcon('data')}
          <Text style={styles.storageActionButtonText}>
            {storageAction === 'data' ? 'Clearing...' : 'Clear Data'}
          </Text>
        </TouchableOpacity>
      </View>

      {storageMessage ? (
        <Text style={styles.storageStatusText}>{storageMessage}</Text>
      ) : null}
        </>
      )}
    </View>
  );
}

const localStyles = {
  toolTabs: {
    backgroundColor: BRAND.surface,
    borderColor: BRAND.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 6,
  },
  toolTabButton: {
    alignItems: 'center',
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  toolTabButtonActive: {
    backgroundColor: BRAND.primary,
  },
  toolTabIcon: {
    color: BRAND.muted,
  },
  toolTabIconActive: {
    color: BRAND.surface,
  },
  toolTabText: {
    color: BRAND.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  toolTabTextActive: {
    color: BRAND.surface,
  },
};
