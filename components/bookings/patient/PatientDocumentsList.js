import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';

function PatientDocumentsList({styles, documents, isNarrow, onOpenDocument}) {
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
        {documents.map((document, index) => (
          <TouchableOpacity
            key={document.id}
            activeOpacity={0.85}
            onPress={() => onOpenDocument(index)}>
            <Text style={styles.patientDocumentLink}>{document.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default React.memo(PatientDocumentsList);
