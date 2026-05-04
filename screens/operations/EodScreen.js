import React from 'react';
import {Text, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function EodScreen({styles}) {
  return (
    <View style={styles.comingSoonCard}>
      <View style={styles.comingSoonIconWrap}>
        <Ionicons name="wallet-outline" size={30} style={styles.comingSoonIcon} />
      </View>
      <Text style={styles.comingSoonEyebrow}>Coming Soon</Text>
      <Text style={styles.comingSoonTitle}>End Of Month</Text>
      <Text style={styles.comingSoonText}>
        EOM reconciliation will appear here after the live settlement workflow
        is ready.
      </Text>
    </View>
  );
}
