import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function PatientTestsAccordion({
  styles,
  patient,
  tests,
  isExpanded,
  isNarrow,
  onToggle,
  onRemoveSelectedTest,
}) {
  return (
    <View
      style={[
        styles.patientDetailInfoRow,
        isNarrow && styles.patientDetailInfoRowStacked,
      ]}>
      <Text style={styles.patientDetailLabel}>Tests</Text>
      <View
        style={[
          styles.patientTestsWrap,
          isNarrow && styles.patientTestsWrapStacked,
        ]}>
        {tests.length ? (
          <>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.testsAccordionButton}
              onPress={onToggle}>
              <Text style={styles.testsAccordionButtonText}>
                {isExpanded ? 'Hide Tests' : `View Tests (${tests.length})`}
              </Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                style={styles.testsAccordionIcon}
              />
            </TouchableOpacity>

            {isExpanded
              ? tests.map(test => (
                  <View key={test.id} style={styles.patientTestChip}>
                    <View style={styles.sampleCollectionSelectedTextWrap}>
                      <Text style={styles.patientTestLine}>
                        <Text style={styles.patientTestCode}>{test.code}</Text>
                        <Text style={styles.patientTestSeparator}>: </Text>
                        <Text style={styles.patientTestName}>{test.name}</Text>
                      </Text>
                      {test.parentDescription ? (
                        <Text style={styles.sampleCollectionSelectedMeta}>
                          Child of {test.parentDescription}
                        </Text>
                      ) : null}
                      {test.panelCompanyName ? (
                        <Text style={styles.sampleCollectionSelectedMeta}>
                          Panel: {test.panelCompanyName}
                        </Text>
                      ) : null}
                    </View>
                    {test.isAppAdded && onRemoveSelectedTest ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.sampleCollectionRemoveButton}
                        onPress={() =>
                          onRemoveSelectedTest({
                            patient,
                            testKey: test.removeKey,
                          })
                        }>
                        <Ionicons
                          name="trash-outline"
                          size={15}
                          style={styles.sampleCollectionRemoveButtonIcon}
                        />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))
              : null}
          </>
        ) : (
          <Text
            style={[
              styles.patientDetailValueWide,
              isNarrow && styles.patientDetailValueWideStacked,
            ]}>
            No tests available
          </Text>
        )}
      </View>
    </View>
  );
}

export default React.memo(PatientTestsAccordion);
