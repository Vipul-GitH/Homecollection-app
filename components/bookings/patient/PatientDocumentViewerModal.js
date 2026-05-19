import React from 'react';
import {Image, Modal, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

function PatientDocumentViewerModal({
  styles,
  visible,
  viewerDocument,
  activeCghsDocument,
  documentViewerTests,
  documentViewerHeight,
  documentOffset,
  documentZoom,
  activeDocumentIndex,
  documentCount,
  onClose,
  onNavigate,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.patientDocumentViewerOverlay}>
        <TouchableOpacity
          activeOpacity={1}
          style={styles.patientDocumentViewerBackdrop}
          onPress={onClose}
        />
        <View style={styles.patientDocumentViewerCard}>
          <View style={styles.patientDocumentViewerHeader}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.patientDocumentViewerCloseButton}
              onPress={onClose}>
              <Ionicons
                name="close"
                size={20}
                style={styles.patientDocumentViewerCloseIcon}
              />
            </TouchableOpacity>
          </View>

          {!activeCghsDocument && documentViewerTests.length ? (
            <View style={styles.patientDocumentViewerTestsSection}>
              <ScrollView
                nestedScrollEnabled
                style={styles.patientDocumentViewerTestsScroll}
                contentContainerStyle={styles.patientDocumentViewerTestsWrap}>
                {documentViewerTests.map(test => (
                  <View key={test.id} style={styles.patientDocumentViewerTestChip}>
                    <Text
                      style={styles.patientDocumentViewerTestChipText}
                      numberOfLines={1}>
                      {test.label}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View
            style={[
              styles.patientDocumentViewerImageWrap,
              {minHeight: documentViewerHeight},
            ]}>
            {viewerDocument ? (
              <View
                collapsable={false}
                style={[
                  styles.patientDocumentViewerGestureViewport,
                  {height: documentViewerHeight},
                ]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={onTouchStart}
                onResponderMove={onTouchMove}
                onResponderRelease={onTouchEnd}
                onResponderTerminationRequest={() => false}
                onResponderTerminate={onTouchEnd}>
                <Image
                  source={viewerDocument.imageSource}
                  style={[
                    styles.patientDocumentViewerImage,
                    {height: documentViewerHeight},
                    {
                      transform: [
                        {translateX: documentOffset.x},
                        {translateY: documentOffset.y},
                        {scale: documentZoom},
                      ],
                    },
                  ]}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>

          {activeCghsDocument ? (
            <View style={styles.patientDocumentViewerFooter}>
              <View style={styles.patientDocumentViewerMeta}>
                <Text style={styles.patientDocumentViewerType} numberOfLines={1}>
                  {activeCghsDocument.documentType || 'Document'}
                </Text>
                <Text style={styles.patientDocumentViewerCounter} numberOfLines={1}>
                  {activeCghsDocument.label}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.patientDocumentViewerFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.patientDocumentViewerNavButton}
                onPress={() => onNavigate(-1)}>
                <Ionicons
                  name="chevron-back"
                  size={18}
                  style={styles.patientDocumentViewerNavIcon}
                />
                <Text style={styles.patientDocumentViewerNavText}>Previous</Text>
              </TouchableOpacity>
              <View style={styles.patientDocumentViewerMeta}>
                <Text style={styles.patientDocumentViewerType} numberOfLines={1}>
                  {viewerDocument?.documentType || 'Document'}
                </Text>
                <Text style={styles.patientDocumentViewerCounter} numberOfLines={1}>
                  {viewerDocument?.label ||
                    `${activeDocumentIndex + 1} / ${documentCount}`}
                </Text>
                <Text style={styles.patientDocumentViewerCounter}>
                  {activeDocumentIndex + 1} / {documentCount}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.patientDocumentViewerNavButton}
                onPress={() => onNavigate(1)}>
                <Text style={styles.patientDocumentViewerNavText}>Next</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  style={styles.patientDocumentViewerNavIcon}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(PatientDocumentViewerModal);
