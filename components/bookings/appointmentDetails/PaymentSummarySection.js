import React from 'react';
import {
  ActivityIndicator,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {BRAND} from '../../../styles/appStyles';

function PaymentSummarySection({
  styles,
  patientCount,
  completeBillingTotal,
  completeBaseDiscountAmount,
  completeAdditionalDiscountAmount,
  completeCreditAmount,
  completeNetAmount,
  localBillingSummary,
  isAdditionalDiscountEnabled,
  completeAdditionalDiscountMode,
  completeAdditionalDiscount,
  completePayments,
  completePaymentModeOptions,
  bookingActionLoading,
  shouldShowProgressActions,
  handleAdditionalDiscountToggle,
  setCompleteAdditionalDiscountMode,
  setCompleteAdditionalDiscount,
  handleApplyAdditionalDiscount,
  handleCompletePaymentChange,
  handleRemoveCompletePayment,
  handleAddCompletePayment,
  confirmCompleteBooking,
}) {
  return (
    <>
      <View style={styles.paymentSummaryCard}>
        <View style={styles.paymentSummaryHeader}>
          <Text style={styles.paymentSummaryTitle}>Billing Summary</Text>
          <View style={styles.paymentSummaryPatientBadge}>
            <Text style={styles.paymentSummaryPatientBadgeText}>
              {patientCount} patient{patientCount > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.paymentSummaryRows}>
          <View style={styles.paymentSummaryRow}>
            <Text style={styles.paymentSummaryRowLabel}>SubTotal</Text>
            <Text style={styles.paymentSummaryRowValue}>
              Rs. {completeBillingTotal.toFixed(2)}
            </Text>
          </View>
          <View style={styles.paymentSummaryRow}>
            <Text style={styles.paymentSummaryRowLabel}>Base</Text>
            <Text style={styles.paymentSummaryRowValue}>
              Rs. {completeBaseDiscountAmount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.paymentSummaryRow}>
            <Text style={styles.paymentSummaryRowLabel}>Additional</Text>
            <Text style={styles.paymentSummaryRowValue}>
              Rs. {completeAdditionalDiscountAmount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.paymentSummaryRow}>
            <Text style={styles.paymentSummaryRowLabel}>Credit</Text>
            <Text style={styles.paymentSummaryRowValue}>
              Rs. {completeCreditAmount.toFixed(2)}
            </Text>
          </View>
        </View>
        <View style={styles.paymentSummaryDiscountAction}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.completeSecondaryButton,
              isAdditionalDiscountEnabled &&
                styles.completeSecondaryButtonActive,
            ]}
            onPress={handleAdditionalDiscountToggle}
            disabled={localBillingSummary.payingTestCount <= 0}>
            <Ionicons
              name="pricetag-outline"
              size={16}
              style={[
                styles.completeSecondaryButtonIcon,
                isAdditionalDiscountEnabled &&
                  styles.completeSecondaryButtonIconActive,
              ]}
            />
            <Text
              style={[
                styles.completeSecondaryButtonText,
                isAdditionalDiscountEnabled &&
                  styles.completeSecondaryButtonTextActive,
              ]}>
              Additional Discount
            </Text>
          </TouchableOpacity>
          {isAdditionalDiscountEnabled ? (
            <>
              <View style={styles.cancelSegmentedRow}>
                {[
                  {label: 'Amount', value: 'amount'},
                  {label: 'Percent', value: 'percent'},
                ].map(option => {
                  const isSelected =
                    completeAdditionalDiscountMode === option.value;

                  return (
                    <TouchableOpacity
                      key={option.value}
                      activeOpacity={0.85}
                      style={[
                        styles.cancelSegmentButton,
                        isSelected && styles.cancelSegmentButtonActive,
                      ]}
                      onPress={() =>
                        setCompleteAdditionalDiscountMode(option.value)
                      }>
                      <Text
                        style={[
                          styles.cancelSegmentButtonText,
                          isSelected && styles.cancelSegmentButtonTextActive,
                        ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.completeAdditionalDiscountRow}>
                <View
                  style={[
                    styles.completeCashInputWrap,
                    styles.completeAdditionalDiscountInputWrap,
                  ]}>
                  <Text style={styles.completeCashPrefix}>
                    {completeAdditionalDiscountMode === 'percent' ? '%' : 'Rs.'}
                  </Text>
                  <TextInput
                    value={completeAdditionalDiscount}
                    onChangeText={setCompleteAdditionalDiscount}
                    keyboardType="numeric"
                    placeholder="Enter additional discount"
                    placeholderTextColor="#7B8AA3"
                    style={styles.completeCashInput}
                  />
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.completeAdditionalDiscountApplyButton}
                  onPress={handleApplyAdditionalDiscount}>
                  <Text style={styles.completeAdditionalDiscountApplyButtonText}>
                    Apply
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
        <View style={styles.paymentSummaryTotalRow}>
          <Text style={styles.paymentSummaryTotalLabel}>FinalAmount</Text>
          <Text style={styles.paymentSummaryTotalValue}>
            Rs. {completeNetAmount.toFixed(2)}
          </Text>
        </View>
        <View style={styles.completePaymentsCollectedCard}>
          <Text style={styles.paymentSummarySubTitle}>Payments Collected</Text>
          {completePayments.map((payment, index) => (
            <View key={payment.id} style={styles.completePaymentEntry}>
              <View style={styles.completePaymentModeRow}>
                {completePaymentModeOptions.map(mode => {
                  const isSelected = payment.mode === mode;

                  return (
                    <TouchableOpacity
                      key={`${payment.id}-${mode}`}
                      activeOpacity={0.85}
                      style={[
                        styles.completePaymentModeChip,
                        isSelected && styles.completePaymentModeChipActive,
                      ]}
                      onPress={() =>
                        handleCompletePaymentChange(payment.id, {mode})
                      }>
                      <Text
                        style={[
                          styles.completePaymentModeChipText,
                          isSelected &&
                            styles.completePaymentModeChipTextActive,
                        ]}>
                        {mode}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.completeCashInputWrap}>
                <Text style={styles.completeCashPrefix}>Rs.</Text>
                <TextInput
                  value={payment.amount}
                  onChangeText={amount =>
                    handleCompletePaymentChange(payment.id, {amount})
                  }
                  keyboardType="numeric"
                  placeholder="Enter amount"
                  placeholderTextColor="#7B8AA3"
                  style={styles.completeCashInput}
                />
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.completePaymentRemoveButton}
                onPress={() => handleRemoveCompletePayment(payment.id)}>
                <Text style={styles.completePaymentRemoveButtonText}>
                  Remove
                </Text>
              </TouchableOpacity>
              {index < completePayments.length - 1 ? (
                <View style={styles.completePaymentEntryDivider} />
              ) : null}
            </View>
          ))}
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.completePaymentAddButton}
            onPress={handleAddCompletePayment}>
            <Ionicons
              name="add"
              size={14}
              style={styles.completePaymentAddButtonIcon}
            />
            <Text style={styles.completePaymentAddButtonText}>
              Add Payment
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {shouldShowProgressActions ? (
        <View style={styles.completeBookingActionSection}>
          <TouchableOpacity
            activeOpacity={0.88}
            style={[
              styles.completeBookingActionButton,
              Boolean(bookingActionLoading) &&
                styles.completeBookingActionButtonDisabled,
            ]}
            disabled={Boolean(bookingActionLoading)}
            onPress={confirmCompleteBooking}>
            {bookingActionLoading === 'completed' ? (
              <ActivityIndicator color={BRAND.surface} size="small" />
            ) : (
              <Ionicons
                name="checkmark-done-outline"
                size={18}
                style={styles.completeBookingActionButtonIcon}
              />
            )}
            <Text style={styles.completeBookingActionButtonText}>
              {bookingActionLoading === 'completed'
                ? 'Completing...'
                : 'Complete Booking'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  );
}

export default React.memo(PaymentSummarySection);
