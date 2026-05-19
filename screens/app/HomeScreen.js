import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import AppHeader from '../../components/common/AppHeader';
import BottomTabBar from '../../components/common/BottomTabBar';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import AddTestScreen from '../bookings/AddTestScreen';
import AppointmentDetailsScreen from '../bookings/AppointmentDetailsScreen';
import AssignedAppointmentsScreen from '../bookings/AssignedAppointmentsScreen';
import SampleCollectionScreen from '../bookings/SampleCollectionScreen';
import DashboardScreen from './DashboardScreen';
import EodScreen from '../operations/EodScreen';
import HandoverScreen from '../operations/HandoverScreen';
import {getPatientMutationId} from '../bookings/appointmentDetails/helpers';
import {BRAND} from '../../styles/appStyles';

const toStableValue = value =>
  value === null || value === undefined ? '' : String(value).trim();

const getMergedPatientSelectedTests = (patient, selectedTests, panelCompany = null) => {
  const mergedMap = new Map();
  const basePanelCompanyName =
    toStableValue(panelCompany?.name || patient?.panelCompany) || 'Current Panel';
  const basePanelCompanyId = toStableValue(
    panelCompany?.compCatId || patient?.compCatId || patient?.comp_cat_id,
  );
  const baseCenterId = toStableValue(
    panelCompany?.centerId || patient?.centerId || patient?.CenterID,
  );
  const baseAtype = toStableValue(
    panelCompany?.atype || patient?.atype || patient?.Atype,
  );
  const basePanelCode = toStableValue(
    panelCompany?.panelCode || panelCompany?.code || patient?.panelCode || patient?.panel_code,
  );
  const basePanelAbarid = toStableValue(
    panelCompany?.panelAbarid ||
      panelCompany?.ABARID ||
      patient?.panelAbarid ||
      patient?.panel_abarid,
  );

  (Array.isArray(patient?.tests) ? patient.tests : []).forEach(test => {
    const dedupeKey = toStableValue(test?.code).toUpperCase();
    if (!dedupeKey) {
      return;
    }

    mergedMap.set(dedupeKey, {
      key: `seed|${test?.code || 'na'}|${test?.name || 'na'}`,
      panelCompanyName: basePanelCompanyName,
      panelCompanyId: basePanelCompanyId,
      centerId: baseCenterId,
      atype: baseAtype,
      panelCode: basePanelCode,
      panelAbarid: basePanelAbarid,
      booked_code: test?.code || 'N/A',
      bookingTestId:
        test?.bookingTestId ||
        test?.booking_test_id ||
        test?.bookingTestID ||
        test?.booking_test ||
        '',
      catalog_key: [basePanelCompanyId, '', '', test?.code || ''].join('|'),
      gcode: test?.gcode || '',
      scode: test?.scode || '',
      test_code: test?.test_code || test?.code || '',
      description: test?.name || 'Unnamed Test',
      specimenName: test?.specimen_name || test?.specimenName || 'N/A',
      mrp: Number(test?.mrp || test?.charge || test?.amount || 0) || 0,
      isChildTest: false,
      parentDescription: '',
      dedupe_key: dedupeKey,
    });
  });

  (Array.isArray(selectedTests) ? selectedTests : []).forEach(test => {
    const dedupeKey = toStableValue(
      test?.dedupe_key || test?.booked_code || test?.testcode1 || test?.test_code,
    ).toUpperCase();
    mergedMap.set(dedupeKey || test?.key || `${mergedMap.size}`, test);
  });

  return Array.from(mergedMap.values());
};

