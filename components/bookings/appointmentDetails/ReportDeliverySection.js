import React, {useCallback, useEffect, useMemo, useState} from 'react';
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

const ReportDeliveryPatientChip = React.memo(function ReportDeliveryPatientChip({
  styles,
  patient,
  index,
  isSelected,
  onSelect,
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[
        styles.reportDeliveryPatientChip,
        patient.isComplete && styles.reportDeliveryPatientChipDone,
        isSelected && styles.reportDeliveryPatientChipActive,
      ]}
      onPress={() => onSelect(patient.id)}>
      <View style={styles.reportDeliveryPatientChipHeader}>
        <Text
          numberOfLines={1}
          style={[
            styles.reportDeliveryPatientChipName,
            isSelected && styles.reportDeliveryPatientChipNameActive,
          ]}>
          {index + 1}. {patient.name}
        </Text>
        <Ionicons
          name={patient.isComplete ? 'checkmark-circle' : 'ellipse-outline'}
          size={15}
          style={[
            styles.reportDeliveryPatientChipIcon,
            patient.isComplete && styles.reportDeliveryPatientChipIconDone,
            isSelected && styles.reportDeliveryPatientChipIconActive,
          ]}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.reportDeliveryPatientSummary,
          isSelected && styles.reportDeliveryPatientSummaryActive,
        ]}>
        {patient.summary}
      </Text>
    </TouchableOpacity>
  );
});

const ReportDeliverySelectedForm = React.memo(function ReportDeliverySelectedForm({
  styles,
  patient,
  onToggleReportDelivery,
  onReportScheduleChange,
}) {
  if (!patient) {
    return null;
  }

  return (
    <View style={styles.reportDeliveryFormCard}>
      <View style={styles.reportDeliverySelectedHeader}>
        <Text style={styles.reportDeliverySelectedName}>{patient.name}</Text>
        <Text style={styles.reportDeliverySelectedMeta}>{patient.summary}</Text>
      </View>

      <Text style={styles.patientSampleUndefinedTubeText}>Report Schedule</Text>
      <View style={styles.completePaymentModeRow}>
        {REPORT_SCHEDULE_OPTIONS.map(option => {
          const isSelected = patient.schedule === option.value;

          return (
            <TouchableOpacity
              key={`${patient.id}-schedule-${option.value}`}
              activeOpacity={0.85}
              style={[
                styles.completePaymentModeChip,
                styles.reportDeliveryOptionChip,
                isSelected && styles.completePaymentModeChipActive,
              ]}
              onPress={() => onReportScheduleChange?.(patient.source, option.value)}>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : option.icon}
                size={15}
                style={[
                  styles.completePaymentModeChipText,
                  isSelected && styles.completePaymentModeChipTextActive,
                ]}
              />
              <Text
                style={[
                  styles.completePaymentModeChipText,
                  isSelected && styles.completePaymentModeChipTextActive,
                ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.patientSampleUndefinedTubeText}>Delivery Options</Text>
      <View style={styles.completePaymentModeRow}>
        {REPORT_DELIVERY_OPTIONS.map(option => {
          const isSelected = patient.deliveryValues.includes(option.value);

          return (
            <TouchableOpacity
              key={`${patient.id}-${option.value}`}
              activeOpacity={0.85}
              style={[
                styles.completePaymentModeChip,
                styles.reportDeliveryOptionChip,
                isSelected && styles.completePaymentModeChipActive,
              ]}
              onPress={() => onToggleReportDelivery?.(patient.source, option.value)}>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : option.icon}
                size={15}
                style={[
                  styles.completePaymentModeChipText,
                  isSelected && styles.completePaymentModeChipTextActive,
                ]}
              />
              <Text
                style={[
                  styles.completePaymentModeChipText,
                  isSelected && styles.completePaymentModeChipTextActive,
                ]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

function ReportDeliverySection({
  styles,
  patients = [],
  patientReportCourierMap = {},
  patientReportScheduleMap = {},
  onToggleReportDelivery,
  onReportScheduleChange,
}) {
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const patientSummaries = useMemo(
    () =>
      patients.map(patient => {
        const patientId = String(patient.id);
        const deliveryValues = normalizeReportDeliveryValues(
          patientReportCourierMap[patient.id],
        );
        const schedule = patientReportScheduleMap[patient.id] || 'routine';

        return {
          ...patient,
          id: patientId,
          source: patient,
          deliveryValues,
          schedule,
          isComplete: deliveryValues.length > 0,
          summary: getReportDeliverySummary(deliveryValues, schedule),
        };
      }),
    [patientReportCourierMap, patientReportScheduleMap, patients],
  );

  useEffect(() => {
    if (!patientSummaries.length) {
      setSelectedPatientId('');
      return;
    }

    const selectedPatientExists = patientSummaries.some(
      patient => String(patient.id) === String(selectedPatientId),
    );

    if (!selectedPatientExists) {
      setSelectedPatientId(String(patientSummaries[0].id));
    }
  }, [patientSummaries, selectedPatientId]);

  const selectedPatient = useMemo(() => {
    if (!patientSummaries.length) {
      return null;
    }

    return (
      patientSummaries.find(patient => String(patient.id) === selectedPatientId) ||
      patientSummaries[0]
    );
  }, [patientSummaries, selectedPatientId]);
  const handleSelectPatient = useCallback(patientId => {
    setSelectedPatientId(String(patientId));
  }, []);

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
            {patientSummaries.length ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.reportDeliveryPatientList}>
              {patientSummaries.map((patient, index) => (
                <ReportDeliveryPatientChip
                  key={`report-delivery-patient-${patient.id}`}
                  styles={styles}
                  patient={patient}
                  index={index}
                  isSelected={String(selectedPatient?.id) === String(patient.id)}
                  onSelect={handleSelectPatient}
                />
              ))}
            </ScrollView>

            <ReportDeliverySelectedForm
              styles={styles}
              patient={selectedPatient}
              onToggleReportDelivery={onToggleReportDelivery}
              onReportScheduleChange={onReportScheduleChange}
            />
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
