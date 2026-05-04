import React from 'react';
import {Modal, Pressable, Text, View} from 'react-native';

function LogoutConfirmModal({styles, visible, onClose, onConfirm}) {
  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}>
      <View style={styles.logoutModalOverlay}>
        <Pressable style={styles.logoutModalBackdrop} onPress={onClose} />
        <View style={styles.logoutModalCard}>
          <View style={styles.logoutModalIconWrap}>
            <Text style={styles.logoutModalIcon}>?</Text>
          </View>
          <Text style={styles.logoutModalTitle}>Log out now?</Text>
          <Text style={styles.logoutModalMessage}>
            You will return to the sign-in screen and need to log in again to
            continue your field work.
          </Text>
          <View style={styles.logoutModalButtonRow}>
            <Pressable
              style={styles.logoutModalSecondaryButton}
              onPress={onClose}>
              <Text style={styles.logoutModalSecondaryButtonText}>
                Stay Logged In
              </Text>
            </Pressable>
            <Pressable
              style={styles.logoutModalPrimaryButton}
              onPress={onConfirm}>
              <Text style={styles.logoutModalPrimaryButtonText}>Log Out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default LogoutConfirmModal;
