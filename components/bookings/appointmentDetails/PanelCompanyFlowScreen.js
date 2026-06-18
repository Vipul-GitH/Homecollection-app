import React, {useCallback} from 'react';
import {FlatList, Text, TextInput, TouchableOpacity, View} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import AppAlertModal from '../../common/AppAlertModal';
import {
  CATALOG_ITEM_PAGE_SIZE,
  CATALOG_TEST_VISIBLE_LIMIT,
  PANEL_COMPANY_DEFAULT_VISIBLE,
} from '../../../screens/bookings/appointmentDetails/constants';
import {
  getCatalogDisplayTitle,
  getCatalogGroupId,
  getCatalogSubgroupId,
} from '../../../screens/bookings/appointmentDetails/catalogHelpers';
import {BRAND} from '../../../styles/appStyles';
import {getTestPricing} from '../../../utils/bookings/pricing';

function PanelCompanyFlowScreen({
  styles,
  isNarrowScreen,
  isSmallPhone,
  isPanelCatalogVisible,
  isPanelCompanyModalVisible,
  selectedPanelPatient,
  selectedPanelCompanyName,
  selectedPanelCompany,
  selectedPanelCompanyId,
  panelCompanySearch,
  setPanelCompanySearch,
  hasPanelCompanySearch,
  filteredPanelCompanyItems,
  visiblePanelCompanyItems,
  handleSelectPanelCompany,
  selectedCatalogGroup,
  selectedCatalogSubgroup,
  activeCatalogItems,
  visibleCatalogItems,
  expandedCatalogTests,
  testSearch,
  setTestSearch,
  hasTestSearch,
  hasMoreCatalogItems,
  loadMoreCatalogItems,
  handleAddTestFlowBack,
  setSelectedCatalogGroup,
  setSelectedCatalogSubgroup,
  setExpandedCatalogTests,
  setCatalogVisibleCount,
  getPaymentLabelFromBillingMode,
  appAlert,
  closeAppAlert,
}) {
  const renderPanelCompanyItem = useCallback(
    ({item, index}) => {
      const isSelected = selectedPanelCompanyId === item.id;

      return (
        <TouchableOpacity
          key={`${item.id}-${index}`}
          activeOpacity={0.85}
          style={[
            styles.panelCompanyItem,
            isSelected && styles.panelCompanyItemActive,
          ]}
          onPress={() => handleSelectPanelCompany(item)}>
          <View style={styles.panelCompanyItemTextWrap}>
            <Text
              style={[
                styles.panelCompanyName,
                isSelected && styles.panelCompanyNameActive,
              ]}>
              {item.name}
            </Text>
            {item.details ? (
              <Text style={styles.panelCompanyDetails}>{item.details}</Text>
            ) : null}
            {item.centerId ? (
              <Text style={styles.panelCompanyMeta}>
                Center: {item.centerId}
              </Text>
            ) : null}
          </View>
          {item.billingChargeMode ? (
            <View style={styles.panelCompanyModeChip}>
              <Text style={styles.panelCompanyModeChipText}>
                {item.billingChargeMode}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [handleSelectPanelCompany, selectedPanelCompanyId, styles],
  );
  const renderPanelCompanyEmpty = useCallback(
    () => (
      <View style={styles.panelCompanyEmptyState}>
        <Text style={styles.panelCompanyEmptyStateText}>
          No companies match your search.
        </Text>
      </View>
    ),
    [styles],
  );
  const getPanelCompanyItemKey = useCallback(
    (item, index) => `${item.id || item.name || 'panel'}-${index}`,
    [],
  );
  const renderCatalogItem = useCallback(
    ({item, index}) => {
      const isGroupList = !selectedCatalogGroup && !selectedCatalogSubgroup;
      const isSubgroupList =
        Boolean(selectedCatalogGroup) && !selectedCatalogSubgroup;
      const isTestsList = Boolean(selectedCatalogSubgroup);
      const testPricing = isTestsList
        ? getTestPricing({
            ...item,
            selected_charge_mode:
              selectedPanelCompany?.billingChargeMode ||
              selectedPanelCompany?.chargeMode ||
              selectedPanelCompany?.BillingChargeMode ||
              '',
            showmrp:
              selectedPanelCompany?.showmrp ??
              selectedPanelCompany?.showMrp ??
              selectedPanelCompany?.show_mrp ??
              selectedPanelCompany?.ShowMRP ??
              item?.showmrp ??
              0,
          })
        : null;
      const title = getCatalogDisplayTitle({
        item,
        isGroupList,
        isSubgroupList,
      });
      return (
        <TouchableOpacity
          key={`${title || 'item'}-${index}`}
          activeOpacity={0.85}
          style={styles.panelCompanyItem}
          onPress={() => {
            if (isGroupList) {
              setSelectedCatalogGroup(item);
              setSelectedCatalogSubgroup(null);
              setTestSearch('');
              setExpandedCatalogTests({});
              setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
              return;
            }

            if (isSubgroupList) {
              setSelectedCatalogSubgroup(item);
              setTestSearch('');
              setExpandedCatalogTests({});
              setCatalogVisibleCount(CATALOG_ITEM_PAGE_SIZE);
              return;
            }

          }}
          disabled={isTestsList}>
          <View style={styles.panelCompanyItemTextWrap}>
            <Text style={styles.panelCompanyName}>
              {title ||
                `Unnamed ${
                  isGroupList ? 'Group' : isSubgroupList ? 'Subgroup' : 'Test'
                } ${index + 1}`}
            </Text>
            <Text style={styles.panelCompanyMeta}>
              {isGroupList
                ? `GCode: ${getCatalogGroupId(item) || 'N/A'}`
                : isSubgroupList
                ? `SCode: ${getCatalogSubgroupId(item) || 'N/A'}`
                : `Code: ${item?.booked_code || 'N/A'} | Price: ${
                    testPricing?.charge ?? item?.mrp ?? 0
                  }`}
            </Text>
            {isTestsList ? (
              <Text style={styles.panelCompanyMeta}>
                Panel Company:{' '}
                {item?.panel_company_name || selectedPanelCompanyName || 'N/A'}
              </Text>
            ) : null}
          </View>
          {isGroupList || isSubgroupList ? (
            <Ionicons
              name="chevron-forward"
              size={16}
              style={styles.panelCompanySearchIcon}
            />
          ) : null}
        </TouchableOpacity>
      );
    },
    [
      selectedCatalogGroup,
      selectedCatalogSubgroup,
      selectedPanelCompanyName,
      selectedPanelCompany,
      setCatalogVisibleCount,
      setExpandedCatalogTests,
      setSelectedCatalogGroup,
      setSelectedCatalogSubgroup,
      setTestSearch,
      styles,
    ],
  );
  const renderCatalogEmpty = useCallback(
    () => (
      <View style={styles.panelCompanyEmptyState}>
        <Text style={styles.panelCompanyEmptyStateText}>
          {selectedCatalogSubgroup
            ? 'No tests available for this subgroup.'
            : selectedCatalogGroup
            ? 'No subgroups available for this group.'
            : 'No groups available for this panel company.'}
        </Text>
      </View>
    ),
    [selectedCatalogGroup, selectedCatalogSubgroup, styles],
  );
  const renderCatalogFooter = useCallback(
    () =>
      hasMoreCatalogItems ? (
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.addPatientButton}
          onPress={loadMoreCatalogItems}>
          <Text style={styles.addPatientButtonText}>
            Load More ({visibleCatalogItems.length}/{activeCatalogItems.length})
          </Text>
        </TouchableOpacity>
      ) : null,
    [
      activeCatalogItems.length,
      hasMoreCatalogItems,
      loadMoreCatalogItems,
      styles,
      visibleCatalogItems.length,
    ],
  );
  const getCatalogItemKey = useCallback((item, index) => {
    const title = getCatalogDisplayTitle({
      item,
      isGroupList: !selectedCatalogGroup && !selectedCatalogSubgroup,
      isSubgroupList:
        Boolean(selectedCatalogGroup) && !selectedCatalogSubgroup,
    });

    return `${item?.id || item?.booked_code || title || 'catalog'}-${index}`;
  }, [selectedCatalogGroup, selectedCatalogSubgroup]);

  return (
    <>
      <View style={styles.sectionCard}>
        <View
          style={[
            styles.patientsSectionHeaderRow,
            isNarrowScreen && styles.patientsSectionHeaderRowStacked,
          ]}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="flask" size={16} style={styles.sectionIcon} />
            </View>
            <Text
              style={[styles.sectionTitle, styles.panelFlowHeadingText]}
              numberOfLines={2}>
              Select Panel Company
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.addPatientButton,
              isSmallPhone && styles.addPatientButtonCompact,
            ]}
            onPress={handleAddTestFlowBack}>
            <Ionicons
              name="arrow-back"
              size={16}
              style={styles.addPatientButtonIcon}
            />
            <Text style={styles.addPatientButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionText}>
          Patient: {selectedPanelPatient?.name || 'N/A'}
        </Text>
        {isPanelCatalogVisible ? (
          <Text style={styles.sectionText}>
            Company: {selectedPanelCompanyName || 'Selected'}
          </Text>
        ) : null}
      </View>

      <View style={[styles.bookingDetailCard, styles.panelCatalogBodyFull]}>
        {isPanelCompanyModalVisible ? (
          <>
            <View style={styles.panelCompanySearchWrap}>
              <Ionicons
                name="search-outline"
                size={18}
                style={styles.panelCompanySearchIcon}
              />
              <TextInput
                value={panelCompanySearch}
                onChangeText={setPanelCompanySearch}
                placeholder="Search panel company"
                placeholderTextColor={BRAND.textMuted}
                style={styles.panelCompanySearchInput}
              />
            </View>
            <Text style={styles.sectionText}>
              Showing first {PANEL_COMPANY_DEFAULT_VISIBLE} companies only. Search
              to find the rest.
            </Text>
            {hasPanelCompanySearch ? (
              <Text style={styles.sectionText}>
                Showing {visiblePanelCompanyItems.length} of{' '}
                {filteredPanelCompanyItems.length} matching panel companies.
                Type more to narrow results.
              </Text>
            ) : null}

            <View style={styles.panelCompanyList}>
              <FlatList
                data={visiblePanelCompanyItems}
                keyExtractor={getPanelCompanyItemKey}
                renderItem={renderPanelCompanyItem}
                ListEmptyComponent={renderPanelCompanyEmpty}
                showsVerticalScrollIndicator
                nestedScrollEnabled
                removeClippedSubviews
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={5}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.panelCompanyListContent}
              />
            </View>
          </>
        ) : (
          <View style={styles.panelCompanyList}>
            <View style={styles.panelCatalogHeaderFixed}>
              {selectedPanelCompany ? (
                <View style={styles.selectedPanelCompanyCard}>
                  <Text style={styles.selectedPanelCompanyTitle}>
                    Selected Panel Company
                  </Text>
                  <View
                    style={[
                      styles.selectedPanelCompanyFieldRow,
                      isNarrowScreen && styles.selectedPanelCompanyFieldRowStacked,
                    ]}>
                    <View style={styles.selectedPanelCompanyField}>
                      <Text style={styles.selectedPanelCompanyFieldLabel}>
                        Panel Company
                      </Text>
                      <Text style={styles.selectedPanelCompanyFieldValue}>
                        {selectedPanelCompany.name || 'N/A'}
                      </Text>
                    </View>
                    <View style={styles.selectedPanelCompanyField}>
                      <Text style={styles.selectedPanelCompanyFieldLabel}>
                        Billing Type
                      </Text>
                      <Text style={styles.selectedPanelCompanyFieldValue}>
                        {getPaymentLabelFromBillingMode(
                          selectedPanelCompany.billingChargeMode,
                        )}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
              <Text style={styles.sectionText}>
                {selectedCatalogSubgroup
                  ? `Tests inside: ${getCatalogDisplayTitle({
                      item: selectedCatalogSubgroup,
                      isSubgroupList: true,
                    })}`
                  : selectedCatalogGroup
                  ? `Subgroups inside: ${getCatalogDisplayTitle({
                      item: selectedCatalogGroup,
                      isGroupList: true,
                    })}`
                  : 'Select a group to view its subgroups.'}
              </Text>
              {selectedCatalogSubgroup ? (
                <>
                  <View style={styles.panelCompanySearchWrap}>
                    <Ionicons
                      name="search-outline"
                      size={18}
                      style={styles.panelCompanySearchIcon}
                    />
                    <TextInput
                      value={testSearch}
                      onChangeText={setTestSearch}
                      placeholder="Search tests"
                      placeholderTextColor={BRAND.textMuted}
                      style={styles.panelCompanySearchInput}
                    />
                  </View>
                  <Text style={styles.sectionText}>
                    {hasTestSearch
                      ? `Showing ${activeCatalogItems.length} matching tests across the selected subgroup.`
                      : `Showing first ${CATALOG_TEST_VISIBLE_LIMIT} tests. Scroll for more.`}
                  </Text>
                </>
              ) : null}
            </View>
            <FlatList
              data={visibleCatalogItems}
              keyExtractor={getCatalogItemKey}
              renderItem={renderCatalogItem}
              ListEmptyComponent={renderCatalogEmpty}
              ListFooterComponent={renderCatalogFooter}
              style={styles.panelCompanyListScroll}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              persistentScrollbar
              onEndReached={hasMoreCatalogItems ? loadMoreCatalogItems : null}
              onEndReachedThreshold={0.35}
              removeClippedSubviews
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.panelCompanyListContent}
            />
          </View>
        )}
      </View>
      <AppAlertModal alert={appAlert} styles={styles} onClose={closeAppAlert} />
    </>
  );
}

export default React.memo(PanelCompanyFlowScreen);
