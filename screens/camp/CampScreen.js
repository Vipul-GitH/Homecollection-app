import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeModules,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import CalendarPickerModal from '../bookings/appointmentDetails/CalendarPickerModal';
import {
  calculateAgeFromDob,
  getCalendarDays,
  toDateInputValue,
} from '../bookings/appointmentDetails/helpers';
import {
  addCampPatientApi,
  fetchCampPatientsApi,
} from '../../services/api/campApi';

const {PrinterModule} = NativeModules;

const CAMP_STORAGE_KEY = '@homecollection/camps/v1';
const SAVED_PRINTER_KEY = '@homecollection/default_printer';
const GENDERS = ['Male', 'Female', 'Other'];
const GENDER_META = {
  Male: {icon: 'male', color: '#2563EB'},
  Female: {icon: 'female', color: '#DB2777'},
  Other: {icon: 'people', color: '#7C3AED'},
};
const SAMPLE_TYPES = [
  'EDTA',
  'Plain',
  'Flu-F',
  'Flu-PP',
  'Flu-R',
];

const SAMPLE_TYPE_META = {
  EDTA: {icon: 'water-outline', color: '#7C3AED', background: '#F3E8FF'},
  Plain: {icon: 'ellipse-outline', color: '#DC2626', background: '#FEECEC'},
  'Flu-F': {icon: 'snow-outline', color: '#0891B2', background: '#E6F8FC'},
  'Flu-PP': {icon: 'snow-outline', color: '#0D9488', background: '#E6F7F4'},
  'Flu-R': {icon: 'snow-outline', color: '#2563EB', background: '#EAF2FF'},
};

const emptyPatientForm = {
  name: '',
  mobile: '',
  dob: '',
  age: '',
  gender: '',
  sampleType: '',
};

const extractCampPatients = responseData => {
  const candidates = [
    responseData,
    responseData?.patients,
    responseData?.data,
    responseData?.data?.patients,
    responseData?.items,
    responseData?.results,
  ];
  const sourcePatients = candidates.find(Array.isArray) || [];

  return sourcePatients.map((patient, index) => ({
    ...patient,
    id: String(
      patient?.id ||
        patient?.camp_patient_id ||
        patient?.patient_id ||
        `camp-patient-${index}`,
    ),
    name: String(patient?.patient_name || patient?.name || '').trim(),
    mobile: String(
      patient?.mobile_no || patient?.mobile || patient?.primary_mobile || '',
    ).trim(),
    dob: String(patient?.dob || patient?.date_of_birth || '').trim(),
    age: String(patient?.age ?? patient?.age_years ?? '').trim(),
    gender: String(patient?.gender || '').trim(),
    sampleType: String(
      patient?.sample_type || patient?.sampleType || '',
    ).trim(),
    barcodeId: String(
      patient?.barcode_id || patient?.barcodeId || patient?.barcode || '',
    ).trim(),
  }));
};

const parseSavedPrinter = value => {
  if (!value) {
    return null;
  }
  try {
    const printer = JSON.parse(value);
    return printer?.address ? printer : null;
  } catch {
    return null;
  }
};

const getPrintDateText = () => {
  const date = new Date();
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('/');
};

const FieldLabel = ({icon, children, required = true}) => (
  <View style={localStyles.fieldLabelRow}>
    <Ionicons name={icon} size={16} color="#1769E0" />
    <Text style={localStyles.fieldLabel}>{children}</Text>
    {required ? <Text style={localStyles.requiredMark}>*</Text> : null}
  </View>
);

