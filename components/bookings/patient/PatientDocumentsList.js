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
  const removableDocuments = safeDocuments.filter(document =>
    Boolean(document?.canRemove),
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
              size={18}
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
        {removableDocuments.length ? (
          <View style={styles.patientDocumentRemoveList}>
            {removableDocuments.map(document => (
              <View key={document.id} style={styles.patientDocumentRemoveChip}>
                <Text style={styles.patientDocumentRemoveText} numberOfLines={1}>
                  {document.label}
                </Text>
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
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(PatientDocumentsList);
