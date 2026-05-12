import React from 'react';
import {Modal, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function AppAlertModal({alert, styles, onClose}) {
  if (!alert) {
    return null;
  }

  const actions = alert.actions?.length ? alert.actions : [{text: 'OK'}];

  const handleActionPress = action => {
    onClose?.(false);
    action?.onPress?.();
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={Boolean(alert)}
      onRequestClose={() => (alert.cancelable ? onClose?.(true) : null)}>
      <View style={styles.appAlertOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.appAlertBackdrop}
          onPress={() => (alert.cancelable ? onClose?.(true) : null)}
        />
        <View style={styles.appAlertCard}>
          <View style={styles.appAlertIconWrap}>
            <Ionicons
              name={alert.icon || 'information-circle-outline'}
              size={26}
              style={styles.appAlertIcon}
            />
          </View>
          {alert.title ? (
            <Text style={styles.appAlertTitle}>{alert.title}</Text>
          ) : null}
          {alert.message ? (
            <Text style={styles.appAlertMessage}>{alert.message}</Text>
          ) : null}
          <View style={styles.appAlertActions}>
            {actions.map((action, index) => {
              const isCancel = action?.style === 'cancel';
              const isDestructive = action?.style === 'destructive';

              return (
                <TouchableOpacity
                  key={`${action?.text || 'OK'}-${index}`}
                  activeOpacity={0.85}
                  style={[
                    styles.appAlertButton,
                    isCancel && styles.appAlertButtonSecondary,
                    isDestructive && styles.appAlertButtonDanger,
                  ]}
                  onPress={() => handleActionPress(action)}>
                  <Text
                    style={[
                      styles.appAlertButtonText,
                      isCancel && styles.appAlertButtonSecondaryText,
                      isDestructive && styles.appAlertButtonDangerText,
                    ]}>
                    {action?.text || 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(AppAlertModal);
