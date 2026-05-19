import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

export default function AppHeader({
  title,
  subtitle,
  showBackButton = false,
  onBack,
  styles,
  variant = 'default',
  metaItems = [],
  status,
  rightActions = [],
}) {
  if (variant === 'booking' || showBackButton) {
    const isBookingHeader = variant === 'booking';
    const visibleMetaItems = isBookingHeader ? metaItems.filter(Boolean) : [];
    const fallbackSubtitle =
      isBookingHeader && !visibleMetaItems.length && subtitle ? [subtitle] : [];
    const headerMetaItems = [...visibleMetaItems, ...fallbackSubtitle];
    const hasSubline = headerMetaItems.length > 0 || Boolean(status);

    return (
      <View style={styles.appHeaderBooking}>
        <View style={styles.appHeaderBookingRow}>
          {showBackButton ? (
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.appHeaderBookingBackButton}
              onPress={onBack}
              hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
              <Ionicons
                name="chevron-back"
                size={22}
                style={styles.appHeaderBookingBackIcon}
              />
            </TouchableOpacity>
          ) : null}

          <View
            style={[
              styles.appHeaderBookingText,
              !hasSubline && styles.appHeaderBookingTextSingle,
            ]}>
            <Text
              style={[
                styles.appHeaderBookingTitle,
                !hasSubline && styles.appHeaderBookingTitleSingle,
              ]}
              numberOfLines={1}>
              {title}
            </Text>
            {hasSubline ? (
              <View style={styles.appHeaderBookingMetaRow}>
                {headerMetaItems.map((item, index) => (
                  <React.Fragment key={`${item}-${index}`}>
                    {index > 0 ? (
                      <Text style={styles.appHeaderBookingMetaDivider}>-</Text>
                    ) : null}
                    <Text style={styles.appHeaderBookingMeta} numberOfLines={1}>
                      {item}
                    </Text>
                  </React.Fragment>
                ))}
                {status ? (
                  <View style={styles.appHeaderBookingStatusPill}>
                    <Text style={styles.appHeaderBookingStatusText} numberOfLines={1}>
                      {status}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {rightActions.length ? (
            <View style={styles.appHeaderBookingActions}>
              {rightActions.map(action => (
                <TouchableOpacity
                  key={action.key || action.icon}
                  activeOpacity={0.85}
                  disabled={action.disabled}
                  style={[
                    styles.appHeaderBookingActionButton,
                    action.disabled && styles.appHeaderBookingActionButtonDisabled,
                  ]}
                  onPress={action.onPress}>
                  <Ionicons
                    name={action.icon}
                    size={16}
                    style={[
                      styles.appHeaderBookingActionIcon,
                      action.color ? {color: action.color} : null,
                      action.disabled && styles.appHeaderBookingActionIconDisabled,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appHeader}>
      <View style={styles.appHeaderRow}>
        {showBackButton ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <Ionicons name="chevron-back" size={24} style={styles.backButtonIcon} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.appHeaderText}>
          <Text style={styles.appHeaderTitle} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.appHeaderSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
