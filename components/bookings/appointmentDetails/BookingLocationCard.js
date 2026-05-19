import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function LocationStatusIcon({styles, variant, onPress, disabled}) {
  const isSuccess = variant === 'success';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.bookingDetailLocationStatusIconWrap,
        isSuccess
          ? styles.bookingDetailLocationStatusIconWrapSuccess
          : styles.bookingDetailLocationStatusIconWrapError,
      ]}>
      <Ionicons
        name="location"
        size={17}
        style={[
          styles.bookingDetailLocationStatusPin,
          isSuccess
            ? styles.bookingDetailLocationStatusPinSuccess
            : styles.bookingDetailLocationStatusPinError,
        ]}
      />
      <Ionicons
        name={isSuccess ? 'checkmark-circle' : 'close-circle'}
        size={13}
        style={[
          styles.bookingDetailLocationStatusBadge,
          isSuccess
          ? styles.bookingDetailLocationStatusBadgeSuccess
          : styles.bookingDetailLocationStatusBadgeError,
        ]}
      />
    </TouchableOpacity>
  );
}

function BookingLocationCard({
  styles,
  address,
  landmark,
  accessNotes,
  hasLocationUrl,
  disabled,
  onOpenLocation,
  onEditAddress,
}) {
  return (
    <View style={styles.bookingDetailLocationCard}>
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
        {landmark && landmark !== 'N/A' ? (
          <Text style={styles.bookingDetailAddressNote}>
            Landmark: {landmark}
          </Text>
        ) : null}
        {accessNotes && accessNotes !== 'N/A' ? (
          <Text style={styles.bookingDetailAddressNote}>
            Access Notes: {accessNotes}
          </Text>
        ) : null}
      </View>
      <View style={styles.bookingDetailLocationActionGroup}>
        {onEditAddress ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.bookingDetailLocationEditButton}
            onPress={onEditAddress}>
            <Ionicons
              name="create-outline"
              size={16}
              style={styles.bookingDetailLocationEditIcon}
            />
          </TouchableOpacity>
        ) : null}
        <LocationStatusIcon
          styles={styles}
          variant={hasLocationUrl ? 'success' : 'error'}
          onPress={onOpenLocation}
          disabled={disabled}
        />
      </View>
    </View>
  );
}

export default React.memo(BookingLocationCard);
