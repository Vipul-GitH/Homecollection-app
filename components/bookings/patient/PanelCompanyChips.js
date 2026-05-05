import React from 'react';
import {Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function PanelCompanyChips({
  styles,
  patient,
  panelCompanies,
  activePanelCompanyId,
  canOpenPanelCompanyTests,
  hintText,
  onSelectPanelCompany,
  onRemovePanelCompany,
}) {
  const {width} = useWindowDimensions();
  const isNarrow = width < 370;

  if (!panelCompanies.length) {
    return null;
  }

  return (
    <View style={styles.patientCompanySection}>
      <View
        style={[
          styles.patientCompanyHeaderRow,
          isNarrow && styles.patientCompanyHeaderRowStacked,
        ]}>
        <Text style={styles.patientCompanySectionLabel}>Panel Companies</Text>
        <Text style={styles.patientCompanySectionHint}>{hintText}</Text>
      </View>
      <View style={styles.patientCompanyChipRow}>
        {panelCompanies.map(company => {
          const isActive =
            String(activePanelCompanyId) === String(company.chipId || company.id);
          const isAppChip = company.chipSource === 'APP';

          return (
            <View
              key={company.chipId || company.id}
              style={[
                styles.patientCompanyChipWrap,
                isNarrow && styles.patientCompanyChipWrapFull,
              ]}>
              <TouchableOpacity
                activeOpacity={canOpenPanelCompanyTests ? 0.75 : 1}
                style={[
                  styles.patientCompanyChip,
                  isNarrow && styles.patientCompanyChipFull,
                  isActive && styles.patientCompanyChipActive,
                  !canOpenPanelCompanyTests && styles.patientCompanyChipDisabled,
                ]}
                disabled={!canOpenPanelCompanyTests}
                hitSlop={{top: 6, bottom: 6, left: 6, right: 6}}
                onPress={() =>
                  onSelectPanelCompany({patient, panelCompany: company})
                }>
                <Ionicons
                  name="add-circle-outline"
                  size={15}
                  style={[
                    styles.patientCompanyChipIcon,
                    isActive && styles.patientCompanyChipIconActive,
                    !canOpenPanelCompanyTests &&
                      styles.patientCompanyChipIconDisabled,
                  ]}
                />
                <View style={styles.patientCompanyChipTextWrap}>
                  <Text
                    style={[
                      styles.patientCompanyChipText,
                      isActive && styles.patientCompanyChipTextActive,
                      !canOpenPanelCompanyTests &&
                        styles.patientCompanyChipTextDisabled,
                    ]}
                    numberOfLines={1}>
                    {company.name || 'Panel Company'}
                  </Text>
                  <Text
                    style={[
                      styles.patientCompanyChipHintText,
                      isActive && styles.patientCompanyChipHintTextActive,
                      !canOpenPanelCompanyTests &&
                        styles.patientCompanyChipHintTextDisabled,
                    ]}
                    numberOfLines={1}>
                    {canOpenPanelCompanyTests ? 'Add tests' : 'Start first'}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={13}
                  style={[
                    styles.patientCompanyChipChevron,
                    isActive && styles.patientCompanyChipChevronActive,
                    !canOpenPanelCompanyTests &&
                      styles.patientCompanyChipChevronDisabled,
                  ]}
                />
              </TouchableOpacity>
              {isAppChip && onRemovePanelCompany ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.patientPanelRemoveButton}
                  onPress={() => onRemovePanelCompany(patient, company)}>
                  <Ionicons
                    name="close"
                    size={13}
                    style={styles.patientPanelRemoveButtonIcon}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default React.memo(PanelCompanyChips);
