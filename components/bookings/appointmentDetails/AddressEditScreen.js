import React, {useMemo, useState} from 'react';
import {ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import AppAlertModal from '../../common/AppAlertModal';
import {normalizeFormText} from '../../../screens/bookings/appointmentDetails/helpers';
import OptionSelectModal from './OptionSelectModal';

const ADDRESS_TYPE_OPTIONS = ['Home', 'Office', 'Temporary', 'Other'];
const ADDRESS_FLOOR_SPECIAL_OPTIONS = ['None', 'Ground_F', 'Basement', 'Full_hous'];

function AddressEditScreen({
  styles,
  isNarrowScreen,
  addressForm,
  addressCityOptions,
  addressColonyOptions,
  isAddressCityLoading,
  isAddressColonyLoading,
  isAddressUpdating,
  isAddressCitySelectVisible,
  isAddressColonySelectVisible,
  isAddressFloorSpecialSelectVisible,
  appAlert,
  loadAddressCities,
  loadAddressColonies,
  handleAddressFormChange,
  handleUpdateAddress,
  setIsAddressCitySelectVisible,
  setIsAddressColonySelectVisible,
  setIsAddressFloorSpecialSelectVisible,
  closeAppAlert,
}) {
  const [colonySearchText, setColonySearchText] = useState('');

  const filteredAddressColonyOptions = useMemo(() => {
    const normalizedSearch = normalizeFormText(colonySearchText).toLowerCase();
    const colonies = Array.isArray(addressColonyOptions) ? addressColonyOptions : [];

    if (!normalizedSearch) {
      return colonies;
    }

    return colonies.filter(colony =>
      normalizeFormText(colony?.colony_name)
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [addressColonyOptions, colonySearchText]);

  const renderAddressInput = ({
    field,
    label,
    required = false,
    placeholder = '',
    multiline = false,
    keyboardType = 'default',
    disabled = false,
    headerRight = null,
  }) => (
    <View style={styles.addPatientFieldHalf}>
      <View style={styles.appointmentAddressFieldHeader}>
        <Text style={styles.addPatientFieldLabel}>
          {label}
          {required ? <Text style={styles.requiredFieldAsterisk}> *</Text> : null}
        </Text>
        {headerRight}
      </View>
      <TextInput
        value={addressForm[field] || ''}
        onChangeText={value => handleAddressFormChange(field, value)}
        placeholder={placeholder}
        placeholderTextColor="#7B8AA3"
        keyboardType={keyboardType}
        multiline={multiline}
        editable={!disabled}
        style={[
          styles.addPatientInput,
          disabled && styles.addPatientInputDisabled,
          multiline && styles.appointmentAddressNotesInput,
        ]}
      />
    </View>
  );

  const renderManualPincodeToggle = () => (
    <TouchableOpacity
      activeOpacity={0.85}
      style={styles.appointmentAddressPincodeToggle}
      onPress={() =>
        handleAddressFormChange(
          'is_manual_pincode',
          !addressForm.is_manual_pincode,
        )
      }>
      <View
        style={[
          styles.cancelCheckbox,
          addressForm.is_manual_pincode && styles.cancelCheckboxActive,
        ]}>
        {addressForm.is_manual_pincode ? (
          <Ionicons name="checkmark" size={13} style={styles.cancelCheckboxIcon} />
        ) : null}
      </View>
      <Text style={styles.appointmentAddressPincodeToggleText}>Edit pincode</Text>
    </TouchableOpacity>
  );

  const renderAddressChips = ({field, label, options = []}) => (
    <View style={styles.addPatientInputGroup}>
      <Text style={styles.addPatientFieldLabel}>{label}</Text>
      <View style={styles.addPatientGenderChipRow}>
        {options.map(option => {
          const isSelected = addressForm[field] === option;

          return (
            <TouchableOpacity
              key={`${field}-${option}`}
              activeOpacity={0.85}
              style={[
                styles.addPatientGenderChip,
                isSelected && styles.addPatientGenderChipActive,
              ]}
              onPress={() => handleAddressFormChange(field, option)}>
              <Text
                style={[
                  styles.addPatientGenderChipText,
                  isSelected && styles.addPatientGenderChipTextActive,
                ]}>
                {option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderAddressSelect = ({
    field,
    label,
    required = false,
    onPress,
    disabled = false,
  }) => (
    <View style={styles.addPatientFieldHalf}>
      <Text style={styles.addPatientFieldLabel}>
        {label}
        {required ? <Text style={styles.requiredFieldAsterisk}> *</Text> : null}
      </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[
          styles.addPatientDatePickerButton,
          disabled && styles.addPatientInputDisabled,
        ]}
        onPress={onPress}
        disabled={disabled}>
        <Text
          style={[
            styles.addPatientDatePickerText,
            !addressForm[field] && styles.addPatientDatePickerPlaceholder,
          ]}
          numberOfLines={1}>
          {addressForm[field] || 'Select'}
        </Text>
        <Ionicons
          name="chevron-down"
          size={16}
          style={styles.addPatientDatePickerIcon}
        />
      </TouchableOpacity>
    </View>
  );

  const hasSelectedAddressCity = Boolean(normalizeFormText(addressForm.city));
  const hasAddressPincode = Boolean(normalizeFormText(addressForm.pincode));
  const shouldShowAddressDetails = hasSelectedAddressCity && hasAddressPincode;
  const hasNumericFloor = Boolean(normalizeFormText(addressForm.floor));
  const hasFloorSpecial = Boolean(
    normalizeFormText(addressForm.floor_special) &&
      normalizeFormText(addressForm.floor_special) !== 'None',
  );

  return (
    <>
      <View style={styles.completeBookingScreenShell}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.completeBookingScreenContent}>
          <View style={styles.appointmentAddressFormCard}>
            <View style={styles.appointmentAddressFormHero}>
              <View style={styles.appointmentAddressFormIconWrap}>
                <Ionicons
                  name="navigate-outline"
                  size={18}
                  style={styles.appointmentAddressFormIcon}
                />
              </View>
              <View style={styles.appointmentAddressFormHeroText}>
                <Text style={styles.appointmentAddressFormTitle}>Visit Address</Text>
                <Text style={styles.appointmentAddressFormSubtitle}>
                  Update the location details for this booking.
                </Text>
              </View>
            </View>
            <View style={styles.appointmentAddressSection}>
              {renderAddressChips({
                field: 'address_type',
                label: 'Address Type',
                options: ADDRESS_TYPE_OPTIONS,
              })}
              {renderAddressSelect({
                field: 'city',
                label: 'City',
                required: true,
                onPress: () => {
                  loadAddressCities();
                  setIsAddressCitySelectVisible(true);
                },
              })}
            </View>
            {hasSelectedAddressCity ? (
              <View style={styles.appointmentAddressSection}>
                <Text style={styles.appointmentAddressSectionTitle}>
                  Colony & Route
                </Text>
                <View
                  style={[
                    styles.addPatientFieldRow,
                    isNarrowScreen && styles.addPatientFieldRowStacked,
                  ]}>
                  {addressForm.is_manual_pincode
                    ? renderAddressInput({
                        field: 'colony',
                        label: 'Colony',
                        required: true,
                        placeholder: 'Enter colony',
                      })
                    : renderAddressSelect({
                        field: 'colony',
                        label: 'Colony',
                        required: true,
                        onPress: () => {
                          setColonySearchText('');
                          loadAddressColonies(addressForm.city);
                          setIsAddressColonySelectVisible(true);
                        },
                      })}
                  {renderAddressInput({
                    field: 'pincode',
                    label: 'Pincode',
                    required: true,
                    keyboardType: 'numeric',
                    disabled: !addressForm.is_manual_pincode,
                    headerRight: renderManualPincodeToggle(),
                  })}
                </View>
                {hasAddressPincode
                  ? renderAddressInput({
                      field: 'route',
                      label: 'Route',
                      required: true,
                    })
                  : null}
              </View>
            ) : null}
            {shouldShowAddressDetails ? (
              <>
                <View style={styles.appointmentAddressSection}>
                  <Text style={styles.appointmentAddressSectionTitle}>
                    Building Details
                  </Text>
                  <View
                    style={[
                      styles.addPatientFieldRow,
                      isNarrowScreen && styles.addPatientFieldRowStacked,
                    ]}>
                    {renderAddressInput({
                      field: 'house_flat_no',
                      label: 'House/Flat No',
                      required: true,
                    })}
                    {renderAddressInput({
                      field: 'block_tower_no',
                      label: 'Block / Tower No',
                    })}
                  </View>
                  <View
                    style={[
                      styles.addPatientFieldRow,
                      isNarrowScreen && styles.addPatientFieldRowStacked,
                    ]}>
                    {renderAddressInput({
                      field: 'floor',
                      label: 'Floor',
                      required: !hasFloorSpecial,
                      keyboardType: 'numeric',
                      disabled: hasFloorSpecial,
                    })}
                    <View style={styles.addPatientFieldHalf}>
                      {renderAddressSelect({
                        field: 'floor_special',
                        label: 'Floor Special',
                        disabled: hasNumericFloor,
                        onPress: () => setIsAddressFloorSpecialSelectVisible(true),
                      })}
                    </View>
                  </View>
                </View>
                <View style={styles.appointmentAddressSection}>
                  <Text style={styles.appointmentAddressSectionTitle}>
                    Area Details
                  </Text>
                  <View
                    style={[
                      styles.addPatientFieldRow,
                      isNarrowScreen && styles.addPatientFieldRowStacked,
                    ]}>
                    {renderAddressInput({
                      field: 'street_sector',
                      label: 'Street / Sector',
                    })}
                    {renderAddressInput({field: 'landmark', label: 'Landmark'})}
                  </View>
                </View>
                <View style={styles.appointmentAddressSection}>
                  <Text style={styles.appointmentAddressSectionTitle}>Notes</Text>
                  {renderAddressInput({
                    field: 'google_location',
                    label: 'Google Location',
                    placeholder: 'Optional Google Maps URL',
                  })}
                  {renderAddressInput({
                    field: 'access_notes',
                    label: 'Access Notes',
                    placeholder: 'Optional',
                    multiline: true,
                  })}
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[
                    styles.appointmentAddressUpdateButton,
                    isAddressUpdating && styles.completeBookingActionButtonDisabled,
                  ]}
                  onPress={handleUpdateAddress}
                  disabled={isAddressUpdating}>
                  <Ionicons
                    name={
                      isAddressUpdating
                        ? 'hourglass-outline'
                        : 'checkmark-circle-outline'
                    }
                    size={16}
                    style={styles.completeBookingActionButtonIcon}
                  />
                  <Text style={styles.completeBookingActionButtonText}>
                    {isAddressUpdating ? 'Updating...' : 'Update Address'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </ScrollView>
      </View>
      <OptionSelectModal
        styles={styles}
        visible={isAddressCitySelectVisible}
        title="Select City"
        options={addressCityOptions}
        isLoading={isAddressCityLoading}
        emptyText="Cities could not be loaded from the local database. Please rebuild or reinstall the APK and try again."
        selectedValue={addressForm.city}
        onClose={() => setIsAddressCitySelectVisible(false)}
        onSelect={city => {
          handleAddressFormChange('city', city);
          setIsAddressCitySelectVisible(false);
        }}
      />
      <OptionSelectModal
        styles={styles}
        visible={isAddressColonySelectVisible}
        title="Select Colony"
        options={filteredAddressColonyOptions.map(colony => ({
          key: `${colony.id || colony.colony_name}-${colony.pincode || ''}-${
            colony.route_no || ''
          }`,
          value: colony.colony_name,
          label: colony.colony_name,
        }))}
        searchValue={colonySearchText}
        onSearchChange={setColonySearchText}
        searchPlaceholder="Search colony"
        isLoading={isAddressColonyLoading}
        emptyText="No colony was found for the selected city. You can enter the pincode and route manually."
        selectedValue={addressForm.colony}
        onClose={() => {
          setColonySearchText('');
          setIsAddressColonySelectVisible(false);
        }}
        onSelect={colonyName => {
          handleAddressFormChange('colony', colonyName);
          setColonySearchText('');
          setIsAddressColonySelectVisible(false);
        }}
      />
      <OptionSelectModal
        styles={styles}
        visible={isAddressFloorSpecialSelectVisible}
        title="Floor Special"
        options={ADDRESS_FLOOR_SPECIAL_OPTIONS}
        selectedValue={addressForm.floor_special}
        onClose={() => setIsAddressFloorSpecialSelectVisible(false)}
        onSelect={value => {
          handleAddressFormChange('floor_special', value);
          setIsAddressFloorSpecialSelectVisible(false);
        }}
      />
      <AppAlertModal alert={appAlert} styles={styles} onClose={closeAppAlert} />
    </>
  );
}

export default React.memo(AddressEditScreen);
