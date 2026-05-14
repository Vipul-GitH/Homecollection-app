import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const REPORT_DELIVERY_OPTIONS = [
  {value: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp'},
  {value: 'courier', label: 'Courier', icon: 'cube-outline'},
  {value: 'lab', label: 'Lab', icon: 'business-outline'},
];
const REPORT_SCHEDULE_OPTIONS = [
  {value: 'routine', label: 'Routine', icon: 'time-outline'},
  {value: 'urgent', label: 'Urgent', icon: 'flash-outline'},
];

const normalizeReportDeliveryValues = value => {
  const normalizeOptionValue = item => {
    const normalizedItem = String(item || '').trim().toLowerCase();

    if (normalizedItem === 'yes') {
      return 'courier';
    }

    if (normalizedItem === 'no') {
      return 'whatsapp';
    }

    return REPORT_DELIVERY_OPTIONS.some(option => option.value === normalizedItem)
      ? normalizedItem
      : '';
  };

  if (Array.isArray(value)) {
    return value.map(normalizeOptionValue).filter(Boolean);
  }

  const normalizedValue =
    value === null || value === undefined ? '' : String(value).trim();

  if (!normalizedValue) {
    return [];
  }

  return normalizedValue
    .split(/[,|]+/)
    .map(normalizeOptionValue)
    .filter(Boolean);
};

const getOptionLabel = (options, value) =>
  options.find(option => option.value === value)?.label || '';

const getReportDeliverySummary = (selectedValues, scheduleValue) => {
  if (!selectedValues.length) {
    return 'Not selected';
  }

  const scheduleLabel =
    getOptionLabel(REPORT_SCHEDULE_OPTIONS, scheduleValue || 'routine') ||
    'Routine';
  const deliveryLabels = selectedValues
    .map(value => getOptionLabel(REPORT_DELIVERY_OPTIONS, value))
    .filter(Boolean);

  return `${scheduleLabel} | ${deliveryLabels.join(', ')}`;
};

function ReportDeliverySection({
  styles,
  patients = [],
  patientReportCourierMap = {},
  patientReportScheduleMap = {},
  onToggleReportDelivery,
  onReportScheduleChange,
}) {
  const [selectedPatientId, setSelectedPatientId] = useState('');

  useEffect(() => {
    if (!patients.length) {
      setSelectedPatientId('');
      return;
    }

    const selectedPatientExists = patients.some(
      patient => String(patient.id) === String(selectedPatientId),
    );

    if (!selectedPatientExists) {
      setSelectedPatientId(String(patients[0].id));
    }
  }, [patients, selectedPatientId]);

  const selectedPatient = useMemo(() => {
    if (!patients.length) {
      return null;
    }

    return (
      patients.find(patient => String(patient.id) === selectedPatientId) ||
      patients[0]
    );
  }, [patients, selectedPatientId]);

  const selectedPatientDeliveryValues = selectedPatient
    ? normalizeReportDeliveryValues(patientReportCourierMap[selectedPatient.id])
    : [];
  const selectedPatientSchedule = selectedPatient
    ? patientReportScheduleMap[selectedPatient.id] || 'routine'
    : 'routine';

  return (
    <View style={styles.paymentSummaryCard}>
      <View style={styles.paymentSummaryHeader}>
        <Text style={styles.paymentSummaryTitle}>Report Delivery</Text>
        <View style={styles.paymentSummaryPatientBadge}>
          <Text style={styles.paymentSummaryPatientBadgeText}>
            {patients.length} patient{patients.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <View style={styles.completePaymentsCollectedCard}>
        {patients.length ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.reportDeliveryPatientList}>
              {patients.map((patient, index) => {
                const patientId = String(patient.id);
                const selectedValues = normalizeReportDeliveryValues(
                  patientReportCourierMap[patient.id],
                );
                const selectedSchedule =
                  patientReportScheduleMap[patient.id] || 'routine';
                const isSelected = String(selectedPatient?.id) === patientId;
                const isComplete = selectedValues.length > 0;

                return (
                  <TouchableOpacity
                    key={`report-delivery-patient-${patient.id}`}
                    activeOpacity={0.88}
                    style={[
                      styles.reportDeliveryPatientChip,
                      isComplete && styles.reportDeliveryPatientChipDone,
                      isSelected && styles.reportDeliveryPatientChipActive,
                    ]}
                    onPress={() => setSelectedPatientId(patientId)}>
                    <View style={styles.reportDeliveryPatientChipHeader}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.reportDeliveryPatientChipName,
                          isSelected &&
                            styles.reportDeliveryPatientChipNameActive,
                        ]}>
                        {index + 1}. {patient.name}
                      </Text>
                      <Ionicons
                        name={isComplete ? 'checkmark-circle' : 'ellipse-outline'}
                        size={15}
                        style={[
                          styles.reportDeliveryPatientChipIcon,
                          isComplete &&
                            styles.reportDeliveryPatientChipIconDone,
                          isSelected &&
                            styles.reportDeliveryPatientChipIconActive,
                        ]}
                      />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.reportDeliveryPatientSummary,
                        isSelected && styles.reportDeliveryPatientSummaryActive,
                      ]}>
                      {getReportDeliverySummary(selectedValues, selectedSchedule)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedPatient ? (
              <View style={styles.reportDeliveryFormCard}>
                <View style={styles.reportDeliverySelectedHeader}>
                  <Text style={styles.reportDeliverySelectedName}>
                    {selectedPatient.name}
                  </Text>
                  <Text style={styles.reportDeliverySelectedMeta}>
                    {getReportDeliverySummary(
                      selectedPatientDeliveryValues,
                      selectedPatientSchedule,
                    )}
                  </Text>
                </View>

                <Text style={styles.patientSampleUndefinedTubeText}>
                  Report Schedule
                </Text>
                <View style={styles.completePaymentModeRow}>
                  {REPORT_SCHEDULE_OPTIONS.map(option => {
                    const isSelected = selectedPatientSchedule === option.value;

                    return (
                      <TouchableOpacity
                        key={`${selectedPatient.id}-schedule-${option.value}`}
                        activeOpacity={0.85}
                        style={[
                          styles.completePaymentModeChip,
                          styles.reportDeliveryOptionChip,
                          isSelected && styles.completePaymentModeChipActive,
                        ]}
                        onPress={() =>
                          onReportScheduleChange?.(selectedPatient, option.value)
                        }>
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : option.icon}
                          size={15}
                          style={[
                            styles.completePaymentModeChipText,
                            isSelected &&
                              styles.completePaymentModeChipTextActive,
                          ]}
                        />
                        <Text
                          style={[
                            styles.completePaymentModeChipText,
                            isSelected &&
                              styles.completePaymentModeChipTextActive,
                          ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.patientSampleUndefinedTubeText}>
                  Delivery Options
                </Text>
                <View style={styles.completePaymentModeRow}>
                  {REPORT_DELIVERY_OPTIONS.map(option => {
                    const isSelected = selectedPatientDeliveryValues.includes(
                      option.value,
                    );

                    return (
                      <TouchableOpacity
                        key={`${selectedPatient.id}-${option.value}`}
                        activeOpacity={0.85}
                        style={[
                          styles.completePaymentModeChip,
                          styles.reportDeliveryOptionChip,
                          isSelected && styles.completePaymentModeChipActive,
                        ]}
                        onPress={() =>
                          onToggleReportDelivery?.(selectedPatient, option.value)
                        }>
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : option.icon}
                          size={15}
                          style={[
                            styles.completePaymentModeChipText,
                            isSelected &&
                              styles.completePaymentModeChipTextActive,
                          ]}
                        />
                        <Text
                          style={[
                            styles.completePaymentModeChipText,
                            isSelected &&
                              styles.completePaymentModeChipTextActive,
                          ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.patientSelectorEmptyText}>
            No active patient for report delivery.
          </Text>
        )}
      </View>
    </View>
  );
}

export {
  REPORT_DELIVERY_OPTIONS,
  REPORT_SCHEDULE_OPTIONS,
  normalizeReportDeliveryValues,
};
export default React.memo(ReportDeliverySection);
