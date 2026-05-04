import React from 'react';
import {Text, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function HandoverScreen({styles}) {
  return (
    <View style={styles.comingSoonCard}>
      <View style={styles.comingSoonIconWrap}>
        <Ionicons name="cube-outline" size={30} style={styles.comingSoonIcon} />
      </View>
      <Text style={styles.comingSoonEyebrow}>Coming Soon</Text>
      <Text style={styles.comingSoonTitle}>Sample Handover</Text>
      <Text style={styles.comingSoonText}>
        Handover tracking will be available here once the production workflow is
        connected.
      </Text>
    </View>
  );
}