function HomeScreen({
  styles,
  horizontalPadding,
  loginTopSpacing,
  homeContentWidth,
  isSmallPhone,
  activeTab,
  onTabChange,
  onBack,
  canGoBack,
  bottomTabs,
  accessToken,
  loggedInUser,
  selectedBooking,
  selectedBookingScreen,
  selectedSamplePatient,
  selectedSamplePanelCompany,
  appointmentDetailState,
  appointmentsViewMode,
  assignedAppointments,
  startedAppointments,
  completedAppointments,
  isLoadingAssignedAppointments,
  assignedAppointmentsError,
  isLoadingCompletedAppointments,
  completedAppointmentsError,
  onAssignedCardPress,
  onStartedCardPress,
  onCompletedCardPress,
  onCollectSample,
  onAssignedRetry,
  onCompletedRetry,
  onAssignedViewTests,
  loadingAssignedBookingId,
  bookingActionLoading,
  isAddingPatient,
  isUpdatingPatient,
  cancellingPatientId,
  addingTestPatientId,
  loadingOverlayVisible,
  loadingOverlayTitle,
  loadingOverlayMessage,
  onLogout,
  onBookingAction,
  onOpenAddTest,
  onOpenSampleCollection,
  onRemovePatientSelectedTest,
  onAddPatient,
  onUpdatePatient,
  onCancelPatient,
  onUpdateBookingAddress,
  onAddTestPatient,
  onPanelCompanySelect,
  onTogglePatientTestSelection,
  onAppointmentDetailStateChange,
  onLocalDatabaseLoadingChange,
  onBookingScreenChange,
  onClearAppCache,
  onClearAllAppData,
}) {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const mainScrollViewRef = useRef(null);
  const scrollPositionsRef = useRef({});
  const isRestoringScrollRef = useRef(false);
  const previousScrollKeyRef = useRef('');
  const safeAreaInsets = useSafeAreaInsets();
  const isBookingDetailScreen =
    activeTab === 'appointments' && Boolean(selectedBooking);
  const isFullHeightBookingSubScreen =
    isBookingDetailScreen &&
    ['billing-summary', 'add-test', 'sample-collection', 'edit-address'].includes(
      selectedBookingScreen,
    );
  const activeTabConfig = isBookingDetailScreen
    ? {
        label:
          selectedBookingScreen === 'add-test'
            ? 'Add Test'
            : selectedBookingScreen === 'sample-collection'
            ? 'Sample Collection'
            : 'Appointment Details',
      }
    : activeTab === 'appointments' && appointmentsViewMode === 'assigned'
      ? {label: 'My Assigned Appointments'}
      : activeTab === 'appointments' && appointmentsViewMode === 'started'
        ? {label: 'Started Appointments'}
      : activeTab === 'appointments' && appointmentsViewMode === 'completed'
        ? {label: 'Completed Appointments'}
      : bottomTabs.find(tab => tab.key === activeTab);
  const mainScrollKey = isBookingDetailScreen
    ? `booking:${selectedBooking?.id || 'unknown'}:${selectedBookingScreen}`
    : activeTab === 'appointments'
      ? `appointments:${appointmentsViewMode}`
      : `tab:${activeTab}`;
  if (previousScrollKeyRef.current !== mainScrollKey) {
    previousScrollKeyRef.current = mainScrollKey;
    isRestoringScrollRef.current = true;
  }
  const containerSpacingStyle = isBookingDetailScreen
    ? styles.detailScreenContainer
    : isSmallPhone
      ? styles.homeContainerCompactPadding
      : horizontalPadding >= 28
        ? styles.homeContainerWidePadding
        : styles.homeContainerRegularPadding;
  const containerTopSpacingStyle =
    loginTopSpacing <= 20
      ? styles.homeContainerTopSpacingCompact
      : styles.homeContainerTopSpacing;
  const selectedPatientId = getPatientMutationId(selectedSamplePatient);
  const selectedPatientTestsMap =
    appointmentDetailState?.patientSelectedTestsMap || {};
  const hasSelectedPatientTestsOverride =
    selectedPatientId &&
    Object.prototype.hasOwnProperty.call(
      selectedPatientTestsMap,
      selectedPatientId,
    );
  const selectedPatientTests = hasSelectedPatientTestsOverride
    ? selectedPatientTestsMap[selectedPatientId] || []
    : getMergedPatientSelectedTests(
        selectedSamplePatient,
        [],
        selectedSamplePanelCompany,
      );
  const handleSampleCollectionDraftChange = useCallback(
    draft => {
      if (!selectedPatientId) {
        return;
      }

      onAppointmentDetailStateChange?.(previousState => ({
        ...previousState,
        patientSampleCollectionMap: {
          ...(previousState?.patientSampleCollectionMap || {}),
          [selectedPatientId]: {
            ...(previousState?.patientSampleCollectionMap?.[
              selectedPatientId
            ] || {}),
            ...(draft || {}),
          },
        },
      }));
    },
    [onAppointmentDetailStateChange, selectedPatientId],
  );
  const bookingPatientCount = selectedBooking?.patients?.length || 0;
  const bookingAmount = String(selectedBooking?.payment?.amount || '').trim();
  const bookingHeaderAmount =
    bookingAmount && bookingAmount !== 'N/A' ? bookingAmount : '';
  const bookingHeaderPhone = String(selectedBooking?.phoneNumber || '').replace(
    /\D/g,
    '',
  );
  const bookingHeaderAddress = selectedBooking?.address || {};
  const bookingHeaderMapQuery =
    bookingHeaderAddress.latitude &&
    bookingHeaderAddress.longitude &&
    bookingHeaderAddress.latitude !== 'N/A' &&
    bookingHeaderAddress.longitude !== 'N/A'
      ? `${bookingHeaderAddress.latitude},${bookingHeaderAddress.longitude}`
      : [
          bookingHeaderAddress.fullAddress,
          bookingHeaderAddress.colonyName,
          bookingHeaderAddress.city,
          bookingHeaderAddress.pincode,
        ]
          .filter(Boolean)
          .join(', ');
  const bookingHeaderTitle =
    selectedBooking?.bookingCode || selectedBooking?.id || activeTabConfig?.label;
  const handleBookingHeaderCall = async () => {
    if (!bookingHeaderPhone) {
      return;
    }

    await Linking.openURL(`tel:${bookingHeaderPhone}`);
  };
  const handleBookingHeaderMap = async () => {
    if (!bookingHeaderMapQuery) {
      return;
    }

    await Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        bookingHeaderMapQuery,
      )}`,
    );
  };

  const handleMainScroll = useCallback(
    event => {
      if (isRestoringScrollRef.current) {
        return;
      }

      scrollPositionsRef.current[mainScrollKey] =
        event.nativeEvent.contentOffset.y;
    },
    [mainScrollKey],
  );

  useEffect(() => {
    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBack) {
          return false;
        }

        onBack?.();
        return true;
      },
    );

    return () => backSubscription.remove();
  }, [canGoBack, onBack]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setIsKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const savedScrollY = scrollPositionsRef.current[mainScrollKey] || 0;
    const restoreScroll = () => {
      mainScrollViewRef.current?.scrollTo?.({
        y: savedScrollY,
        animated: false,
      });
    };
    const timeoutIds = [];

    isRestoringScrollRef.current = true;
    requestAnimationFrame(restoreScroll);
    timeoutIds.push(setTimeout(restoreScroll, 60));
    timeoutIds.push(
      setTimeout(() => {
        restoreScroll();
        isRestoringScrollRef.current = false;
      }, 180),
    );

    return () => {
      timeoutIds.forEach(clearTimeout);
    };
  }, [mainScrollKey]);

  const renderTabContent = () => {
    if (activeTab === 'appointments') {
      if (selectedBooking) {
        if (selectedBookingScreen === 'add-test') {
          return (
            <AddTestScreen
              selectedPatient={selectedSamplePatient}
              selectedPanelCompany={selectedSamplePanelCompany}
              selectedTests={selectedPatientTests}
              sampleCollectionDraft={
                selectedPatientId
                  ? appointmentDetailState?.patientSampleCollectionMap?.[
                      selectedPatientId
                    ] || null
                  : null
              }
              styles={styles}
              onAddTestPatient={onAddTestPatient}
              onPanelCompanySelect={onPanelCompanySelect}
              onToggleSelectedTest={onTogglePatientTestSelection}
              onRemoveSelectedTest={onRemovePatientSelectedTest}
              onSampleCollectionReset={() => {
                if (!selectedPatientId) {
                  return;
                }

                onAppointmentDetailStateChange?.(previousState => {
                  const nextMap = {
                    ...(previousState?.patientSampleCollectionMap || {}),
                  };
                  delete nextMap[selectedPatientId];

                  return {
                    ...previousState,
                    patientSampleCollectionMap: nextMap,
                  };
                });
              }}
              onLocalDatabaseLoadingChange={onLocalDatabaseLoadingChange}
            />
          );
        }

        if (selectedBookingScreen === 'sample-collection') {
          return (
            <SampleCollectionScreen
              selectedBooking={selectedBooking}
              selectedPatient={selectedSamplePatient}
              selectedTests={selectedPatientTests}
              sampleCollectionDraft={
                selectedPatientId
                  ? appointmentDetailState?.patientSampleCollectionMap?.[
                      selectedPatientId
                    ] || null
                  : null
              }
              styles={styles}
              onCollectSample={onCollectSample}
              onSampleCollectionDraftChange={handleSampleCollectionDraftChange}
              onRemoveSelectedTest={onRemovePatientSelectedTest}
              onLocalDatabaseLoadingChange={onLocalDatabaseLoadingChange}
            />
          );
        }

        return (
          <AppointmentDetailsScreen
            selectedBooking={selectedBooking}
            styles={styles}
            isSmallPhone={isSmallPhone}
            onBookingAction={onBookingAction}
            bookingActionLoading={bookingActionLoading}
            isAddingPatient={isAddingPatient}
            isUpdatingPatient={isUpdatingPatient}
            cancellingPatientId={cancellingPatientId}
            addingTestPatientId={addingTestPatientId}
            onAddPatient={onAddPatient}
            onUpdatePatient={onUpdatePatient}
            onCancelPatient={onCancelPatient}
            onUpdateBookingAddress={onUpdateBookingAddress}
            onAddTestPatient={onAddTestPatient}
            onPanelCompanySelect={onPanelCompanySelect}
            onOpenAddTest={onOpenAddTest}
            onOpenSampleCollection={onOpenSampleCollection}
            onRemovePatientSelectedTest={onRemovePatientSelectedTest}
            appointmentDetailState={appointmentDetailState}
            onAppointmentDetailStateChange={onAppointmentDetailStateChange}
            onLocalDatabaseLoadingChange={onLocalDatabaseLoadingChange}
            selectedBookingScreen={selectedBookingScreen}
            onBookingScreenChange={onBookingScreenChange}
          />
        );
      }

      if (appointmentsViewMode === 'assigned') {
        return (
          <AssignedAppointmentsScreen
            styles={styles}
            isLoadingAssignedAppointments={isLoadingAssignedAppointments}
            assignedAppointmentsError={assignedAppointmentsError}
            assignedAppointments={assignedAppointments}
            onAssignedRetry={onAssignedRetry}
            onAssignedViewTests={onAssignedViewTests}
            loadingAssignedBookingId={loadingAssignedBookingId}
          />
        );
      }

      if (appointmentsViewMode === 'started') {
        return (
          <AssignedAppointmentsScreen
            styles={styles}
            isLoadingAssignedAppointments={isLoadingAssignedAppointments}
            assignedAppointmentsError={assignedAppointmentsError}
            assignedAppointments={startedAppointments}
            onAssignedRetry={onAssignedRetry}
            onAssignedViewTests={onAssignedViewTests}
            loadingAssignedBookingId={loadingAssignedBookingId}
            title="Started Appointments"
            description="Appointments that are currently in progress."
            loadingText="Started appointments are loading..."
            emptyText="No started appointments are available right now."
          />
        );
      }

      if (appointmentsViewMode === 'completed') {
        return (
          <AssignedAppointmentsScreen
            styles={styles}
            isLoadingAssignedAppointments={isLoadingCompletedAppointments}
            assignedAppointmentsError={completedAppointmentsError}
            assignedAppointments={completedAppointments}
            onAssignedRetry={onCompletedRetry}
            onAssignedViewTests={onAssignedViewTests}
            loadingAssignedBookingId={loadingAssignedBookingId}
            title="Completed Appointments"
            description="Bookings completed from your assigned appointment history."
            loadingText="Completed appointments are loading..."
            emptyText="No completed appointments are available yet."
            showActiveCard={false}
          />
        );
      }

      return null;
    }

    if (activeTab === 'saved') {
      return (
        <HandoverScreen
          styles={styles}
          accessToken={accessToken}
          completedAppointments={completedAppointments}
          isLoadingCompletedAppointments={isLoadingCompletedAppointments}
          completedAppointmentsError={completedAppointmentsError}
          onCompletedRetry={onCompletedRetry}
        />
      );
    }

    if (activeTab === 'profile') {
      return (
        <EodScreen
          styles={styles}
          onClearAppCache={onClearAppCache}
          onClearAllAppData={onClearAllAppData}
        />
      );
    }

    return (
      <DashboardScreen
        styles={styles}
        isSmallPhone={isSmallPhone}
        appointments={assignedAppointments}
        onAssignedCardPress={onAssignedCardPress}
        onStartedCardPress={onStartedCardPress}
        onCompletedCardPress={onCompletedCardPress}
        onUpcomingBookingPress={onAssignedViewTests}
      />
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={BRAND.background} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.backgroundOrbTop} />
        <View style={styles.backgroundOrbBottom} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}>
          <View
            style={[
              styles.homeContainer,
              containerSpacingStyle,
              containerTopSpacingStyle,
            ]}>
            {activeTab === 'home' ? (
            <View
              style={[
                styles.homeHeader,
                isSmallPhone && styles.homeHeaderCompact,
              ]}>
              <View style={styles.homeHeaderTopRow}>
                <View style={styles.homeHeaderText}>
                  <View style={styles.profileChip}>
                    <View style={styles.profileAvatar}>
                      <Ionicons
                        name="person"
                        size={24}
                        style={styles.profileAvatarIcon}
                      />
                    </View>
                    <View style={styles.profileChipTextWrap}>
                      <Text style={styles.profileChipLabel}>Signed in as</Text>
                      <Text
                        style={[
                          styles.profileChipName,
                          isSmallPhone && styles.profileChipNameCompact,
                        ]}
                        numberOfLines={1}>
                        {loggedInUser || 'User'}
                      </Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.logoutButton,
                    isSmallPhone && styles.logoutButtonCompact,
                  ]}
                  onPress={onLogout}>
                  <Ionicons name="log-out-outline" size={24} style={styles.logoutIcon} />
                </TouchableOpacity>
              </View>
              <Text style={styles.homeSubtitle}>
                Track appointments and field activity
              </Text>
            </View>
            ) : null}

            {activeTab !== 'home' || isBookingDetailScreen ? (
            <View
              style={[
                styles.fixedHeaderWrap,
                {marginHorizontal: -horizontalPadding},
              ]}>
              <AppHeader
                title={
                  isBookingDetailScreen
                    ? bookingHeaderTitle
                    : activeTabConfig?.label || 'Screen'
                }
                subtitle={
                  isBookingDetailScreen
                    ? 'Review address, patients, and tests'
                    : ''
                }
                showBackButton={canGoBack || isBookingDetailScreen}
                onBack={onBack}
                styles={styles}
                variant={isBookingDetailScreen ? 'booking' : 'default'}
                metaItems={
                  isBookingDetailScreen
                    ? [
                        `${bookingPatientCount} ${
                          bookingPatientCount === 1 ? 'Patient' : 'Patients'
                        }`,
                        bookingHeaderAmount,
                      ]
                    : []
                }
                status={isBookingDetailScreen ? selectedBooking?.status : ''}
                rightActions={
                  isBookingDetailScreen
                    ? [
                        {
                          key: 'call',
                          icon: 'call',
                          color: '#B91C1C',
                          onPress: handleBookingHeaderCall,
                          disabled: !bookingHeaderPhone,
                        },
                        {
                          key: 'map',
                          icon: 'map-outline',
                          color: '#22C55E',
                          onPress: handleBookingHeaderMap,
                          disabled: !bookingHeaderMapQuery,
                        },
                      ]
                    : []
                }
              />
            </View>
            ) : null}

            <ScrollView
              ref={mainScrollViewRef}
              contentContainerStyle={[
                styles.homeScrollContent,
                isKeyboardVisible && styles.homeScrollContentKeyboardOpen,
                {
                  paddingBottom:
                    (isFullHeightBookingSubScreen
                      ? 0
                      : isKeyboardVisible
                      ? 120
                      : 96) +
                    Math.max(safeAreaInsets.bottom, 8),
                },
              ]}
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              keyboardShouldPersistTaps="handled"
              onScroll={handleMainScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}>
            <View
              style={[
                styles.homeContentShell,
                activeTab === 'home' && styles.homeContentShellWide,
                activeTab !== 'home' &&
                  !isBookingDetailScreen && {maxWidth: homeContentWidth},
                isBookingDetailScreen && styles.detailContentShell,
              ]}>
              <View style={styles.contentArea}>
                <View
                  style={[
                    styles.contentSurface,
                    activeTab === 'home' && styles.contentSurfaceHome,
                    activeTab === 'home' &&
                      isSmallPhone &&
                      styles.contentSurfaceHomeCompact,
                    isBookingDetailScreen && styles.contentSurfaceDetail,
                    isBookingDetailScreen &&
                      isSmallPhone &&
                      styles.contentSurfaceDetailCompact,
                  ]}>
                  {renderTabContent()}
                </View>
              </View>
            </View>
            </ScrollView>

            {!isKeyboardVisible ? (
              <BottomTabBar
                tabs={bottomTabs}
                activeTab={activeTab}
                onTabPress={onTabChange}
                styles={styles}
                isSmallPhone={isSmallPhone}
              />
            ) : null}
            <LoadingOverlay
              styles={styles}
              visible={loadingOverlayVisible}
              title={loadingOverlayTitle}
              message={loadingOverlayMessage}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}

export default React.memo(HomeScreen);

