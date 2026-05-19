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
import RequiredLabel from './RequiredLabel';

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
  patientAdditionalDiscountRows = [],
  completePayments,
  completePaymentModeOptions,
  paymentPatientOptions = [],
  pendingPaymentAmount = 0,
  extraPaymentAmount = 0,
  pendingPaymentPatientId = '',
  shouldCollectPendingPaymentPatient = false,
  handlePendingPaymentPatientSelect,
  bookingActionLoading,
  shouldShowProgressActions,
  handlePatientAdditionalDiscountChange,
  handleApplyPatientAdditionalDiscount,
  handleCompletePaymentChange,
  handleRemoveCompletePayment,
  handleAddCompletePayment,
  handlePickCompletePaymentProof,
  handleRemoveCompletePaymentProof,
  confirmCompleteBooking,
}) {
  const shouldShowPaymentsCollected = localBillingSummary.payingTestCount > 0;
  const patientOptions = paymentPatientOptions;
  const paymentDifferenceAmount =
    extraPaymentAmount > 0.009 ? extraPaymentAmount : pendingPaymentAmount;
  const paymentDifferenceLabel =
    extraPaymentAmount > 0.009 ? 'Extra Amount' : 'Pending Amount';
  const paymentDifferenceHint =
    extraPaymentAmount > 0.009
      ? 'Select patient for this extra amount.'
      : 'Select patient for this pending amount.';

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
          <View style={styles.paymentSummaryTotalRow}>
            <Text style={styles.paymentSummaryTotalLabel}>Final Amount</Text>
            <Text style={styles.paymentSummaryTotalValue}>
              Rs. {completeNetAmount.toFixed(2)}
            </Text>
          </View>
        </View>
        {localBillingSummary.patientBillingRows?.length ? (
          <View style={styles.paymentSummaryDiscountAction}>
            <View style={styles.sectionTitleRow}>
              <Ionicons
                name="people-outline"
                size={15}
                style={styles.completeSecondaryButtonIcon}
              />
              <Text style={styles.paymentSummarySubTitle}>
                Patient-wise Total Amount
              </Text>
            </View>
            <View style={styles.paymentSummaryRows}>
              {localBillingSummary.patientBillingRows.map(patientRow => (
                <View
                  key={`patient-total-${patientRow.patientId}`}
                  style={styles.paymentSummaryRow}>
                  <Text style={styles.paymentSummaryRowLabel}>
                    {patientRow.patientName}
                  </Text>
                  <Text style={styles.paymentSummaryRowValue}>
                    Rs. {Number(patientRow.finalAmount || 0).toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.paymentSummaryDiscountAction}>
          {isAdditionalDiscountEnabled && patientAdditionalDiscountRows.length ? (
            <>
              <View style={styles.sectionTitleRow}>
                <Ionicons
                  name="pricetag-outline"
                  size={15}
                  style={styles.completeSecondaryButtonIcon}
                />
                <Text style={styles.paymentSummarySubTitle}>
                  Patient-wise Additional Discount
                </Text>
              </View>
              {patientAdditionalDiscountRows.map(patientDiscount => (
                <View
                  key={`additional-${patientDiscount.patientId}`}
                  style={styles.completePaymentEntry}>
                  <View style={styles.paymentSummaryRow}>
                    <Text style={styles.paymentSummaryRowLabel}>
                      {patientDiscount.patientName}
                    </Text>
                    <Text style={styles.paymentSummaryRowValue}>
                      Max Rs. {patientDiscount.maxAdditionalAllowed.toFixed(2)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.completeCashInputWrap,
                      styles.completeAdditionalDiscountInputWrap,
                    ]}>
                    <Text style={styles.completeCashPrefix}>Rs.</Text>
                    <TextInput
                      value={patientDiscount.enteredAdditional}
                      onChangeText={value =>
                        handlePatientAdditionalDiscountChange(
                          patientDiscount.patientId,
                          value,
                        )
                      }
                      keyboardType="numeric"
                      placeholder="Enter patient discount"
                      placeholderTextColor="#7B8AA3"
                      style={styles.completeCashInput}
                    />
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.completeSecondaryButton}
                    onPress={() =>
                      handleApplyPatientAdditionalDiscount?.(
                        patientDiscount.patientId,
                      )
                    }>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={16}
                      style={styles.completeSecondaryButtonIcon}
                    />
                    <Text style={styles.completeSecondaryButtonText}>Apply</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          ) : null}
        </View>
        {shouldShowPaymentsCollected ? (
          <View style={styles.completePaymentsCollectedCard}>
            <Text style={styles.paymentSummarySubTitle}>Payments Collected</Text>
            {completePayments.map((payment, index) => (
              <View key={payment.id} style={styles.completePaymentEntry}>
                {patientOptions.length ? (
                  <View style={styles.completePaymentPatientSection}>
                    <Text style={styles.addPatientFieldLabel}>Patient</Text>
                    <View style={styles.completeBookingPatientChipRow}>
                      {patientOptions.map(patient => {
                        const isSelected = payment.patientOptionId === patient.id;

                        return (
                          <TouchableOpacity
                            key={`${payment.id}-${patient.id}`}
                            activeOpacity={0.85}
                            style={[
                              styles.completePaymentModeChip,
                              styles.completeBookingPatientChip,
                              isSelected && styles.completePaymentModeChipActive,
                            ]}
                            onPress={() =>
                              handleCompletePaymentChange(payment.id, {
                                patientOptionId: patient.id,
                                patientId: patient.patientId,
                                patientName: patient.name,
                              })
                            }>
                            <Text
                              style={[
                                styles.completePaymentModeChipText,
                                isSelected &&
                                  styles.completePaymentModeChipTextActive,
                              ]}
                              numberOfLines={1}>
                              {patient.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
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
                {payment.mode === 'UPI' ? (
                  <View style={styles.patientPaymentProofSection}>
                    <RequiredLabel styles={styles}>
                      UPI screenshot / image
                    </RequiredLabel>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.completeUploadBox}
                      onPress={() => handlePickCompletePaymentProof(payment.id)}>
                      <View style={styles.completeUploadIconWrap}>
                        <Ionicons
                          name="cloud-upload-outline"
                          size={22}
                          style={styles.completeUploadIcon}
                        />
                      </View>
                      <View style={styles.completeUploadTextWrap}>
                        <Text style={styles.completeUploadTitle}>
                          Upload payment screenshot
                        </Text>
                        <Text style={styles.completeUploadHint}>
                          Required for UPI payments
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        style={styles.completeUploadChevron}
                      />
                    </TouchableOpacity>
                    {Array.isArray(payment.proofDocuments) &&
                    payment.proofDocuments.length ? (
                      <View style={styles.completeProofList}>
                        {payment.proofDocuments.map((document, documentIndex) => (
                          <View
                            key={`${document.uri}-${documentIndex}`}
                            style={styles.completeProofItem}>
                            <Ionicons
                              name="image-outline"
                              size={16}
                              style={styles.completeProofIcon}
                            />
                            <Text
                              style={styles.completeProofName}
                              numberOfLines={1}>
                              {document.name}
                            </Text>
                            <TouchableOpacity
                              activeOpacity={0.85}
                              style={styles.completeProofRemoveButton}
                              onPress={() =>
                                handleRemoveCompletePaymentProof(
                                  payment.id,
                                  documentIndex,
                                )
                              }>
                              <Ionicons
                                name="close"
                                size={14}
                                style={styles.completeProofRemoveIcon}
                              />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
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
            {shouldCollectPendingPaymentPatient ? (
              <View style={styles.completePendingPaymentCard}>
                <View style={styles.completePendingPaymentHeader}>
                  <Text style={styles.paymentSummarySubTitle}>
                    {paymentDifferenceLabel}
                  </Text>
                  <Text style={styles.completePendingPaymentAmount}>
                    Rs. {paymentDifferenceAmount.toFixed(2)}
                  </Text>
                </View>
                <Text style={styles.completePendingPaymentHint}>
                  {paymentDifferenceHint}
                </Text>
                <View style={styles.completeBookingPatientChipRow}>
                  {patientOptions.map(patient => {
                    const isSelected = pendingPaymentPatientId === patient.id;

                    return (
                      <TouchableOpacity
                        key={`pending-${patient.id}`}
                        activeOpacity={0.85}
                        style={[
                          styles.completePaymentModeChip,
                          styles.completeBookingPatientChip,
                          isSelected && styles.completePaymentModeChipActive,
                        ]}
                        onPress={() =>
                          handlePendingPaymentPatientSelect?.(patient)
                        }>
                        <Text
                          style={[
                            styles.completePaymentModeChipText,
                            isSelected &&
                              styles.completePaymentModeChipTextActive,
                          ]}
                          numberOfLines={1}>
                          {patient.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
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