export default function CampScreen({
  styles,
  accessToken,
  loggedInUser,
  onSessionExpired,
}) {
  const [campInput, setCampInput] = useState('');
  const [activeCampId, setActiveCampId] = useState('');
  const [camps, setCamps] = useState({});
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeCampTab, setActiveCampTab] = useState('add');
  const [isFetchingPatients, setIsFetchingPatients] = useState(false);
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [printingPatientId, setPrintingPatientId] = useState('');
  const [isDobCalendarVisible, setIsDobCalendarVisible] = useState(false);
  const [dobCalendarMonth, setDobCalendarMonth] = useState(
    () => new Date(new Date().getFullYear() - 25, new Date().getMonth(), 1),
  );

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(CAMP_STORAGE_KEY)
      .then(value => {
        if (!mounted || !value) {
          return;
        }
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          setCamps(parsed);
        }
      })
      .catch(() => {
        if (mounted) {
          setError('Saved camp data could not be loaded.');
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const patients = useMemo(
    () => camps[activeCampId]?.patients || [],
    [activeCampId, camps],
  );

  const saveCamps = async nextCamps => {
    setCamps(nextCamps);
    await AsyncStorage.setItem(CAMP_STORAGE_KEY, JSON.stringify(nextCamps));
  };

  const openCamp = () => {
    const campId = campInput.trim();
    if (!campId) {
      setError('Camp ID is required.');
      return;
    }
    setActiveCampId(campId);
    setCampInput(campId);
    setPatientForm(emptyPatientForm);
    setActiveCampTab('add');
    setError('');
  };

  const changeCamp = () => {
    setActiveCampId('');
    setCampInput('');
    setPatientForm(emptyPatientForm);
    setActiveCampTab('add');
    setError('');
  };

  const openPatientsTab = async () => {
    setActiveCampTab('patients');
    setIsFetchingPatients(true);
    setError('');
    try {
      const responseData = await fetchCampPatientsApi({
        accessToken,
        campId: activeCampId,
      });
      const fetchedPatients = extractCampPatients(responseData);
      await saveCamps({
        ...camps,
        [activeCampId]: {
          campId: activeCampId,
          patients: fetchedPatients,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (apiError) {
      if (apiError?.status === 401) {
        Promise.resolve(onSessionExpired?.()).catch(() => {});
      }
      setError(
        apiError?.message ||
          'Patient details could not be fetched. Please try again.',
      );
    } finally {
      setIsFetchingPatients(false);
    }
  };

  const updatePatientField = (field, value) => {
    setPatientForm(previous => {
      const next = {...previous, [field]: value};
      if (field === 'dob') {
        const calculatedAge = calculateAgeFromDob(value.trim());
        if (calculatedAge) {
          next.age = calculatedAge;
        }
      }
      return next;
    });
    setError('');
  };

  const addPatient = async () => {
    const patient = {
      name: patientForm.name.trim(),
      mobile: patientForm.mobile.trim(),
      dob: patientForm.dob.trim(),
      age: patientForm.age.trim(),
      gender: patientForm.gender,
      sampleType: patientForm.sampleType,
    };

    if (
      !patient.name ||
      !patient.dob ||
      !patient.age ||
      !patient.gender ||
      !patient.sampleType
    ) {
      setError('Please fill all required patient fields.');
      return;
    }
    if (patient.mobile && !/^\d{10}$/.test(patient.mobile)) {
      setError('Mobile number must contain exactly 10 digits.');
      return;
    }
    if (!calculateAgeFromDob(patient.dob)) {
      setError('DOB must be a valid past date in YYYY-MM-DD format.');
      return;
    }
    if (!/^\d{1,3}$/.test(patient.age)) {
      setError('Age must be a valid number.');
      return;
    }

    const newPatient = {
      ...patient,
      campId: activeCampId,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    };

    setIsAddingPatient(true);
    setError('');
    try {
      const responseData = await addCampPatientApi({
        accessToken,
        patient: newPatient,
      });
      const savedPatient = {
        ...newPatient,
        barcodeId: String(
          responseData?.barcode_id ||
            responseData?.barcodeId ||
            responseData?.data?.barcode_id ||
            responseData?.item?.barcode_id ||
            '',
        ).trim(),
        serverResponse: responseData,
      };
      const nextCamps = {
        ...camps,
        [activeCampId]: {
          campId: activeCampId,
          patients: [...patients, savedPatient],
          updatedAt: new Date().toISOString(),
        },
      };
      await saveCamps(nextCamps);
      setPatientForm(emptyPatientForm);
      setError('');
    } catch (apiError) {
      if (apiError?.status === 401) {
        Promise.resolve(onSessionExpired?.()).catch(() => {});
      }
      setError(apiError?.message || 'Patient could not be saved. Please try again.');
    } finally {
      setIsAddingPatient(false);
    }
  };

  const moveDobCalendarMonth = monthOffset => {
    setDobCalendarMonth(previousMonth =>
      new Date(
        previousMonth.getFullYear(),
        previousMonth.getMonth() + monthOffset,
        1,
      ),
    );
  };

  const openDobCalendar = () => {
    const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(patientForm.dob)
      ? new Date(`${patientForm.dob}T00:00:00`)
      : null;
    if (selectedDate && !Number.isNaN(selectedDate.getTime())) {
      setDobCalendarMonth(
        new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
      );
    }
    setIsDobCalendarVisible(true);
  };

  const selectDobDate = date => {
    const dob = toDateInputValue(date);
    setPatientForm(previous => ({
      ...previous,
      dob,
      age: calculateAgeFromDob(dob),
    }));
    setError('');
    setIsDobCalendarVisible(false);
  };

  const printPatientBarcode = async patient => {
    const barcodeId = String(
      patient?.barcodeId || patient?.barcode_id || '',
    ).trim();
    if (!barcodeId) {
      Alert.alert('Barcode Missing', 'Backend did not provide a barcode ID.');
      return;
    }

    if (!PrinterModule?.printTubeLabels) {
      Alert.alert(
        'Printer Unavailable',
        'Printer module is not available in this APK build.',
      );
      return;
    }

    setPrintingPatientId(patient.id);
    try {
      const savedPrinter = parseSavedPrinter(
        await AsyncStorage.getItem(SAVED_PRINTER_KEY),
      );
      if (!savedPrinter?.address) {
        Alert.alert(
          'Printer Not Selected',
          'Please select a default printer from Profile > Printer first.',
        );
        return;
      }

      await PrinterModule.printTubeLabels(
        savedPrinter.address,
        savedPrinter.transport || '',
        [
          {
            patientName: patient.name || 'Patient',
            ageGender: [patient.age ? `${patient.age} Yrs` : '', patient.gender]
              .filter(Boolean)
              .join(' '),
            tubeName: patient.sampleType || 'Sample',
            tubeCode: barcodeId,
            barcode: barcodeId,
            dateText: getPrintDateText(),
            phleboName: String(loggedInUser || '').trim(),
          },
        ],
      );
      Alert.alert('Label Printed', `Barcode ${barcodeId} printed successfully.`);
    } catch (printError) {
      Alert.alert(
        'Print Failed',
        printError?.message || 'Unable to print patient barcode.',
      );
    } finally {
      setPrintingPatientId('');
    }
  };

  if (isLoading) {
    return (
      <View style={localStyles.loadingContainer}>
        <ActivityIndicator size="large" color="#1769E0" />
        <Text style={localStyles.helperText}>Loading camp data...</Text>
      </View>
    );
  }

  return (
    <View style={localStyles.screen}>
      {!activeCampId ? (
        <View style={localStyles.card}>
          <Text style={localStyles.sectionTitle}>Camp ID</Text>
          <Text style={localStyles.helperText}>
            Enter a Camp ID to add or view patients for that camp.
          </Text>
          <View style={localStyles.campRow}>
            <TextInput
              value={campInput}
              onChangeText={setCampInput}
              placeholder="Enter Camp ID"
              placeholderTextColor="#8795A9"
              autoCapitalize="characters"
              style={[localStyles.input, localStyles.campInput]}
            />
            <TouchableOpacity
              style={localStyles.primaryButton}
              onPress={openCamp}>
              <Text style={localStyles.primaryButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text style={localStyles.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      {activeCampId ? (
        <>
          <View style={localStyles.campBanner}>
            <View>
              <Text style={localStyles.bannerLabel}>ACTIVE CAMP</Text>
              <Text style={localStyles.bannerValue}>{activeCampId}</Text>
            </View>
            <View style={localStyles.campBannerActions}>
              <TouchableOpacity
                style={localStyles.changeCampButton}
                onPress={changeCamp}>
                <Ionicons name="swap-horizontal" size={17} color="#1769E0" />
                <Text style={localStyles.changeCampText}>Change Camp</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={localStyles.campTabs}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                localStyles.campTabButton,
                activeCampTab === 'add' && localStyles.campTabButtonActive,
              ]}
              onPress={() => {
                setActiveCampTab('add');
                setError('');
              }}>
              <Ionicons
                name={activeCampTab === 'add' ? 'person-add' : 'person-add-outline'}
                size={21}
                color={activeCampTab === 'add' ? '#FFFFFF' : '#1769E0'}
              />
              <Text
                style={[
                  localStyles.campTabText,
                  activeCampTab === 'add' && localStyles.campTabTextActive,
                ]}>
                Add Patient
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                localStyles.campTabButton,
                activeCampTab === 'patients' && localStyles.campTabButtonActive,
              ]}
              onPress={openPatientsTab}>
              {isFetchingPatients ? (
                <ActivityIndicator
                  size="small"
                  color={activeCampTab === 'patients' ? '#FFFFFF' : '#1769E0'}
                />
              ) : (
                <Ionicons
                  name={activeCampTab === 'patients' ? 'people' : 'people-outline'}
                  size={21}
                  color={activeCampTab === 'patients' ? '#FFFFFF' : '#1769E0'}
                />
              )}
              <Text
                style={[
                  localStyles.campTabText,
                  activeCampTab === 'patients' && localStyles.campTabTextActive,
                ]}>
                Patients ({patients.length})
              </Text>
            </TouchableOpacity>
          </View>

          {activeCampTab === 'add' ? (
          <View style={[localStyles.card, localStyles.patientFormCard]}>
            <View style={localStyles.patientFormHeader}>
              <View style={localStyles.patientFormHeaderIcon}>
                <Ionicons name="person-add" size={24} color="#FFFFFF" />
              </View>
              <View style={localStyles.patientFormHeaderText}>
                <Text style={localStyles.sectionTitle}>Add New Patient</Text>
                <Text style={localStyles.helperText}>
                  Enter patient and sample details
                </Text>
              </View>
              <View style={localStyles.stepBadge}>
                <Text style={localStyles.stepBadgeText}>NEW</Text>
              </View>
            </View>

            <View style={localStyles.formSection}>
              <FieldLabel icon="person-outline">Patient Name</FieldLabel>
              <View style={localStyles.inputShell}>
                <View style={localStyles.inputIconWrap}>
                  <Ionicons name="person-outline" size={20} color="#1769E0" />
                </View>
                <TextInput
                  value={patientForm.name}
                  onChangeText={value => updatePatientField('name', value)}
                  placeholder="Enter full name"
                  placeholderTextColor="#8795A9"
                  autoCapitalize="words"
                  style={localStyles.inputControl}
                />
              </View>

              <FieldLabel icon="call-outline" required={false}>
                Mobile Number (Optional)
              </FieldLabel>
              <View style={localStyles.inputShell}>
                <View style={localStyles.inputIconWrap}>
                  <Ionicons name="call-outline" size={20} color="#1769E0" />
                </View>
                <Text style={localStyles.mobilePrefix}>+91</Text>
                <View style={localStyles.inputDivider} />
                <TextInput
                  value={patientForm.mobile}
                  onChangeText={value =>
                    updatePatientField('mobile', value.replace(/\D/g, ''))
                  }
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#8795A9"
                  keyboardType="phone-pad"
                  maxLength={10}
                  style={localStyles.inputControl}
                />
              </View>

              <View style={localStyles.twoColumnRow}>
                <View style={localStyles.dobField}>
                  <FieldLabel icon="calendar-outline">Date of Birth</FieldLabel>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={localStyles.inputShell}
                    onPress={openDobCalendar}>
                    <View style={localStyles.inputIconWrap}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color="#1769E0"
                      />
                    </View>
                    <Text
                      style={[
                        localStyles.dateInputText,
                        !patientForm.dob && localStyles.inputPlaceholder,
                      ]}>
                      {patientForm.dob || 'Select DOB'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <View style={localStyles.ageField}>
                  <FieldLabel icon="time-outline">Age</FieldLabel>
                  <View style={localStyles.inputShell}>
                    <TextInput
                      value={patientForm.age}
                      onChangeText={value =>
                        updatePatientField('age', value.replace(/\D/g, ''))
                      }
                      placeholder="Age"
                      placeholderTextColor="#8795A9"
                      keyboardType="number-pad"
                      maxLength={3}
                      style={[localStyles.inputControl, localStyles.ageControl]}
                    />
                    <Text style={localStyles.yearSuffix}>Yrs</Text>
                  </View>
                </View>
              </View>

              <FieldLabel icon="people-outline">Gender</FieldLabel>
              <View style={localStyles.genderRow}>
                {GENDERS.map(gender => {
                  const isSelected = patientForm.gender === gender;
                  const meta = GENDER_META[gender];
                  return (
                    <TouchableOpacity
                      key={gender}
                      activeOpacity={0.82}
                      style={[
                        localStyles.genderButton,
                        isSelected && localStyles.genderButtonActive,
                      ]}
                      onPress={() => updatePatientField('gender', gender)}>
                      <Ionicons
                        name={meta.icon}
                        size={21}
                        color={isSelected ? '#FFFFFF' : meta.color}
                      />
                      <Text
                        style={[
                          localStyles.genderText,
                          isSelected && localStyles.genderTextActive,
                        ]}>
                        {gender}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={localStyles.sectionDivider} />
            <View style={localStyles.sampleSectionHeader}>
              <View>
                <FieldLabel icon="flask-outline">Sample Tube</FieldLabel>
                <Text style={localStyles.fieldHelper}>Select one tube type</Text>
              </View>
              {patientForm.sampleType ? (
                <View style={localStyles.selectedBadge}>
                  <Ionicons name="checkmark" size={15} color="#15803D" />
                  <Text style={localStyles.selectedBadgeText}>Selected</Text>
                </View>
              ) : null}
            </View>
            <View style={localStyles.sampleTypeGrid}>
              {SAMPLE_TYPES.map(sampleType => {
                const isSelected = patientForm.sampleType === sampleType;
                const meta = SAMPLE_TYPE_META[sampleType];
                return (
                  <TouchableOpacity
                    key={sampleType}
                    activeOpacity={0.82}
                    style={[
                      localStyles.sampleTypeButton,
                      {backgroundColor: meta.background},
                      isSelected && [
                        localStyles.sampleTypeButtonActive,
                        {borderColor: meta.color},
                      ],
                    ]}
                    onPress={() => updatePatientField('sampleType', sampleType)}>
                    <View
                      style={[
                        localStyles.sampleTypeIcon,
                        {backgroundColor: meta.color},
                      ]}>
                      <Ionicons name={meta.icon} size={21} color="#FFFFFF" />
                    </View>
                    <Text
                      style={[
                        localStyles.sampleTypeText,
                        {color: meta.color},
                      ]}>
                      {sampleType}
                    </Text>
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={isSelected ? meta.color : '#94A3B8'}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>

            {error ? (
              <View style={localStyles.errorBanner}>
                <Ionicons name="alert-circle" size={20} color="#B42318" />
                <Text style={localStyles.errorText}>{error}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              activeOpacity={0.86}
              style={[
                localStyles.addButton,
                isAddingPatient && localStyles.addButtonDisabled,
              ]}
              onPress={addPatient}
              disabled={isAddingPatient}>
              <View style={localStyles.addButtonIcon}>
                {isAddingPatient ? (
                  <ActivityIndicator size="small" color="#1769E0" />
                ) : (
                  <Ionicons name="person-add" size={20} color="#1769E0" />
                )}
              </View>
              <Text style={localStyles.addButtonText}>
                {isAddingPatient ? 'Adding Patient...' : 'Add Patient to Camp'}
              </Text>
              <Ionicons name="arrow-forward" size={21} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          ) : (
          <View style={localStyles.card}>
            <View style={localStyles.patientListHeader}>
              <View>
                <Text style={localStyles.sectionTitle}>Patient Details</Text>
                <Text style={localStyles.helperText}>
                  Patients saved under Camp {activeCampId}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityLabel="Refresh patient details"
                style={localStyles.refreshButton}
                onPress={openPatientsTab}>
                {isFetchingPatients ? (
                  <ActivityIndicator size="small" color="#1769E0" />
                ) : (
                  <Ionicons name="refresh" size={21} color="#1769E0" />
                )}
              </TouchableOpacity>
            </View>
            {error ? (
              <View style={localStyles.errorBannerList}>
                <Ionicons name="alert-circle" size={20} color="#B42318" />
                <Text style={localStyles.errorText}>{error}</Text>
              </View>
            ) : null}
            {patients.length ? (
              patients.map((patient, index) => (
                <View key={patient.id} style={localStyles.patientCard}>
                  <View style={localStyles.patientNumber}>
                    <Text style={localStyles.patientNumberText}>{index + 1}</Text>
                  </View>
                  <View style={localStyles.patientDetails}>
                    <Text style={localStyles.patientName}>{patient.name}</Text>
                    <Text style={localStyles.patientMeta}>
                      {patient.gender} · Age {patient.age} · DOB {patient.dob}
                    </Text>
                    {patient.mobile ? (
                      <Text style={localStyles.patientMeta}>
                        Mobile: {patient.mobile}
                      </Text>
                    ) : null}
                    <Text style={localStyles.sampleText}>
                      Sample: {patient.sampleType}
                    </Text>
                    {patient.barcodeId ? (
                      <Text style={localStyles.barcodeText}>
                        Barcode: {patient.barcodeId}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    accessibilityLabel={`Print barcode for ${patient.name}`}
                    style={[
                      localStyles.printButton,
                      (!patient.barcodeId || printingPatientId === patient.id) &&
                        localStyles.printButtonDisabled,
                    ]}
                    disabled={
                      !patient.barcodeId || printingPatientId === patient.id
                    }
                    onPress={() => printPatientBarcode(patient)}>
                    {printingPatientId === patient.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="print" size={20} color="#FFFFFF" />
                    )}
                    <Text style={localStyles.printButtonText}>Print</Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={localStyles.emptyText}>
                No patients added for this camp yet.
              </Text>
            )}
          </View>
          )}
        </>
      ) : null}
      <CalendarPickerModal
        styles={styles}
        visible={isDobCalendarVisible}
        eyebrow="Date of Birth"
        title={patientForm.dob || 'Select DOB'}
        calendarMonth={dobCalendarMonth}
        calendarDays={getCalendarDays(dobCalendarMonth)}
        selectedDateValue={patientForm.dob}
        onClose={() => setIsDobCalendarVisible(false)}
        onMoveMonth={moveDobCalendarMonth}
        onSelectDate={selectDobDate}
        quickActions={[
          {label: '-10 yr', onPress: () => moveDobCalendarMonth(-120)},
          {label: '-1 yr', onPress: () => moveDobCalendarMonth(-12)},
          {label: '+1 yr', onPress: () => moveDobCalendarMonth(12)},
          {label: '+10 yr', onPress: () => moveDobCalendarMonth(120)},
        ]}
        disableDate={date => date > new Date()}
        emptyKeyPrefix="camp-dob-empty"
        dateKeyPrefix="camp-dob"
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  screen: {width: '100%', gap: 16, paddingBottom: 8},
  loadingContainer: {alignItems: 'center', paddingVertical: 60, gap: 12},
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DFE8F4',
    padding: 18,
    gap: 15,
  },
  patientFormCard: {
    padding: 0,
    overflow: 'hidden',
    gap: 0,
  },
  patientFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 17,
    backgroundColor: '#EDF4FF',
    borderBottomWidth: 1,
    borderBottomColor: '#D6E5FA',
  },
  patientFormHeaderIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1769E0',
  },
  patientFormHeaderText: {flex: 1},
  stepBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#DCEAFF',
  },
  stepBadgeText: {fontSize: 11, fontWeight: '900', color: '#1769E0'},
  formSection: {gap: 10, paddingHorizontal: 18, paddingTop: 18},
  sectionTitle: {fontSize: 20, fontWeight: '800', color: '#14213A'},
  helperText: {fontSize: 15, lineHeight: 21, color: '#64748B'},
  campRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  input: {
    minHeight: 58,
    borderWidth: 1,
    borderColor: '#CBD8E8',
    borderRadius: 14,
    backgroundColor: '#F8FAFD',
    paddingHorizontal: 16,
    fontSize: 17,
    color: '#14213A',
  },
  fieldLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4},
  requiredMark: {fontSize: 15, fontWeight: '900', color: '#DC2626'},
  inputShell: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#CCD9EA',
    borderRadius: 15,
    paddingHorizontal: 11,
    backgroundColor: '#F9FBFE',
  },
  inputIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F1FF',
  },
  inputControl: {flex: 1, minHeight: 56, paddingVertical: 0, fontSize: 16, color: '#14213A'},
  mobilePrefix: {fontSize: 16, fontWeight: '800', color: '#334155'},
  inputDivider: {width: 1, height: 26, backgroundColor: '#D6E0ED'},
  campInput: {flex: 1},
  primaryButton: {
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#1769E0',
  },
  primaryButtonText: {fontSize: 16, fontWeight: '800', color: '#FFFFFF'},
  campBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 18,
    backgroundColor: '#EAF2FF',
    borderWidth: 1,
    borderColor: '#C7DBFA',
  },
  bannerLabel: {fontSize: 12, fontWeight: '800', color: '#53709C'},
  bannerValue: {fontSize: 22, fontWeight: '900', color: '#123A73', marginTop: 2},
  campBannerActions: {alignItems: 'flex-end', gap: 8},
  changeCampButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  changeCampText: {fontSize: 13, fontWeight: '800', color: '#1769E0'},
  campTabs: {
    flexDirection: 'row',
    gap: 10,
    padding: 6,
    borderRadius: 18,
    backgroundColor: '#E8EFF8',
  },
  campTabButton: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  campTabButtonActive: {
    backgroundColor: '#1769E0',
    shadowColor: '#1769E0',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  campTabText: {fontSize: 14, fontWeight: '800', color: '#1769E0'},
  campTabTextActive: {color: '#FFFFFF'},
  twoColumnRow: {flexDirection: 'row', gap: 12},
  dobField: {flex: 1, gap: 10},
  ageField: {width: 112, gap: 10},
  dateInputText: {flex: 1, fontSize: 15, fontWeight: '700', color: '#14213A'},
  inputPlaceholder: {fontWeight: '400', color: '#8795A9'},
  ageControl: {textAlign: 'center', fontWeight: '800'},
  yearSuffix: {fontSize: 13, fontWeight: '800', color: '#64748B'},
  fieldLabel: {fontSize: 15, fontWeight: '800', color: '#334155', marginTop: 2},
  genderRow: {flexDirection: 'row', gap: 9},
  genderButton: {
    flex: 1,
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: '#D6E0ED',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  genderButtonActive: {borderColor: '#1769E0', backgroundColor: '#1769E0'},
  genderText: {fontSize: 14, fontWeight: '800', color: '#475569'},
  genderTextActive: {color: '#FFFFFF'},
  sectionDivider: {height: 8, marginTop: 20, backgroundColor: '#F1F5F9'},
  sampleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 17,
  },
  fieldHelper: {fontSize: 13, color: '#64748B', marginTop: 5},
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#DCFCE7',
  },
  selectedBadgeText: {fontSize: 12, fontWeight: '800', color: '#15803D'},
  sampleTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 13,
  },
  sampleTypeButton: {
    minHeight: 62,
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sampleTypeButtonActive: {
    shadowColor: '#14213A',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  sampleTypeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleTypeText: {flex: 1, fontSize: 15, fontWeight: '900'},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 18,
    marginTop: 15,
    borderRadius: 13,
    padding: 12,
    backgroundColor: '#FEF0F0',
  },
  errorText: {flex: 1, fontSize: 14, lineHeight: 20, color: '#B42318'},
  addButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    margin: 18,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: '#1769E0',
  },
  addButtonDisabled: {opacity: 0.7},
  addButtonIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  addButtonText: {flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: '#FFFFFF'},
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    minHeight: 76,
    padding: 14,
    backgroundColor: '#FBFCFE',
  },
  patientListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 4,
  },
  refreshButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2FF',
  },
  errorBannerList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 13,
    padding: 12,
    backgroundColor: '#FEF0F0',
  },
  patientNumber: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2FF',
  },
  patientNumberText: {fontSize: 15, fontWeight: '900', color: '#1769E0'},
  patientDetails: {flex: 1},
  patientName: {fontSize: 17, fontWeight: '800', color: '#14213A'},
  patientMeta: {fontSize: 14, lineHeight: 20, color: '#64748B', marginTop: 2},
  sampleText: {fontSize: 14, fontWeight: '700', color: '#1769E0', marginTop: 2},
  barcodeText: {fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 3},
  printButton: {
    minWidth: 78,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    paddingHorizontal: 12,
    backgroundColor: '#1769E0',
  },
  printButtonDisabled: {opacity: 0.45},
  printButtonText: {fontSize: 14, fontWeight: '900', color: '#FFFFFF'},
  emptyText: {fontSize: 15, color: '#64748B', paddingVertical: 16, textAlign: 'center'},
});
