import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function PatientDocumentsList({
  styles,
  documents,
  isNarrow,
  onOpenDocument,
  onUploadDocument,
  onRemoveDocument,
}) {
  const safeDocuments = Array.isArray(documents) ? documents : [];
  const canOpenDocuments = safeDocuments.length > 0;
  const canUploadDocuments = typeof onUploadDocument === 'function';
  const visibleDocuments = safeDocuments.filter(document =>
    Boolean(document?.label),
  );

  if (!canOpenDocuments && !canUploadDocuments) {
    return null;
  }

  return (
    <View
      style={[
        styles.patientDetailInfoRow,
        isNarrow && styles.patientDetailInfoRowStacked,
      ]}>
      <Text style={styles.patientDetailLabel}>Documents</Text>
      <View
        style={[
          styles.patientDetailDocumentsWrap,
          isNarrow && styles.patientDetailDocumentsWrapStacked,
        ]}>
        {canOpenDocuments ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.patientDocumentIconButton}
            onPress={() => onOpenDocument(0)}>
            <Ionicons
              name="document-attach-outline"
              size={22}
              style={styles.patientDocumentIcon}
            />
            <Text style={styles.patientDocumentCount}>
              {safeDocuments.length}
            </Text>
          </TouchableOpacity>
        ) : null}
        {canUploadDocuments ? (
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.patientDocumentUploadButton}
            onPress={onUploadDocument}>
            <Ionicons
              name="cloud-upload-outline"
              size={15}
              style={styles.patientDocumentUploadIcon}
            />
            <Text style={styles.patientDocumentUploadText}>Upload</Text>
          </TouchableOpacity>
        ) : null}
        {visibleDocuments.length ? (
          <View style={styles.patientDocumentRemoveList}>
            {visibleDocuments.map(document => (
              <View key={document.id} style={styles.patientDocumentRemoveChip}>
                <Text style={styles.patientDocumentRemoveText} numberOfLines={1}>
                  {document.label}
                </Text>
                {document?.canRemove ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.patientDocumentRemoveButton}
                    onPress={() => onRemoveDocument?.(document)}>
                    <Ionicons
                      name="close"
                      size={12}
                      style={styles.patientDocumentRemoveIcon}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(PatientDocumentsList);
