import React from 'react';
import {
  ActivityIndicator,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {BRAND} from '../../styles/appStyles';

export default function LocationRequiredScreen({
  styles,
  contentWidth,
  horizontalPadding,
  loginTopSpacing,
  loginBottomSpacing,
  isSmallPhone,
  locationStatus,
  isRequestingLocation,
  onEnableLocation,
}) {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.background} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.backgroundOrbTop} />
        <View style={styles.backgroundOrbBottom} />
        <View
          style={[
            styles.locationBlockedContainer,
            {
              paddingHorizontal: horizontalPadding,
              paddingTop: loginTopSpacing,
              paddingBottom: loginBottomSpacing,
            },
          ]}>
          <View style={[styles.locationBlockedCard, {maxWidth: contentWidth}]}>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>Location Guard</Text>
            </View>
            <Text style={styles.eyebrow}>Location Required</Text>
            <Text style={[styles.title, isSmallPhone && styles.titleCompact]}>
              Turn on location to use HomeCollection
            </Text>
            <Text style={styles.subtitle}>
              The main content will remain unavailable until location permission
              and GPS are enabled.
            </Text>

            <View style={styles.locationBlockedInfo}>
              <Text style={styles.locationStatusTitle}>Current Status</Text>
              <Text style={styles.locationStatusText}>{locationStatus}</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.loginButton,
                isRequestingLocation && styles.loginButtonLoading,
              ]}
              onPress={onEnableLocation}
              disabled={isRequestingLocation}>
              <View
                style={[
                  styles.loginButtonGradient,
                  isRequestingLocation && styles.loginButtonGradientLoading,
                ]}>
                {isRequestingLocation ? (
                  <View style={styles.locationLoadingRow}>
                    <ActivityIndicator
                      size="small"
                      color={BRAND.surface}
                      style={styles.locationLoadingSpinner}
                    />
                    <Text style={styles.loginButtonText}>Checking location</Text>
                  </View>
                ) : (
                  <Text style={styles.loginButtonText}>Enable Location</Text>
                )}
              </View>
            </TouchableOpacity>

            <Text style={styles.locationBlockedHint}>
              The app cannot continue if permission is denied or GPS is off.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}

