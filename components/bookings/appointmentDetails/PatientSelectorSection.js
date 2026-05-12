import React from 'react';
import {ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../../styles/appStyles';

function PatientSelectorSection({
  styles,
  isSmallPhone,
  patientCount,
  patientSelectorItems,
  filteredPatientSelectorItems,
  selectedPatientItem,
  patientSearchText,
  setPatientSearchText,
  setSelectedPatientKey,
}) {
  return (
    <View style={styles.patientSelectorCard}>
      <View
        style={[
          styles.patientSelectorHeader,
          isSmallPhone && styles.patientSelectorHeaderStacked,
        ]}>
        <View style={styles.patientSelectorHeaderText}>
          <Text style={styles.patientSelectorTitle}>
            Patients in this Appointment
          </Text>
          <Text style={styles.patientSelectorMeta}>
            {patientCount} patient{patientCount > 1 ? 's' : ''} | selected:{' '}
            {selectedPatientItem?.name || 'N/A'}
          </Text>
        </View>
        <View style={styles.patientSelectorSelectedBadge}>
          <Text style={styles.patientSelectorSelectedBadgeText}>
            {selectedPatientItem
              ? `Patient ${selectedPatientItem.index + 1}`
              : 'No Patient'}
          </Text>
        </View>
      </View>

      {patientSelectorItems.length >= 6 ? (
        <View style={styles.patientSelectorSearchWrap}>
          <Ionicons
            name="search-outline"
            size={17}
            style={styles.patientSelectorSearchIcon}
          />
          <TextInput
            value={patientSearchText}
            onChangeText={setPatientSearchText}
            placeholder="Search patient name, mobile, PID"
            placeholderTextColor={BRAND.textMuted}
            style={styles.patientSelectorSearchInput}
          />
        </View>
      ) : null}

      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.patientSelectorList}>
        {filteredPatientSelectorItems.length ? (
          filteredPatientSelectorItems.map(item => {
            const isSelected = selectedPatientItem?.key === item.key;
            const isDone = [3, 5].includes(item.statusCode);
            const isCancelled = item.statusCode === 4;

            return (
              <TouchableOpacity
                key={`patient-selector-${item.key}`}
                activeOpacity={0.85}
                style={[
                  styles.patientSelectorChip,
                  isSelected && styles.patientSelectorChipActive,
                  isCancelled && styles.patientSelectorChipCancelled,
                ]}
                onPress={() => setSelectedPatientKey(item.key)}>
                <View style={styles.patientSelectorChipTopRow}>
                  <Text
                    style={[
                      styles.patientSelectorChipName,
                      isSelected && styles.patientSelectorChipNameActive,
                    ]}
                    numberOfLines={1}>
                    {item.index + 1}. {item.name}
                  </Text>
                  {isSelected ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={15}
                      style={styles.patientSelectorChipCheck}
                    />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.patientSelectorChipMeta,
                    isSelected && styles.patientSelectorChipMetaActive,
                  ]}
                  numberOfLines={1}>
                  {item.meta || 'No PID/mobile'}
                </Text>
                <Text
                  style={[
                    styles.patientSelectorChipStatus,
                    isSelected && styles.patientSelectorChipStatusActive,
                    isDone && styles.patientSelectorChipStatusDone,
                    isCancelled && styles.patientSelectorChipStatusCancelled,
                  ]}>
                  {item.statusLabel}
                </Text>
              </TouchableOpacity>
            );
          })
        ) : (
          <Text style={styles.patientSelectorEmptyText}>No patient found.</Text>
        )}
      </ScrollView>
    </View>
  );
}

export default React.memo(PatientSelectorSection);
