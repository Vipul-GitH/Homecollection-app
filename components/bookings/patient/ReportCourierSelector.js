import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function ReportCourierSelector({
  styles,
  patient,
  value,
  isNarrow,
  onChange,
}) {
  return (
    <View
      style={[
        styles.patientDetailInfoRow,
        isNarrow && styles.patientDetailInfoRowStacked,
      ]}>
      <Text style={styles.patientDetailLabel}>Report Courier</Text>
      <View
        style={[
          styles.patientReportCourierControl,
          isNarrow && styles.patientReportCourierControlStacked,
        ]}>
        {['Yes', 'No'].map(option => {
          const isSelected = value === option;

          return (
            <TouchableOpacity
              key={option}
              activeOpacity={0.85}
              style={[
                styles.patientReportCourierButton,
                isSelected && styles.patientReportCourierButtonActive,
              ]}
              disabled={typeof onChange !== 'function'}
              onPress={() => onChange?.(patient, option)}>
              <Ionicons
                name={isSelected ? 'checkbox' : 'square-outline'}
                size={16}
                style={[
                  styles.patientReportCourierButtonText,
                  isSelected && styles.patientReportCourierButtonTextActive,
                ]}
              />
              <Text
                style={[
                  styles.patientReportCourierButtonText,
                  isSelected && styles.patientReportCourierButtonTextActive,
                ]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(ReportCourierSelector);
