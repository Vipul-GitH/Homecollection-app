import {SafeAreaProvider} from 'react-native-safe-area-context';
import LogoutConfirmModal from './components/common/LogoutConfirmModal';
import {useAppShellController} from './hooks/useAppShellController';
import HomeScreen from './screens/app/HomeScreen';
import SplashScreen from './src/screens/app/SplashScreen';
import LocationRequiredScreen from './screens/auth/LocationRequiredScreen';
import LoginScreen from './screens/auth/LoginScreen';
import appStyles from './styles/appStyles';

function App() {
  const {
    activeTab,
    bottomTabs,
    contentWidth,
    homeContentWidth,
    horizontalPadding,
    isHomeOverlayVisible,
    isShowingSplash,
    isSmallPhone,
    loadingOverlayMessage,
    loadingOverlayTitle,
    location,
    loginBottomSpacing,
    loginTopSpacing,
    appointmentsViewMode,
    appointmentDetailState,
    selectedBooking,
    selectedBookingScreen,
    selectedSamplePatient,
    selectedSamplePanelCompany,
    showLogoutModal,
    startedAppointments,
    tabHistory,
    session,
    bookings,
    actions,
  } = useAppShellController();

  if (isShowingSplash) {
    return (
      <SafeAreaProvider>
        <SplashScreen styles={appStyles} />
      </SafeAreaProvider>
    );
  }

  if (!location.locationReady) {
    return (
      <SafeAreaProvider>
        <LocationRequiredScreen
          styles={appStyles}
          contentWidth={contentWidth}
          horizontalPadding={horizontalPadding}
          loginTopSpacing={loginTopSpacing}
          loginBottomSpacing={loginBottomSpacing}
          isSmallPhone={isSmallPhone}
          locationStatus={location.locationStatus}
          isRequestingLocation={location.isRequestingLocation}
          onEnableLocation={location.requestLocation}
        />
      </SafeAreaProvider>
    );
  }

  if (session.currentScreen === 'home') {
    return (
      <SafeAreaProvider>
        <HomeScreen
          styles={appStyles}
          horizontalPadding={horizontalPadding}
          loginTopSpacing={loginTopSpacing}
          homeContentWidth={homeContentWidth}
          isSmallPhone={isSmallPhone}
          activeTab={activeTab}
          onTabChange={actions.handleTabChange}
          onBack={actions.handleGoBack}
          canGoBack={tabHistory.length > 0 || activeTab !== 'home'}
          bottomTabs={bottomTabs}
          loggedInUser={session.loggedInUser}
          selectedBooking={selectedBooking}
          selectedBookingScreen={selectedBookingScreen}
          selectedSamplePatient={selectedSamplePatient}
          selectedSamplePanelCompany={selectedSamplePanelCompany}
          appointmentDetailState={appointmentDetailState}
          locationStatus={location.locationStatus}
          stateDistrict={location.stateDistrict}
          suburb={location.suburb}
          fullAddress={location.fullAddress}
          appointmentsViewMode={appointmentsViewMode}
          assignedAppointments={bookings.assignedAppointments}
          startedAppointments={startedAppointments}
          completedAppointments={bookings.completedAppointments}
          isLoadingAssignedAppointments={bookings.isLoadingAssignedAppointments}
          assignedAppointmentsError={bookings.assignedAppointmentsError}
          isLoadingCompletedAppointments={bookings.isLoadingCompletedAppointments}
          completedAppointmentsError={bookings.completedAppointmentsError}
          onAssignedCardPress={actions.handleAssignedCardPress}
          onStartedCardPress={actions.handleStartedCardPress}
          onCompletedCardPress={actions.handleCompletedCardPress}
          onCollectSample={actions.handleCollectSample}
          onAssignedRetry={bookings.fetchAssignedAppointments}
          onCompletedRetry={bookings.fetchCompletedAppointments}
          onAssignedViewTests={actions.handleAssignedViewDetails}
          loadingAssignedBookingId={bookings.loadingAssignedBookingId}
          bookingActionLoading={bookings.bookingActionLoading}
          isAddingPatient={bookings.isAddingPatient}
          isUpdatingPatient={bookings.isUpdatingPatient}
          cancellingPatientId={bookings.cancellingPatientId}
          addingTestPatientId={bookings.addingTestPatientId}
          loadingOverlayVisible={isHomeOverlayVisible}
          loadingOverlayTitle={loadingOverlayTitle}
          loadingOverlayMessage={loadingOverlayMessage}
          onLogout={() => actions.setShowLogoutModal(true)}
          onBookingAction={actions.handleBookingAction}
          onOpenAddTest={actions.handleOpenAddTest}
          onOpenSampleCollection={actions.handleOpenSampleCollection}
          onAddPatient={actions.handleAddPatient}
          onUpdatePatient={actions.handleUpdatePatient}
          onCancelPatient={actions.handleCancelPatient}
          onUpdateBookingAddress={actions.handleUpdateBookingAddress}
          onAddTestPatient={actions.handleAddTestForPatient}
          onPanelCompanySelect={actions.handlePanelCompanySelect}
          onTogglePatientTestSelection={actions.handleTogglePatientTestSelection}
          onRemovePatientSelectedTest={actions.handleRemovePatientSelectedTest}
          onAppointmentDetailStateChange={actions.setAppointmentDetailState}
          onLocalDatabaseLoadingChange={actions.setLocalDatabaseLoadingMessage}
          onBookingScreenChange={actions.setSelectedBookingScreen}
          onClearAppCache={actions.handleClearAppCache}
          onClearAllAppData={actions.handleClearAllAppData}
        />
        <LogoutConfirmModal
          styles={appStyles}
          visible={showLogoutModal}
          onClose={() => actions.setShowLogoutModal(false)}
          onConfirm={actions.performLogout}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <LoginScreen
        styles={appStyles}
        contentWidth={contentWidth}
        horizontalPadding={horizontalPadding}
        loginTopSpacing={loginTopSpacing}
        loginBottomSpacing={loginBottomSpacing}
        isSmallPhone={isSmallPhone}
        username={session.username}
        password={session.password}
        loginError={session.loginError}
        isLoggingIn={session.isLoggingIn}
        loginLoadingMessage={session.loginLoadingMessage}
        locationStatus={location.locationStatus}
        onUsernameChange={session.handleUsernameChange}
        onPasswordChange={session.handlePasswordChange}
        onLogin={actions.handleLoginSubmit}
      />
    </SafeAreaProvider>
  );
}

export default App;
