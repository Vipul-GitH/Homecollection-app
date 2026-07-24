import React, {useState} from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const REPORT_DELIVERY_OPTIONS = [
  {value: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp'},
  {value: 'courier', label: 'Courier', icon: 'cube-outline'},
  {value: 'by_hand', label: 'By Hand', icon: 'hand-left-outline'},
  {value: 'lab', label: 'Lab', icon: 'business-outline'},
];

function ReportCourierSelector({
  styles,
  patient,
  value,
  isNarrow,
  onChange,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedValue = value || '';
  const selectedOption = REPORT_DELIVERY_OPTIONS.find(
    option => option.value === selectedValue,
  );

  return (
    <View
      style={[
        styles.patientDetailInfoRow,
        isNarrow && styles.patientDetailInfoRowStacked,
      ]}>
      <Text style={styles.patientDetailLabel}>Report Delivery</Text>
      <View
        style={[
          styles.patientReportCourierControl,
          isNarrow && styles.patientReportCourierControlStacked,
        ]}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[
            styles.patientReportCourierButton,
            styles.patientReportCourierButtonActive,
          ]}
          disabled={typeof onChange !== 'function'}
          onPress={() => setIsExpanded(previousValue => !previousValue)}>
          <Ionicons
            name={selectedOption?.icon || 'alert-circle-outline'}
            size={16}
            style={[
              styles.patientReportCourierButtonText,
              styles.patientReportCourierButtonTextActive,
            ]}
          />
          <Text
            style={[
              styles.patientReportCourierButtonText,
              styles.patientReportCourierButtonTextActive,
            ]}>
            {selectedOption?.label || 'Select'}
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            style={[
              styles.patientReportCourierButtonText,
              styles.patientReportCourierButtonTextActive,
            ]}
          />
        </TouchableOpacity>

        {isExpanded ? (
          <View
            style={[
              styles.patientReportDeliveryOptionList,
              isNarrow && styles.patientReportDeliveryOptionListStacked,
            ]}>
            {REPORT_DELIVERY_OPTIONS.filter(
              option => option.value !== selectedValue,
            ).map(option => (
            <TouchableOpacity
              key={option.value}
              activeOpacity={0.85}
              style={styles.patientReportCourierButton}
              onPress={() => {
                onChange?.(patient, option.value);
                setIsExpanded(false);
              }}>
              <Ionicons
                name={option.icon}
                size={16}
                style={styles.patientReportCourierButtonText}
              />
              <Text style={styles.patientReportCourierButtonText}>
                {option.label}
              </Text>
            </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(ReportCourierSelector);
