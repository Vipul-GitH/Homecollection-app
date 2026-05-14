import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';

const normalizeText = value =>
  value === null || value === undefined ? '' : String(value).trim();

const isUndefinedTubeName = value => {
  const normalizedValue = normalizeText(value).toLowerCase();
  return !normalizedValue || normalizedValue === 'none' || normalizedValue === 'n/a';
};

function PatientSampleCollectionSection({
  styles,
  patient,
  activePanelCompany,
  tubes = [],
  sampleCollection,
  canOpenSampleCollection = true,
  onOpenSampleCollection,
}) {
  const isCollected = Boolean(sampleCollection?.collected);
  const allTubeSummaryRows = (
    Array.isArray(sampleCollection?.tubeSelectionSummary) &&
    sampleCollection.tubeSelectionSummary.length
      ? sampleCollection.tubeSelectionSummary
      : (tubes.length ? tubes : ['Sample Tube']).map(tube => ({
          tubeName: tube,
          totalCount: isCollected
            ? Math.max(Number(sampleCollection?.selectedCount || 0), 1)
            : 1,
          selectedCount: isCollected
            ? Math.max(Number(sampleCollection?.selectedCount || 0), 1)
            : 0,
          pendingCount: isCollected ? 0 : 1,
        }))
  ).map(item => ({
    tubeName: normalizeText(item?.tubeName || item?.specimenName) || 'Sample Tube',
    totalCount: Number(item?.totalCount || 0),
    selectedCount: isCollected ? Number(item?.selectedCount || 0) : 0,
    pendingCount: isCollected
      ? Number(item?.pendingCount || 0)
      : Math.max(
          Number(item?.totalCount || item?.pendingCount || item?.selectedCount || 0),
          1,
        ),
  }));
  const tubeSummaryRows = allTubeSummaryRows.filter(
    item => !isUndefinedTubeName(item.tubeName),
  );
  const collectedTubeCount = tubeSummaryRows.filter(
    item => item.selectedCount > 0,
  ).length;
  const pendingTubeCount = tubeSummaryRows.filter(
    item => item.pendingCount > 0,
  ).length;

  return (
    <View style={styles.patientSampleSection}>
      <View style={styles.patientSampleSectionHeader}>
        <Text style={styles.patientSampleSectionTitle}>Sample Collection</Text>
        <View
          style={[
            styles.patientSamplePendingBadge,
            isCollected && styles.patientSamplePendingBadgeDone,
          ]}>
          <Text
            style={[
              styles.patientSamplePendingBadgeText,
              isCollected && styles.patientSamplePendingBadgeTextDone,
            ]}>
            {isCollected && pendingTubeCount === 0
              ? 'Samples collected'
              : tubeSummaryRows.length
              ? `${collectedTubeCount} collected, ${Math.max(
                  pendingTubeCount,
                  1,
                )} pending`
              : 'No tubes available'}
          </Text>
        </View>
      </View>
      {onOpenSampleCollection ? (
        <TouchableOpacity
          activeOpacity={0.88}
          style={[
            styles.patientSampleOpenButton,
            !canOpenSampleCollection && styles.patientSampleOpenButtonDisabled,
          ]}
          disabled={!canOpenSampleCollection}
          onPress={() => onOpenSampleCollection?.(patient, activePanelCompany)}>
          <Text style={styles.patientSampleOpenButtonText}>
            Open Sample Collection Module
          </Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.patientSampleCollectedCard}>
        <Text style={styles.patientSampleCollectedTitle}>Collected Samples</Text>
        {tubeSummaryRows.length ? (
          tubeSummaryRows.map((tube, index) => {
          const hasCollected = tube.selectedCount > 0;
          const hasPending = tube.pendingCount > 0;

          return (
            <View
              key={`${tube.tubeName}-${index}`}
              style={styles.patientSampleTubeRow}>
              <Text style={styles.patientSampleTubeName}>{tube.tubeName}</Text>
              <View style={styles.patientSampleTubeStatusGroup}>
                {hasCollected ? (
                  <View
                    style={[
                      styles.patientSampleTubeStatusBadge,
                      styles.patientSampleTubeStatusBadgeCollected,
                    ]}>
                    <Text
                      style={[
                        styles.patientSampleTubeStatusText,
                        styles.patientSampleTubeStatusTextCollected,
                      ]}>
                      {tube.selectedCount} collected
                    </Text>
                  </View>
                ) : null}
                {hasPending || !hasCollected ? (
                  <View
                    style={[
                      styles.patientSampleTubeStatusBadge,
                      styles.patientSampleTubeStatusBadgePending,
                    ]}>
                    <Text
                      style={[
                        styles.patientSampleTubeStatusText,
                        styles.patientSampleTubeStatusTextPending,
                      ]}>
                      {hasPending ? `${tube.pendingCount} pending` : 'Pending'}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
          })
        ) : (
          <Text style={styles.patientSampleUndefinedTubeText}>
            No defined sample tubes found.
          </Text>
        )}
      </View>
    </View>
  );
}

export default React.memo(PatientSampleCollectionSection);
