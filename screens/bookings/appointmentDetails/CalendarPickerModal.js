import React from 'react';
import {Modal, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {MONTH_LABELS, WEEKDAY_LABELS} from './constants';
import {toDateInputValue} from './helpers';

function CalendarPickerModal({
  styles,
  visible,
  eyebrow,
  title,
  calendarMonth,
  calendarDays,
  selectedDateValue,
  onClose,
  onMoveMonth,
  onSelectDate,
  quickActions = [],
  disableDate,
  emptyKeyPrefix = 'empty',
  dateKeyPrefix = 'date',
}) {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}>
      <View style={styles.dobPickerOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.dobPickerBackdrop}
          onPress={onClose}
        />
        <View style={styles.dobPickerCard}>
          <View style={styles.dobPickerHeader}>
            <View>
              <Text style={styles.addPatientModalEyebrow}>{eyebrow}</Text>
              <Text style={styles.dobPickerTitle}>{title}</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.addPatientModalCloseButton}
              onPress={onClose}>
              <Ionicons
                name="close"
                size={20}
                style={styles.addPatientModalCloseIcon}
              />
            </TouchableOpacity>
          </View>

          {quickActions.length ? (
            <View style={styles.dobPickerQuickRow}>
              {quickActions.map(action => (
                <TouchableOpacity
                  key={action.label}
                  activeOpacity={0.85}
                  style={styles.dobPickerQuickButton}
                  onPress={action.onPress}>
                  <Text style={styles.dobPickerQuickButtonText}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <View style={styles.addPatientCalendarCard}>
            <View style={styles.addPatientCalendarHeader}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addPatientCalendarNavButton}
                onPress={() => onMoveMonth(-1)}>
                <Ionicons
                  name="chevron-back"
                  size={18}
                  style={styles.addPatientCalendarNavIcon}
                />
              </TouchableOpacity>
              <Text style={styles.addPatientCalendarTitle}>
                {MONTH_LABELS[calendarMonth.getMonth()]}{' '}
                {calendarMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addPatientCalendarNavButton}
                onPress={() => onMoveMonth(1)}>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  style={styles.addPatientCalendarNavIcon}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.addPatientCalendarGrid}>
              {WEEKDAY_LABELS.map((weekday, index) => (
                <Text
                  key={`${weekday}-${dateKeyPrefix}-${index}`}
                  style={styles.addPatientCalendarWeekday}>
                  {weekday}
                </Text>
              ))}
              {calendarDays.map((date, index) => {
                if (!date) {
                  return (
                    <View
                      key={`${emptyKeyPrefix}-${index}`}
                      style={styles.addPatientCalendarDaySlot}
                    />
                  );
                }

                const dateValue = toDateInputValue(date);
                const isSelected = selectedDateValue === dateValue;
                const isDisabled = Boolean(disableDate?.(date));

                return (
                  <View
                    key={`${dateKeyPrefix}-${dateValue}`}
                    style={styles.addPatientCalendarDaySlot}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={[
                        styles.addPatientCalendarDay,
                        isSelected && styles.addPatientCalendarDaySelected,
                        isDisabled && styles.addPatientCalendarDayDisabled,
                      ]}
                      onPress={() => onSelectDate(date)}
                      disabled={isDisabled}>
                      <Text
                        style={[
                          styles.addPatientCalendarDayText,
                          isSelected && styles.addPatientCalendarDayTextSelected,
                          isDisabled && styles.addPatientCalendarDayTextDisabled,
                        ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(CalendarPickerModal);
