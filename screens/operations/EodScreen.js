import React, {useState} from 'react';
import {ActivityIndicator, Alert, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../styles/appStyles';

export default function EodScreen({
  styles,
  onClearAppCache,
  onClearAllAppData,
}) {
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
    </View>
  );
}
