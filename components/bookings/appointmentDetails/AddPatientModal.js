import React from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../../styles/appStyles';
import {
  GENDER_OPTIONS,
  TAG_OPTIONS,
  TITLE_OPTIONS,
} from '../../../screens/bookings/appointmentDetails/constants';
import RequiredLabel from './RequiredLabel';

function AddPatientModal({
  styles,
  isAddPatientModalVisible,
  closeAddPatientModal,
  isNarrowScreen,
  editingPatient,
  addPatientModalStep,
  isAddingPatient,
  isUpdatingPatient,
  linkedPatients,
  selectedLinkedPatientId,
  setSelectedLinkedPatientId,
  handleOpenAddPatientForm,
  handleUseLinkedPatient,
  patientForm,
  updatePatientFormField,
  handleTitleChange,
  isGenderEditable,
  setIsDobCalendarVisible,
  handlePickPatientDocuments,
  patientDocuments,
  handleRemovePatientDocument,
  handlePatientFormPanelCompanyChange,
  setIsPatientFormPanelCompanyFocused,
  shouldShowPatientFormPanelCompanySuggestions,
  filteredPatientFormPanelCompanyItems,
  handleSelectPatientFormPanelCompany,
  handleSubmitAddPatient,
}) {
  return (
        <Modal
          transparent
          animationType="slide"
          visible={isAddPatientModalVisible}
          onRequestClose={closeAddPatientModal}>
          <View style={styles.addPatientModalOverlay}>
            <TouchableOpacity
              activeOpacity={1}
              style={styles.addPatientModalBackdrop}
              onPress={closeAddPatientModal}
            />
            <View
              style={[
                styles.addPatientModalCard,
                styles.addPatientFormModalCard,
                isNarrowScreen && styles.addPatientModalCardCompact,
              ]}>
              <View
                style={[
                  styles.addPatientModalHeader,
                  styles.addPatientFormModalHeader,
                ]}>
                <View style={styles.addPatientFormHeaderText}>
                  <Text
                    style={[
                      styles.addPatientModalTitle,
                      styles.addPatientFormModalTitle,
                    ]}>
                    {editingPatient
                      ? 'Edit Patient'
                      : addPatientModalStep === 'linked-list'
                      ? 'Linked Patients'
                      : 'Add Patient'}
                  </Text>
                  <Text
                    style={[
                      styles.addPatientModalEyebrow,
                      styles.addPatientFormModalEyebrow,
                    ]}>
                    {editingPatient
                      ? 'Update patient details'
                      : addPatientModalStep === 'linked-list'
                      ? 'Choose linked patient or add a new one'
                      : 'Add a new patient to this appointment'}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.addPatientModalCloseButton,
                    styles.addPatientFormModalCloseButton,
                  ]}
                  onPress={closeAddPatientModal}
                  disabled={isAddingPatient || isUpdatingPatient}>
                  <Ionicons
                    name="close"
                    size={20}
                    style={[
                      styles.addPatientModalCloseIcon,
                      styles.addPatientFormModalCloseIcon,
                    ]}
                  />
                </TouchableOpacity>
              </View>
  
              <ScrollView
                style={styles.addPatientModalScroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                  styles.addPatientModalContent,
                  styles.addPatientFormModalContent,
                  !editingPatient &&
                    addPatientModalStep === 'linked-list' &&
                    styles.linkedPatientScrollContent,
                ]}>
                {!editingPatient && addPatientModalStep === 'linked-list' ? (
                  <>
                    <View style={styles.linkedPatientList}>
                      {linkedPatients.length ? (
                        linkedPatients.map(linkedPatient => {
                        const isSelected =
                          selectedLinkedPatientId === linkedPatient.id;
  
                        return (
                          <TouchableOpacity
                            key={linkedPatient.id}
                            activeOpacity={0.85}
                            style={[
                              styles.linkedPatientCard,
                              isSelected && styles.linkedPatientCardActive,
                            ]}
                            onPress={() => setSelectedLinkedPatientId(linkedPatient.id)}>
                            <View style={styles.linkedPatientCardHeader}>
                              <Text style={styles.linkedPatientName}>
                                {linkedPatient.name}
                              </Text>
                              <View
                                style={[
                                  styles.linkedPatientSelectChip,
                                  isSelected &&
                                    styles.linkedPatientSelectChipActive,
                                ]}>
                                <Text
                                  style={[
                                    styles.linkedPatientSelectChipText,
                                    isSelected &&
                                      styles.linkedPatientSelectChipTextActive,
                                  ]}>
                                  {isSelected ? 'Selected' : 'Tap to Select'}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.linkedPatientMeta}>
                              {linkedPatient.gender} | {linkedPatient.age} yrs
                            </Text>
                            <Text style={styles.linkedPatientMeta}>
                              {linkedPatient.mobileNumber}
                            </Text>
                            <Text style={styles.linkedPatientMeta}>
                              Panel: {linkedPatient.panelCompany}
                            </Text>
                          </TouchableOpacity>
                        );
                        })
                      ) : (
                        <View style={styles.panelCompanyEmptyState}>
                          <Text style={styles.panelCompanyEmptyStateText}>
                            No linked patients found for this booking.
                          </Text>
                        </View>
                      )}
                    </View>
  
                  </>
                ) : (
                  <>
                <RequiredLabel styles={styles}>Title</RequiredLabel>
                <View style={styles.addPatientChipGrid}>
                  {TITLE_OPTIONS.map(title => {
                    const isSelected = patientForm.title === title;
                    return (
                      <TouchableOpacity
                        key={title}
                        activeOpacity={0.85}
                        style={[
                          styles.addPatientChoiceChip,
                          isSelected && styles.addPatientChoiceChipActive,
                        ]}
                        onPress={() => handleTitleChange(title)}>
                        <Text
                          style={[
                            styles.addPatientChoiceChipText,
                            isSelected && styles.addPatientChoiceChipTextActive,
                          ]}>
                          {title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
  
                <View style={styles.addPatientInputGroup}>
                  <RequiredLabel styles={styles}>Full Name</RequiredLabel>
                  <TextInput
                    value={patientForm.fullName}
                    onChangeText={value => updatePatientFormField('fullName', value)}
                    placeholder="Patient full name"
                    placeholderTextColor={BRAND.textMuted}
                    style={styles.addPatientInput}
                  />
                </View>
  
                <View
                  style={[
                    styles.addPatientFieldRow,
                    isNarrowScreen && styles.addPatientFieldRowStacked,
                  ]}>
                  <View style={styles.addPatientFieldHalf}>
                    <RequiredLabel styles={styles}>Gender</RequiredLabel>
                    {isGenderEditable ? (
                      <View style={styles.addPatientGenderChipRow}>
                        {GENDER_OPTIONS.map(gender => {
                          const isSelected = patientForm.gender === gender;
                          return (
                            <TouchableOpacity
                              key={gender}
                              activeOpacity={0.85}
                              style={[
                                styles.addPatientGenderChip,
                                isSelected && styles.addPatientGenderChipActive,
                              ]}
                              onPress={() =>
                                updatePatientFormField('gender', gender)
                              }>
                              <Text
                                style={[
                                  styles.addPatientGenderChipText,
                                  isSelected &&
                                    styles.addPatientGenderChipTextActive,
                                ]}>
                                {gender}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.addPatientReadonlyInput}>
                        <Text style={styles.addPatientReadonlyInputText}>
                          {patientForm.gender}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.addPatientFieldHalf}>
                    <RequiredLabel styles={styles}>Age</RequiredLabel>
                    <TextInput
                      value={patientForm.ageYears}
                      onChangeText={value =>
                        updatePatientFormField('ageYears', value.replace(/\D/g, ''))
                      }
                      placeholder="30"
                      placeholderTextColor={BRAND.textMuted}
                      keyboardType="number-pad"
                      maxLength={3}
                      style={styles.addPatientInput}
                    />
                  </View>
                </View>
  
                <View style={styles.addPatientInputGroup}>
                  <Text style={styles.addPatientFieldLabel}>Date of Birth</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.addPatientDatePickerButton}
                    onPress={() => setIsDobCalendarVisible(true)}>
                    <Text
                      style={[
                        styles.addPatientDatePickerText,
                        !patientForm.dateOfBirth &&
                          styles.addPatientDatePickerPlaceholder,
                      ]}>
                      {patientForm.dateOfBirth || 'Select date'}
                    </Text>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      style={styles.addPatientDatePickerIcon}
                    />
                  </TouchableOpacity>
                </View>
  
                <View style={styles.addPatientInputGroup}>
                  <RequiredLabel styles={styles}>Primary Mobile</RequiredLabel>
                  <TextInput
                    value={patientForm.primaryMobile}
                    onChangeText={value =>
                      updatePatientFormField('primaryMobile', value.replace(/\D/g, ''))
                    }
                    placeholder="9898989898"
                    placeholderTextColor={BRAND.textMuted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    style={styles.addPatientInput}
                  />
                </View>
  
                <View style={styles.addPatientInputGroup}>
                  <Text style={styles.addPatientFieldLabel}>Alternate Mobile</Text>
                  <TextInput
                    value={patientForm.alternateMobile}
                    onChangeText={value =>
                      updatePatientFormField(
                        'alternateMobile',
                        value.replace(/\D/g, ''),
                      )
                    }
                    placeholder="Optional"
                    placeholderTextColor={BRAND.textMuted}
                    keyboardType="phone-pad"
                    maxLength={10}
                    style={styles.addPatientInput}
                  />
                </View>
  
                <View style={styles.addPatientInputGroup}>
                  <Text style={styles.addPatientFieldLabel}>Email</Text>
                  <TextInput
                    value={patientForm.email}
                    onChangeText={value => updatePatientFormField('email', value)}
                    placeholder="Optional"
                    placeholderTextColor={BRAND.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={styles.addPatientInput}
                  />
                </View>
  
                <View style={styles.addPatientInputGroup}>
                  <Text style={styles.addPatientFieldLabel}>Documents / Images</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.addPatientDatePickerButton}
                    onPress={handlePickPatientDocuments}>
                    <Text style={styles.addPatientDatePickerText}>
                      Upload Files
                    </Text>
                    <Ionicons
                      name="attach-outline"
                      size={18}
                      style={styles.addPatientDatePickerIcon}
                    />
                  </TouchableOpacity>
                  {patientDocuments.length ? (
                    <View style={styles.panelCompanyListContent}>
                      {patientDocuments.map((document, index) => (
                        <View
                          key={`${document.uri}-${index}`}
                          style={styles.panelCompanyItem}>
                          <View style={styles.panelCompanyItemTextWrap}>
                            <Text style={styles.panelCompanyName} numberOfLines={1}>
                              {document.name}
                            </Text>
                            <Text style={styles.panelCompanyMeta} numberOfLines={1}>
                              {document.type}
                            </Text>
                          </View>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            style={styles.patientEditButton}
                            onPress={() => handleRemovePatientDocument(index)}>
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              style={styles.patientEditButtonIcon}
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
  
                <View
                  style={[
                    styles.addPatientFieldRow,
                    isNarrowScreen && styles.addPatientFieldRowStacked,
                  ]}>
                  <View style={styles.addPatientFieldHalf}>
                    <Text style={styles.addPatientFieldLabel}>Labmate PID</Text>
                    <TextInput
                      value={patientForm.labmatePid}
                      onChangeText={value =>
                        updatePatientFormField('labmatePid', value)
                      }
                      placeholder="1000000"
                      placeholderTextColor={BRAND.textMuted}
                      keyboardType="number-pad"
                      style={styles.addPatientInput}
                    />
                  </View>
                  <View style={styles.addPatientFieldHalf}>
                    <RequiredLabel styles={styles}>Panel</RequiredLabel>
                    <TextInput
                      value={patientForm.panelCompany}
                      onChangeText={handlePatientFormPanelCompanyChange}
                      onFocus={() => setIsPatientFormPanelCompanyFocused(true)}
                      onBlur={() => {
                        setTimeout(() => {
                          setIsPatientFormPanelCompanyFocused(false);
                        }, 120);
                      }}
                      placeholder="CGHS"
                      placeholderTextColor={BRAND.textMuted}
                      style={styles.addPatientInput}
                    />
                    {shouldShowPatientFormPanelCompanySuggestions ? (
                      filteredPatientFormPanelCompanyItems.length ? (
                        <View style={styles.panelCompanyListContent}>
                          {filteredPatientFormPanelCompanyItems.map(company => (
                            <TouchableOpacity
                              key={`patient-form-company-${company.id}`}
                              activeOpacity={0.85}
                              style={styles.panelCompanyItem}
                              onPress={() =>
                                handleSelectPatientFormPanelCompany(company)
                              }>
                              <View style={styles.panelCompanyItemTextWrap}>
                                <Text
                                  style={styles.panelCompanyName}
                                  numberOfLines={1}>
                                  {company.name}
                                </Text>
                                <Text
                                  style={styles.panelCompanyMeta}
                                  numberOfLines={1}>
                                  {company.details || 'No details available'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.panelCompanyEmptyState}>
                          <Text style={styles.panelCompanyEmptyStateText}>
                            No matching panel company found.
                          </Text>
                        </View>
                      )
                    ) : null}
                  </View>
                </View>
  
                <Text style={styles.addPatientFieldLabel}>Tag</Text>
                <View style={styles.addPatientChipGrid}>
                  {TAG_OPTIONS.map(tag => {
                    const isSelected = patientForm.tag === tag;
                    return (
                      <TouchableOpacity
                        key={tag}
                        activeOpacity={0.85}
                        style={[
                          styles.addPatientChoiceChip,
                          isSelected && styles.addPatientChoiceChipActive,
                        ]}
                        onPress={() => updatePatientFormField('tag', tag)}>
                        <Text
                          style={[
                            styles.addPatientChoiceChipText,
                            isSelected && styles.addPatientChoiceChipTextActive,
                          ]}>
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                  </>
                )}
              </ScrollView>
  
              {!editingPatient && addPatientModalStep === 'linked-list' ? (
                <View style={styles.linkedPatientActionFooter}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[
                      styles.addPatientSubmitButton,
                      styles.linkedPatientPrimaryButton,
                      (!linkedPatients.length || isAddingPatient) &&
                        styles.addPatientSubmitButtonDisabled,
                    ]}
                    onPress={handleUseLinkedPatient}
                    disabled={!linkedPatients.length || isAddingPatient}>
                    {isAddingPatient ? (
                      <ActivityIndicator color={BRAND.surface} />
                    ) : (
                      <>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={18}
                          style={styles.addPatientSubmitButtonIcon}
                        />
                        <Text style={styles.addPatientSubmitButtonText}>
                          Use Selected Patient
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
  
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.linkedPatientSecondaryButton}
                    onPress={handleOpenAddPatientForm}>
                    <Ionicons
                      name="person-add-outline"
                      size={18}
                      style={styles.linkedPatientSecondaryButtonIcon}
                    />
                    <Text style={styles.linkedPatientSecondaryButtonText}>
                      Add New Patient
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
  
              {editingPatient || addPatientModalStep === 'form' ? (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.addPatientSubmitButton,
                    styles.addPatientFormSubmitButton,
                    isAddingPatient && styles.addPatientSubmitButtonDisabled,
                    isUpdatingPatient && styles.addPatientSubmitButtonDisabled,
                  ]}
                  onPress={handleSubmitAddPatient}
                  disabled={isAddingPatient || isUpdatingPatient}>
                  {isAddingPatient || isUpdatingPatient ? (
                    <ActivityIndicator color={BRAND.surface} />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        style={[
                          styles.addPatientSubmitButtonIcon,
                          styles.addPatientFormSubmitButtonIcon,
                        ]}
                      />
                      <Text
                        style={[
                          styles.addPatientSubmitButtonText,
                          styles.addPatientFormSubmitButtonText,
                        ]}>
                        {editingPatient ? 'Update Patient' : 'Save Patient'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </Modal>
  );
}

export default React.memo(AddPatientModal);
