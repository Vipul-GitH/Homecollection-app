import React, {useMemo, useState} from 'react';
import {Alert, NativeModules, Text, TextInput, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const {LocalDocumentPickerModule} = NativeModules;

const CGHS_TABS = [
  {
    key: 'add-patient',
    label: 'Add Patient',
    icon: 'person-add-outline',
  },
  {
    key: 'my-work',
    label: 'My Work',
    icon: 'list-outline',
  },
];

const DOCUMENT_SECTIONS = [
  {key: 'patientPhotos', label: 'Patient Photos (multi-select)'},
  {key: 'cghsCard', label: 'CGHS / CAPF Card (multi-select)'},
  {key: 'prescription', label: 'Prescription (multi-select)'},
  {key: 'trfLabDocs', label: 'TRF / Lab Docs (multi-select)'},
];

export default function CGHSScreen({styles}) {
  const [activeCghsTab, setActiveCghsTab] = useState('add-patient');
  const [patientName, setPatientName] = useState('');
  const [cghsId, setCghsId] = useState('');
  const [documentsBySection, setDocumentsBySection] = useState({});
  const isAddPatientTab = activeCghsTab === 'add-patient';
  const totalSelectedDocuments = useMemo(
    () =>
      Object.values(documentsBySection).reduce(
        (total, documents) => total + (Array.isArray(documents) ? documents.length : 0),
        0,
      ),
    [documentsBySection],
  );
  const isReadyToSync =
    patientName.trim().length > 0 && cghsId.trim().length > 0 && totalSelectedDocuments > 0;

  const handlePickDocuments = async sectionKey => {
    if (!LocalDocumentPickerModule?.pickDocuments) {
      Alert.alert(
        'Upload Not Available',
        'Document picker module is not available in this build.',
      );
      return;
    }

    try {
      const pickedFiles = await LocalDocumentPickerModule.pickDocuments();
      const normalizedFiles = (Array.isArray(pickedFiles) ? pickedFiles : [])
        .filter(file => file?.uri)
        .map((file, index) => ({
          uri: file.uri,
          name: file.name || `cghs-document-${Date.now()}-${index}`,
          type: file.type || 'application/octet-stream',
        }));

      if (!normalizedFiles.length) {
        return;
      }

      setDocumentsBySection(previousState => ({
        ...previousState,
        [sectionKey]: [...(previousState[sectionKey] || []), ...normalizedFiles],
      }));
    } catch (error) {
      if (
        error?.code === 'DOCUMENT_PICKER_CANCELLED' ||
        String(error?.message || '').toLowerCase().includes('cancel')
      ) {
        return;
      }

      Alert.alert(
        'Upload Failed',
        'Unable to select documents right now. Please try again.',
      );
    }
  };

  const renderAddPatient = () => (
    <View style={styles.cghsAddPatient}>
      <Text style={styles.cghsPageTitle}>ADD PATIENT</Text>

      <View style={styles.cghsStatusRow}>
        <View style={styles.cghsStatusPill}>
          <Text style={styles.cghsStatusLabel}>Docs</Text>
          <Text style={styles.cghsStatusValue}>{totalSelectedDocuments}</Text>
        </View>
        <View style={styles.cghsStatusPill}>
          <Text style={styles.cghsStatusLabel}>Ready to sync</Text>
          <Text style={styles.cghsStatusValue}>{isReadyToSync ? 'Yes' : 'No'}</Text>
        </View>
      </View>

      <View style={styles.cghsFormCard}>
        <Text style={styles.cghsFieldLabel}>PATIENT NAME</Text>
        <TextInput
          value={patientName}
          onChangeText={setPatientName}
          placeholder="Enter Patient Name"
          placeholderTextColor="#7A7F87"
          style={styles.cghsTextInput}
        />

        <Text style={styles.cghsFieldLabel}>CGHS ID / CAPF ID</Text>
        <TextInput
          value={cghsId}
          onChangeText={setCghsId}
          placeholder="Enter CGHS ID"
          placeholderTextColor="#7A7F87"
          autoCapitalize="characters"
          style={styles.cghsTextInput}
        />

        <Text style={styles.cghsDocsSelectedText}>
          Docs selected: {totalSelectedDocuments}
        </Text>
      </View>

      <View style={styles.cghsDocumentHeaderRow}>
        <Text style={styles.cghsDocumentHeader}>SELECT DOCUMENTS</Text>
        <Text style={styles.cghsDocumentTotal}>
          Total selected: {totalSelectedDocuments}
        </Text>
      </View>

      <View style={styles.cghsDocumentSectionList}>
        {DOCUMENT_SECTIONS.map(section => {
          const sectionDocuments = documentsBySection[section.key] || [];

          return (
            <View key={section.key} style={styles.cghsDocumentSection}>
              <View style={styles.cghsDocumentLabelRow}>
                <Text style={styles.cghsDocumentLabel}>{section.label}</Text>
                {sectionDocuments.length ? (
                  <Text style={styles.cghsDocumentCount}>
                    {sectionDocuments.length}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.cghsChooseFileButton}
                onPress={() => handlePickDocuments(section.key)}>
                <Text style={styles.cghsChooseFileButtonText}>Choose file(s)</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        activeOpacity={isReadyToSync ? 0.85 : 1}
        disabled={!isReadyToSync}
        style={[
          styles.cghsSelectDocumentsButton,
          !isReadyToSync && styles.cghsSelectDocumentsButtonDisabled,
        ]}>
        <Text style={styles.cghsSelectDocumentsButtonText}>Select documents</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMyWork = () => (
    <View style={styles.cghsContentCard}>
      <View style={styles.cghsContentIconWrap}>
        <Ionicons name="clipboard-outline" size={24} style={styles.cghsContentIcon} />
      </View>
      <Text style={styles.cghsContentTitle}>My Work</Text>
      <Text style={styles.cghsContentText}>
        CGHS assigned work and activity will appear here.
      </Text>
    </View>
  );

  return (
    <View style={styles.cghsScreen}>
      <View style={styles.cghsTabBar}>
        {CGHS_TABS.map(tab => {
          const isActive = activeCghsTab === tab.key;

          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.85}
              style={[styles.cghsTabButton, isActive && styles.cghsTabButtonActive]}
              onPress={() => setActiveCghsTab(tab.key)}>
              <Ionicons
                name={tab.icon}
                size={16}
                style={[styles.cghsTabIcon, isActive && styles.cghsTabIconActive]}
              />
              <Text
                style={[styles.cghsTabText, isActive && styles.cghsTabTextActive]}
                numberOfLines={1}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isAddPatientTab ? renderAddPatient() : renderMyWork()}
    </View>
  );
}
