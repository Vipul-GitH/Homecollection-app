import React from 'react';
import {ActivityIndicator, Text, View} from 'react-native';
import {BRAND} from '../../styles/appStyles';

export default function LoadingOverlay({
  styles,
  visible,
  title = 'Please wait',
  message = 'Loading data...',
}) {
  if (!visible) {
    return null;
  }

  return (
    <View style={styles.loadingOverlay}>
      <View style={styles.loadingCard}>
        <View style={styles.loadingSpinnerWrap}>
          <ActivityIndicator size="large" color={BRAND.primary} />
        </View>
        <Text style={styles.loadingTitle}>{title}</Text>
        <Text style={styles.loadingMessage}>{message}</Text>
      </View>
    </View>
  );
}


