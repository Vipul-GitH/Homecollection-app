import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function BookingLocationCard({
  styles,
  address,
  accessNotes,
  disabled,
  onOpenLocation,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.bookingDetailLocationCard}
      onPress={onOpenLocation}
      disabled={disabled}>
      <View style={styles.bookingDetailLocationIconWrap}>
        <Ionicons
          name="location-outline"
          size={18}
          style={styles.bookingDetailLocationIcon}
        />
      </View>
      <View style={styles.bookingDetailLocationContent}>
        <Text style={styles.bookingDetailLocationTitle}>Visit location</Text>
        <Text style={styles.bookingDetailAddressText}>
          {address || 'Address not available'}
        </Text>
        {accessNotes && accessNotes !== 'N/A' ? (
          <Text style={styles.bookingDetailAddressNote}>
            Access Notes: {accessNotes}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="open-outline"
        size={18}
        style={styles.bookingDetailLocationIcon}
      />
    </TouchableOpacity>
  );
}

export default React.memo(BookingLocationCard);
